import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Stripe
const mockSession = { id: 'cs_test_123', url: 'https://checkout.stripe.com/test', payment_intent: 'pi_test_123' }
const mockPaymentIntentsUpdate = vi.fn().mockResolvedValue({})
const mockStripe = {
  checkout: { sessions: { create: vi.fn().mockResolvedValue(mockSession) } },
  paymentIntents: { update: mockPaymentIntentsUpdate },
}

vi.mock('@/lib/stripe', () => ({
  default: () => mockStripe,
}))

// Mock supabase
function makeMockSupabase(invoice: any, existingPr: any | null, insertResult: any) {
  const updates: Record<string, any> = {}
  return {
    _updates: updates,
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: existingPr, error: null })),
          single: vi.fn(async () => ({ data: invoice, error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => insertResult),
        })),
      })),
      update: vi.fn((payload: any) => ({
        eq: vi.fn((col: string, val: string) => {
          updates[`${table}.${col}=${val}`] = payload
          return { eq: vi.fn(() => ({ error: null })) }
        }),
      })),
    })),
  }
}

import { prepareInvoicePayment } from '../billing/prepare-payment'

describe('prepareInvoicePayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns alreadyPaid for a paid invoice', async () => {
    const supabase = makeMockSupabase({ status: 'paid' }, null, null)
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: 'lead_1',
      status: 'paid',
      payment_request_id: null,
    })
    expect(result.ok).toBe(true)
    expect(result.alreadyPaid).toBe(true)
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('reuses an existing pending payment request (idempotent)', async () => {
    const supabase = makeMockSupabase(
      { status: 'sent', payment_request_id: 'pr_1' },
      { id: 'pr_1', checkout_url: 'https://checkout.stripe.com/existing', status: 'pending' },
      null
    )
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: 'lead_1',
      status: 'sent',
      payment_request_id: 'pr_1',
    })
    expect(result.ok).toBe(true)
    expect(result.idempotent).toBe(true)
    expect(result.checkout_url).toBe('https://checkout.stripe.com/existing')
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('creates a new Stripe Checkout session and payment request', async () => {
    const supabase = makeMockSupabase(
      { status: 'sent', payment_request_id: null },
      null,
      { data: { id: 'pr_new', checkout_url: 'https://checkout.stripe.com/new', status: 'pending' }, error: null }
    )
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: 'lead_1',
      status: 'sent',
      payment_request_id: null,
    }, 'user_1')
    expect(result.ok).toBe(true)
    expect(result.checkout_url).toBe('https://checkout.stripe.com/test')
    expect(result.payment_request_id).toBe('pr_new')
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1)
    expect(mockPaymentIntentsUpdate).toHaveBeenCalledTimes(1)
  })

  it('fails when invoice has no customer', async () => {
    const supabase = makeMockSupabase({ status: 'sent' }, null, null)
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: null,
      status: 'sent',
      payment_request_id: null,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('customer')
  })

  it('reconciles when existing payment request is already paid', async () => {
    const supabase = makeMockSupabase(
      { status: 'sent', payment_request_id: 'pr_1' },
      { id: 'pr_1', checkout_url: null, status: 'paid' },
      null
    )
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: 'lead_1',
      status: 'sent',
      payment_request_id: 'pr_1',
    })
    expect(result.ok).toBe(true)
    expect(result.alreadyPaid).toBe(true)
  })
})
