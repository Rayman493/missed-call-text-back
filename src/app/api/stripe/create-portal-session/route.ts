import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { getDashboardUrl, logUrlResolution } from '@/lib/urls'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[stripe-portal] Starting portal session creation')
    
    const stripe = getStripe()
    
    if (!stripe) {
      console.error('[stripe-portal] Stripe is not configured')
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 500 }
      )
    }
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      console.error('[stripe-portal] No authorization header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !user) {
      console.error('[stripe-portal] Invalid token or no user:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[stripe-portal] User authenticated:', user.id)

    // Fetch business by user_id
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    console.log('[stripe-portal] Business query result:', { business, businessError })

    if (businessError) {
      console.error('[stripe-portal] Business query error:', businessError)
      return NextResponse.json({ error: 'Failed to fetch business' }, { status: 500 })
    }

    if (!business) {
      console.error('[stripe-portal] Business not found for user:', user.id)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[stripe-portal] Business found:', business.id)
    console.log('[stripe-portal] stripe_customer_id:', business.stripe_customer_id)
    console.log('[stripe-portal] subscription_status:', business.subscription_status)
    console.log('[stripe-portal] action: ' + (business.stripe_customer_id ? 'portal' : 'checkout'))

    // Check for stripe_customer_id
    if (!business.stripe_customer_id) {
      console.log('[stripe-portal] Missing stripe_customer_id for business:', business.id)
      console.log('[stripe-portal] Subscription status:', business.subscription_status)
      console.log('[stripe-portal] Returning upgrade prompt for missing customer')
      return NextResponse.json({ 
        success: false,
        code: "NO_STRIPE_CUSTOMER",
        error: "No billing account found. Please start a subscription to manage your billing.",
        message: "No billing account found yet."
      })
    }

    // Create billing portal session with canonical URL and billing return parameter
    const returnUrl = `${getDashboardUrl()}?billing=returned`
    logUrlResolution('stripe-portal-return-url', returnUrl, user.id, business.id)

    console.log('[stripe-portal] Creating portal session for customer:', business.stripe_customer_id)

    const session = await stripe.billingPortal.sessions.create({
      customer: business.stripe_customer_id,
      return_url: returnUrl,
    })

    console.log('[stripe-portal] Portal session created:', session.url)

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[stripe-portal] Error creating portal session:', {
      error: error,
      errorMessage: error.message,
      errorType: error.type,
      errorStack: error.stack
    })

    // Return user-friendly error based on error type
    let userMessage = 'Failed to open billing portal. Please try again or contact support.'
    
    if (error.type === 'StripeInvalidRequestError') {
      userMessage = 'Unable to open billing portal. Your billing account may need to be set up first.'
    } else if (error.type === 'StripeAPIError') {
      userMessage = 'Stripe service temporarily unavailable. Please try again in a moment.'
    } else if (error.type === 'StripeConnectionError') {
      userMessage = 'Could not connect to Stripe. Please check your internet connection and try again.'
    }

    return NextResponse.json({ error: userMessage }, { status: 500 })
  }
}
