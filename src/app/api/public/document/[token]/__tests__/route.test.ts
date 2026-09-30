/**
 * PI-B3 regression tests — public document payment state.
 *
 * The hosted invoice page previously rendered "Payment is being prepared.
 * Please check back shortly." whenever payment_url was null — including when
 * the linked payment request was terminal (cancelled/expired/failed), which
 * is false. The public response now exposes a coarse payment_state so the
 * page can render honest copy without leaking Stripe internals.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const billingDocs: any[] = []
const paymentRequests: any[] = []

function docQuery() {
  const state = { filters: {} as Record<string, any> }
  const b: any = {
    select: () => b,
    eq: (c: string, v: any) => { state.filters[c] = v; return b },
    single: async () => ({
      data: billingDocs.find((d) => Object.entries(state.filters).every(([k, v]) => d[k] === v)) ?? null,
      error: null,
    }),
    maybeSingle: async () => ({
      data: billingDocs.find((d) => Object.entries(state.filters).every(([k, v]) => d[k] === v)) ?? null,
      error: null,
    }),
  }
  return b
}

function prQuery() {
  const state = { filters: {} as Record<string, any> }
  const b: any = {
    select: () => b,
    eq: (c: string, v: any) => { state.filters[c] = v; return b },
    maybeSingle: async () => ({
      data: paymentRequests.find((p) => Object.entries(state.filters).every(([k, v]) => p[k] === v)) ?? null,
      error: null,
    }),
    single: async () => ({
      data: paymentRequests.find((p) => Object.entries(state.filters).every(([k, v]) => p[k] === v)) ?? null,
      error: null,
    }),
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => (table === 'payment_requests' ? prQuery() : docQuery()),
  }),
}))

vi.mock('@/lib/billing/document-builder', () => ({
  buildDocumentPresentation: vi.fn(async (_s: any, doc: any) => ({
    id: doc.id,
    document_type: doc.document_type,
    status: doc.status,
    document_number: doc.document_number,
  })),
}))

const TOKEN = 'a'.repeat(48)

function seedDoc(overrides: Record<string, any> = {}) {
  billingDocs.push({
    id: 'doc-1',
    business_id: 'biz-1',
    customer_id: 'lead-1',
    document_type: 'invoice',
    status: 'sent',
    document_number: 'INV-1001',
    public_token: TOKEN,
    payment_request_id: 'pr-1',
    ...overrides,
  })
}

function seedPr(overrides: Record<string, any> = {}) {
  paymentRequests.push({
    id: 'pr-1',
    status: 'pending',
    checkout_url: 'https://checkout.stripe.com/c/pay/test',
    stripe_connect_account_id: 'acct_123',
    ...overrides,
  })
}

async function callGet(token: string = TOKEN) {
  const { GET } = await import('../route')
  const res = await GET(new Request(`http://localhost/api/public/document/${token}`), {
    params: Promise.resolve({ token }),
  } as any)
  return { status: res.status, json: await res.json() }
}

describe('GET /api/public/document/[token] — payment_state (PI-B3)', () => {
  beforeEach(() => {
    billingDocs.length = 0
    paymentRequests.length = 0
    vi.clearAllMocks()
  })

  it('pending Stripe payment request → payment_state=pending and payment_url present', async () => {
    seedDoc()
    seedPr()
    const { status, json } = await callGet()
    expect(status).toBe(200)
    expect(json.payment_state).toBe('pending')
    expect(json.payment_url).toBe('https://checkout.stripe.com/c/pay/test')
  })

  it('cancelled payment request → payment_state=terminal, no payment_url', async () => {
    seedDoc()
    seedPr({ status: 'cancelled' })
    const { json } = await callGet()
    expect(json.payment_state).toBe('terminal')
    expect(json.payment_url).toBeNull()
  })

  it('canceled (US spelling) payment request → payment_state=terminal', async () => {
    seedDoc()
    seedPr({ status: 'canceled' })
    const { json } = await callGet()
    expect(json.payment_state).toBe('terminal')
  })

  it('expired payment request → payment_state=terminal', async () => {
    seedDoc()
    seedPr({ status: 'expired' })
    const { json } = await callGet()
    expect(json.payment_state).toBe('terminal')
  })

  it('failed payment request → payment_state=terminal', async () => {
    seedDoc()
    seedPr({ status: 'failed' })
    const { json } = await callGet()
    expect(json.payment_state).toBe('terminal')
  })

  it('paid payment request → payment_state=paid, no payment_url', async () => {
    seedDoc()
    seedPr({ status: 'paid', checkout_url: null })
    const { json } = await callGet()
    expect(json.payment_state).toBe('paid')
    expect(json.payment_url).toBeNull()
  })

  it('pending payment request without a usable checkout link → payment_state=preparing', async () => {
    seedDoc()
    seedPr({ checkout_url: null })
    const { json } = await callGet()
    expect(json.payment_state).toBe('preparing')
    expect(json.payment_url).toBeNull()
  })

  it('pending payment request without connect account → payment_state=preparing (not payable)', async () => {
    seedDoc()
    seedPr({ stripe_connect_account_id: null })
    const { json } = await callGet()
    expect(json.payment_state).toBe('preparing')
    expect(json.payment_url).toBeNull()
  })

  it('invoice with no linked payment request → payment_state=none', async () => {
    seedDoc({ payment_request_id: null })
    const { json } = await callGet()
    expect(json.payment_state).toBe('none')
    expect(json.payment_url).toBeNull()
  })

  it('quote → payment_state=none (no payment surface)', async () => {
    seedDoc({ document_type: 'quote', payment_request_id: null })
    const { json } = await callGet()
    expect(json.payment_state).toBe('none')
  })

  it('draft document with a prepared token is not publicly visible', async () => {
    seedDoc({ status: 'draft' })
    const { status } = await callGet()
    expect(status).toBe(404)
  })

  it('response exposes no Stripe identifiers or internal metadata', async () => {
    seedDoc()
    seedPr()
    const { json } = await callGet()
    const keys = Object.keys(json)
    expect(keys).toEqual(expect.arrayContaining(['document', 'payment_url', 'payment_state']))
    expect(keys).not.toContain('stripe_connect_account_id')
    expect(keys).not.toContain('stripe_checkout_session_id')
    expect(keys).not.toContain('stripe_payment_intent_id')
    expect(json.payment_state).not.toMatch(/^acct_/)
  })

  it('unknown token → 404', async () => {
    const { status } = await callGet('b'.repeat(48))
    expect(status).toBe(404)
  })
})

describe('HostedDocumentPage — terminal payment copy (PI-B3)', () => {
  it('renders honest copy for terminal payment requests instead of "being prepared"', () => {
    const src = require('fs').readFileSync(
      require('path').resolve('src/components/billing/HostedDocumentPage.tsx'),
      'utf8'
    )
    expect(src).toContain("paymentState === 'terminal'")
    expect(src).toContain('This payment link is no longer active. Please contact the business for a new payment request.')
    expect(src).toContain('Payment is being prepared. Please check back shortly.')
    // A paid linked payment request is authoritative even if the invoice row lags
    expect(src).toContain("paymentState === 'paid'")
  })
})
