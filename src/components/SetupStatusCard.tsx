'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Business } from '@/lib/types'
import { hasActiveSubscription, hasActiveTrial, deriveSetupState } from '@/lib/subscription-utils'
import { CheckCircle, AlertTriangle, ChevronDown, ChevronUp, ArrowRight, Loader2, HelpCircle, X, Phone, RotateCcw } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import ReplyFlowAssistant from '@/components/ReplyFlowAssistant'
import CallForwardingInstructions from '@/components/CallForwardingInstructions'

interface SetupStatusCardProps {
  business: Business | null
  setupHealth?: {
    forwardingVerified?: boolean
    smsActive?: boolean
    aiIntakeReady?: boolean
  }
  missedCallCount?: number
}

type CardState =
  | 'billing-blocker'
  | 'subscription-active'
  | 'critical-issue'
  | 'setup-incomplete'
  | 'setup-complete'
  | 'setup-complete-success'
  | 'healthy'

export default function SetupStatusCard({
  business,
  setupHealth,
  missedCallCount = 0
}: SetupStatusCardProps) {
  const [userHasToggled, setUserHasToggled] = useState(false)
  const [isOpeningBilling, setIsOpeningBilling] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [successDismissed, setSuccessDismissed] = useState(false)
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const [showForwardingInstructions, setShowForwardingInstructions] = useState(false)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const { user } = useAuth()
  const setupState = deriveSetupState(business, missedCallCount)
  const hasSubscription = hasActiveSubscription(business)
  
  // Check if actual test call has been completed
  // Use persisted forwarding_verified as primary signal (set when real leads are captured)
  // Fall back to explicit test completion or call events count
  const hasCompletedTestCall = Boolean(
    business?.forwarding_verified === true ||
    business?.first_test_call_completed_at ||
    missedCallCount > 0
  )

  // Check if user has confirmed forwarding instructions
  const hasConfirmedForwardingInstructions = Boolean(
    business?.forwarding_instructions_confirmed_at
  )

  // Check if success state has been dismissed (localStorage)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && business?.id) {
      const dismissed = localStorage.getItem(`setup-success-dismissed-${business.id}`)
      setSuccessDismissed(dismissed === 'true')
    }
  }, [business?.id])

  // Handle dismissing the success state
  const handleDismissSuccess = () => {
    if (business?.id) {
      localStorage.setItem(`setup-success-dismissed-${business.id}`, 'true')
      setSuccessDismissed(true)
    }
  }
  
  // Handle opening billing portal or checkout
  const handleOpenBilling = async () => {
    if (!user) return
    
    setIsOpeningBilling(true)
    setBillingError(null)
    
    try {
      // If user has active subscription, go to portal
      // If user needs to subscribe, go to checkout
      if (hasSubscription) {
        console.log('[SetupStatusCard] Opening billing portal for active subscriber')
        const response = await fetch('/api/stripe/create-portal-session', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${await user.getIdToken()}`,
            'Content-Type': 'application/json',
          },
        })
        
        const data = await response.json()
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to open billing portal')
        }
        
        if (data.url) {
          window.location.href = data.url
        } else {
          throw new Error('No billing portal URL returned')
        }
      } else {
        console.log('[SetupStatusCard] Creating checkout session for non-subscriber')
        const response = await fetch('/api/stripe/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            checkout_mode: 'paid', // Use paid mode for trial-used users
          }),
        })
        
        const data = await response.json()
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create checkout session')
        }
        
        if (data.url) {
          window.location.href = data.url
        } else {
          throw new Error('No checkout URL returned')
        }
      }
    } catch (error: any) {
      console.error('[SetupStatusCard] Failed to open billing:', error)
      setBillingError(error.message || 'Failed to open billing. Please try again.')
    } finally {
      setIsOpeningBilling(false)
    }
  }
  
  // Determine card state based on priority order
  const getCardState = (): CardState => {
    // Priority 1: Billing/trial blockers (highest priority)
    const isTrialUsed = business?.onboarding_status === 'trial_used' || business?.subscription_status === 'trial_expired'
    const needsSubscription = !hasSubscription
    const hasPaymentIssue = business?.subscription_status === 'past_due' || business?.subscription_status === 'unpaid'

    // If trial was used OR no active subscription OR has payment issue, show billing blocker
    if (isTrialUsed || needsSubscription || hasPaymentIssue) {
      return 'billing-blocker'
    }

    // Priority 2: Subscription active but setup not complete - show subscription-active state
    // This is the state immediately after Stripe checkout before any setup is done
    const hasNumber = Boolean(business?.twilio_phone_number)
    const forwardingActuallyVerified = business?.forwarding_verified === true
    const smsActuallyActive = business?.messaging_status === 'active'
    const hasActualOperationalState = forwardingActuallyVerified && smsActuallyActive && hasNumber

    // If subscription is active but setup is not actually complete, show subscription-active
    if (hasSubscription && !hasActualOperationalState) {
      return 'subscription-active'
    }

    // Priority 3: Critical operational issues
    if (business?.provisioning_status === 'failed') {
      return 'critical-issue'
    }

    if (business?.messaging_status !== 'active' && business?.twilio_phone_number) {
      return 'critical-issue'
    }

    // Priority 4: Setup incomplete (user hasn't completed all steps)
    if (!hasCompletedTestCall || !hasConfirmedForwardingInstructions) {
      return 'setup-incomplete'
    }

    // Priority 5: Setup complete success (first lead captured, not yet dismissed)
    if (setupHealth?.forwardingVerified && missedCallCount > 0 && !successDismissed) {
      return 'setup-complete-success'
    }

    // Priority 6: Setup complete but no leads yet
    if (setupHealth?.forwardingVerified && missedCallCount === 0) {
      return 'setup-complete'
    }

    // Priority 7: Healthy active account
    return 'healthy'
  }
  
  const cardState = getCardState()

  // Auto-expand during setup states and success state, collapse after setup
  const shouldAutoExpand =
    cardState === 'setup-incomplete' ||
    cardState === 'billing-blocker' ||
    cardState === 'critical-issue' ||
    cardState === 'setup-complete-success' ||
    cardState === 'subscription-active'

  // Initialize isExpanded based on actual card state to prevent race condition
  // If business data is not loaded yet, default to collapsed to avoid false positive expansion
  const [isExpanded, setIsExpanded] = useState(() => {
    // Only auto-expand if we have enough data to make a reliable determination
    const hasEnoughData = business?.id && (business?.forwarding_verified !== undefined || business?.subscription_status !== undefined)
    if (!hasEnoughData) return false
    return shouldAutoExpand
  })

  React.useEffect(() => {
    // Reset userHasToggled when setup completes to allow auto-collapse
    if (cardState === 'setup-complete' || cardState === 'setup-complete-success' || cardState === 'healthy') {
      setUserHasToggled(false)
    }
  }, [cardState])

  React.useEffect(() => {
    // Only auto-expand if user hasn't manually toggled
    if (!userHasToggled) {
      if (shouldAutoExpand) {
        setIsExpanded(true)
      } else {
        setIsExpanded(false)
      }
    }
  }, [shouldAutoExpand, userHasToggled])

  // Auto-expand the current step
  React.useEffect(() => {
    if (cardState === 'setup-incomplete') {
      if (!hasConfirmedForwardingInstructions) {
        setExpandedStep(2)
      } else if (!hasCompletedTestCall) {
        setExpandedStep(3)
      }
    }
  }, [cardState, hasConfirmedForwardingInstructions, hasCompletedTestCall])
  
  // Collapsed overview for setup-incomplete (user may manually collapse)
  if (!isExpanded && cardState === 'setup-incomplete') {
    const currentStep = !business?.twilio_phone_number
      ? 'Step 1 of 3'
      : !hasConfirmedForwardingInstructions
        ? 'Step 2 of 3'
        : 'Step 3 of 3'

    return (
      <div className="bg-card text-card-foreground rounded-xl shadow-lg border border-border/50 hover:shadow-md transition-all">
        <div className="flex items-center justify-between gap-3 p-3 sm:p-3.5">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3a1 1 0 00.293.707l2 2a1 1 0 101.414-1.414L11 9.586V7z" clipRule="evenodd"/></svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-foreground leading-tight">Complete Setup</h3>
              <p className="text-muted-foreground text-xs mt-0.5 leading-tight">{currentStep}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Expand setup"
            aria-expanded={false}
            onClick={(e) => {
              e.preventDefault()
              setUserHasToggled(true)
              setIsExpanded(true)
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer flex-shrink-0"
          >
            Expand
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // Collapsed overview for completed/healthy state with persistent Review access
  if (!isExpanded && (cardState === 'setup-complete' || cardState === 'healthy')) {
    return (
      <div className="bg-card text-card-foreground rounded-xl shadow-lg border border-border/50 hover:shadow-md transition-all">
        <div className="flex items-center justify-between gap-2 p-3 sm:p-3.5">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 bg-green-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-foreground leading-tight">ReplyFlow Ready</h3>
              <p className="text-muted-foreground text-xs mt-0.5 leading-tight">Setup completed</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowForwardingInstructions(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Review
            </button>
            <button
              type="button"
              aria-label="Expand setup details"
              aria-expanded={false}
              onClick={(e) => {
                e.preventDefault()
                setUserHasToggled(true)
                setIsExpanded(true)
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              Expand
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render billing blocker state
  if (cardState === 'billing-blocker') {
    const isTrialUsed = business?.onboarding_status === 'trial_used' || business?.subscription_status === 'trial_expired'
    
    return (
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 dark:from-blue-700 dark:to-indigo-800 rounded-2xl p-6 sm:p-8 shadow-2xl border border-blue-500/30">
        <div className="flex flex-col gap-6">
          {isTrialUsed ? (
            <>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Free trial already used</h1>
                <p className="text-blue-100 text-base sm:text-lg">This email has already been used for a ReplyFlow trial. To continue, choose a subscription.</p>
              </div>
              {billingError && (
                <div className="bg-red-900/50 border border-red-700 rounded-lg p-3">
                  <p className="text-sm text-red-100">{billingError}</p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleOpenBilling}
                  disabled={isOpeningBilling}
                  className="inline-flex items-center justify-center px-6 py-3 bg-white hover:bg-blue-50 text-blue-600 text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isOpeningBilling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Opening...
                    </>
                  ) : (
                    <>
                      Subscribe Now
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </button>
                <button
                  onClick={() => window.location.href = '/auth/signin'}
                  className="inline-flex items-center justify-center px-6 py-3 bg-blue-700/50 hover:bg-blue-700/70 text-white text-base font-semibold rounded-xl transition-colors"
                >
                  Use a Different Email
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Payment Required</h1>
                <p className="text-blue-100 text-base sm:text-lg">Update your billing information to keep ReplyFlow active.</p>
              </div>
              {billingError && (
                <div className="bg-red-900/50 border border-red-700 rounded-lg p-3">
                  <p className="text-sm text-red-100">{billingError}</p>
                </div>
              )}
              <button
                onClick={handleOpenBilling}
                disabled={isOpeningBilling}
                className="inline-flex items-center justify-center px-6 py-3 bg-white hover:bg-blue-50 text-blue-600 text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isOpeningBilling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    Update Billing
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Render subscription-active state (after payment but before setup)
  if (cardState === 'subscription-active') {
    const hasNumber = Boolean(business?.twilio_phone_number)
    const forwardingActuallyVerified = business?.forwarding_verified === true
    const smsActuallyActive = business?.messaging_status === 'active'
    const isProvisioning = business?.provisioning_status === 'pending' || business?.provisioning_status === 'provisioning'
    const isTrialing = hasActiveTrial(business)
    const trialEndDate = business?.trial_ends_at ? new Date(business.trial_ends_at).toLocaleDateString() : null

    return (
      <div className="bg-gradient-to-br from-green-600 to-emerald-700 dark:from-green-700 dark:to-emerald-800 rounded-2xl p-6 sm:p-8 shadow-2xl border border-green-500/30">
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-white" />
              </div>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                {isTrialing ? 'Free Trial Active' : 'Subscription Active'}
              </h1>
              <p className="text-green-100 text-base sm:text-lg">
                {isTrialing
                  ? "Your 14-day free trial is active. Complete the setup below before ReplyFlow begins handling missed calls."
                  : "Your ReplyFlow subscription is active. Complete the setup below before ReplyFlow begins handling missed calls."}
              </p>
              {isTrialing && trialEndDate && (
                <p className="text-green-200 text-sm mt-2">
                  Your trial ends on {trialEndDate}.
                </p>
              )}
            </div>
          </div>

          {/* Setup Progress - Show actual state */}
          <div className="space-y-3">
            {/* Dedicated Number */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${hasNumber ? 'bg-green-500' : isProvisioning ? 'bg-yellow-500' : 'bg-gray-500'}`}>
                    {hasNumber ? (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : isProvisioning ? (
                      <Loader2 className="w-3 h-3 text-white animate-spin" />
                    ) : (
                      <div className="w-2 h-2 bg-white/50 rounded-full" />
                    )}
                  </div>
                  <div>
                    <span className="text-white text-sm font-medium">ReplyFlow Number</span>
                    <span className={`text-xs block ${hasNumber ? 'text-green-200' : isProvisioning ? 'text-yellow-200' : 'text-gray-300'}`}>
                      {hasNumber ? 'Connected' : isProvisioning ? 'Connecting' : 'Pending'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Call Forwarding */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${forwardingActuallyVerified ? 'bg-green-500' : 'bg-gray-500'}`}>
                    {forwardingActuallyVerified ? (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <div className="w-2 h-2 bg-white/50 rounded-full" />
                    )}
                  </div>
                  <div>
                    <span className="text-white text-sm font-medium">Call Forwarding</span>
                    <span className={`text-xs block ${forwardingActuallyVerified ? 'text-green-200' : 'text-gray-300'}`}>
                      {forwardingActuallyVerified ? 'Active' : 'Set Up'}
                    </span>
                  </div>
                </div>
                {!forwardingActuallyVerified && hasNumber && (
                  <Link
                    href="/setup/phone-forwarding"
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-green-50 text-green-600 text-xs font-medium rounded-lg transition-colors"
                  >
                    Setup
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>

            {/* Test Call */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${hasCompletedTestCall ? 'bg-green-500' : 'bg-gray-500'}`}>
                    {hasCompletedTestCall ? (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <div className="w-2 h-2 bg-white/50 rounded-full" />
                    )}
                  </div>
                  <div>
                    <span className="text-white text-sm font-medium">Test Your Setup</span>
                    <span className={`text-xs block ${hasCompletedTestCall ? 'text-green-200' : 'text-gray-300'}`}>
                      {hasCompletedTestCall ? 'Complete' : 'Not Started'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          {hasNumber && !forwardingActuallyVerified && (
            <Link
              href="/setup/phone-forwarding"
              className="inline-flex items-center justify-center px-6 py-3 bg-white hover:bg-green-50 text-green-600 text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              Continue Setup
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          )}
        </div>
      </div>
    )
  }

  // Render critical issue state
  if (cardState === 'critical-issue') {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-100 mb-2">
              Action Required
            </h3>
            <p className="text-sm text-red-200 mb-4">
              {business?.provisioning_status === 'failed'
                ? 'Number setup failed. Please try again or contact support.'
                : 'SMS service is unavailable. Check your Twilio configuration.'}
            </p>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center justify-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Fix Issue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Render setup complete success state (first lead captured)
  if (cardState === 'setup-complete-success') {
    return (
      <div className="bg-slate-900/50 dark:bg-slate-950/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 shadow-xl border border-slate-200/10 dark:border-slate-800/50 border-l-4 border-l-green-500">
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">First customer captured</h1>
              <p className="text-slate-400 text-base sm:text-lg">ReplyFlow captured your first missed call and is ready to help.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              View First Customer
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
            <button
              onClick={handleDismissSuccess}
              className="inline-flex items-center justify-center px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-base font-medium rounded-xl transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  
  // Render main card (for setup states)
  return (
    <div className="bg-card text-card-foreground rounded-2xl shadow-xl border border-border/50 ring-1 ring-border/50">
      <div className="flex flex-col gap-3 sm:gap-4 p-4 sm:p-5">
        {/* MODE 1: Setup Incomplete */}
        {cardState === 'setup-incomplete' && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg sm:text-xl font-semibold text-foreground">
                  Complete Setup
                </h1>
                <p className="text-muted-foreground text-xs sm:text-sm">
                  {!hasConfirmedForwardingInstructions ? 'Step 2 of 3' : 'Step 3 of 3'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Collapse setup"
                aria-expanded={isExpanded}
                onClick={(e) => {
                  e.preventDefault()
                  setUserHasToggled(true)
                  setIsExpanded(false)
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer flex-shrink-0"
              >
                Collapse
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Setup Progress with Progressive Disclosure */}
            <div className="space-y-2">
              {/* Step 1: ReplyFlow Number Ready - Accordion */}
              <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
                <button
                  type="button"
                  aria-label="Toggle step 1 details"
                  aria-expanded={expandedStep === 1}
                  onClick={() => setExpandedStep(expandedStep === 1 ? null : 1)}
                  className="w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <span className="text-foreground text-sm font-medium">ReplyFlow number ready</span>
                  </div>
                  {expandedStep === 1 ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
                {expandedStep === 1 && (
                  <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0">
                    <p className="text-muted-foreground text-sm mb-2">
                      Your ReplyFlow number is ready to receive forwarded missed calls.
                    </p>
                    {business?.twilio_phone_number && (
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-mono text-sm font-semibold tabular-nums">
                          {formatPhoneNumber(business.twilio_phone_number)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Call Forwarding - Accordion */}
              <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${
                !hasConfirmedForwardingInstructions && expandedStep === 2
                  ? 'bg-primary/5 border-l-4 border-l-primary border-y border-r border-border/50 shadow-sm'
                  : 'bg-muted/30 border-border/50'
              }`}>
                <button
                  type="button"
                  aria-label="Toggle step 2 details"
                  aria-expanded={expandedStep === 2}
                  onClick={() => setExpandedStep(expandedStep === 2 ? null : 2)}
                  className="w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    hasConfirmedForwardingInstructions
                      ? 'bg-green-500/20'
                      : 'bg-primary shadow-sm shadow-primary/30'
                  }`}>
                    {hasConfirmedForwardingInstructions ? (
                      <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="text-primary-foreground text-sm font-bold">2</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-foreground text-sm font-medium">
                      {hasConfirmedForwardingInstructions ? 'Call forwarding setup confirmed' : 'Set up call forwarding'}
                    </span>
                  </div>
                  {expandedStep === 2 ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
                {expandedStep === 2 && (
                  <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0">
                    <p className="text-muted-foreground text-sm mb-3">
                      Forward missed calls from your business phone to ReplyFlow.
                    </p>
                    <button
                      onClick={() => setShowForwardingInstructions(true)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-lg transition-all shadow-sm hover:shadow"
                    >
                      {hasConfirmedForwardingInstructions ? 'Review setup instructions' : 'View setup instructions'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Step 3: Test Setup - Accordion */}
              {hasConfirmedForwardingInstructions && (
                <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${
                  !hasCompletedTestCall && expandedStep === 3
                    ? 'bg-muted/40 border-border/60 shadow-sm'
                    : 'bg-muted/30 border-border/50'
                }`}>
                  <button
                    type="button"
                    aria-label="Toggle step 3 details"
                    aria-expanded={expandedStep === 3}
                    onClick={() => setExpandedStep(expandedStep === 3 ? null : 3)}
                    className="w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      hasCompletedTestCall
                        ? 'bg-green-500/20'
                        : 'bg-background border-2 border-primary/40'
                    }`}>
                      {hasCompletedTestCall ? (
                        <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <span className="text-primary text-sm font-semibold">3</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <span className="text-foreground text-sm font-medium">
                        {hasCompletedTestCall ? 'Test completed' : 'Test your setup'}
                      </span>
                    </div>
                    {expandedStep === 3 ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                  {expandedStep === 3 && (
                    <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0">
                      <p className="text-muted-foreground text-sm mb-2">
                        From another phone, call your business number once to test your setup.
                      </p>
                      {business?.business_phone_number && (
                        <div className="flex items-center gap-3 mb-2">
                          <Phone className="w-5 h-5 text-foreground flex-shrink-0" />
                          <span className="text-foreground font-mono text-lg font-semibold tabular-nums tracking-tight">
                            {formatPhoneNumber(business.business_phone_number)}
                          </span>
                        </div>
                      )}
                      <p className="text-muted-foreground text-xs">
                        Use any phone other than your business phone to confirm the missed call reaches ReplyFlow.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Help button - always accessible */}
            <div className="flex justify-end">
              <button
                onClick={() => setIsAssistantOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 text-sm font-medium rounded-lg transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
                Help
              </button>
            </div>
          </>
        )}

        {/* MODE 2: Setup Complete - Compact State */}
        {(cardState === 'setup-complete' || cardState === 'healthy') && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-green-500/15 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg sm:text-xl font-semibold text-foreground leading-tight">
                    ReplyFlow Ready
                  </h1>
                  <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 leading-tight">
                    ✓ Setup completed
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Collapse setup details"
                aria-expanded={isExpanded}
                onClick={(e) => {
                  e.preventDefault()
                  setUserHasToggled(true)
                  setIsExpanded(false)
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer flex-shrink-0"
              >
                Collapse
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Supporting message - no false monitoring claims */}
            <p className="text-muted-foreground text-sm">
              Your ReplyFlow number was set up and you completed the forwarding test.
            </p>

            {/* Ongoing guidance */}
            <p className="text-muted-foreground text-xs">
              Call forwarding is managed through your phone carrier. If you change your phone service or forwarding settings, review your setup again.
            </p>

            {/* Actions - always visible */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
              <button
                onClick={() => setShowForwardingInstructions(true)}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Review Setup
              </button>
              <button
                onClick={() => setIsAssistantOpen(true)}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-sm font-medium rounded-lg transition-colors"
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Help
              </button>
            </div>
          </>
        )}
      </div>

      {showForwardingInstructions && (
        <CallForwardingInstructions
          phoneNumber={business?.twilio_phone_number || ''}
          isOpen={showForwardingInstructions}
          onClose={() => setShowForwardingInstructions(false)}
          businessId={business?.id}
          onConfirm={async () => {
            // Refresh business data after confirmation
            if (business?.id) {
              try {
                const response = await fetch(`/api/businesses/${business.id}`)
                if (response.ok) {
                  const data = await response.json()
                  // The parent component will need to update business state
                  // For now, we'll trigger a re-render by setting expandedStep
                  setExpandedStep(3)
                }
              } catch (error) {
                console.error('[SetupStatusCard] Failed to refresh business data:', error)
              }
            }
          }}
        />
      )}

      {isAssistantOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 md:hidden">
          <div className="absolute inset-0 bg-black/55" onClick={() => setIsAssistantOpen(false)} />
          <div className="relative w-full max-w-lg max-h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] flex flex-col">
            <div className="bg-white dark:bg-slate-800 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-5rem-env(safe-area-inset-bottom))]">
              <ReplyFlowAssistant
                context={{ currentPage: 'dashboard' }}
                onClose={() => setIsAssistantOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {isAssistantOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 hidden md:block">
          <div className="absolute inset-0 bg-black/55" onClick={() => setIsAssistantOpen(false)} />
          <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh]">
              <ReplyFlowAssistant
                context={{ currentPage: 'dashboard' }}
                onClose={() => setIsAssistantOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
