/**
 * PI-B1 regression tests — ensurePaymentCompletedSideEffects.
 *
 * Covers the canonical payment-completion side-effect helper that every
 * authoritative paid-transition path now funnels through:
 *   - linked invoice -> paid (+paid_at) only when business/amount/currency match
 *   - lead payment_status + lifecycle status via applyCustomerStatusEvent
 *   - paymentCompleted timeline event
 *   - payment_completed notification (idempotency identity: pay_{id})
 *   - no-ops on non-paid requests; safe on repeat/concurrent invocation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'

const tables: Record<string, any[]> = {}
const updates: Array<{ table: string; payload: any; filters: Record<string, any>; neqFilters: Record<string, any>; matched: number }> = []

function makeQueryBuilder(table: string) {
  const state = {
    filters: {} as Record<string, any>,
    neqFilters: {} as Record<string, any>,
    action: 'select' as 'select' | 'update',
    payload: null as any,
  }
  const matchingRows = () =>
    (tables[table] || []).filter(
      (r) =>
        Object.entries(state.filters).every(([k, v]) => r[k] === v) &&
        Object.entries(state.neqFilters).every(([k, v]) => r[k] !== v)
    )
  const builder: any = {
    select: () => builder,
    update: (payload: any) => {
      state.action = 'update'
      state.payload = payload
      return builder
    },
    eq: (col: string, val: any) => {
      state.filters[col] = val
      return builder
    },
    neq: (col: string, val: any) => {
      state.neqFilters[col] = val
      return builder
    },
    is: (col: string, val: any) => {
      state.filters[col] = val
      return builder
    },
    maybeSingle: async () => ({ data: matchingRows()[0] ?? null, error: null }),
    single: async () => {
      const rows = matchingRows()
      return rows.length === 1
        ? { data: rows[0], error: null }
        : { data: rows[0] ?? null, error: rows.length === 0 ? { code: 'PGRST116' } : null }
    },
    then: (resolve: any) => {
      if (state.action === 'update') {
        const matched = matchingRows()
        matched.forEach((r) => Object.assign(r, state.payload))
        updates.push({ table, payload: state.payload, filters: state.filters, neqFilters: state.neqFilters, matched: matched.length })
        return Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return Promise.resolve({ data: matchingRows(), error: null }).then(resolve)
    },
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => makeQueryBuilder(t) },
}))
vi.mock('@/lib/event-timeline', () => ({
  timelineEvents: { paymentCompleted: vi.fn(async () => {}) },
}))
vi.mock('@/lib/notifications-server', () => ({
  notificationServiceServer: { notifyPaymentCompleted: vi.fn(async () => true) },
}))
vi.mock('@/lib/customer-context', () => ({
  getCanonicalCustomerDisplayName: vi.fn(() => 'Jane Customer'),
}))

const BUSINESS = 'biz-1'
const OTHER_BUSINESS = 'biz-2'
const LEAD = 'lead-1'
const PR_ID = 'pr-1'
const INVOICE_ID = 'inv-1'

function seedPaidPaymentRequest(overrides: Record<string, any> = {}) {
  tables.payment_requests = [{
    id: PR_ID,
    business_id: BUSINESS,
    lead_id: LEAD,
    status: 'paid',
    amount_cents: 5000,
    currency: 'usd',
    paid_at: '2026-10-06T00:00:00Z',
    ...overrides,
  }]
}

function seedInvoice(overrides: Record<string, any> = {}) {
  tables.billing_documents = [{
    id: INVOICE_ID,
    business_id: BUSINESS,
    customer_id: LEAD,
    document_type: 'invoice',
    payment_request_id: PR_ID,
    total_cents: 5000,
    currency: 'usd',
    status: 'sent',
    ...overrides,
  }]
}

function seedLead(overrides: Record<string, any> = {}) {
  tables.leads = [{
    id: LEAD,
    business_id: BUSINESS,
    status: 'payment_requested',
    caller_phone: '+15551234567',
    contact_name: 'Jane',
    name: null,
    raw_metadata: null,
    ...overrides,
  }]
}

describe('ensurePaymentCompletedSideEffects (PI-B1)', () => {
  beforeEach(() => {
    Object.keys(tables).forEach((k) => delete tables[k])
    updates.length = 0
    vi.clearAllMocks()
  })

  it('transitions a linked sent invoice to paid with paid_at when business/amount/currency match', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    seedInvoice()
    seedLead()

    await ensurePaymentCompletedSideEffects(PR_ID)

    const invoice = tables.billing_documents[0]
    expect(invoice.status).toBe('paid')
    expect(invoice.paid_at).toBe('2026-10-06T00:00:00Z')
  })

  it('reconciles lead payment_status and lifecycle status (payment_requested → paid)', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    seedInvoice()
    seedLead()

    await ensurePaymentCompletedSideEffects(PR_ID)

    const lead = tables.leads[0]
    expect(lead.payment_status).toBe('paid')
    expect(lead.last_payment_paid_at).toBe('2026-10-06T00:00:00Z')
    expect(lead.status).toBe('paid')
  })

  it('emits paymentCompleted timeline event and payment_completed notification with pay_{id} identity', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    seedLead()

    await ensurePaymentCompletedSideEffects(PR_ID)

    expect(timelineEvents.paymentCompleted).toHaveBeenCalledWith(BUSINESS, LEAD, PR_ID, 5000)
    // 6th arg is paymentId → notifications-server derives idempotency key pay_{paymentId}
    expect(notificationServiceServer.notifyPaymentCompleted).toHaveBeenCalledWith(
      BUSINESS, LEAD, '+15551234567', 5000, PR_ID, 'Jane Customer'
    )
  })

  it('no-ops when the payment request is not paid', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest({ status: 'pending' })
    seedInvoice()
    seedLead()

    await ensurePaymentCompletedSideEffects(PR_ID)

    expect(tables.billing_documents[0].status).toBe('sent')
    expect(tables.leads[0].status).toBe('payment_requested')
    expect(updates.filter((u) => u.table === 'billing_documents')).toHaveLength(0)
    expect(updates.filter((u) => u.table === 'leads')).toHaveLength(0)
    expect(notificationServiceServer.notifyPaymentCompleted).not.toHaveBeenCalled()
  })

  it('does not mutate a linked invoice belonging to a different business', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    seedInvoice({ business_id: OTHER_BUSINESS })
    seedLead()

    await ensurePaymentCompletedSideEffects(PR_ID)

    expect(tables.billing_documents[0].status).toBe('sent')
    expect(updates.filter((u) => u.table === 'billing_documents')).toHaveLength(0)
  })

  it('does not mutate a linked invoice whose amount differs from the payment', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    seedInvoice({ total_cents: 9999 })
    seedLead()

    await ensurePaymentCompletedSideEffects(PR_ID)

    expect(tables.billing_documents[0].status).toBe('sent')
    expect(updates.filter((u) => u.table === 'billing_documents')).toHaveLength(0)
  })

  it('does not mutate a linked invoice whose currency differs from the payment', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    seedInvoice({ currency: 'eur' })
    seedLead()

    await ensurePaymentCompletedSideEffects(PR_ID)

    expect(tables.billing_documents[0].status).toBe('sent')
  })

  it('repairs an already-paid request missing the invoice side effect (webhook-after-reconcile race)', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    // Simulate: reconcile path already set PR paid, invoice never reconciled
    seedPaidPaymentRequest()
    seedInvoice({ status: 'sent' })
    seedLead({ status: 'new' })

    await ensurePaymentCompletedSideEffects(PR_ID)

    expect(tables.billing_documents[0].status).toBe('paid')
    expect(tables.leads[0].status).toBe('paid')
    expect(notificationServiceServer.notifyPaymentCompleted).toHaveBeenCalledTimes(1)
  })

  it('is idempotent on repeat invocation — invoice stays paid, notification uses the same dedupe identity', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    seedInvoice()
    seedLead()

    await ensurePaymentCompletedSideEffects(PR_ID)
    await ensurePaymentCompletedSideEffects(PR_ID)

    // Second call sees invoice already paid → no second invoice update issued
    const invoiceUpdates = updates.filter((u) => u.table === 'billing_documents')
    expect(invoiceUpdates).toHaveLength(1)

    // Both calls use the same paymentId → the (business_id, type,
    // 'pay_{paymentId}') unique constraint arbitrates exactly one notification row
    const calls = vi.mocked(notificationServiceServer.notifyPaymentCompleted).mock.calls
    expect(calls.every((c) => c[4] === PR_ID)).toBe(true)
    expect(tables.billing_documents[0].status).toBe('paid')
  })

  it('concurrent invocations use the same notification dedupe identity', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    seedInvoice()
    seedLead()

    await Promise.all([
      ensurePaymentCompletedSideEffects(PR_ID),
      ensurePaymentCompletedSideEffects(PR_ID),
    ])

    const calls = vi.mocked(notificationServiceServer.notifyPaymentCompleted).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls.every((c) => c[4] === PR_ID && c[0] === BUSINESS)).toBe(true)
    expect(tables.billing_documents[0].status).toBe('paid')
  })

  it('does not update a lead belonging to a different business', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    seedLead({ business_id: OTHER_BUSINESS })

    await ensurePaymentCompletedSideEffects(PR_ID)

    expect(tables.leads[0].status).toBe('payment_requested')
    expect(updates.filter((u) => u.table === 'leads')).toHaveLength(0)
  })

  it('never overrides protected lead statuses (cancelled stays cancelled)', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    seedLead({ status: 'cancelled' })

    await ensurePaymentCompletedSideEffects(PR_ID)

    expect(tables.leads[0].status).toBe('cancelled')
    expect(tables.leads[0].payment_status).toBe('paid')
  })

  it('still notifies when the lead row is missing (notification payload uses payment request data)', async () => {
    const { ensurePaymentCompletedSideEffects } = await import('../completion-side-effects')
    seedPaidPaymentRequest()
    tables.leads = []

    await ensurePaymentCompletedSideEffects(PR_ID)

    expect(notificationServiceServer.notifyPaymentCompleted).toHaveBeenCalledWith(
      BUSINESS, LEAD, '', 5000, PR_ID, undefined
    )
  })
})
