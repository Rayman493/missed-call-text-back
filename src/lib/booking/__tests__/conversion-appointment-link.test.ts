/**
 * PI-S2 regression tests — booking_requests.appointment_id reconciliation.
 *
 * Covers createAppointmentForBookingRequest's stale-link handling:
 *   - linked event still live        → alreadyCreated (existing idempotent path)
 *   - linked event 404/410           → stale link cleared, replacement created
 *   - verification impossible        → alreadyCreated (never risk a duplicate)
 *   - cross-business request         → 404, no Google calls, no writes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/google/token', () => ({
  getGoogleAccessToken: vi.fn(),
}))
vi.mock('@/lib/event-timeline', () => ({
  timelineEvents: { appointmentCreated: vi.fn(), appointmentDeleted: vi.fn() },
}))
vi.mock('@/lib/customer-status-transitions', () => ({
  applyCustomerStatusEvent: vi.fn(() => 'customer'),
}))
vi.mock('../settings', () => ({
  bookingAdmin: vi.fn(),
}))
vi.mock('../customer-resolution', () => ({
  ensureLeadForBookingRequest: vi.fn(async () => ({ ok: true, leadId: 'lead-1', conversationId: null, isNew: false })),
}))
vi.mock('../actions', () => ({
  agreedWindow: vi.fn(() => ({ start: '2026-02-20T14:00:00Z', end: '2026-02-20T15:00:00Z' })),
}))

import { getGoogleAccessToken } from '@/lib/google/token'
import { bookingAdmin } from '../settings'
import { createAppointmentForBookingRequest } from '../conversion'

const mockToken = getGoogleAccessToken as ReturnType<typeof vi.fn>
const mockAdmin = bookingAdmin as ReturnType<typeof vi.fn>

function makeRequest(overrides: Partial<any> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    business_id: 'biz-1',
    status: 'accepted',
    customer_name: 'Alice',
    customer_phone: '+15551234567',
    normalized_phone: '+15551234567',
    customer_email: null,
    customer_address: null,
    service: 'Repair visit',
    notes: null,
    timezone: 'America/New_York',
    appointment_id: null,
    job_id: null,
    lead_id: 'lead-1',
    ...overrides,
  }
}

/** Supabase stub: rows are matched by eq/is filters; updates mutate rows. */
function makeAdmin(rows: Record<string, any[]>) {
  const updates: { table: string; values: any; filters: Record<string, any> }[] = []
  const inserts: { table: string; values: any }[] = []
  const match = (r: any, filters: Record<string, any>) =>
    Object.entries(filters).every(([k, v]) =>
      k.startsWith('is:') ? r[k.slice(3)] === v : r[k] === v)

  const chain = (table: string, filters: Record<string, any> = {}, updateVals: any = null): any => {
    const self: any = {
      select: () => self,
      order: () => self,
      eq: (c: string, v: any) => chain(table, { ...filters, [c]: v }, updateVals),
      is: (c: string, v: any) => chain(table, { ...filters, [`is:${c}`]: v }, updateVals),
      insert: async (values: any) => {
        inserts.push({ table, values })
        return { error: null }
      },
      update: (values: any) => chain(table, filters, values),
      maybeSingle: async () => ({
        data: (rows[table] ?? []).find(r => match(r, filters)) ?? null,
        error: null,
      }),
      then: (resolve: any) => {
        const matching = (rows[table] ?? []).filter(r => match(r, filters))
        if (updateVals) {
          updates.push({ table, values: updateVals, filters })
          matching.forEach(r => Object.assign(r, updateVals))
        }
        return Promise.resolve({ data: matching, error: null }).then(resolve)
      },
    }
    return self
  }
  return { from: (t: string) => chain(t), _updates: updates, _inserts: inserts }
}

function fetchMock(handler: (url: string, init: RequestInit) => { status: number; body?: any } | null) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: any, init: any = {}) => {
    calls.push({ url: String(url), init })
    const res = handler(String(url), init)
    if (!res) return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => res.body ?? {},
      text: async () => JSON.stringify(res.body ?? {}),
    } as Response
  }))
  return calls
}

beforeEach(() => {
  mockToken.mockReset().mockResolvedValue({ accessToken: 'tok' })
  vi.unstubAllGlobals()
})

describe('PI-S2 · createAppointmentForBookingRequest link reconciliation', () => {
  it('keeps alreadyCreated when the linked Google event is still live', async () => {
    const request = makeRequest({ appointment_id: 'live-evt' })
    const admin = makeAdmin({ booking_requests: [request], leads: [{ id: 'lead-1', status: 'lead' }] })
    mockAdmin.mockReturnValue(admin)
    const calls = fetchMock(() => ({ status: 200, body: { id: 'live-evt' } }))

    const out = await createAppointmentForBookingRequest('biz-1', request.id)

    expect(out.ok).toBe(true)
    expect((out as any).alreadyCreated).toBe(true)
    expect((out as any).recordId).toBe('live-evt')
    // Verification GET happened, but no create and no link mutation.
    expect(calls.every(c => !c.init.method || c.init.method === 'GET')).toBe(true)
    expect(admin._updates).toHaveLength(0)
  })

  it('clears a stale appointment_id (404) and creates a replacement appointment', async () => {
    const request = makeRequest({ appointment_id: 'gone-evt' })
    const admin = makeAdmin({
      booking_requests: [request],
      leads: [{ id: 'lead-1', status: 'lead' }],
      booking_request_events: [],
    })
    mockAdmin.mockReturnValue(admin)
    const calls = fetchMock((url, init) => {
      if (init.method === 'GET' || !init.method) {
        return url.endsWith('/events/gone-evt') ? { status: 404 } : { status: 200, body: {} }
      }
      if (init.method === 'POST') return { status: 200, body: { id: 'bk-new-event' } }
      return null
    })

    const out = await createAppointmentForBookingRequest('biz-1', request.id)

    expect(out.ok).toBe(true)
    expect((out as any).alreadyCreated).toBe(false)
    expect((out as any).recordId).toBe('bk-new-event')
    // Stale link cleared first (guarded), then re-linked to the new event.
    const clears = admin._updates.filter(u => u.values.appointment_id === null)
    expect(clears).toHaveLength(1)
    expect(clears[0].filters).toMatchObject({ id: request.id, business_id: 'biz-1', appointment_id: 'gone-evt' })
    const links = admin._updates.filter(u => typeof u.values.appointment_id === 'string')
    expect(links).toHaveLength(1)
    expect(links[0].values.appointment_id).toBe('bk-new-event')
    expect(calls.some(c => c.init.method === 'POST')).toBe(true)
  })

  it('keeps alreadyCreated when existence cannot be verified (never risks a duplicate)', async () => {
    const request = makeRequest({ appointment_id: 'maybe-live' })
    const admin = makeAdmin({ booking_requests: [request] })
    mockAdmin.mockReturnValue(admin)
    const calls = fetchMock(() => ({ status: 503 }))

    const out = await createAppointmentForBookingRequest('biz-1', request.id)

    expect(out.ok).toBe(true)
    expect((out as any).alreadyCreated).toBe(true)
    expect(calls.every(c => !c.init.method || c.init.method === 'GET')).toBe(true)
    expect(admin._updates).toHaveLength(0)
  })

  it('keeps alreadyCreated when Google is not connected', async () => {
    mockToken.mockRejectedValue(new Error('google_integration_not_found'))
    const request = makeRequest({ appointment_id: 'any-evt' })
    const admin = makeAdmin({ booking_requests: [request] })
    mockAdmin.mockReturnValue(admin)
    const calls = fetchMock(() => ({ status: 200 }))

    const out = await createAppointmentForBookingRequest('biz-1', request.id)

    expect(out.ok).toBe(true)
    expect((out as any).alreadyCreated).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('returns 404 for a booking request owned by another business — no Google calls, no writes', async () => {
    const request = makeRequest({ business_id: 'biz-other', appointment_id: 'their-evt' })
    const admin = makeAdmin({ booking_requests: [request] })
    mockAdmin.mockReturnValue(admin)
    const calls = fetchMock(() => ({ status: 200 }))

    const out = await createAppointmentForBookingRequest('biz-1', request.id)

    expect(out.ok).toBe(false)
    expect((out as any).status).toBe(404)
    expect(calls).toHaveLength(0)
    expect(admin._updates).toHaveLength(0)
    // The other business's row was never touched.
    expect(request.appointment_id).toBe('their-evt')
  })
})
