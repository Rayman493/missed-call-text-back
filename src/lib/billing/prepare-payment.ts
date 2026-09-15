import getStripe from '@/lib/stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

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

  // Idempotent: if already linked to a pending payment request, return its URL
  if (invoice.payment_request_id) {
    const { data: existingPr } = await supabase
      .from('payment_requests')
      .select('id, checkout_url, status')
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
        // Reconcile: mark invoice as paid
        await supabase
          .from('billing_documents')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', invoice.id)
        return { ok: true, alreadyPaid: true }
      }
      // If cancelled/expired, fall through to create a new one
    }
  }

  if (!invoice.customer_id) {
    return { ok: false, error: 'Invoice must have a customer to create a payment request', status: 400 }
  }

  // Create a new Stripe Checkout Session
  const stripe = getStripe()
  if (!stripe) {
    return { ok: false, error: 'Stripe is not configured', status: 500 }
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Resolve the public token for the success/cancel redirect URLs.
  // Customers paying an invoice do NOT have a ReplyFlow account — they must
  // be redirected back to the public hosted document, not the dashboard.
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

  const session = await stripe.checkout.sessions.create({
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
    metadata: {
      business_id: String(businessId),
      lead_id: String(invoice.customer_id || ''),
      invoice_id: String(invoice.id),
      invoice_number: String(invoice.document_number),
      source: 'billing_invoice',
    },
  })

  // Insert payment request
  const { data: paymentRequest, error: prError } = await supabase
    .from('payment_requests')
    .insert({
      business_id: businessId,
      lead_id: invoice.customer_id,
      amount_cents: invoice.total_cents,
      currency: 'usd',
      description: `Invoice ${invoice.document_number}`,
      status: 'pending',
      checkout_url: session.url,
      stripe_checkout_session_id: session.id,
      requested_by: requestedBy ?? null,
    })
    .select()
    .single()
  if (prError || !paymentRequest) {
    console.error('[PREPARE PAYMENT] Payment request insert error:', prError)
    return { ok: false, error: 'Failed to create payment request', status: 500 }
  }

  // Link payment request to invoice
  const { error: linkError } = await supabase
    .from('billing_documents')
    .update({ payment_request_id: paymentRequest.id })
    .eq('id', invoice.id)
  if (linkError) {
    console.error('[PREPARE PAYMENT] Failed to link payment request to invoice:', linkError)
    return { ok: false, error: 'Failed to link payment request', status: 500 }
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
