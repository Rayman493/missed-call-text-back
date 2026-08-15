import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'
import { timelineEvents } from '@/lib/event-timeline'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log('[PAYMENT CANCEL] Cancellation request received for payment:', id)

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[PAYMENT CANCEL] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get payment request
    const { data: paymentRequest, error: paymentError } = await supabase
      .from('payment_requests')
      .select('id, business_id, lead_id, amount_cents, description, status, payment_provider, payment_method_type, stripe_checkout_session_id, stripe_payment_intent_id, stripe_connect_account_id, token, checkout_url, cancelled_at')
      .eq('id', id)
      .single()

    if (paymentError || !paymentRequest) {
      console.error('[PAYMENT CANCEL] Payment request not found:', paymentError)
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }

    console.log('[PAYMENT CANCEL] ============================================')
    console.log('[PAYMENT CANCEL] Payment ID:', paymentRequest.id)
    console.log('[PAYMENT CANCEL] Token:', paymentRequest.token ? '[REDACTED]' : null)
    console.log('[PAYMENT CANCEL] Previous Status:', paymentRequest.status)
    console.log('[PAYMENT CANCEL] Payment Provider:', paymentRequest.payment_provider)
    console.log('[PAYMENT CANCEL] Checkout URL:', paymentRequest.checkout_url ? '[REDACTED]' : null)
    console.log('[PAYMENT CANCEL] Cancelled At (before):', paymentRequest.cancelled_at)
    console.log('[PAYMENT CANCEL] ============================================')

    // Verify user owns the business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id')
      .eq('id', paymentRequest.business_id)
      .single()

    if (businessError || !business || business.user_id !== user.id) {
      console.error('[PAYMENT CANCEL] Unauthorized: user does not own this payment request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check if already cancelled (idempotent - defensive: handle both spellings)
    if (paymentRequest.status === 'cancelled' || paymentRequest.status === 'canceled') {
      console.log('[PAYMENT CANCEL] Payment request already cancelled, returning success, status=', paymentRequest.status)
      return NextResponse.json({
        id: paymentRequest.id,
        status: paymentRequest.status,
        message: 'Payment request already cancelled'
      })
    }

    // Check if already paid
    if (paymentRequest.status === 'paid') {
      console.error('[PAYMENT CANCEL] Cannot cancel paid payment request')
      return NextResponse.json({ error: 'Cannot cancel a paid payment request' }, { status: 400 })
    }

    // CRITICAL: For Tap to Pay payments, check Stripe PaymentIntent BEFORE local cancellation
    if (paymentRequest.payment_method_type === 'card_present' && paymentRequest.stripe_payment_intent_id) {
      console.log('[PAYMENT CANCEL] Tap to Pay payment - checking Stripe PaymentIntent:', paymentRequest.stripe_payment_intent_id)

      const stripe = getStripe()
      if (!stripe) {
        console.error('[PAYMENT CANCEL] Stripe is not configured')
        return NextResponse.json({ error: 'Payment service unavailable' }, { status: 503 })
      }

      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          paymentRequest.stripe_payment_intent_id,
          {},
          paymentRequest.stripe_connect_account_id ? { stripeAccount: paymentRequest.stripe_connect_account_id } as any : undefined
        )

        console.log('[PAYMENT CANCEL] Stripe PaymentIntent status:', paymentIntent.status)

        // If PaymentIntent already succeeded, refuse cancellation and reconcile to paid
        if (paymentIntent.status === 'succeeded') {
          console.log('[PAYMENT CANCEL] PaymentIntent already succeeded, refusing cancellation')

          // Reconcile local state to paid
          const { error: updateError } = await supabase
            .from('payment_requests')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString()
            })
            .eq('id', id)

          if (updateError) {
            console.error('[PAYMENT CANCEL] Failed to reconcile to paid:', updateError)
            return NextResponse.json({ error: 'Payment already completed but failed to update local status' }, { status: 500 })
          }

          // Update lead status to paid
          try {
            await supabase
              .from('leads')
              .update({ status: 'paid' })
              .eq('id', paymentRequest.lead_id)
            console.log('[PAYMENT CANCEL] Updated lead status to paid')
          } catch (leadError) {
            console.error('[PAYMENT CANCEL] Exception during lead update (non-critical):', leadError)
          }

          return NextResponse.json({
            error: 'Payment already completed',
            status: 'paid',
            message: 'This payment has already been completed and cannot be canceled'
          }, { status: 409 })
        }

        // If PaymentIntent is processing, refuse cancellation
        if (paymentIntent.status === 'processing') {
          console.log('[PAYMENT CANCEL] PaymentIntent is processing, refusing cancellation')
          return NextResponse.json({
            error: 'Payment is currently processing',
            status: 'processing',
            message: 'This payment is currently being processed and cannot be canceled'
          }, { status: 409 })
        }

        // If PaymentIntent is in intermediate state, refuse cancellation
        if (['requires_confirmation', 'requires_action', 'requires_capture'].includes(paymentIntent.status)) {
          console.log('[PAYMENT CANCEL] PaymentIntent in intermediate state:', paymentIntent.status, ', refusing cancellation')
          return NextResponse.json({
            error: 'Payment requires action',
            status: paymentIntent.status,
            message: 'This payment requires additional action and cannot be canceled'
          }, { status: 409 })
        }

        // If PaymentIntent is requires_payment_method or canceled, safe to cancel locally
        if (paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'canceled') {
          console.log('[PAYMENT CANCEL] PaymentIntent is safe to cancel:', paymentIntent.status)
          // Continue with local cancellation below
        }
      } catch (stripeError: any) {
        console.error('[PAYMENT CANCEL] Failed to retrieve PaymentIntent:', stripeError)

        // If Stripe is unavailable, do NOT cancel locally to prevent double-charge risk
        if (stripeError.type === 'StripeAPIError' || stripeError.type === 'StripeConnectionError') {
          return NextResponse.json({
            error: 'Stripe service unavailable',
            retryable: true,
            message: 'Unable to verify payment status. Please try again.'
          }, { status: 503 })
        }

        // For other errors, allow cancellation with warning
        console.warn('[PAYMENT CANCEL] Continuing with local cancellation despite Stripe error')
      }
    }

    // Cancel Stripe checkout session if applicable
    if (paymentRequest.payment_provider === 'stripe' && paymentRequest.stripe_checkout_session_id) {
      console.log('[PAYMENT CANCEL] Canceling Stripe checkout session')
      try {
        const stripe = getStripe()
        if (stripe) {
          await stripe.checkout.sessions.expire(paymentRequest.stripe_checkout_session_id)
          console.log('[PAYMENT CANCEL] Stripe checkout session expired')
        }
      } catch (stripeError) {
        console.error('[PAYMENT CANCEL] Failed to expire Stripe session:', stripeError)
        // Non-critical error, continue with cancellation
      }
    }

    // Update payment request status
    const { error: updateError } = await supabase
      .from('payment_requests')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      console.error('[PAYMENT CANCEL] Failed to update payment request:', updateError)
      return NextResponse.json({ error: 'Failed to cancel payment request' }, { status: 500 })
    }

    // Fetch updated row to verify
    const { data: updatedPayment, error: fetchError } = await supabase
      .from('payment_requests')
      .select('id, status, cancelled_at, token')
      .eq('id', id)
      .single()

    console.log('[PAYMENT CANCEL] ============================================')
    console.log('[PAYMENT CANCEL] New Status:', updatedPayment?.status)
    console.log('[PAYMENT CANCEL] Cancelled At (after):', updatedPayment?.cancelled_at)
    console.log('[PAYMENT CANCEL] Token (verified):', updatedPayment?.token ? '[REDACTED]' : null)
    console.log('[PAYMENT CANCEL] Update Error:', updateError)
    console.log('[PAYMENT CANCEL] Fetch Error:', fetchError)
    console.log('[PAYMENT CANCEL] ============================================')

    // Update lead payment status
    await supabase
      .from('leads')
      .update({
        payment_status: 'cancelled',
        last_payment_request_id: null,
        last_payment_amount_cents: null,
        last_payment_requested_at: null
      })
      .eq('id', paymentRequest.lead_id)

    // Create timeline event
    try {
      await timelineEvents.paymentRequestCanceled(
        paymentRequest.business_id,
        paymentRequest.lead_id,
        paymentRequest.id,
        paymentRequest.amount_cents,
        paymentRequest.description
      )
      console.log('[PAYMENT CANCEL] Timeline event created')
    } catch (timelineError) {
      console.error('[PAYMENT CANCEL] Failed to create timeline event:', timelineError)
      // Non-critical error, continue
    }

    console.log('[PAYMENT CANCEL] Payment request cancelled successfully')

    return NextResponse.json({
      id: paymentRequest.id,
      status: 'cancelled',
      message: 'Payment request cancelled successfully'
    })
  } catch (error) {
    console.error('[PAYMENT CANCEL] Unhandled error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel payment request' },
      { status: 500 }
    )
  }
}
