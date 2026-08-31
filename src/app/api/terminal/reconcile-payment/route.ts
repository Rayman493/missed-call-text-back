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
    const { data: paymentRequestData, error: paymentRequestError } = await supabaseAdmin
      .from('payment_requests')
      .select('id, business_id, lead_id, status, amount_cents, stripe_connect_account_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle()

    let paymentRequest = paymentRequestData

    if (paymentRequestError || !paymentRequest) {
      console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=local_record_not_found payment_intent_id=' + paymentIntentId)

      // CRITICAL FIX: Attempt to recover by terminal_attempt_id from PaymentIntent metadata
      // This handles the case where the local record update failed during payment-intent creation
      console.log('[TERMINAL_RECONCILIATION] stage=recovery_attempt_by_terminal_attempt_id')

      // SAFETY: Must first get the user's business to prevent cross-business recovery
      // Get user's businesses to find the one with Stripe Connect
      const { data: userBusinesses, error: businessesError } = await supabaseAdmin
        .from('businesses')
        .select('id, stripe_connect_account_id')
        .eq('user_id', user.id)

      if (businessesError || !userBusinesses || userBusinesses.length === 0) {
        console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=no_business_for_user')
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      // Find the business with a connected Stripe account
      const userBusiness = userBusinesses.find(b => b.stripe_connect_account_id)
      if (!userBusiness) {
        console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=no_connected_account_for_user')
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      const trustedStripeAccountId = userBusiness.stripe_connect_account_id

      // Retrieve PaymentIntent from the user's connected account to get terminal_attempt_id
      const stripe = getStripe()
      if (!stripe) {
        console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=stripe_not_available_for_recovery')
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      let paymentIntentWithMetadata
      try {
        paymentIntentWithMetadata = await stripe.paymentIntents.retrieve(
          paymentIntentId,
          {},
          { stripeAccount: trustedStripeAccountId }
        )
      } catch (retrieveError) {
        console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=pi_retrieve_failed_for_recovery')
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      // SAFETY: Verify terminal_attempt_id exists in metadata
      if (!paymentIntentWithMetadata.metadata?.terminal_attempt_id) {
        console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=no_terminal_attempt_id_in_metadata')
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      const terminalAttemptId = paymentIntentWithMetadata.metadata.terminal_attempt_id

      // SAFETY: Look up payment_request by terminal_attempt_id AND user's business_id
      // This prevents cross-business recovery
      const { data: recoveredRequests, error: recoveryError } = await supabaseAdmin
        .from('payment_requests')
        .select('id, business_id, lead_id, status, amount_cents, stripe_connect_account_id, stripe_payment_intent_id')
        .eq('terminal_attempt_id', terminalAttemptId)
        .eq('business_id', userBusiness.id)
        .eq('payment_method_type', 'card_present')

      if (recoveryError || !recoveredRequests || recoveredRequests.length === 0) {
        console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=no_record_for_terminal_attempt_id business_id=' + userBusiness.id)
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      // SAFETY: Fail if multiple records have the same terminal_attempt_id (should not happen with unique constraint)
      if (recoveredRequests.length > 1) {
        console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=duplicate_terminal_attempt_id count=' + recoveredRequests.length)
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      const recoveredRequest = recoveredRequests[0]

      // SAFETY: Validate amount and currency match
      if (recoveredRequest.amount_cents !== paymentIntentWithMetadata.amount) {
        console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=amount_mismatch local=' + recoveredRequest.amount_cents + ' stripe=' + paymentIntentWithMetadata.amount)
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      // SAFETY: Fail if recovered row already has a DIFFERENT non-null stripe_payment_intent_id
      if (recoveredRequest.stripe_payment_intent_id && recoveredRequest.stripe_payment_intent_id !== paymentIntentId) {
        console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=already_has_different_pi existing=' + recoveredRequest.stripe_payment_intent_id + ' requested=' + paymentIntentId)
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      // If recovered row already has the SAME stripe_payment_intent_id, idempotent success
      if (recoveredRequest.stripe_payment_intent_id === paymentIntentId) {
        console.log('[TERMINAL_RECONCILIATION] stage=recovery_idempotent stripe_payment_intent_id_already_set')
        paymentRequest = recoveredRequest
      } else {
        // SAFETY: Use conditional update to prevent race conditions
        // Only update if stripe_payment_intent_id is still null (atomic operation)
        const { error: recoveryUpdateError } = await supabaseAdmin
          .from('payment_requests')
          .update({ stripe_payment_intent_id: paymentIntentId })
          .eq('id', recoveredRequest.id)
          .is('stripe_payment_intent_id', null)

        if (recoveryUpdateError) {
          console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=recovery_update_failed postgres_code=' + recoveryUpdateError.code)
          // If the update failed because the value is no longer null, another process updated it
          // Try to retrieve again to see if it now has the correct value
          const { data: recheckRequest } = await supabaseAdmin
            .from('payment_requests')
            .select('id, business_id, lead_id, status, amount_cents, stripe_connect_account_id, stripe_payment_intent_id')
            .eq('id', recoveredRequest.id)
            .single()

          if (!recheckRequest) {
            console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=recheck_failed')
            return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
          }

          // If recheck shows it now has the correct PI, continue (idempotent)
          if (recheckRequest.stripe_payment_intent_id === paymentIntentId) {
            console.log('[TERMINAL_RECONCILIATION] stage=recovery_idempotent_after_race stripe_payment_intent_id_now_set')
            paymentRequest = recheckRequest
          } else {
            // It has a different PI or is still null - fail safe
            console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=update_failed_and_not_correct_pi current=' + recheckRequest.stripe_payment_intent_id)
            return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
          }
        } else {
          console.log('[TERMINAL_RECONCILIATION] stage=recovery_update_success')
          paymentRequest = recoveredRequest
        }
      }
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
            const { error: leadPaymentStatusError } = await supabaseAdmin
              .from('leads')
              .update({
                payment_status: 'paid',
                last_payment_paid_at: new Date().toISOString(),
              })
              .eq('id', paymentRequest.lead_id)

            if (leadPaymentStatusError) {
              console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=lead_payment_status_update_failed error=' + leadPaymentStatusError.message)
              return NextResponse.json({ error: 'Failed to update lead payment status' }, { status: 500 })
            }

            // Update lead status to paid if appropriate
            if (lead.status === 'payment_requested' || lead.status === 'new' || lead.status === 'active') {
              const { error: leadStatusError } = await supabaseAdmin
                .from('leads')
                .update({ status: 'paid' })
                .eq('id', paymentRequest.lead_id)

              if (leadStatusError) {
                console.error('[TERMINAL_RECONCILIATION] stage=reconciliation_failure reason=lead_status_update_failed error=' + leadStatusError.message)
                return NextResponse.json({ error: 'Failed to update lead status' }, { status: 500 })
              }
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
