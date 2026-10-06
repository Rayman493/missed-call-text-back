/**
 * Regression tests for Step 1 business discovery + pre-auth-delete safety.
 *
 * Proven production failure: deleteAccountLifecycle logged
 * "Found businesses: 0" for a user who provably owned a business, skipped all
 * data deletion, and attempted auth.users deletion — which failed with the
 * generic GoTrue "Database error deleting user" FK error.
 *
 * Required behavior:
 *  - discovery covers businesses.user_id AND business_memberships (role=owner)
 *  - duplicate discovery is deduplicated by business id
 *  - any discovery query error fails closed (never becomes "0 businesses")
 *  - auth user deletion cannot run while a businesses row still references
 *    the target user
 *  - admin-supplied targetBusinessId is validated against the target user
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const DIRECT_BIZ = {
  id: 'biz_direct',
  user_id: 'user_1',
  name: 'Direct Biz',
  twilio_phone_number_sid: null,
  twilio_phone_number: null,
  stripe_subscription_id: null,
  stripe_customer_id: null,
  subscription_status: null,
  subscription_provider: null,
  google_play_purchase_token: null,
  twilio_messaging_service_sid: null,
  is_protected_account: false,
  business_phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
  trial_ends_at: null,
  provisioning_status: 'completed',
}

const MEMBER_BIZ = {
  ...DIRECT_BIZ,
  id: 'biz_member',
  user_id: 'other_user',
  name: 'Member Biz',
}

const TWILIO_BIZ = {
  ...DIRECT_BIZ,
  id: 'biz_twilio',
  twilio_phone_number_sid: 'PN123',
  twilio_phone_number: '+15551234567',
}

const state = {
  businessRows: [] as any[],
  memberships: [] as any[],
  businessesError: null as any,
  membershipsError: null as any,
  deleteLeavesRow: false,
  deletedBusinessIds: [] as string[],
  authDeleteCalled: false,
}

function tableHandler(table: string) {
  if (table === 'businesses') {
    return {
      select: vi.fn((cols: string) => {
        // Pre-auth-delete safety check: select('id').eq('user_id', ...)
        if (cols === 'id') {
          return {
            eq: vi.fn(async (col: string, val: any) => ({
              data: state.businessRows.filter((r) => r[col] === val).map((r) => ({ id: r.id })),
              error: null,
            })),
          }
        }
        // targetBusinessId ownership lookup: select('id, user_id').eq('id', ...)
        if (cols === 'id, user_id') {
          return {
            eq: vi.fn(async (col: string, val: any) => ({
              data: state.businessRows
                .filter((r) => r[col] === val)
                .map((r) => ({ id: r.id, user_id: r.user_id })),
              error: null,
            })),
          }
        }
        // Full Step 1 select
        return {
          eq: vi.fn(async (col: string, val: any) =>
            state.businessesError
              ? { data: null, error: state.businessesError }
              : { data: state.businessRows.filter((r) => r[col] === val), error: null }
          ),
          in: vi.fn(async (col: string, vals: any[]) => ({
            data: state.businessRows.filter((r) => vals.includes(r[col])),
            error: null,
          })),
        }
      }),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async (col: string, val: any) => {
          state.deletedBusinessIds.push(val)
          if (!state.deleteLeavesRow) {
            state.businessRows = state.businessRows.filter((r) => r[col] !== val)
          }
          return { error: null }
        }),
      })),
    }
  }

  if (table === 'business_memberships') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(async (col: string, val: any) =>
          state.membershipsError
            ? { data: null, error: state.membershipsError }
            : { data: state.memberships.filter((m) => m[col] === val), error: null }
        ),
      })),
    }
  }

  // Generic business-scoped deletable table
  return {
    select: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: [], error: null })),
      in: vi.fn(async () => ({ data: [], error: null })),
    })),
    update: vi.fn(() => ({
      in: vi.fn(() => ({
        select: vi.fn(async () => ({ error: null, count: 0 })),
      })),
      eq: vi.fn(async () => ({ error: null })),
    })),
    delete: vi.fn(() => ({
      in: vi.fn(() => ({
        select: vi.fn(async () => ({ error: null, count: 0 })),
      })),
      eq: vi.fn(async () => ({ error: null })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: 'row_1' }, error: null })),
      })),
    })),
  }
}

const recycleMock = vi.fn(async () => ({ success: true }))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => tableHandler(table)),
    auth: {
      admin: {
        deleteUser: vi.fn(async () => {
          state.authDeleteCalled = true
          return { error: null }
        }),
      },
    },
  },
  normalizeStripeCustomerId: (v: any) => v,
}))

vi.mock('@/lib/stripe', () => ({ default: () => null }))
vi.mock('@/lib/twilio', () => ({ twilioClient: {} }))
vi.mock('@/lib/twilio-assignment', () => ({ isSystemPhoneNumber: () => false }))
vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: vi.fn(),
  getUserEmail: () => 'test@example.com',
}))
vi.mock('@/lib/email', () => ({
  sendOffboardingEmail: vi.fn(async () => ({ success: true })),
  sendAccountDeletionConfirmationEmail: vi.fn(async () => ({ success: true })),
  sendJourneyEmail: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/warm-number-manager', () => ({
  recycleTwilioNumberToInventory: recycleMock,
  cleanupExcessInventory: vi.fn(async () => ({ success: true, numbersEligible: 0 })),
}))
vi.mock('@/lib/twilio-lifecycle-validator', () => ({
  validateTwilioNumberLifecycleMutation: vi.fn(async () => ({ valid: true })),
}))

import { deleteAccountLifecycle } from '../account-deletion-service'

const ctx = (over: Record<string, any> = {}) => ({
  userId: 'user_1',
  userEmail: 'test@example.com',
  deletionSource: 'self_service' as const,
  skipOffboardingEmails: true,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  state.businessRows = []
  state.memberships = []
  state.businessesError = null
  state.membershipsError = null
  state.deleteLeavesRow = false
  state.deletedBusinessIds = []
  state.authDeleteCalled = false
})

describe('Step 1 business discovery', () => {
  it('finds direct businesses.user_id ownership', async () => {
    state.businessRows = [{ ...DIRECT_BIZ }]

    const result = await deleteAccountLifecycle(ctx())

    expect(result.ok).toBe(true)
    expect(result.summary?.businessId).toBe('biz_direct')
    expect(state.deletedBusinessIds).toEqual(['biz_direct'])
    expect(state.authDeleteCalled).toBe(true)
  })

  it('finds a business owned only via owner membership', async () => {
    state.businessRows = [{ ...MEMBER_BIZ }]
    state.memberships = [{ business_id: 'biz_member', user_id: 'user_1', role: 'owner' }]

    const result = await deleteAccountLifecycle(ctx())

    expect(result.ok).toBe(true)
    expect(result.summary?.businessId).toBe('biz_member')
    expect(state.deletedBusinessIds).toEqual(['biz_member'])
    expect(state.authDeleteCalled).toBe(true)
  })

  it('deduplicates a business found through both paths', async () => {
    state.businessRows = [{ ...DIRECT_BIZ }]
    state.memberships = [{ business_id: 'biz_direct', user_id: 'user_1', role: 'owner' }]

    const result = await deleteAccountLifecycle(ctx())

    expect(result.ok).toBe(true)
    expect(result.summary?.tablesDeleted.businesses).toBe(1)
    expect(state.deletedBusinessIds).toEqual(['biz_direct'])
  })

  it('ignores non-owner memberships', async () => {
    state.businessRows = [{ ...MEMBER_BIZ }]
    state.memberships = [{ business_id: 'biz_member', user_id: 'user_1', role: 'member' }]

    const result = await deleteAccountLifecycle(ctx())

    expect(state.deletedBusinessIds).toEqual([])
  })

  it('fails closed when the direct-ownership query errors', async () => {
    state.businessRows = [{ ...DIRECT_BIZ }]
    state.businessesError = { code: '57014', message: 'query_canceled' }

    const result = await deleteAccountLifecycle(ctx())

    expect(result.ok).toBe(false)
    expect(result.step).toBe('fetch_businesses')
    expect(state.businessRows).toHaveLength(1)
    expect(state.authDeleteCalled).toBe(false)
  })

  it('fails closed when the membership query errors', async () => {
    state.businessRows = [{ ...MEMBER_BIZ }]
    state.membershipsError = { code: '57014', message: 'query_canceled' }

    const result = await deleteAccountLifecycle(ctx())

    expect(result.ok).toBe(false)
    expect(result.step).toBe('fetch_businesses')
    expect(state.authDeleteCalled).toBe(false)
  })
})

describe('Pre-auth-delete safety check', () => {
  it('refuses auth deletion while a businesses row still references the user', async () => {
    state.businessRows = [{ ...DIRECT_BIZ }]
    state.deleteLeavesRow = true

    const result = await deleteAccountLifecycle(ctx())

    expect(result.ok).toBe(false)
    expect(result.step).toBe('delete_auth_user')
    expect(state.authDeleteCalled).toBe(false)
  })
})

describe('targetBusinessId validation', () => {
  it('rejects a target business owned by a different user', async () => {
    state.businessRows = [{ ...DIRECT_BIZ }, { ...MEMBER_BIZ }]
    state.memberships = []

    const result = await deleteAccountLifecycle(ctx({ targetBusinessId: 'biz_member' }))

    expect(result.ok).toBe(false)
    expect(result.step).toBe('validate_target_business')
    expect(state.deletedBusinessIds).toEqual([])
    expect(state.authDeleteCalled).toBe(false)
  })

  it('rejects a target business that does not exist', async () => {
    state.businessRows = [{ ...DIRECT_BIZ }]

    const result = await deleteAccountLifecycle(ctx({ targetBusinessId: 'biz_missing' }))

    expect(result.ok).toBe(false)
    expect(result.step).toBe('validate_target_business')
    expect(state.authDeleteCalled).toBe(false)
  })

  it('accepts a target business owned via membership', async () => {
    state.businessRows = [{ ...DIRECT_BIZ }, { ...MEMBER_BIZ }]
    state.memberships = [{ business_id: 'biz_member', user_id: 'user_1', role: 'owner' }]

    const result = await deleteAccountLifecycle(ctx({ targetBusinessId: 'biz_member' }))

    expect(result.ok).toBe(true)
    expect(state.deletedBusinessIds.sort()).toEqual(['biz_direct', 'biz_member'].sort())
    expect(state.authDeleteCalled).toBe(true)
  })
})

describe('normal deletion and protected accounts', () => {
  it('recycles the assigned Twilio number, hard-deletes the business, then deletes auth', async () => {
    state.businessRows = [{ ...TWILIO_BIZ }]

    const result = await deleteAccountLifecycle(ctx())

    expect(result.ok).toBe(true)
    expect(recycleMock).toHaveBeenCalledWith('+15551234567', 'PN123', 'biz_twilio')
    expect(result.summary?.twilioNumberRecycled).toBe('+15551234567')
    expect(state.deletedBusinessIds).toEqual(['biz_twilio'])
    expect(state.businessRows).toHaveLength(0)
    expect(state.authDeleteCalled).toBe(true)
  })

  it('still blocks protected accounts before any destructive step', async () => {
    state.businessRows = [{ ...DIRECT_BIZ, is_protected_account: true }]

    const result = await deleteAccountLifecycle(ctx())

    expect(result.ok).toBe(false)
    expect(result.step).toBe('protected_account_check')
    expect(state.deletedBusinessIds).toEqual([])
    expect(state.authDeleteCalled).toBe(false)
  })
})
