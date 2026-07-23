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
    // If not provided, generate a new UUID. This is safe because:
    // 1. The service layer reuses localStorage unresolved attempt ID
    // 2. If a new UUID is generated here, it won't exist in the database
    // 3. The subsequent check for existing attempts will find nothing
    // 4. A new PaymentIntent will be created (which is correct for a new attempt)
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

    // Check for existing payment request with same terminalAttemptId
    // This is the authoritative duplicate prevention mechanism
    if (terminalAttemptId) {
      const { data: existingAttempt } = await supabaseAdmin
        .from('payment_requests')
        .select('id, status, stripe_payment_intent_id, created_at, amount_cents, currency, lead_id, job_id')
        .eq('business_id', business.id)
        .eq('terminal_attempt_id', attemptId)
        .maybeSingle()

      if (existingAttempt) {
        console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=existing_attempt_found local_status=' + existingAttempt.status + ' payment_intent_id=' + existingAttempt.stripe_payment_intent_id)

        // CRITICAL: Validate immutable fields match the original attempt
        // If immutable fields differ, reject to prevent silent mutation
        if (existingAttempt.amount_cents !== amountCents) {
          console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=amount_mismatch original=' + existingAttempt.amount_cents + ' new=' + amountCents)
          return NextResponse.json({
            error: 'attempt_conflict',
            message: 'Payment amount differs from original attempt. Please start a new payment.',
          }, { status: 409 })
        }

        if (existingAttempt.currency !== currency) {
          console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=currency_mismatch original=' + existingAttempt.currency + ' new=' + currency)
          return NextResponse.json({
            error: 'attempt_conflict',
            message: 'Payment currency differs from original attempt. Please start a new payment.',
          }, { status: 409 })
        }

        // Optional fields: if provided in new request, they must match original
        if (leadId && existingAttempt.lead_id !== leadId) {
          console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=lead_mismatch original=' + existingAttempt.lead_id + ' new=' + leadId)
          return NextResponse.json({
            error: 'attempt_conflict',
            message: 'Payment customer differs from original attempt. Please start a new payment.',
          }, { status: 409 })
        }

        if (jobId && existingAttempt.job_id !== jobId) {
          console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=job_mismatch original=' + existingAttempt.job_id + ' new=' + jobId)
          return NextResponse.json({
            error: 'attempt_conflict',
            message: 'Payment job differs from original attempt. Please start a new payment.',
          }, { status: 409 })
        }

        // If existing attempt has a PaymentIntent, retrieve its Stripe status
        if (existingAttempt.stripe_payment_intent_id) {
          try {
            const stripe = getStripe()
            if (stripe) {
              const paymentIntent = await stripe.paymentIntents.retrieve(
                existingAttempt.stripe_payment_intent_id,
                {},
                { stripeAccount: stripeAccountId } as any
              )

              console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stripe_status=' + paymentIntent.status)

              // Return existing attempt state - do NOT create new PaymentIntent
              if (paymentIntent.status === 'succeeded') {
                return NextResponse.json({
                  paymentIntentId: existingAttempt.stripe_payment_intent_id,
                  clientSecret: '', // Not returned for security
                  localPaymentId: existingAttempt.id,
                  status: 'succeeded',
                  message: 'Payment already succeeded'
                })
              } else if (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_capture' || paymentIntent.status === 'requires_confirmation' || paymentIntent.status === 'requires_action') {
                return NextResponse.json({
                  paymentIntentId: existingAttempt.stripe_payment_intent_id,
                  clientSecret: '', // Not returned for security
                  localPaymentId: existingAttempt.id,
                  status: 'processing',
                  message: 'Payment is still processing'
                }, { status: 409 })
              } else if (paymentIntent.status === 'canceled') {
                // Previous attempt canceled - allow new PaymentIntent creation below
                console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' previous_attempt_canceled allowing_new_paymentintent')
              } else if (paymentIntent.status === 'requires_payment_method') {
                // Previous attempt failed before payment method - this is NOT a terminal state for the same PaymentIntent
                // The same PaymentIntent can be reused for collection
                console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' previous_attempt_requires_payment_method reusing_paymentintent')
                return NextResponse.json({
                  paymentIntentId: existingAttempt.stripe_payment_intent_id,
                  clientSecret: '', // Not returned - client must re-request
                  localPaymentId: existingAttempt.id,
                  status: 'requires_payment_method',
                  message: 'Payment requires payment method - retry collection'
                }, { status: 409 })
              }
            }
          } catch (stripeError) {
            console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stripe_retrieve_failed error=' + (stripeError instanceof Error ? stripeError.message : 'Unknown'))
            // If we can't verify, be conservative and return the existing attempt
            return NextResponse.json({
              paymentIntentId: existingAttempt.stripe_payment_intent_id,
              clientSecret: '',
              localPaymentId: existingAttempt.id,
              status: 'unknown',
              message: 'Unable to verify payment status. Please try again later.'
            }, { status: 409 })
          }
        } else {
          // Existing attempt without PaymentIntent - likely failed before creation
          console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' existing_attempt_no_paymentintent allowing_new_paymentintent')
        }
      }
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

    // Create local payment_request record with terminalAttemptId
    const localPaymentId = randomUUID()
    const { error: insertError } = await supabaseAdmin
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
        stripe_payment_intent_id: paymentIntent.id,
        stripe_connect_account_id: stripeAccountId,
        terminal_attempt_id: attemptId, // Durable attempt identity
        // payment_intent_client_secret NOT stored - only needed for immediate native retrieval
        // Storing client secrets longer than necessary is not ideal for security
        requested_by: userId,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
        job_id: jobId || null,
        token: null, // Terminal payments don't use payment links
      })

    if (insertError) {
      console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=payment_request_insert_failed postgres_code=' + insertError.code)

      // Handle unique constraint violation - concurrent request with same terminalAttemptId
      if (insertError.code === '23505') {
        console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=unique_constraint_violation fetching_existing')

        // Fetch the existing record that caused the conflict
        const { data: existingRecord } = await supabaseAdmin
          .from('payment_requests')
          .select('id, stripe_payment_intent_id, status')
          .eq('business_id', business.id)
          .eq('terminal_attempt_id', attemptId)
          .single()

        if (existingRecord) {
          console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=existing_record_recovered payment_intent_id=' + existingRecord.stripe_payment_intent_id)

          // Return the existing PaymentIntent - Stripe idempotency ensures it's the same
          return NextResponse.json({
            paymentIntentId: existingRecord.stripe_payment_intent_id,
            clientSecret: paymentIntent.client_secret, // Return fresh client secret
            localPaymentId: existingRecord.id,
          })
        }
      }

      console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=payment_request_insert_failed message=' + insertError.message)

      // Cancel the PaymentIntent since local persistence failed
      // This prevents orphaned PaymentIntents
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id, {
          stripeAccount: stripeAccountId,
        } as any)
        console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=canceled_orphaned_payment_intent')
      } catch (cancelError) {
        console.error('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=cancel_payment_intent_failed')
        // Continue with error response even if cancel fails
      }

      // Return safe structured error - never raw database details
      return NextResponse.json({
        error: 'local_payment_record_failed',
        message: 'Payment setup could not be completed. Please try again.',
      }, { status: 500 })
    }

    console.log('[TerminalPaymentIntent] Payment request record created:', localPaymentId)

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
