/**
 * Authorization regression tests for POST /api/leads/manual-create
 *
 * Proven issue: the route previously performed service-role writes using a
 * caller-supplied businessId with no authentication or membership check.
 * These tests execute the route handler directly and assert:
 *   - unauthenticated → 401, no writes
 *   - authenticated but not a member → 403, no writes
 *   - revoked member (no membership row) → 403
 *   - nonexistent businessId → fails closed (403), no writes
 *   - authorized owner → success
 *   - authorized member → success
 *   - existing-lead update path still works for authorized member
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/auth-helper', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/team-access', () => ({
  getUserRoleForBusiness: vi.fn(),
}))

const mockBusinessesSingle = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'businesses') {
        return {
          select: () => ({ eq: () => ({ single: mockBusinessesSingle }) }),
        }
      }
      return {
        select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: null }) }) }),
      }
    }),
  },
  db: {},
  normalizePhoneNumberForStorage: (p: string) => `+1${String(p).replace(/\D/g, '')}`,
}))

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
  timelineEvents: { leadCreated: vi.fn() },
}))

vi.mock('@/lib/notifications-server', () => ({
  notificationServiceServer: { notifyNewLead: vi.fn() },
}))

vi.mock('@/lib/follow-ups', () => ({
  createFollowUpJobs: vi.fn(),
}))

import { POST } from '../route'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'
import { getUserRoleForBusiness } from '@/lib/team-access'
import { LeadService } from '@/lib/services/LeadService'
import { ConversationService } from '@/lib/services/ConversationService'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'
import { createFollowUpJobs } from '@/lib/follow-ups'

const BUSINESS_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_BUSINESS_ID = '22222222-2222-2222-2222-222222222222'

function makeRequest(body: any, headers: Record<string, string> = {}): any {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: new Map(Object.entries(headers)),
  }
}

function expectNoWrites() {
  expect(LeadService.createLead).not.toHaveBeenCalled()
  expect(LeadService.updateLead).not.toHaveBeenCalled()
  expect(ConversationService.findOrCreateConversation).not.toHaveBeenCalled()
  expect(timelineEvents.leadCreated).not.toHaveBeenCalled()
  expect(notificationServiceServer.notifyNewLead).not.toHaveBeenCalled()
  expect(createFollowUpJobs).not.toHaveBeenCalled()
}

describe('POST /api/leads/manual-create authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBusinessesSingle.mockResolvedValue({
      data: { id: BUSINESS_ID, name: 'Test Business' },
      error: null,
    })
    vi.mocked(ConversationService.findOrCreateConversation).mockResolvedValue({
      conversationId: 'conv-1',
      isNew: true,
    } as any)
  })

  it('rejects unauthenticated requests with 401 and performs no writes', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)

    const res = await POST(makeRequest({ businessId: BUSINESS_ID, customerName: 'X' }))
    expect(res.status).toBe(401)
    expect(getUserRoleForBusiness).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('rejects authenticated non-member with 403 and performs no writes', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-A' } as any)
    vi.mocked(getUserRoleForBusiness).mockResolvedValue(null)

    const res = await POST(
      makeRequest(
        { businessId: OTHER_BUSINESS_ID, customerName: 'Intruder' },
        { Authorization: 'Bearer valid-token' }
      )
    )
    expect(res.status).toBe(403)
    expect(getUserRoleForBusiness).toHaveBeenCalledWith(expect.anything(), 'user-A', OTHER_BUSINESS_ID)
    expectNoWrites()
  })

  it('rejects revoked member (membership gone) with 403', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'ex-member' } as any)
    vi.mocked(getUserRoleForBusiness).mockResolvedValue(null)

    const res = await POST(
      makeRequest({ businessId: BUSINESS_ID, customerName: 'Revoked' }, { Authorization: 'Bearer t' })
    )
    expect(res.status).toBe(403)
    expectNoWrites()
  })

  it('fails closed for nonexistent businessId (403, no existence oracle)', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-A' } as any)
    vi.mocked(getUserRoleForBusiness).mockResolvedValue(null)

    const res = await POST(
      makeRequest({ businessId: 'nonexistent-id', customerName: 'X' }, { Authorization: 'Bearer t' })
    )
    expect(res.status).toBe(403)
    expectNoWrites()
  })

  it('returns 400 for missing businessId', async () => {
    const res = await POST(makeRequest({ customerName: 'X' }))
    expect(res.status).toBe(400)
    expectNoWrites()
  })

  it('allows an authorized owner to create a lead', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'owner-1' } as any)
    vi.mocked(getUserRoleForBusiness).mockResolvedValue('owner')
    vi.mocked(LeadService.findLead).mockResolvedValue(null)
    vi.mocked(LeadService.createLead).mockResolvedValue({ id: 'lead-1' } as any)

    const res = await POST(
      makeRequest(
        { businessId: BUSINESS_ID, customerName: 'New Customer', phoneNumber: '5551234567' },
        { Authorization: 'Bearer t' }
      )
    )
    expect(res.status).toBe(200)
    expect(LeadService.createLead).toHaveBeenCalledWith(
      expect.objectContaining({ business_id: BUSINESS_ID })
    )
  })

  it('allows an authorized member to create a lead', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'member-1' } as any)
    vi.mocked(getUserRoleForBusiness).mockResolvedValue('member')
    vi.mocked(LeadService.findLead).mockResolvedValue(null)
    vi.mocked(LeadService.createLead).mockResolvedValue({ id: 'lead-2' } as any)

    const res = await POST(
      makeRequest(
        { businessId: BUSINESS_ID, customerName: 'Member Customer' },
        { Authorization: 'Bearer t' }
      )
    )
    expect(res.status).toBe(200)
    expect(LeadService.createLead).toHaveBeenCalled()
  })

  it('authorized member can update an existing matched lead', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'member-1' } as any)
    vi.mocked(getUserRoleForBusiness).mockResolvedValue('member')
    vi.mocked(LeadService.findLead).mockResolvedValue({
      id: 'existing-lead',
      status: 'active',
      raw_metadata: { extracted_info: { callerName: 'Old' } },
    } as any)
    vi.mocked(LeadService.updateLead).mockResolvedValue({ id: 'existing-lead' } as any)

    const res = await POST(
      makeRequest(
        { businessId: BUSINESS_ID, customerName: 'Updated', phoneNumber: '5551234567' },
        { Authorization: 'Bearer t' }
      )
    )
    expect(res.status).toBe(200)
    expect(LeadService.updateLead).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: 'existing-lead' })
    )
  })
})
