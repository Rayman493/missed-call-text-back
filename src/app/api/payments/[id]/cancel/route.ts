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

    // Cancel Stripe checkout session if applicable.
    //
    // SAFETY CONTRACT:
    //   Local status must NOT become `cancelled` unless ReplyFlow has evidence
    //   that the Stripe checkout can no longer accept payment.
    //
    // Terminal states that permit local cancellation:
    //   - session.status === 'expired' (already closed by Stripe)
    //   - session.status === 'open' AND expire() succeeds (closed now)
    //   - session.status === 'complete' AND payment_status === 'unpaid' (terminal —
    //     customer completed checkout flow but payment failed; session cannot
    //     accept payment again per Stripe SDK: Status = 'complete' | 'expired' | 'open')
    //   - session.status === 'complete' AND payment_status === 'no_payment_required'
    //     (terminal — no payment needed)
    //
    // States that REFUSE local cancellation:
    //   - session.status === 'complete' AND payment_status === 'paid' → reconcile to paid
    //   - resource_missing → provider inconsistency, return 503 retryable
    //   - any other Stripe error → return 503 retryable
    //
    // No local mutation (status, cancelled_at, timeline event) occurs before
    // provider safety is established.
    if (paymentRequest.payment_provider === 'stripe' && paymentRequest.stripe_checkout_session_id) {
      const sessionId = paymentRequest.stripe_checkout_session_id
      const connectedAccountId = paymentRequest.stripe_connect_account_id
      // Redact session ID tail for logs (keep last 8 chars for correlation)
      const sessionIdSafe = sessionId.length > 8 ? `...${sessionId.slice(-8)}` : '[REDACTED]'
      console.log('[PAYMENT CANCEL] Canceling Stripe checkout session', {
        payment_id: paymentRequest.id,
        session_id: sessionIdSafe,
        provider: 'stripe',
        stripe_account_context: connectedAccountId ? connectedAccountId : 'platform',
        business_connect_account_id: connectedAccountId || null,
      })

      const stripe = getStripe()
      if (!stripe) {
        console.error('[PAYMENT CANCEL] Stripe is not configured', {
          payment_id: paymentRequest.id,
          session_id: sessionIdSafe,
          local_mutation_performed: false,
        })
        return NextResponse.json({
          error: 'Unable to verify cancellation with Stripe. Please try again.',
          retryable: true,
        }, { status: 503 })
      }

      // CRITICAL: The Checkout Session was created on the connected account
      // (see /api/payments/create route: stripe.checkout.sessions.create(..., { stripeAccount })).
      // All subsequent operations (retrieve, expire) MUST use the SAME
      // connected account context, otherwise Stripe returns resource_missing
      // because the session does not exist on the platform account.
      const accountOptions = connectedAccountId
        ? { stripeAccount: connectedAccountId } as any
        : undefined

      // Step 1: Retrieve session state with correct account context.
      // This is the provider safety check — we must know the session's
      // terminal state before any local mutation.
      let session: any
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId, accountOptions)
        console.log('[PAYMENT CANCEL] Retrieved session state:', {
          session_id: sessionIdSafe,
          session_state: session.status,
          payment_status: session.payment_status,
        })
      } catch (retrieveError: any) {
        const errorCode = retrieveError?.code
        const statusCode = retrieveError?.statusCode
        const isResourceMissing = errorCode === 'resource_missing'

        console.error('[PAYMENT CANCEL] Failed to retrieve Stripe session', {
          payment_id: paymentRequest.id,
          session_id: sessionIdSafe,
          stripe_account_context: connectedAccountId || 'platform',
          session_retrieval_result: isResourceMissing ? 'resource_missing' : 'error',
          expire_result: isResourceMissing ? 'resource_missing' : 'other_error',
          stripe_error_code: errorCode,
          stripe_status_code: statusCode,
          stripe_error_type: retrieveError?.type,
          local_mutation_performed: false,
        })

        if (isResourceMissing) {
          // resource_missing: session does not exist in this account context.
          // This is NOT proof the session is expired or closed — it could still
          // be open on a historical/disconnected connected account and could
          // still accept payment via the raw Stripe checkout URL.
          //
          // SAFETY: Do NOT mark locally cancelled. Return retryable error.
          console.warn('[PAYMENT CANCEL] resource_missing — refusing local cancellation for safety', {
            session_id: sessionIdSafe,
            account_context: connectedAccountId || 'platform',
            note: 'Session not found in this account context. It may exist on a historical connected account and could still accept payment. Local cancellation refused.',
          })
        } else {
          // Other Stripe errors (API error, connection error, etc.)
          console.error('[PAYMENT CANCEL] Stripe error — refusing local cancellation for safety', {
            stripe_error_type: retrieveError?.type,
          })
        }

        // Either way: no local mutation. Return retryable provider-state error.
        return NextResponse.json({
          error: 'Unable to verify cancellation with Stripe. Please try again.',
          retryable: true,
        }, { status: 503 })
      }

      // Step 2: Establish safe terminal state based on retrieved session.
      const sessionStatus = session.status // 'open' | 'complete' | 'expired'
      const paymentStatus = session.payment_status // 'paid' | 'unpaid' | 'no_payment_required'

      // Case: complete + paid → refuse cancellation, reconcile to paid
      if (sessionStatus === 'complete' && paymentStatus === 'paid') {
        console.error('[PAYMENT CANCEL] Checkout session already paid — refusing cancellation')

        // Reconcile local state to paid (this is a safe mutation — payment is confirmed)
        const { error: paidUpdateError } = await supabase
          .from('payment_requests')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString()
          })
          .eq('id', id)

        if (paidUpdateError) {
          console.error('[PAYMENT CANCEL] Failed to reconcile to paid:', paidUpdateError)
        }

        // Update lead status to paid
        try {
          await supabase
            .from('leads')
            .update({ status: 'paid' })
            .eq('id', paymentRequest.lead_id)
        } catch (leadError) {
          console.error('[PAYMENT CANCEL] Exception during lead update (non-critical):', leadError)
        }

        return NextResponse.json({
          error: 'Payment already completed',
          status: 'paid',
          message: 'This payment has already been completed and cannot be canceled'
        }, { status: 409 })
      }

      // Case: expired → already safely closed, proceed to local cancellation
      if (sessionStatus === 'expired') {
        console.log('[PAYMENT CANCEL] Session already expired — safe to cancel locally (idempotent)', {
          session_id: sessionIdSafe,
          expire_result: 'already_expired',
        })
        // Fall through to local cancellation below.
      }

      // Case: complete + unpaid OR complete + no_payment_required → terminal.
      // Per Stripe SDK: Status = 'complete' | 'expired' | 'open'.
      // A 'complete' session is terminal — the customer has finished the
      // checkout flow and cannot re-complete it. If payment_status is 'unpaid',
      // payment failed but the session is closed and cannot accept payment again.
      // Safe to cancel locally.
      else if (sessionStatus === 'complete' && (paymentStatus === 'unpaid' || paymentStatus === 'no_payment_required')) {
        console.log('[PAYMENT CANCEL] Session complete with non-paid status — terminal, safe to cancel locally', {
          session_id: sessionIdSafe,
          session_state: sessionStatus,
          payment_status: paymentStatus,
          expire_result: 'terminal_complete_unpaid',
        })
        // Fall through to local cancellation below.
      }

      // Case: open → must expire it with the SAME connected account context
      else if (sessionStatus === 'open') {
        try {
          await stripe.checkout.sessions.expire(sessionId, accountOptions)
          console.log('[PAYMENT CANCEL] Stripe checkout session expired successfully', {
            session_id: sessionIdSafe,
            expire_result: 'success',
          })
          // Fall through to local cancellation below.
        } catch (expireError: any) {
          const errorCode = expireError?.code
          const statusCode = expireError?.statusCode
          const isResourceMissing = errorCode === 'resource_missing'

          console.error('[PAYMENT CANCEL] Failed to expire Stripe session', {
            payment_id: paymentRequest.id,
            session_id: sessionIdSafe,
            session_state: sessionStatus,
            stripe_account_context: connectedAccountId || 'platform',
            expire_result: isResourceMissing ? 'resource_missing' : 'other_error',
            stripe_error_code: errorCode,
            stripe_status_code: statusCode,
            stripe_error_type: expireError?.type,
            local_mutation_performed: false,
          })

          // expire() failed — we cannot prove the session is closed.
          // Do NOT cancel locally. Return retryable provider-state error.
          return NextResponse.json({
            error: 'Unable to verify cancellation with Stripe. Please try again.',
            retryable: true,
          }, { status: 503 })
        }
      }

      // Unknown session status — conservative: refuse cancellation
      else {
        console.error('[PAYMENT CANCEL] Unknown session status — refusing cancellation for safety', {
          session_id: sessionIdSafe,
          session_state: sessionStatus,
          payment_status: paymentStatus,
          local_mutation_performed: false,
        })
        return NextResponse.json({
          error: 'Unable to verify cancellation with Stripe. Please try again.',
          retryable: true,
        }, { status: 503 })
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
