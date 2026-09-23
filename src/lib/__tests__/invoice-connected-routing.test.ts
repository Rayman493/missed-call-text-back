import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { reconcileBillingInvoiceCheckout } from '@/lib/stripe/billing-checkout-reconciliation'

function makeContext(options: { expectedAccount?: string | null; eventAccount?: string | null; paymentStatus?: string; localStatus?: string } = {}) {
  const expectedAccount = options.expectedAccount === undefined ? 'acct_a' : options.expectedAccount
  const eventAccount = options.eventAccount === undefined ? expectedAccount : options.eventAccount
  let localStatus = options.localStatus || 'pending'
  let invoiceStatus = 'sent'
  const paymentRequest = {
    id: 'pr_1', lead_id: 'lead_1', business_id: 'biz_1', status: localStatus,
    amount_cents: 1111, currency: 'usd', stripe_connect_account_id: expectedAccount,
    stripe_payment_intent_id: 'pi_1',
  }
  const invoice = {
    id: 'inv_1', business_id: 'biz_1', customer_id: 'lead_1', total_cents: 1111,
    currency: 'usd', status: invoiceStatus,
  }
  const markProcessedFn = vi.fn()
  const stripe = {
    paymentIntents: {
      retrieve: vi.fn(async () => ({ id: 'pi_1', status: 'succeeded', amount: 1111, currency: 'usd', metadata: {} })),
    },
  }
  const supabase = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn((column: string, value: string) => {
          const chain: any = {
            eq: vi.fn(() => chain),
            single: vi.fn(async () => {
              if (table === 'payment_requests') return { data: { ...paymentRequest, status: localStatus }, error: null }
              if (table === 'leads') return { data: { id: 'lead_1', status: 'payment_requested', caller_phone: null }, error: null }
              return { data: null, error: null }
            }),
            maybeSingle: vi.fn(async () => {
              if (table === 'billing_documents') return { data: { ...invoice, status: invoiceStatus }, error: null }
              if (table === 'businesses') return { data: { id: 'biz_1', stripe_connect_account_id: expectedAccount }, error: null }
              return { data: null, error: null }
            }),
          }
          return chain
        }),
        limit: vi.fn(() => ({ single: vi.fn(async () => ({ data: { paid_at: null }, error: null })) })),
      })),
      update: vi.fn((payload: any) => ({
        eq: vi.fn(() => {
          if (table === 'payment_requests' && payload.status) localStatus = payload.status
          if (table === 'billing_documents' && payload.status) invoiceStatus = payload.status
          const result: any = Promise.resolve({ error: null })
          result.select = vi.fn(() => ({
            single: vi.fn(async () => ({ data: { ...paymentRequest, ...payload }, error: null })),
          }))
          return result
        }),
      })),
    })),
  }
  const session = {
    id: 'cs_1', payment_intent: 'pi_1', payment_status: options.paymentStatus || 'paid',
    amount_total: 1111, currency: 'usd',
    metadata: { source: 'billing_invoice', payment_request_id: 'pr_1', business_id: 'biz_1', lead_id: 'lead_1', invoice_id: 'inv_1' },
  } as any
  const run = () => reconcileBillingInvoiceCheckout({
    supabase: supabase as any,
    stripe: stripe as any,
    session,
    eventId: 'evt_1',
    eventAccountId: eventAccount,
    reconstructFn: vi.fn(),
    markProcessedFn,
  })
  return { run, stripe, markProcessedFn, getStatus: () => ({ localStatus, invoiceStatus }) }
}

describe('invoice connected-account webhook reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks a connected-account invoice paid without a customer success-page return', async () => {
    const ctx = makeContext()
    await ctx.run()
    expect(ctx.stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_1', {}, { stripeAccount: 'acct_a' })
    expect(ctx.getStatus()).toEqual({ localStatus: 'paid', invoiceStatus: 'paid' })
    expect(ctx.markProcessedFn).toHaveBeenCalledWith(expect.anything(), 'evt_1')
  })

  it('rejects an event delivered for the wrong connected account', async () => {
    const ctx = makeContext({ expectedAccount: 'acct_a', eventAccount: 'acct_b' })
    await ctx.run()
    expect(ctx.stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(ctx.getStatus()).toEqual({ localStatus: 'pending', invoiceStatus: 'sent' })
    expect(ctx.markProcessedFn).toHaveBeenCalled()
  })

  it('keeps historical platform-account invoice events compatible', async () => {
    const ctx = makeContext({ expectedAccount: null, eventAccount: null })
    await ctx.run()
    expect(ctx.stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_1', {}, undefined)
    expect(ctx.getStatus()).toEqual({ localStatus: 'paid', invoiceStatus: 'paid' })
  })

  it('does not mark unpaid Checkout complete events as paid', async () => {
    const ctx = makeContext({ paymentStatus: 'unpaid' })
    await ctx.run()
    expect(ctx.getStatus()).toEqual({ localStatus: 'pending', invoiceStatus: 'sent' })
  })

  it('handles duplicate delivery idempotently', async () => {
    const ctx = makeContext()
    await ctx.run()
    await ctx.run()
    expect(ctx.getStatus()).toEqual({ localStatus: 'paid', invoiceStatus: 'paid' })
    expect(paymentCompleted).toHaveBeenCalledTimes(1)
    expect(notifyPaymentCompleted).toHaveBeenCalledTimes(1)
    expect(ctx.markProcessedFn).toHaveBeenCalledTimes(2)
  })
})
