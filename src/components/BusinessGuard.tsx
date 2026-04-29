'use client'

import { useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'

export default function BusinessGuard({ children }: { children: React.ReactNode }) {
  const { business, loading } = useBusiness()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const checkoutStatus = searchParams?.get('checkout')

  useEffect(() => {
    console.log('[BusinessGuard] State:', { loading, businessId: business?.id, pathname, checkoutStatus, onboardingStatus: business?.onboarding_status })
    
    // Don't redirect if already on onboarding page
    if (pathname?.startsWith('/onboarding')) {
      console.log('[BusinessGuard] Already on onboarding, skipping redirect')
      return
    }
    
    // Don't redirect if on homepage - allow logged-in users to see public homepage
    if (pathname === '/') {
      console.log('[BusinessGuard] On homepage, skipping redirect')
      return
    }
    
    // Don't redirect if checkout=success is present (waiting for webhook)
    if (checkoutStatus === 'success') {
      console.log('[BusinessGuard] Checkout success mode active, skipping redirect')
      return
    }
    
    // Only redirect if loading is complete
    if (!loading) {
      // Redirect if no business exists
      if (!business) {
        console.log('[BusinessGuard] No business found, redirecting to onboarding')
        router.push('/onboarding')
        return
      }
      
      // Redirect if onboarding is not completed
      if (business.onboarding_status !== 'completed') {
        console.log('[BusinessGuard] Onboarding not completed, redirecting to onboarding')
        router.push('/onboarding')
        return
      }
    }
  }, [business, loading, router, pathname, checkoutStatus])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-200">Loading your dashboard...</div>
      </div>
    )
  }

  if (!business) {
    return null // Will redirect
  }

  // Show friendly message if onboarding is not completed and user tries to access dashboard
  if (business.onboarding_status !== 'completed' && pathname?.startsWith('/dashboard')) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
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
