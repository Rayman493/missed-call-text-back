import getStripe from '@/lib/stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve or create the canonical conversation for a lead/business pair.
 * payment_requests requires a non-null conversation_id, so this must run
 * before any payment_request insert.
 */
async function resolveConversationId(
  supabase: SupabaseClient,
  businessId: string,
  leadId: string
): Promise<{ id: string; isNew: boolean } | null> {
  const { data: existingConversations, error: lookupError } = await supabase
    .from('conversations')
    .select('id, status')
    .eq('lead_id', leadId)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })

  if (lookupError) {
    console.error('[PREPARE PAYMENT] Conversation lookup error:', lookupError)
    return null
  }

  if (existingConversations && existingConversations.length > 0) {
    const active = existingConversations.find(c => c.status === 'active') || existingConversations[0]
    return { id: active.id, isNew: false }
  }

  const { data: newConversation, error: createError } = await supabase
    .from('conversations')
    .insert({ business_id: businessId, lead_id: leadId, status: 'active' })
    .select('id')
    .single()

  if (createError || !newConversation) {
    console.error('[PREPARE PAYMENT] Conversation creation error:', createError)
    return null
  }

  return { id: newConversation.id, isNew: true }
}

/**
 * Prepare (or reuse) a Stripe Checkout payment for an invoice.
 *
 * Used by:
 *   - POST /api/billing-documents/[id]/send  (before SMS)
 *   - POST /api/billing-documents/[id]/pay   (manual request)
 *
 * Idempotent:
 *   - If a pending payment_request already exists, returns its checkout URL.
 *   - If the invoice is already paid, returns { alreadyPaid: true }.
 *   - Otherwise creates a new Stripe Checkout session + payment_request row.
 *
 * Returns:
 *   { ok: true, checkout_url, payment_request_id, idempotent? }
 *   { ok: true, alreadyPaid: true }
 *   { ok: false, error, status }
 */
export async function prepareInvoicePayment(
  supabase: SupabaseClient,
  businessId: string,
  invoice: {
    id: string
    document_number: string
    total_cents: number
    currency?: string | null
    customer_id: string | null
    status: string
    payment_request_id: string | null
    public_token?: string | null
  },
  requestedBy?: string
): Promise<{
  ok: boolean
  checkout_url?: string
  payment_request_id?: string
  idempotent?: boolean
  alreadyPaid?: boolean
  error?: string
  status?: number
}> {
  // Already paid — nothing to do
  if (invoice.status === 'paid') {
    return { ok: true, alreadyPaid: true }
  }

  // Zero-dollar invoices cannot enter the payment lifecycle.
  if (!Number.isSafeInteger(invoice.total_cents) || invoice.total_cents <= 0) {
    return { ok: false, error: 'Add an amount greater than $0 before sending this invoice.', status: 400 }
  }
  if (invoice.total_cents > 100000000) {
    return { ok: false, error: 'Invoice amount exceeds maximum allowed', status: 400 }
  }
  const currency = (invoice.currency || 'usd').toLowerCase()
  if (currency !== 'usd') {
    return { ok: false, error: 'Invoice currency is not supported', status: 400 }
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id, stripe_connect_account_id, stripe_connect_status, stripe_charges_enabled')
    .eq('id', businessId)
    .maybeSingle()
  if (businessError || !business || business.id !== businessId) {
    return { ok: false, error: 'Business not found', status: 404 }
  }
  if (!business.stripe_connect_account_id || business.stripe_connect_status !== 'connected' || business.stripe_charges_enabled !== true) {
    return { ok: false, error: 'Stripe Connect is not ready to accept invoice payments', status: 400 }
  }
  const stripeAccountId = business.stripe_connect_account_id

  // ── Step 1: resolve or resume the canonical payment_request anchor ─────
  // If the invoice already links to a usable pending request, return it.
  // If it links to a draft request (previous partial attempt), resume it.
  // If it links to a paid request, reconcile the invoice.
  // Otherwise create a fresh 'draft' row BEFORE any external Stripe state is
  // created, so a retry always has a persisted idempotency anchor to follow.
  let paymentRequest: { id: string; status?: string; amount_cents?: number; currency?: string | null; checkout_url?: string | null; stripe_checkout_session_id?: string | null; stripe_connect_account_id?: string | null } | null = null
  let isNewAnchor = true

  if (invoice.payment_request_id) {
    const { data: existingPr } = await supabase
      .from('payment_requests')
      .select('id, amount_cents, currency, checkout_url, status, stripe_checkout_session_id, stripe_connect_account_id')
      .eq('id', invoice.payment_request_id)
      .maybeSingle()
    if (existingPr) {
      if (existingPr.amount_cents != null && existingPr.amount_cents !== invoice.total_cents) {
        return { ok: false, error: 'Invoice payment amount does not match the invoice', status: 409 }
      }
      if (existingPr.currency && existingPr.currency.toLowerCase() !== currency) {
        return { ok: false, error: 'Invoice payment currency does not match the invoice', status: 409 }
      }
      if (existingPr.status === 'paid') {
        await supabase
          .from('billing_documents')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', invoice.id)
        return { ok: true, alreadyPaid: true }
      }
      if ((existingPr.stripe_checkout_session_id || existingPr.checkout_url) && !existingPr.stripe_connect_account_id) {
        // Legacy platform-account link. A still-live 'pending' link must stay
        // blocked: paying it would collect into the platform account, not the
        // business's connected account. A dead anchor (cancelled/expired/draft)
        // is safe to resume — activation below creates a fresh connected-account
        // session and rewrites the account/session/url fields, so the old
        // platform link can no longer collect on this request.
        if (existingPr.status === 'pending') {
          return { ok: false, error: 'This invoice payment link requires review before it can accept payment', status: 409 }
        }
      }
      if (existingPr.stripe_connect_account_id && existingPr.stripe_connect_account_id !== stripeAccountId) {
        return { ok: false, error: 'Invoice payment account does not match the business Stripe account', status: 409 }
      }
      if (existingPr.status === 'pending' && existingPr.checkout_url) {
        return {
          ok: true,
          checkout_url: existingPr.checkout_url,
          payment_request_id: existingPr.id,
          idempotent: true,
        }
      }
      // cancelled/expired/draft: resume the existing anchor
      paymentRequest = existingPr
      isNewAnchor = false
    }
    // If existingPr is null, the invoice points to a stale/deleted row; fall
    // through to create a new anchor and re-link below.
  }

  if (!paymentRequest) {
    if (!invoice.customer_id) {
      return { ok: false, error: 'Invoice must have a customer to create a payment request', status: 400 }
    }

    const conversationResolution = await resolveConversationId(supabase, businessId, invoice.customer_id)
    if (!conversationResolution) {
      return { ok: false, error: 'Failed to resolve conversation for payment request', status: 500 }
    }

    const { data: insertedPr, error: prInsertError } = await supabase
      .from('payment_requests')
      .insert({
        business_id: businessId,
        lead_id: invoice.customer_id,
        conversation_id: conversationResolution.id,
        amount_cents: invoice.total_cents,
        currency,
        description: `Invoice ${invoice.document_number}`,
        status: 'draft',
        payment_provider: 'stripe',
        stripe_connect_account_id: stripeAccountId,
        requested_by: requestedBy ?? null,
      })
      .select('id, status, checkout_url, stripe_checkout_session_id')
      .single()
    if (prInsertError || !insertedPr) {
      console.error('[PREPARE PAYMENT] Payment request insert error:', prInsertError)
      return { ok: false, error: 'Failed to create payment request', status: 500 }
    }
    paymentRequest = insertedPr
  }

  // ── Step 2: ensure the invoice is linked to the anchor we are using ──────
  // This covers first-time sends and stale/deleted payment_request_ids.
  if (invoice.payment_request_id !== paymentRequest.id) {
    const { error: linkError } = await supabase
      .from('billing_documents')
      .update({ payment_request_id: paymentRequest.id })
      .eq('id', invoice.id)
    if (linkError) {
      console.error('[PREPARE PAYMENT] Failed to link payment request to invoice:', linkError)
      if (isNewAnchor) {
        await supabase.from('payment_requests').delete().eq('id', paymentRequest.id)
      }
      return { ok: false, error: 'Failed to link payment request', status: 500 }
    }
  }

  // ── Step 3: if the anchor is already active, return it ────────────────
  if (paymentRequest.status === 'pending' && paymentRequest.checkout_url) {
    return {
      ok: true,
      checkout_url: paymentRequest.checkout_url,
      payment_request_id: paymentRequest.id,
      idempotent: true,
    }
  }

  // ── Step 4: create or recover the Stripe Checkout Session ──────────────
  const stripe = getStripe()
  if (!stripe) {
    return { ok: false, error: 'Stripe is not configured', status: 500 }
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  let publicToken = invoice.public_token
  if (!publicToken) {
    const { data: tokenRow } = await supabase
      .from('billing_documents')
      .select('public_token')
      .eq('id', invoice.id)
      .single()
    publicToken = tokenRow?.public_token
  }
  const publicPath = publicToken ? `/document/${publicToken}` : '/document'
  const successUrl = `${origin}${publicPath}?payment=success`
  const cancelUrl = `${origin}${publicPath}?payment=cancelled`

  // Create the Stripe Checkout Session with a stable idempotency key derived
  // from the canonical payment_request ID. Stripe returns the same Session
  // object for at least 24 hours when the same key is reused, so a retry after
  // the DB activation update failed will not produce a second Checkout Session.
  const stripeIdempotencyKey = `billing-payment-request:${paymentRequest.id}`
  let session: any = null
  try {
    session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `Invoice ${invoice.document_number}`,
              },
              unit_amount: invoice.total_cents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: paymentRequest.id,
        metadata: {
          payment_request_id: paymentRequest.id,
          business_id: String(businessId),
          lead_id: String(invoice.customer_id || ''),
          invoice_id: String(invoice.id),
          invoice_number: String(invoice.document_number),
          stripe_connect_account_id: stripeAccountId,
          source: 'billing_invoice',
        },
        payment_intent_data: {
          metadata: {
            payment_request_id: paymentRequest.id,
            business_id: String(businessId),
            lead_id: String(invoice.customer_id || ''),
            invoice_id: String(invoice.id),
            invoice_number: String(invoice.document_number),
            stripe_connect_account_id: stripeAccountId,
            source: 'billing_invoice',
          },
        },
      },
      { stripeAccount: stripeAccountId, idempotencyKey: stripeIdempotencyKey }
    )
  } catch (stripeCreateError) {
    console.error('[PREPARE PAYMENT] Stripe Checkout Session creation failed:', stripeCreateError)
    return {
      ok: false,
      error: 'Failed to create Stripe Checkout Session',
      status: 500,
    }
  }

  // ── Step 5: activate the anchor with the Stripe session details ──────────
  const { data: activatedPr, error: activateError } = await supabase
    .from('payment_requests')
    .update({
      status: 'pending',
      payment_provider: 'stripe',
      stripe_connect_account_id: stripeAccountId,
      checkout_url: session.url,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
    })
    .eq('id', paymentRequest.id)
    .select('id, checkout_url, stripe_checkout_session_id')
    .single()
  if (activateError || !activatedPr) {
    console.error('[PREPARE PAYMENT] Failed to activate payment request with Stripe session:', activateError)
    return {
      ok: false,
      error: 'Failed to activate payment request',
      status: 500,
    }
  }

  // Update Stripe payment intent metadata so the webhook can reconcile
  try {
    if (session.payment_intent) {
      await stripe.paymentIntents.update(
        session.payment_intent as string,
        {
          metadata: {
            payment_request_id: paymentRequest.id,
            business_id: String(businessId),
            lead_id: String(invoice.customer_id || ''),
            invoice_id: String(invoice.id),
            invoice_number: String(invoice.document_number),
            stripe_connect_account_id: stripeAccountId,
            source: 'billing_invoice',
          },
        },
        { stripeAccount: stripeAccountId }
      )
    }
  } catch (metadataError) {
    console.error('[PREPARE PAYMENT] Failed to update payment intent metadata:', metadataError)
    // Non-critical — webhook can still reconcile via stripe_checkout_session_id lookup
  }

  return {
    ok: true,
    checkout_url: session.url ?? undefined,
    payment_request_id: paymentRequest.id,
  }
}
