'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'

export default function BusinessGuard({ children }: { children: React.ReactNode }) {
  const { business, loading } = useBusiness()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    console.log('[BusinessGuard] State:', { loading, businessId: business?.id, pathname })
    
    // Don't redirect if already on onboarding page
    if (pathname?.startsWith('/onboarding')) {
      console.log('[BusinessGuard] Already on onboarding, skipping redirect')
      return
    }
    
    // Only redirect if loading is complete and no business exists
    if (!loading && !business) {
      console.log('[BusinessGuard] No business found, redirecting to onboarding')
      router.push('/onboarding')
    }
  }, [business, loading, router, pathname])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-200">Loading ReplyFlow...</div>
      </div>
    )
  }

  if (!business) {
    return null // Will redirect
  }

  return <>{children}</>
}
