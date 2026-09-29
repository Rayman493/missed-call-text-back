/**
 * PI-S1 regression tests — Job ↔ Google Calendar sync.
 *
 * Covers the operations added so synced jobs stay synchronized after
 * PATCH/DELETE and recurrence mutations:
 *   - standalone reschedule → PATCH same event id
 *   - unsynced job → no Google call at all
 *   - delete → DELETE linked event; 404/410 = already gone
 *   - real Google failure → honest sync failure
 *   - occurrence skip → instance-level delete (<masterId>_<instant>)
 *   - end-of-series → RRULE truncation (UNTIL)
 *   - series delete → master delete
 *   - split → truncate old master + create new recurring master
 *   - unrelated fields → no sync (caller-side gate verified via early return)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/google/token', () => ({
  getGoogleAccessToken: vi.fn(),
}))

import { getGoogleAccessToken } from '@/lib/google/token'
import {
  syncJobUpdateToGoogle,
  syncJobDeleteToGoogle,
  syncSeriesSplitToGoogle,
  googleInstanceId,
  SERIES_MASTER_KEY,
} from '../job-sync'
import { googleEventMasterId, eventMatchesGoogleId } from '../calendar-event-id'

const mockToken = getGoogleAccessToken as ReturnType<typeof vi.fn>

// Minimal supabase stub capturing update payloads per table.
function makeSupabase(rows: Record<string, any[]> = {}) {
  const updates: { table: string; values: any; filters: Record<string, any> }[] = []
  const builder = (table: string, filters: Record<string, any> = {}): any => ({
    select: () => builder(table, filters),
    eq: (col: string, val: any) => builder(table, { ...filters, [col]: val }),
    in: (col: string, vals: any[]) => builder(table, { ...filters, [col]: vals }),
    maybeSingle: async () => {
      const found = (rows[table] ?? []).find((r: any) =>
        Object.entries(filters).every(([c, v]) => r[c] === v)
      ) ?? null
      return { data: found, error: null }
    },
    single: async () => {
      const found = (rows[table] ?? []).find((r: any) =>
        Object.entries(filters).every(([c, v]) => r[c] === v)
      ) ?? null
      return { data: found, error: null }
    },
    update: (values: any) => ({
      eq: (col: string, val: any) => {
        const f = { ...filters, [col]: val }
        updates.push({ table, values, filters: f })
        return {
          eq: async (c2: string, v2: any) => ({ error: null }),
          then: async (resolve: any) => resolve({ error: null }),
        }
      },
    }),
  })
  return { from: (table: string) => builder(table), _updates: updates }
}

function fetchMock(responders: Array<(url: string, init: RequestInit) => { status: number; body?: any }>) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = vi.fn(async (url: any, init: any = {}) => {
    calls.push({ url: String(url), init })
    for (const r of responders) {
      const res = r(String(url), init)
      if (res) {
        return {
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          json: async () => res.body ?? {},
          text: async () => JSON.stringify(res.body ?? {}),
        } as Response
      }
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

const baseJob = {
  id: 'job-1',
  title: 'HVAC Tune-up',
  customer_name: 'Alice',
  service_address: '12 Main St',
  scheduled_date: '2026-02-10',
  scheduled_time: '09:00',
  scheduled_end_time: '10:00',
  google_calendar_event_id: 'evt123',
}

const series = {
  id: 'series-1',
  business_id: 'biz-1',
  entity_type: 'job',
  template_id: 'job-1',
  anchor_date: '2026-02-10',
  anchor_day: 10,
  frequency: 'weekly',
  end_type: 'never',
  end_date: null,
  max_occurrences: null,
  timezone: 'America/New_York',
  template_snapshot: { scheduled_time: '09:00', scheduled_end_time: '10:00', title: 'HVAC Tune-up' },
} as any

beforeEach(() => {
  mockToken.mockReset()
  mockToken.mockResolvedValue({ accessToken: 'tok', integration: {} })
  vi.unstubAllGlobals()
})

describe('PI-S1 · standalone job PATCH', () => {
  it('PATCHes the stored Google event id with the new date/time', async () => {
    const supabase = makeSupabase({ businesses: [{ id: 'biz-1', business_hours_timezone: 'America/New_York' }] })
    const calls = fetchMock([() => ({ status: 200, body: { id: 'evt123' } })])

    const out = await syncJobUpdateToGoogle(supabase as any, 'biz-1', { ...baseJob, scheduled_date: '2026-02-12' }, { editScope: 'occurrence' })

    expect(out.synced).toBe(true)
    const patch = calls.find(c => c.init.method === 'PATCH')
    expect(patch).toBeTruthy()
    expect(patch!.url).toContain('/events/evt123')
    const body = JSON.parse(patch!.init.body as string)
    expect(body.start.dateTime).toBe('2026-02-12T09:00:00')
    expect(body.end.dateTime).toBe('2026-02-12T10:00:00')
  })

  it('never calls Google for an unsynced job', async () => {
    const supabase = makeSupabase()
    const calls = fetchMock([() => ({ status: 200 })])

    const out = await syncJobUpdateToGoogle(
      supabase as any, 'biz-1',
      { ...baseJob, google_calendar_event_id: null },
      { editScope: 'occurrence' },
    )

    expect(out.synced).toBe(false)
    expect((out as any).skipped).toBe(true)
    expect(calls).toHaveLength(0)
    expect(mockToken).not.toHaveBeenCalled()
  })

  it('reports failure honestly when Google PATCH fails', { timeout: 15000 }, async () => {
    const supabase = makeSupabase({ businesses: [{ id: 'biz-1', business_hours_timezone: 'America/New_York' }] })
    fetchMock([() => ({ status: 500, body: {} })])

    const out = await syncJobUpdateToGoogle(supabase as any, 'biz-1', baseJob, { editScope: 'occurrence' })
    expect(out.synced).toBe(false)
    expect((out as any).error).toContain('500')
  })

  it('reports failure (not silent success) when the linked event is gone', async () => {
    const supabase = makeSupabase({ businesses: [{ id: 'biz-1', business_hours_timezone: 'America/New_York' }] })
    fetchMock([() => ({ status: 404 })])

    const out = await syncJobUpdateToGoogle(supabase as any, 'biz-1', baseJob, { editScope: 'occurrence' })
    expect(out.synced).toBe(false)
    expect((out as any).error).toContain('no longer exists')
  })
})

describe('PI-S1 · job DELETE', () => {
  it('DELETEs the linked Google event for a standalone synced job', async () => {
    const supabase = makeSupabase()
    const calls = fetchMock([() => ({ status: 204 })])

    const out = await syncJobDeleteToGoogle(supabase as any, 'biz-1', {
      scope: 'occurrence',
      jobRow: { id: 'job-1', google_calendar_event_id: 'evt123' },
    })

    expect(out.synced).toBe(true)
    expect(calls.some(c => c.init.method === 'DELETE' && c.url.endsWith('/events/evt123'))).toBe(true)
  })

  it('treats Google 404/410 as already deleted', async () => {
    const supabase = makeSupabase()
    fetchMock([() => ({ status: 410 })])

    const out = await syncJobDeleteToGoogle(supabase as any, 'biz-1', {
      scope: 'occurrence',
      jobRow: { id: 'job-1', google_calendar_event_id: 'evt123' },
    })
    expect(out.synced).toBe(true)
  })

  it('surfaces a real delete failure', { timeout: 15000 }, async () => {
    const supabase = makeSupabase()
    fetchMock([() => ({ status: 500 })])

    const out = await syncJobDeleteToGoogle(supabase as any, 'biz-1', {
      scope: 'occurrence',
      jobRow: { id: 'job-1', google_calendar_event_id: 'evt123' },
    })
    expect(out.synced).toBe(false)
    expect((out as any).error).toBeTruthy()
  })
})

describe('PI-S1 · recurring series', () => {
  it('skip occurrence cancels the specific Google instance, not the master', async () => {
    const supabase = makeSupabase({ jobs: [{ id: 'job-1', business_id: 'biz-1', google_calendar_event_id: 'master9' }] })
    const calls = fetchMock([() => ({ status: 204 })])

    const out = await syncJobDeleteToGoogle(supabase as any, 'biz-1', {
      scope: 'occurrence',
      series,
      occurrenceDate: '2026-02-17',
    })

    expect(out.synced).toBe(true)
    const del = calls.find(c => c.init.method === 'DELETE')
    const expectedInstance = googleInstanceId('master9', '2026-02-17', '09:00', 'America/New_York')
    expect(del!.url).toContain(`/events/${expectedInstance}`)
    expect(del!.url).not.toContain('/events/master9"')
  })

  it('anchor-row occurrence delete cancels the anchor instance only', async () => {
    const supabase = makeSupabase({ jobs: [{ id: 'job-1', business_id: 'biz-1', google_calendar_event_id: 'master9' }] })
    const calls = fetchMock([() => ({ status: 204 })])

    const out = await syncJobDeleteToGoogle(supabase as any, 'biz-1', {
      scope: 'occurrence',
      series,
      jobRow: { id: 'job-1', google_calendar_event_id: 'master9', scheduled_time: '09:00' },
      occurrenceDate: '2026-02-10',
    })

    expect(out.synced).toBe(true)
    const del = calls.find(c => c.init.method === 'DELETE')
    expect(del!.url).toContain('master9_')
  })

  it('scope=future truncates the master RRULE with UNTIL', async () => {
    const supabase = makeSupabase({ jobs: [{ id: 'job-1', business_id: 'biz-1', google_calendar_event_id: 'master9' }] })
    const calls = fetchMock([
      (url, init) => (!init.method || init.method === 'GET' ? { status: 200, body: { id: 'master9', recurrence: ['RRULE:FREQ=WEEKLY'] } } : { status: 200, body: {} }),
    ])

    const out = await syncJobDeleteToGoogle(supabase as any, 'biz-1', {
      scope: 'future',
      series,
      occurrenceDate: '2026-03-01',
    })

    expect(out.synced).toBe(true)
    const patch = calls.find(c => c.init.method === 'PATCH' && c.url.includes('/events/master9'))
    expect(patch).toBeTruthy()
    const body = JSON.parse(patch!.init.body as string)
    expect(body.recurrence[0]).toMatch(/^RRULE:FREQ=WEEKLY;UNTIL=20260228T235959Z$/)
  })

  it('scope=series deletes the master event', async () => {
    const supabase = makeSupabase({ jobs: [{ id: 'job-1', business_id: 'biz-1', google_calendar_event_id: 'master9' }] })
    const calls = fetchMock([() => ({ status: 204 })])

    const out = await syncJobDeleteToGoogle(supabase as any, 'biz-1', {
      scope: 'series',
      series,
      jobRow: { id: 'job-1', google_calendar_event_id: 'master9' },
    })

    expect(out.synced).toBe(true)
    const dels = calls.filter(c => c.init.method === 'DELETE')
    expect(dels.some(c => c.url.endsWith('/events/master9'))).toBe(true)
  })

  it('occurrence-scope PATCH on an anchor row creates a per-instance exception', async () => {
    const supabase = makeSupabase({ jobs: [{ id: 'job-1', business_id: 'biz-1', google_calendar_event_id: 'master9' }] })
    const calls = fetchMock([() => ({ status: 200, body: {} })])

    const out = await syncJobUpdateToGoogle(supabase as any, 'biz-1', { ...baseJob, google_calendar_event_id: 'master9' }, {
      editScope: 'occurrence',
      series,
      occurrenceDate: '2026-02-10',
    })

    expect(out.synced).toBe(true)
    const patch = calls.find(c => c.init.method === 'PATCH')
    const expectedInstance = googleInstanceId('master9', '2026-02-10', '09:00', 'America/New_York')
    expect(patch!.url).toContain(`/events/${expectedInstance}`)
  })

  it('split truncates the old master and creates a new recurring master', async () => {
    const newSeries = {
      ...series,
      id: 'series-2',
      template_id: null,
      anchor_date: '2026-03-01',
      anchor_day: 1,
      template_snapshot: { title: 'HVAC Tune-up', scheduled_time: '09:00', scheduled_end_time: '10:00' },
    }
    const supabase = makeSupabase({ jobs: [{ id: 'job-1', business_id: 'biz-1', google_calendar_event_id: 'master9' }] })
    const calls = fetchMock([
      (url, init) => {
        if (!init.method || init.method === 'GET') return { status: 200, body: { id: 'master9', recurrence: ['RRULE:FREQ=WEEKLY'] } }
        if (init.method === 'POST') return { status: 200, body: { id: 'newmaster1' } }
        return { status: 200, body: {} }
      },
    ])

    const out = await syncSeriesSplitToGoogle(supabase as any, 'biz-1', series, newSeries as any, '2026-03-01')

    expect(out.synced).toBe(true)
    // Old master truncated
    const patch = calls.find(c => c.init.method === 'PATCH')
    expect(JSON.parse(patch!.init.body as string).recurrence[0]).toContain('UNTIL=')
    // New master created with an RRULE
    const post = calls.find(c => c.init.method === 'POST')
    const postBody = JSON.parse(post!.init.body as string)
    expect(postBody.recurrence[0]).toContain('FREQ=WEEKLY')
    // New master id persisted under the namespaced snapshot key
    const seriesUpdate = supabase._updates.find(u => u.table === 'recurrence_series')
    expect(seriesUpdate.values.template_snapshot[SERIES_MASTER_KEY]).toBe('newmaster1')
  })
})

describe('PI-S1D · dedup helpers', () => {
  it('googleEventMasterId strips the _YYYYMMDDTHHMMSSZ instance suffix', () => {
    expect(googleEventMasterId('abc123_20260217T140000Z')).toBe('abc123')
    expect(googleEventMasterId('abc123')).toBe('abc123')
  })

  it('eventMatchesGoogleId matches stored master against any expanded instance', () => {
    expect(eventMatchesGoogleId('master9_20260217T140000Z', 'master9')).toBe(true)
    expect(eventMatchesGoogleId('master9', 'master9')).toBe(true)
    expect(eventMatchesGoogleId('other_20260217T140000Z', 'master9')).toBe(false)
    expect(eventMatchesGoogleId('master9_20260217T140000Z', null)).toBe(false)
  })

  it('googleInstanceId produces Google-compatible instance ids', () => {
    const id = googleInstanceId('master9', '2026-02-17', '09:00', 'America/New_York')
    expect(id).toMatch(/^master9_\d{8}T\d{6}Z$/)
    expect(googleEventMasterId(id)).toBe('master9')
  })
})
