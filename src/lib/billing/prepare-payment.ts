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

  // ── Step 1: resolve or resume the canonical payment_request anchor ─────
  // If the invoice already links to a usable pending request, return it.
  // If it links to a draft request (previous partial attempt), resume it.
  // If it links to a paid request, reconcile the invoice.
  // Otherwise create a fresh 'draft' row BEFORE any external Stripe state is
  // created, so a retry always has a persisted idempotency anchor to follow.
  let paymentRequest: { id: string; status?: string; checkout_url?: string | null; stripe_checkout_session_id?: string | null } | null = null
  let isNewAnchor = true

  if (invoice.payment_request_id) {
    const { data: existingPr } = await supabase
      .from('payment_requests')
      .select('id, checkout_url, status, stripe_checkout_session_id')
      .eq('id', invoice.payment_request_id)
      .maybeSingle()
    if (existingPr) {
      if (existingPr.status === 'pending' && existingPr.checkout_url) {
        return {
          ok: true,
          checkout_url: existingPr.checkout_url,
          payment_request_id: existingPr.id,
          idempotent: true,
        }
      }
      if (existingPr.status === 'paid') {
        await supabase
          .from('billing_documents')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', invoice.id)
        return { ok: true, alreadyPaid: true }
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
        currency: 'usd',
        description: `Invoice ${invoice.document_number}`,
        status: 'draft',
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
              currency: 'usd',
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
          business_id: String(businessId),
          lead_id: String(invoice.customer_id || ''),
          invoice_id: String(invoice.id),
          invoice_number: String(invoice.document_number),
          source: 'billing_invoice',
        },
      },
      { idempotencyKey: stripeIdempotencyKey }
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
      checkout_url: session.url,
      stripe_checkout_session_id: session.id,
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
            source: 'billing_invoice',
          },
        }
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
