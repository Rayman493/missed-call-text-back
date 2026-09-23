import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const { paymentCompleted, notifyPaymentCompleted } = vi.hoisted(() => ({
  paymentCompleted: vi.fn(),
  notifyPaymentCompleted: vi.fn(),
}))

vi.mock('@/lib/event-timeline', () => ({
  timelineEvents: { paymentCompleted },
}))
vi.mock('@/lib/notifications-server', () => ({
  notificationServiceServer: { notifyPaymentCompleted },
}))

import {
  isPaymentRequestCheckoutSession,
  reconcilePaymentRequestCheckout,
} from '@/lib/stripe/billing-checkout-reconciliation'

interface FixtureOptions {
  paymentStatus?: string
  paymentIntentStatus?: string
  eventAccount?: string | null
  expectedAccount?: string | null
  amountCents?: number
  sessionAmount?: number
  currency?: string
  sessionCurrency?: string
  localStatus?: string
  leadBusinessId?: string
  paymentRequestExists?: boolean
  paymentIntentMetadataRequestId?: string
  paymentIntentFails?: boolean
}

function makeFixture(options: FixtureOptions = {}) {
  const expectedAccount = options.expectedAccount === undefined ? 'acct_connected' : options.expectedAccount
  const eventAccount = options.eventAccount === undefined ? expectedAccount : options.eventAccount
  const amountCents = options.amountCents ?? 150
  const currency = options.currency ?? 'usd'
  let localStatus = options.localStatus ?? 'pending'
  const paymentRequest = {
    id: 'pr_regular',
    lead_id: 'lead_1',
    business_id: 'biz_1',
    status: localStatus,
    amount_cents: amountCents,
    currency,
    stripe_connect_account_id: expectedAccount,
    stripe_payment_intent_id: 'pi_regular',
  }
  const markProcessedFn = vi.fn(async () => true)
  const stripe = {
    paymentIntents: {
      retrieve: vi.fn(async () => {
        if (options.paymentIntentFails) throw new Error('Stripe unavailable')
        return {
          id: 'pi_regular',
          status: options.paymentIntentStatus ?? 'succeeded',
          amount: options.sessionAmount ?? amountCents,
          currency: options.sessionCurrency ?? currency,
          metadata: {
            payment_request_id: options.paymentIntentMetadataRequestId === undefined
              ? 'pr_regular'
              : options.paymentIntentMetadataRequestId,
            business_id: 'biz_1',
            lead_id: 'lead_1',
          },
        }
      }),
    },
  }
  const supabase = {
    from: vi.fn((table: string) => ({
      select: vi.fn((fields?: string) => ({
        eq: vi.fn(() => {
          const chain: any = {
            eq: vi.fn(() => chain),
            single: vi.fn(async () => {
              if (table === 'payment_requests') {
                if (options.paymentRequestExists === false) return { data: null, error: { code: 'PGRST116' } }
                return { data: { ...paymentRequest, status: localStatus }, error: null }
              }
              return { data: null, error: null }
            }),
            maybeSingle: vi.fn(async () => {
              if (table === 'billing_documents') return { data: null, error: null }
              if (table === 'businesses') return { data: { id: 'biz_1', stripe_connect_account_id: expectedAccount }, error: null }
              if (table === 'leads') return { data: { id: 'lead_1', business_id: options.leadBusinessId ?? 'biz_1', status: 'payment_requested', caller_phone: '+15550001111' }, error: null }
              if (table === 'payment_requests' && fields === 'status') return { data: { status: localStatus }, error: null }
              return { data: null, error: null }
            }),
          }
          return chain
        }),
        limit: vi.fn(() => ({ single: vi.fn(async () => ({ data: { paid_at: null }, error: null })) })),
      })),
      update: vi.fn((payload: any) => ({
        eq: vi.fn(() => ({
          neq: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                if (table === 'payment_requests' && localStatus === 'paid') return { data: null, error: null }
                if (table === 'payment_requests' && payload.status) localStatus = payload.status
                return { data: { ...paymentRequest, ...payload, status: localStatus }, error: null }
              }),
            })),
          })),
          then: (resolve: any) => {
            if (table === 'payment_requests' && payload.status) localStatus = payload.status
            return Promise.resolve({ error: null }).then(resolve)
          },
        })),
      })),
    })),
  }
  const session = {
    id: 'cs_regular',
    mode: 'payment',
    customer: null,
    payment_intent: 'pi_regular',
    payment_status: options.paymentStatus ?? 'paid',
    amount_total: options.sessionAmount ?? amountCents,
    currency: options.sessionCurrency ?? currency,
    metadata: {},
  } as any
  const run = () => reconcilePaymentRequestCheckout({
    supabase: supabase as any,
    stripe: stripe as any,
    session,
    eventId: 'evt_regular',
    eventAccountId: eventAccount,
    reconstructFn: vi.fn(async () => ({ success: false, error: 'not an invoice checkout' })),
    markProcessedFn,
  })
  return { run, stripe, markProcessedFn, getStatus: () => localStatus }
}

describe('ordinary Payment Request checkout webhook reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dispatches one-time Checkout Sessions without requiring a Stripe customer', () => {
    expect(isPaymentRequestCheckoutSession({ mode: 'payment', metadata: {} } as any)).toBe(true)
    expect(isPaymentRequestCheckoutSession({ mode: 'subscription', metadata: {}, customer: 'cus_1' } as any)).toBe(false)
  })

  it('marks a connected-account payment paid with Session.customer = null and no browser return', async () => {
    const ctx = makeFixture()
    const result = await ctx.run()
    expect(result.status).toBe('processed')
    expect(ctx.stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_regular', {}, { stripeAccount: 'acct_connected' })
    expect(ctx.getStatus()).toBe('paid')
    expect(paymentCompleted).toHaveBeenCalledTimes(1)
    expect(notifyPaymentCompleted).toHaveBeenCalledTimes(1)
    expect(ctx.markProcessedFn).toHaveBeenCalledWith(expect.anything(), 'evt_regular')
  })

  it('rejects a paid Session delivered for the wrong connected account', async () => {
    const ctx = makeFixture({ eventAccount: 'acct_other' })
    const result = await ctx.run()
    expect(result).toMatchObject({ status: 'processed', reason: 'stripe_account_mismatch' })
    expect(ctx.getStatus()).toBe('pending')
    expect(paymentCompleted).not.toHaveBeenCalled()
  })

  it('does not create or pay a missing Payment Request', async () => {
    const ctx = makeFixture({ paymentRequestExists: false })
    const result = await ctx.run()
    expect(result).toMatchObject({ status: 'processed', reason: 'payment_request_not_found' })
    expect(ctx.getStatus()).toBe('pending')
  })

  it('rejects conflicting Payment Request identity from PaymentIntent metadata', async () => {
    const ctx = makeFixture({ paymentIntentMetadataRequestId: 'pr_other' })
    const result = await ctx.run()
    expect(result).toMatchObject({ status: 'processed', reason: 'payment_request_identity_mismatch' })
    expect(ctx.getStatus()).toBe('pending')
  })

  it('rejects a Payment Request whose lead belongs to another business', async () => {
    const ctx = makeFixture({ leadBusinessId: 'biz_other' })
    const result = await ctx.run()
    expect(result).toMatchObject({ status: 'processed', reason: 'lead_ownership_mismatch' })
    expect(ctx.getStatus()).toBe('pending')
  })

  it('rejects amount and currency mismatches', async () => {
    const amountCtx = makeFixture({ sessionAmount: 151 })
    await expect(amountCtx.run()).resolves.toMatchObject({ reason: 'amount_mismatch' })
    expect(amountCtx.getStatus()).toBe('pending')

    const currencyCtx = makeFixture({ sessionCurrency: 'eur' })
    await expect(currencyCtx.run()).resolves.toMatchObject({ reason: 'currency_mismatch' })
    expect(currencyCtx.getStatus()).toBe('pending')
  })

  it('does not mark unpaid Checkout or unsuccessful PaymentIntents as paid', async () => {
    const unpaid = makeFixture({ paymentStatus: 'unpaid' })
    await expect(unpaid.run()).resolves.toMatchObject({ reason: 'checkout_not_paid' })
    expect(unpaid.getStatus()).toBe('pending')

    const incomplete = makeFixture({ paymentIntentStatus: 'processing' })
    await expect(incomplete.run()).resolves.toMatchObject({ reason: 'payment_intent_not_succeeded' })
    expect(incomplete.getStatus()).toBe('pending')
  })

  it('handles duplicate webhook delivery idempotently', async () => {
    const ctx = makeFixture()
    await ctx.run()
    await ctx.run()
    expect(ctx.getStatus()).toBe('paid')
    expect(paymentCompleted).toHaveBeenCalledTimes(1)
    expect(notifyPaymentCompleted).toHaveBeenCalledTimes(1)
  })

  it('treats a reconciliation/browser race that reaches paid first as idempotent', async () => {
    const ctx = makeFixture()
    await ctx.run()
    const raced = await ctx.run()
    expect(raced).toMatchObject({ status: 'processed', reason: 'already_paid' })
    expect(paymentCompleted).toHaveBeenCalledTimes(1)
  })

  it('does not mutate a payment already marked paid', async () => {
    const ctx = makeFixture({ localStatus: 'paid' })
    const result = await ctx.run()
    expect(result).toMatchObject({ status: 'processed', reason: 'already_paid' })
    expect(paymentCompleted).not.toHaveBeenCalled()
    expect(notifyPaymentCompleted).not.toHaveBeenCalled()
  })

  it('returns retryable instead of acknowledging a transient Stripe lookup failure', async () => {
    const ctx = makeFixture({ paymentIntentFails: true })
    const result = await ctx.run()
    expect(result).toMatchObject({ status: 'retryable', reason: 'payment_intent_retrieval_failed' })
    expect(ctx.markProcessedFn).not.toHaveBeenCalled()
    expect(ctx.getStatus()).toBe('pending')
  })

  it('keeps ordinary Payment Request creation on connected-account payment Checkout', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/app/api/payments/create/route.ts'), 'utf8')
    expect(source).toContain("mode: 'payment'")
    expect(source).toContain('payment_intent_data')
    expect(source).toContain('stripeAccount: business.stripe_connect_account_id')
    expect(source).toContain('payment_request_id: paymentRequest.id')
  })
})
