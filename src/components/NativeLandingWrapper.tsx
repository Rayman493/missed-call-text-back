'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Capacitor } from '@capacitor/core'

/**
 * Native Landing Wrapper Component
 * 
 * This component wraps the marketing homepage and handles Capacitor-specific landing behavior:
 * - In Capacitor native app, show loading screen and redirect based on auth state
 * - In web browser, render the marketing homepage normally
 * - Only applies to root route (/) to preserve deep links
 * - Blocks marketing rendering until environment is known to prevent flicker
 */
export default function NativeLandingWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading: authLoading } = useAuth()
  const [isNative, setIsNative] = useState<boolean | null>(null)
  const [shouldRedirect, setShouldRedirect] = useState(false)

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    // Check if running in Capacitor native environment
    const native = Capacitor.isNativePlatform()
    setIsNative(native)

    // Only apply to root route to preserve deep links
    if (pathname !== '/') {
      return
    }

    // If not native, don't redirect - let marketing page render
    if (!native) {
      return
    }

    // If native, we need to redirect based on auth state
    setShouldRedirect(true)

    // Wait for auth state to be determined
    if (authLoading) {
      return
    }

    // Redirect based on authentication state
    if (user) {
      router.replace('/dashboard')
    } else {
      router.replace('/auth?mode=signin')
    }
  }, [pathname, user, authLoading, router])

  // If we haven't determined environment yet, show loading
  if (isNative === null) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 border-solid rounded-full animate-spin"></div>
      </div>
    )
  }

  // If native and on root route, show loading while redirecting
  if (isNative && shouldRedirect && pathname === '/') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 border-solid rounded-full animate-spin"></div>
      </div>
    )
  }

  // Otherwise, render the marketing content (web or deep links)
  return <>{children}</>
}
