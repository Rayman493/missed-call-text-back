import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[STRIPE CONNECT REFRESH] Refresh request received')

    const stripe = getStripe()
    if (!stripe) {
      console.error('[STRIPE CONNECT REFRESH] Stripe is not configured')
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    // Get user from session
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[STRIPE CONNECT REFRESH] Invalid token:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get business_id from request body
    const body = await request.json()
    const { business_id } = body

    if (!business_id) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Get business with Stripe Connect account ID
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id, stripe_connect_account_id')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[STRIPE CONNECT REFRESH] Business not found or unauthorized')
      return NextResponse.json({ error: 'Business not found or unauthorized' }, { status: 404 })
    }

    if (!business.stripe_connect_account_id) {
      console.error('[STRIPE CONNECT REFRESH] No Stripe Connect account ID found')
      return NextResponse.json({ error: 'No Stripe Connect account found' }, { status: 404 })
    }

    console.log('[STRIPE CONNECT REFRESH] Connected account id:', business.stripe_connect_account_id)

    // Retrieve Stripe account to get current status
    const account = await stripe.accounts.retrieve(business.stripe_connect_account_id)

    console.log('[STRIPE CONNECT REFRESH] Stripe account charges_enabled:', account.charges_enabled)
    console.log('[STRIPE CONNECT REFRESH] Stripe account payouts_enabled:', account.payouts_enabled)
    console.log('[STRIPE CONNECT REFRESH] Stripe account details_submitted:', account.details_submitted)

    // Determine status
    let stripe_connect_status = 'not_connected'
    if (account.charges_enabled && account.details_submitted) {
      stripe_connect_status = 'connected'
    } else if (account.details_submitted) {
      stripe_connect_status = 'pending'
    } else if (business.stripe_connect_account_id) {
      stripe_connect_status = 'pending'
    }

    // Update business with current status
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        stripe_connect_status,
        stripe_details_submitted: account.details_submitted,
        stripe_charges_enabled: account.charges_enabled,
        stripe_payouts_enabled: account.payouts_enabled,
      })
      .eq('id', business_id)

    if (updateError) {
      console.error('[STRIPE CONNECT REFRESH] Failed to update business:', updateError)
      return NextResponse.json({ error: 'Failed to update business' }, { status: 500 })
    }

    console.log('[STRIPE CONNECT REFRESH] Business row updated')

    return NextResponse.json({
      success: true,
      stripe_connect_status,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    })
  } catch (error: any) {
    console.error('[STRIPE CONNECT REFRESH] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh status' },
      { status: 500 }
    )
  }
}
