'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { isActiveSubscription } from '@/lib/subscription'

export default function BusinessGuard({ children }: { children: React.ReactNode }) {
  const { business, loading } = useBusiness()
  const { user, session } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const checkoutStatus = searchParams?.get('checkout')

  // Add explicit state tracking
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    console.log('[Routing] BusinessGuard evaluating')
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
    
    // Mark as initialized once loading is complete
    if (!loading) {
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
      console.log('[Routing] Checkout success mode active, skipping redirect')
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
        console.log('[Routing] No business found, redirecting to onboarding')
        console.log('[Routing] User authenticated:', !!user)
        console.log('[Routing] User ID:', user?.id)
        
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
          reason: 'No business found',
          hasSession: !!session,
          component: 'BusinessGuard',
        })
        router.push('/onboarding')
        return
      }
      
      // Redirect if onboarding is not completed AND forwarding is not verified
      // Only allow access if onboarding is completed OR user has active subscription
      // Note: forwarding_verified can be false if user hasn't tested yet, but they can still access dashboard
      const isOnboardingComplete = business.onboarding_status === 'completed'
      const hasActiveSubscription = isActiveSubscription(business.subscription_status)
      
      if (!isOnboardingComplete && !hasActiveSubscription) {
        console.log('[Routing] Onboarding incomplete, redirecting to onboarding')
        console.log('[Routing] Reason:', {
          onboarding_status: business.onboarding_status,
          forwarding_verified: business.forwarding_verified,
          isOnboardingComplete,
          hasActiveSubscription
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
          reason: 'Onboarding incomplete',
          hasSession: !!session,
          component: 'BusinessGuard',
        })
        router.push('/onboarding')
        return
      }
      
      console.log('[Routing] Onboarding complete or has active subscription, allowing access')
    } else {
      console.log('[Routing] Business still loading or not initialized, waiting...')
    }
  }, [business, loading, router, pathname, checkoutStatus, initialized, user])

  // Show loading state while business is loading or not yet initialized
  if (loading || !initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Setting up your account...</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Please wait while we prepare your workspace</p>
        </div>
      </div>
    )
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
            Retry Setup
          </button>
        </div>
      </div>
    )
  }

  // Show friendly message if onboarding is not completed and user tries to access dashboard
  const isOnboardingComplete = business.onboarding_status === 'completed'
  const hasActiveSubscription = isActiveSubscription(business.subscription_status)
  
  if (!isOnboardingComplete && !hasActiveSubscription && pathname?.startsWith('/dashboard')) {
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
