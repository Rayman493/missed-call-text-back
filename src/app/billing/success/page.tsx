'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PageBackground from '@/components/PageBackground'
import { createBrowserClient } from '@/lib/supabase/browser'

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

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session && session.user) {
          setSessionRestorationState('restored')
        } else {
          setSessionRestorationState('missing')
        }
      } catch {
        setSessionRestorationState('missing')
      }
    }

    checkSession()
  }, [sessionId])

  // Poll checkout status
  useEffect(() => {
    if (!sessionId || error || isTimeout) return

    const pollStatus = async () => {
      try {
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

        setStatus(data)
        setPollCount(prev => prev + 1)

        // Check if subscription is ready for reauth
        if (data.ok && ['trialing', 'active'].includes(data.subscriptionStatus)) {
          // Show success state instead of auto-redirecting
          setStatus({
            ...data,
            readyForReauth: true
          })
          return
        }

      } catch (err) {
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

  // Show success state when subscription is ready
  if (status?.readyForReauth) {
    return (
      <PageBackground>
        <div className="flex items-center justify-center px-4 min-h-screen">
          <div className="max-w-md w-full mx-auto text-center">
            {/* Success Icon with polish */}
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-green-500/20">
              <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-amber-900 dark:text-amber-100 text-sm font-medium mb-1">
                  Your payment was successful
                </p>
                <p className="text-amber-700 dark:text-amber-300 text-xs">
                  Please sign back in to finish setup. Your account is ready.
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
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
