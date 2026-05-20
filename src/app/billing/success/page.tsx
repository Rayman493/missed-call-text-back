'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface CheckoutStatus {
  ok: boolean
  checkoutStatus: string
  paymentStatus: string
  subscriptionStatus: string
  provisioningStatus: string
  hasTwilioNumber: boolean
  redirectTo: string
  error?: string
  business?: {
    id: string
    subscriptionStatus: string
    onboardingStatus: string
    hasTwilioNumber: boolean
    provisioningStatus: string
  }
}

const PROGRESS_STEPS = [
  { id: 'activating', label: 'Activating your ReplyFlow account...', duration: 3000 },
  { id: 'confirming', label: 'Confirming your trial', duration: 5000 },
  { id: 'provisioning', label: 'Setting up your ReplyFlow number', duration: 10000 },
  { id: 'preparing', label: 'Preparing your dashboard', duration: 5000 },
]

const TIMEOUT_DURATION = 45000 // 45 seconds

export default function BillingSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams?.get('session_id')
  const [currentStep, setCurrentStep] = useState(0)
  const [status, setStatus] = useState<CheckoutStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isTimeout, setIsTimeout] = useState(false)
  const [pollCount, setPollCount] = useState(0)

  // Trace log on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[Billing Success Mounted]', {
        pathname: window.location.pathname,
        search: window.location.search,
        sessionId,
        referrer: document.referrer
      })
    }
  }, [sessionId])

  // Validate session_id
  useEffect(() => {
    if (!sessionId || !sessionId.startsWith('cs_')) {
      setError('Invalid checkout session')
      return
    }
  }, [sessionId])

  // Poll checkout status
  useEffect(() => {
    if (!sessionId || error || isTimeout) return

    const pollStatus = async () => {
      try {
        console.log('[Billing Success Poll]', { 
          sessionId, 
          pollCount: pollCount + 1 
        })

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

        console.log('[Billing Success Poll Response]', data)
        setStatus(data)
        setPollCount(prev => prev + 1)

        // Check if we can redirect to dashboard
        if (data.ok && ['trialing', 'active'].includes(data.subscriptionStatus)) {
          console.log('[Billing Success Redirect Dashboard]', {
            reason: 'subscription_active',
            subscriptionStatus: data.subscriptionStatus,
            redirectTo: data.redirectTo
          })
          router.push(data.redirectTo)
          return
        }

      } catch (err) {
        console.error('[Billing Success Poll Error]', err)
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

  // Progress step animation
  useEffect(() => {
    if (currentStep < PROGRESS_STEPS.length - 1) {
      const timer = setTimeout(() => {
        setCurrentStep(prev => prev + 1)
      }, PROGRESS_STEPS[currentStep].duration)
      return () => clearTimeout(timer)
    }
  }, [currentStep])

  // Timeout handling
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!status?.ok || !['trialing', 'active'].includes(status.subscriptionStatus)) {
        console.log('[Billing Success Timeout]', {
          sessionId,
          pollCount,
          finalStatus: status
        })
        setIsTimeout(true)
      }
    }, TIMEOUT_DURATION)

    return () => clearTimeout(timer)
  }, [sessionId, status, pollCount])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md w-full mx-auto p-6 text-center">
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
    )
  }

  if (isTimeout) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md w-full mx-auto p-6 text-center">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Setup Taking Longer</h1>
          <p className="text-muted-foreground mb-6">
            Your trial is active, but setup is still finishing. You can continue to your dashboard.
          </p>
          <Link 
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Continue to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-6 text-center">
        {/* Logo */}
        <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-8">
          <span className="text-white font-bold text-2xl">RF</span>
        </div>

        {/* Progress Steps */}
        <div className="space-y-4 mb-8">
          {PROGRESS_STEPS.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center space-x-3 transition-all duration-500 ${
                index <= currentStep ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
                index < currentStep 
                  ? 'bg-green-600 scale-125' 
                  : index === currentStep 
                    ? 'bg-blue-600 scale-125 animate-pulse' 
                    : 'bg-gray-300 dark:bg-gray-600'
              }`} />
              <span className={`text-sm transition-all duration-500 ${
                index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Loading Spinner */}
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-6"></div>

        {/* Status Message */}
        <p className="text-muted-foreground text-sm">
          {status ? (
            <>
              {status.checkoutStatus === 'complete' ? (
                <>Setup complete! Redirecting to dashboard...</>
              ) : status.checkoutStatus === 'subscription_active' ? (
                <>Your trial is active! Setting up your ReplyFlow number...</>
              ) : (
                <>Processing your payment and setting up your account...</>
              )}
            </>
          ) : (
            <>Setting up your ReplyFlow account...</>
          )}
        </p>

        {/* Debug Info (only in development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-left text-xs">
            <p><strong>Session ID:</strong> {sessionId}</p>
            <p><strong>Poll Count:</strong> {pollCount}</p>
            <p><strong>Current Step:</strong> {currentStep}</p>
            {status && (
              <>
                <p><strong>Status:</strong> {JSON.stringify(status, null, 2)}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
