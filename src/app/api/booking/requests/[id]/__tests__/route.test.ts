import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '../route'
import { bookingAdmin } from '@/lib/booking/settings'
import { getAuthedBusiness } from '@/lib/booking/api-auth'

vi.mock('@/lib/booking/api-auth', () => ({
  getAuthedBusiness: vi.fn(),
}))

vi.mock('@/lib/booking/settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/booking/settings')>()
  return { ...original, bookingAdmin: vi.fn() }
})

function fakeClient(rows: Record<string, unknown[]>) {
  const builder = (table: string, appliedFilters: Record<string, string | string[]> = {}) => {
    const all = rows[table] ?? []
    return {
      select: () => builder(table, appliedFilters),
      eq: (col: string, val: string | string[]) => builder(table, { ...appliedFilters, [col]: val }),
      order: () => ({ data: all, error: null }),
      maybeSingle: async () => {
        const result = all.find((r: any) => {
          return Object.entries(appliedFilters).every(([col, val]) => r[col] === val)
        }) ?? null
        return { data: result, error: null }
      },
    }
  }
  return {
    from: (table: string) => builder(table),
  } as any
}

const bookingRequest = {
  id: 'req-1',
  business_id: 'biz-a',
  status: 'pending',
  customer_name: 'Jane Doe',
  customer_phone: '+15551234567',
  normalized_phone: '+15551234567',
  customer_email: 'jane@example.com',
  customer_address: '123 Main St',
  service: 'Consultation',
  notes: 'notes',
  requested_start: '2026-09-21T14:00:00.000Z',
  requested_end: '2026-09-21T15:00:00.000Z',
  current_proposed_start: null,
  current_proposed_end: null,
  timezone: 'America/New_York',
  hold_expires_at: null,
  lead_id: null,
  appointment_id: null,
  job_id: null,
  created_at: '2026-09-20T12:00:00.000Z',
  updated_at: '2026-09-20T12:00:00.000Z',
}

describe('GET /api/booking/requests/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when authentication fails', async () => {
    ;(getAuthedBusiness as any).mockResolvedValue({ ok: false, status: 401, error: 'Unauthorized' })

    const request = new Request('http://localhost/api/booking/requests/req-1', {
      headers: { Authorization: 'Bearer token' },
    })
    const response = await GET(request, { params: Promise.resolve({ id: 'req-1' }) })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('returns 404 when request belongs to a different business', async () => {
    ;(getAuthedBusiness as any).mockResolvedValue({ ok: true, businessId: 'biz-a', userId: 'user-1' })
    ;(bookingAdmin as any).mockReturnValue(
      fakeClient({
        booking_requests: [{ ...bookingRequest, business_id: 'biz-b' }],
        booking_request_events: [],
        booking_settings: [],
      })
    )

    const request = new Request('http://localhost/api/booking/requests/req-1', {
      headers: { Authorization: 'Bearer token' },
    })
    const response = await GET(request, { params: Promise.resolve({ id: 'req-1' }) })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Booking request not found')
  })

  it('returns full detail for an authenticated owner', async () => {
    ;(getAuthedBusiness as any).mockResolvedValue({ ok: true, businessId: 'biz-a', userId: 'user-1' })
    ;(bookingAdmin as any).mockReturnValue(
      fakeClient({
        booking_requests: [bookingRequest],
        booking_request_events: [
          { id: 'ev-1', booking_request_id: 'req-1', event_type: 'created', actor: 'customer', from_status: null, to_status: 'pending', start_at: null, end_at: null, note: null, created_at: '2026-09-20T12:00:00.000Z' },
        ],
        booking_settings: [{ business_id: 'biz-a', public_slug: 'acme', timezone: 'America/New_York', default_duration_minutes: 60 }],
      })
    )

    const request = new Request('http://localhost/api/booking/requests/req-1', {
      headers: { Authorization: 'Bearer token' },
    })
    const response = await GET(request, { params: Promise.resolve({ id: 'req-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.id).toBe('req-1')
    expect(data.customer_name).toBe('Jane Doe')
    expect(data.events).toHaveLength(1)
    expect(data.bookingSlug).toBe('acme')
  })
})
