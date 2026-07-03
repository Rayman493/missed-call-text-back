'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { isActiveSubscription } from '@/lib/subscription'
import { hasBillingAccess } from '@/lib/manual-access'
import AppLoadingScreen from '@/components/AppLoadingScreen'
import StripeReturnLoadingScreen from '@/components/StripeReturnLoadingScreen'
import CheckoutRedirectLoadingScreen from '@/components/CheckoutRedirectLoadingScreen'
import { logRouteFlashDebug } from '@/lib/route-flash-debug'
import { isStripeReturnUrl } from '@/lib/stripe-return'

export default function BusinessGuard({ children }: { children: React.ReactNode }) {
  const { business, loading, fetchComplete, error: businessError, businessMissingConfirmed } = useBusiness()
  const { user, session } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const checkoutStatus = searchParams?.get('checkout')

  // Add explicit state tracking
  const [initialized, setInitialized] = useState(false)
  // Initialize businessVerified from sessionStorage immediately to prevent loading flash
  const [businessVerified, setBusinessVerified] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('replyflow_business_verified') === 'true'
    }
    return false
  })
  const [showLoading, setShowLoading] = useState(false)
  const hasRedirectedRef = useRef<string | null>(null)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Track current and previous pathname for route flash debugging
  const previousPathnameRef = useRef<string | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const current = window.location.pathname
    if (current !== pathname) {
      previousPathnameRef.current = pathname
    }
  }, [pathname])

  // Clear stale businessVerified cache when returning from Stripe cancel
  // This ensures fresh business validation instead of relying on cached state
  useEffect(() => {
    if (checkoutStatus === 'cancelled' && typeof window !== 'undefined') {
      console.log('[BusinessGuard] checkout=cancelled detected, clearing businessVerified cache')
      sessionStorage.removeItem('replyflow_business_verified')
      setBusinessVerified(false)
    }
  }, [checkoutStatus])

  useEffect(() => {
    // Mark as initialized once loading is complete and fetch is complete
    if (!loading && fetchComplete) {
      setInitialized(true)
    }

    // Cache business verified state when business is loaded
    if (business && !loading && fetchComplete && !businessVerified && typeof window !== 'undefined') {
      setBusinessVerified(true)
      sessionStorage.setItem('replyflow_business_verified', 'true')
    } else if (!business && !loading && fetchComplete && businessVerified && typeof window !== 'undefined') {
      // Clear cache if business is missing
      sessionStorage.removeItem('replyflow_business_verified')
      setBusinessVerified(false)
    }

    // Handle loading state with delay to prevent flash
    if (loading && !showLoading && !businessVerified) {
      // Show loading only after 200ms delay to prevent flash for fast checks
      loadingTimeoutRef.current = setTimeout(() => {
        setShowLoading(true)
      }, 200)
    } else if (!loading) {
      // Clear timeout and hide loading when not loading
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
        loadingTimeoutRef.current = null
      }
      setShowLoading(false)
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
    }
  }, [business, loading, fetchComplete, businessVerified, showLoading])

  // Redirect logic - separate useEffect
  useEffect(() => {
    // Reset redirect ref when pathname changes to allow new redirects
    if (hasRedirectedRef.current && hasRedirectedRef.current !== pathname) {
      hasRedirectedRef.current = null
    }

    // Don't redirect if already on onboarding page
    if (pathname?.startsWith('/onboarding')) return

    // Don't redirect if on homepage
    if (pathname === '/') return

    // Never redirect from leads pages
    if (pathname?.startsWith('/dashboard/leads')) return

    // Don't redirect from dashboard subpages
    const isMainDashboardPage = pathname === '/dashboard'
    const isDashboardSubpage = pathname?.startsWith('/dashboard/') && !isMainDashboardPage
    if (isDashboardSubpage) return

    // Don't redirect if checkout=success is present
    if (checkoutStatus === 'success') return

    // Don't redirect if mode=review is present (allows reviewing forwarding instructions)
    const modeParam = searchParams?.get('mode')
    if (modeParam === 'review') return

    // Only redirect if loading is complete and initialized
    if (!loading && initialized) {
      // Redirect if user is not authenticated
      if (!user) {
        if (hasRedirectedRef.current === pathname) return
        hasRedirectedRef.current = pathname
        router.push('/auth/signin?redirect=/dashboard')
        return
      }

      // Redirect if no business exists
      if (!business) {
        if (fetchComplete && businessMissingConfirmed) {
          if (hasRedirectedRef.current === pathname) return

          if (!session) {
            hasRedirectedRef.current = pathname
            router.push('/auth/signin?redirect=/dashboard')
            return
          }

          hasRedirectedRef.current = pathname
          router.push('/onboarding')
          return
        }
        return
      }

      // SIMPLIFIED GATING: If subscription_status is null, redirect to complete-setup page
      // This means business exists but Stripe Checkout has NOT been completed
      // Show the intermediate page so users can continue checkout or delete their account
      if (business.subscription_status === null) {
        if (hasRedirectedRef.current === pathname) return
        hasRedirectedRef.current = pathname
        
        // Redirect to complete-setup page instead of immediately redirecting to Stripe
        // This gives users an escape hatch to delete their account if they abandon checkout
        router.push('/complete-setup')
        return
      }

      const hasAccess = hasBillingAccess(business)
      const hasBasicProfile = business.name && business.business_phone_number

      // Forwarding not verified - redirect to test-setup (only on non-dashboard pages)
      if (business.call_forwarding_enabled && !business.forwarding_verified && !pathname?.startsWith('/dashboard/test-setup') && !pathname?.startsWith('/dashboard') && hasAccess) {
        router.replace('/dashboard/test-setup')
        return
      }

      // No basic profile and no access -> redirect to onboarding if no business row
      if (!hasBasicProfile && !hasAccess) {
        if (business && business.id) {
          // Allow access - dashboard will show setup prompts
        } else {
          if (hasRedirectedRef.current === pathname) return
          if (!session) {
            router.push('/auth/signin?redirect=/dashboard')
            return
          }
          hasRedirectedRef.current = pathname
          router.push('/onboarding')
          return
        }
      }
    }
  }, [business, loading, router, pathname, checkoutStatus, initialized, user, session, fetchComplete, businessMissingConfirmed, businessError])

  // STRIPE RETURN LOADING GATE: After returning from Stripe Checkout or Billing Portal,
  // keep showing a neutral loading screen until business state is fully rehydrated.
  // This prevents a flash of onboarding/setup while business is temporarily null/loading.
  const isStripeReturn = typeof window !== 'undefined' && isStripeReturnUrl(window.location.href)
  if (isStripeReturn && (loading || !fetchComplete || !business)) {
    logRouteFlashDebug({
      source: 'BusinessGuard',
      pathname,
      previousPathname: previousPathnameRef.current,
      authLoading: false,
      userId: user?.id ?? null,
      businessId: business?.id ?? null,
      onboardingStatus: business?.onboarding_status,
      subscriptionStatus: business?.subscription_status,
      renderBranch: 'loading',
      reason: 'Stripe return detected; business still loading or transiently missing; showing StripeReturnLoadingScreen',
    })
    return <StripeReturnLoadingScreen />
  }

  // EXPLICIT CHECKOUT REDIRECT GATE: If business exists but checkout is not completed,
  // show redirect loading screen immediately and never render dashboard content.
  // This prevents the dashboard flash before the redirect useEffect kicks in.
  if (business && business.subscription_status === null) {
    logRouteFlashDebug({
      source: 'BusinessGuard',
      pathname,
      previousPathname: previousPathnameRef.current,
      authLoading: false,
      userId: user?.id ?? null,
      businessId: business?.id ?? null,
      onboardingStatus: business?.onboarding_status,
      subscriptionStatus: business?.subscription_status,
      renderBranch: 'checkout-redirect',
      reason: 'business exists but subscription_status is null; showing checkout redirect loading screen',
    })
    return <CheckoutRedirectLoadingScreen />
  }

  // Show loading state while business is loading or not yet initialized
  // Skip loading ONLY if business is already verified AND business data is actually present.
  // During Stripe return rehydration, business can be temporarily null while businessVerified
  // is cached. Showing children without business data causes the onboarding/setup flash.
  if (showLoading || !initialized) {
    if (businessVerified && business) {
      // Render children immediately, don't wait for loading to complete
      logRouteFlashDebug({
        source: 'BusinessGuard',
        pathname,
        previousPathname: previousPathnameRef.current,
        authLoading: !initialized,
        userId: user?.id ?? null,
        businessId: business?.id ?? null,
        onboardingStatus: business?.onboarding_status,
        subscriptionStatus: business?.subscription_status,
        renderBranch: 'dashboard-content',
        reason: 'businessVerified + business present; skip loading overlay',
      })
      return <>{children}</>
    }

    // If business is still loading or transiently missing, show loading (not onboarding/setup).
    logRouteFlashDebug({
      source: 'BusinessGuard',
      pathname,
      previousPathname: previousPathnameRef.current,
      authLoading: !initialized,
      userId: user?.id ?? null,
      businessId: business?.id ?? null,
      onboardingStatus: business?.onboarding_status,
      subscriptionStatus: business?.subscription_status,
      renderBranch: 'loading',
      reason: 'business still loading or not initialized; rendering AppLoadingScreen',
    })
    return <AppLoadingScreen />
  }

  if (!business) {
    logRouteFlashDebug({
      source: 'BusinessGuard',
      pathname,
      previousPathname: previousPathnameRef.current,
      authLoading: !initialized,
      userId: user?.id ?? null,
      businessId: null,
      onboardingStatus: null,
      subscriptionStatus: null,
      renderBranch: 'onboarding-redirect',
      reason: 'no business after fetch complete; redirecting to onboarding for recovery',
    })
    
    // Redirect to onboarding instead of showing error screen
    // This handles orphan auth users gracefully
    if (hasRedirectedRef.current === pathname) return
    hasRedirectedRef.current = pathname
    router.push('/onboarding')
    return <AppLoadingScreen />
  }

  logRouteFlashDebug({
    source: 'BusinessGuard',
    pathname,
    previousPathname: previousPathnameRef.current,
    authLoading: false,
    userId: user?.id ?? null,
    businessId: business?.id ?? null,
    onboardingStatus: business?.onboarding_status,
    subscriptionStatus: business?.subscription_status,
    renderBranch: 'dashboard-content',
    reason: 'business loaded and guard passed; rendering children',
  })
  return <>{children}</>
}
