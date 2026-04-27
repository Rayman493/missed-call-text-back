import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[stripe-portal] Starting portal session creation')
    
    const stripe = getStripe()
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
      return NextResponse.json({ error: 'Business not found' }, { status: 400 })
    }

    console.log('[stripe-portal] Business found:', business.id)
    console.log('[stripe-portal] stripe_customer_id:', business.stripe_customer_id)

    // Require stripe_customer_id
    if (!business.stripe_customer_id) {
      console.error('[stripe-portal] Missing stripe_customer_id for business:', business.id)
      return NextResponse.json({ 
        error: 'No Stripe customer found for this business. Please resubscribe or contact support.' 
      }, { status: 400 })
    }

    // Create billing portal session
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    console.log('[stripe-portal] Creating portal session with return_url:', `${siteUrl}/dashboard`)
    
    const session = await stripe.billingPortal.sessions.create({
      customer: business.stripe_customer_id,
      return_url: `${siteUrl}/dashboard`,
    })

    console.log('[stripe-portal] Portal session created:', session.url)

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[stripe-portal] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
