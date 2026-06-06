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
  const [billingGraceTimeoutElapsed, setBillingGraceTimeoutElapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && (window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)))
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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
  const billingReturnParam = searchParams?.get('billing_return')
  const setupParam = searchParams?.get('setup')
  const isCheckoutRecovery = 
    checkoutParam === 'success' ||
    Boolean(sessionId?.startsWith('cs_'))
  
  // Check if we're in billing return grace mode
  // Exclude /billing/success page - it has its own loading and polling logic
  const isBillingSuccessPage = typeof window !== 'undefined' && window.location.pathname === '/billing/success'
  const isBillingReturn = 
    !isBillingSuccessPage &&
    (billingReturnParam === 'success' ||
    Boolean(sessionId?.startsWith('cs_')))

  // Check if we're returning from Stripe to setup (grace mode for session restoration)
  const isStripeSetupReturn = 
    setupParam === '1' && 
    (typeof window !== 'undefined' && (window.location.pathname === '/dashboard' || window.location.pathname === '/setup/forwarding'))

  console.log('[AuthGuard] Stripe return detection', {
    isCheckoutRecovery,
    isBillingReturn,
    isStripeSetupReturn,
    setupParam,
    pathname: typeof window !== 'undefined' ? window.location.pathname : 'server'
  })

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

  // Trace log when billing return grace mode is active
  useEffect(() => {
    if (isBillingReturn && typeof window !== 'undefined') {
      console.log('[Dashboard Billing Return Grace Active]', {
        pathname: window.location.pathname,
        search: window.location.search,
        hasSession: !!user,
        authLoading: loading
      })
    }
  }, [isBillingReturn, user, loading])

  // Set billing return grace timeout - after 20s (desktop) or 60s (mobile), if still no session, redirect to signin
  useEffect(() => {
    if (!isBillingReturn || user) return

    // Mobile requires longer timeout due to PWA session restoration behavior
    const graceTimeoutMs = isMobile ? 60000 : 20000
    console.log('[Dashboard Billing Return] Starting billing return grace timeout for session restoration', {
      isMobile,
      graceTimeoutMs,
      device: isMobile ? 'mobile' : 'desktop'
    })

    const timeout = setTimeout(() => {
      console.log('[Dashboard Billing Return Grace Timeout]', {
        pathname: window.location.pathname,
        search: window.location.search,
        hasSession: !!user,
        authLoading: loading,
        graceElapsedMs: graceTimeoutMs,
        isMobile
      })

      setBillingGraceTimeoutElapsed(true)

      // Redirect to signin with specific reason
      const signinUrl = sessionId 
        ? `/auth/signin?redirect=/dashboard&reason=session_restore_failed&session_id=${sessionId}`
        : `/auth/signin?redirect=/dashboard&reason=session_restore_failed`

      console.log('[Redirect Decision]', {
        reason: 'billing_return_grace_timeout',
        from: '/dashboard',
        to: signinUrl,
        billingReturn: true,
        isMobile
      })

      router.push(signinUrl)
    }, graceTimeoutMs)

    return () => clearTimeout(timeout)
  }, [isBillingReturn, user, loading, router, sessionId, isMobile])

  // Session restoration polling during billing return grace mode
  useEffect(() => {
    if (!isBillingReturn || user || billingGraceTimeoutElapsed) return

    let pollCount = 0
    // Match polling duration to grace timeout (60 polls for mobile, 20 for desktop)
    const maxPolls = isMobile ? 60 : 20

    const pollSession = async () => {
      try {
        pollCount++
        console.log('[Dashboard Billing Return] Session restoration poll', { pollCount, isMobile, maxPolls })

        const { data: { session } } = await supabase.auth.getSession()
        
        if (session) {
          console.log('[Dashboard Billing Return Session Restored]', {
            pathname: window.location.pathname,
            search: window.location.search,
            hasSession: true,
            pollCount,
            isMobile
          })
          // AuthContext will detect the session and update user state
          return
        }

        // Continue polling if we haven't exceeded max polls
        if (pollCount < maxPolls && !billingGraceTimeoutElapsed) {
          setTimeout(pollSession, 1000) // Poll every 1 second
        }
      } catch (error) {
        console.error('[Dashboard Billing Return] Session poll error:', error)
      }
    }

    // Start polling
    pollSession()

  }, [isBillingReturn, user, billingGraceTimeoutElapsed, isMobile])

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

  // BILLING RETURN GRACE MODE: When billing_return=success, show recovery loading with extended timeout
  if (isBillingReturn) {
    if (billingGraceTimeoutElapsed) {
      console.log('[AuthGuard] Billing grace timeout elapsed, showing loading while redirecting to signin')
      return <AppLoadingScreen />
    }
    
    // Show custom billing return loading state
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Finishing secure sign-in...</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">This can take a few seconds on mobile.</p>
        </div>
      </div>
    )
  }

  // STRIPE SETUP RETURN GRACE MODE: When setup=1 on dashboard/forwarding, wait for session restoration
  if (isStripeSetupReturn) {
    console.log('[AuthGuard] Stripe setup return grace mode active - waiting for session restoration', {
      hasUser: !!user,
      loading,
      pathname: typeof window !== 'undefined' ? window.location.pathname : 'server'
    })
    
    if (!user && !loading) {
      console.log('[AuthGuard] Stripe setup return - session missing after grace period, redirecting to signin with returnTo')
      const returnTo = encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/dashboard?setup=1')
      router.push(`/auth/signin?returnTo=${returnTo}`)
      return <AppLoadingScreen />
    }
    
    // Show loading while waiting for session restoration
    if (!user) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-200 text-lg">Restoring your session...</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">This can take a few seconds on mobile.</p>
          </div>
        </div>
      )
    }
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
