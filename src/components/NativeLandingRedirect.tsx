'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isCapacitorNative } from '@/capacitor/init'

/**
 * Native Landing Redirect Component
 * 
 * This component handles Capacitor-specific landing behavior:
 * - In Capacitor native app, redirect authenticated users to /dashboard
 * - In Capacitor native app, redirect unauthenticated users to /login
 * - Only applies to root route (/) to preserve deep links
 * - Does not affect web browser behavior
 * - Shows loading screen to prevent flicker of marketing homepage
 */
export default function NativeLandingRedirect() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading: authLoading } = useAuth()
  const [shouldShowLoading, setShouldShowLoading] = useState(false)

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    // Only apply to native Capacitor environment
    if (!isCapacitorNative()) {
      return
    }

    // Only apply to root route to preserve deep links
    if (pathname !== '/') {
      return
    }

    // Show loading screen to prevent flicker
    setShouldShowLoading(true)

    // Wait for auth state to be determined
    if (authLoading) {
      return
    }

    // Redirect based on authentication state
    if (user) {
      console.log('[NativeLanding] User authenticated, redirecting to /dashboard')
      router.replace('/dashboard')
    } else {
      console.log('[NativeLanding] User not authenticated, redirecting to /login')
      router.replace('/login')
    }
  }, [pathname, user, authLoading, router])

  // Show loading screen only in Capacitor on root route while determining redirect
  if (shouldShowLoading && isCapacitorNative() && pathname === '/') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 border-solid rounded-full animate-spin"></div>
      </div>
    )
  }

  // This component doesn't render anything in web browser or when not on root route
  return null
}
