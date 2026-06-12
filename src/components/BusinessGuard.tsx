'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { isActiveSubscription } from '@/lib/subscription'
import { hasBillingAccess } from '@/lib/manual-access'
import AppLoadingScreen from '@/components/AppLoadingScreen'

export default function BusinessGuard({ children }: { children: React.ReactNode }) {
  const { business, loading, fetchComplete, error: businessError, businessMissingConfirmed } = useBusiness()
  const { user, session } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const checkoutStatus = searchParams?.get('checkout')

  // Add explicit state tracking
  const [initialized, setInitialized] = useState(false)
  const hasRedirectedRef = useRef<string | null>(null)

  useEffect(() => {
    console.log('[BUSINESS GUARD DECISION]', {
      currentPath: pathname,
      authLoading: loading,
      businessLoading: loading,
      businessFetchComplete: fetchComplete,
      businessFound: !!business,
      businessMissingConfirmed,
      businessError: businessError,
      redirectTarget: null,
      reason: 'Evaluating guard state'
    })

    console.log('[Routing] BusinessGuard evaluating')
    console.log('[Routing] auth user id:', user?.id || 'none')
    console.log('[Routing] businessLoading:', loading)
    console.log('[Routing] business exists:', !!business)
    console.log('[Routing] business fetch complete:', fetchComplete)
    console.log('[Routing] User authenticated:', !!user)
    console.log('[Routing] User ID:', user?.id)
    console.log('[Routing] Loading state:', loading)
    console.log('[Routing] Business state:', {
      exists: !!business,
      id: business?.id,
      onboarding_status: business?.onboarding_status,
      forwarding_verified: business?.forwarding_verified,
      subscription_status: business?.subscription_status
    })
    console.log('[Routing] Pathname:', pathname)
    console.log('[Routing] Checkout status:', checkoutStatus)
    
    // Mark as initialized once loading is complete and fetch is complete
    if (!loading && fetchComplete) {
      setInitialized(true)
      console.log('[Routing] BusinessGuard initialized')
    }
    
    // Reset redirect ref when pathname changes to allow new redirects
    if (hasRedirectedRef.current && hasRedirectedRef.current !== pathname) {
      hasRedirectedRef.current = null
      console.log('[Routing] Reset hasRedirectedRef due to pathname change')
    }
    
    // Don't redirect if already on onboarding page
    if (pathname?.startsWith('/onboarding')) {
      console.log('[Routing] Already on onboarding, skipping redirect')
      return
    }
    
    // Don't redirect if on homepage - allow logged-in users to see public homepage
    if (pathname === '/') {
      console.log('[Routing] On homepage, skipping redirect')
      return
    }
    
    // CRITICAL FIX: Never redirect from leads pages - they must stay accessible
    if (pathname?.startsWith('/dashboard/leads')) {
      console.log('[Routing] On leads page, skipping ALL redirects', {
        pathname,
        reason: 'Leads pages must remain accessible regardless of setup state'
      })
      return
    }
    
    // IMPORTANT: Don't redirect from dashboard subpages due to setup issues
    // Only apply setup-based redirects on the main dashboard page (/dashboard)
    // This allows users to access leads, calendar, settings, etc. even with incomplete setup
    const isMainDashboardPage = pathname === '/dashboard'
    const isDashboardSubpage = pathname?.startsWith('/dashboard/') && !isMainDashboardPage
    
    if (isDashboardSubpage) {
      console.log('[Routing] On dashboard subpage, skipping setup-based redirects', {
        pathname,
        reason: 'Dashboard subpages should remain accessible regardless of setup state'
      })
      return
    }
    
    // Don't redirect if checkout=success is present (waiting for webhook)
    if (checkoutStatus === 'success') {
      console.log('[BusinessGuard] ===== CHECKOUT SUCCESS MODE ACTIVE =====')
      console.log('[BusinessGuard] Skipping all redirects to allow session recovery')
      console.log('[BusinessGuard] Waiting for AuthGuard to recover session via getUser/getSession')
      return
    }
    
    // Only redirect if loading is complete and initialized
    if (!loading && initialized) {
      // Redirect if user is not authenticated
      if (!user) {
        if (hasRedirectedRef.current === pathname) {
          console.log('[Routing] Already redirected from this path, skipping')
          return
        }
        console.log('[REDIRECT]', {
          from: pathname,
          to: '/auth/signin?redirect=/dashboard',
          reason: 'No user authenticated',
          hasSession: !!session,
          component: 'BusinessGuard',
        })
        console.log('[Routing] No user authenticated, redirecting to sign in')
        console.error('[DASHBOARD REDIRECT]', {
          file: 'src/components/BusinessGuard.tsx',
          line: 103,
          reason: 'No user authenticated',
          from: pathname,
          to: '/auth/signin?redirect=/dashboard',
          stack: new Error().stack
        })
        hasRedirectedRef.current = pathname
        router.push('/auth/signin?redirect=/dashboard')
        return
      }
      
      // Redirect if no business exists
      if (!business) {
        console.log('[Routing] No business found, checking if fetch is complete and business missing is confirmed')
        
        // Only redirect to onboarding if fetch is complete AND business missing is confirmed (PGRST116)
        if (fetchComplete && businessMissingConfirmed) {
          console.log('[BUSINESS GUARD DECISION]', {
            currentPath: pathname,
            authLoading: loading,
            businessLoading: loading,
            businessFetchComplete: fetchComplete,
            businessFound: !!business,
            businessMissingConfirmed,
            businessError: businessError,
            redirectTarget: '/onboarding',
            reason: 'Fetch complete and business missing confirmed (PGRST116)'
          })
          
          if (hasRedirectedRef.current === pathname) {
            console.log('[Routing] Already redirected from this path, skipping')
            return
          }
          console.log('[ONBOARDING REDIRECT SOURCE]', {
            file: 'src/components/BusinessGuard.tsx',
            functionName: 'BusinessGuard useEffect',
            currentPath: pathname,
            redirectTarget: '/onboarding',
            userId: user?.id,
            sessionExists: !!session,
            authLoading: loading,
            businessLoading: loading,
            businessFetchComplete: fetchComplete,
            businessId: null,
            businessFound: false,
            businessErrorCode: businessError,
            businessErrorMessage: businessError,
            reason: 'No business row exists and fetch complete with PGRST116 confirmation',
            timestamp: new Date().toISOString()
          })
          console.trace('[ONBOARDING REDIRECT TRACE]')
          
          console.log('[Routing] Fetch complete and no business confirmed, redirecting to onboarding')
          console.log('[Routing] render branch: no business, fetch complete, PGRST116 confirmed -> onboarding')
          
          // Verify session exists before redirecting to onboarding
          if (!session) {
            console.log('[REDIRECT]', {
              from: pathname,
              to: '/auth/signin?redirect=/dashboard',
              reason: 'No session exists, redirecting to sign in instead of onboarding',
              hasSession: !!session,
              component: 'BusinessGuard',
            })
            console.error('[Routing] No session exists, redirecting to sign in instead of onboarding')
            console.error('[DASHBOARD REDIRECT]', {
              file: 'src/components/BusinessGuard.tsx',
              line: 170,
              reason: 'No session exists, redirecting to sign in instead of onboarding',
              from: pathname,
              to: '/auth/signin?redirect=/dashboard',
              stack: new Error().stack
            })
            hasRedirectedRef.current = pathname
            router.push('/auth/signin?redirect=/dashboard')
            return
          }
          
          console.log('[REDIRECT]', {
            from: pathname,
            to: '/onboarding',
            reason: 'No business found and fetch complete with PGRST116 confirmation',
            hasSession: !!session,
            component: 'BusinessGuard',
          })
          hasRedirectedRef.current = pathname
          router.push('/onboarding')
          return
        } else {
          console.log('[Routing] Fetch not complete yet or business missing not confirmed, waiting for business data')
          console.log('[Routing] render branch: no business, fetch incomplete or not PGRST116 -> loading')
          return
        }
      }
      
      // Redirect if onboarding is not completed AND forwarding is not verified
      // Only allow access if onboarding is completed OR user has active subscription
      // Note: forwarding_verified can be false if user hasn't tested yet, but they can still access dashboard
      
      // NEW LOGIC: Allow dashboard access if business profile exists, even if subscription is not active
      // This prevents redirecting users who have created a profile but haven't started trial yet
      const isOnboardingComplete = business.onboarding_status === 'completed'
      const hasActiveSubscription = isActiveSubscription(business.subscription_status)
      const hasAccess = hasBillingAccess(business) // This includes manual access checks
      
      // Check if user has basic business profile data
      const hasBasicProfile = business.name && business.business_phone_number
      
      // Derived state for routing decision
      const derivedState = (() => {
        if (!business) return 'no_business'
        if (!hasBasicProfile) return 'no_profile'
        if (hasAccess) return 'access_granted'
        if (business.subscription_status === null) return 'trial_pending'
        return 'subscription_inactive'
      })()
      
      console.log('[BusinessGuard] Derived routing state:', {
        derivedState,
        hasBasicProfile,
        isOnboardingComplete,
        hasActiveSubscription,
        hasBillingAccess: hasAccess,
        manualAccessEnabled: business.manual_access_enabled,
        manualAccessExpiresAt: business.manual_access_expires_at,
        subscription_status: business.subscription_status,
        business_name: business.name,
        business_phone_number: business.business_phone_number,
      })
      
      // Check if forwarding is enabled but not verified - redirect to test-setup
      // BUT only if user is not already on dashboard and has access (to prevent hard-lock)
      if (business.call_forwarding_enabled && !business.forwarding_verified && !pathname?.startsWith('/dashboard/test-setup') && !pathname?.startsWith('/dashboard') && hasAccess) {
        console.log('[BusinessGuard] Forwarding enabled but not verified - redirecting to test-setup', {
          call_forwarding_enabled: business.call_forwarding_enabled,
          forwarding_verified: business.forwarding_verified,
          pathname,
          hasAccess
        })
        router.replace('/dashboard/test-setup')
        return
      }

      // IMPORTANT: If a business row exists, do NOT send to onboarding step 1
      // Only redirect to onboarding step 1 if no business row exists at all
      // If business exists but profile is incomplete, allow dashboard access with setup prompts
      if (!hasBasicProfile && !hasAccess) {
        // Check if business row exists
        if (business && business.id) {
          // Business row exists but profile is incomplete - allow dashboard access
          // The dashboard will show setup prompts for missing fields
          console.log('[ROUTING AUDIT DEBUG]', {
            location: 'src/components/BusinessGuard.tsx',
            guardName: 'BusinessGuard',
            currentPath: pathname,
            userId: user?.id,
            sessionExists: !!session,
            authLoading: loading,
            businessLoading: loading,
            businessId: business.id,
            businessFound: true,
            businessName: business?.name,
            businessPhone: business?.business_phone_number,
            twilioNumberFound: !!business?.twilio_phone_number,
            setupComplete: business?.onboarding_status === 'completed',
            redirectTarget: 'dashboard (stay)',
            reason: 'Business row exists but profile incomplete - allowing dashboard access',
            loadingState: loading ? 'loading' : 'complete'
          })
          
          console.log('[BusinessGuard] Business row exists but profile incomplete - allowing dashboard access', {
            reason: 'Business row exists, will show setup prompts in dashboard',
            derivedState,
            redirectAllowed: false
          })
          
          // Allow access - dashboard will show setup prompts
        } else {
          // No business row exists - redirect to onboarding step 1
          if (hasRedirectedRef.current === pathname) {
            console.log('[Routing] Already redirected from this path, skipping')
            return
          }
          console.log('[ONBOARDING REDIRECT SOURCE]', {
            file: 'src/components/BusinessGuard.tsx',
            functionName: 'BusinessGuard useEffect',
            currentPath: pathname,
            redirectTarget: '/onboarding',
            userId: user?.id,
            sessionExists: !!session,
            authLoading: loading,
            businessLoading: loading,
            businessFetchComplete: fetchComplete,
            businessId: null,
            businessFound: false,
            businessErrorCode: businessError,
            businessErrorMessage: businessError,
            reason: 'No business row exists (profile incomplete check)',
            timestamp: new Date().toISOString()
          })
          console.trace('[ONBOARDING REDIRECT TRACE]')
          
          console.log('[Post Trial Routing Decision]', {
            pathname,
            destination: '/onboarding',
            subscriptionStatus: business?.subscription_status,
            onboardingStatus: business?.onboarding_status,
            hasBusiness: !!business,
            hasAccess,
            reason: 'No business row exists'
          })
          
          console.log('[BusinessGuard] Redirecting to onboarding - no business row', {
            reason: 'No business row exists',
            derivedState,
            redirectAllowed: true
          })
          
          // Verify session exists before redirecting to onboarding
          if (!session) {
            console.log('[REDIRECT]', {
              from: pathname,
              to: '/auth/signin?redirect=/dashboard',
              reason: 'No session exists, redirecting to sign in instead of onboarding',
              hasSession: !!session,
              component: 'BusinessGuard',
            })
            console.error('[Routing] No session exists, redirecting to sign in instead of onboarding')
            console.error('[DASHBOARD REDIRECT]', {
              file: 'src/components/BusinessGuard.tsx',
              line: 332,
              reason: 'No session exists, redirecting to sign in instead of onboarding',
              from: pathname,
              to: '/auth/signin?redirect=/dashboard',
              stack: new Error().stack
            })
            router.push('/auth/signin?redirect=/dashboard')
            return
          }
          
          console.log('[REDIRECT]', {
            from: pathname,
            to: '/onboarding',
            reason: 'No business row exists',
            hasSession: !!session,
            component: 'BusinessGuard',
          })
          hasRedirectedRef.current = pathname
          router.push('/onboarding')
          return
        }
      }
      
      console.log('[Post Trial Routing Decision]', {
        pathname,
        destination: 'dashboard',
        subscriptionStatus: business.subscription_status,
        onboardingStatus: business.onboarding_status,
        hasBusiness: !!business,
        hasAccess,
        reason: hasAccess ? 'Access granted (stripe or manual)' : 'Profile exists, allowing dashboard access'
      })
      
      console.log('[BusinessGuard] Allowing access - user has business profile', {
        reason: derivedState === 'trial_pending' ? 'Profile exists, trial pending' : 
                 derivedState === 'access_granted' ? 'Access granted (stripe or manual)' : 
                 'Profile exists',
        derivedState,
        redirectAllowed: false
      })
    } else {
      console.log('[Routing] Business still loading or not initialized, waiting...')
    }
  }, [business, loading, router, pathname, checkoutStatus, initialized, user])

  // Show loading state while business is loading or not yet initialized
  if (loading || !initialized) {
    return <AppLoadingScreen />
  }

  if (!business) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Unable to Load Your Business
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            We're having trouble setting up your account. Please try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Show friendly message if onboarding is not completed and user tries to access dashboard
  const isOnboardingComplete = business.onboarding_status === 'completed'
  const hasActiveSubscription = isActiveSubscription(business.subscription_status)
  const hasBasicProfile = business.name && business.business_phone_number
  const isMainDashboardPage = pathname === '/dashboard'
  
  // Only show the "finish setup" message if user has no basic profile AND is on main dashboard
  // Users with a profile but no subscription should see the dashboard with Start Free Trial state
  if (!hasBasicProfile && !hasActiveSubscription && isMainDashboardPage) {
    console.log('[BusinessGuard] Showing setup required message - no basic profile', {
      reason: 'Missing basic profile data (name or business_phone_number)',
      hasBasicProfile,
      hasActiveSubscription,
      pathname
    })
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Finish Setup Before Accessing Dashboard
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Complete your onboarding to unlock your ReplyFlow dashboard and start capturing missed calls.
          </p>
          <button
            onClick={() => router.push('/onboarding')}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
          >
            Complete Setup
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
