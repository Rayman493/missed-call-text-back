import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

/**
 * POST /api/payments/[id]/reconcile
 *
 * Reconciles a payment request with its authoritative Stripe state.
 *
 * Security:
 * - Requires valid Supabase session
 * - User must own the business the payment belongs to
 * - Stripe is authoritative for payment state
 *
 * For Tap to Pay payments:
 * - Fetches PaymentIntent from Stripe
 * - Maps Stripe status to ReplyFlow status
 * - Updates local state to match Stripe
 *
 * For SMS payments:
 * - Fetches Checkout Session from Stripe
 * - Reconciles payment status
 *
 * Invariants:
 * - Stripe succeeded → ReplyFlow paid
 * - Stripe processing/unknown → no local mutation
 * - Stripe unavailable → return retryable error
 * - Local status disagrees with Stripe → Stripe wins
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: paymentRequestId } = await params

  console.log('[PAYMENT RECONCILE] Reconciling payment request:', paymentRequestId)

  try {
    // Authenticate user
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

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[PAYMENT RECONCILE] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch payment request with business ownership verification
    const { data: paymentRequest, error: paymentError } = await supabase
      .from('payment_requests')
      .select('id, business_id, lead_id, status, amount_cents, currency, payment_method_type, stripe_payment_intent_id, stripe_checkout_session_id, stripe_connect_account_id, paid_at, failed_at, cancelled_at')
      .eq('id', paymentRequestId)
      .maybeSingle()

    if (paymentError || !paymentRequest) {
      console.error('[PAYMENT RECONCILE] Payment request not found:', paymentError)
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }

    // Verify business ownership via RLS
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', paymentRequest.business_id)
      .maybeSingle()

    if (businessError || !business) {
      console.error('[PAYMENT RECONCILE] Business not found:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (business.owner_id !== user.id) {
      console.error('[PAYMENT RECONCILE] User not authorized for business:', user.id, business.id)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const stripe = getStripe()
    if (!stripe) {
      console.error('[PAYMENT RECONCILE] Stripe is not configured')
      return NextResponse.json({ error: 'Payment service unavailable' }, { status: 503 })
    }

    // Determine payment type and reconcile accordingly
    if (paymentRequest.payment_method_type === 'card_present' && paymentRequest.stripe_payment_intent_id) {
      // Tap to Pay payment - reconcile via PaymentIntent
      return await reconcilePaymentIntent(
        stripe,
        paymentRequest,
        paymentRequest.stripe_connect_account_id
      )
    } else if (paymentRequest.stripe_checkout_session_id) {
      // SMS payment - reconcile via Checkout Session
      return await reconcileCheckoutSession(
        stripe,
        paymentRequest,
        paymentRequest.stripe_connect_account_id
      )
    } else {
      // No Stripe identity - return local state
      console.log('[PAYMENT RECONCILE] No Stripe identity, returning local status:', paymentRequest.status)
      return NextResponse.json({
        status: paymentRequest.status,
        source: 'local',
        message: 'No Stripe payment found'
      })
    }
  } catch (error) {
    console.error('[PAYMENT RECONCILE] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Reconcile a Tap to Pay payment via Stripe PaymentIntent
 */
async function reconcilePaymentIntent(
  stripe: Stripe,
  paymentRequest: any,
  stripeAccountId: string | null
): Promise<NextResponse> {
  const paymentIntentId = paymentRequest.stripe_payment_intent_id
  const localStatus = paymentRequest.status

  console.log('[PAYMENT RECONCILE] Reconciling PaymentIntent:', paymentIntentId)
  console.log('[PAYMENT RECONCILE] Local status:', localStatus)

  try {
    // Fetch PaymentIntent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      {},
      stripeAccountId ? { stripeAccount: stripeAccountId } as any : undefined
    )

    console.log('[PAYMENT RECONCILE] Stripe PaymentIntent status:', paymentIntent.status)

    // Map Stripe status to ReplyFlow status
    let newStatus: string
    let newTimestamp: string | null = null
    let action: string

    switch (paymentIntent.status) {
      case 'succeeded':
        newStatus = 'paid'
        newTimestamp = new Date().toISOString()
        action = 'reconcile_to_paid'
        break

      case 'processing':
        // Payment is still processing - do not change local state
        console.log('[PAYMENT RECONCILE] PaymentIntent is processing, keeping local status')
        return NextResponse.json({
          status: localStatus,
          stripeStatus: 'processing',
          source: 'stripe',
          message: 'Payment is processing'
        })

      case 'requires_payment_method':
        // Payment failed before payment method - safe to mark as failed
        newStatus = 'failed'
        newTimestamp = new Date().toISOString()
        action = 'reconcile_to_failed'
        break

      case 'canceled':
        // Payment was canceled
        newStatus = 'cancelled'
        newTimestamp = new Date().toISOString()
        action = 'reconcile_to_canceled'
        break

      case 'requires_confirmation':
      case 'requires_action':
      case 'requires_capture':
        // Payment is in an intermediate state - do not change local state
        console.log('[PAYMENT RECONCILE] PaymentIntent in intermediate state:', paymentIntent.status)
        return NextResponse.json({
          status: localStatus,
          stripeStatus: paymentIntent.status,
          source: 'stripe',
          message: 'Payment requires action'
        })

      default:
        // Unknown Stripe status - do not change local state
        console.warn('[PAYMENT RECONCILE] Unknown Stripe PaymentIntent status:', paymentIntent.status)
        return NextResponse.json({
          status: localStatus,
          stripeStatus: paymentIntent.status,
          source: 'stripe',
          message: 'Unknown Stripe status'
        })
    }

    // If local status already matches, no update needed
    if (localStatus === newStatus) {
      console.log('[PAYMENT RECONCILE] Local status already matches Stripe:', localStatus)
      return NextResponse.json({
        status: localStatus,
        stripeStatus: paymentIntent.status,
        source: 'stripe',
        message: 'Already reconciled'
      })
    }

    // Update local status
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

    const updatePayload: any = {
      status: newStatus
    }

    // Set appropriate timestamp
    if (newStatus === 'paid') {
      updatePayload.paid_at = newTimestamp
    } else if (newStatus === 'failed') {
      updatePayload.failed_at = newTimestamp
    } else if (newStatus === 'cancelled') {
      updatePayload.cancelled_at = newTimestamp
    }

    const { error: updateError } = await supabase
      .from('payment_requests')
      .update(updatePayload)
      .eq('id', paymentRequest.id)

    if (updateError) {
      console.error('[PAYMENT RECONCILE] Failed to update payment request:', updateError)
      return NextResponse.json({ error: 'Failed to update payment request' }, { status: 500 })
    }

    console.log('[PAYMENT RECONCILE] Successfully reconciled payment:', action, paymentRequest.id, localStatus, '→', newStatus)

    // Update lead status if payment succeeded
    if (newStatus === 'paid') {
      try {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, status')
          .eq('id', paymentRequest.lead_id)
          .single()

        if (lead) {
          if (lead.status === 'payment_requested' || lead.status === 'new' || lead.status === 'active') {
            await supabase
              .from('leads')
              .update({ status: 'paid' })
              .eq('id', paymentRequest.lead_id)
            console.log('[PAYMENT RECONCILE] Updated lead status to paid')
          }
        }
      } catch (leadError) {
        console.error('[PAYMENT RECONCILE] Exception during lead update (non-critical):', leadError)
      }
    }

    return NextResponse.json({
      status: newStatus,
      stripeStatus: paymentIntent.status,
      source: 'stripe',
      message: 'Reconciled successfully'
    })
  } catch (stripeError: any) {
    console.error('[PAYMENT RECONCILE] Stripe API error:', stripeError)

    // If Stripe is unavailable, return retryable error
    if (stripeError.type === 'StripeAPIError' || stripeError.type === 'StripeConnectionError') {
      return NextResponse.json({
        error: 'Stripe service unavailable',
        retryable: true
      }, { status: 503 })
    }

    return NextResponse.json(
      { error: 'Failed to reconcile with Stripe' },
      { status: 500 }
    )
  }
}

/**
 * Reconcile an SMS payment via Stripe Checkout Session
 */
async function reconcileCheckoutSession(
  stripe: Stripe,
  paymentRequest: any,
  stripeAccountId: string | null
): Promise<NextResponse> {
  const sessionId = paymentRequest.stripe_checkout_session_id
  const localStatus = paymentRequest.status

  console.log('[PAYMENT RECONCILE] Reconciling Checkout Session:', sessionId)
  console.log('[PAYMENT RECONCILE] Local status:', localStatus)

  try {
    // Fetch Checkout Session from Stripe
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      stripeAccountId ? { stripeAccount: stripeAccountId } as any : undefined
    )

    console.log('[PAYMENT RECONCILE] Stripe Checkout Session payment_status:', session.payment_status)

    // Map session status to ReplyFlow status
    let newStatus: string
    let newTimestamp: string | null = null

    if (session.payment_status === 'paid') {
      newStatus = 'paid'
      newTimestamp = new Date().toISOString()
    } else if (session.status === 'expired') {
      newStatus = 'expired'
      newTimestamp = new Date().toISOString()
    } else {
      // Session is unpaid/unpaid - keep local status
      console.log('[PAYMENT RECONCILE] Checkout Session not paid, keeping local status')
      return NextResponse.json({
        status: localStatus,
        stripeStatus: session.payment_status,
        source: 'stripe',
        message: 'Payment not completed'
      })
    }

    // If local status already matches, no update needed
    if (localStatus === newStatus) {
      console.log('[PAYMENT RECONCILE] Local status already matches Stripe:', localStatus)
      return NextResponse.json({
        status: localStatus,
        stripeStatus: session.payment_status,
        source: 'stripe',
        message: 'Already reconciled'
      })
    }

    // Update local status
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

    const updatePayload: any = {
      status: newStatus
    }

    if (newStatus === 'paid') {
      updatePayload.paid_at = newTimestamp
    }

    const { error: updateError } = await supabase
      .from('payment_requests')
      .update(updatePayload)
      .eq('id', paymentRequest.id)

    if (updateError) {
      console.error('[PAYMENT RECONCILE] Failed to update payment request:', updateError)
      return NextResponse.json({ error: 'Failed to update payment request' }, { status: 500 })
    }

    console.log('[PAYMENT RECONCILE] Successfully reconciled payment:', localStatus, '→', newStatus)

    // Update lead status if payment succeeded
    if (newStatus === 'paid') {
      try {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, status')
          .eq('id', paymentRequest.lead_id)
          .single()

        if (lead) {
          if (lead.status === 'payment_requested' || lead.status === 'new' || lead.status === 'active') {
            await supabase
              .from('leads')
              .update({ status: 'paid' })
              .eq('id', paymentRequest.lead_id)
            console.log('[PAYMENT RECONCILE] Updated lead status to paid')
          }
        }
      } catch (leadError) {
        console.error('[PAYMENT RECONCILE] Exception during lead update (non-critical):', leadError)
      }
    }

    return NextResponse.json({
      status: newStatus,
      stripeStatus: session.payment_status,
      source: 'stripe',
      message: 'Reconciled successfully'
    })
  } catch (stripeError: any) {
    console.error('[PAYMENT RECONCILE] Stripe API error:', stripeError)

    // If Stripe is unavailable, return retryable error
    if (stripeError.type === 'StripeAPIError' || stripeError.type === 'StripeConnectionError') {
      return NextResponse.json({
        error: 'Stripe service unavailable',
        retryable: true
      }, { status: 503 })
    }

    return NextResponse.json(
      { error: 'Failed to reconcile with Stripe' },
      { status: 500 }
    )
  }
}