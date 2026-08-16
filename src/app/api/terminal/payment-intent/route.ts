import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import getStripe from '@/lib/stripe'
import { db, supabaseAdmin } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'

/**
 * POST /api/terminal/payment-intent
 * 
 * Creates a Stripe Terminal PaymentIntent for card_present payments.
 * 
 * Security:
 * - Requires valid Supabase session
 * - User must have an authorized business
 * - Business must have a connected Stripe account
 * - Amount is validated server-side
 * - Idempotency key prevents duplicate charges
 * 
 * Input:
 * {
 *   amountCents: number
 *   currency?: string (default: 'usd')
 *   leadId?: string
 *   jobId?: string
 *   description?: string
 * }
 * 
 * Output:
 * {
 *   paymentIntentId: string
 *   clientSecret: string
 *   localPaymentId: string
 * }
 */
export async function POST(request: NextRequest) {
  console.log('[TERMINAL_AUTH] endpoint=payment-intent')
  try {
    const body = await request.json()
    const { amountCents, currency = 'usd', leadId, jobId, description, terminalAttemptId } = body

    // Validate required fields
    if (!amountCents || typeof amountCents !== 'number') {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    if (amountCents <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    // Authenticate user (supports both bearer token and cookie auth)
    const user = await getAuthenticatedUser(request)

    if (!user) {
      console.error('[TERMINAL_AUTH] user_resolved=false')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[TERMINAL_AUTH] user_resolved=true')
    const userId = user.id
    console.log('[TerminalPaymentIntent] User authenticated:', userId)

    // Resolve authorized business
    const businessResult = await db.getBusinessByUserId(userId)

    if (!businessResult.found || !businessResult.business) {
      console.error('[TerminalPaymentIntent] No business found for user:', userId)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const business = businessResult.business
    console.log('[TerminalPaymentIntent] Business resolved:', business.id)

    // CRITICAL: Validate terminalAttemptId for durable attempt identity
    // If not provided, generate a new UUID.
    // Client should generate and reuse terminalAttemptId for the same operation.
    // Server generates random UUID only for truly new requests without client ID.
    const attemptId = terminalAttemptId || crypto.randomUUID()
    console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=payment_intent_api_start provided=' + (terminalAttemptId ? 'true' : 'false'))

    // Retrieve connected Stripe account ID
    const stripeAccountId = business.stripe_connect_account_id

    if (!stripeAccountId) {
      console.error('[TerminalPaymentIntent] No connected Stripe account for business:', business.id)
      return NextResponse.json({ error: 'Stripe Connect account not configured' }, { status: 400 })
    }

    // Verify the account is in a usable state
    if (business.stripe_connect_status !== 'connected') {
      console.error('[TerminalPaymentIntent] Stripe Connect account not in connected state:', business.stripe_connect_status)
      return NextResponse.json({ error: 'Stripe Connect account not ready' }, { status: 400 })
    }

    if (!business.stripe_charges_enabled) {
      console.error('[TerminalPaymentIntent] Stripe charges not enabled for business:', business.id)
      return NextResponse.json({ error: 'Stripe charges not enabled' }, { status: 400 })
    }

    // Validate lead ownership if provided
    if (leadId) {
      const { data: lead, error: leadError } = await supabaseAdmin
        .from('leads')
        .select('id, business_id')
        .eq('id', leadId)
        .maybeSingle()

      if (leadError || !lead) {
        console.error('[TerminalPaymentIntent] Lead not found:', leadId)
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
      }

      if (lead.business_id !== business.id) {
        console.error('[TerminalPaymentIntent] Lead not owned by business:', leadId, business.id)
        return NextResponse.json({ error: 'Lead not authorized' }, { status: 403 })
      }
    }

    // Validate job ownership if provided
    if (jobId) {
      const { data: job, error: jobError } = await supabaseAdmin
        .from('jobs')
        .select('id, business_id, status')
        .eq('id', jobId)
        .maybeSingle()

      if (jobError || !job) {
        console.error('[TerminalPaymentIntent] Job not found:', jobId)
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      if (job.business_id !== business.id) {
        console.error('[TerminalPaymentIntent] Job not owned by business:', jobId, business.id)
        return NextResponse.json({ error: 'Job not authorized' }, { status: 403 })
      }

      // Prevent payment for already completed jobs
      if (job.status === 'completed' || job.status === 'paid') {
        console.error('[TerminalPaymentIntent] Job already completed or paid:', jobId, job.status)
        return NextResponse.json({ error: 'Job already completed or paid' }, { status: 400 })
      }
    }

    // AUTHORITY GUARD: Check for unresolved terminal payment attempts BEFORE creating new PaymentIntent
    // This prevents duplicate charges even if client doesn't send terminalAttemptId
    console.log('[TAP_ATTEMPT] stage=authority_guard_start business_id=' + business.id)

    // Query for unresolved terminal payment attempts with same payment context
    // CRITICAL: No time-based filter - age does not determine financial safety
    // Only Stripe authoritative status determines if payment is still unresolved
    let guardQuery = supabaseAdmin
      .from('payment_requests')
      .select('id, status, stripe_payment_intent_id, terminal_attempt_id, amount_cents, currency, lead_id, job_id, created_at')
      .eq('business_id', business.id)
      .eq('payment_method_type', 'card_present')
      .in('status', ['pending', 'processing'])

    // Narrow conflict scope to same customer/job if provided
    if (leadId) {
      guardQuery = guardQuery.eq('lead_id', leadId)
    }
    if (jobId) {
      guardQuery = guardQuery.eq('job_id', jobId)
    }

    const { data: unresolvedAttempts, error: unresolvedError } = await guardQuery

    if (unresolvedError) {
      console.error('[TAP_ATTEMPT] stage=authority_guard_error error=' + unresolvedError.message)
      // Fail conservatively - if we can't check, don't allow new payment
      return NextResponse.json({
        error: 'Unable to verify payment status. Please try again.',
        retryable: true
      }, { status: 503 })
    }

    console.log('[TAP_ATTEMPT] stage=authority_guard_found unresolved_count=' + (unresolvedAttempts?.length || 0))

    // For each unresolved attempt, reconcile with Stripe authoritatively
    if (unresolvedAttempts && unresolvedAttempts.length > 0) {
      const stripe = getStripe()
      if (!stripe) {
        console.error('[TAP_ATTEMPT] stage=authority_guard_stripe_unavailable')
        return NextResponse.json({ error: 'Payment service unavailable' }, { status: 503 })
      }

      for (const attempt of unresolvedAttempts) {
        console.log('[TAP_ATTEMPT] stage=authority_guard_reconcile attempt_id=' + attempt.terminal_attempt_id + ' payment_intent_id=' + attempt.stripe_payment_intent_id + ' local_status=' + attempt.status)

        if (!attempt.stripe_payment_intent_id) {
          // No PaymentIntent ID - cannot reconcile, fail conservatively
          console.error('[TAP_ATTEMPT] stage=authority_guard_no_paymentintent attempt_id=' + attempt.terminal_attempt_id)
          return NextResponse.json({
            error: 'Unable to verify payment status. Please check your payment history before trying again.',
            unresolvedAttemptId: attempt.terminal_attempt_id
          }, { status: 409 })
        }

        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(
            attempt.stripe_payment_intent_id,
            {},
            { stripeAccount: stripeAccountId } as any
          )

          console.log('[TAP_ATTEMPT] stage=authority_guard_stripe_status attempt_id=' + attempt.terminal_attempt_id + ' stripe_status=' + paymentIntent.status)

          // Authoritative Stripe status determines safety
          if (paymentIntent.status === 'succeeded') {
            // Payment succeeded - resolve local and reject new PaymentIntent
            console.log('[TAP_ATTEMPT] stage=authority_guard_succeeded attempt_id=' + attempt.terminal_attempt_id)
            await supabaseAdmin
              .from('payment_requests')
              .update({ status: 'paid', paid_at: new Date().toISOString() })
              .eq('id', attempt.id)

            return NextResponse.json({
              error: 'Payment already completed',
              status: 'paid',
              message: 'This payment has already been completed',
              localPaymentId: attempt.id
            }, { status: 409 })
          } else if (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture' || paymentIntent.status === 'requires_confirmation' || paymentIntent.status === 'requires_action') {
            // Payment still processing - block new PaymentIntent
            console.log('[TAP_ATTEMPT] stage=authority_guard_processing attempt_id=' + attempt.terminal_attempt_id + ' stripe_status=' + paymentIntent.status)
            return NextResponse.json({
              error: 'Payment is still processing',
              status: 'processing',
              message: 'Previous payment is still being processed. Please wait.',
              unresolvedAttemptId: attempt.terminal_attempt_id
            }, { status: 409 })
          } else if (paymentIntent.status === 'canceled') {
            // Payment canceled - safe to proceed with new PaymentIntent
            console.log('[TAP_ATTEMPT] stage=authority_guard_canceled attempt_id=' + attempt.terminal_attempt_id)
            await supabaseAdmin
              .from('payment_requests')
              .update({ status: 'canceled' })
              .eq('id', attempt.id)
            // Continue to create new PaymentIntent
          } else if (paymentIntent.status === 'requires_payment_method') {
            // Payment failed before payment method - safe to proceed with new PaymentIntent
            console.log('[TAP_ATTEMPT] stage=authority_guard_requires_payment_method attempt_id=' + attempt.terminal_attempt_id)
            await supabaseAdmin
              .from('payment_requests')
              .update({ status: 'failed' })
              .eq('id', attempt.id)
            // Continue to create new PaymentIntent
          } else {
            // Unknown status - fail conservatively
            console.error('[TAP_ATTEMPT] stage=authority_guard_unknown_status attempt_id=' + attempt.terminal_attempt_id + ' stripe_status=' + paymentIntent.status)
            return NextResponse.json({
              error: 'Unable to verify payment status. Please check your payment history before trying again.',
              unresolvedAttemptId: attempt.terminal_attempt_id
            }, { status: 409 })
          }
        } catch (stripeError: any) {
          console.error('[TAP_ATTEMPT] stage=authority_guard_stripe_error attempt_id=' + attempt.terminal_attempt_id + ' error=' + stripeError.message)
          // If Stripe is unavailable, fail conservatively
          if (stripeError.type === 'StripeAPIError' || stripeError.type === 'StripeConnectionError') {
            return NextResponse.json({
              error: 'Payment service unavailable',
              retryable: true,
              message: 'Unable to verify payment status. Please try again.',
              unresolvedAttemptId: attempt.terminal_attempt_id
            }, { status: 503 })
          }
          // For other errors, fail conservatively
          return NextResponse.json({
            error: 'Unable to verify payment status. Please check your payment history before trying again.',
            unresolvedAttemptId: attempt.terminal_attempt_id
          }, { status: 409 })
        }
      }
    }

    console.log('[TAP_ATTEMPT] stage=authority_guard_complete no_blocking_attempts')

    // CRITICAL: Insert-first atomic claim pattern
    // Insert local payment_request record BEFORE creating Stripe PaymentIntent
    // This ensures atomicity via unique constraint on (business_id, terminal_attempt_id)
    // Winner creates Stripe PI, loser retrieves existing attempt
    const localPaymentId = randomUUID()
    const { error: insertError, data: insertedRecord } = await supabaseAdmin
      .from('payment_requests')
      .insert({
        id: localPaymentId,
        business_id: business.id,
        lead_id: leadId || null,
        conversation_id: null, // Terminal payments don't require a conversation
        amount_cents: amountCents,
        currency: currency,
        description: description || 'Terminal payment',
        status: 'pending',
        payment_method_type: 'card_present',
        stripe_payment_intent_id: null, // Will be set after Stripe creation
        stripe_connect_account_id: stripeAccountId,
        terminal_attempt_id: attemptId, // Durable attempt identity
        // payment_intent_client_secret NOT stored - only needed for immediate native retrieval
        // Storing client secrets longer than necessary is not ideal for security
        requested_by: userId,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
        job_id: jobId || null,
        token: null, // Terminal payments don't use payment links
      })
      .select('id, status, stripe_payment_intent_id')
      .single()

    if (insertError) {
      console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=atomic_claim_failed postgres_code=' + insertError.code)

      // Handle unique constraint violation - concurrent request with same terminalAttemptId
      if (insertError.code === '23505') {
        console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=atomic_claim_conflict fetching_existing')

        // Fetch the existing record that caused the conflict
        const { data: existingRecord, error: fetchError } = await supabaseAdmin
          .from('payment_requests')
          .select('id, status, stripe_payment_intent_id, terminal_attempt_id')
          .eq('business_id', business.id)
          .eq('terminal_attempt_id', attemptId)
          .single()

        if (fetchError || !existingRecord) {
          console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=atomic_claim_fetch_failed')
          return NextResponse.json({
            error: 'Unable to claim payment attempt. Please try again.',
            retryable: true
          }, { status: 503 })
        }

        console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=atomic_claim_recovered existing_id=' + existingRecord.id + ' existing_status=' + existingRecord.status + ' existing_pi=' + existingRecord.stripe_payment_intent_id)

        // Return existing attempt status to client
        if (existingRecord.status === 'paid') {
          return NextResponse.json({
            error: 'Payment already completed',
            status: 'paid',
            message: 'This payment has already been completed',
            localPaymentId: existingRecord.id
          }, { status: 409 })
        } else if (existingRecord.status === 'failed' || existingRecord.status === 'canceled') {
          // Existing attempt failed/canceled - client should generate new terminalAttemptId for retry
          console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=atomic_claim_existing_failed')
          return NextResponse.json({
            error: 'Previous attempt failed or was canceled',
            status: existingRecord.status,
            message: 'Please start a new payment attempt',
            localPaymentId: existingRecord.id
          }, { status: 409 })
        } else {
          // Existing attempt is pending/processing - return it to client
          if (existingRecord.stripe_payment_intent_id) {
            return NextResponse.json({
              error: 'Payment attempt already in progress',
              status: 'processing',
              message: 'A payment for this operation is already in progress',
              localPaymentId: existingRecord.id,
              paymentIntentId: existingRecord.stripe_payment_intent_id,
              clientSecret: '' // Not returned for security
            }, { status: 409 })
          } else {
            // Claim exists but Stripe PI not yet created - race in progress
            return NextResponse.json({
              error: 'Payment initialization in progress',
              status: 'initializing',
              message: 'Payment is being initialized. Please try again in a moment.',
              localPaymentId: existingRecord.id
            }, { status: 409 })
          }
        }
      } else {
        // Other database error
        console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=atomic_claim_db_error')
        return NextResponse.json({
          error: 'Unable to create payment attempt',
          retryable: true
        }, { status: 503 })
      }
    } else {
      console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=atomic_claim_success local_id=' + insertedRecord.id)
    }

    // Generate deterministic idempotency key using terminalAttemptId
    // This ensures Stripe idempotency even if client retries with same attempt ID
    const idempotencyKey = `terminal-payment-${business.id}-${attemptId}`
    console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' idempotency_key=' + idempotencyKey)

    // Create PaymentIntent with Stripe
    const stripe = getStripe()

    if (!stripe) {
      console.error('[TerminalPaymentIntent] Failed to initialize Stripe client')
      return NextResponse.json({ error: 'Payment service unavailable' }, { status: 503 })
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: currency,
        payment_method_types: ['card_present'],
        capture_method: 'automatic', // Terminal payments are captured automatically
        metadata: {
          business_id: business.id,
          user_id: userId,
          lead_id: leadId || '',
          job_id: jobId || '',
          payment_method_type: 'card_present',
          terminal_attempt_id: attemptId, // For webhook correlation
        },
      },
      {
        stripeAccount: stripeAccountId,
        idempotencyKey: idempotencyKey,
      }
    )

    console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=payment_intent_created stripe_payment_intent_id=' + paymentIntent.id)

    // Update local payment_request record with Stripe PaymentIntent ID
    const { error: updateError } = await supabaseAdmin
      .from('payment_requests')
      .update({
        stripe_payment_intent_id: paymentIntent.id
      })
      .eq('id', localPaymentId)

    if (updateError) {
      console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=payment_request_update_failed postgres_code=' + updateError.code)
      // PaymentIntent was created but local record update failed
      // This is recoverable - the PaymentIntent exists and can be retrieved via webhook or status check
      // Return success to client with PI ID
    } else {
      console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=payment_request_updated')
    }

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      localPaymentId: localPaymentId,
    })
  } catch (error) {
    console.error('[TerminalPaymentIntent] Unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
