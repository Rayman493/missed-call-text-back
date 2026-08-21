import { NextRequest, NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@/lib/supabase/browser'

/**
 * Refresh subscription status from Stripe
 *
 * This endpoint fetches the current subscription status from Stripe
 * and updates the business record in the database.
 *
 * Used after Billing Portal return to ensure the business record
 * reflects any changes made in the portal (cancellation, payment method update, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const { business_id } = await request.json()
    const stripe = getStripe()

    if (!stripe) {
      console.log('[Billing Subscription Refresh] Stripe client not initialized')
      return NextResponse.json(
        { error: 'Payment service unavailable' },
        { status: 500 }
      )
    }

    // Security validation
    if (!business_id || typeof business_id !== 'string') {
      console.log('[Billing Subscription Refresh] Invalid business_id format')
      return NextResponse.json(
        { error: 'Invalid business_id' },
        { status: 400 }
      )
    }

    // Authenticate user
    const supabase = createBrowserClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.log('[Billing Subscription Refresh] Unauthorized: no user session')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Billing Subscription Refresh] Refreshing subscription for business:', business_id, 'user:', user.id)

    // Create Supabase service-role client (bypasses RLS)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Fetch business data with user ownership validation
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.log('[Billing Subscription Refresh] Business not found or access denied:', business_id)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    // If no subscription, nothing to refresh
    if (!business.stripe_subscription_id) {
      console.log('[Billing Subscription Refresh] No subscription to refresh')
      return NextResponse.json({
        ok: true,
        subscriptionStatus: business.subscription_status,
        message: 'No subscription to refresh'
      })
    }

    // Fetch subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(business.stripe_subscription_id)

    console.log('[Billing Subscription Refresh] Stripe subscription:', {
      id: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at,
    })

    // Calculate dates
    let trialEndsAt = null
    let currentPeriodEnd = null

    if (subscription.trial_end) {
      trialEndsAt = new Date(subscription.trial_end * 1000).toISOString()
    }

    if ((subscription as any).current_period_end) {
      currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString()
    }

    // Update business record with current subscription status
    const updateData: any = {
      subscription_status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_ends_at: trialEndsAt,
      current_period_end: currentPeriodEnd,
    }

    if (subscription.canceled_at) {
      updateData.canceled_at = new Date(subscription.canceled_at * 1000).toISOString()
    }

    if (subscription.items && subscription.items.data[0]) {
      updateData.subscription_price_id = subscription.items.data[0].price.id
    }

    const { error: updateError } = await supabaseAdmin
      .from('businesses')
      .update(updateData)
      .eq('id', business_id)

    if (updateError) {
      console.error('[Billing Subscription Refresh] Failed to update business:', updateError)
      return NextResponse.json(
        { error: 'Failed to update business' },
        { status: 500 }
      )
    }

    console.log('[Billing Subscription Refresh] Successfully updated business')

    return NextResponse.json({
      ok: true,
      subscriptionStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      businessId: business_id,
    })

  } catch (error) {
    console.error('[Billing Subscription Refresh] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}