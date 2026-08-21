// Centralized billing action utilities for ReplyFlow

import { createBrowserClient } from '@/lib/supabase/browser'
import { openNativeWebSession, isNativeIOS, isNativeAndroid } from '@/lib/native-web-session'
import { setPendingStripeOperation } from '@/lib/external-return-handler'

export interface BillingActionResult {
  success: boolean
  url?: string
  error?: string
  action?: 'portal' | 'checkout'
  canceled?: boolean
}

/**
 * Determines if a business has an existing Stripe subscription that should be managed via Portal
 * rather than creating a new subscription via Checkout.
 *
 * This is a safety check to prevent duplicate subscriptions.
 * A business has an existing subscription if it has a stripe_subscription_id
 * and the subscription is in a state that indicates it still exists in Stripe
 * (not fully terminated).
 *
 * @param business - The business object
 * @returns true if business has an existing Stripe subscription, false otherwise
 */
function hasExistingStripeSubscription(business: any): boolean {
  // A business has an existing Stripe subscription if:
  // 1. stripe_subscription_id exists (has a Stripe subscription record)
  // 2. subscription_status is NOT null (has a subscription status)
  // 3. subscription_status is NOT canceled (subscription not fully terminated)
  //
  // This means: active, trialing, past_due, unpaid should use Portal
  // canceled, null should use Checkout
  const hasSubscriptionId = !!business?.stripe_subscription_id
  const hasStatus = !!business?.subscription_status
  const isCanceled = business?.subscription_status === 'canceled'
  const isBetaComped = business?.subscription_status === 'beta' || business?.subscription_status === 'comped'

  return hasSubscriptionId && hasStatus && !isCanceled && !isBetaComped
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

    // Determine action based on subscription status and Stripe data
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('stripe_customer_id, stripe_subscription_id, subscription_status')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle()

    console.log('[Billing Action] Business Stripe data check:', {
      businessExists: !!business,
      hasStripeCustomerId: !!business?.stripe_customer_id,
      hasStripeSubscriptionId: !!business?.stripe_subscription_id,
      subscriptionStatus: business?.subscription_status,
      businessError: businessError?.message
    })

    // Determine action based on subscription status and Stripe data
    const hasStripeAccount = business?.stripe_customer_id || business?.stripe_subscription_id
    const hasExistingSubscription = hasExistingStripeSubscription(business)
    
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
      // Pass current URL as return URL for better UX
      const currentUrl = typeof window !== 'undefined' ? window.location.href : undefined
      return await openBillingPortal(session.access_token, currentUrl, hasExistingSubscription)
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

async function openBillingPortal(accessToken: string, returnUrl?: string, hasExistingSubscription = false): Promise<BillingActionResult> {
  console.log('[Billing Action] Opening billing portal')

  try {
    const response = await fetch('/api/stripe/create-portal-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ returnUrl })
    })

    const data = await response.json()
    // REDACTED: Do not log full portal URL (contains session secret)
    console.log('[Billing Action] Portal response:', {
      urlPresent: !!data.url,
      ok: response.ok
    })

    // Only fall back to checkout if:
    // 1. Portal response positively indicates NO customer (not a network/API error)
    // 2. Business does NOT have an existing active/trialing subscription
    const isNoCustomerError = data.code === "NO_STRIPE_CUSTOMER" || data.code === "INVALID_STRIPE_CUSTOMER" || data.code === "CUSTOMER_NOT_FOUND"

    if (!hasExistingSubscription && isNoCustomerError) {
      console.log('[Billing Action] No existing subscription and no Stripe customer (positive indication), falling back to checkout')
      return await openCheckout()
    }

    if (data.url && response.ok) {
      // Use native web session for native platforms, web navigation for desktop/web
      if (isNativeIOS() || isNativeAndroid()) {
        console.log('[Billing Action] Opening portal in native web session')

        // Get business ID for pending operation tracking
        const supabase = createBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()
        const { data: business } = await supabase
          .from('businesses')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle()

        // Set pending operation for external return handler reconciliation
        if (business?.id) {
          await setPendingStripeOperation('portal', business.id, user?.id)
          console.log('[Billing Action] Pending portal operation set for business:', business.id)
        }

        try {
          // Use deterministic return URL for native platforms
          const callbackUrl = `${window.location.origin}/dashboard/settings?billing=returned`
          const callbackUrlObj = new URL(callbackUrl)
          const callbackHost = callbackUrlObj.hostname
          const callbackPath = callbackUrlObj.pathname + callbackUrlObj.search

          const result = await openNativeWebSession({
            url: data.url,
            callbackHost,
            callbackPath,
          })
          console.log('[Billing Action] Native session completed:', result)

          // Handle terminal result
          if (result.canceled) {
            console.log('[Billing Action] User canceled portal session')
            // Clear pending operation on cancel
            await setPendingStripeOperation(null)
            return {
              success: true,
              url: data.url,
              action: 'portal',
              canceled: true
            }
          }

          if (result.errorCode || result.errorMessage) {
            console.error('[Billing Action] Native session error:', result.errorCode, result.errorMessage)
            // Clear pending operation on error
            await setPendingStripeOperation(null)
            return {
              success: false,
              error: result.errorMessage || 'Failed to open billing portal. Please try again.'
            }
          }

          // Success - external return handler will handle reconciliation
          return {
            success: true,
            url: data.url,
            action: 'portal'
          }
        } catch (error) {
          console.error('[Billing Action] Native session failed:', error)
          // Clear pending operation on error
          await setPendingStripeOperation(null)
          return {
            success: false,
            error: 'Failed to open billing portal. Please try again.'
          }
        }
      } else {
        // Desktop/web: Use normal browser navigation
        console.log('[Billing Action] Opening portal in browser (desktop/web)')
        console.log('[Billing Action] Redirecting to portal (web)')
        return {
          success: true,
          url: data.url,
          action: 'portal'
        }
      }
    }

    if (!response.ok) {
      console.error('[Billing Action] Portal API error:', response.status, data)
      // All errors show failure message - no fallback on network/API errors
      if (hasExistingSubscription) {
        return {
          success: false,
          error: 'Unable to open billing for this account. Please contact support.'
        }
      }
      // Even for accounts without existing subscriptions, network/API errors do NOT prove they need checkout
      return {
        success: false,
        error: 'Unable to open billing right now. Please try again.'
      }
    }

    return {
      success: false,
      error: data.error || 'Unable to open billing right now. Please try again.'
    }
  } catch (error) {
    console.error('[Billing Action] Portal error:', error)
    // Network/fetch exceptions do NOT prove the business needs checkout
    // Always show retry message, never fallback to checkout on network errors
    return {
      success: false,
      error: 'Unable to open billing right now. Please try again.'
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
