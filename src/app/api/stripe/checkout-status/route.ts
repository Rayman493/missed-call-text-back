import { NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { db } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')

    console.log('[checkout-status] Checking checkout status for session:', sessionId)

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id parameter' }, { status: 400 })
    }

    const stripe = getStripe()
    if (!stripe) {
      console.error('[checkout-status] Failed to initialize Stripe client')
      return NextResponse.json({ error: 'Stripe initialization failed' }, { status: 500 })
    }

    // Retrieve Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    
    console.log('[checkout-status] Stripe session retrieved:', {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      status: session.status,
      subscription: session.subscription,
      customer: session.customer
    })

    // Get metadata from session
    const businessId = session.metadata?.business_id
    const userId = session.metadata?.user_id

    if (!businessId) {
      console.error('[checkout-status] No business_id in session metadata')
      return NextResponse.json({ error: 'No business_id in session metadata' }, { status: 400 })
    }

    // Fetch business from database
    const business = await db.getBusinessById(businessId)
    
    console.log('[checkout-status] Business data:', {
      businessId: business?.id,
      subscriptionStatus: business?.subscription_status,
      stripeCustomerId: business?.stripe_customer_id,
      stripeSubscriptionId: business?.stripe_subscription_id
    })

    // Determine if subscription is active/trialing
    const isReady = business?.subscription_status === 'trialing' || 
                   business?.subscription_status === 'active'

    return NextResponse.json({
      checkoutStatus: session.status,
      paymentStatus: session.payment_status,
      subscriptionStatus: business?.subscription_status,
      businessId: business?.id,
      userId: business?.user_id,
      stripeCustomerId: business?.stripe_customer_id,
      stripeSubscriptionId: business?.stripe_subscription_id,
      ready: isReady
    })
  } catch (error: any) {
    console.error('[checkout-status] Error checking checkout status:', {
      error: error.message,
      type: error.type,
      code: error.code
    })
    return NextResponse.json({ 
      error: error.message || 'Failed to check checkout status',
      type: error.type,
      code: error.code
    }, { status: 500 })
  }
}
