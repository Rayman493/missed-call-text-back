// Centralized billing action utilities for ReplyFlow

import { createBrowserClient } from '@/lib/supabase/browser'

export interface BillingActionResult {
  success: boolean
  url?: string
  error?: string
  action?: 'portal' | 'checkout'
}

export async function handleBillingAction(): Promise<BillingActionResult> {
  console.log('[Billing Action] Starting billing action')
  
  const supabase = createBrowserClient()
  
  try {
    // Get current session for auth
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      console.error('[Billing Action] No session found:', sessionError)
      return {
        success: false,
        error: 'Authentication required. Please sign in again.'
      }
    }

    console.log('[Billing Action] Session found, user ID:', session.user.id)
    
    // Note: We no longer check for business existence here
    // The server-side API (create-checkout-session) handles business creation via db.getOrCreateBusiness
    // This prevents "Business not found" errors when user hasn't completed full onboarding yet
    console.log('[Billing Action] Skipping client-side business check - server API will handle business creation')

    // Determine action based on existing Stripe data
    // Fetch current user's business to check for existing Stripe customer/subscription
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle()

    console.log('[Billing Action] Business Stripe data check:', {
      businessExists: !!business,
      hasStripeCustomerId: !!business?.stripe_customer_id,
      hasStripeSubscriptionId: !!business?.stripe_subscription_id,
      businessError: businessError?.message
    })

    // Determine action based on subscription status and Stripe data
    const hasStripeAccount = business?.stripe_customer_id || business?.stripe_subscription_id
    
    // BETA/COMPED ACCESS: Don't route beta/comped users to Stripe
    if (business?.subscription_status === 'beta' || business?.subscription_status === 'comped') {
      console.log('[Billing Action] Beta/Comped user - no billing required')
      return {
        success: false,
        error: 'Billing not required for this account.'
      }
    }
    
    if (hasStripeAccount) {
      console.log('[Billing Action] Selected action: portal (has Stripe account)')
      return await openBillingPortal(session.access_token)
    } else {
      console.log('[Billing Action] Selected action: checkout (no Stripe account)')
      return await openCheckout()
    }
  } catch (error) {
    console.error('[Billing Action] Unexpected error:', error)
    return {
      success: false,
      error: 'Failed to process billing action. Please try again.'
    }
  }
}

async function openBillingPortal(accessToken: string): Promise<BillingActionResult> {
  console.log('[Billing Action] Opening billing portal')
  
  try {
    const response = await fetch('/api/stripe/create-portal-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    })

    const data = await response.json()
    console.log('[Billing Action] Portal response:', data)

    if (data.code === "NO_STRIPE_CUSTOMER") {
      console.log('[Billing Action] No Stripe customer, falling back to checkout')
      return await openCheckout()
    }

    if (data.url && response.ok) {
      console.log('[Billing Action] Redirecting to portal:', data.url)
      return {
        success: true,
        url: data.url,
        action: 'portal'
      }
    }

    if (!response.ok) {
      console.error('[Billing Action] Portal API error:', response.status, data)
      return {
        success: false,
        error: data.error || 'Failed to open billing portal'
      }
    }

    return {
      success: false,
      error: 'Failed to open billing portal. Please try again.'
    }
  } catch (error) {
    console.error('[Billing Action] Portal error:', error)
    return {
      success: false,
      error: 'Failed to open billing portal. Please try again.'
    }
  }
}

async function openCheckout(): Promise<BillingActionResult> {
  console.log('[Billing Action] Opening checkout')
  
  try {
    const response = await fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })

    const data = await response.json()
    console.log('[Billing Action] Checkout response:', data)

    if (data.url && response.ok) {
      console.log('[Billing Action] Redirecting to checkout:', data.url)
      return {
        success: true,
        url: data.url,
        action: 'checkout'
      }
    }

    if (!response.ok) {
      console.error('[Billing Action] Checkout API error:', response.status, data)
      return {
        success: false,
        error: data.error || 'Failed to start checkout'
      }
    }

    return {
      success: false,
      error: 'Failed to start checkout. Please try again.'
    }
  } catch (error) {
    console.error('[Billing Action] Checkout error:', error)
    return {
      success: false,
      error: 'Failed to start checkout. Please try again.'
    }
  }
}
