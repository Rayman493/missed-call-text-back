import { NextRequest, NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'
import { validateStateTransition } from '@/lib/terminal/state-transition-guards'

/**
 * POST /api/terminal/reconcile-payment
 *
 * Server-side reconciliation for Terminal payments after native success.
 *
 * This is a fallback to ensure the local payment_request is updated to 'paid'
 * even if the webhook is delayed or missed. The webhook remains authoritative,
 * but this provides immediate UX feedback after a confirmed native payment.
 *
 * Security:
 * - Requires valid Supabase session
 * - User must own the payment request
 * - PaymentIntent is verified server-side in connected-account context
 * - Idempotent - safe to call multiple times
 *
 * Input:
 * {
 *   paymentIntentId: string
 * }
 *
 * Output:
 * {
 *   status: 'paid' | 'pending' | 'not_found'
 *   paymentRequestId?: string
 * }
 */
export async function POST(request: NextRequest) {
  console.log('[TERMINAL_RECONCILIATION] stage=reconciliation_start')
  try {
    const body = await request.json()
    const { paymentIntentId, terminalAttemptId } = body

    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return NextResponse.json({ error: 'Invalid paymentIntentId' }, { status: 400 })
    }

    console.log('[TERMINAL_RECONCILIATION] payment_intent_id=' + paymentIntentId + (terminalAttemptId ? ' attempt_id=' + terminalAttemptId : ''))

    // Authenticate user
    const authResult = await getAuthenticatedUser(request)
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = authResult

    // Find payment request by PaymentIntent ID
    const { data: paymentRequest, error: paymentRequestError } = await supabaseAdmin
      .from('payment_requests')
      .select('id, business_id, lead_id, status, amount_cents, stripe_connect_account_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle()

    if (paymentRequestError || !paymentRequest) {
      console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=local_record_not_found')
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }

    console.log('[TERMINAL_RECONCILIATION] stage=local_record_found payment_request_id=' + paymentRequest.id + ' local_status_before=' + paymentRequest.status)

    // Verify user owns this payment request by checking business ownership
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('user_id, stripe_connect_account_id')
      .eq('id', paymentRequest.business_id)
      .single()

    if (!business || business.user_id !== user.id) {
      console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=unauthorized_user')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Use the connected account ID from the trusted business record, not the payment_request
    // This prevents client from spoofing stripeAccount
    const trustedStripeAccountId = business.stripe_connect_account_id
    if (!trustedStripeAccountId) {
      console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=no_connected_account')
      return NextResponse.json({ error: 'Business has no connected Stripe account' }, { status: 400 })
    }

    console.log('[TERMINAL_RECONCILIATION] trusted_account_id=' + trustedStripeAccountId)

    // If already paid, return success (idempotent)
    if (paymentRequest.status === 'paid') {
      console.log('[TERMINAL_RECONCILIATION] stage=reconciliation_complete reason=already_paid')
      return NextResponse.json({
        status: 'paid',
        paymentRequestId: paymentRequest.id,
      })
    }

    // Verify PaymentIntent status server-side in connected-account context
    console.log('[TERMINAL_RECONCILIATION] stage=stripe_retrieve_start')
    const stripe = getStripe()
    if (!stripe) {
      console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=stripe_not_configured')
      return NextResponse.json({ error: 'Payment service unavailable' }, { status: 503 })
    }

    console.log('[TERMINAL_RECONCILIATION] stage=stripe_retrieve_start')
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      {}, // API params (empty)
      { stripeAccount: trustedStripeAccountId } // Stripe request options
    )

    console.log('[TERMINAL_RECONCILIATION] stage=stripe_retrieve_success stripe_status=' + paymentIntent.status)

    // Verify the retrieved PaymentIntent ID matches the request
    if (paymentIntent.id !== paymentIntentId) {
      console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=payment_intent_mismatch')
      return NextResponse.json({ error: 'PaymentIntent ID mismatch' }, { status: 400 })
    }

    // Reconciliation state machine based on server-verified PaymentIntent status
    switch (paymentIntent.status) {
      case 'succeeded': {
        console.log('[TERMINAL_RECONCILIATION] stage=local_update_start local_status=paid')
        
        // Validate state transition before updating
        const validation = validateStateTransition(paymentRequest.status, 'paid')
        if (!validation.allowed) {
          console.error('[TERMINAL_RECONCILIATION] invalid_transition=' + validation.reason)
          return NextResponse.json({
            status: paymentRequest.status,
            paymentRequestId: paymentRequest.id,
            message: 'Invalid state transition'
          }, { status: 409 })
        }

        const { error: updateError } = await supabaseAdmin
          .from('payment_requests')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', paymentRequest.id)

        if (updateError) {
          console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=local_update_failed error=' + updateError.message)
          return NextResponse.json({ error: 'Failed to update payment request' }, { status: 500 })
        }

        // Update lead payment status if applicable
        if (paymentRequest.lead_id) {
          console.log('[TERMINAL_RECONCILIATION] stage=lead_update_start lead_id=' + paymentRequest.lead_id)
          const { data: lead } = await supabaseAdmin
            .from('leads')
            .select('id, status, caller_phone')
            .eq('id', paymentRequest.lead_id)
            .single()

          if (lead) {
            await supabaseAdmin
              .from('leads')
              .update({
                payment_status: 'paid',
                last_payment_paid_at: new Date().toISOString(),
              })
              .eq('id', paymentRequest.lead_id)

            // Update lead status to paid if appropriate
            if (lead.status === 'payment_requested' || lead.status === 'new' || lead.status === 'active') {
              await supabaseAdmin
                .from('leads')
                .update({ status: 'paid' })
                .eq('id', paymentRequest.lead_id)
            }
            console.log('[TERMINAL_RECONCILIATION] stage=lead_update_complete')
          }
        }

        console.log('[TERMINAL_RECONCILIATION] stage=reconciliation_complete status=paid local_status_after=paid')
        return NextResponse.json({
          status: 'paid',
          paymentRequestId: paymentRequest.id,
        })
      }

      case 'canceled': {
        console.log('[TERMINAL_RECONCILIATION] stage=local_update_start local_status=canceled')
        await supabaseAdmin
          .from('payment_requests')
          .update({ status: 'canceled' })
          .eq('id', paymentRequest.id)

        console.log('[TERMINAL_RECONCILIATION] stage=reconciliation_complete status=canceled local_status_after=canceled')
        return NextResponse.json({
          status: 'canceled',
          paymentRequestId: paymentRequest.id,
        })
      }

      case 'requires_payment_method': {
        console.log('[TERMINAL_RECONCILIATION] stage=local_update_start local_status=failed')
        await supabaseAdmin
          .from('payment_requests')
          .update({ status: 'failed' })
          .eq('id', paymentRequest.id)

        console.log('[TERMINAL_RECONCILIATION] stage=reconciliation_complete status=failed local_status_after=failed')
        return NextResponse.json({
          status: 'failed',
          paymentRequestId: paymentRequest.id,
        })
      }

      case 'processing': {
        console.log('[TERMINAL_RECONCILIATION] stage=reconciliation_complete status=processing local_status_unchanged')
        return NextResponse.json({
          status: 'processing',
          paymentRequestId: paymentRequest.id,
        })
      }

      case 'requires_capture': {
        // Terminal payments use automatic capture, so this should not occur
        // If it does, it's an unusual state that needs investigation
        console.warn('[TERMINAL_RECONCILIATION] stage=reconciliation_complete status=requires_capture unexpected_for_terminal local_status_unchanged')
        return NextResponse.json({
          status: 'processing',
          paymentRequestId: paymentRequest.id,
        })
      }

      default: {
        console.warn('[TERMINAL_RECONCILIATION] stage=reconciliation_complete status=' + paymentIntent.status + ' unknown local_status_unchanged')
        return NextResponse.json({
          status: 'pending',
          paymentRequestId: paymentRequest.id,
        })
      }
    }
  } catch (error) {
    console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=exception error=' + (error instanceof Error ? error.message : 'Unknown'))
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
