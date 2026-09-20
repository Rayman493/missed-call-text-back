import { describe, it, expect } from 'vitest'
import {
  expandOccurrences,
  nextOccurrenceOnOrAfter,
  validateRule,
  toGoogleRRule,
  toGoogleRRules,
  addDays,
  diffDays,
  weekdayOf,
  daysInMonth,
  type RecurrenceRuleInput,
} from '../rule'

const rule = (over: Partial<RecurrenceRuleInput>): RecurrenceRuleInput => ({
  frequency: 'weekly',
  anchorDate: '2026-06-30', // a Tuesday
  anchorDay: 30,
  endType: 'never',
  ...over,
})

describe('date primitives', () => {
  it('addDays/diffDays/weekdayOf are consistent across DST-irrelevant UTC grid', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(diffDays('2026-06-30', '2026-07-07')).toBe(7)
    expect(weekdayOf('2026-06-30')).toBe(2) // Tuesday
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
  })
})

describe('daily recurrence', () => {
  it('expands every day', () => {
    const dates = expandOccurrences(
      rule({ frequency: 'daily', anchorDate: '2026-07-01', anchorDay: 1 }),
      '2026-07-01', '2026-07-05',
    )
    expect(dates).toEqual(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'])
  })
})

describe('weekdays recurrence', () => {
  it('Friday rolls to Monday (skips weekend)', () => {
    // 2026-07-03 is a Friday
    const dates = expandOccurrences(
      rule({ frequency: 'weekdays', anchorDate: '2026-07-03', anchorDay: 3 }),
      '2026-07-03', '2026-07-08',
    )
    expect(dates).toEqual(['2026-07-03', '2026-07-06', '2026-07-07', '2026-07-08'])
  })
})

describe('weekly recurrence', () => {
  it('repeats on the anchor weekday', () => {
    const dates = expandOccurrences(rule({}), '2026-06-30', '2026-07-21')
    expect(dates).toEqual(['2026-06-30', '2026-07-07', '2026-07-14', '2026-07-21'])
  })
})

describe('biweekly recurrence', () => {
  it('repeats every 14 days on the anchor weekday', () => {
    const dates = expandOccurrences(
      rule({ frequency: 'biweekly' }),
      '2026-06-30', '2026-07-28',
    )
    expect(dates).toEqual(['2026-06-30', '2026-07-14', '2026-07-28'])
  })
})

describe('monthly recurrence', () => {
  it('repeats on the same calendar day', () => {
    const dates = expandOccurrences(
      rule({ frequency: 'monthly', anchorDate: '2026-01-15', anchorDay: 15 }),
      '2026-01-15', '2026-04-30',
    )
    expect(dates).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'])
  })

  it('Jan 31 clamps to last day of each month without drift', () => {
    const dates = expandOccurrences(
      rule({ frequency: 'monthly', anchorDate: '2026-01-31', anchorDay: 31 }),
      '2026-01-31', '2026-06-30',
    )
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30'])
  })

  it('Jan 31 on leap year clamps Feb to the 29th', () => {
    const dates = expandOccurrences(
      rule({ frequency: 'monthly', anchorDate: '2028-01-31', anchorDay: 31 }),
      '2028-01-31', '2028-04-30',
    )
    expect(dates).toEqual(['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30'])
  })
})

describe('this-and-future split on clamped months', () => {
  // A continuation series anchored on a clamped date must keep the ORIGINAL
  // intended day-of-month (anchorDay), not re-anchor to the clamped day.
  it('split from Feb 28 of a day-31 series preserves anchor_day 31', () => {
    const continuation = rule({ frequency: 'monthly', anchorDate: '2026-02-28', anchorDay: 31 })
    expect(validateRule(continuation).ok).toBe(true)
    const dates = expandOccurrences(continuation, '2026-02-28', '2026-06-30')
    expect(dates).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30'])
  })

  it('split from Feb 28 of a day-30 series preserves anchor_day 30', () => {
    const continuation = rule({ frequency: 'monthly', anchorDate: '2026-02-28', anchorDay: 30 })
    const dates = expandOccurrences(continuation, '2026-02-28', '2026-05-31')
    expect(dates).toEqual(['2026-02-28', '2026-03-30', '2026-04-30', '2026-05-30'])
  })

  it('leap-year split from Feb 29 of a day-31 series preserves anchor_day 31', () => {
    const continuation = rule({ frequency: 'monthly', anchorDate: '2028-02-29', anchorDay: 31 })
    const dates = expandOccurrences(continuation, '2028-02-29', '2028-06-30')
    expect(dates).toEqual(['2028-02-29', '2028-03-31', '2028-04-30', '2028-05-31', '2028-06-30'])
  })

  it('deliberately changing the recurrence date CAN re-anchor', () => {
    // A caller that intentionally re-anchors simply passes the new day.
    const reanchored = rule({ frequency: 'monthly', anchorDate: '2026-02-28', anchorDay: 28 })
    const dates = expandOccurrences(reanchored, '2026-02-28', '2026-05-31')
    expect(dates).toEqual(['2026-02-28', '2026-03-28', '2026-04-28', '2026-05-28'])
  })

  it('anchorDay mismatch is rejected for non-monthly frequencies', () => {
    expect(validateRule(rule({ frequency: 'weekly', anchorDate: '2026-02-28', anchorDay: 31 })).ok).toBe(false)
    expect(validateRule(rule({ frequency: 'daily', anchorDate: '2026-02-28', anchorDay: 31 })).ok).toBe(false)
    // yearly may also legitimately differ (clamped Feb 28 continuation of Feb 29)
    expect(validateRule(rule({ frequency: 'yearly', anchorDate: '2029-02-28', anchorDay: 29 })).ok).toBe(true)
  })
})

describe('yearly recurrence', () => {
  it('Feb 29 clamps to Feb 28 on non-leap years, anchor preserved', () => {
    const dates = expandOccurrences(
      rule({ frequency: 'yearly', anchorDate: '2028-02-29', anchorDay: 29 }),
      '2028-02-29', '2032-12-31',
    )
    expect(dates).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })
})

describe('end conditions', () => {
  it('never ends produces unbounded expansion within range', () => {
    const dates = expandOccurrences(rule({}), '2026-06-30', '2027-06-30')
    expect(dates.length).toBe(53) // 53 Tuesdays in that window
  })

  it('on_date stops at the end date inclusive', () => {
    const dates = expandOccurrences(
      rule({ endType: 'on_date', endDate: '2026-07-14' }),
      '2026-06-30', '2026-12-31',
    )
    expect(dates).toEqual(['2026-06-30', '2026-07-07', '2026-07-14'])
  })

  it('after_occurrences yields exactly N occurrences', () => {
    const dates = expandOccurrences(
      rule({ endType: 'after_occurrences', maxOccurrences: 3 }),
      '2026-06-30', '2026-12-31',
    )
    expect(dates).toEqual(['2026-06-30', '2026-07-07', '2026-07-14'])
  })

  it('occurrences before `from` still count toward after_occurrences', () => {
    const dates = expandOccurrences(
      rule({ endType: 'after_occurrences', maxOccurrences: 2 }),
      '2026-07-14', '2026-12-31',
    )
    expect(dates).toEqual([])
  })
})

describe('nextOccurrenceOnOrAfter', () => {
  it('returns anchor when asked before anchor', () => {
    expect(nextOccurrenceOnOrAfter(rule({}), '2026-06-01')).toBe('2026-06-30')
  })
  it('returns next date after a passed occurrence', () => {
    expect(nextOccurrenceOnOrAfter(rule({}), '2026-07-08')).toBe('2026-07-14')
  })
  it('returns null past an ended series', () => {
    expect(nextOccurrenceOnOrAfter(
      rule({ endType: 'after_occurrences', maxOccurrences: 1 }), '2026-07-01',
    )).toBeNull()
  })
})

describe('validateRule', () => {
  it('accepts a valid rule', () => {
    expect(validateRule(rule({})).ok).toBe(true)
  })
  it('rejects end date before anchor', () => {
    expect(validateRule(rule({ endType: 'on_date', endDate: '2026-01-01' })).ok).toBe(false)
  })
  it('rejects missing end date', () => {
    expect(validateRule(rule({ endType: 'on_date', endDate: null })).ok).toBe(false)
  })
  it('rejects invalid occurrence counts', () => {
    expect(validateRule(rule({ endType: 'after_occurrences', maxOccurrences: 0 })).ok).toBe(false)
    expect(validateRule(rule({ endType: 'after_occurrences', maxOccurrences: 1.5 })).ok).toBe(false)
  })
  it('rejects anchorDay mismatch', () => {
    expect(validateRule(rule({ anchorDay: 15 })).ok).toBe(false)
  })
})

describe('toGoogleRRule', () => {
  it('builds basic rules', () => {
    expect(toGoogleRRule(rule({}))).toBe('RRULE:FREQ=WEEKLY')
    expect(toGoogleRRule(rule({ frequency: 'daily' }))).toBe('RRULE:FREQ=DAILY')
    expect(toGoogleRRule(rule({ frequency: 'weekdays' }))).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(toGoogleRRule(rule({ frequency: 'biweekly' }))).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2')
  })
  it('monthly anchor 31 keeps BYMONTHDAY=31 plus a clamp rule for short months', () => {
    expect(toGoogleRRule(rule({ frequency: 'monthly', anchorDay: 31, anchorDate: '2026-01-31' })))
      .toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=31')
    expect(toGoogleRRules(rule({ frequency: 'monthly', anchorDay: 31, anchorDate: '2026-01-31' }))[1])
      .toBe('RRULE:FREQ=MONTHLY;BYMONTH=2,4,6,9,11;BYMONTHDAY=-1')
  })
  it('encodes UNTIL and COUNT', () => {
    expect(toGoogleRRule(rule({ endType: 'on_date', endDate: '2026-12-31' })))
      .toBe('RRULE:FREQ=WEEKLY;UNTIL=20261231T235959Z')
    expect(toGoogleRRule(rule({ endType: 'after_occurrences', maxOccurrences: 5 })))
      .toBe('RRULE:FREQ=WEEKLY;COUNT=5')
  })
})
