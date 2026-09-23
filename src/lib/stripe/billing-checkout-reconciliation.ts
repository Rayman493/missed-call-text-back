/**
 * Reconcile a billing-invoice Stripe Checkout Session completion.
 *
 * Used by the checkout.session.completed webhook handler to process
 * billing invoice one-time payments WITHOUT requiring session.customer
 * (which is only needed for subscription provisioning).
 *
 * Idempotent: if the payment request is already paid, no duplicate
 * processing occurs.
 */
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'

interface ReconciliationContext {
  supabase: SupabaseClient
  stripe: Stripe
  session: Stripe.Checkout.Session
  eventId: string
  eventAccountId: string | null
  reconstructFn: (
    supabase: SupabaseClient,
    sessionId: string,
    paymentIntentId: string,
    metadata: Record<string, string>,
    session: Stripe.Checkout.Session,
    stripe: Stripe,
    eventAccountId: string | null
  ) => Promise<{ success: boolean; error?: string; reason?: string; paymentRequest?: any; paymentRequestId?: string }>
  markProcessedFn: (supabase: SupabaseClient, eventId: string) => Promise<void | boolean>
}

export async function reconcileBillingInvoiceCheckout(ctx: ReconciliationContext): Promise<void> {
  const { supabase, stripe, session, eventId, eventAccountId, reconstructFn, markProcessedFn } = ctx
  const sessionId = session.id
  const paymentIntentId = session.payment_intent as string
  const metadata = session.metadata || {}

  console.log('[PAYMENT WEBHOOK] Checkout session ID:', sessionId)
  console.log('[PAYMENT WEBHOOK] Payment Intent ID:', paymentIntentId)
  console.log('[PAYMENT WEBHOOK] Session metadata:', JSON.stringify(metadata))

  let paymentRequestId = metadata.payment_request_id
  let authoritativePaymentIntent: Stripe.PaymentIntent | null = null
  console.log('[PAYMENT WEBHOOK] payment_request_id from session metadata:', paymentRequestId)

  if (!paymentRequestId && paymentIntentId) {
    console.log('[PAYMENT WEBHOOK] payment_request_id not in session metadata, checking payment intent metadata')
    try {
      authoritativePaymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        {},
        eventAccountId ? { stripeAccount: eventAccountId } : undefined
      )
      paymentRequestId = authoritativePaymentIntent.metadata?.payment_request_id
      console.log('[PAYMENT WEBHOOK] Payment intent metadata:', JSON.stringify(authoritativePaymentIntent.metadata))
      console.log('[PAYMENT WEBHOOK] Payment request ID from payment intent:', paymentRequestId)
    } catch (piError) {
      console.error('[PAYMENT WEBHOOK] Failed to retrieve payment intent:', piError)
    }
  }

  console.log('[PAYMENT WEBHOOK] Final payment request ID:', paymentRequestId)

  if (!paymentRequestId) {
    if (metadata.source === 'billing_invoice' || metadata.invoice_id) {
      console.log('[PAYMENT WEBHOOK] No payment_request_id in metadata, but billing_invoice source detected — reconciling via session ID lookup')
    } else {
      console.log('[PAYMENT WEBHOOK] Not a payment request, skipping')
      return
    }
  }

  console.log('[PAYMENT WEBHOOK] Looking up payment request by stripe_checkout_session_id:', sessionId)
  let { data: paymentRequest, error: paymentRequestError } = await supabase
    .from('payment_requests')
    .select('id, lead_id, business_id, status, amount_cents, currency, stripe_connect_account_id, stripe_payment_intent_id')
    .eq('stripe_checkout_session_id', sessionId)
    .single()

  if (paymentRequestError || !paymentRequest) {
    const isTrueNotFound = paymentRequestError?.code === 'PGRST116'
    if (!isTrueNotFound) {
      console.error('[PAYMENT WEBHOOK] Database error looking up payment request:', paymentRequestError)
      return
    }

    console.log('[PAYMENT RECONSTRUCTION] Payment request not found, attempting reconstruction from Stripe metadata')
    const reconstructionResult = await reconstructFn(supabase, sessionId, paymentIntentId, metadata, session, stripe, eventAccountId)
    if (!reconstructionResult.success) {
      console.error('[PAYMENT RECONSTRUCTION] Reconstruction failed:', reconstructionResult.error)
      return
    }
    console.log('[PAYMENT RECONSTRUCTION] Successfully reconstructed payment request:', reconstructionResult.paymentRequestId)
    paymentRequest = reconstructionResult.paymentRequest
  }

  if (!paymentRequest) {
    console.error('[PAYMENT WEBHOOK] Payment request is null after lookup/reconstruction')
    return
  }

  const expectedAccountId = paymentRequest.stripe_connect_account_id || null
  if ((expectedAccountId && eventAccountId !== expectedAccountId) || (!expectedAccountId && eventAccountId)) {
    console.error('[PAYMENT WEBHOOK] Invoice Checkout account mismatch')
    await markProcessedFn(supabase, eventId)
    return
  }
  if (metadata.payment_request_id && metadata.payment_request_id !== paymentRequest.id) return
  if (metadata.business_id && metadata.business_id !== paymentRequest.business_id) return
  if (metadata.lead_id && metadata.lead_id !== paymentRequest.lead_id) return
  if (session.payment_status !== 'paid') return
  if (session.amount_total != null && session.amount_total !== paymentRequest.amount_cents) return
  if (session.currency && paymentRequest.currency && session.currency.toLowerCase() !== paymentRequest.currency.toLowerCase()) return

  if (!authoritativePaymentIntent && paymentIntentId) {
    try {
      authoritativePaymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        {},
        expectedAccountId ? { stripeAccount: expectedAccountId } : undefined
      )
    } catch (piError) {
      console.error('[PAYMENT WEBHOOK] Failed to retrieve authoritative payment intent:', piError)
      return
    }
  }
  if (!authoritativePaymentIntent || authoritativePaymentIntent.status !== 'succeeded') return
  if (authoritativePaymentIntent.amount !== paymentRequest.amount_cents) return
  if (paymentRequest.currency && authoritativePaymentIntent.currency.toLowerCase() !== paymentRequest.currency.toLowerCase()) return
  if (paymentRequest.stripe_payment_intent_id && paymentRequest.stripe_payment_intent_id !== authoritativePaymentIntent.id) return

  const { data: linkedInvoice } = await supabase
    .from('billing_documents')
    .select('id, business_id, customer_id, total_cents, currency, status')
    .eq('payment_request_id', paymentRequest.id)
    .eq('document_type', 'invoice')
    .maybeSingle()
  if (!linkedInvoice) return
  if (linkedInvoice.business_id !== paymentRequest.business_id || linkedInvoice.customer_id !== paymentRequest.lead_id) return
  if (linkedInvoice.total_cents !== paymentRequest.amount_cents) return
  if (linkedInvoice.currency.toLowerCase() !== paymentRequest.currency.toLowerCase()) return
  if (metadata.invoice_id && metadata.invoice_id !== linkedInvoice.id) return

  const { data: business } = await supabase
    .from('businesses')
    .select('id, stripe_connect_account_id')
    .eq('id', paymentRequest.business_id)
    .maybeSingle()
  if (!business) return
  if (expectedAccountId && business.stripe_connect_account_id !== expectedAccountId) return

  console.log('[PAYMENT WEBHOOK] Found payment request:', paymentRequest.id)
  console.log('[PAYMENT WEBHOOK] Payment request current status:', paymentRequest.status)

  // Idempotency: skip if already paid
  if (paymentRequest.status === 'paid') {
    console.log('[PAYMENT WEBHOOK] Payment request already paid — skipping (idempotent)')
    await markProcessedFn(supabase, eventId)
    return
  }

  const updatePayload: any = { status: 'paid' }
  try {
    const { error: testError } = await supabase
      .from('payment_requests')
      .select('paid_at')
      .limit(1)
      .single()
    if (!testError) {
      updatePayload.paid_at = new Date().toISOString()
      console.log('[PAYMENT WEBHOOK] paid_at column exists, setting to:', updatePayload.paid_at)
    }
  } catch (e) {
    console.log('[PAYMENT WEBHOOK] paid_at column may not exist, skipping')
  }

  console.log('[PAYMENT WEBHOOK] Updating payment request with payload:', updatePayload)
  const { data: updatedPayment, error: updateError } = await supabase
    .from('payment_requests')
    .update(updatePayload)
    .eq('id', paymentRequest.id)
    .select()
    .single()

  if (updateError) {
    console.error('[PAYMENT WEBHOOK] Failed to update payment request:', updateError)
  } else {
    console.log('[PAYMENT WEBHOOK] Successfully updated payment request to paid')

    // Reconcile linked billing invoice
    try {
      const { data: linkedInvoice } = await supabase
        .from('billing_documents')
        .select('id, status')
        .eq('payment_request_id', paymentRequest.id)
        .eq('document_type', 'invoice')
        .maybeSingle()
      if (linkedInvoice && linkedInvoice.status !== 'paid') {
        await supabase
          .from('billing_documents')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', linkedInvoice.id)
        console.log('[PAYMENT WEBHOOK] Reconciled billing invoice to paid:', linkedInvoice.id)
      } else if (linkedInvoice && linkedInvoice.status === 'paid') {
        console.log('[PAYMENT WEBHOOK] Billing invoice already paid — skipping (idempotent)')
      }
    } catch (invoiceReconcileErr) {
      console.error('[PAYMENT WEBHOOK] Invoice reconciliation failed (non-fatal):', invoiceReconcileErr)
    }

    // Update lead status
    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('id, status, caller_phone')
        .eq('id', paymentRequest.lead_id)
        .single()
      if (lead) {
        const { applyCustomerStatusEvent } = await import('@/lib/customer-status-transitions')
        const nextStatus = applyCustomerStatusEvent(lead.status, 'payment_succeeded')
        if (nextStatus) {
          await supabase.from('leads').update({ status: nextStatus }).eq('id', paymentRequest.lead_id)
          console.log('[PAYMENT WEBHOOK] Updated lead status:', { leadId: lead.id, previousStatus: lead.status, newStatus: nextStatus })
        }
      }
    } catch (leadError) {
      console.error('[PAYMENT WEBHOOK] Exception during lead update (non-critical):', leadError)
    }

    // Timeline event
    try {
      const { data: leadForTimeline } = await supabase
        .from('leads')
        .select('caller_phone')
        .eq('id', paymentRequest.lead_id)
        .single()
      if (leadForTimeline) {
        await timelineEvents.paymentCompleted(paymentRequest.business_id, paymentRequest.lead_id, paymentRequest.id, paymentRequest.amount_cents)
        console.log('[PAYMENT WEBHOOK] Timeline event created successfully')
      }
    } catch (timelineError) {
      console.error('[PAYMENT WEBHOOK] Failed to create timeline event:', timelineError)
    }

    // Notification
    try {
      const { data: leadForNotification } = await supabase
        .from('leads')
        .select('caller_phone')
        .eq('id', paymentRequest.lead_id)
        .single()
      if (leadForNotification) {
        await notificationServiceServer.notifyPaymentCompleted(
          paymentRequest.business_id,
          paymentRequest.lead_id,
          leadForNotification.caller_phone,
          paymentRequest.amount_cents,
          paymentRequest.id
        )
        console.log('[PAYMENT WEBHOOK] Notification created successfully')
      }
    } catch (notificationError) {
      console.error('[PAYMENT WEBHOOK] Failed to create notification:', notificationError)
    }
  }

  await markProcessedFn(supabase, eventId)
  console.log('[PAYMENT WEBHOOK] ========== CHECKOUT.SESSION.COMPLETED END ==========')
}
