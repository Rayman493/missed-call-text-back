import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Stripe
const mockSession = { id: 'cs_test_123', url: 'https://checkout.stripe.com/test', payment_intent: 'pi_test_123' }
const mockPaymentIntentsUpdate = vi.fn().mockResolvedValue({})
const mockSessionsRetrieve = vi.fn()
const mockSessionsExpire = vi.fn().mockResolvedValue({ id: 'cs_legacy', status: 'expired' })
const mockStripe = {
  checkout: { sessions: { create: vi.fn().mockResolvedValue(mockSession), retrieve: mockSessionsRetrieve, expire: mockSessionsExpire } },
  paymentIntents: { update: mockPaymentIntentsUpdate },
}

vi.mock('@/lib/stripe', () => ({
  default: () => mockStripe,
}))

const mockEnsureSideEffects = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/payments/completion-side-effects', () => ({
  ensurePaymentCompletedSideEffects: (...args: any[]) => mockEnsureSideEffects(...args),
}))

// Flexible mock supabase that supports the prepare-payment lifecycle:
// 1. conversations lookup/insert
// 2. payment_requests insert (draft) -> select single
// 3. billing_documents update (link) -> eq -> eq
// 4. payment_requests update (activate) -> eq -> select single
function makeMockSupabase(options: {
  invoice: any
  existingPr?: any | null
  prAfterUpdate?: any
  business?: any | null
  insertedPr?: any
  conversationLookup?: any[]
  conversationInsert?: any
  activateResult?: { data: any; error: any }
  linkError?: any
  activateError?: any
}) {
  const {
    invoice,
    existingPr = null,
    prAfterUpdate,
    business = { id: 'biz_1', stripe_connect_account_id: 'acct_business_1', stripe_connect_status: 'connected', stripe_charges_enabled: true },
    insertedPr = { id: 'pr_new', status: 'draft' },
    conversationLookup = [{ id: 'conv_1', status: 'active' }],
    conversationInsert = { id: 'conv_new' },
    activateResult = { data: { ...insertedPr, status: 'pending', checkout_url: mockSession.url, stripe_checkout_session_id: mockSession.id }, error: null },
    linkError = null,
    activateError = null,
  } = options

  const updates: Record<string, any> = {}
  const inserts: Record<string, any> = {}
  const deletes: Record<string, any> = {}
  let prUpdateError = activateError
  let prUpdateData = activateResult.data
  let prMutated = false

  const fromFn = vi.fn((table: string) => {
    const captureInsert = (payload: any) => {
      inserts[table] = payload
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: table === 'conversations' ? conversationInsert : insertedPr,
            error: null,
          })),
        })),
      }
    }

    if (table === 'conversations') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                data: conversationLookup,
                error: null,
              })),
            })),
          })),
        })),
        insert: vi.fn(captureInsert),
        update: vi.fn((payload: any) => ({
          eq: vi.fn((col: string, val: string) => {
            updates[`${table}.${col}=${val}`] = payload
            return { eq: vi.fn(() => ({ error: null })) }
          }),
        })),
      }
    }

    if (table === 'businesses') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: business, error: null })),
          })),
        })),
      }
    }

    if (table === 'payment_requests') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((col: string) => ({
            maybeSingle: vi.fn(async () => {
              const row = prMutated && prAfterUpdate !== undefined ? prAfterUpdate : existingPr
              if (col === 'id' && row) {
                return { data: row, error: null }
              }
              return { data: null, error: null }
            }),
            single: vi.fn(async () => ({ data: existingPr, error: null })),
          })),
        })),
        insert: vi.fn(captureInsert),
        update: vi.fn((payload: any) => ({
          eq: vi.fn((col: string, val: string) => {
            updates[`${table}.${col}=${val}`] = payload
            const selectResult = () => ({
              single: vi.fn(async () => ({
                data: prUpdateData,
                error: prUpdateError,
              })),
              maybeSingle: vi.fn(async () => {
                prMutated = true
                return {
                  data: prUpdateData,
                  error: prUpdateError,
                }
              }),
            })
            return {
              select: selectResult,
              neq: vi.fn(() => ({ select: selectResult })),
            }
          }),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn((col: string, val: string) => {
            deletes[`${table}.${col}=${val}`] = true
            return { error: null }
          }),
        })),
      }
    }

    if (table === 'billing_documents') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: invoice, error: null })),
            })),
            maybeSingle: vi.fn(async () => ({ data: invoice, error: null })),
            single: vi.fn(async () => ({ data: invoice, error: null })),
          })),
        })),
        insert: vi.fn(captureInsert),
        update: vi.fn((payload: any) => ({
          eq: vi.fn((col: string, val: string) => {
            updates[`${table}.${col}=${val}`] = payload
            // Return a builder that both supports chained .eq() and resolves
            // to { error: linkError } when the single-eq chain is awaited.
            const builder: any = { error: linkError }
            builder.eq = vi.fn(() => builder)
            return builder
          }),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn((col: string, val: string) => {
            deletes[`${table}.${col}=${val}`] = true
            return { error: null }
          }),
        })),
      }
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(captureInsert),
      update: vi.fn((payload: any) => ({
        eq: vi.fn((col: string, val: string) => {
          updates[`${table}.${col}=${val}`] = payload
          return { eq: vi.fn(() => ({ error: null })) }
        }),
      })),
    }
  })

  return {
    _updates: updates,
    _inserts: inserts,
    _deletes: deletes,
    _setPrUpdateResult: (data: any, error: any) => {
      prUpdateData = data
      prUpdateError = error
    },
    from: fromFn,
  }
}

import { prepareInvoicePayment } from '../billing/prepare-payment'

describe('prepareInvoicePayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns alreadyPaid for a paid invoice', async () => {
    const supabase = makeMockSupabase({ invoice: { status: 'paid' } })
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
    const supabase = makeMockSupabase({
      invoice: { status: 'sent', payment_request_id: 'pr_1' },
      existingPr: { id: 'pr_1', checkout_url: 'https://checkout.stripe.com/existing', status: 'pending', stripe_connect_account_id: 'acct_business_1' },
    })
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

  it('creates a draft payment_request BEFORE creating a Stripe session', async () => {
    const supabase = makeMockSupabase({
      invoice: { status: 'draft', payment_request_id: null, public_token: 'tok_1' },
      insertedPr: { id: 'pr_new', status: 'draft' },
    })
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: 'lead_1',
      status: 'draft',
      payment_request_id: null,
      public_token: 'tok_1',
    }, 'user_1')

    expect(result.ok).toBe(true)
    expect(result.checkout_url).toBe('https://checkout.stripe.com/test')
    expect(result.payment_request_id).toBe('pr_new')

    // 1. Anchor inserted first as draft (no Stripe details yet)
    expect(supabase._inserts['payment_requests']).toEqual({
      business_id: 'biz_1',
      lead_id: 'lead_1',
      conversation_id: 'conv_1',
      amount_cents: 1000,
      currency: 'usd',
      description: 'Invoice INV-1',
      status: 'draft',
      payment_provider: 'stripe',
      stripe_connect_account_id: 'acct_business_1',
      requested_by: 'user_1',
    })

    // 2. Invoice linked to the anchor before any external Stripe state exists
    expect(supabase._updates['billing_documents.id=inv_1']).toEqual({
      payment_request_id: 'pr_new',
    })

    // 3. Only then is the Stripe session created
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1)
    const createCall = mockStripe.checkout.sessions.create.mock.calls[0]
    expect(createCall[0].client_reference_id).toBe('pr_new')
    expect(createCall[1]).toEqual({ stripeAccount: 'acct_business_1', idempotencyKey: 'billing-payment-request:pr_new' })

    // 4. The persisted anchor is activated with the Stripe session URL + id
    expect(supabase._updates['payment_requests.id=pr_new']).toEqual({
      status: 'pending',
      payment_provider: 'stripe',
      stripe_connect_account_id: 'acct_business_1',
      checkout_url: 'https://checkout.stripe.com/test',
      stripe_checkout_session_id: 'cs_test_123',
      stripe_payment_intent_id: 'pi_test_123',
    })

    expect(mockPaymentIntentsUpdate).toHaveBeenCalledTimes(1)
  })

  it('uses the same Stripe idempotency key on retry so Stripe returns the same session', async () => {
    const supabase = makeMockSupabase({
      invoice: { status: 'draft', payment_request_id: null, public_token: 'tok_1' },
      insertedPr: { id: 'pr_new', status: 'draft' },
    })

    // First attempt: activate fails, but Stripe create succeeds.
    const supabaseWithActivationFailure = { ...supabase }
    supabaseWithActivationFailure._setPrUpdateResult(null, { message: 'activation failed' })
    const result1 = await prepareInvoicePayment(supabaseWithActivationFailure as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: 'lead_1',
      status: 'draft',
      payment_request_id: null,
      public_token: 'tok_1',
    }, 'user_1')
    expect(result1.ok).toBe(false)

    // Simulate Stripe returning the same session on retry due to the idempotency key.
    const sameSession = { id: 'cs_test_same', url: 'https://checkout.stripe.com/same', payment_intent: 'pi_same' }
    mockStripe.checkout.sessions.create.mockResolvedValueOnce(sameSession)

    // Second attempt: resume the existing draft anchor and reuse the key.
    const supabaseRetry = makeMockSupabase({
      invoice: { status: 'draft', payment_request_id: 'pr_new', public_token: 'tok_1' },
      existingPr: { id: 'pr_new', status: 'draft', checkout_url: null, stripe_checkout_session_id: null },
      insertedPr: { id: 'pr_new', status: 'draft' },
      activateResult: { data: { id: 'pr_new', status: 'pending', checkout_url: sameSession.url, stripe_checkout_session_id: sameSession.id }, error: null },
    })
    const result2 = await prepareInvoicePayment(supabaseRetry as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: 'lead_1',
      status: 'draft',
      payment_request_id: 'pr_new',
      public_token: 'tok_1',
    }, 'user_1')

    expect(result2.ok).toBe(true)
    expect(result2.checkout_url).toBe('https://checkout.stripe.com/same')
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(2)
    const firstCreate = mockStripe.checkout.sessions.create.mock.calls[0]
    const secondCreate = mockStripe.checkout.sessions.create.mock.calls[1]
    expect(firstCreate[1].idempotencyKey).toBe('billing-payment-request:pr_new')
    expect(secondCreate[1].idempotencyKey).toBe('billing-payment-request:pr_new')
  })

  it('does not create an orphan Stripe session if the DB insert fails', async () => {
    const supabase = makeMockSupabase({
      invoice: { status: 'draft', payment_request_id: null, public_token: 'tok_1' },
      insertedPr: null,
    })
    // Force the insert single() to return an error
    ;(supabase as any).from = vi.fn((table: string) => {
      if (table === 'businesses') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: 'biz_1', stripe_connect_account_id: 'acct_business_1', stripe_connect_status: 'connected', stripe_charges_enabled: true }, error: null })),
            })),
          })),
        }
      }
      if (table === 'conversations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ data: [{ id: 'conv_1', status: 'active' }], error: null })),
              })),
            })),
          })),
        }
      }
      if (table === 'payment_requests') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: null, error: { message: 'insert failed' } })),
            })),
          })),
        }
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })) }
    })

    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: 'lead_1',
      status: 'draft',
      payment_request_id: null,
      public_token: 'tok_1',
    }, 'user_1')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Failed to create payment request')
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('cleans up the draft anchor if linking it to the invoice fails', async () => {
    const supabase = makeMockSupabase({
      invoice: { status: 'draft', payment_request_id: null, public_token: 'tok_1' },
      insertedPr: { id: 'pr_new', status: 'draft' },
      linkError: { message: 'link failed' },
    })

    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: 'lead_1',
      status: 'draft',
      payment_request_id: null,
      public_token: 'tok_1',
    }, 'user_1')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Failed to link payment request')
    expect(supabase._deletes['payment_requests.id=pr_new']).toBe(true)
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('rejects zero-dollar invoices before creating a payment_request', async () => {
    const supabase = makeMockSupabase({
      invoice: { status: 'draft', payment_request_id: null, public_token: 'tok_1' },
    })
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 0,
      customer_id: 'lead_1',
      status: 'draft',
      payment_request_id: null,
      public_token: 'tok_1',
    }, 'user_1')

    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
    expect(result.error).toMatch(/greater than \$0/i)
    expect(supabase._inserts['payment_requests']).toBeUndefined()
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('fails when invoice has no customer', async () => {
    const supabase = makeMockSupabase({ invoice: { status: 'draft' } })
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1',
      document_number: 'INV-1',
      total_cents: 1000,
      customer_id: null,
      status: 'draft',
      payment_request_id: null,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('customer')
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('fails closed when the business has no charge-ready connected account', async () => {
    for (const business of [
      null,
      { id: 'biz_1', stripe_connect_account_id: null, stripe_connect_status: 'not_connected', stripe_charges_enabled: false },
      { id: 'biz_1', stripe_connect_account_id: 'acct_1', stripe_connect_status: 'setup_incomplete', stripe_charges_enabled: false },
      { id: 'biz_1', stripe_connect_account_id: 'acct_1', stripe_connect_status: 'connected', stripe_charges_enabled: false },
    ]) {
      const supabase = makeMockSupabase({ invoice: {}, business })
      const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
        id: 'inv_1', document_number: 'INV-1', total_cents: 1000, currency: 'usd', customer_id: 'lead_1', status: 'draft', payment_request_id: null,
      })
      expect(result.ok).toBe(false)
    }
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('rejects invalid amounts and unsupported currencies before Stripe creation', async () => {
    for (const input of [
      { total_cents: 10.5, currency: 'usd' },
      { total_cents: 100000001, currency: 'usd' },
      { total_cents: 1000, currency: 'eur' },
    ]) {
      const supabase = makeMockSupabase({ invoice: {} })
      const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
        id: 'inv_1', document_number: 'INV-1', customer_id: 'lead_1', status: 'draft', payment_request_id: null, ...input,
      })
      expect(result.ok).toBe(false)
    }
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('routes two businesses to isolated connected accounts with consistent metadata', async () => {
    for (const suffix of ['a', 'b']) {
      const businessId = `biz_${suffix}`
      const accountId = `acct_${suffix}`
      const supabase = makeMockSupabase({
        invoice: {},
        business: { id: businessId, stripe_connect_account_id: accountId, stripe_connect_status: 'connected', stripe_charges_enabled: true },
        insertedPr: { id: `pr_${suffix}`, status: 'draft' },
      })
      const result = await prepareInvoicePayment(supabase as any, businessId, {
        id: `inv_${suffix}`, document_number: `INV-${suffix}`, total_cents: suffix === 'a' ? 1111 : 2222, currency: 'usd', customer_id: `lead_${suffix}`, status: 'draft', payment_request_id: null,
      })
      expect(result.ok).toBe(true)
      const [params, options] = mockStripe.checkout.sessions.create.mock.calls.at(-1)!
      expect(options.stripeAccount).toBe(accountId)
      expect(params.metadata).toMatchObject({ payment_request_id: `pr_${suffix}`, business_id: businessId, invoice_id: `inv_${suffix}`, stripe_connect_account_id: accountId, source: 'billing_invoice' })
      expect(params.payment_intent_data.metadata).toEqual(params.metadata)
    }
    expect(mockStripe.checkout.sessions.create.mock.calls.at(-2)![1].stripeAccount).not.toBe(mockStripe.checkout.sessions.create.mock.calls.at(-1)![1].stripeAccount)
  })

  it('retires a live legacy platform session, then resumes the anchor on the connected account', async () => {
    mockSessionsRetrieve.mockResolvedValue({ id: 'cs_legacy', status: 'open', payment_status: 'unpaid' })
    const supabase = makeMockSupabase({
      invoice: {},
      existingPr: { id: 'pr_legacy', status: 'pending', amount_cents: 1000, currency: 'usd', checkout_url: 'https://checkout.stripe.com/legacy', stripe_checkout_session_id: 'cs_legacy', stripe_connect_account_id: null },
    })
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1', document_number: 'INV-1', total_cents: 1000, currency: 'usd', customer_id: 'lead_1', status: 'sent', payment_request_id: 'pr_legacy',
    })
    // The legacy platform session is retired so it can no longer collect,
    // then a fresh connected-account session is created on the same anchor.
    // Account boundary: retrieve/expire run UNSCOPED (platform account —
    // where the legacy session lives); create runs under { stripeAccount }
    // (the business's connected account). Stripe idempotency keys are
    // account-scoped, so the key inside the connected-account options can
    // never replay the platform session.
    expect(mockSessionsRetrieve.mock.calls[0]).toEqual(['cs_legacy'])
    expect(mockSessionsExpire.mock.calls[0]).toEqual(['cs_legacy'])
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1)
    expect(mockStripe.checkout.sessions.create.mock.calls[0][1]).toEqual({
      stripeAccount: 'acct_business_1',
      idempotencyKey: 'billing-payment-request:pr_legacy',
    })
    expect(result).toMatchObject({ ok: true, checkout_url: mockSession.url, payment_request_id: 'pr_legacy' })
    // The anchor is re-activated onto the connected account.
    expect(supabase._updates['payment_requests.id=pr_legacy']).toMatchObject({
      status: 'pending',
      stripe_connect_account_id: 'acct_business_1',
      stripe_checkout_session_id: 'cs_test_123',
    })
  })

  it('resumes a legacy anchor whose session is already expired without expiring again', async () => {
    mockSessionsRetrieve.mockResolvedValue({ id: 'cs_legacy', status: 'expired', payment_status: 'unpaid' })
    const supabase = makeMockSupabase({
      invoice: {},
      existingPr: { id: 'pr_legacy', status: 'pending', amount_cents: 1000, currency: 'usd', checkout_url: 'https://checkout.stripe.com/legacy', stripe_checkout_session_id: 'cs_legacy', stripe_connect_account_id: null },
    })
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1', document_number: 'INV-1', total_cents: 1000, currency: 'usd', customer_id: 'lead_1', status: 'sent', payment_request_id: 'pr_legacy',
    })
    expect(mockSessionsExpire).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: true, payment_request_id: 'pr_legacy' })
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1)
  })

  it('keeps quarantining a legacy link whose session already collected a platform payment', async () => {
    mockSessionsRetrieve.mockResolvedValue({ id: 'cs_legacy', status: 'complete', payment_status: 'paid' })
    const supabase = makeMockSupabase({
      invoice: {},
      existingPr: { id: 'pr_legacy', status: 'pending', amount_cents: 1000, currency: 'usd', checkout_url: 'https://checkout.stripe.com/legacy', stripe_checkout_session_id: 'cs_legacy', stripe_connect_account_id: null },
    })
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1', document_number: 'INV-1', total_cents: 1000, currency: 'usd', customer_id: 'lead_1', status: 'sent', payment_request_id: 'pr_legacy',
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(result.error).toMatch(/requires review/)
    expect(mockSessionsExpire).not.toHaveBeenCalled()
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('resumes a pending non-Stripe anchor (venmo/paypal link holds no payable Stripe state)', async () => {
    const supabase = makeMockSupabase({
      invoice: {},
      existingPr: { id: 'pr_venmo', status: 'pending', amount_cents: 1000, currency: 'usd', checkout_url: 'https://venmo.com/u/merchant', stripe_checkout_session_id: null, stripe_connect_account_id: null, payment_provider: 'venmo' },
    })
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1', document_number: 'INV-1', total_cents: 1000, currency: 'usd', customer_id: 'lead_1', status: 'sent', payment_request_id: 'pr_venmo',
    })
    expect(mockSessionsRetrieve).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: true, payment_request_id: 'pr_venmo' })
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledTimes(1)
  })

  it('returns alreadyPaid instead of resurrecting an anchor that was paid during activation', async () => {
    mockSessionsRetrieve.mockResolvedValue({ id: 'cs_legacy', status: 'open', payment_status: 'unpaid' })
    const supabase = makeMockSupabase({
      invoice: {},
      existingPr: { id: 'pr_legacy', status: 'pending', amount_cents: 1000, currency: 'usd', checkout_url: 'https://checkout.stripe.com/legacy', stripe_checkout_session_id: 'cs_legacy', stripe_connect_account_id: null },
      // .neq('status','paid') filtered the update (webhook won the race)
      activateResult: { data: null, error: null },
      prAfterUpdate: { id: 'pr_legacy', status: 'paid' },
    })
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1', document_number: 'INV-1', total_cents: 1000, currency: 'usd', customer_id: 'lead_1', status: 'sent', payment_request_id: 'pr_legacy',
    })
    expect(result).toMatchObject({ ok: true, alreadyPaid: true })
    expect(mockEnsureSideEffects).toHaveBeenCalledWith('pr_legacy')
  })

  it('rejects an existing anchor assigned to another connected account', async () => {
    const supabase = makeMockSupabase({
      invoice: {},
      existingPr: { id: 'pr_1', status: 'pending', amount_cents: 1000, currency: 'usd', checkout_url: 'https://checkout.stripe.com/existing', stripe_checkout_session_id: 'cs_1', stripe_connect_account_id: 'acct_other' },
    })
    const result = await prepareInvoicePayment(supabase as any, 'biz_1', {
      id: 'inv_1', document_number: 'INV-1', total_cents: 1000, currency: 'usd', customer_id: 'lead_1', status: 'sent', payment_request_id: 'pr_1',
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('reconciles when existing payment request is already paid', async () => {
    const supabase = makeMockSupabase({
      invoice: { status: 'sent', payment_request_id: 'pr_1' },
      existingPr: { id: 'pr_1', checkout_url: null, status: 'paid' },
    })
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
