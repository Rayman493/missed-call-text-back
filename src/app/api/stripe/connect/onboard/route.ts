import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[STRIPE CONNECT] Onboarding request received')

    const stripe = getStripe()
    if (!stripe) {
      console.error('[STRIPE CONNECT] Stripe is not configured')
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    // Get user from session
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const authHeader = request.headers.get('authorization')
    console.log('[STRIPE CONNECT] Authorization header present:', !!authHeader)
    if (!authHeader) {
      console.error('[STRIPE CONNECT] No authorization header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    console.log('[STRIPE CONNECT] Token extracted (length):', token.length)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[STRIPE CONNECT] Invalid token:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[STRIPE CONNECT] Authenticated user id:', user.id)

    // Get business_id from request body
    const body = await request.json()
    const { business_id } = body

    console.log('[STRIPE CONNECT] Business id received from request:', business_id)
    console.log('[STRIPE CONNECT] Business id source: request body')

    if (!business_id) {
      console.error('[STRIPE CONNECT] business_id is required')
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    // Verify user owns the business - using user_id column (not owner_id)
    console.log('[STRIPE CONNECT] Executing business lookup query')
    console.log('[STRIPE CONNECT] SQL: SELECT id, user_id, stripe_connect_account_id, stripe_connect_status FROM businesses WHERE id = ? AND user_id = ?', business_id, user.id)
    console.log('[STRIPE CONNECT] Checking column: user_id')

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id, stripe_connect_account_id, stripe_connect_status')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    console.log('[STRIPE CONNECT] Business lookup result:', {
      data: business,
      error: businessError,
      errorCode: businessError?.code,
      errorMessage: businessError?.message
    })

    if (businessError || !business) {
      console.error('[STRIPE CONNECT] Business not found or unauthorized')
      console.error('[STRIPE CONNECT] Exact reason for 404:', {
        businessError: businessError?.message,
        businessErrorCode: businessError?.code,
        businessExists: !!business,
        userId: user.id,
        businessId: business_id
      })
      return NextResponse.json({ error: 'Business not found or unauthorized' }, { status: 404 })
    }

    console.log('[STRIPE CONNECT] Business row returned from Supabase:', {
      id: business.id,
      user_id: business.user_id,
      stripe_connect_account_id: business.stripe_connect_account_id,
      stripe_connect_status: business.stripe_connect_status
    })

    // If already connected, return existing account
    if (business.stripe_connect_account_id && business.stripe_connect_status === 'connected') {
      console.log('[STRIPE CONNECT] Business already connected:', business.stripe_connect_account_id)
      return NextResponse.json({
        connected: true,
        account_id: business.stripe_connect_account_id
      })
    }

    // Create or retrieve Stripe Connect account
    let accountId = business.stripe_connect_account_id

    if (!accountId) {
      console.log('[STRIPE CONNECT] Creating new Express account for business:', business_id)
      
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        business_type: 'company',
        business_profile: {
          url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
          mcc: '5734', // Computer Programming, Data Processing, etc.
        },
        settings: {
          payouts: {
            schedule: {
              interval: 'manual',
            },
          },
        },
        metadata: {
          business_id: business_id,
          user_id: user.id,
        },
      })

      accountId = account.id
      console.log('[STRIPE CONNECT] Created account:', accountId)

      // Update business with account ID
      await supabase
        .from('businesses')
        .update({
          stripe_connect_account_id: accountId,
          stripe_connect_status: 'pending',
          stripe_details_submitted: false,
        })
        .eq('id', business_id)
    } else {
      console.log('[STRIPE CONNECT] Using existing account:', accountId)
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?stripe_onboarding=complete`,
      type: 'account_onboarding',
    })

    console.log('[STRIPE CONNECT] Created account link:', accountLink.url)

    return NextResponse.json({
      url: accountLink.url,
      account_id: accountId,
    })
  } catch (error) {
    console.error('[STRIPE CONNECT] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create onboarding link' },
      { status: 500 }
    )
  }
}
