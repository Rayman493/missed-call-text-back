import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import getStripe from '@/lib/stripe'
import { db } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[stripe-checkout] Starting checkout session creation');
    
    const stripe = getStripe()
    console.log('[stripe-checkout] Stripe client initialized:', !!stripe);
    
    if (!stripe) {
      console.error('[stripe-checkout] Failed to initialize Stripe client');
      return NextResponse.json({ error: 'Stripe initialization failed' }, { status: 500 })
    }
    
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    
    console.log('[stripe-checkout] Supabase client initialized');

    const { data: { user } } = await supabase.auth.getUser()
    console.log('[stripe-checkout] User authentication result:', { user: !!user, userId: user?.id, email: user?.email });
    
    if (!user) {
      console.error('[stripe-checkout] No authenticated user found');
      return NextResponse.json({ error: 'Unauthorized - no user found' }, { status: 401 })
    }

    // Get or create user's business using centralized function
    const business = await db.getOrCreateBusiness(user.id)
    
    console.log('[stripe-checkout] Business resolved:', { 
      business: !!business, 
      businessId: business?.id,
      businessName: business?.name,
      userId: user.id 
    });
    
    console.log('[stripe-checkout] Business ID used for checkout:', business?.id);

    if (!business) {
      console.error('[stripe-checkout] Failed to resolve business for user:', user.id);
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Create or retrieve Stripe customer
    let customerId = business.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          business_id: business.id,
          user_id: user.id,
        },
      })
      customerId = customer.id

      // Save customer ID to business
      await supabase
        .from('businesses')
        .update({ stripe_customer_id: customerId })
        .eq('id', business.id)
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://replyflowhq.com'
    const origin = request.headers.get('origin') || siteUrl
    const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID
    
    console.log('[stripe-checkout] Environment check:', {
      origin,
      siteUrl,
      priceId: !!priceId,
      priceIdValue: priceId,
      nodeEnv: process.env.NODE_ENV,
      hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY
    });

    if (!priceId) {
      console.error('[stripe-checkout] NEXT_PUBLIC_STRIPE_PRICE_ID not configured');
      return NextResponse.json({ error: 'Price ID not configured - NEXT_PUBLIC_STRIPE_PRICE_ID missing' }, { status: 500 })
    }

    console.log('[stripe-checkout] Creating Stripe checkout session with:', {
      customerId,
      priceId,
      origin,
      businessId: business.id,
      onboardingStatus: business.onboarding_status
    });
    
    // Determine success URL based on onboarding status
    let successUrl = `${siteUrl}/dashboard?checkout=success`
    if (business.onboarding_status !== 'completed') {
      successUrl = `${siteUrl}/onboarding/success?checkout=success`
    }
    
    console.log('[stripe-checkout] Using success URL:', successUrl);
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: `${siteUrl}/dashboard?checkout=cancelled`,
      metadata: {
        business_id: business.id,
        user_id: user.id,
        onboarding_status: business.onboarding_status || 'unknown'
      },
      subscription_data: {
        metadata: {
          business_id: business.id,
          user_id: user.id,
        },
      },
    })
    
    console.log('[stripe-checkout] Checkout session created successfully:', { 
      sessionId: session.id, 
      url: session.url 
    });

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[stripe-checkout] Error creating checkout session:', {
      error: error.message,
      stack: error.stack,
      type: error.type,
      code: error.code
    });
    return NextResponse.json({ 
      error: error.message || 'Unknown error creating checkout session',
      type: error.type,
      code: error.code
    }, { status: 500 })
  }
}
