/**
 * Reconcile a Payment Request Stripe Checkout Session completion.
 *
 * Used by the checkout.session.completed webhook handler to process one-time
 * Checkout payments WITHOUT requiring session.customer (which is only needed
 * for subscription provisioning).
 *
 * Idempotent: if the payment request is already paid, no duplicate
 * processing occurs.
 */
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'
import { isAuthoritativePaidCorrection, validateStateTransition } from '@/lib/terminal/state-transition-guards'

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

export interface PaymentRequestCheckoutReconciliationResult {
  status: 'processed' | 'retryable'
  reason?: string
}

export function isPaymentRequestCheckoutSession(session: Stripe.Checkout.Session): boolean {
  const metadata = session.metadata || {}
  return session.mode === 'payment' || metadata.source === 'billing_invoice' || Boolean(metadata.payment_request_id) || Boolean(metadata.invoice_id)
}

export async function reconcilePaymentRequestCheckout(ctx: ReconciliationContext): Promise<PaymentRequestCheckoutReconciliationResult> {
  const { supabase, stripe, session, eventId, eventAccountId, reconstructFn, markProcessedFn } = ctx
  const sessionId = session.id
  const paymentIntentId = session.payment_intent as string
  const metadata = session.metadata || {}
  const isBillingInvoiceCheckout = metadata.source === 'billing_invoice' || Boolean(metadata.invoice_id)

  const processed = async (reason?: string): Promise<PaymentRequestCheckoutReconciliationResult> => {
    const marked = await markProcessedFn(supabase, eventId)
    if (marked === false) {
      return { status: 'retryable', reason: 'event_processed_update_failed' }
    }
    return { status: 'processed', reason }
  }
  const retryable = (reason: string): PaymentRequestCheckoutReconciliationResult => ({ status: 'retryable', reason })

  try {
    console.log('[PAYMENT WEBHOOK] Checkout session ID:', sessionId)
    console.log('[PAYMENT WEBHOOK] Payment Intent ID:', paymentIntentId)
    console.log('[PAYMENT WEBHOOK] Session metadata:', JSON.stringify(metadata))

    const metadataPaymentRequestId = metadata.payment_request_id
    console.log('[PAYMENT WEBHOOK] payment_request_id from session metadata:', metadataPaymentRequestId)

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
        return retryable('payment_request_lookup_failed')
      }

      if (!isBillingInvoiceCheckout) {
        console.log('[PAYMENT WEBHOOK] No persisted payment request for Checkout Session:', sessionId)
        return processed('payment_request_not_found')
      }

      console.log('[PAYMENT RECONSTRUCTION] Payment request not found, attempting reconstruction from Stripe metadata')
      const reconstructionResult = await reconstructFn(supabase, sessionId, paymentIntentId, metadata, session, stripe, eventAccountId)
      if (!reconstructionResult.success || !reconstructionResult.paymentRequest) {
        console.error('[PAYMENT RECONSTRUCTION] Reconstruction failed:', reconstructionResult.error)
        return retryable(reconstructionResult.reason || reconstructionResult.error || 'payment_request_reconstruction_failed')
      }
      console.log('[PAYMENT RECONSTRUCTION] Successfully reconstructed payment request:', reconstructionResult.paymentRequestId)
      paymentRequest = reconstructionResult.paymentRequest
    }

    if (!paymentRequest) return retryable('payment_request_not_found')

    const expectedAccountId = paymentRequest.stripe_connect_account_id || null
    if ((expectedAccountId && eventAccountId !== expectedAccountId) || (!expectedAccountId && eventAccountId)) {
      console.error('[PAYMENT WEBHOOK] Checkout account mismatch')
      return processed('stripe_account_mismatch')
    }
    if (metadataPaymentRequestId && metadataPaymentRequestId !== paymentRequest.id) return processed('payment_request_metadata_mismatch')
    if (metadata.business_id && metadata.business_id !== paymentRequest.business_id) return processed('business_metadata_mismatch')
    if (metadata.lead_id && metadata.lead_id !== paymentRequest.lead_id) return processed('lead_metadata_mismatch')
    if (session.payment_status !== 'paid') return processed('checkout_not_paid')
    if (session.amount_total != null && session.amount_total !== paymentRequest.amount_cents) return processed('amount_mismatch')
    if (session.currency && paymentRequest.currency && session.currency.toLowerCase() !== paymentRequest.currency.toLowerCase()) return processed('currency_mismatch')
    if (!paymentIntentId) return processed('payment_intent_missing')

    let authoritativePaymentIntent: Stripe.PaymentIntent
    try {
      authoritativePaymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        {},
        expectedAccountId ? { stripeAccount: expectedAccountId } : undefined
      )
    } catch (piError) {
      console.error('[PAYMENT WEBHOOK] Failed to retrieve authoritative payment intent:', piError)
      return retryable('payment_intent_retrieval_failed')
    }

    const authoritativePaymentRequestId = authoritativePaymentIntent.metadata?.payment_request_id
    if (authoritativePaymentRequestId && authoritativePaymentRequestId !== paymentRequest.id) return processed('payment_request_identity_mismatch')
    if (!authoritativePaymentIntent || authoritativePaymentIntent.status !== 'succeeded') return processed('payment_intent_not_succeeded')
    if (authoritativePaymentIntent.amount !== paymentRequest.amount_cents) return processed('amount_mismatch')
    if (paymentRequest.currency && authoritativePaymentIntent.currency.toLowerCase() !== paymentRequest.currency.toLowerCase()) return processed('currency_mismatch')
    if (paymentRequest.stripe_payment_intent_id && paymentRequest.stripe_payment_intent_id !== authoritativePaymentIntent.id) return processed('payment_intent_mismatch')

    const { data: linkedInvoice, error: linkedInvoiceError } = await supabase
      .from('billing_documents')
      .select('id, business_id, customer_id, total_cents, currency, status')
      .eq('payment_request_id', paymentRequest.id)
      .eq('document_type', 'invoice')
      .maybeSingle()
    if (linkedInvoiceError) return retryable('invoice_lookup_failed')
    if (isBillingInvoiceCheckout && !linkedInvoice) return processed('invoice_not_found')
    if (linkedInvoice) {
      if (linkedInvoice.business_id !== paymentRequest.business_id || linkedInvoice.customer_id !== paymentRequest.lead_id) return processed('invoice_ownership_mismatch')
      if (linkedInvoice.total_cents !== paymentRequest.amount_cents) return processed('amount_mismatch')
      if (linkedInvoice.currency.toLowerCase() !== paymentRequest.currency.toLowerCase()) return processed('currency_mismatch')
      if (metadata.invoice_id && metadata.invoice_id !== linkedInvoice.id) return processed('invoice_metadata_mismatch')
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, stripe_connect_account_id')
      .eq('id', paymentRequest.business_id)
      .maybeSingle()
    if (businessError) return retryable('business_lookup_failed')
    if (!business) return processed('business_not_found')
    if (expectedAccountId && business.stripe_connect_account_id !== expectedAccountId) return processed('stripe_account_mismatch')

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id, status, caller_phone')
      .eq('id', paymentRequest.lead_id)
      .maybeSingle()
    if (leadError) return retryable('lead_lookup_failed')
    if (!lead || lead.business_id !== paymentRequest.business_id) return processed('lead_ownership_mismatch')

    console.log('[PAYMENT WEBHOOK] Found payment request:', paymentRequest.id)
    console.log('[PAYMENT WEBHOOK] Payment request current status:', paymentRequest.status)

    if (paymentRequest.status === 'paid') {
      console.log('[PAYMENT WEBHOOK] Payment request already paid — skipping (idempotent)')
      return processed('already_paid')
    }

    const transitionValidation = validateStateTransition(paymentRequest.status, 'paid')
    if (!transitionValidation.allowed && !isAuthoritativePaidCorrection(paymentRequest.status)) {
      console.error('[PAYMENT WEBHOOK] Invalid state transition:', transitionValidation.reason)
      return processed('invalid_state_transition')
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
      .neq('status', 'paid')
      .select()
      .maybeSingle()

    if (updateError) {
      console.error('[PAYMENT WEBHOOK] Failed to update payment request:', updateError)
      return retryable('payment_request_update_failed')
    }

    if (!updatedPayment) {
      const { data: currentPayment, error: currentPaymentError } = await supabase
        .from('payment_requests')
        .select('status')
        .eq('id', paymentRequest.id)
        .maybeSingle()
      if (currentPaymentError) return retryable('payment_request_status_lookup_failed')
      if (currentPayment?.status === 'paid') return processed('already_paid')
      return processed('concurrent_status_transition')
    }

    console.log('[PAYMENT WEBHOOK] Successfully updated payment request to paid')

    if (linkedInvoice && linkedInvoice.status !== 'paid') {
      try {
        await supabase
          .from('billing_documents')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', linkedInvoice.id)
        console.log('[PAYMENT WEBHOOK] Reconciled billing invoice to paid:', linkedInvoice.id)
      } catch (invoiceReconcileErr) {
        console.error('[PAYMENT WEBHOOK] Invoice reconciliation failed (non-fatal):', invoiceReconcileErr)
      }
    } else if (linkedInvoice?.status === 'paid') {
      console.log('[PAYMENT WEBHOOK] Billing invoice already paid — skipping (idempotent)')
    }

    try {
      const { applyCustomerStatusEvent } = await import('@/lib/customer-status-transitions')
      const nextStatus = applyCustomerStatusEvent(lead.status, 'payment_succeeded')
      if (nextStatus) {
        await supabase.from('leads').update({ status: nextStatus }).eq('id', paymentRequest.lead_id)
        console.log('[PAYMENT WEBHOOK] Updated lead status:', { leadId: lead.id, previousStatus: lead.status, newStatus: nextStatus })
      }
    } catch (leadUpdateError) {
      console.error('[PAYMENT WEBHOOK] Exception during lead update (non-critical):', leadUpdateError)
    }

    try {
      await timelineEvents.paymentCompleted(paymentRequest.business_id, paymentRequest.lead_id, paymentRequest.id, paymentRequest.amount_cents)
      console.log('[PAYMENT WEBHOOK] Timeline event created successfully')
    } catch (timelineError) {
      console.error('[PAYMENT WEBHOOK] Failed to create timeline event:', timelineError)
    }

    try {
      await notificationServiceServer.notifyPaymentCompleted(
        paymentRequest.business_id,
        paymentRequest.lead_id,
        lead.caller_phone || '',
        paymentRequest.amount_cents,
        paymentRequest.id
      )
      console.log('[PAYMENT WEBHOOK] Notification created successfully')
    } catch (notificationError) {
      console.error('[PAYMENT WEBHOOK] Failed to create notification:', notificationError)
    }

    const result = await processed()
    console.log('[PAYMENT WEBHOOK] ========== CHECKOUT.SESSION.COMPLETED END ==========')
    return result
  } catch (error) {
    console.error('[PAYMENT WEBHOOK] Unexpected reconciliation error:', error)
    return retryable('unexpected_reconciliation_error')
  }
}

export const reconcileBillingInvoiceCheckout = reconcilePaymentRequestCheckout
