/**
 * Regression tests for account deletion Step 16 (stripe_webhook_events).
 *
 * Proven production failure: the lifecycle aborted with
 *   42501 permission denied for table stripe_webhook_events
 * leaving the account half-deleted (messages/conversations/etc. already
 * removed).
 *
 * Policy: stripe_webhook_events is a service-owned webhook idempotency ledger
 * keyed by UNIQUE event_id — the rows are the dedupe anchor for Stripe
 * redeliveries and carry no customer PII. Step 16 ANONYMIZES business_id and
 * RETAINS the event_id records (never deletes them). A missing table
 * (PGRST205) or a missing service-role table grant (42501) must skip cleanup
 * and continue — full retention is the desired posture anyway — while
 * genuine errors still fail closed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const BUSINESS = {
  id: 'biz_1',
  user_id: 'user_1',
  name: 'Test Biz',
  twilio_phone_number_sid: null,
  twilio_phone_number: null,
  stripe_subscription_id: null,
  stripe_customer_id: null,
  subscription_status: null,
  subscription_provider: null,
  is_protected_account: false,
  business_phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
  trial_ends_at: null,
  provisioning_status: null,
}

const state = {
  sweError: null as any,
  deletedTables: [] as string[],
  authDeleteCalled: false,
}

function tableHandler(table: string) {
  if (table === 'businesses') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: [BUSINESS], error: null })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async () => {
          state.deletedTables.push('businesses')
          return { error: null }
        }),
      })),
    }
  }

  if (table === 'leads') {
    return {
      select: vi.fn(() => ({
        in: vi.fn(async () => ({ data: [], error: null })),
      })),
      delete: vi.fn(() => ({
        in: vi.fn(() => ({
          select: vi.fn(async () => {
            state.deletedTables.push('leads')
            return { error: null, count: 0 }
          }),
        })),
      })),
    }
  }

  if (table === 'stripe_webhook_events') {
    return {
      update: vi.fn((payload: any) => {
        if (!state.sweError) state.deletedTables.push(`stripe_webhook_events:${JSON.stringify(payload)}`)
        return {
          in: vi.fn(() => ({
            select: vi.fn(async () => ({ error: state.sweError, count: state.sweError ? null : 0 })),
          })),
        }
      }),
    }
  }

  // Generic business-scoped deletable table (notifications, follow_up_jobs,
  // conversations, ai_call_*, voicemail_recordings, call_events,
  // calendar_integrations, ignored_contacts, tasks, jobs, ...)
  return {
    select: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: [], error: null })),
      in: vi.fn(async () => ({ data: [], error: null })),
    })),
    delete: vi.fn(() => ({
      in: vi.fn(() => ({
        select: vi.fn(async () => {
          state.deletedTables.push(table)
          return { error: null, count: 0 }
        }),
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
  recycleTwilioNumberToInventory: vi.fn(async () => ({ success: true })),
  cleanupExcessInventory: vi.fn(async () => ({ success: true, numbersEligible: 0 })),
}))
vi.mock('@/lib/twilio-lifecycle-validator', () => ({
  validateTwilioNumberLifecycleMutation: vi.fn(async () => ({ valid: true })),
}))

import { deleteAccountLifecycle } from '../account-deletion-service'

const ctx = {
  userId: 'user_1',
  userEmail: 'test@example.com',
  deletionSource: 'self_service' as const,
  skipOffboardingEmails: true,
}

describe('deleteAccountLifecycle — stripe_webhook_events cleanup (Step 16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.sweError = null
    state.deletedTables = []
    state.authDeleteCalled = false
  })

  it('continues the lifecycle when the service-role grant is missing (42501)', async () => {
    state.sweError = { code: '42501', message: 'permission denied for table stripe_webhook_events' }

    const result = await deleteAccountLifecycle(ctx)

    expect(result.ok).toBe(true)
    expect(result.summary?.tablesDeleted.stripe_webhook_events).toBe(0)
    expect((result.summary as any)?.stripeWebhookEventsCleanup).toBe('skipped_insufficient_privilege')
    // Lifecycle completed: later deletes ran and the auth user was deleted.
    expect(state.deletedTables).toContain('jobs')
    expect(state.deletedTables).toContain('leads')
    expect(state.deletedTables).toContain('businesses')
    expect(state.authDeleteCalled).toBe(true)
  })

  it('continues the lifecycle when the table does not exist (PGRST205)', async () => {
    state.sweError = { code: 'PGRST205', message: "Could not find the table 'public.stripe_webhook_events' in the schema cache" }

    const result = await deleteAccountLifecycle(ctx)

    expect(result.ok).toBe(true)
    expect(state.authDeleteCalled).toBe(true)
  })

  it('anonymizes business_id and retains the event_id dedupe records', async () => {
    const result = await deleteAccountLifecycle(ctx)

    expect(result.ok).toBe(true)
    expect(result.summary?.tablesDeleted.stripe_webhook_events).toBe(0)
    // UPDATE { business_id: null } — never DELETE — so event_id rows survive.
    expect(state.deletedTables).toContain('stripe_webhook_events:{"business_id":null}')
    expect((result.summary as any)?.stripeWebhookEventsCleanup).toBe('anonymized')
  })

  it('still fails closed on a genuine Step 16 error', async () => {
    state.sweError = { code: '57014', message: 'query_canceled' }

    const result = await deleteAccountLifecycle(ctx)

    expect(result.ok).toBe(false)
    expect(result.step).toBe('delete_stripe_webhook_events')
    expect(state.authDeleteCalled).toBe(false)
  })
})
