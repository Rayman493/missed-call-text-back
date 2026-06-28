import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const session_id = searchParams.get('session_id')

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }

    console.log('[PAYMENT RECONCILE] Reconciling session:', session_id)

    const stripe = getStripe()
    if (!stripe) {
      console.error('[PAYMENT RECONCILE] Stripe is not configured')
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    // Retrieve the checkout session from Stripe
    // Note: We need to retrieve it from the connected account if it was created there
    // First, try to retrieve without specifying an account (platform account)
    let session: Stripe.Checkout.Session | null = null
    let retrievalError: any = null

    try {
      session = await stripe.checkout.sessions.retrieve(session_id)
      console.log('[PAYMENT RECONCILE] Retrieved session from platform account')
    } catch (error: any) {
      retrievalError = error
      console.log('[PAYMENT RECONCILE] Session not found on platform account, may be on connected account')
    }

    // If not found on platform, try to find the connected account from our database
    if (!session) {
      console.log('[PAYMENT RECONCILE] Looking up payment request by session_id')
      
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { data: paymentRequest, error: paymentRequestError } = await supabase
        .from('payment_requests')
        .select('stripe_connect_account_id, status')
        .eq('stripe_checkout_session_id', session_id)
        .single()

      if (paymentRequestError || !paymentRequest) {
        console.error('[PAYMENT RECONCILE] Payment request not found:', paymentRequestError)
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      console.log('[PAYMENT RECONCILE] Found payment request with connected account:', paymentRequest.stripe_connect_account_id)

      // If already paid, no need to reconcile
      if (paymentRequest.status === 'paid') {
        console.log('[PAYMENT RECONCILE] Payment request already paid')
        return NextResponse.json({ status: 'already_paid' })
      }

      // Try to retrieve from the connected account
      if (paymentRequest.stripe_connect_account_id) {
        try {
          session = await stripe.checkout.sessions.retrieve(session_id, undefined, {
            stripeAccount: paymentRequest.stripe_connect_account_id
          })
          console.log('[PAYMENT RECONCILE] Retrieved session from connected account')
        } catch (error: any) {
          console.error('[PAYMENT RECONCILE] Failed to retrieve session from connected account:', error)
          return NextResponse.json({ error: 'Session not found on connected account' }, { status: 404 })
        }
      }
    }

    if (!session) {
      console.error('[PAYMENT RECONCILE] Session not found on any account')
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Check payment status
    console.log('[PAYMENT RECONCILE] Session payment_status:', session.payment_status)
    
    if (session.payment_status !== 'paid') {
      console.log('[PAYMENT RECONCILE] Payment not yet paid, status:', session.payment_status)
      return NextResponse.json({ status: session.payment_status })
    }

    // Payment is paid, update the payment request
    console.log('[PAYMENT RECONCILE] Payment is paid, updating payment request')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: paymentRequest, error: paymentRequestError } = await supabase
      .from('payment_requests')
      .select('id, lead_id, business_id, status')
      .eq('stripe_checkout_session_id', session_id)
      .single()

    if (paymentRequestError || !paymentRequest) {
      console.error('[PAYMENT RECONCILE] Payment request not found:', paymentRequestError)
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }

    // If already paid, no need to update
    if (paymentRequest.status === 'paid') {
      console.log('[PAYMENT RECONCILE] Payment request already paid')
      return NextResponse.json({ status: 'already_paid' })
    }

    console.log('[PAYMENT RECONCILE] Updating payment request to paid:', paymentRequest.id)

    const updatePayload: any = {
      status: 'paid'
    }

    // Only set paid_at if column exists
    try {
      const { error: testError } = await supabase
        .from('payment_requests')
        .select('paid_at')
        .limit(1)
        .single()
      
      if (!testError) {
        updatePayload.paid_at = new Date().toISOString()
      }
    } catch (e) {
      console.log('[PAYMENT RECONCILE] paid_at column may not exist, skipping')
    }

    const { error: updateError } = await supabase
      .from('payment_requests')
      .update(updatePayload)
      .eq('id', paymentRequest.id)

    if (updateError) {
      console.error('[PAYMENT RECONCILE] Failed to update payment request:', updateError)
      return NextResponse.json({ error: 'Failed to update payment request' }, { status: 500 })
    }

    console.log('[PAYMENT RECONCILE] Successfully updated payment request to paid')

    // Update lead status to paid (optional)
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

    return NextResponse.json({ status: 'paid' })
  } catch (error) {
    console.error('[PAYMENT RECONCILE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
