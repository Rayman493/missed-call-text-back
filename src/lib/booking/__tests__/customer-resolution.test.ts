import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureLeadForBookingRequest, findExistingCustomerForBooking } from '../customer-resolution'
import type { BookingRequest } from '../types'

vi.mock('@/lib/services/LeadService', () => ({
  LeadService: {
    findLead: vi.fn(),
    createLead: vi.fn(),
    updateLead: vi.fn(),
  },
}))

vi.mock('@/lib/services/ConversationService', () => ({
  ConversationService: {
    findOrCreateConversation: vi.fn(),
  },
}))

vi.mock('@/lib/event-timeline', () => ({
  timelineEvents: {
    leadCreated: vi.fn(),
  },
}))

vi.mock('@/lib/follow-ups', () => ({
  createFollowUpJobs: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  normalizePhoneNumberForStorage: vi.fn((phone: string) => phone.replace(/\D/g, '')),
}))

vi.mock('../settings', () => ({
  bookingAdmin: vi.fn(),
}))

import { LeadService } from '@/lib/services/LeadService'
import { ConversationService } from '@/lib/services/ConversationService'
import { timelineEvents } from '@/lib/event-timeline'
import { createFollowUpJobs } from '@/lib/follow-ups'
import { bookingAdmin } from '../settings'

const mockSupabase = () => {
  const rows: Record<string, unknown[]> = {}
  const chain = (table: string, filters: Record<string, string | string[]> = {}) => ({
    select: () => chain(table, filters),
    eq: (col: string, val: string | string[]) => chain(table, { ...filters, [col]: val }),
    order: () => ({ data: rows[table] ?? [], error: null }),
    maybeSingle: async () => {
      const all = rows[table] ?? []
      const found = all.find((r: any) => Object.entries(filters).every(([col, val]) => r[col] === val)) ?? null
      return { data: found, error: null }
    },
  })
  return {
    from: (table: string) => ({
      ...chain(table),
      update: (values: any) => ({
        eq: () => ({
          is: () => ({
            select: async () => ({ data: [{ ...values }], error: null }),
          }),
        }),
      }),
      insert: (values: any) => ({
        select: () => ({
          single: async () => ({ data: Array.isArray(values) ? values[0] : values, error: null }),
        }),
      }),
    }),
    _setRows: (table: string, data: unknown[]) => { rows[table] = data },
  }
}

function makeRequest(overrides?: Partial<BookingRequest>): BookingRequest {
  return {
    id: 'req-1',
    business_id: 'biz-a',
    status: 'accepted',
    customer_name: 'Ryan Bandi',
    customer_phone: '(412) 555-3010',
    normalized_phone: '4125553010',
    customer_email: null,
    customer_address: null,
    service: 'Cleanup',
    notes: null,
    requested_start: '2026-09-21T14:00:00.000Z',
    requested_end: '2026-09-21T15:00:00.000Z',
    current_proposed_start: null,
    current_proposed_end: null,
    timezone: 'America/New_York',
    lead_id: null,
    job_id: null,
    appointment_id: null,
    continuation_token: 'tok',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    hold_expires_at: null,
    ...overrides,
  } as BookingRequest
}

describe('findExistingCustomerForBooking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('matches by normalized phone within the same business', async () => {
    ;(LeadService.findLead as any).mockResolvedValue({ id: 'lead-1', contact_name: 'Ryan' })
    const match = await findExistingCustomerForBooking('biz-a', { phone: '(412) 555-3010' })
    expect(match?.leadId).toBe('lead-1')
    expect(LeadService.findLead).toHaveBeenCalledWith({ business_id: 'biz-a', caller_phone: '4125553010' })
  })

  it('does not match a phone in a different business', async () => {
    ;(LeadService.findLead as any).mockResolvedValue(null)
    const match = await findExistingCustomerForBooking('biz-b', { phone: '4125553010' })
    expect(match).toBeNull()
    expect(LeadService.findLead).toHaveBeenCalledWith({ business_id: 'biz-b', caller_phone: '4125553010' })
  })

  it('does NOT reuse an existing customer by email when the phone differs', async () => {
    ;(LeadService.findLead as any).mockResolvedValue(null)
    const match = await findExistingCustomerForBooking('biz-a', { phone: '5550001111', email: 'shared@example.com' })
    expect(match).toBeNull()
  })

  it('does NOT create an email-only match when no phone is provided', async () => {
    const match = await findExistingCustomerForBooking('biz-a', { email: 'only-email@example.com' })
    expect(match).toBeNull()
    expect(LeadService.findLead).not.toHaveBeenCalled()
  })

  it('matches by differently-formatted equivalent phone', async () => {
    ;(LeadService.findLead as any).mockResolvedValue({ id: 'lead-1', contact_name: 'Ryan' })
    const match = await findExistingCustomerForBooking('biz-a', { phone: '(412) 555-3010' })
    expect(match?.leadId).toBe('lead-1')
    expect(LeadService.findLead).toHaveBeenCalledWith({ business_id: 'biz-a', caller_phone: '4125553010' })
  })
})

describe('ensureLeadForBookingRequest', () => {
  let sb: ReturnType<typeof mockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    sb = mockSupabase()
    ;(bookingAdmin as any).mockReturnValue(sb)
  })

  it('creates a new customer when no lead exists and no phone match', async () => {
    ;(LeadService.findLead as any).mockResolvedValue(null)
    ;(LeadService.createLead as any).mockResolvedValue({ id: 'new-lead' })
    ;(ConversationService.findOrCreateConversation as any).mockResolvedValue({ conversationId: 'conv-1' })
    sb._setRows('businesses', [{ name: 'Acme' }])

    const result = await ensureLeadForBookingRequest(makeRequest())

    expect(result.ok).toBe(true)
    expect(result.leadId).toBe('new-lead')
    expect(LeadService.createLead).toHaveBeenCalled()
    const args = (LeadService.createLead as any).mock.calls[0][0]
    expect(args.business_id).toBe('biz-a')
    expect(args.caller_phone).toBe('4125553010')
    expect(args.source).toBe('online_booking')
  })

  it('reuses an existing matched customer and does not overwrite source', async () => {
    ;(LeadService.findLead as any).mockResolvedValue({ id: 'existing-lead', source: 'ai_intake' })
    ;(LeadService.updateLead as any).mockResolvedValue(null)
    ;(ConversationService.findOrCreateConversation as any).mockResolvedValue({ conversationId: 'conv-1' })

    const result = await ensureLeadForBookingRequest(makeRequest())

    expect(result.ok).toBe(true)
    expect(result.leadId).toBe('existing-lead')
    expect(LeadService.createLead).not.toHaveBeenCalled()
    expect(LeadService.updateLead).not.toHaveBeenCalled()
  })

  it('reuses lead_id already linked on the booking request', async () => {
    sb._setRows('leads', [{ id: 'linked-lead', business_id: 'biz-a' }])

    const result = await ensureLeadForBookingRequest(makeRequest({ lead_id: 'linked-lead' }))

    expect(result.ok).toBe(true)
    expect(result.leadId).toBe('linked-lead')
    expect(LeadService.findLead).not.toHaveBeenCalled()
    expect(LeadService.createLead).not.toHaveBeenCalled()
  })

  it('is idempotent on retry: same phone returns the same lead_id', async () => {
    ;(LeadService.findLead as any).mockResolvedValue({ id: 'existing-lead' })
    ;(ConversationService.findOrCreateConversation as any).mockResolvedValue({ conversationId: 'conv-1' })

    const first = await ensureLeadForBookingRequest(makeRequest())
    const second = await ensureLeadForBookingRequest(makeRequest())

    expect(first.leadId).toBe(second.leadId)
    expect(LeadService.createLead).not.toHaveBeenCalled()
  })

  it('links the created lead back to the booking request', async () => {
    ;(LeadService.findLead as any).mockResolvedValue(null)
    ;(LeadService.createLead as any).mockResolvedValue({ id: 'new-lead' })
    ;(ConversationService.findOrCreateConversation as any).mockResolvedValue({ conversationId: 'conv-1' })
    sb._setRows('businesses', [{ name: 'Acme' }])

    await ensureLeadForBookingRequest(makeRequest())

    expect(bookingAdmin).toHaveBeenCalled()
  })
})
