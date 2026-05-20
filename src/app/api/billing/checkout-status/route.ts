import { NextRequest, NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { session_id } = await request.json()
    const stripe = getStripe()

    if (!stripe) {
      console.log('[Billing Success Status] Stripe client not initialized')
      return NextResponse.json(
        { error: 'Payment service unavailable' },
        { status: 500 }
      )
    }

    // Security validation
    if (!session_id || typeof session_id !== 'string') {
      console.log('[Billing Success Status] Invalid session_id format')
      return NextResponse.json(
        { error: 'Invalid session_id' },
        { status: 400 }
      )
    }

    if (!session_id.startsWith('cs_')) {
      console.log('[Billing Success Status] Invalid session_id prefix')
      return NextResponse.json(
        { error: 'Invalid session_id format' },
        { status: 400 }
      )
    }

    console.log('[Billing Success Status] Checking checkout status', { session_id })

    // Retrieve Stripe session
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['customer', 'subscription']
    })

    console.log('[Billing Success Stripe Session]', {
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      customer: session.customer,
      subscription: session.subscription,
      metadata: session.metadata
    })

    // Validate session
    if (session.status !== 'complete') {
      return NextResponse.json({
        ok: false,
        error: 'Session not complete',
        status: session.status
      })
    }

    if (!session.metadata?.business_id || !session.metadata?.user_id) {
      console.log('[Billing Success Status] Missing required metadata')
      return NextResponse.json(
        { error: 'Invalid session metadata' },
        { status: 400 }
      )
    }

    // Create Supabase service-role client (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Fetch business data with both business_id and user_id validation
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', session.metadata.business_id)
      .eq('user_id', session.metadata.user_id)
      .single()

    if (businessError || !business) {
      console.log('[Billing Success Business Lookup Failed]', { 
        businessId: session.metadata.business_id,
        userId: session.metadata.user_id,
        queryFields: ['id', 'user_id'],
        supabaseError: businessError,
        errorCode: businessError?.code,
        errorMessage: businessError?.message,
        details: businessError?.details
      })
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    console.log('[Billing Success Business State]', {
      businessId: business.id,
      subscriptionStatus: business.subscription_status,
      onboardingStatus: business.onboarding_status,
      hasTwilioNumber: !!business.twilio_phone_number,
      provisioningStatus: business.provisioning_status,
      stripeCustomerId: business.stripe_customer_id,
      stripeSubscriptionId: business.stripe_subscription_id
    })

    // Determine checkout status and redirect readiness
    const subscriptionStatus = business.subscription_status
    const hasActiveSubscription = ['trialing', 'active'].includes(subscriptionStatus)
    const hasTwilioNumber = !!business.twilio_phone_number
    const provisioningComplete = business.provisioning_status === 'completed'
    const redirectReady = hasActiveSubscription // Ready when subscription is trialing or active

    let redirectTo = '/dashboard'
    let checkoutStatus = 'processing'
    let paymentStatus = session.payment_status

    if (hasActiveSubscription && provisioningComplete) {
      checkoutStatus = 'complete'
      redirectTo = '/dashboard'
    } else if (hasActiveSubscription && !hasTwilioNumber) {
      checkoutStatus = 'subscription_active'
      redirectTo = '/dashboard' // Allow dashboard entry but show provisioning status
    } else if (subscriptionStatus === 'incomplete') {
      checkoutStatus = 'payment_pending'
      redirectTo = '/dashboard' // Allow dashboard entry for payment retry
    } else {
      checkoutStatus = 'processing'
      redirectTo = '/dashboard' // Default to dashboard after timeout
    }

    return NextResponse.json({
      ok: true,
      checkoutCompleted: session.status === 'complete',
      checkoutStatus,
      paymentStatus,
      subscriptionStatus,
      provisioningStatus: business.provisioning_status,
      hasTwilioNumber,
      businessId: business.id,
      redirectReady,
      redirectTo,
      business: {
        id: business.id,
        subscriptionStatus: business.subscription_status,
        onboardingStatus: business.onboarding_status,
        hasTwilioNumber: !!business.twilio_phone_number,
        provisioningStatus: business.provisioning_status
      }
    })

  } catch (error) {
    console.error('[Billing Success Status] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
