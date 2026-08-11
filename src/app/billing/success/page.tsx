'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PageBackground from '@/components/PageBackground'
import { createBrowserClient } from '@/lib/supabase/browser'
import { shouldTriggerAppRecovery } from '@/lib/billing-recovery'

const supabase = createBrowserClient()

interface CheckoutStatus {
  ok: boolean
  checkoutStatus: string
  paymentStatus: string
  subscriptionStatus: string
  provisioningStatus: string
  hasTwilioNumber: boolean
  redirectTo: string
  redirectReady: boolean
  error?: string
  readyForReauth?: boolean
  business?: {
    id: string
    subscriptionStatus: string
    onboardingStatus: string
    hasTwilioNumber: boolean
    provisioningStatus: string
  }
}

const TIMEOUT_DURATION = 90000 // 90 seconds

export default function BillingSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams?.get('session_id')
  const [status, setStatus] = useState<CheckoutStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isTimeout, setIsTimeout] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [showButton, setShowButton] = useState(false)

  // Session restoration state
  const [sessionRestorationState, setSessionRestorationState] = useState<'checking' | 'restored' | 'missing'>('checking')
  // App recovery state - when true, we're redirecting to app, don't show success state
  const [isRedirectingToApp, setIsRedirectingToApp] = useState(false)

  // Log execution context for diagnostics
  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown'
    const pathname = typeof window !== 'undefined' ? window.location.pathname : 'unknown'
    const visibilityState = typeof document !== 'undefined' ? document.visibilityState : 'unknown'
    const hasReturnToAppMarker = typeof window !== 'undefined' && new URL(window.location.href).searchParams.has('return_to_app')
    const hasRecoveryMarker = typeof window !== 'undefined' && new URL(window.location.href).searchParams.has('recovery')

    console.log('[Billing Success Context Diagnostics]', {
      origin,
      pathname,
      visibilityState,
      hasSessionId: !!sessionId,
      hasReturnToAppMarker,
      hasRecoveryMarker,
      timestamp: Date.now()
    })

    // Check if localStorage contains auth key (BOOLEAN only, no tokens)
    const hasAuthKey = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('sb-auth-token'))
    console.log('[Billing Success Storage Diagnostics]', {
      hasLocalStorageAuthKey: hasAuthKey,
      timestamp: Date.now()
    })
  }, [sessionId])

  // Validate session_id
  useEffect(() => {
    if (!sessionId || !sessionId.startsWith('cs_')) {
      setError('Invalid checkout session')
      return
    }
  }, [sessionId])

  // Session restoration check - verify Supabase session is available after Stripe return
  useEffect(() => {
    if (!sessionId) return

    let isChecking = true

    const checkSession = async (): Promise<boolean> => {
      try {
        console.log('[Billing Success] Checking Supabase session...')
        const { data: { session } } = await supabase.auth.getSession()

        if (session && session.user) {
          console.log('[Billing Success] Session restored successfully')
          if (isChecking) {
            setSessionRestorationState('restored')
          }
          return true
        } else {
          console.log('[Billing Success] Session not found in current check')
          return false
        }
      } catch (error) {
        console.error('[Billing Success] Error checking session:', error)
        return false
      }
    }

    // On iOS/Capacitor, session restoration from localStorage may need time after returning
    // from external browser context (Stripe checkout). Retry with delays before concluding missing.
    const checkWithRetries = async () => {
      const maxRetries = 3
      const retryDelay = 500 // 500ms between retries

      console.log('[Billing Success] Starting session restoration check with retries (max:', maxRetries, ')')

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        console.log('[Billing Success] Session check attempt', attempt + 1, 'of', maxRetries)
        const sessionFound = await checkSession()

        // If session is found, stop retrying
        if (sessionFound) {
          console.log('[Billing Success] Session found on attempt', attempt + 1)
          return
        }

        // Wait before retrying (but not after the last attempt)
        if (attempt < maxRetries - 1) {
          console.log('[Billing Success] Waiting', retryDelay, 'ms before retry...')
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
      }

      // After all retries, conclude session is missing
      console.log('[Billing Success] Session restoration failed after', maxRetries, 'attempts')

      // Check if this checkout originated from the native ReplyFlow app (via return_to_app marker)
      // This is the authoritative signal that we should return to the Capacitor WebView context
      // Use helper function for deterministic routing logic
      const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
      const shouldRecover = shouldTriggerAppRecovery(currentUrl)

      // If checkout originated from native app but session is missing, redirect to deep-link to restore app context
      // This ensures billing/success executes in the Capacitor WebView where localStorage is available
      if (isChecking && shouldRecover) {
        console.log('[Billing Success] Native app checkout detected: redirecting to deep-link to restore app context')
        setIsRedirectingToApp(true)
        const deepLinkUrl = `replyflow://billing/success?session_id=${sessionId}&recovery=1`
        console.log('[Billing Success] Deep-link URL:', deepLinkUrl)
        window.location.href = deepLinkUrl
        return
      }

      if (isChecking) {
        setSessionRestorationState('missing')
      }
    }

    checkWithRetries()

    return () => {
      isChecking = false
    }
  }, [sessionId])

  // Poll checkout status
  useEffect(() => {
    if (!sessionId || error || isTimeout) return

    const pollStatus = async () => {
      try {
        console.log('[Billing Success] Polling checkout status...')
        const response = await fetch('/api/billing/checkout-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ session_id: sessionId }),
        })

        const data: CheckoutStatus = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to check status')
        }

        console.log('[Billing Success] Checkout status response:', {
          ok: data.ok,
          subscriptionStatus: data.subscriptionStatus,
          paymentStatus: data.paymentStatus
        })

        setStatus(data)
        setPollCount(prev => prev + 1)

        // Check if subscription is ready for reauth
        if (data.ok && ['trialing', 'active'].includes(data.subscriptionStatus)) {
          console.log('[Billing Success] Subscription ready, showing success page')
          // Show success state instead of auto-redirecting
          setStatus({
            ...data,
            readyForReauth: true
          })
          return
        }

      } catch (err) {
        console.error('[Billing Success] Poll error:', err)
        if (pollCount >= 5) { // Allow some retries before showing error
          setError(err instanceof Error ? err.message : 'Failed to check status')
        }
      }
    }

    // Initial poll
    pollStatus()

    // Set up polling interval
    const interval = setInterval(pollStatus, 3000) // Poll every 3 seconds

    return () => clearInterval(interval)
  }, [sessionId, error, isTimeout, pollCount, router])

  // Timeout handling
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!status?.ok || !['trialing', 'active'].includes(status.subscriptionStatus)) {
        setIsTimeout(true)
      }
    }, TIMEOUT_DURATION)

    return () => clearTimeout(timer)
  }, [sessionId, status, pollCount])

  // Button fade-in animation effect
  useEffect(() => {
    if (status?.readyForReauth) {
      const timer = setTimeout(() => {
        setShowButton(true)
      }, 1200)
      return () => clearTimeout(timer)
    }
  }, [status?.readyForReauth])

  // Redirecting to app state - show when recovering to Capacitor WebView
  if (isRedirectingToApp) {
    return (
      <PageBackground>
        <div className="flex items-center justify-center px-4 min-h-screen">
          <div className="max-w-md w-full mx-auto text-center">
            <div className="w-16 h-16 bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="animate-spin h-8 w-8 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-4">Returning to app...</h1>
            <p className="text-muted-foreground mb-6">
              Opening ReplyFlow to complete your setup.
            </p>
            <p className="text-muted-foreground text-sm">
              If you don't see the app open, tap the "Open" button when prompted.
            </p>
          </div>
        </div>
      </PageBackground>
    )
  }

  // Show success state when subscription is ready
  if (status?.readyForReauth && !isRedirectingToApp) {
    return (
      <PageBackground>
        <div className="flex items-center justify-center px-4 min-h-screen">
          <div className="max-w-md w-full mx-auto text-center">
            {/* Success Icon with polish */}
            <div className="w-20 h-20 bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-green-500/20">
              <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Success Message */}
            <h1 className="text-3xl font-bold text-foreground mb-3">You're all set!</h1>
            <p className="text-muted-foreground text-lg mb-8">
              Your ReplyFlow account is ready.
            </p>

            {/* Animated Button */}
            <div className={`transition-opacity duration-700 ${showButton ? 'opacity-100' : 'opacity-0'}`}>
              {sessionRestorationState === 'restored' ? (
                <button
                  onClick={() => {
                    window.location.href = '/dashboard?setup=1'
                  }}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 w-full"
                >
                  Continue to Dashboard
                </button>
              ) : sessionRestorationState === 'missing' ? (
                <Link
                  href="/auth/signin?returnTo=/dashboard?setup=1"
                  className="inline-flex items-center justify-center rounded-lg bg-amber-600 hover:bg-amber-700 px-8 py-3 text-sm font-semibold text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 w-full"
                >
                  Sign In to Finish Setup
                </Link>
              ) : (
                <button
                  disabled
                  className="inline-flex items-center justify-center rounded-lg bg-slate-400 px-8 py-3 text-sm font-semibold text-white shadow-lg cursor-not-allowed w-full"
                >
                  Checking session...
                </button>
              )}
            </div>

            {/* Session Status Message */}
            {sessionRestorationState === 'missing' && (
              <div className="mt-4 bg-amber-900/20 border border-amber-800 rounded-lg p-3">
                <p className="text-amber-100 text-sm font-medium mb-1">
                  Payment successful
                </p>
                <p className="text-amber-300 text-xs">
                  Please sign in to complete your account setup.
                </p>
              </div>
            )}

            <p className="text-muted-foreground text-sm mt-4">
              Complete setup to start capturing missed calls.
            </p>
          </div>
        </div>
      </PageBackground>
    )
  }

  // Timeout state
  if (isTimeout) {
    return (
      <PageBackground>
        <div className="flex items-center justify-center px-4 min-h-screen">
          <div className="max-w-md w-full mx-auto text-center">
            <div className="w-16 h-16 bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-4">We're finishing your setup</h1>
            <p className="text-muted-foreground mb-6">
              Something is taking a little longer than expected. Continue to your dashboard to access your account.
            </p>
            {sessionRestorationState === 'restored' ? (
              <button
                onClick={() => {
                  window.location.href = '/dashboard?setup=1'
                }}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Continue to Dashboard
              </button>
            ) : (
              <Link
                href="/auth/signin?returnTo=/dashboard?setup=1"
                className="inline-flex items-center justify-center rounded-lg bg-amber-600 hover:bg-amber-700 px-6 py-3 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                Sign In to Finish Setup
              </Link>
            )}
          </div>
        </div>
      </PageBackground>
    )
  }

  if (error) {
    return (
      <PageBackground>
        <div className="flex items-center justify-center px-4 min-h-screen">
          <div className="max-w-md w-full mx-auto text-center">
            <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-4">Setup Issue</h1>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </PageBackground>
    )
  }

  // Loading state - single polished screen
  return (
    <PageBackground>
      <div className="flex items-center justify-center px-4 min-h-screen">
        <div className="max-w-md w-full mx-auto text-center">
          {/* Logo */}
          <div className="mb-8">
            <img
              src="/replyflow-r-logo.png"
              alt="ReplyFlow"
              width={80}
              height={80}
              className="object-contain mx-auto"
            />
          </div>

          {/* Spinner */}
          <div className="relative mb-8">
            <div className="w-14 h-14 border-4 border-blue-600/30 border-t-blue-600 border-solid rounded-full animate-spin mx-auto"></div>
          </div>

          {/* Main loading text */}
          <h1 className="text-foreground text-xl sm:text-2xl font-semibold mb-2">
            Setting up your ReplyFlow account
          </h1>

          {/* Reassuring subtitle */}
          <p className="text-muted-foreground text-sm sm:text-base">
            We're confirming your subscription and preparing your dashboard. This usually only takes a few seconds.
          </p>
        </div>
      </div>
    </PageBackground>
  )
}
