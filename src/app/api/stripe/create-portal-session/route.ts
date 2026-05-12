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
      .limit(1)
      .single()

    console.log('[stripe-portal] Business query result:', { business, businessError })

    if (businessError || !business) {
      console.error('[stripe-portal] Business not found:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[stripe-portal] Business found:', business.id)
    console.log('[stripe-portal] stripe_customer_id:', business.stripe_customer_id)
    console.log('[stripe-portal] subscription_status:', business.subscription_status)
    console.log('[stripe-portal] action: ' + (business.stripe_customer_id ? 'portal' : 'checkout'))

    // Check for stripe_customer_id
    if (!business.stripe_customer_id) {
      console.log('[stripe-portal] Missing stripe_customer_id for business:', business.id)
      console.log('[stripe-portal] Returning upgrade prompt for missing customer')
      return NextResponse.json({ 
        success: false,
        code: "NO_STRIPE_CUSTOMER",
        message: "No billing account found yet."
      })
    }

    // Create billing portal session with canonical URL
    const returnUrl = getDashboardUrl()
    logUrlResolution('stripe-portal-return-url', returnUrl, user.id, business.id)
    
    const session = await stripe.billingPortal.sessions.create({
      customer: business.stripe_customer_id,
      return_url: returnUrl,
    })

    console.log('[stripe-portal] Portal session created:', session.url)

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[stripe-portal] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
