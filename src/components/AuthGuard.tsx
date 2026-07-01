'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import SetupError from '@/components/SetupError'
import AppLoadingScreen from '@/components/AppLoadingScreen'
import { createBrowserClient } from '@/lib/supabase/browser'
import { logRouteFlashDebug } from '@/lib/route-flash-debug'

const supabase = createBrowserClient()

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [recoveryTimeoutElapsed, setRecoveryTimeoutElapsed] = useState(false)
  const [billingGraceTimeoutElapsed, setBillingGraceTimeoutElapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [stripeParamsCleared, setStripeParamsCleared] = useState(false)
  // Initialize authVerified from sessionStorage immediately to prevent loading flash
  const [authVerified, setAuthVerified] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('replyflow_auth_verified') === 'true'
    }
    return false
  })

  // Track current and previous pathname for route flash debugging
  const pathnameRef = useRef<string | null>(typeof window !== 'undefined' ? window.location.pathname : null)
  const previousPathnameRef = useRef<string | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const current = window.location.pathname
    if (current !== pathnameRef.current) {
      previousPathnameRef.current = pathnameRef.current
      pathnameRef.current = current
    }
  })

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && (window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)))
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Cache auth verified state when user is authenticated
  useEffect(() => {
    if (user && !loading && typeof window !== 'undefined') {
      if (!authVerified) {
        setAuthVerified(true)
        sessionStorage.setItem('replyflow_auth_verified', 'true')
      }
    } else if (!user && !loading && typeof window !== 'undefined') {
      // Clear cache on logout
      sessionStorage.removeItem('replyflow_auth_verified')
      setAuthVerified(false)
    }
  }, [user, loading, authVerified])

  // Trace log at AuthGuard first render
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const checkoutParam = url.searchParams.get('checkout')
      const sessionId = url.searchParams.get('session_id')
      const hasCheckoutSuccess = 
        checkoutParam === 'success' ||
        Boolean(sessionId?.startsWith('cs_'))
      
      // Determine flow type for internal logic
      let flowType = 'normal_dashboard_navigation'
      if (hasCheckoutSuccess) {
        flowType = 'stripe_return'
      } else if (loading && !user) {
        flowType = 'initial_load'
      }
    }
  }, [user, loading])

  // Check if we're in checkout recovery mode
  const checkoutParam = searchParams?.get('checkout')
  const sessionId = searchParams?.get('session_id')
  const billingReturnParam = searchParams?.get('billing_return')
  const setupParam = searchParams?.get('setup')
  const isCheckoutRecovery = 
    !stripeParamsCleared && (
      checkoutParam === 'success' ||
      Boolean(sessionId?.startsWith('cs_'))
    )
  
  // Check if we're in billing return grace mode
  // Exclude /billing/success page - it has its own loading and polling logic
  const isBillingSuccessPage = typeof window !== 'undefined' && window.location.pathname === '/billing/success'
  const isBillingReturn = 
    !stripeParamsCleared &&
    !isBillingSuccessPage &&
    (billingReturnParam === 'success' ||
    Boolean(sessionId?.startsWith('cs_')))

  // Check if we're returning from Stripe to setup (grace mode for session restoration)
  const isStripeSetupReturn = 
    !stripeParamsCleared &&
    setupParam === '1' && 
    (typeof window !== 'undefined' && (window.location.pathname === '/dashboard' || window.location.pathname === '/setup/forwarding'))

  // Determine flow type for logging
  let flowType = 'normal_dashboard_navigation'
  if (isCheckoutRecovery || isBillingReturn || isStripeSetupReturn) {
    flowType = 'stripe_return'
  } else if (loading && !user) {
    flowType = 'initial_load'
  }

  // Clear Stripe return parameters after successful session restoration
  useEffect(() => {
    if (user && !stripeParamsCleared && typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const hasStripeParams = 
        url.searchParams.has('checkout') ||
        url.searchParams.has('session_id') ||
        url.searchParams.has('billing_return') ||
        url.searchParams.has('setup')
      
      if (hasStripeParams) {
        
        // Clear all Stripe-related parameters
        url.searchParams.delete('checkout')
        url.searchParams.delete('session_id')
        url.searchParams.delete('billing_return')
        url.searchParams.delete('setup')
        
        // Replace URL without parameters
        window.history.replaceState({}, '', url.toString())
        setStripeParamsCleared(true)
      }
    }
  }, [user, stripeParamsCleared])

  // Trace log on every AuthGuard render (removed for production)

  // Set billing return grace timeout - after 20s (desktop) or 60s (mobile), if still no session, redirect to signin
  useEffect(() => {
    if (!isBillingReturn || user) return

    // Mobile requires longer timeout due to PWA session restoration behavior
    const graceTimeoutMs = isMobile ? 60000 : 20000

    const timeout = setTimeout(() => {

      setBillingGraceTimeoutElapsed(true)

      // Redirect to signin with specific reason
      const signinUrl = sessionId 
        ? `/auth/signin?redirect=/dashboard&reason=session_restore_failed&session_id=${sessionId}`
        : `/auth/signin?redirect=/dashboard&reason=session_restore_failed`

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
    let timeoutId: NodeJS.Timeout | null = null

    const pollSession = async () => {
      try {
        pollCount++

        const { data: { session } } = await supabase.auth.getSession()
        
        if (session) {
          // AuthContext will detect the session and update user state
          return
        }

        // Continue polling if we haven't exceeded max polls
        if (pollCount < maxPolls && !billingGraceTimeoutElapsed) {
          timeoutId = setTimeout(pollSession, 1000) // Poll every 1 second
        }
      } catch (error) {
        console.error('[Dashboard Billing Return] Session poll error:', error)
      }
    }

    // Start polling
    pollSession()

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [isBillingReturn, user, billingGraceTimeoutElapsed, isMobile])

  // Set recovery timeout - after 3 seconds, if still no session, route to recovery page
  useEffect(() => {
    if (!isCheckoutRecovery || user) return

    const timeout = setTimeout(() => {
      // Check if session exists
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
        if (!session) {
          setRecoveryTimeoutElapsed(true)
          
          // Preserve session_id if available
          const recoveryUrl = sessionId 
            ? `/auth/recover-session?checkout=success&session_id=${sessionId}`
            : `/auth/recover-session?checkout=success`
          
          router.push(recoveryUrl)
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
    logRouteFlashDebug({
      source: 'AuthGuard',
      pathname: pathnameRef.current,
      previousPathname: previousPathnameRef.current,
      authLoading: loading,
      userId: user?.id ?? null,
      renderBranch: recoveryTimeoutElapsed ? 'loading' : 'loading',
      reason: recoveryTimeoutElapsed ? 'checkout recovery timeout elapsed; redirecting to recovery' : 'checkout recovery; showing recovery loading',
    })
    if (recoveryTimeoutElapsed) {
      // Redirect is handled by timeout callback, don't show loading
      return null
    }
    return <AppLoadingScreen />
  }

  // BILLING RETURN GRACE MODE: When billing_return=success, show recovery loading with extended timeout
  if (isBillingReturn) {
    logRouteFlashDebug({
      source: 'AuthGuard',
      pathname: pathnameRef.current,
      previousPathname: previousPathnameRef.current,
      authLoading: loading,
      userId: user?.id ?? null,
      renderBranch: billingGraceTimeoutElapsed ? 'loading' : 'loading',
      reason: billingGraceTimeoutElapsed ? 'billing return grace timeout elapsed; redirecting to signin' : 'billing return grace; showing custom loading',
    })
    if (billingGraceTimeoutElapsed) {
      // Redirect is handled by timeout callback, don't show loading
      return null
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
    logRouteFlashDebug({
      source: 'AuthGuard',
      pathname: pathnameRef.current,
      previousPathname: previousPathnameRef.current,
      authLoading: loading,
      userId: user?.id ?? null,
      renderBranch: !user ? 'loading' : 'dashboard-content',
      reason: !user ? 'stripe setup return; waiting for session restoration' : 'stripe setup return; session restored',
    })
    if (!user && !loading) {
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
  // Skip loading if auth is already verified and user exists (normal navigation)
  // FORBID AppLoadingScreen during normal_dashboard_navigation
  if (loading && !(authVerified && user)) {
    // Explicit guard: never show full-page loader during normal navigation
    if (flowType === 'normal_dashboard_navigation' && authVerified) {
      logRouteFlashDebug({
        source: 'AuthGuard',
        pathname: pathnameRef.current,
        previousPathname: previousPathnameRef.current,
        authLoading: loading,
        userId: user?.id ?? null,
        renderBranch: 'dashboard-content',
        reason: 'auth loading but authVerified + normal navigation; rendering children',
      })
      return <>{children}</>
    }
    logRouteFlashDebug({
      source: 'AuthGuard',
      pathname: pathnameRef.current,
      previousPathname: previousPathnameRef.current,
      authLoading: loading,
      userId: user?.id ?? null,
      renderBranch: 'loading',
      reason: 'auth loading and not verified; rendering AppLoadingScreen',
    })
    return <AppLoadingScreen />
  }

  if (!user) {
    logRouteFlashDebug({
      source: 'AuthGuard',
      pathname: pathnameRef.current,
      previousPathname: previousPathnameRef.current,
      authLoading: loading,
      userId: null,
      renderBranch: 'loading',
      reason: 'no user after loading; relying on AuthProvider redirect',
    })
    return null // Will redirect via AuthProvider
  }

  logRouteFlashDebug({
    source: 'AuthGuard',
    pathname: pathnameRef.current,
    previousPathname: previousPathnameRef.current,
    authLoading: loading,
    userId: user?.id ?? null,
    renderBranch: 'dashboard-content',
    reason: 'authenticated; rendering children',
  })
  return <>{children}</>
}
