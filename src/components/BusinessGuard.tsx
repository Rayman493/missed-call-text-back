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
    console.log('[BusinessGuard] State:', { loading, businessId: business?.id, pathname, checkoutStatus })
    
    // Don't redirect if already on onboarding page
    if (pathname?.startsWith('/onboarding')) {
      console.log('[BusinessGuard] Already on onboarding, skipping redirect')
      return
    }
    
    // Don't redirect if checkout=success is present (waiting for webhook)
    if (checkoutStatus === 'success') {
      console.log('[BusinessGuard] Checkout success mode active, skipping redirect')
      return
    }
    
    // Only redirect if loading is complete and no business exists
    if (!loading && !business) {
      console.log('[BusinessGuard] No business found, redirecting to onboarding')
      router.push('/onboarding')
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

  return <>{children}</>
}
