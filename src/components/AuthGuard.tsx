'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import SetupError from '@/components/SetupError'
import AppLoadingScreen from '@/components/AppLoadingScreen'
import { createBrowserClient } from '@/lib/supabase/browser'

const supabase = createBrowserClient()

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [recoveryTimeoutElapsed, setRecoveryTimeoutElapsed] = useState(false)

  // Trace log at AuthGuard first render
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const checkoutParam = url.searchParams.get('checkout')
      const sessionId = url.searchParams.get('session_id')
      const hasCheckoutSuccess = 
        checkoutParam === 'success' ||
        Boolean(sessionId?.startsWith('cs_'))
      
      console.log('[TRACE AuthGuard Render]', {
        pathname: window.location.pathname,
        search: window.location.search,
        hasCheckoutSuccess
      })
    }
  }, [])

  // Check if we're in checkout recovery mode
  const checkoutParam = searchParams?.get('checkout')
  const sessionId = searchParams?.get('session_id')
  const isCheckoutRecovery = 
    checkoutParam === 'success' ||
    Boolean(sessionId?.startsWith('cs_'))

  // Trace log on every AuthGuard render
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[TRACE AuthGuard]', {
        pathname: window.location.pathname,
        search: window.location.search,
        userExists: !!user,
        sessionExists: !!user,
        loading,
        checkoutSuccess: isCheckoutRecovery,
        redirectingTo: null,
        reason: 'authguard_render'
      })
    }
  }, [user, loading, isCheckoutRecovery])

  // Trace log when checkout recovery is active
  useEffect(() => {
    if (isCheckoutRecovery && typeof window !== 'undefined') {
      console.log('[TRACE AuthGuard Checkout Recovery Active]', {
        pathname: window.location.pathname,
        search: window.location.search,
        hasCheckoutSuccess: true,
        hasSession: !!user,
        loading,
        recoveryElapsedMs: recoveryTimeoutElapsed ? 3000 : 0
      })
    }
  }, [isCheckoutRecovery, user, loading, recoveryTimeoutElapsed])

  // Set recovery timeout - after 3 seconds, if still no session, route to recovery page
  useEffect(() => {
    if (!isCheckoutRecovery || user) return

    console.log('[Checkout Recovery] Starting 3-second session recovery timeout')

    const timeout = setTimeout(() => {
      console.log('[TRACE AuthGuard Checkout Recovery Timeout]', {
        pathname: window.location.pathname,
        search: window.location.search,
        hasCheckoutSuccess: true,
        hasSession: false,
        loading,
        recoveryElapsedMs: 3000
      })
      
      // Check if session exists
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
        if (!session) {
          console.log('[Redirect Decision]', {
            reason: 'checkout_recovery_timeout_no_session',
            from: '/dashboard',
            to: '/auth/recover-session?checkout=success',
            checkoutSuccess: true
          })
          console.log('[Checkout Recovery] No session available, routing to recovery page')
          setRecoveryTimeoutElapsed(true)
          
          // Preserve session_id if available
          const recoveryUrl = sessionId 
            ? `/auth/recover-session?checkout=success&session_id=${sessionId}`
            : `/auth/recover-session?checkout=success`
          
          router.push(recoveryUrl)
        } else {
          console.log('[Redirect Decision]', {
            reason: 'checkout_recovery_session_restored',
            from: '/dashboard',
            to: 'stay',
            checkoutSuccess: true
          })
          console.log('[Checkout Recovery] Session recovered successfully')
        }
      })
    }, 3000)

    return () => clearTimeout(timeout)
  }, [isCheckoutRecovery, user, router, sessionId])

  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  // RECOVERY MODE: When checkout=success, suppress all redirects initially
  // After timeout, route to recovery page if session still unavailable
  if (isCheckoutRecovery) {
    if (recoveryTimeoutElapsed) {
      console.log('[AuthGuard] Recovery timeout elapsed, showing loading while redirecting to recovery page')
      return <AppLoadingScreen />
    }
    console.log('[TRACE AuthGuard Prevent Homepage Fallback]', {
      pathname: window.location.pathname,
      search: window.location.search,
      hasCheckoutSuccess: true,
      hasSession: !!user,
      loading,
      action: 'showing_loading_instead_of_homepage'
    })
    console.log('[AuthGuard] Recovery mode active - waiting for session restoration')
    return <AppLoadingScreen />
  }

  // Show loading during initial auth loading (not recovery mode)
  if (loading) {
    console.log('[AuthGuard] Showing loading state', { loading })
    return <AppLoadingScreen />
  }

  if (!user) {
    console.log('[AuthGuard] No user found, returning null (AuthProvider will handle redirect)')
    return null // Will redirect via AuthProvider
  }

  console.log('[AuthGuard] User authenticated, rendering children')
  return <>{children}</>
}
