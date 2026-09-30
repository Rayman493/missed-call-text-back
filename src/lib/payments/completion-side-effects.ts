/**
 * Canonical payment-completed side effects.
 *
 * A payment request can become 'paid' through several authoritative paths:
 * Stripe webhooks, checkout session reconcile, per-payment reconcile, Tap to
 * Pay reconcile/attempt-status, list auto-reconcile, stale-attempt recovery,
 * the cancel route's reconcile-to-paid branches, or manual mark-paid.
 *
 * Whichever path performs the transition must ensure the same downstream
 * effects happen exactly once:
 *   1. linked billing invoice -> status 'paid' + paid_at
 *   2. lead/customer status reconciliation (payment_status, lifecycle status)
 *   3. paymentCompleted timeline event
 *   4. payment_completed notification (idempotency key: pay_{paymentRequestId})
 *
 * This helper is idempotent and safe to call repeatedly or concurrently:
 * it re-reads the payment request and no-ops unless status === 'paid', the
 * invoice update is guarded by .neq('status','paid'), lead transitions go
 * through applyCustomerStatusEvent (protected statuses and no-ops return
 * null), and the notification insert is arbitrated by the existing
 * (business_id, type, idempotency_key) unique constraint.
 *
 * IMPORTANT: callers remain responsible for proving the payment is actually
 * paid (Stripe-verified success, manual mark-paid authorization, etc.) before
 * mutating payment_requests.status. This helper only performs side effects
 * for a payment request that is already marked paid.
 */
import { supabaseAdmin } from '@/lib/supabase/admin'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'
import { applyCustomerStatusEvent } from '@/lib/customer-status-transitions'
import { getCanonicalCustomerDisplayName } from '@/lib/customer-context'

export async function ensurePaymentCompletedSideEffects(paymentRequestId: string): Promise<void> {
  try {
    const { data: paymentRequest, error: paymentRequestError } = await supabaseAdmin
      .from('payment_requests')
      .select('id, business_id, lead_id, status, amount_cents, currency, paid_at')
      .eq('id', paymentRequestId)
      .maybeSingle()

    if (paymentRequestError || !paymentRequest) {
      console.error('[PAYMENT SIDE EFFECTS] Payment request not found:', paymentRequestId, paymentRequestError)
      return
    }

    if (paymentRequest.status !== 'paid') {
      return
    }

    const paidAt = paymentRequest.paid_at || new Date().toISOString()

    // 1. Linked invoice reconciliation.
    //    Only mutate the invoice when it provably belongs to the same business
    //    and matches the payment's amount/currency — never reconcile a
    //    cross-business or amount-mismatched document.
    try {
      const { data: linkedInvoice, error: invoiceError } = await supabaseAdmin
        .from('billing_documents')
        .select('id, business_id, customer_id, total_cents, currency, status')
        .eq('payment_request_id', paymentRequest.id)
        .eq('document_type', 'invoice')
        .maybeSingle()

      if (invoiceError) {
        console.error('[PAYMENT SIDE EFFECTS] Linked invoice lookup failed (non-fatal):', invoiceError)
      } else if (linkedInvoice) {
        if (linkedInvoice.business_id !== paymentRequest.business_id) {
          console.error('[PAYMENT SIDE EFFECTS] Linked invoice business mismatch — skipping invoice reconcile', {
            payment_request_id: paymentRequest.id,
            invoice_id: linkedInvoice.id,
          })
        } else if (linkedInvoice.total_cents !== paymentRequest.amount_cents) {
          console.error('[PAYMENT SIDE EFFECTS] Linked invoice amount mismatch — skipping invoice reconcile', {
            payment_request_id: paymentRequest.id,
            invoice_id: linkedInvoice.id,
          })
        } else if (
          linkedInvoice.currency &&
          paymentRequest.currency &&
          linkedInvoice.currency.toLowerCase() !== paymentRequest.currency.toLowerCase()
        ) {
          console.error('[PAYMENT SIDE EFFECTS] Linked invoice currency mismatch — skipping invoice reconcile', {
            payment_request_id: paymentRequest.id,
            invoice_id: linkedInvoice.id,
          })
        } else if (linkedInvoice.status !== 'paid') {
          const { error: invoiceUpdateError } = await supabaseAdmin
            .from('billing_documents')
            .update({ status: 'paid', paid_at: paidAt })
            .eq('id', linkedInvoice.id)
            .neq('status', 'paid')

          if (invoiceUpdateError) {
            console.error('[PAYMENT SIDE EFFECTS] Invoice update failed (non-fatal):', invoiceUpdateError)
          } else {
            console.log('[PAYMENT SIDE EFFECTS] Reconciled linked invoice to paid:', linkedInvoice.id)
          }
        }
      }
    } catch (invoiceErr) {
      console.error('[PAYMENT SIDE EFFECTS] Invoice reconciliation failed (non-fatal):', invoiceErr)
    }

    // 2. Lead/customer status reconciliation (same semantics as the webhook
    //    paid path: payment_status + last_payment_paid_at + canonical
    //    lifecycle transition via applyCustomerStatusEvent).
    let leadPhone = ''
    let leadName: string | undefined
    if (paymentRequest.lead_id) {
      try {
        const { data: lead, error: leadError } = await supabaseAdmin
          .from('leads')
          .select('id, business_id, status, caller_phone, contact_name, name, raw_metadata')
          .eq('id', paymentRequest.lead_id)
          .maybeSingle()

        if (leadError) {
          console.error('[PAYMENT SIDE EFFECTS] Lead lookup failed (non-fatal):', leadError)
        } else if (lead && lead.business_id === paymentRequest.business_id) {
          leadPhone = lead.caller_phone || ''
          leadName = getCanonicalCustomerDisplayName(lead) || undefined

          const leadUpdate: Record<string, any> = {
            payment_status: 'paid',
            last_payment_paid_at: paidAt,
          }
          const nextStatus = applyCustomerStatusEvent(lead.status, 'payment_succeeded')
          if (nextStatus) {
            leadUpdate.status = nextStatus
          }

          const { error: leadUpdateError } = await supabaseAdmin
            .from('leads')
            .update(leadUpdate)
            .eq('id', lead.id)

          if (leadUpdateError) {
            console.error('[PAYMENT SIDE EFFECTS] Lead update failed (non-fatal):', leadUpdateError)
          }
        }
      } catch (leadErr) {
        console.error('[PAYMENT SIDE EFFECTS] Lead reconciliation failed (non-fatal):', leadErr)
      }
    }

    // 3. Timeline event (console-only artifact — safe to emit more than once).
    try {
      await timelineEvents.paymentCompleted(
        paymentRequest.business_id,
        paymentRequest.lead_id,
        paymentRequest.id,
        paymentRequest.amount_cents
      )
    } catch (timelineError) {
      console.error('[PAYMENT SIDE EFFECTS] Timeline event failed (non-fatal):', timelineError)
    }

    // 4. payment_completed notification — deduped atomically by the existing
    //    (business_id, type, idempotency_key='pay_{paymentId}') unique
    //    constraint; repeat calls reuse the existing row and do not re-push.
    try {
      await notificationServiceServer.notifyPaymentCompleted(
        paymentRequest.business_id,
        paymentRequest.lead_id,
        leadPhone,
        paymentRequest.amount_cents,
        paymentRequest.id,
        leadName
      )
    } catch (notificationError) {
      console.error('[PAYMENT SIDE EFFECTS] Notification failed (non-fatal):', notificationError)
    }
  } catch (error) {
    console.error('[PAYMENT SIDE EFFECTS] Unexpected error (non-fatal):', error)
  }
}
