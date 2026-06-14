'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { getReplyFlowPhoneNumberDisplay } from '@/lib/utils'
import { hasActiveAccess, hasActiveTrial, isForwardingComplete } from '@/lib/subscription-utils'
import { 
  hasValidSubscription,
  SUBSCRIPTION_STATES 
} from '@/lib/subscription'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber } from '@/lib/utils'
import { Circle, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { handleBillingAction } from '@/lib/billing'
import { usePathname } from 'next/navigation'
import { Business } from '@/lib/types'
import { deriveSetupState } from '@/lib/setup-state'
import CompletedMonitoringCard from './CompletedMonitoringCard'
import OperationalStatusCard from '@/components/OperationalStatusCard'
import SetupReviewPanel from '@/components/SetupReviewPanel'
import BusinessSnapshot from '@/components/BusinessSnapshot'
import OperationalTrustIndicators from '@/components/OperationalTrustIndicators'
import TestReplyFlowModal from '@/components/TestReplyFlowModal'

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
  status: 'complete' | 'needs-action' | 'not-tested-yet' | 'action-needed'
  buttonText?: string
  buttonHref?: string
  buttonOnClick?: () => void
  secondaryButtonText?: string
  secondaryButtonOnClick?: () => void
  secondaryButtonHref?: string
  details?: string
}

interface SetupProgressProps {
  missedCallCount?: number
  setupHealth?: import('@/lib/setup-health').SetupHealth
}

// Local storage key for collapse preference
const COLLAPSE_PREFERENCE_KEY = 'setupProgressCollapsed'

export default function SetupProgress({ missedCallCount = 0, setupHealth }: SetupProgressProps) {
  const { business, refreshBusiness } = useBusiness()
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isCompletingForwarding, setIsCompletingForwarding] = useState(false)
  const [optimisticBusinessState, setOptimisticBusinessState] = useState<Business | null>(null)
  const [isHandlingBilling, setIsHandlingBilling] = useState(false)
  const [hasTriggeredProvisioning, setHasTriggeredProvisioning] = useState(false)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [realCallDataExists, setRealCallDataExists] = useState(false)
  const [showSetupReviewPanel, setShowSetupReviewPanel] = useState(false)
  const [showTestModal, setShowTestModal] = useState(false)
  const cardRefs = useRef<{ [key: string]: HTMLLIElement | null }>({})

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Auto-expand current step on mobile when setup is expanded (must be before early return)
  useEffect(() => {
    if (!isMobile || !business || !isExpanded) return
    
    // Calculate current incomplete step from business data
    const subscriptionActive = hasActiveAccess(business)
    const twilioReady = Boolean(business?.twilio_phone_number) && business?.provisioning_status === 'completed'
    const replyFlowReadyDone = subscriptionActive && twilioReady
    const forwardingSetupComplete = isForwardingComplete(business)
    const testComplete = business?.forwarding_verified || realCallDataExists
    
    // Determine which step should be expanded
    if (!subscriptionActive) {
      // Step 1: ReplyFlow ready - auto-expand on mobile
      setExpandedCardId('ready')
    } else if (!replyFlowReadyDone) {
      // Step 1: ReplyFlow ready - auto-expand on mobile
      setExpandedCardId('ready')
    } else if (!forwardingSetupComplete) {
      // Step 2: Forwarding - auto-expand on mobile
      setExpandedCardId('forwarding')
    } else if (!testComplete) {
      // Step 3: Test - auto-expand on mobile
      setExpandedCardId('test')
    }
  }, [isMobile, business, realCallDataExists, isExpanded])

  // Check for real call data to auto-complete setup
  useEffect(() => {
    const checkRealCallData = async () => {
      if (!business?.id || business.forwarding_verified) return

      try {
        const supabase = createBrowserClient()
        
        // Check for any real call events
        const { count: callEventsCount, error: callEventsError } = await supabase
          .from('call_events')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)
        
        // Check for any leads
        const { count: leadsCount, error: leadsError } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)
        
        // Check for any conversations
        const { count: conversationsCount, error: conversationsError } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)

        if (callEventsError || leadsError || conversationsError) {
          console.error('[Setup Progress] Error checking real data:', { callEventsError, leadsError, conversationsError })
          return
        }

        const hasRealData = (callEventsCount || 0) > 0 || (leadsCount || 0) > 0 || (conversationsCount || 0) > 0

        // Auto-repair: update business record to mark forwarding as verified
        if (hasRealData && !business.forwarding_verified && realCallDataExists === false) {
          const { error: updateError } = await supabase
            .from('businesses')
            .update({ 
              forwarding_verified: true, 
              forwarding_verified_at: new Date().toISOString(),
              onboarding_status: 'completed'
            })
            .eq('id', business.id)

          if (updateError) {
            console.error('[Setup Progress] Auto-repair failed:', updateError)
          } else {
            // Refresh business to get updated state
            refreshBusiness()
          }
        }
      } catch (error) {
        console.error('[Setup Progress] Error checking real call data:', error)
      }
    }

    checkRealCallData()
  }, [business?.id, business?.forwarding_verified, refreshBusiness])

  const currentOnboardingState = useMemo(() => {
    if (!business) return 'loading'
    const subscriptionActive = hasActiveAccess(business)
    const twilioReady = Boolean(business?.twilio_phone_number) && business?.provisioning_status === 'completed'
    const forwardingSetupComplete = isForwardingComplete(business)
    // Use setupHealth forwardingVerified (no recalculation)
    const testComplete = setupHealth?.forwardingVerified === true
    
    if (!subscriptionActive) return 'no_subscription'
    if (!twilioReady) return 'provisioning_number'
    if (!forwardingSetupComplete) return 'forwarding_needed'
    if (!testComplete) return 'testing_needed'
    return 'active_ready'
  }, [business, pathname, realCallDataExists, missedCallCount])

  // Calculate if all steps are complete based on computed state
  const isFullyComplete = useMemo(() => {
    return currentOnboardingState === 'active_ready'
  }, [currentOnboardingState])

  // When onboarding is complete, collapse by default
  useEffect(() => {
    if (currentOnboardingState === 'active_ready') {
      setIsExpanded(false)
      saveCollapsePreference(true)
    }
  }, [currentOnboardingState])

  // Fallback provisioning trigger on component mount
  useEffect(() => {
    const triggerProvisioningIfNeeded = async () => {
      if (!business || hasTriggeredProvisioning) return
      
      const shouldTrigger = 
        hasActiveAccess(business) &&
        !business.twilio_phone_number_sid &&
        business.provisioning_status !== 'provisioning'
      
      if (shouldTrigger) {
        console.log('[SetupProgress] Triggering fallback provisioning for business:', business.id)
        try {
          const response = await fetch('/api/business/trigger-provisioning', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ businessId: business.id })
          })
          
          if (!response.ok) {
            console.error('[SetupProgress] Failed to trigger provisioning:', response.statusText)
          }
        } catch (error) {
          console.error('[SetupProgress] Error triggering provisioning:', error)
        } finally {
          setHasTriggeredProvisioning(true)
        }
      }
    }

    triggerProvisioningIfNeeded()
  }, [business, hasTriggeredProvisioning])

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

  const getCurrentBusiness = () => {
    // During forwarding completion, prefer optimistic state to prevent rollback
    if (isCompletingForwarding && optimisticBusinessState) {
      return optimisticBusinessState
    }
    return optimisticBusinessState || business
  }

  // Simple onboarding state logic using shared state resolver
  const currentBusiness = getCurrentBusiness()
  const setupState = deriveSetupState(currentBusiness, realCallDataExists, missedCallCount)

  // Legacy variables for compatibility (will be phased out)
  const subscriptionActive = hasActiveAccess(currentBusiness)
  const twilioReady = Boolean(currentBusiness?.twilio_phone_number) && currentBusiness?.provisioning_status === 'completed'
  const forwardingSetupComplete = isForwardingComplete(currentBusiness)
  const testComplete = setupState.step3Complete
  const provisioningStatus = currentBusiness?.provisioning_status ?? 'pending'

  const handleCompleteForwarding = async () => {
    const currentBusiness = getCurrentBusiness()
    if (!currentBusiness?.id) return

    setIsCompletingForwarding(true)
    setOptimisticBusinessState({
      ...currentBusiness,
      forwarding_verified: true,
      phone_setup_completed_at: new Date().toISOString()
    })

    try {
      const response = await fetch('/api/business/update-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          businessId: currentBusiness.id,
          callForwardingEnabled: true,
          forwardingVerified: true,
          phoneSetupCompletedAt: new Date().toISOString()
        })
      })

      if (!response.ok) {
        throw new Error('Failed to complete forwarding setup')
      }

      console.log('[SetupProgress] Forwarding setup completed successfully')
      await refreshBusiness()
    } catch (error) {
      console.error('[SetupProgress] Error completing forwarding setup:', error)
      // Revert optimistic state on error
      setOptimisticBusinessState(currentBusiness)
    } finally {
      setIsCompletingForwarding(false)
    }
  }

  const handleCardToggle = (cardId: string) => {
    setExpandedCardId(expandedCardId === cardId ? null : cardId)
    
    // Scroll into view when expanded
    setTimeout(() => {
      const cardElement = cardRefs.current[cardId]
      if (cardElement && expandedCardId !== cardId) {
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }

  const complete = isFullyComplete
  const isOnTestStep = currentOnboardingState === 'testing_needed'

  // Show loading state while onboarding state is resolving
  if (currentOnboardingState === 'loading') {
    return (
      <div className="rounded-2xl border border-border bg-transparent p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-muted rounded-full animate-pulse" />
          <div className="flex-1">
            <div className="h-5 bg-muted rounded animate-pulse mb-2" />
            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
          </div>
        </div>
      </div>
    )
  }

  // Compact success banner for completed setup - Hide completely since OperationalStatusCard shows status
  if (complete) {
    return null
  }

  // Generate checklist items based on current state
  const checklistItems: ChecklistItem[] = [
    {
      id: 'ready',
      title: 'ReplyFlow Number Ready',
      description: 'Your dedicated ReplyFlow number is active and ready to receive missed calls.',
      status: subscriptionActive && twilioReady ? 'complete' : 'needs-action',
      buttonText: (!subscriptionActive && !twilioReady) ? 'Start Free Trial' : (!subscriptionActive ? 'Upgrade Plan' : undefined),
      buttonHref: (!subscriptionActive && !twilioReady) ? '/pricing' : (!subscriptionActive ? '/billing' : undefined),
      details: currentBusiness?.twilio_phone_number ? `Number: ${getReplyFlowPhoneNumberDisplay(currentBusiness)}` : undefined
    },
    {
      id: 'forwarding',
      title: 'Call Forwarding Connected',
      description: 'Forward your business phone to ReplyFlow to start capturing missed calls.',
      status: forwardingSetupComplete ? 'complete' : (subscriptionActive && twilioReady ? 'needs-action' : 'not-tested-yet'),
      buttonText: forwardingSetupComplete ? undefined : (subscriptionActive && twilioReady ? 'Setup Call Forwarding' : undefined),
      buttonHref: forwardingSetupComplete ? undefined : (subscriptionActive && twilioReady ? '/setup/phone-forwarding' : undefined),
      secondaryButtonText: forwardingSetupComplete ? 'Review Forwarding Setup' : undefined,
      secondaryButtonHref: forwardingSetupComplete ? '/setup/phone-forwarding?mode=review' : undefined,
      details: forwardingSetupComplete 
        ? `Verified • Carrier: ${currentBusiness?.business_phone_carrier || 'Not set'} • ReplyFlow: ${currentBusiness?.twilio_phone_number ? formatPhoneNumber(currentBusiness.twilio_phone_number) : 'Loading...'}`
        : (currentBusiness?.business_phone_carrier ? `Carrier: ${currentBusiness.business_phone_carrier}` : undefined)
    },
    {
      id: 'test',
      title: 'Test Your Setup',
      description: 'Call your business phone from another phone. Let it ring until it forwards to ReplyFlow. ReplyFlow will answer and automatically verify your setup.',
      status: testComplete ? 'complete' : (forwardingSetupComplete ? 'needs-action' : 'not-tested-yet'),
      buttonText: testComplete ? undefined : (forwardingSetupComplete ? 'How to Test Setup' : undefined),
      buttonOnClick: testComplete ? undefined : (forwardingSetupComplete ? () => setShowTestModal(true) : undefined),
      secondaryButtonText: testComplete ? 'View Test Instructions' : undefined,
      secondaryButtonOnClick: testComplete ? () => setShowTestModal(true) : undefined
    }
  ]

  const handleToggle = () => {
    setIsAnimating(true)
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    saveCollapsePreference(!newExpanded) // Save new collapsed state
    
    // Reset animation state after transition completes
    setTimeout(() => setIsAnimating(false), 300)
  }

  const incompleteItems = checklistItems.filter(item => item.status !== 'complete')
  const doneSteps = checklistItems.filter(i => i.status === 'complete').length
  const totalSteps = checklistItems.length

  return (
    <div className="rounded-xl border border-border bg-transparent p-3 sm:p-4 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 sm:mb-1.5">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">
              Setup Progress
            </h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium ${
              incompleteItems.length === 0
                ? 'bg-green-900/20 dark:bg-green-900/30 border border-green-900/30 dark:border-green-800/30 text-green-700 dark:text-green-300'
                : incompleteItems.some(item => item.status === 'action-needed')
                  ? 'bg-amber-900/20 dark:bg-amber-900/30 border border-amber-900/30 dark:border-amber-800/30 text-amber-700 dark:text-amber-300'
                  : 'bg-blue-900/20 dark:bg-blue-900/30 border border-blue-900/30 dark:border-blue-800/30 text-blue-700 dark:text-blue-300'
            }`}>
              {doneSteps} of {totalSteps} steps complete
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {incompleteItems.length === 0 
              ? 'ReplyFlow is ready to use!'
              : incompleteItems.some(item => item.status === 'action-needed')
                  ? 'Action needed to complete setup'
                  : 'Complete setup to start capturing missed calls'
            }
          </p>
        </div>
        <OperationalTrustIndicators />
        <button
          onClick={handleToggle}
          className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-all duration-200"
          aria-expanded={isExpanded}
          aria-label="Toggle setup checklist"
        >
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-3 sm:mb-4">
        <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
          <div
            className="bg-blue-600 h-1 transition-all duration-500 ease-out"
            style={{ width: `${Math.round((doneSteps / totalSteps) * 100)}%` }}
          />
        </div>
      </div>

      {/* Checklist items */}
      {isExpanded && (
        <ul className="space-y-1 sm:space-y-2">
          {checklistItems.map((item, idx) => {
            const stepNum = idx + 1
            const isComplete = item.status === 'complete'
            const isActionNeeded = item.status === 'action-needed'
            const isCurrent = !complete && !isComplete && !isActionNeeded && checklistItems.findIndex(i => i.status !== 'complete' && i.status !== 'action-needed') === idx
            const isExpandedCard = expandedCardId === item.id
            const isForwardingCard = item.id === 'forwarding'

            return (
              <li
                key={item.id}
                ref={(el) => { cardRefs.current[item.id] = el }}
                onClick={() => isForwardingCard && (isComplete || !isComplete && (isCurrent || isActionNeeded)) && handleCardToggle(item.id)}
                className={`flex items-start gap-3 sm:gap-4 p-3 sm:p-3.5 rounded-xl border transition-all duration-300 ${
                  isComplete
                    ? 'bg-green-50/30 dark:bg-green-900/5 border-green-200/40 dark:border-green-800/20'
                    : isActionNeeded
                      ? 'bg-amber-50/30 dark:bg-amber-900/10 border-amber-200/40 dark:border-amber-800/20'
                      : isCurrent
                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200/60 dark:border-blue-700/40 hover:border-blue-300 dark:hover:border-blue-600'
                        : 'bg-muted/50 border-border'
                } ${isForwardingCard && (isComplete || !isComplete && (isCurrent || isActionNeeded)) ? 'cursor-pointer hover:bg-blue-100/60 dark:hover:bg-blue-900/20' : ''}`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {isComplete ? (
                    <div className="w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-green-600 flex items-center justify-center">
                      <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : isActionNeeded ? (
                    <div className="w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-amber-600 flex items-center justify-center">
                      <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                  ) : isCurrent ? (
                    <div className="w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-xs sm:text-sm font-medium">{stepNum}</span>
                    </div>
                  ) : (
                    <div className="w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-muted border-2 border-muted-foreground/30 flex items-center justify-center">
                      <span className="text-muted-foreground/50 text-xs sm:text-sm font-medium">{stepNum}</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-foreground">{item.title}</h4>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium ${
                      isComplete
                        ? 'bg-green-900/20 dark:bg-green-900/30 border border-green-900/30 dark:border-green-800/30 text-green-700 dark:text-green-300'
                        : isActionNeeded
                          ? 'bg-amber-900/20 dark:bg-amber-900/30 border border-amber-900/30 dark:border-amber-800/30 text-amber-700 dark:text-amber-300'
                          : isCurrent
                            ? 'bg-blue-900/20 dark:bg-blue-900/30 border border-blue-900/30 dark:border-blue-800/30 text-blue-700 dark:text-blue-300'
                            : 'bg-muted/50 border-border text-muted-foreground'
                    }`}>
                      {isComplete ? 'DONE' : isActionNeeded ? 'ACTION NEEDED' : isCurrent ? 'IN PROGRESS' : 'NOT STARTED'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                  {item.details && (
                    <div className="text-xs text-muted-foreground mb-3">{item.details}</div>
                  )}

                  {/* Action buttons */}
                  {(item.buttonText || item.secondaryButtonText) && (
                    <div className="flex flex-wrap gap-2">
                      {item.buttonText && (
                        item.buttonHref ? (
                          <Link
                            href={item.buttonHref}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-colors text-xs sm:text-sm font-medium"
                          >
                            {item.buttonText}
                          </Link>
                        ) : item.buttonOnClick ? (
                          <button
                            onClick={item.buttonOnClick}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-colors text-xs sm:text-sm font-medium"
                          >
                            {item.buttonText}
                          </button>
                        ) : null
                      )}
                      {item.secondaryButtonText && (
                        item.secondaryButtonHref ? (
                          <Link
                            href={item.secondaryButtonHref}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors text-xs sm:text-sm font-medium"
                          >
                            {item.secondaryButtonText}
                          </Link>
                        ) : item.secondaryButtonOnClick ? (
                          <button
                            onClick={item.secondaryButtonOnClick}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors text-xs sm:text-sm font-medium"
                          >
                            {item.secondaryButtonText}
                          </button>
                        ) : null
                      )}
                    </div>
                  )}

                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Test ReplyFlow Modal */}
      <TestReplyFlowModal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
      />
    </div>
  )
}
