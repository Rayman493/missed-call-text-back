import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import getStripe from '@/lib/stripe'
import { getAppBaseUrl, logUrlResolution } from '@/lib/urls'
import { db } from '@/lib/supabase/admin'
import { checkTrialEligibility } from '@/lib/trial-eligibility'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    console.log('[stripe-checkout] Starting checkout session creation');
    
    // Parse request body to get checkout mode
    const body = await request.json().catch(() => ({}))
    const checkoutMode = body.checkout_mode || 'trial' // Default to trial for backward compatibility
    
    console.log('[stripe-checkout] Request body parsed:', {
      rawBody: body,
      checkout_mode_from_body: body.checkout_mode,
      finalCheckoutMode: checkoutMode,
    })
    
    console.log('[stripe-checkout] Checkout mode:', checkoutMode);
    
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
      console.error('[stripe-checkout] No authenticated user found - blocking checkout');
      return NextResponse.json({ error: 'Authentication required before starting checkout. Please sign in first.' }, { status: 401 })
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
      console.error('[stripe-checkout] This should not happen - db.getOrCreateBusiness should always return a business');
      return NextResponse.json({ 
        error: 'Unable to set up your account. Please refresh the page and try again. If the issue persists, contact support.' 
      }, { status: 500 })
    }

    console.log('[stripe-checkout] Business resolved successfully:', { 
      businessId: business.id,
      businessName: business.name,
      businessPhoneNumber: business.business_phone_number,
      twilioPhoneNumber: business.twilio_phone_number,
      onboardingStatus: business.onboarding_status,
      subscriptionStatus: business.subscription_status
    });

    const siteUrl = getAppBaseUrl()
    const origin = request.headers.get('origin') || siteUrl

    // Check trial eligibility before creating checkout session
    console.log('[stripe-checkout] Checking trial eligibility using direct helper call');
    
    // Use business_phone_number for eligibility check (not twilio_phone_number)
    // business_phone_number is the user's actual business phone number collected during onboarding
    const phoneNumberForEligibility = business.business_phone_number || business.twilio_phone_number || business.forwarding_phone_number
    
    console.log('[stripe-checkout] Using phone number for eligibility check:', phoneNumberForEligibility)
    console.log('[stripe-checkout] Eligibility check input values:', {
      business_phone_number: phoneNumberForEligibility,
      business_email: user.email,
      business_id: business.id,
      user_id: user.id,
      source: 'direct_helper'
    })
    
    if (!phoneNumberForEligibility) {
      console.error('[stripe-checkout] No phone number available for eligibility check')
      return NextResponse.json({ 
        error: 'Business phone number is required for trial eligibility. Please complete onboarding first.' 
      }, { status: 400 })
    }
    
    // Call the shared helper function directly instead of making a server-to-server fetch
    // This avoids authentication issues since we already have the authenticated user
    const eligibilityResult = await checkTrialEligibility({
      business_phone_number: phoneNumberForEligibility,
      business_email: user.email,
      userId: user.id,
      businessId: business.id,
      source: 'direct_helper'
    });
    
    console.log('[stripe-checkout] Eligibility check result:', eligibilityResult);
    console.log('[stripe-checkout] About to check eligibility with mode:', checkoutMode);

    // Determine final checkout mode based on eligibility
    let finalCheckoutMode = checkoutMode
    
    if (checkoutMode === 'trial') {
      if (!eligibilityResult.ok || !eligibilityResult.eligible) {
        console.log('[stripe-checkout] Trial not eligible - switching to paid checkout:', {
          eligibilityResult,
          phoneNumberForEligibility,
          businessEmail: user.email,
          businessId: business.id,
          originalCheckoutMode: checkoutMode,
          finalCheckoutMode: 'paid',
          reason: 'User not eligible for trial based on phone number/email check, allowing paid checkout'
        });
        finalCheckoutMode = 'paid'
      } else {
        console.log('[stripe-checkout] Trial eligible - proceeding with trial checkout');
      }
    } else {
      console.log('[stripe-checkout] Paid checkout mode requested - proceeding regardless of trial eligibility');
    }

    console.log('[stripe-checkout] Proceeding with checkout - mode:', finalCheckoutMode);

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

    const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY

    logUrlResolution('stripe-checkout-site-url', siteUrl, user.id, business.id)

    console.log('[stripe-checkout] Environment check:', {
      origin,
      siteUrl,
      priceId: !!priceId,
      priceIdValue: priceId,
      nodeEnv: process.env.NODE_ENV,
      hasStripeSecretKey: !!stripeSecretKey,
      stripeSecretKeyPrefix: stripeSecretKey ? stripeSecretKey.substring(0, 8) : null,
      stripeSecretKeyMode: stripeSecretKey?.startsWith('sk_live_') ? 'live' : stripeSecretKey?.startsWith('sk_test_') ? 'test' : 'unknown'
    });

    if (!priceId) {
      console.error('[stripe-checkout] NEXT_PUBLIC_STRIPE_PRICE_ID not configured');
      return NextResponse.json({ error: 'Price ID not configured - NEXT_PUBLIC_STRIPE_PRICE_ID missing' }, { status: 500 })
    }

    if (!stripeSecretKey) {
      console.error('[stripe-checkout] STRIPE_SECRET_KEY not configured');
      return NextResponse.json({ error: 'Stripe secret key not configured' }, { status: 500 })
    }

    // Verify price exists in Stripe before creating checkout session
    console.log('[stripe-checkout] Retrieving price from Stripe to verify it exists:', priceId);
    let price;
    try {
      price = await stripe.prices.retrieve(priceId);
      console.log('[stripe-checkout] Price retrieved successfully:', {
        id: price.id,
        active: price.active,
        currency: price.currency,
        unit_amount: price.unit_amount,
        type: price.type,
        product: price.product,
        livemode: price.livemode
      });
    } catch (priceError: any) {
      console.error('[stripe-checkout] Failed to retrieve price from Stripe:', {
        priceId,
        error: priceError.message,
        type: priceError.type,
        code: priceError.code,
        statusCode: priceError.statusCode,
        stripeSecretKeyMode: stripeSecretKey?.startsWith('sk_live_') ? 'live' : stripeSecretKey?.startsWith('sk_test_') ? 'test' : 'unknown'
      });
      return NextResponse.json({ 
        error: `Price ID ${priceId} not found in Stripe account. Please verify NEXT_PUBLIC_STRIPE_PRICE_ID matches a live price in your Stripe account.`,
        priceId,
        stripeError: priceError.message,
        stripeErrorCode: priceError.code
      }, { status: 500 })
    }

    if (!price.active) {
      console.error('[stripe-checkout] Price is not active:', priceId);
      return NextResponse.json({ 
        error: `Price ID ${priceId} exists but is not active. Please activate the price in Stripe.`, 
        priceId 
      }, { status: 500 })
    }

    // Check if price livemode matches secret key mode
    const priceLivemode = price.livemode;
    const secretKeyLivemode = stripeSecretKey.startsWith('sk_live_');
    if (priceLivemode !== secretKeyLivemode) {
      console.error('[stripe-checkout] Price and secret key mode mismatch:', {
        priceId,
        priceLivemode,
        secretKeyLivemode,
        priceLivemodeStr: priceLivemode ? 'live' : 'test',
        secretKeyLivemodeStr: secretKeyLivemode ? 'live' : 'test'
      });
      return NextResponse.json({ 
        error: `Price mode mismatch: Price is ${priceLivemode ? 'live' : 'test'} mode but secret key is ${secretKeyLivemode ? 'live' : 'test'} mode. Please ensure NEXT_PUBLIC_STRIPE_PRICE_ID matches the mode of STRIPE_SECRET_KEY.`,
        priceId,
        priceLivemode,
        secretKeyLivemode
      }, { status: 500 })
    }

    console.log('[STRIPE CHECKOUT] Creating checkout session with:', {
      customerId,
      priceId,
      mode: 'subscription',
      origin,
      businessId: business.id,
      onboardingStatus: business.onboarding_status,
      subscriptionStatus: business.subscription_status,
      hasStripeCustomerId: !!business.stripe_customer_id,
      action: 'checkout',
      checkoutMode: finalCheckoutMode,
      trialPeriodDays: finalCheckoutMode === 'trial' ? 14 : undefined
    });
    
    // Route to dedicated billing success page for smoother post-checkout flow
    const successUrl = `${siteUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${siteUrl}/dashboard?checkout=cancelled`
    
    console.log('[STRIPE CHECKOUT URLS CONFIGURED]', {
      success_url: successUrl,
      cancel_url: cancelUrl,
      appUrl: siteUrl,
      sessionIdPlaceholder: '{CHECKOUT_SESSION_ID}',
      environment: process.env.NODE_ENV,
      vercelUrl: process.env.VERCEL_URL,
      appUrlEnv: process.env.NEXT_PUBLIC_APP_URL,
      siteUrlEnv: process.env.NEXT_PUBLIC_SITE_URL,
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      timestamp: new Date().toISOString()
    })
    
    console.log('[stripe-checkout] Final URLs configured:', { 
      successUrl, 
      cancelUrl,
      siteUrl,
      origin: request.headers.get('origin')
    });
    
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
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        business_id: business.id,
        user_id: user.id,
        onboarding_status: business.onboarding_status || 'unknown'
      },
      subscription_data: {
        // Only include trial period for trial mode
        ...(finalCheckoutMode === 'trial' && { trial_period_days: 14 }),
        metadata: {
          business_id: business.id,
          user_id: user.id,
          checkout_mode: finalCheckoutMode,
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
