'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { getReplyFlowPhoneNumberDisplay } from '@/lib/utils'
import { 
  hasValidSubscription,
  SUBSCRIPTION_STATES 
} from '@/lib/subscription'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber } from '@/lib/utils'
import { hasActiveAccess, hasActiveTrial } from '@/lib/subscription-utils'
import { Circle, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { handleBillingAction } from '@/lib/billing'
import { usePathname } from 'next/navigation'

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
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(propExpanded || false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isHandlingBilling, setIsHandlingBilling] = useState(false)
  const [hasTriggeredProvisioning, setHasTriggeredProvisioning] = useState(false)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [realCallDataExists, setRealCallDataExists] = useState(false)
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

  // Auto-expand current step on mobile (must be before early return)
  useEffect(() => {
    if (!isMobile || !business) return
    
    // Calculate current incomplete step from business data
    const subscriptionActive = hasActiveAccess(business)
    const twilioReady = Boolean(business?.twilio_phone_number) && business?.provisioning_status === 'active'
    const forwardingSetupComplete = Boolean(business?.phone_setup_completed_at)
    const testComplete = business?.forwarding_verified || realCallDataExists
    
    // Determine which step should be expanded
    if (!subscriptionActive) {
      // Step 1: Trial - don't auto-expand
      return
    } else if (!twilioReady) {
      // Step 2: Number - auto-expand on mobile
      setExpandedCardId('number')
    } else if (!forwardingSetupComplete) {
      // Step 3: Forwarding - auto-expand on mobile
      setExpandedCardId('forwarding')
    } else if (!testComplete) {
      // Step 4: Test - auto-expand on mobile
      setExpandedCardId('test')
    }
  }, [isMobile, business, realCallDataExists])

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

  // Calculate trial days remaining - must be before early returns
  const trialDaysRemaining = useMemo(() => {
    if (!business?.trial_ends_at) return null
    const trialEnd = new Date(business.trial_ends_at)
    const now = new Date()
    const diffTime = trialEnd.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }, [business?.trial_ends_at])

  const isInTrial = hasActiveTrial(business)

  // If user is on dashboard, don't force them back to phone-setup even if forwarding is not complete
  // This allows users to click "Finish later" on Step 4 and stay on dashboard
  const isOnDashboard = pathname === '/dashboard'

  // Check if Step 4 should be complete based on real DB state
  // Step 4 is complete if ANY of these are true:
  // - business.forwarding_verified === true
  // - business.forwarding_verified_at is not null
  // - at least one call_event exists for business_id
  // - at least one lead exists for business_id created by missed call
  // - at least one conversation exists from call flow
  useEffect(() => {
    if (!business?.id) return

    const checkRealCallData = async () => {
      try {
        const supabase = createBrowserClient()
        
        // Check for call_events
        const { count: callEventsCount } = await supabase
          .from('call_events')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)

        // Check for leads (non-demo)
        const { count: leadsCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)
          .eq('is_demo', false)

        // Check for conversations
        const { count: conversationsCount } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)

        const hasRealData = (callEventsCount || 0) > 0 || (leadsCount || 0) > 0 || (conversationsCount || 0) > 0

        console.log('[Setup Progress] Step 4 real DB state check:', {
          businessId: business.id,
          forwarding_verified: business.forwarding_verified,
          forwarding_verified_at: business.forwarding_verified_at,
          callEventsCount,
          leadsCount,
          conversationsCount,
          hasRealData,
          step4Complete: business.forwarding_verified || hasRealData
        })

        setRealCallDataExists(hasRealData)

        // Auto-repair: if real data exists but forwarding_verified is false, update it
        if (hasRealData && !business.forwarding_verified) {
          console.log('[Setup Progress] Auto-repair: marking forwarding_verified for business with real call data:', business.id)
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
            console.log('[Setup Progress] Auto-repair successful for business:', business.id)
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
    const twilioReady = Boolean(business?.twilio_phone_number) && business?.provisioning_status === 'active'
    const forwardingSetupComplete = Boolean(business?.phone_setup_completed_at)
    // Step 4 is complete if forwarding_verified OR if real call data exists
    const testComplete = business?.forwarding_verified || realCallDataExists
    
    console.log('[Setup Progress] Step 4 completion check:', {
      businessId: business.id,
      forwarding_verified: business?.forwarding_verified,
      realCallDataExists,
      testComplete
    })
    
    if (!subscriptionActive) return 'no_subscription'
    if (!twilioReady) return 'provisioning_number'
    // If user is on dashboard, treat as testing_needed to avoid showing phone-setup button
    if (isOnDashboard) return 'testing_needed'
    if (!forwardingSetupComplete) return 'forwarding_needed'
    if (!testComplete) return 'testing_needed'
    return 'active_ready'
  }, [business, isOnDashboard, realCallDataExists])

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
  }, [business, isFullyComplete])

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

  // Check if we should auto-collapse completed items
  const shouldAutoCollapseCompleted = useMemo(() => {
    if (!business) return false
    
    const hasTrial = hasActiveTrial(business)
    const hasNumber = business.twilio_phone_number && business.twilio_phone_number !== null
    
    return hasTrial && hasNumber
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
        // If billing action fails, stay on dashboard and show error
        setIsHandlingBilling(false)
        alert(result.error || 'Failed to start trial. Please try again.')
      }
    } catch (error) {
      console.error('[GettingStarted] Trial activation error:', error)
      // Stay on dashboard and show error
      setIsHandlingBilling(false)
      alert('Failed to start trial. Please try again.')
    } finally {
      setIsHandlingBilling(false)
    }
  }

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
        // Always show button when number is ready and forwarding is not complete
        buttonText: numberDone && !forwardingDone ? 'Set Up Call Forwarding' : undefined,
        buttonHref: numberDone && !forwardingDone ? '/setup/phone-forwarding' : undefined,
      },
      {
        id: 'test',
        title: 'Test your setup',
        description: 'Call your business number once to verify ReplyFlow is capturing missed calls correctly.',
        status: testDone ? 'complete' : 'needs-action',
        details: testDone
          ? 'Setup tested successfully'
          : (forwardingDone ? 'Takes about 30 seconds' : 'Available once forwarding is enabled'),
        buttonText: forwardingDone && !testDone ? 'Complete Final Test' : undefined,
        buttonHref: forwardingDone && !testDone ? '/dashboard/test-setup' : undefined,
      },
    ]
  }

  const checklistItems = getChecklistItems()

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
    <div className={`rounded-2xl border p-3 sm:p-5 ${!complete ? 'border-border bg-card shadow-sm' : 'border-green-200/50 dark:border-green-800/50 bg-green-50/30 dark:bg-green-900/20'}`}>
      {/* Horizontal layout: left text, right CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-2 sm:mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">
              {complete ? 'Setup Complete ✓' : 'Setup Progress'}
            </h2>
            {/* Trial badge - only show when in trial and onboarding incomplete */}
            {!complete && isInTrial && trialDaysRemaining !== null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-900/20 dark:bg-blue-900/30 border border-blue-900/30 dark:border-blue-800/30 text-[10px] sm:text-[11px] font-medium text-blue-700 dark:text-blue-300">
                Free Trial • {trialDaysRemaining} {trialDaysRemaining === 1 ? 'day' : 'days'} left
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {complete ? 'All steps completed' : 'Almost ready — one quick test left'}
          </p>
          {!complete && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {doneSteps} of {totalSteps} steps completed
            </p>
          )}
        </div>
        {!complete && doneSteps === 3 && (
          <Link
            href="/dashboard/test-setup"
            className="inline-flex items-center px-4 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm sm:text-sm font-medium rounded-lg transition-colors shadow-sm flex-shrink-0"
          >
            Complete Final Test
          </Link>
        )}
        {complete && (
          <button
            onClick={handleToggle}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
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
        )}
        {!complete && (
          <button
            onClick={handleToggle}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent hover:border-border rounded-lg transition-all duration-200 active:scale-95"
            aria-expanded={isExpanded}
            aria-label="Toggle setup checklist"
          >
            <span>{isExpanded ? 'Hide steps' : 'View steps'}</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Slim progress bar */}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-2">
        <div
          className={`h-full transition-all duration-500 ease-out ${complete ? 'bg-gradient-to-r from-green-500/90 to-emerald-500/90' : 'bg-gradient-to-r from-blue-500/90 to-indigo-500/90'}`}
          style={{ width: `${progressPct}%` }}
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>

      {isExpanded && (
        <ol className="space-y-3">
          {checklistItems.map((item, idx) => {
            const stepNum = idx + 1
            const isComplete = item.status === 'complete'
            const isCurrent = !isComplete && checklistItems.findIndex(i => i.status !== 'complete') === idx
            const isExpanded = expandedCardId === item.id
            const isForwardingCard = item.id === 'forwarding'
            
            return (
              <li
                key={item.id}
                ref={(el) => { cardRefs.current[item.id] = el }}
                onClick={() => isForwardingCard && !isComplete && handleCardToggle(item.id)}
                className={`flex items-start gap-4 p-3 sm:p-4 rounded-xl border transition-all duration-300 ${
                  isComplete
                    ? 'bg-green-50/30 dark:bg-green-900/5 border-green-200/40 dark:border-green-800/20'
                    : isCurrent
                      ? 'bg-blue-50/70 dark:bg-blue-900/15 border-blue-300 dark:border-blue-700/60 shadow-sm cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md'
                      : 'bg-muted/50 border-border'
                } ${isForwardingCard && !isComplete ? 'cursor-pointer hover:bg-blue-100/80 dark:hover:bg-blue-900/25' : ''}`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {isComplete ? (
                    <div className="w-7 h-7 rounded-full bg-green-600/70 flex items-center justify-center text-white">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : (
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-muted text-muted-foreground'
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
                        ? 'text-green-800/60 dark:text-green-200/50'
                        : 'text-foreground'
                    }`}>
                      Step {stepNum} — {item.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${
                          isComplete
                            ? 'bg-green-100/50 text-green-700/60 dark:bg-green-900/20 dark:text-green-300/50'
                            : isCurrent
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {isComplete ? 'Done' : isCurrent ? 'Current' : 'Upcoming'}
                      </span>
                      {isForwardingCard && !isComplete && (
                        <div className="flex-shrink-0">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className={`text-xs sm:text-sm mb-1.5 ${
                    isComplete
                      ? 'text-muted-foreground/60'
                      : 'text-muted-foreground'
                  }`}>
                    {item.description}
                  </p>
                  {item.details && (
                    <p className={`text-[11px] mb-2 ${
                      isComplete
                        ? 'text-muted-foreground/50'
                        : 'text-muted-foreground'
                    }`}>
                      {item.details}
                    </p>
                  )}
                  {item.buttonText && (item.buttonOnClick || item.buttonHref) && (
                    <div className="mt-3">
                      {item.buttonOnClick ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            item.buttonOnClick!()
                          }}
                          className={`w-full sm:w-auto px-4 py-3 sm:py-2.5 text-sm font-medium rounded-lg transition-colors ${
                            isCurrent
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                              : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                          }`}
                        >
                          {item.buttonText}
                        </button>
                      ) : (
                        <Link
                          href={item.buttonHref!}
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-block w-full sm:w-auto px-4 py-3 sm:py-2.5 text-sm font-medium rounded-lg transition-colors ${
                            isCurrent
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                              : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                          }`}
                        >
                          {item.buttonText}
                        </Link>
                      )}
                    </div>
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
