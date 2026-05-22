import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import getStripe from '@/lib/stripe'
import { getAppBaseUrl, logUrlResolution } from '@/lib/urls'
import { db } from '@/lib/supabase/admin'

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
    console.log('[stripe-checkout] Checking trial eligibility');
    
    // Use business_phone_number for eligibility check (not twilio_phone_number)
    // business_phone_number is the user's actual business phone number collected during onboarding
    const phoneNumberForEligibility = business.business_phone_number || business.twilio_phone_number || business.forwarding_phone_number
    
    console.log('[stripe-checkout] Using phone number for eligibility check:', phoneNumberForEligibility)
    console.log('[stripe-checkout] Eligibility check input values:', {
      business_phone_number: phoneNumberForEligibility,
      business_email: user.email,
      business_id: business.id
    })
    
    if (!phoneNumberForEligibility) {
      console.error('[stripe-checkout] No phone number available for eligibility check')
      return NextResponse.json({ 
        error: 'Business phone number is required for trial eligibility. Please complete onboarding first.' 
      }, { status: 400 })
    }
    
    const eligibilityCheck = await fetch(`${siteUrl}/api/trial/check-eligibility`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        business_phone_number: phoneNumberForEligibility,
        business_email: user.email,
      }),
    });

    const eligibilityResult = await eligibilityCheck.json();
    console.log('[stripe-checkout] Eligibility check result:', eligibilityResult);
    console.log('[stripe-checkout] About to check eligibility with mode:', checkoutMode);

    if (!eligibilityResult.ok || !eligibilityResult.eligible) {
      console.log('[stripe-checkout] Trial eligibility check result:', eligibilityResult);
      console.log('[stripe-checkout] Checkout mode at eligibility check:', checkoutMode);
      
      // Only block checkout if this is a trial checkout
      // Paid checkouts should be allowed even if trial is not eligible
      if (checkoutMode === 'trial') {
        console.error('[stripe-checkout] Trial checkout blocked - not eligible:', eligibilityResult);
        return NextResponse.json(
          { 
            error: eligibilityResult.message || 'Trial eligibility check failed',
            reasons: eligibilityResult.reasons,
            support_email: eligibilityResult.support_email,
            cooldown_end_date: eligibilityResult.checks?.cooldown_end_date,
          },
          { status: 403 }
        );
      } else {
        console.log('[stripe-checkout] Paid checkout allowed despite trial ineligibility');
      }
    } else {
      console.log('[stripe-checkout] Trial eligible - proceeding with checkout');
    }

    console.log('[stripe-checkout] Proceeding with checkout - mode:', checkoutMode);

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
    
    logUrlResolution('stripe-checkout-site-url', siteUrl, user.id, business.id)
    
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
      onboardingStatus: business.onboarding_status,
      subscriptionStatus: business.subscription_status,
      hasStripeCustomerId: !!business.stripe_customer_id,
      action: 'checkout'
    });
    
    // Route to dedicated billing success page for smoother post-checkout flow
    // Check if debugAuth parameter is present from multiple sources
    const requestBody = await request.json().catch(() => ({}))
    const requestUrl = new URL(request.url)
    const referer = request.headers.get('referer')
    const requestOrigin = request.headers.get('origin')
    
    // Priority order: request body > URL params > referer > origin
    let debugAuthDetected = false
    let debugAuthSource = 'none'
    
    if (requestBody.debugAuth === true) {
      debugAuthDetected = true
      debugAuthSource = 'request_body'
    } else if (requestUrl.searchParams.get('debugAuth') === 'true') {
      debugAuthDetected = true
      debugAuthSource = 'url_params'
    } else if (referer && referer.includes('debugAuth=true')) {
      debugAuthDetected = true
      debugAuthSource = 'referer'
    } else if (requestOrigin && requestOrigin.includes('debugAuth=true')) {
      debugAuthDetected = true
      debugAuthSource = 'origin'
    }
    
    const debugAuthParam = debugAuthDetected ? '&debugAuth=true' : ''
    
    const successUrl = `${siteUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}${debugAuthParam}`
    const cancelUrl = `${siteUrl}/dashboard?checkout=cancelled${debugAuthParam}`
    
    // Comprehensive server-side logging for Vercel
    console.log('[STRIPE CHECKOUT DEBUGAUTH ANALYSIS]', {
      timestamp: new Date().toISOString(),
      requestUrl: request.url,
      requestBody: requestBody,
      debugAuthDetected,
      debugAuthSource,
      debugAuthParam,
      success_url: successUrl,
      cancel_url: cancelUrl,
      referer: referer,
      requestOrigin: requestOrigin,
      hasDebugAuthInSuccessUrl: successUrl.includes('debugAuth=true'),
      hasDebugAuthInCancelUrl: cancelUrl.includes('debugAuth=true')
    })
    
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
      referer: referer,
      debugAuthDetected: debugAuthParam !== '',
      debugAuthParam,
      timestamp: new Date().toISOString()
    })
    
    // Log debug parameter preservation
    console.log('[STRIPE_DEBUG_PARAM_PRESERVED]', {
      success_url_has_debugAuth: successUrl.includes('debugAuth=true'),
      cancel_url_has_debugAuth: cancelUrl.includes('debugAuth=true'),
      debugAuthDetected: debugAuthParam !== '',
      referer: referer,
      requestOrigin: requestOrigin,
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
      metadata: {
        business_id: business.id,
        user_id: user.id,
        onboarding_status: business.onboarding_status || 'unknown'
      },
      subscription_data: {
        // Only include trial period for trial mode
        ...(checkoutMode === 'trial' && { trial_period_days: 14 }),
        metadata: {
          business_id: business.id,
          user_id: user.id,
          checkout_mode: checkoutMode,
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
