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
    const { amountCents, currency = 'usd', leadId, jobId, description } = body

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

    // Check for duplicate pending payment for same lead/job
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: duplicatePayment } = await supabaseAdmin
      .from('payment_requests')
      .select('id, status')
      .eq('business_id', business.id)
      .eq('amount_cents', amountCents)
      .eq('payment_method_type', 'card_present')
      .eq('status', 'pending')
      .gte('created_at', fiveMinutesAgo)
      .maybeSingle()

    if (duplicatePayment) {
      console.error('[TerminalPaymentIntent] Duplicate payment detected:', duplicatePayment.id)
      return NextResponse.json({ error: 'A payment for this amount is already in progress. Please wait a few minutes.' }, { status: 409 })
    }

    // Generate idempotency key for this payment request
    const idempotencyKey = `terminal-${userId}-${randomUUID()}`
    console.log('[TerminalPaymentIntent] Idempotency key:', idempotencyKey)

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
        },
      },
      {
        stripeAccount: stripeAccountId,
        idempotencyKey: idempotencyKey,
      }
    )

    console.log('[TerminalPaymentIntent] PaymentIntent created:', paymentIntent.id)
    console.log('[PAYMENT_TRACE] stage=payment_intent_api_response paymentIntentId=' + paymentIntent.id + ' client_secret_present=' + (paymentIntent.client_secret != null) + ' client_secret_length=' + (paymentIntent.client_secret?.length || 0))

    // Create local payment_request record
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
        payment_intent_client_secret: paymentIntent.client_secret,
        requested_by: userId,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
        job_id: jobId || null,
      })

    if (insertError) {
      console.error('[TerminalPaymentIntent] Failed to create payment_request record:', insertError)
      // Return error but include PaymentIntent details for debugging
      // The PaymentIntent was created successfully, but local persistence failed
      return NextResponse.json({
        error: 'Failed to create local payment record',
        details: insertError,
        paymentIntentId: paymentIntent.id,
        // Do not return localPaymentId since it was not persisted
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
