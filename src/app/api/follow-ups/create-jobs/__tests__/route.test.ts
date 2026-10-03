/**
 * Regression: follow-ups/create-jobs must verify leadId belongs to businessId
 *
 * Defect: the user-auth path validated membership for businessId but never
 * verified the lead belonged to that business — a known lead UUID from
 * another business could be associated cross-tenant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createFollowUpJobs } = vi.hoisted(() => ({
  createFollowUpJobs: vi.fn(async () => [{ id: 'f1' }]),
}))

let businessRow: any = { id: 'biz_1', user_id: 'u1' }
let leadRow: any = null
let aiCallRecordRow: any = null

const builder = (resolveData: any): any => {
  const b: any = {}
  for (const m of ['select', 'eq', 'update', 'insert', 'or', 'limit', 'order', 'neq', 'is', 'gte']) {
    b[m] = vi.fn(() => b)
  }
  b.single = vi.fn(async () => ({ data: resolveData, error: resolveData ? null : { code: 'PGRST116' } }))
  b.maybeSingle = vi.fn(async () => ({ data: resolveData, error: null }))
  b.then = (res: any) => res({ data: resolveData, error: null })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'businesses') return builder(businessRow)
      if (table === 'leads') return builder(leadRow)
      if (table === 'ai_call_records') return builder(aiCallRecordRow)
      return builder(null)
    }),
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
  })),
}))

vi.mock('@/lib/team-access', () => ({
  getUserRoleForBusiness: vi.fn(async () => 'member'),
}))

vi.mock('@/lib/follow-ups', () => ({ createFollowUpJobs }))

import { POST } from '../route'

const req = (body: any, headers: Record<string, string> = {}) =>
  ({
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  }) as any

beforeEach(() => {
  vi.clearAllMocks()
  businessRow = { id: 'biz_1', user_id: 'u1' }
  leadRow = null
  aiCallRecordRow = null
})

describe('follow-ups/create-jobs lead ownership', () => {
  it('allows a same-business lead', async () => {
    leadRow = { id: 'lead_1' }
    const res = await POST(req({ businessId: 'biz_1', leadId: 'lead_1' }))
    expect(res.status).toBe(200)
    expect(createFollowUpJobs).toHaveBeenCalled()
  })

  it('rejects a lead that belongs to another business', async () => {
    // The .eq('business_id') lookup returns no row for a cross-tenant leadId
    leadRow = null
    const res = await POST(req({ businessId: 'biz_1', leadId: 'victim_lead' }))
    expect(res.status).toBe(404)
    expect(createFollowUpJobs).not.toHaveBeenCalled()
  })

  it('rejects a nonexistent lead', async () => {
    leadRow = null
    const res = await POST(req({ businessId: 'biz_1', leadId: 'does_not_exist' }))
    expect(res.status).toBe(404)
    expect(createFollowUpJobs).not.toHaveBeenCalled()
  })

  it('suppresses follow-ups for a completed AI intake with no importantDetails', async () => {
    // Single canonical Request model: new AI calls never populate
    // importantDetails — a completed intake must still count as complete.
    leadRow = { id: 'lead_1' }
    aiCallRecordRow = {
      id: 'air_1',
      outcome: 'completed',
      lead_id: 'lead_1',
      extracted_info: {
        callerName: 'Jordan Lee',
        reasonForCalling: 'Have the grass cut and cleaned up at the property. The yard is about a quarter acre and the gate is narrow.',
        addressOrLocation: '123 Main Street',
        desiredCompletionTime: 'next Friday',
        preferredCallbackTime: 'after 4 pm',
        // no importantDetails / issueDescription / additionalDetails
      },
    }
    const res = await POST(req({ businessId: 'biz_1', leadId: 'lead_1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(true)
    expect(body.reason).toBe('completed_ai_intake')
    expect(createFollowUpJobs).not.toHaveBeenCalled()
  })

  it('still creates follow-ups when a completed AI intake lacks a required field', async () => {
    leadRow = { id: 'lead_1' }
    aiCallRecordRow = {
      id: 'air_1',
      outcome: 'completed',
      lead_id: 'lead_1',
      extracted_info: {
        callerName: 'Jordan Lee',
        reasonForCalling: 'Need the grass cut',
        // missing addressOrLocation
        desiredCompletionTime: 'next Friday',
        preferredCallbackTime: 'after 4 pm',
      },
    }
    const res = await POST(req({ businessId: 'biz_1', leadId: 'lead_1' }))
    expect(res.status).toBe(200)
    expect(createFollowUpJobs).toHaveBeenCalled()
  })

  it('still denies users without business membership before any lead check', async () => {
    const { getUserRoleForBusiness } = await import('@/lib/team-access')
    vi.mocked(getUserRoleForBusiness).mockResolvedValueOnce(null as any)
    leadRow = { id: 'lead_1' }
    const res = await POST(req({ businessId: 'biz_1', leadId: 'lead_1' }))
    expect(res.status).toBe(403)
    expect(createFollowUpJobs).not.toHaveBeenCalled()
  })
})
