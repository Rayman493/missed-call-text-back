'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { getReplyFlowPhoneNumberDisplay } from '@/lib/utils'
import { 
  hasValidSubscription,
  SUBSCRIPTION_STATES 
} from '@/lib/subscription'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber } from '@/lib/utils'
import { hasActiveAccess, hasActiveTrial } from '@/lib/subscription-utils'
import { Circle } from 'lucide-react'
import Link from 'next/link'
import { handleBillingAction } from '@/lib/billing'

type OnboardingState = 
  | 'loading'
  | 'no_subscription'
  | 'provisioning_number'
  | 'number_ready'
  | 'forwarding_needed'
  | 'testing_needed'
  | 'active_ready'

interface ChecklistItem {
  id: string
  title: string
  description: string
  status: 'complete' | 'needs-action' | 'not-tested-yet'
  buttonText?: string
  buttonHref?: string
  buttonOnClick?: () => void
  details?: string
}

interface GettingStartedProps {
  isExpanded?: boolean
  onToggle?: () => void
  isOnboardingComplete?: boolean
}

// Local storage key for collapse preference
const COLLAPSE_PREFERENCE_KEY = 'gettingStartedCollapsed'

export default function GettingStarted({ isExpanded: propExpanded, onToggle, isOnboardingComplete }: GettingStartedProps) {
  const { business, refreshBusiness } = useBusiness()
  const [isExpanded, setIsExpanded] = useState(propExpanded || false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isHandlingBilling, setIsHandlingBilling] = useState(false)
  const [hasTriggeredProvisioning, setHasTriggeredProvisioning] = useState(false)

  // When onboarding is complete, collapse by default
  useEffect(() => {
    if (isOnboardingComplete) {
      setIsExpanded(false)
      saveCollapsePreference(true)
    }
  }, [isOnboardingComplete])

  // Fallback provisioning trigger on component mount
  useEffect(() => {
    const triggerProvisioningIfNeeded = async () => {
      if (!business || hasTriggeredProvisioning) return
      
      const shouldTrigger = 
        (business.subscription_status === 'trialing' || business.subscription_status === 'active') &&
        !business.twilio_phone_number_sid &&
        business.provisioning_status !== 'provisioning'
      
      if (shouldTrigger) {
        console.log('[GettingStarted] Triggering fallback provisioning for business:', business.id)
        try {
          const response = await fetch('/api/business/trigger-provisioning', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              business_id: business.id
            })
          })
          
          if (response.ok) {
            console.log('[GettingStarted] Fallback provisioning triggered successfully')
            setHasTriggeredProvisioning(true)
            // Refresh business after a short delay to get updated status
            setTimeout(() => refreshBusiness(), 2000)
          } else {
            console.error('[GettingStarted] Fallback provisioning trigger failed')
          }
        } catch (error) {
          console.error('[GettingStarted] Error triggering fallback provisioning:', error)
        }
      }
    }
    
    triggerProvisioningIfNeeded()
  }, [business, hasTriggeredProvisioning, refreshBusiness])

  // Simple inline onboarding state computation to avoid initialization issues
  const onboardingState = useMemo(() => {
    const hasTrial = hasActiveTrial(business)
    const hasNumber = Boolean(business?.twilio_phone_number)
    const number = business?.twilio_phone_number ?? null
    const provisioningStatus = business?.provisioning_status ?? 'pending'
    
    return {
      hasTrial,
      hasNumber,
      number,
      provisioningStatus
    }
  }, [business])

  // Defensive fallback for missing business data
  if (!business) {
    console.log('[GettingStarted] Business not loaded, using default onboarding state')
    return null
  }

  // Simple onboarding state logic using direct business values
  const hasTrial = hasActiveTrial(business)
  const hasNumber = Boolean(business?.twilio_phone_number)
  const number = business?.twilio_phone_number ?? null
  const provisioningStatus = business?.provisioning_status ?? 'pending'
  const subscriptionActive = hasActiveAccess(business)
  const twilioReady = Boolean(business?.twilio_phone_number) && business?.provisioning_status === 'active'
  const forwardingSetupComplete = Boolean(business?.phone_setup_completed_at)
  const testComplete = business?.forwarding_verified

  let currentOnboardingState: OnboardingState = 'loading'
  
  if (!business) {
    currentOnboardingState = 'loading'
  } else if (!subscriptionActive) {
    currentOnboardingState = 'no_subscription'
  } else if (subscriptionActive && !twilioReady) {
    currentOnboardingState = 'provisioning_number'
  } else if (twilioReady && !forwardingSetupComplete) {
    currentOnboardingState = 'forwarding_needed'
  } else if (forwardingSetupComplete && !testComplete) {
    currentOnboardingState = 'testing_needed'
  } else {
    currentOnboardingState = 'active_ready'
  }

  const handleStartTrial = async () => {
    if (isHandlingBilling) return
    
    setIsHandlingBilling(true)
    console.log('[GettingStarted] Starting trial...')
    
    // Refresh business data to get latest provisioning state
    await refreshBusiness()
    try {
      console.log('[GettingStarted] Starting trial activation')
      const result = await handleBillingAction()
      
      if (result.success && result.url) {
        console.log('[GettingStarted] Redirecting to:', result.action)
        window.location.href = result.url
      } else {
        console.error('[GettingStarted] Billing action failed:', result.error)
        // If billing action fails, redirect to signup as fallback
        window.location.href = '/auth/signup'
      }
    } catch (error) {
      console.error('[GettingStarted] Trial activation error:', error)
      // Fallback to signup
      window.location.href = '/auth/signup'
    } finally {
      setIsHandlingBilling(false)
    }
  }

  // Calculate if all steps are complete based on computed state
  const isFullyComplete = useMemo(() => {
    return currentOnboardingState === 'active_ready'
  }, [currentOnboardingState])

  // Load collapse preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPreference = localStorage.getItem(COLLAPSE_PREFERENCE_KEY)
      if (savedPreference !== null) {
        setIsExpanded(savedPreference === 'false') // false means expanded
      }
    }
  }, [])

  // Save collapse preference to localStorage
  const saveCollapsePreference = (collapsed: boolean) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(COLLAPSE_PREFERENCE_KEY, collapsed.toString())
    }
  }

  // Auto-collapse logic
  useEffect(() => {
    const complete = isFullyComplete
    
    // Auto-collapse if complete and no user preference exists
    if (complete && typeof window !== 'undefined') {
      const savedPreference = localStorage.getItem(COLLAPSE_PREFERENCE_KEY)
      if (savedPreference === null) {
        setIsExpanded(false)
        saveCollapsePreference(true) // Save collapsed preference
      }
    }
  }, [business])

  // Listen for expandGettingStarted event from ProvisioningSuccessBanner
  useEffect(() => {
    const handleExpandGettingStarted = () => {
      console.log('[GettingStarted] Received expandGettingStarted event')
      setIsExpanded(true)
      saveCollapsePreference(false) // Save expanded preference
    }

    window.addEventListener('expandGettingStarted', handleExpandGettingStarted)
    
    return () => {
      window.removeEventListener('expandGettingStarted', handleExpandGettingStarted)
    }
  }, [])

  // Always emit all 4 onboarding steps with a per-step status. This gives users a
  // consistent, intentional progression instead of a checklist that grows
  // step-by-step as state changes.
  const getChecklistItems = (): ChecklistItem[] => {
    if (!business) return []

    const isTrialing = business.subscription_status === SUBSCRIPTION_STATES.TRIALING
    const isAuthenticated = !!business

    const trialDone = subscriptionActive
    const numberDone = trialDone && twilioReady
    const forwardingDone = Boolean(forwardingSetupComplete)
    const testDone = Boolean(testComplete)

    return [
      {
        id: 'trial',
        title: 'Start your free trial',
        description: 'Activate ReplyFlow so your missed-call system can run.',
        status: trialDone ? 'complete' : 'needs-action',
        details: trialDone
          ? (isTrialing ? '14-day free trial active' : 'Subscription active')
          : 'No charge today. Cancel anytime.',
        buttonText: trialDone
          ? 'Manage Billing'
          : (isHandlingBilling ? 'Processing…' : 'Start 14-Day Free Trial'),
        buttonOnClick: isAuthenticated ? handleStartTrial : undefined,
        buttonHref: isAuthenticated ? undefined : '/auth/signup',
      },
      {
        id: 'number',
        title: 'Get your ReplyFlow number',
        description: 'A dedicated local number is provisioned for your business.',
        status: numberDone ? 'complete' : (trialDone ? 'needs-action' : 'needs-action'),
        details: numberDone
          ? `Your ReplyFlow number: ${formatPhoneNumber(business.twilio_phone_number || '')}`
          : (trialDone ? 'Provisioning your dedicated number…' : 'Available after trial activation'),
      },
      {
        id: 'forwarding',
        title: 'Forward your calls',
        description: 'Forward missed calls from your business phone to ReplyFlow.',
        status: forwardingDone ? 'complete' : 'needs-action',
        details: forwardingDone
          ? 'Your business phone is now connected to ReplyFlow.'
          : (numberDone ? 'Follow the carrier-specific instructions to enable forwarding' : 'Available once your number is ready'),
        buttonText: numberDone && !forwardingDone ? 'View Setup Instructions' : undefined,
        buttonHref: numberDone && !forwardingDone ? '/onboarding/phone-setup' : undefined,
      },
      {
        id: 'test',
        title: 'Test your setup',
        description: 'Call your business number once to verify ReplyFlow is capturing missed calls correctly.',
        status: testDone ? 'complete' : 'needs-action',
        details: testDone
          ? 'Setup tested successfully'
          : (forwardingDone ? 'Takes about 30 seconds' : 'Available once forwarding is enabled'),
        buttonText: forwardingDone && !testDone ? 'Test My Setup' : undefined,
        buttonHref: forwardingDone && !testDone ? '/dashboard/test-setup' : undefined,
      },
    ]
  }

  const checklistItems = getChecklistItems()

  // Check if we should auto-collapse completed items
  const shouldAutoCollapseCompleted = useMemo(() => {
    if (!business) return false
    
    const hasTrial = hasActiveTrial(business)
    const hasNumber = business.twilio_phone_number && business.twilio_phone_number !== null
    
    return hasTrial && hasNumber
  }, [business])

  // Separate completed and incomplete items
  const completedItems = checklistItems.filter(item => item.status === 'complete')
  const incompleteItems = checklistItems.filter(item => item.status !== 'complete')

  const handleToggle = () => {
    setIsAnimating(true)
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    saveCollapsePreference(!newExpanded) // Save new collapsed state
    if (onToggle) onToggle()
    
    // Reset animation state after transition completes
    setTimeout(() => setIsAnimating(false), 300)
  }

  const complete = isFullyComplete

  // Show loading state while onboarding state is resolving
  if (currentOnboardingState === 'loading') {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-transparent dark:bg-slate-900/20 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
          <div className="flex-1">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4" />
          </div>
        </div>
      </div>
    )
  }

  // Compact complete collapsed state
  if (complete && !isExpanded) {
    return (
      <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-transparent dark:bg-green-900/20 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-green-800 dark:text-green-200">
                Getting Started
              </h2>
              <p className="text-sm text-green-700 dark:text-green-300">
                All setup steps complete!
              </p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 transition-colors"
            aria-expanded={isExpanded}
            aria-label="Toggle getting started checklist"
          >
            <svg
              className="w-5 h-5 transition-transform duration-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // Numbered onboarding checklist with progress bar.
  const totalSteps = checklistItems.length
  const doneSteps = checklistItems.filter(i => i.status === 'complete').length
  const progressPct = totalSteps === 0 ? 0 : Math.round((doneSteps / totalSteps) * 100)

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-5 sm:p-6">
      {/* Header with progress */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100">
              {complete ? 'Setup Complete' : 'Setup Progress'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {complete ? 'All steps completed' : 'Almost ready — one quick test left'}
            </p>
            {!complete && (
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                {doneSteps} of {totalSteps} steps completed
              </p>
            )}
            {!complete && doneSteps === 3 && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">
                You're one quick test away from going live.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleToggle}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors flex-shrink-0"
            aria-expanded={isExpanded}
            aria-label="Toggle setup checklist"
          >
            <svg
              className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ease-out ${complete ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`}
            style={{ width: `${progressPct}%` }}
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            role="progressbar"
          />
        </div>
      </div>

      {isExpanded && (
        <ol className="space-y-3">
          {checklistItems.map((item, idx) => {
            const stepNum = idx + 1
            const isComplete = item.status === 'complete'
            const isCurrent = !isComplete && checklistItems.findIndex(i => i.status !== 'complete') === idx
            return (
              <li
                key={item.id}
                className={`flex items-start gap-4 p-4 rounded-xl border transition-colors ${
                  isComplete
                    ? 'bg-green-50/40 dark:bg-green-900/5 border-green-200/60 dark:border-green-800/30'
                    : isCurrent
                      ? 'bg-blue-50/60 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50'
                      : 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50'
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {isComplete ? (
                    <div className="w-8 h-8 rounded-full bg-green-600/80 flex items-center justify-center text-white">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : (
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                        isCurrent
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {stepNum}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <h3 className={`text-sm sm:text-base font-semibold ${
                      isComplete
                        ? 'text-green-800/80 dark:text-green-200/70'
                        : isCurrent
                          ? 'text-slate-900 dark:text-slate-100'
                          : 'text-slate-900 dark:text-slate-100'
                    }`}>
                      Step {stepNum} — {item.title}
                    </h3>
                    <span
                      className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${
                        isComplete
                          ? 'bg-green-100/60 text-green-700/80 dark:bg-green-900/30 dark:text-green-300/70'
                          : isCurrent
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {isComplete ? 'Done' : isCurrent ? 'Current' : 'Upcoming'}
                    </span>
                  </div>
                  <p className={`text-sm mb-2 ${
                    isComplete
                      ? 'text-slate-600/70 dark:text-slate-400/60'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}>
                    {item.description}
                  </p>
                  {item.details && (
                    <p className={`text-xs mb-3 ${
                      isComplete
                        ? 'text-slate-500/60 dark:text-slate-500/50'
                        : 'text-slate-500 dark:text-slate-500'
                    }`}>
                      {item.details}
                    </p>
                  )}
                  {item.buttonText && (item.buttonOnClick || item.buttonHref) && (
                    item.buttonOnClick ? (
                      <button
                        onClick={item.buttonOnClick}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {item.buttonText}
                      </button>
                    ) : (
                      <Link
                        href={item.buttonHref!}
                        className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {item.buttonText}
                      </Link>
                    )
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
