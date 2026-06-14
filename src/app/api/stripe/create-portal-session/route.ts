import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { getDashboardUrl, logUrlResolution } from '@/lib/urls'
import { normalizeStripeCustomerId } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[stripe-portal] ========== START ==========')
    console.log('[stripe-portal] Starting portal session creation')
    
    const stripe = getStripe()
    
    if (!stripe) {
      console.error('[stripe-portal] Stripe is not configured')
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 500 }
      )
    }
    
    console.log('[stripe-portal] Stripe client configured successfully')
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get auth header
    const authHeader = request.headers.get('authorization')
    console.log('[stripe-portal] Auth header present:', !!authHeader)
    
    if (!authHeader) {
      console.error('[stripe-portal] No authorization header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '')
    console.log('[stripe-portal] Starting auth user lookup')
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    console.log('[stripe-portal] Auth user lookup complete:', {
      userError,
      userPresent: !!user,
      userId: user?.id
    })
    
    if (userError || !user) {
      console.error('[stripe-portal] Invalid token or no user:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[stripe-portal] User authenticated successfully:', user.id)

    // Fetch business by user_id
    console.log('[stripe-portal] Starting business query for user_id:', user.id)
    
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    console.log('[stripe-portal] Business query complete:', {
      businessError,
      businessFound: !!business,
      businessId: business?.id
    })

    if (businessError) {
      console.error('[stripe-portal] Business query error:', businessError)
      return NextResponse.json({ error: 'Failed to fetch business' }, { status: 500 })
    }

    if (!business) {
      console.error('[stripe-portal] Business not found for user:', user.id)
      return NextResponse.json({ 
        error: 'Business not found',
        code: 'BUSINESS_NOT_FOUND'
      }, { status: 404 })
    }

    console.log('[stripe-portal] Business found:', business.id)
    console.log('[stripe-portal] stripe_customer_id value:', business.stripe_customer_id)
    console.log('[stripe-portal] stripe_customer_id type:', typeof business.stripe_customer_id)
    console.log('[stripe-portal] stripe_customer_id starts with cus_:', business.stripe_customer_id?.startsWith('cus_'))
    console.log('[stripe-portal] subscription_status:', business.subscription_status)

    // Normalize stripe_customer_id to handle cases where it might be stored as a JSON object
    const normalizedCustomerId = normalizeStripeCustomerId(business.stripe_customer_id)
    console.log('[stripe-portal] Normalized customer ID:', normalizedCustomerId)

    // If normalized value differs from stored value, repair the database
    if (normalizedCustomerId && normalizedCustomerId !== business.stripe_customer_id) {
      console.log('[stripe-portal] REPAIRING stripe_customer_id in database')
      console.log('[stripe-portal] Old value:', business.stripe_customer_id)
      console.log('[stripe-portal] New value:', normalizedCustomerId)
      
      const { error: repairError } = await supabase
        .from('businesses')
        .update({ stripe_customer_id: normalizedCustomerId })
        .eq('id', business.id)
      
      if (repairError) {
        console.error('[stripe-portal] Failed to repair stripe_customer_id:', repairError)
      } else {
        console.log('[stripe-portal] Successfully repaired stripe_customer_id')
      }
    }

    // Check for stripe_customer_id
    if (!normalizedCustomerId) {
      console.log('[stripe-portal] Missing or invalid stripe_customer_id for business:', business.id)
      console.log('[stripe-portal] Original value:', business.stripe_customer_id)
      console.log('[stripe-portal] Returning 400 for missing stripe_customer_id')
      return NextResponse.json({ 
        success: false,
        code: "NO_STRIPE_CUSTOMER",
        error: "No billing account found. Please start a subscription to manage your billing.",
        message: "No billing account found yet."
      }, { status: 400 })
    }

    // Validate stripe_customer_id format
    if (!normalizedCustomerId.startsWith('cus_')) {
      console.error('[stripe-portal] Invalid stripe_customer_id format:', normalizedCustomerId)
      return NextResponse.json({ 
        success: false,
        code: "INVALID_STRIPE_CUSTOMER",
        error: "Invalid billing account format. Please contact support.",
        message: "Invalid billing account format."
      }, { status: 400 })
    }

    console.log('[stripe-portal] stripe_customer_id is valid, proceeding to Stripe API call')

    // Create billing portal session with canonical URL and billing return parameter
    const returnUrl = `${getDashboardUrl()}?billing=returned`
    logUrlResolution('stripe-portal-return-url', returnUrl, user.id, business.id)

    console.log('[stripe-portal] Calling Stripe billingPortal.sessions.create for customer:', normalizedCustomerId)

    const session = await stripe.billingPortal.sessions.create({
      customer: normalizedCustomerId,
      return_url: returnUrl,
    })

    console.log('[stripe-portal] Stripe API call successful')
    console.log('[stripe-portal] Portal session created:', session.url)
    console.log('[stripe-portal] ========== SUCCESS ==========')

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[stripe-portal] ========== ERROR ==========')
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
