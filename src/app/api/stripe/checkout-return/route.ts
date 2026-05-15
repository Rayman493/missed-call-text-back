import { NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { db } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { session_id } = body

    console.log('[checkout-return] Processing checkout return for session:', session_id)

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id parameter' }, { status: 400 })
    }

    const stripe = getStripe()
    if (!stripe) {
      console.error('[checkout-return] Failed to initialize Stripe client')
      return NextResponse.json({ error: 'Stripe initialization failed' }, { status: 500 })
    }

    // Retrieve Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(session_id)
    
    console.log('[checkout-return] Stripe session retrieved:', {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      status: session.status,
      subscription: session.subscription,
      customer: session.customer,
      metadata: session.metadata
    })

    // Get metadata from session
    const businessId = session.metadata?.business_id
    const userId = session.metadata?.user_id

    if (!businessId) {
      console.error('[checkout-return] No business_id in session metadata')
      return NextResponse.json({ error: 'No business_id in session metadata' }, { status: 400 })
    }

    // Fetch current business from database
    const business = await db.getBusinessById(businessId)
    
    if (!business) {
      console.error('[checkout-return] Business not found:', businessId)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[checkout-return] Current business state:', {
      businessId: business.id,
      subscriptionStatus: business.subscription_status,
      stripeCustomerId: business.stripe_customer_id,
      stripeSubscriptionId: business.stripe_subscription_id
    })

    // Update business with Stripe subscription details
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null
    const customerId = typeof session.customer === 'string' ? session.customer : null

    if (subscriptionId && customerId) {
      // Retrieve subscription details from Stripe
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      
      console.log('[checkout-return] Stripe subscription details:', {
        subscriptionId: subscription.id,
        status: subscription.status,
        trialEnd: (subscription as any).trial_end,
        currentPeriodEnd: (subscription as any).current_period_end,
        cancelAt: (subscription as any).cancel_at,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      })

      // Update business with subscription details
      const updateData: any = {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status: subscription.status,
        trial_ends_at: (subscription as any).trial_end ? new Date((subscription as any).trial_end * 1000).toISOString() : null,
        current_period_end: (subscription as any).current_period_end ? new Date((subscription as any).current_period_end * 1000).toISOString() : null,
        cancel_at: (subscription as any).cancel_at ? new Date((subscription as any).cancel_at * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
      }

      // Get price ID from subscription items
      if (subscription.items && subscription.items.data && subscription.items.data.length > 0) {
        updateData.subscription_price_id = subscription.items.data[0].price.id
      }

      await db.updateBusiness(businessId, updateData)
      
      console.log('[checkout-return] Business updated successfully:', {
        businessId,
        subscriptionStatus: subscription.status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId
      })
    }

    return NextResponse.json({
      success: true,
      businessId: business.id,
      userId: business.user_id,
      subscriptionStatus: business.subscription_status,
      ready: true
    })
  } catch (error: any) {
    console.error('[checkout-return] Error processing checkout return:', {
      error: error.message,
      type: error.type,
      code: error.code,
      stack: error.stack
    })
    return NextResponse.json({ 
      error: error.message || 'Failed to process checkout return',
      type: error.type,
      code: error.code
    }, { status: 500 })
  }
}
