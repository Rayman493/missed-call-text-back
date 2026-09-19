import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'

// booking/actions imports availability -> google/token which instantiates a
// Supabase client at module load. Provide dummy URLs before that import loads.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
})

import {
  agreedWindow,
  BUSINESS_NEGOTIATING_STATUSES,
} from '@/lib/booking/actions'
import {
  BOOKING_REQUEST_STATUSES,
  ACTIVE_BOOKING_STATUSES,
  BOOKING_EVENT_TYPES,
} from '@/lib/booking/types'

/* -------------------------------------------------------------------------- */
/* 1. Phase 2 migration contracts                                            */
/* -------------------------------------------------------------------------- */

describe('Phase 2 migration', () => {
  const migration = readFileSync(
    'supabase/migrations/20260921000000_online_booking_phase2.sql',
    'utf8'
  )

  it('enforces the Appointment-XOR-Job invariant', () => {
    expect(migration).toMatch(/booking_requests_one_operational_record/)
    expect(migration).toMatch(/appointment_id is not null and job_id is not null/)
  })

  it('widens booking_request_events for conversion + SMS events', () => {
    expect(migration).toMatch(/'lead_linked'/)
    expect(migration).toMatch(/'appointment_created'/)
    expect(migration).toMatch(/'job_created'/)
    expect(migration).toMatch(/'sms_sent'/)
    expect(migration).toMatch(/'sms_failed'/)
  })

  it('widens notifications.type for booking_request', () => {
    expect(migration).toMatch(/'booking_request'/)
  })
})

/* -------------------------------------------------------------------------- */
/* 2. State model contracts                                                   */
/* -------------------------------------------------------------------------- */

describe('Booking state model', () => {
  it('keeps the Phase 1 status enum unchanged', () => {
    expect(BOOKING_REQUEST_STATUSES).toEqual([
      'pending',
      'business_proposed',
      'customer_reselected',
      'accepted',
      'declined',
      'cancelled',
      'expired',
    ])
  })

  it('holds the agreed window through accepted until conversion', () => {
    expect(ACTIVE_BOOKING_STATUSES).toContain('accepted')
  })

  it('uses actor-neutral event types with business/customer/system actor column', () => {
    expect(BOOKING_EVENT_TYPES).toContain('accepted')
    expect(BOOKING_EVENT_TYPES).toContain('time_proposed')
    expect(BOOKING_EVENT_TYPES).toContain('time_selected')
    expect(BOOKING_EVENT_TYPES).toContain('lead_linked')
    expect(BOOKING_EVENT_TYPES).toContain('appointment_created')
    expect(BOOKING_EVENT_TYPES).toContain('job_created')
  })

  it('lets the business act on pending/customer_reselected/business_proposed', () => {
    expect(BUSINESS_NEGOTIATING_STATUSES).toEqual([
      'pending',
      'customer_reselected',
      'business_proposed',
    ])
  })
})

/* -------------------------------------------------------------------------- */
/* 3. agreedWindow helper                                                     */
/* -------------------------------------------------------------------------- */

describe('agreedWindow', () => {
  it('prefers the business proposal over the original request', () => {
    const w = agreedWindow({
      requested_start: '2026-03-02T14:00:00.000Z',
      requested_end: '2026-03-02T15:00:00.000Z',
      current_proposed_start: '2026-03-03T14:00:00.000Z',
      current_proposed_end: '2026-03-03T15:00:00.000Z',
    })
    expect(w.start).toBe('2026-03-03T14:00:00.000Z')
    expect(w.end).toBe('2026-03-03T15:00:00.000Z')
  })

  it('falls back to the original request when no proposal exists', () => {
    const w = agreedWindow({
      requested_start: '2026-03-02T14:00:00.000Z',
      requested_end: '2026-03-02T15:00:00.000Z',
      current_proposed_start: null,
      current_proposed_end: null,
    })
    expect(w.start).toBe('2026-03-02T14:00:00.000Z')
    expect(w.end).toBe('2026-03-02T15:00:00.000Z')
  })
})

/* -------------------------------------------------------------------------- */
/* 4. SMS helpers — mocked canonical path                                      */
/* -------------------------------------------------------------------------- */

vi.mock('@/lib/twilio', () => ({ sendSms: vi.fn() }))
vi.mock('@/lib/booking/settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/booking/settings')>()
  return { ...original, bookingAdmin: vi.fn() }
})

import { bookingAdmin } from '@/lib/booking/settings'
import { sendSms } from '@/lib/twilio'
import {
  sendBookingProposalSms,
  sendBookingConfirmationSms,
  sendBookingDeclinedSms,
} from '@/lib/booking/sms'

function fakeClient(tables: Record<string, { single?: any }>) {
  const chain = {
    from: (table: string) => ({
      select: () => chain.from(table),
      eq: () => chain.from(table),
      maybeSingle: async () => ({ data: tables[table]?.single ?? null, error: null }),
      insert: async () => ({ error: null }),
    }),
  }
  return chain as any
}

const baseBusiness = {
  id: 'biz-1',
  name: 'Acme Co',
  twilio_phone_number: '+15551234567',
  twilio_phone_number_sid: 'PN123',
  twilio_messaging_service_sid: null,
  provisioning_status: 'active',
}

describe('Booking SMS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('proposal includes business name, business-timezone time, and same-token link', async () => {
    ;(bookingAdmin as any).mockReturnValue(
      fakeClient({ businesses: { single: baseBusiness } })
    )
    ;(sendSms as any).mockResolvedValue({ sid: 'SM123', messageId: 'msg-1' })

    const result = await sendBookingProposalSms(
      {
        id: 'req-1',
        business_id: 'biz-1',
        normalized_phone: '+15559876543',
        customer_phone: '5559876543',
        timezone: 'America/New_York',
        continuation_token: 'tok-abc',
      } as any,
      'acme-co',
      '2026-03-03T18:00:00.000Z' // 1:00 PM ET
    )

    expect(result.sent).toBe(true)
    expect(result.sid).toBe('SM123')

    const call = (sendSms as any).mock.calls[0]
    const [business, to, message] = call
    expect(business.name).toBe('Acme Co')
    expect(to).toBe('+15559876543')
    expect(message).toContain('Acme Co')
    expect(message).toContain('suggested a new time')
    expect(message).toContain('1:00 PM')
    expect(message).toContain('/book/acme-co/request/tok-abc')
  })

  it('confirmation includes business name and agreed time', async () => {
    ;(bookingAdmin as any).mockReturnValue(
      fakeClient({ businesses: { single: baseBusiness } })
    )
    ;(sendSms as any).mockResolvedValue({ sid: 'SM456', messageId: 'msg-2' })

    const result = await sendBookingConfirmationSms(
      {
        id: 'req-1',
        business_id: 'biz-1',
        normalized_phone: '+15559876543',
        customer_phone: '5559876543',
        timezone: 'America/New_York',
      } as any,
      '2026-03-03T18:00:00.000Z'
    )

    expect(result.sent).toBe(true)
    const [, , message] = (sendSms as any).mock.calls[0]
    expect(message).toContain('Acme Co')
    expect(message).toContain('confirmed your booking')
    expect(message).toContain('1:00 PM')
    expect(message).not.toContain('Appointment')
    expect(message).not.toContain('Job')
  })

  it('action route supports resend-proposal without duplicating state', () => {
    const route = readFileSync(
      'src/app/api/booking/requests/[id]/action/route.ts',
      'utf8'
    )
    expect(route).toMatch(/case 'resend-proposal'/)
    expect(route).toMatch(/'There is no suggested time to resend\.'/)
    const sms = readFileSync('src/lib/booking/sms.ts', 'utf8')
    expect(sms).toMatch(/sms_failed/)
  })

  it('conversion returns calendar_not_connected when Google Calendar is not connected', () => {
    const conversion = readFileSync('src/lib/booking/conversion.ts', 'utf8')
    expect(conversion).toMatch(/calendar_not_connected/)
    expect(conversion).toMatch(/Connect it in Settings, or create a Job instead/)
  })

  it('business surfaces clear loading, empty, error, and recovery states', () => {
    const card = readFileSync(
      'src/components/schedule/BookingRequestsCard.tsx',
      'utf8'
    )
    const modal = readFileSync(
      'src/components/schedule/BookingRequestDetailModal.tsx',
      'utf8'
    )
    expect(card).toMatch(/Loading booking requests…/)
    expect(card).toMatch(/No booking requests yet\./)
    expect(card).toMatch(/Could not load booking requests/)
    expect(modal).toMatch(/Could not load this booking request\./)
    expect(modal).toMatch(/Resend text/)
  })

  it('decline message points to a fresh booking page, not the terminal token', async () => {
    ;(bookingAdmin as any).mockReturnValue(
      fakeClient({ businesses: { single: baseBusiness } })
    )
    ;(sendSms as any).mockResolvedValue({ sid: 'SM789', messageId: 'msg-3' })

    const result = await sendBookingDeclinedSms(
      {
        id: 'req-1',
        business_id: 'biz-1',
        normalized_phone: '+15559876543',
        customer_phone: '5559876543',
      } as any,
      'acme-co'
    )

    expect(result.sent).toBe(true)
    const [, , message] = (sendSms as any).mock.calls[0]
    expect(message).toContain('/book/acme-co')
    expect(message).not.toContain('/request/')
  })
})
