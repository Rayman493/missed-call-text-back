import { describe, it, expect, vi, beforeEach } from 'vitest'

// action/route imports sms -> twilio, which creates a Supabase client at
// module load. Provide dummy URLs before any imports run.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
})

vi.mock('@/lib/twilio', () => ({
  sendSms: vi.fn(),
  twilioClient: null,
}))

vi.mock('@/lib/booking/settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/booking/settings')>()
  return { ...original, bookingAdmin: vi.fn() }
})

import { POST } from '../route'
import { bookingAdmin } from '@/lib/booking/settings'
import {
  acceptBookingRequest,
  rejectBookingRequest,
  proposeBookingRequestTime,
} from '@/lib/booking/actions'
import {
  createAppointmentForBookingRequest,
  createJobForBookingRequest,
} from '@/lib/booking/conversion'
import { getAuthedBusiness } from '@/lib/booking/api-auth'

vi.mock('@/lib/booking/api-auth', () => ({
  getAuthedBusiness: vi.fn(),
}))

vi.mock('@/lib/booking/actions', () => ({
  acceptBookingRequest: vi.fn(),
  rejectBookingRequest: vi.fn(),
  proposeBookingRequestTime: vi.fn(),
}))

vi.mock('@/lib/booking/conversion', () => ({
  createAppointmentForBookingRequest: vi.fn(),
  createJobForBookingRequest: vi.fn(),
}))

vi.mock('@/lib/booking/notify', () => ({
  notifyBookingRequest: vi.fn(),
}))

function makeRequest(action: string, body?: Record<string, unknown>) {
  return new Request('http://localhost/api/booking/requests/req-1/action', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
}

describe('POST /api/booking/requests/[id]/action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getAuthedBusiness as any).mockResolvedValue({ ok: true, businessId: 'biz-a', userId: 'user-1' })
    ;(bookingAdmin as any).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { public_slug: 'acme' }, error: null }),
          }),
        }),
      }),
    })
  })

  it('routes create-appointment to createAppointmentForBookingRequest', async () => {
    ;(createAppointmentForBookingRequest as any).mockResolvedValue({
      ok: true, alreadyCreated: false, kind: 'appointment', recordId: 'ev-1', leadId: 'lead-1',
    })
    const res = await POST(makeRequest('create-appointment'), { params: Promise.resolve({ id: 'req-1' }) })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.kind).toBe('appointment')
    expect(createAppointmentForBookingRequest).toHaveBeenCalledWith('biz-a', 'req-1')
  })

  it('routes create-job to createJobForBookingRequest', async () => {
    ;(createJobForBookingRequest as any).mockResolvedValue({
      ok: true, alreadyCreated: false, kind: 'job', recordId: 'job-1', leadId: 'lead-1',
    })
    const res = await POST(makeRequest('create-job'), { params: Promise.resolve({ id: 'req-1' }) })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.kind).toBe('job')
    expect(createJobForBookingRequest).toHaveBeenCalledWith('biz-a', 'req-1')
  })

  it('returns 400 Unknown action for unsupported action names', async () => {
    const res = await POST(makeRequest('create_appointment'), { params: Promise.resolve({ id: 'req-1' }) })
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe('Unknown action')
    expect(createAppointmentForBookingRequest).not.toHaveBeenCalled()
    expect(createJobForBookingRequest).not.toHaveBeenCalled()
  })

  it('routes propose with start/end', async () => {
    ;(proposeBookingRequestTime as any).mockResolvedValue({
      ok: true, alreadyApplied: false, status: 'business_proposed', agreedStart: 's', agreedEnd: 'e',
      request: { id: 'req-1', business_id: 'biz-a', timezone: 'America/New_York', continuation_token: 'tok', normalized_phone: '+15550001111' },
      sms: 'none',
    })
    const res = await POST(makeRequest('propose', { start: 's', end: 'e' }), { params: Promise.resolve({ id: 'req-1' }) })
    expect(res.status).toBe(200)
    expect(proposeBookingRequestTime).toHaveBeenCalledWith('biz-a', 'req-1', 's', 'e')
  })
})
