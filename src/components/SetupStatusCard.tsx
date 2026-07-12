'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Business } from '@/lib/types'
import { hasActiveSubscription, hasActiveTrial, deriveSetupState } from '@/lib/subscription-utils'
import { CheckCircle, AlertTriangle, ChevronDown, ChevronUp, ArrowRight, Settings, Loader2, HelpCircle, X, Phone } from 'lucide-react'
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
  | 'needs-forwarding'
  | 'needs-verification'
  | 'setup-complete'
  | 'setup-complete-success'
  | 'healthy'

export default function SetupStatusCard({
  business,
  setupHealth,
  missedCallCount = 0
}: SetupStatusCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
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
  const hasCompletedTestCall = Boolean(
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
    
    // Priority 4: Needs call forwarding setup (user hasn't confirmed instructions yet)
    if (setupState === 'needs_forwarding' && !hasConfirmedForwardingInstructions) {
      return 'needs-forwarding'
    }
    
    // Priority 5: Needs verification test (user confirmed instructions but test call not done)
    if (hasConfirmedForwardingInstructions && !hasCompletedTestCall) {
      return 'needs-verification'
    }
    
    // Priority 6: Setup complete success (first lead captured, not yet dismissed)
    if (setupHealth?.forwardingVerified && missedCallCount > 0 && !successDismissed) {
      return 'setup-complete-success'
    }
    
    // Priority 7: Setup complete but no leads yet
    if (setupHealth?.forwardingVerified && missedCallCount === 0) {
      return 'setup-complete'
    }
    
    // Priority 8: Healthy active account
    return 'healthy'
  }
  
  const cardState = getCardState()
  
  // Auto-expand during setup states and success state, collapse after setup
  const shouldAutoExpand =
    cardState === 'needs-forwarding' ||
    cardState === 'needs-verification' ||
    cardState === 'billing-blocker' ||
    cardState === 'critical-issue' ||
    cardState === 'setup-complete-success' ||
    cardState === 'subscription-active'

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
    if (cardState === 'needs-forwarding') {
      setExpandedStep(2)
    } else if (cardState === 'needs-verification') {
      setExpandedStep(3)
    } else if (hasConfirmedForwardingInstructions && !hasCompletedTestCall) {
      // After confirming instructions but before test call, expand step 3
      setExpandedStep(3)
    }
  }, [cardState, hasConfirmedForwardingInstructions, hasCompletedTestCall])
  
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

  // Render collapsed state (after setup is complete)
  if (!isExpanded && (cardState === 'setup-complete' || cardState === 'healthy')) {
    return (
      <div className="bg-card text-card-foreground rounded-2xl shadow-xl border border-border/50 ring-1 ring-border/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
        <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">ReplyFlow is protecting your business</h3>
              <p className="text-muted-foreground text-sm">Missed calls will be captured automatically.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setUserHasToggled(true)
              setIsExpanded(true)
            }}
            className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            View Details
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }
  
  // Render main card (for setup states)
  return (
    <div className="bg-card text-card-foreground rounded-2xl shadow-xl border border-border/50 ring-1 ring-border/50">
      <div className="flex flex-col gap-3 sm:gap-4 p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-foreground">
              {cardState === 'needs-forwarding' || cardState === 'needs-verification'
                ? 'Complete Setup'
                : 'ReplyFlow Ready'
              }
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {cardState === 'needs-forwarding'
                ? 'One final step remaining'
                : cardState === 'needs-verification'
                ? 'Step 3 of 3'
                : 'Setup complete'}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setUserHasToggled(true)
              setIsExpanded(!isExpanded)
            }}
            className="flex-shrink-0 p-2 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Setup Progress - Only show when expanded */}
        {isExpanded && (
          <div className="space-y-2">
            {/* Step 1: Always Complete */}
            <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden transition-all duration-200">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setExpandedStep(expandedStep === 1 ? null : 1)
                }}
                className="w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/50 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-foreground text-sm font-medium flex-1 text-left">Step 1 — Number ready</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${expandedStep === 1 ? 'rotate-180' : ''}`} />
              </button>
              {expandedStep === 1 && (
                <div className="p-3 sm:p-4 pt-0 border-t border-border/50">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-muted-foreground text-xs">ReplyFlow Number</span>
                      <span className="text-foreground font-mono text-sm font-semibold tabular-nums">
                        {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-muted-foreground text-xs">Business Number</span>
                      <span className="text-foreground font-mono text-sm font-semibold tabular-nums">
                        {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Complete or Current */}
            <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${
              business?.forwarding_verified === true
                ? 'bg-muted/30 border-border/50'
                : cardState === 'needs-forwarding'
                  ? 'bg-primary/5 border-l-4 border-l-primary border-y border-r border-border/50 shadow-sm'
                  : 'bg-muted/30 border-border/50'
            }`}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setExpandedStep(expandedStep === 2 ? null : 2)
                }}
                className="w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/50 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {business?.forwarding_verified === true ? (
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0 shadow-sm shadow-primary/30">
                    <span className="text-primary-foreground text-sm font-bold">2</span>
                  </div>
                )}
                <span className="text-foreground text-sm font-medium flex-1 text-left">
                  {business?.forwarding_verified === true ? 'Step 2 — Call forwarding active' : 'Set up forwarding'}
                </span>
                {cardState === 'needs-forwarding' && business?.forwarding_verified !== true && (
                  <span className="inline-flex items-center px-2 py-0.5 bg-primary/20 text-primary text-xs font-semibold rounded-full border border-primary/30 flex-shrink-0">
                    Current
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${cardState === 'needs-forwarding' && business?.forwarding_verified !== true ? 'text-primary' : 'text-muted-foreground'} ${expandedStep === 2 ? 'rotate-180' : ''} flex-shrink-0`} />
              </button>
              {expandedStep === 2 && (
                <div className="p-3 sm:p-4 pt-0 border-t border-border/50">
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">
                      Forward missed calls to your ReplyFlow number so we can answer them.
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between py-1">
                        <span className="text-muted-foreground text-xs">ReplyFlow Number</span>
                        <span className="text-foreground font-mono text-sm font-semibold tabular-nums">
                          {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
                        </span>
                      </div>
                      {business?.business_phone_carrier && (
                        <div className="flex items-center justify-between py-1">
                          <span className="text-muted-foreground text-xs">Carrier</span>
                          <span className="text-foreground font-mono text-sm">
                            {business.business_phone_carrier}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs pt-2">
                      Need to review forwarding instructions?{' '}
                      <button
                        onClick={() => setShowForwardingInstructions(true)}
                        className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                      >
                        View instructions
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Upcoming or Current */}
            <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${
              cardState === 'needs-verification' && !hasCompletedTestCall
                ? 'bg-muted/40 border-border/60 shadow-sm'
                : cardState === 'needs-verification' && hasCompletedTestCall
                  ? 'bg-muted/30 border-border/50'
                  : 'bg-muted/30 border-border/50'
            }`}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setExpandedStep(expandedStep === 3 ? null : 3)
                }}
                className="w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/50 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {hasCompletedTestCall ? (
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : cardState === 'needs-verification' ? (
                  <div className="w-6 h-6 rounded-full bg-background border-2 border-primary/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary text-sm font-semibold">3</span>
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-muted-foreground text-sm font-semibold">3</span>
                  </div>
                )}
                <span className={`flex-1 text-left ${
                  cardState === 'needs-verification' && !hasCompletedTestCall
                    ? 'text-foreground text-sm font-semibold'
                    : 'text-foreground text-sm font-medium'
                }`}>
                  {hasCompletedTestCall ? 'Step 3 — Setup verified' : cardState === 'needs-verification' ? 'Test Your Setup' : 'Step 3 — Verify setup'}
                </span>
                {cardState === 'needs-verification' && !hasCompletedTestCall && (
                  <span className="inline-flex items-center px-2 py-0.5 bg-muted/60 text-muted-foreground text-xs font-medium rounded-md border border-border/50 flex-shrink-0">
                    Final Test
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${
                  cardState === 'needs-verification' && !hasCompletedTestCall
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                } ${expandedStep === 3 ? 'rotate-180' : ''} flex-shrink-0`} />
              </button>
              {expandedStep === 3 && (
                <div className="p-3 sm:p-4 pt-0 border-t border-border/50">
                  <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                      From another phone, call your business number once to test your setup.
                    </p>
                    {business?.business_phone_number && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-4">
                          <Phone className="w-6 h-6 text-foreground flex-shrink-0" />
                          <span className="text-foreground font-mono text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight">
                            {formatPhoneNumber(business.business_phone_number)}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs pl-10">
                          This confirms your call forwarding is working correctly.
                        </p>
                        <p className="text-muted-foreground text-xs pl-10">
                          Use any phone other than your business phone.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Phone Numbers - Compact on mobile */}
        {(cardState === 'setup-complete' || cardState === 'healthy') && (
          <div className="bg-muted/30 rounded-xl p-3 sm:p-4 border border-border/50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Call Forwarding - Check actual state */}
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${business?.forwarding_verified === true ? 'bg-green-500' : 'bg-muted'}`}>
                  {business?.forwarding_verified === true ? (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-foreground text-sm font-medium block truncate">Call Forwarding</span>
                  <span className={`text-xs block ${business?.forwarding_verified === true ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {business?.forwarding_verified === true ? 'Verified' : 'Not Verified'}
                  </span>
                </div>
              </div>

              {/* AI Receptionist - Check actual state */}
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${business?.twilio_phone_number ? 'bg-green-500' : 'bg-muted'}`}>
                  {business?.twilio_phone_number ? (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-foreground text-sm font-medium block truncate">AI Receptionist</span>
                  <span className={`text-xs block ${business?.twilio_phone_number ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {business?.twilio_phone_number ? 'Ready' : 'Not Configured'}
                  </span>
                </div>
              </div>

              {/* SMS Replies - Check actual state */}
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${business?.messaging_status === 'active' ? 'bg-green-500' : 'bg-muted'}`}>
                  {business?.messaging_status === 'active' ? (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-foreground text-sm font-medium block truncate">SMS Replies</span>
                  <span className={`text-xs block ${business?.messaging_status === 'active' ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {business?.messaging_status === 'active' ? 'Ready' : 'Not Active'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CTA Buttons - Compact on mobile */}
        {(cardState === 'setup-complete' || cardState === 'healthy') && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Link
                href="/setup/phone-forwarding?mode=review"
                className="inline-flex items-center justify-center px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4 mr-2" />
                Setup
              </Link>
              <button
                onClick={() => setIsAssistantOpen(true)}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-sm font-medium rounded-lg transition-colors"
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Help
              </button>
            </div>
          </div>
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
          <div className="relative mb-20 w-full max-w-lg">
            <ReplyFlowAssistant
              context={{ currentPage: 'dashboard' }}
              onClose={() => setIsAssistantOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
