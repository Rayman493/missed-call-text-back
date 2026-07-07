'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Business } from '@/lib/types'
import { hasActiveSubscription, hasActiveTrial, deriveSetupState } from '@/lib/subscription-utils'
import { CheckCircle, AlertTriangle, ChevronDown, ChevronUp, ArrowRight, Settings, Loader2, HelpCircle, X } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import HelpTroubleshootingModal from '@/components/HelpTroubleshootingModal'

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
  const [isOpeningBilling, setIsOpeningBilling] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [successDismissed, setSuccessDismissed] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const { user } = useAuth()
  const setupState = deriveSetupState(business, missedCallCount)
  const hasSubscription = hasActiveSubscription(business)
  
  // Check if actual test call has been completed
  const hasCompletedTestCall = Boolean(
    business?.first_test_call_completed_at ||
    missedCallCount > 0
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
    
    // Priority 4: Needs call forwarding setup
    if (setupState === 'needs_forwarding') {
      return 'needs-forwarding'
    }
    
    // Priority 5: Needs verification test
    if (setupState === 'needs_final_test') {
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
    if (shouldAutoExpand) {
      setIsExpanded(true)
    } else {
      setIsExpanded(false)
    }
  }, [shouldAutoExpand])

  // Auto-expand the current step
  React.useEffect(() => {
    if (cardState === 'needs-forwarding') {
      setExpandedStep(2)
    } else if (cardState === 'needs-verification') {
      setExpandedStep(3)
    }
  }, [cardState])
  
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
                    <span className="text-white text-sm font-medium">Dedicated Number</span>
                    <span className={`text-xs block ${hasNumber ? 'text-green-200' : isProvisioning ? 'text-yellow-200' : 'text-gray-300'}`}>
                      {hasNumber ? 'Ready' : isProvisioning ? 'Provisioning' : 'Pending'}
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
                      {forwardingActuallyVerified ? 'Verified' : 'Configure'}
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
                    <span className="text-white text-sm font-medium">Verify Test Call</span>
                    <span className={`text-xs block ${hasCompletedTestCall ? 'text-green-200' : 'text-gray-300'}`}>
                      {hasCompletedTestCall ? 'Verified' : 'Pending'}
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
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Setup Complete</h1>
              <p className="text-slate-400 text-base sm:text-lg">ReplyFlow is now fully configured and ready to capture future missed calls automatically.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              View First Lead
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
      <div className="bg-slate-900/50 dark:bg-slate-950/50 backdrop-blur-sm rounded-xl p-4 sm:p-5 shadow-lg border border-slate-200/10 dark:border-slate-800/50 border-l-4 border-l-green-500">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-green-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-white">ReplyFlow Active</h3>
              <p className="text-slate-400 text-sm">All systems operational. No action needed.</p>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
          >
            View Details
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }
  
  // Render expanded state
  return (
    <div className="bg-slate-900/50 dark:bg-slate-950/50 backdrop-blur-sm rounded-2xl p-4 sm:p-5 shadow-xl border border-slate-200/10 dark:border-slate-800/50">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col gap-1.5 pb-4 border-b border-blue-500/20">
          {cardState === 'needs-forwarding' ? (
            <>
              <h1 className="text-lg sm:text-xl font-bold text-white">Complete these three steps to activate ReplyFlow</h1>
              <p className="text-slate-400 text-sm">Step 2 of 3 • Set up call forwarding to start capturing missed calls.</p>
            </>
          ) : cardState === 'needs-verification' ? (
            <>
              <h1 className="text-lg sm:text-xl font-bold text-white">Complete these three steps to activate ReplyFlow</h1>
              <p className="text-slate-400 text-sm">Step 3 of 3 • Make a test call to verify your setup.</p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <h1 className="text-lg sm:text-xl font-bold text-white">ReplyFlow Active</h1>
                  <p className="text-slate-400 text-sm">All systems operational and ReplyFlow is actively monitoring your missed calls.</p>
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="flex-shrink-0 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Setup Progress - Always show all three steps with collapsible sections */}
        {(cardState === 'needs-forwarding' || cardState === 'needs-verification') && (
          <div className="space-y-3">
            {/* Step 1: Always Complete */}
            <div className="bg-slate-800/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden">
              <button
                onClick={() => setExpandedStep(expandedStep === 1 ? null : 1)}
                className="w-full flex items-center gap-2.5 p-3 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-white text-sm font-medium flex-1 text-left">Step 1 — Your ReplyFlow number is ready</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedStep === 1 ? 'rotate-180' : ''}`} />
              </button>
              {expandedStep === 1 && (
                <div className="p-3 pt-0 border-t border-white/10">
                  <div className="space-y-2.5">
                    <div>
                      <span className="text-blue-200 text-xs block mb-1">ReplyFlow Number</span>
                      <span className="text-white font-mono text-sm">
                        {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-200 text-xs block mb-1">Business Number</span>
                      <span className="text-white font-mono text-sm">
                        {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
                      </span>
                    </div>
                    <p className="text-blue-200 text-xs mt-2">
                      Your ReplyFlow number has been provisioned and is ready to receive forwarded missed calls.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Complete or Current */}
            <div className={`backdrop-blur-sm rounded-xl border overflow-hidden transition-all ${
              cardState === 'needs-verification' 
                ? 'bg-slate-800/50 dark:bg-slate-900/50 border-slate-700/50' 
                : cardState === 'needs-forwarding'
                  ? 'bg-slate-800/50 dark:bg-slate-900/50 border-l-4 border-l-blue-500 border-y border-r border-slate-700/50 shadow-lg'
                  : 'bg-slate-800/50 dark:bg-slate-900/50 border-slate-700/50'
            }`}>
              <button
                onClick={() => setExpandedStep(expandedStep === 2 ? null : 2)}
                className="w-full flex items-center gap-2.5 p-3 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1">
                  {cardState === 'needs-verification' ? (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="text-white text-sm font-medium flex-1 text-left">Step 2 — Set up call forwarding</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/30">
                        <span className="text-white text-sm font-bold">2</span>
                      </div>
                      <span className="text-white text-sm font-semibold flex-1 text-left">Set up call forwarding</span>
                      <span className="inline-flex items-center px-2.5 py-1 bg-blue-500/20 text-blue-300 text-xs font-bold rounded-full border border-blue-400/30">
                        Current
                      </span>
                    </div>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${cardState === 'needs-forwarding' ? 'text-blue-300' : 'text-slate-400'} ${expandedStep === 2 ? 'rotate-180' : ''}`} />
              </button>
              {expandedStep === 2 && (
                <div className="p-3 pt-0 border-t border-white/10">
                  <div className="space-y-2.5">
                    <p className="text-white text-sm">
                      Set up call forwarding on your business phone to route missed calls to your ReplyFlow number.
                    </p>
                    <div>
                      <span className="text-blue-200 text-xs block mb-1">Your ReplyFlow Number</span>
                      <span className="text-white font-mono text-sm">
                        {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
                      </span>
                    </div>
                    <Link
                      href="/setup/phone-forwarding"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-blue-50 text-blue-600 text-sm font-medium rounded-lg transition-colors"
                    >
                      {cardState === 'needs-verification' ? 'Review Forwarding Setup' : 'Set Up Call Forwarding'}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Upcoming or Current */}
            <div className={`backdrop-blur-sm rounded-xl border overflow-hidden transition-all ${
              cardState === 'needs-verification' && !hasCompletedTestCall
                ? 'bg-slate-800/50 dark:bg-slate-900/50 border-l-4 border-l-blue-500 border-y border-r border-slate-700/50 shadow-lg'
                : cardState === 'needs-verification' && hasCompletedTestCall
                  ? 'bg-slate-800/50 dark:bg-slate-900/50 border-slate-700/50'
                  : 'bg-slate-800/50 dark:bg-slate-900/50 border-slate-700/50'
            }`}>
              <button
                onClick={() => setExpandedStep(expandedStep === 3 ? null : 3)}
                className="w-full flex items-center gap-2.5 p-3 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1">
                  {hasCompletedTestCall ? (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="text-white text-sm font-medium flex-1 text-left">Step 3 — Make a test call</span>
                    </div>
                  ) : cardState === 'needs-verification' ? (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/30">
                        <span className="text-white text-sm font-bold">3</span>
                      </div>
                      <span className="text-white text-sm font-semibold flex-1 text-left">Make a test call</span>
                      <span className="inline-flex items-center px-2.5 py-1 bg-blue-500/20 text-blue-300 text-xs font-bold rounded-full border border-blue-400/30">
                        Current
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-5 h-5 rounded-full bg-slate-600/50 flex items-center justify-center flex-shrink-0">
                        <span className="text-slate-400 text-xs font-semibold">3</span>
                      </div>
                      <span className="text-slate-400 text-sm font-medium flex-1 text-left">Make a test call</span>
                    </div>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${
                  cardState === 'needs-verification' && !hasCompletedTestCall
                    ? 'text-blue-300'
                    : 'text-slate-400'
                } ${expandedStep === 3 ? 'rotate-180' : ''}`} />
              </button>
              {expandedStep === 3 && (
                <div className="p-3 pt-0 border-t border-white/10">
                  <div className="space-y-2.5">
                    <p className="text-white text-sm">
                      Make a test call to your business number to verify that ReplyFlow is working correctly.
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-white text-xs font-semibold">1</span>
                        </div>
                        <p className="text-white text-sm pt-0.5">Call your business phone number from another phone.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-white text-xs font-semibold">2</span>
                        </div>
                        <p className="text-white text-sm pt-0.5">Let the call ring until it forwards to ReplyFlow.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-white text-xs font-semibold">3</span>
                        </div>
                        <p className="text-white text-sm pt-0.5">Listen for the AI greeting and complete a short conversation.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-white text-xs font-semibold">4</span>
                        </div>
                        <p className="text-white text-sm pt-0.5">Confirm that a new lead appears in your dashboard.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Phone Numbers - Always show in expanded state */}
        {(cardState === 'setup-complete' || cardState === 'healthy') && (
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Call Forwarding - Check actual state */}
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${business?.forwarding_verified === true ? 'bg-green-500' : 'bg-gray-500'}`}>
                  {business?.forwarding_verified === true ? (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-white/50 rounded-full" />
                  )}
                </div>
                <div>
                  <span className="text-white text-sm font-medium">Call Forwarding</span>
                  <span className={`text-xs block ${business?.forwarding_verified === true ? 'text-green-200' : 'text-gray-300'}`}>
                    {business?.forwarding_verified === true ? 'Verified' : 'Not Verified'}
                  </span>
                </div>
              </div>

              {/* AI Receptionist - Check actual state */}
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${business?.twilio_phone_number ? 'bg-green-500' : 'bg-gray-500'}`}>
                  {business?.twilio_phone_number ? (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-white/50 rounded-full" />
                  )}
                </div>
                <div>
                  <span className="text-white text-sm font-medium">AI Receptionist</span>
                  <span className={`text-xs block ${business?.twilio_phone_number ? 'text-green-200' : 'text-gray-300'}`}>
                    {business?.twilio_phone_number ? 'Active' : 'Not Configured'}
                  </span>
                </div>
              </div>

              {/* SMS Replies - Check actual state */}
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${business?.messaging_status === 'active' ? 'bg-green-500' : 'bg-gray-500'}`}>
                  {business?.messaging_status === 'active' ? (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-white/50 rounded-full" />
                  )}
                </div>
                <div>
                  <span className="text-white text-sm font-medium">SMS Replies</span>
                  <span className={`text-xs block ${business?.messaging_status === 'active' ? 'text-green-200' : 'text-gray-300'}`}>
                    {business?.messaging_status === 'active' ? 'Active' : 'Not Active'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CTA Buttons - Only show for setup-complete and healthy states */}
        {(cardState === 'setup-complete' || cardState === 'healthy') && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Link
                href="/setup/phone-forwarding?mode=review"
                className="inline-flex items-center justify-center px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors min-h-[40px]"
              >
                <Settings className="w-4 h-4 mr-2" />
                Review Forwarding Setup
              </Link>
              <button
                onClick={() => setShowHelpModal(true)}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-sm font-medium rounded-lg transition-colors min-h-[40px]"
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Help & Troubleshooting
              </button>
            </div>
          </div>
        )}
      </div>

      <HelpTroubleshootingModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        twilioPhoneNumber={business?.twilio_phone_number ?? undefined}
      />
    </div>
  )
}
