'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { isActiveSubscription } from '@/lib/subscription'
import AppLoadingScreen from '@/components/AppLoadingScreen'

export default function BusinessGuard({ children }: { children: React.ReactNode }) {
  const { business, loading, fetchComplete } = useBusiness()
  const { user, session } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const checkoutStatus = searchParams?.get('checkout')

  // Add explicit state tracking
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
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
        console.log('[REDIRECT]', {
          from: pathname,
          to: '/auth/signin?redirect=/dashboard',
          reason: 'No user authenticated',
          hasSession: !!session,
          component: 'BusinessGuard',
        })
        console.log('[Routing] No user authenticated, redirecting to sign in')
        router.push('/auth/signin?redirect=/dashboard')
        return
      }
      
      // Redirect if no business exists
      if (!business) {
        console.log('[Routing] No business found, checking if fetch is complete')
        
        // Only redirect to onboarding if fetch is complete
        if (fetchComplete) {
          console.log('[Routing] Fetch complete and no business, redirecting to onboarding')
          console.log('[Routing] render branch: no business, fetch complete -> onboarding')
          
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
            router.push('/auth/signin?redirect=/dashboard')
            return
          }
          
          console.log('[REDIRECT]', {
            from: pathname,
            to: '/onboarding',
            reason: 'No business found and fetch complete',
            hasSession: !!session,
            component: 'BusinessGuard',
          })
          router.push('/onboarding')
          return
        } else {
          console.log('[Routing] Fetch not complete yet, waiting for business data')
          console.log('[Routing] render branch: no business, fetch incomplete -> loading')
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
      
      // Check if user has basic business profile data
      const hasBasicProfile = business.name && business.business_phone_number
      
      // Derived state for routing decision
      const derivedState = (() => {
        if (!business) return 'no_business'
        if (!hasBasicProfile) return 'no_profile'
        if (hasActiveSubscription) return 'subscription_active'
        if (business.subscription_status === null) return 'trial_pending'
        return 'subscription_inactive'
      })()
      
      console.log('[BusinessGuard] Derived routing state:', {
        derivedState,
        hasBasicProfile,
        isOnboardingComplete,
        hasActiveSubscription,
        subscription_status: business.subscription_status,
        business_name: business.name,
        business_phone_number: business.business_phone_number,
      })
      
      // Only redirect to onboarding if user truly has no business or no basic profile
      // IMPORTANT: Users with trialing/active subscription should NEVER be redirected to onboarding
      // Only send to onboarding if subscription is not trialing/active AND profile is missing
      if (!hasBasicProfile && !hasActiveSubscription) {
        console.log('[Post Trial Routing Decision]', {
          pathname,
          destination: '/onboarding',
          subscriptionStatus: business.subscription_status,
          onboardingStatus: business.onboarding_status,
          hasBusiness: !!business,
          reason: 'No basic profile AND no active subscription'
        })
        
        console.log('[BusinessGuard] Redirecting to onboarding - no basic profile', {
          reason: 'Missing basic profile data (name or business_phone_number) AND no active subscription',
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
          router.push('/auth/signin?redirect=/dashboard')
          return
        }
        
        console.log('[REDIRECT]', {
          from: pathname,
          to: '/onboarding',
          reason: 'No basic business profile AND no active subscription',
          hasSession: !!session,
          component: 'BusinessGuard',
        })
        router.push('/onboarding')
        return
      }
      
      console.log('[Post Trial Routing Decision]', {
        pathname,
        destination: 'dashboard',
        subscriptionStatus: business.subscription_status,
        onboardingStatus: business.onboarding_status,
        hasBusiness: !!business,
        reason: hasActiveSubscription ? 'Active subscription allows dashboard access' : 'Profile exists, allowing dashboard access'
      })
      
      console.log('[BusinessGuard] Allowing access - user has business profile', {
        reason: derivedState === 'trial_pending' ? 'Profile exists, trial pending' : 
               derivedState === 'subscription_active' ? 'Subscription active' : 
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
  
  // Only show the "finish setup" message if user has no basic profile
  // Users with a profile but no subscription should see the dashboard with Start Free Trial state
  if (!hasBasicProfile && !hasActiveSubscription && pathname?.startsWith('/dashboard')) {
    console.log('[BusinessGuard] Showing setup required message - no basic profile', {
      reason: 'Missing basic profile data (name or business_phone_number)',
      hasBasicProfile,
      hasActiveSubscription
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
