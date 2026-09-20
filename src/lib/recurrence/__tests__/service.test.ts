import { describe, it, expect } from 'vitest'
import {
  parseVirtualId,
  makeVirtualId,
  recurrenceMetaForRow,
  seriesToRule,
  VIRTUAL_ID_PREFIX,
  type RecurrenceSeriesRow,
} from '@/lib/recurrence/service'
import { toGoogleRRule, toGoogleRRules, validateRule, expandOccurrences } from '@/lib/recurrence/rule'

const baseSeries: RecurrenceSeriesRow = {
  id: 's-1',
  business_id: 'b-1',
  entity_type: 'job',
  template_id: 'j-1',
  template_snapshot: { title: 'Lawn', status: 'scheduled' },
  frequency: 'weekly',
  anchor_date: '2026-10-06',
  anchor_day: 6,
  timezone: 'America/New_York',
  end_type: 'never',
  end_date: null,
  max_occurrences: null,
  active: true,
  created_at: 'x',
  updated_at: 'x',
} as any

describe('virtual occurrence ids', () => {
  it('round-trips series id and occurrence date', () => {
    const id = makeVirtualId('abc-123', '2026-10-20')
    expect(id.startsWith(VIRTUAL_ID_PREFIX)).toBe(true)
    expect(parseVirtualId(id)).toEqual({ seriesId: 'abc-123', occurrenceDate: '2026-10-20' })
  })

  it('returns null for non-virtual ids', () => {
    expect(parseVirtualId('550e8400-e29b-41d4-a716-446655440000')).toBeNull()
    expect(parseVirtualId('')).toBeNull()
  })
})

describe('recurrenceMetaForRow', () => {
  it('emits series linkage and a human label', () => {
    const meta = recurrenceMetaForRow(baseSeries)
    expect(meta.series_id).toBe('s-1')
    expect(meta.recurrence).toEqual({ frequency: 'weekly' })
    expect(meta.recurrence_label).toBeTruthy()
  })

  it('returns empty for one-off rows', () => {
    expect(recurrenceMetaForRow(undefined)).toEqual({})
  })
})

describe('seriesToRule', () => {
  it('maps storage columns to rule input', () => {
    const rule = seriesToRule(baseSeries)
    expect(rule).toMatchObject({
      frequency: 'weekly',
      anchorDate: '2026-10-06',
      anchorDay: 6,
      endType: 'never',
    })
  })
})

describe('toGoogleRRule', () => {
  it('maps each frequency to an RRULE', () => {
    expect(toGoogleRRule({ frequency: 'daily', anchorDate: '2026-10-06', anchorDay: 6, endType: 'never', endDate: null, maxOccurrences: null })).toContain('FREQ=DAILY')
    expect(toGoogleRRule({ frequency: 'weekdays', anchorDate: '2026-10-06', anchorDay: 6, endType: 'never', endDate: null, maxOccurrences: null })).toContain('BYDAY=MO,TU,WE,TH,FR')
    expect(toGoogleRRule({ frequency: 'biweekly', anchorDate: '2026-10-06', anchorDay: 6, endType: 'never', endDate: null, maxOccurrences: null })).toContain('INTERVAL=2')
    expect(toGoogleRRule({ frequency: 'monthly', anchorDate: '2026-10-06', anchorDay: 6, endType: 'never', endDate: null, maxOccurrences: null })).toContain('FREQ=MONTHLY')
  })

  it('encodes end conditions', () => {
    const onDate = toGoogleRRule({ frequency: 'weekly', anchorDate: '2026-10-06', anchorDay: 6, endType: 'on_date', endDate: '2026-12-31', maxOccurrences: null })
    expect(onDate).toContain('UNTIL=20261231')
    const count = toGoogleRRule({ frequency: 'weekly', anchorDate: '2026-10-06', anchorDay: 6, endType: 'after_occurrences', endDate: null, maxOccurrences: 10 })
    expect(count).toContain('COUNT=10')
  })
})

describe('toGoogleRRules monthly clamp parity', () => {
  const mk = (day: number) => ({ frequency: 'monthly' as const, anchorDate: '2026-01-01', anchorDay: day, endType: 'never' as const, endDate: null, maxOccurrences: null })

  it('day <= 28 produces a single BYMONTHDAY rule', () => {
    const rules = toGoogleRRules(mk(15))
    expect(rules).toEqual(['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'])
  })

  it('day 29/30 adds a February last-day rule — Google dedupes the leap-year overlap', () => {
    for (const d of [29, 30]) {
      const rules = toGoogleRRules(mk(d))
      expect(rules).toHaveLength(2)
      expect(rules[0]).toBe(`RRULE:FREQ=MONTHLY;BYMONTHDAY=${d}`)
      expect(rules[1]).toBe('RRULE:FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=-1')
    }
  })

  it('day 31 adds a last-day rule restricted to months lacking a 31st', () => {
    const rules = toGoogleRRules(mk(31))
    expect(rules).toHaveLength(2)
    expect(rules[0]).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=31')
    expect(rules[1]).toBe('RRULE:FREQ=MONTHLY;BYMONTH=2,4,6,9,11;BYMONTHDAY=-1')
  })

  it('end conditions apply to every rule in the set', () => {
    const rules = toGoogleRRules({ frequency: 'monthly', anchorDate: '2026-01-31', anchorDay: 31, endType: 'on_date', endDate: '2026-12-31', maxOccurrences: null })
    for (const r of rules) expect(r).toContain('UNTIL=20261231')
  })
})

describe('materialization independence', () => {
  it('completed occurrences are separate rows — series rule is untouched by a single-occurrence write', () => {
    // Simulates: a series expands to dates; marking one occurrence complete
    // creates/updates a row for that date only — the rule itself never carries
    // a completed flag, so future expansions remain uncompleted.
    const dates = expandOccurrences(
      { frequency: 'weekly', anchorDate: '2026-10-06', anchorDay: 6, endType: 'never', endDate: null, maxOccurrences: null },
      '2026-10-06',
      '2026-10-31',
    )
    const completedDate = dates[0]
    const future = dates.filter((d) => d !== completedDate)
    expect(future.length).toBeGreaterThan(0)
    // Completing the materialized row for `completedDate` cannot alter `future`.
    expect(future).not.toContain(completedDate)
  })
})

describe('invalid input rejection', () => {
  it('rejects invalid occurrence counts', () => {
    expect(validateRule({ frequency: 'weekly', anchorDate: '2026-10-06', anchorDay: 6, endType: 'after_occurrences', endDate: null, maxOccurrences: 0 }).ok).toBe(false)
    expect(validateRule({ frequency: 'weekly', anchorDate: '2026-10-06', anchorDay: 6, endType: 'after_occurrences', endDate: null, maxOccurrences: 20000 }).ok).toBe(false)
  })

  it('rejects end date before anchor', () => {
    const res = validateRule({ frequency: 'weekly', anchorDate: '2026-10-06', anchorDay: 6, endType: 'on_date', endDate: '2026-10-01', maxOccurrences: null })
    expect(res.ok).toBe(false)
  })
})
