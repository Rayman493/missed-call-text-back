'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'

export default function BusinessGuard({ children }: { children: React.ReactNode }) {
  const { business, loading } = useBusiness()
  const router = useRouter()

  useEffect(() => {
    console.log('[BusinessGuard] State:', { loading, businessId: business?.id })
    if (!loading && !business) {
      console.log('[BusinessGuard] No business found, redirecting to onboarding')
      router.push('/onboarding')
    }
  }, [business, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!business) {
    return null // Will redirect
  }

  return <>{children}</>
}
