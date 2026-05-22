'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PageBackground from '@/components/PageBackground'

interface CheckoutStatus {
  ok: boolean
  checkoutStatus: string
  paymentStatus: string
  subscriptionStatus: string
  provisioningStatus: string
  hasTwilioNumber: boolean
  redirectTo: string
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

const PROGRESS_STEPS = [
  { id: 'activating', label: 'Activating your ReplyFlow account...', duration: 3000 },
  { id: 'confirming', label: 'Confirming your trial', duration: 5000 },
  { id: 'provisioning', label: 'Setting up your ReplyFlow number', duration: 10000 },
  { id: 'finalizing', label: 'Finalizing your account setup...', duration: 5000 },
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
  const [showButton, setShowButton] = useState(false)
  const [checkoutMode, setCheckoutMode] = useState<'trial' | 'paid'>('trial')

  // Trace log on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      const mountData = {
        pathname: window.location.pathname,
        search: window.location.search,
        sessionId,
        referrer: document.referrer,
        isMobile,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      }
      
      console.log('[Billing Success Mount]', mountData)
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

        // Check if subscription is ready for reauth
        if (data.ok && ['trialing', 'active'].includes(data.subscriptionStatus)) {
          console.log('[Billing Success Ready For Reauth]', {
            sessionId,
            subscriptionStatus: data.subscriptionStatus,
            provisioningStatus: data.provisioningStatus,
            hasTwilioNumber: data.hasTwilioNumber
          })
          
          // Show success state instead of auto-redirecting
          setStatus({
            ...data,
            readyForReauth: true
          })
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

          {/* Improved Success Message */}
          <h1 className="text-3xl font-bold text-foreground mb-3">Welcome to ReplyFlow</h1>
          <p className="text-muted-foreground text-lg mb-8">
            Your account is now active and ready to capture missed calls automatically.
          </p>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-center space-x-3 text-green-600 dark:text-green-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Payment confirmed</span>
            </div>
            
            <div className="flex items-center justify-center space-x-2 text-blue-600 dark:text-blue-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">
                {checkoutMode === 'trial' ? 'Free trial activated' : 'Subscription activated'}
              </span>
            </div>
            
            <div className="flex items-center justify-center space-x-2 text-green-600 dark:text-green-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-medium">Dashboard ready</span>
            </div>
          </div>

          {/* Improved Twilio Setup Reassurance */}
          {!status.hasTwilioNumber && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-left">
                  <p className="text-blue-800 dark:text-blue-200 text-sm font-medium mb-1">
                    Setting up your ReplyFlow number
                  </p>
                  <p className="text-blue-700 dark:text-blue-300 text-xs">
                    Your ReplyFlow number may still be finishing setup in the background.
                    You can continue to your dashboard while activation completes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Animated Button - Direct to Dashboard */}
          <div className={`transition-opacity duration-700 ${showButton ? 'opacity-100' : 'opacity-0'}`}>
            <Link 
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 w-full"
              onClick={() => {
                const clickData = {
                  sessionId,
                  subscriptionStatus: status.subscriptionStatus,
                  destination: '/dashboard',
                  timestamp: new Date().toISOString()
                }
                console.log('[Billing Success Continue Dashboard]', clickData)
              }}
            >
              Open Dashboard
            </Link>
          </div>

          {/* Improved Subtext */}
          <p className="text-muted-foreground text-sm mt-4">
            Continue to your dashboard to finish setup.
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
          <h1 className="text-2xl font-bold text-foreground mb-4">Setup Taking Longer</h1>
          <p className="text-muted-foreground mb-6">
            Your trial is active, but setup is still finishing. Continue to your dashboard to access your account.
          </p>
          <Link 
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Continue to Dashboard
          </Link>
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

  // Loading state
  return (
    <PageBackground>
            <div className="flex items-center justify-center px-4 min-h-screen">
        <div className="max-w-md w-full mx-auto text-center">
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
                <>Setup complete! Your account is ready.</>
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

        {/* Debug info */}
        {process.env.NODE_ENV === 'development' && status && (
          <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded text-left">
            <p><strong>Status:</strong> {JSON.stringify(status, null, 2)}</p>
          </div>
        )}
      </div>
    </div>
    </PageBackground>
  )
}
