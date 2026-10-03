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
      return builder(null) // ai_call_records etc.
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

  it('still denies users without business membership before any lead check', async () => {
    const { getUserRoleForBusiness } = await import('@/lib/team-access')
    vi.mocked(getUserRoleForBusiness).mockResolvedValueOnce(null as any)
    leadRow = { id: 'lead_1' }
    const res = await POST(req({ businessId: 'biz_1', leadId: 'lead_1' }))
    expect(res.status).toBe(403)
    expect(createFollowUpJobs).not.toHaveBeenCalled()
  })
})
