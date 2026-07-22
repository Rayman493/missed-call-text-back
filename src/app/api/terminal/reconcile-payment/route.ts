import { NextRequest, NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

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
  console.log('[TERMINAL_RECONCILIATION] stage=api_start')
  try {
    const body = await request.json()
    const { paymentIntentId } = body

    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return NextResponse.json({ error: 'Invalid paymentIntentId' }, { status: 400 })
    }

    console.log('[TERMINAL_RECONCILIATION] payment_intent_id=' + paymentIntentId)

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
      console.error('[TERMINAL_RECONCILIATION] local_record_not_found')
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }

    console.log('[TERMINAL_RECONCILIATION] local_record_found=true payment_request_id=' + paymentRequest.id)
    console.log('[TERMINAL_RECONCILIATION] previous_status=' + paymentRequest.status)

    // Verify user owns this payment request by checking business ownership
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('user_id, stripe_connect_account_id')
      .eq('id', paymentRequest.business_id)
      .single()

    if (!business || business.user_id !== user.id) {
      console.error('[TERMINAL_RECONCILIATION] unauthorized_user')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Use the connected account ID from the trusted business record, not the payment_request
    // This prevents client from spoofing stripeAccount
    const trustedStripeAccountId = business.stripe_connect_account_id
    if (!trustedStripeAccountId) {
      console.error('[TERMINAL_RECONCILIATION] no_connected_account')
      return NextResponse.json({ error: 'Business has no connected Stripe account' }, { status: 400 })
    }

    console.log('[TERMINAL_RECONCILIATION] trusted_account_id=' + trustedStripeAccountId)

    // If already paid, return success (idempotent)
    if (paymentRequest.status === 'paid') {
      console.log('[TERMINAL_RECONCILIATION] already_paid=true')
      return NextResponse.json({
        status: 'paid',
        paymentRequestId: paymentRequest.id,
      })
    }

    // Verify PaymentIntent status server-side in connected-account context
    const stripe = getStripe()
    if (!stripe) {
      console.error('[TERMINAL_RECONCILIATION] stripe_not_configured')
      return NextResponse.json({ error: 'Payment service unavailable' }, { status: 503 })
    }

    console.log('[TERMINAL_RECONCILIATION] stage=stripe_verify')
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      {}, // API params (empty)
      { stripeAccount: trustedStripeAccountId } // Stripe request options
    )

    console.log('[TERMINAL_RECONCILIATION] stripe_status=' + paymentIntent.status)

    // Verify the retrieved PaymentIntent ID matches the request
    if (paymentIntent.id !== paymentIntentId) {
      console.error('[TERMINAL_RECONCILIATION] payment_intent_mismatch')
      return NextResponse.json({ error: 'PaymentIntent ID mismatch' }, { status: 400 })
    }

    // Reconciliation state machine based on server-verified PaymentIntent status
    switch (paymentIntent.status) {
      case 'succeeded': {
        console.log('[TERMINAL_RECONCILIATION] status=succeeded marking_paid')
        const { error: updateError } = await supabaseAdmin
          .from('payment_requests')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', paymentRequest.id)

        if (updateError) {
          console.error('[TERMINAL_RECONCILIATION] update_failed error=' + updateError.message)
          return NextResponse.json({ error: 'Failed to update payment request' }, { status: 500 })
        }

        // Update lead payment status if applicable
        if (paymentRequest.lead_id) {
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
          }
        }

        console.log('[TERMINAL_RECONCILIATION] stage=complete status=paid')
        return NextResponse.json({
          status: 'paid',
          paymentRequestId: paymentRequest.id,
        })
      }

      case 'canceled': {
        console.log('[TERMINAL_RECONCILIATION] status=canceled marking_canceled')
        await supabaseAdmin
          .from('payment_requests')
          .update({ status: 'canceled' })
          .eq('id', paymentRequest.id)

        return NextResponse.json({
          status: 'canceled',
          paymentRequestId: paymentRequest.id,
        })
      }

      case 'requires_payment_method': {
        console.log('[TERMINAL_RECONCILIATION] status=requires_payment_method marking_failed')
        await supabaseAdmin
          .from('payment_requests')
          .update({ status: 'failed' })
          .eq('id', paymentRequest.id)

        return NextResponse.json({
          status: 'failed',
          paymentRequestId: paymentRequest.id,
        })
      }

      case 'processing': {
        console.log('[TERMINAL_RECONCILIATION] status=processing remaining_pending')
        return NextResponse.json({
          status: 'processing',
          paymentRequestId: paymentRequest.id,
        })
      }

      case 'requires_capture': {
        // Terminal payments use automatic capture, so this should not occur
        // If it does, it's an unusual state that needs investigation
        console.warn('[TERMINAL_RECONCILIATION] status=requires_capture unexpected_for_terminal')
        return NextResponse.json({
          status: 'processing',
          paymentRequestId: paymentRequest.id,
        })
      }

      default: {
        console.warn('[TERMINAL_RECONCILIATION] unknown_status=' + paymentIntent.status)
        return NextResponse.json({
          status: 'pending',
          paymentRequestId: paymentRequest.id,
        })
      }
    }
  } catch (error) {
    console.error('[TERMINAL_RECONCILIATION] error=' + (error instanceof Error ? error.message : 'Unknown'))
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
