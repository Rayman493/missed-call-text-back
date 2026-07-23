import { NextRequest, NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'
import { validateStateTransition } from '@/lib/terminal/state-transition-guards'

/**
 * GET /api/terminal/attempt-status?terminalAttemptId=...
 *
 * Retrieve the current status of a payment attempt by terminalAttemptId.
 * Used for ambiguous outcome recovery and status checking.
 *
 * Query params:
 * - terminalAttemptId: The durable attempt ID
 *
 * Returns:
 * - status: 'paid' | 'pending' | 'failed' | 'canceled' | 'processing' | 'not_found'
 * - paymentIntentId?: string
 * - localPaymentId?: string
 * - message?: string
 */
export async function GET(request: NextRequest) {
  console.log('[TAP_ATTEMPT] stage=attempt_status_start')
  try {
    const { searchParams } = new URL(request.url)
    const terminalAttemptId = searchParams.get('terminalAttemptId')

    if (!terminalAttemptId || typeof terminalAttemptId !== 'string') {
      return NextResponse.json({ error: 'Invalid terminalAttemptId' }, { status: 400 })
    }

    console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=attempt_status_check')

    // Authenticate user
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find payment request by terminalAttemptId
    const { data: paymentRequest, error: paymentRequestError } = await supabaseAdmin
      .from('payment_requests')
      .select('id, business_id, status, stripe_payment_intent_id, stripe_connect_account_id')
      .eq('terminal_attempt_id', terminalAttemptId)
      .maybeSingle()

    if (paymentRequestError || !paymentRequest) {
      console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=attempt_not_found')
      return NextResponse.json({
        status: 'not_found',
        message: 'Payment attempt not found'
      })
    }

    // Verify user owns this payment request
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('user_id, stripe_connect_account_id')
      .eq('id', paymentRequest.business_id)
      .single()

    if (!business || business.user_id !== user.id) {
      console.error('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=unauthorized_user')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=local_record_found local_status=' + paymentRequest.status)

    // If local status is already terminal, return it
    if (paymentRequest.status === 'paid') {
      return NextResponse.json({
        status: 'paid',
        paymentIntentId: paymentRequest.stripe_payment_intent_id,
        localPaymentId: paymentRequest.id,
        message: 'Payment succeeded'
      })
    }

    if (paymentRequest.status === 'failed') {
      return NextResponse.json({
        status: 'failed',
        paymentIntentId: paymentRequest.stripe_payment_intent_id,
        localPaymentId: paymentRequest.id,
        message: 'Payment failed'
      })
    }

    if (paymentRequest.status === 'canceled') {
      return NextResponse.json({
        status: 'canceled',
        paymentIntentId: paymentRequest.stripe_payment_intent_id,
        localPaymentId: paymentRequest.id,
        message: 'Payment canceled'
      })
    }

    // For pending status, verify with Stripe
    if (paymentRequest.stripe_payment_intent_id) {
      const stripe = getStripe()
      if (!stripe) {
        return NextResponse.json({ error: 'Payment service unavailable' }, { status: 503 })
      }

      const trustedStripeAccountId = business.stripe_connect_account_id

      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          paymentRequest.stripe_payment_intent_id,
          {},
          { stripeAccount: trustedStripeAccountId } as any
        )

        console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stripe_status=' + paymentIntent.status)

        // Map Stripe status to attempt status
        if (paymentIntent.status === 'succeeded') {
          // Validate state transition before updating
          const validation = validateStateTransition(paymentRequest.status, 'paid')
          if (!validation.allowed) {
            console.error('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' invalid_transition=' + validation.reason)
            return NextResponse.json({
              status: paymentRequest.status,
              paymentIntentId: paymentIntent.id,
              localPaymentId: paymentRequest.id,
              message: 'Invalid state transition'
            }, { status: 409 })
          }

          // Update local record
          await supabaseAdmin
            .from('payment_requests')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
            })
            .eq('id', paymentRequest.id)

          return NextResponse.json({
            status: 'paid',
            paymentIntentId: paymentIntent.id,
            localPaymentId: paymentRequest.id,
            message: 'Payment succeeded'
          })
        } else if (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture' || paymentIntent.status === 'requires_confirmation' || paymentIntent.status === 'requires_action') {
          return NextResponse.json({
            status: 'processing',
            paymentIntentId: paymentIntent.id,
            localPaymentId: paymentRequest.id,
            message: 'Payment is still processing'
          })
        } else if (paymentIntent.status === 'canceled') {
          await supabaseAdmin
            .from('payment_requests')
            .update({ status: 'canceled' })
            .eq('id', paymentRequest.id)

          return NextResponse.json({
            status: 'canceled',
            paymentIntentId: paymentIntent.id,
            localPaymentId: paymentRequest.id,
            message: 'Payment canceled'
          })
        } else if (paymentIntent.status === 'requires_payment_method') {
          await supabaseAdmin
            .from('payment_requests')
            .update({ status: 'failed' })
            .eq('id', paymentRequest.id)

          return NextResponse.json({
            status: 'failed',
            paymentIntentId: paymentIntent.id,
            localPaymentId: paymentRequest.id,
            message: 'Payment failed - requires payment method'
          })
        }
      } catch (stripeError) {
        console.error('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stripe_retrieve_failed error=' + (stripeError instanceof Error ? stripeError.message : 'Unknown'))
        // Return local status if Stripe is unavailable
        return NextResponse.json({
          status: 'pending',
          paymentIntentId: paymentRequest.stripe_payment_intent_id,
          localPaymentId: paymentRequest.id,
          message: 'Unable to verify payment status with Stripe'
        })
      }
    }

    // No PaymentIntent yet - still in early stage
    return NextResponse.json({
      status: 'pending',
      localPaymentId: paymentRequest.id,
      message: 'Payment intent not yet created'
    })

  } catch (error) {
    console.error('[TAP_ATTEMPT] stage=attempt_status_error error=' + (error instanceof Error ? error.message : 'Unknown'))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
