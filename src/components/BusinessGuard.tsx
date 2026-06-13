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
    // Mark as initialized once loading is complete and fetch is complete
    if (!loading && fetchComplete) {
      setInitialized(true)
    }

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
