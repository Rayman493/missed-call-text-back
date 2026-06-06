'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { getReplyFlowPhoneNumberDisplay } from '@/lib/utils'
import { hasActiveAccess, hasActiveTrial } from '@/lib/subscription-utils'
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

interface GettingStartedProps {
  isExpanded?: boolean
  onToggle?: () => void
  isOnboardingComplete?: boolean
  missedCallCount?: number
}

// Local storage key for collapse preference
const COLLAPSE_PREFERENCE_KEY = 'gettingStartedCollapsed'

export default function GettingStarted({ isExpanded: propExpanded, onToggle, isOnboardingComplete, missedCallCount = 0 }: GettingStartedProps) {
  console.log('[GettingStarted] Component render -', new Date().toISOString())
  const { business, refreshBusiness } = useBusiness()
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(propExpanded || false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isCompletingForwarding, setIsCompletingForwarding] = useState(false)
  const [optimisticBusinessState, setOptimisticBusinessState] = useState<Business | null>(null)
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

  // Auto-expand current step on mobile when setup is expanded (must be before early return)
  useEffect(() => {
    if (!isMobile || !business || !isExpanded) return
    
    // Calculate current incomplete step from business data
    const subscriptionActive = hasActiveAccess(business)
    const twilioReady = Boolean(business?.twilio_phone_number) && business?.provisioning_status === 'active'
    const replyFlowReadyDone = subscriptionActive && twilioReady
    const forwardingSetupComplete = Boolean(business?.phone_setup_completed_at)
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

  // Fallback provisioning trigger on component mount
  useEffect(() => {
    const triggerProvisioningIfNeeded = async () => {
      if (!business || hasTriggeredProvisioning) return
      
      const shouldTrigger = 
        hasActiveAccess(business) &&
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

        // Log onboarding completion event
        if (hasRealData && !business.forwarding_verified && realCallDataExists === false) {
          console.log('[ONBOARDING COMPLETE]', {
            businessId: business.id,
            reason: 'Real data detected (missed call processed)',
            leadId: leadsCount > 0 ? 'existing' : 'unknown',
            conversationId: conversationsCount > 0 ? 'existing' : 'unknown',
            callEventsCount,
            leadsCount,
            conversationsCount
          })
        }

        setRealCallDataExists(hasRealData)

        // Auto-repair: if real data exists but forwarding_verified is false, update it
        if (hasRealData && !business.forwarding_verified) {
          console.log('[Setup Progress] Auto-repair: marking forwarding_verified for business with real call data:', business.id)
          console.log('[ONBOARDING COMPLETE]', {
            businessId: business.id,
            reason: 'Auto-repair: Real data detected, updating onboarding_status to completed',
            leadId: leadsCount > 0 ? 'existing' : 'unknown',
            conversationId: conversationsCount > 0 ? 'existing' : 'unknown',
            callEventsCount,
            leadsCount,
            conversationsCount,
            previousStatus: business.onboarding_status
          })
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
            console.log('[ONBOARDING COMPLETE]', {
              businessId: business.id,
              reason: 'Auto-repair completed: forwarding_verified and onboarding_status updated',
              leadId: leadsCount > 0 ? 'existing' : 'unknown',
              conversationId: conversationsCount > 0 ? 'existing' : 'unknown',
              callEventsCount,
              leadsCount,
              conversationsCount,
              newStatus: 'completed'
            })
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
    // Step 3 is complete if forwarding_verified is true (persistent state)
    const testComplete = business?.forwarding_verified === true
    
    console.log('[Setup Progress] Step 3 completion check:', {
      businessId: business.id,
      missedCallCount,
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
  }, [business, isOnDashboard, realCallDataExists, missedCallCount])

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

  // Helper to get current business state (optimistic or actual)
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
  const twilioReady = Boolean(currentBusiness?.twilio_phone_number) && currentBusiness?.provisioning_status === 'active'
  const forwardingSetupComplete = Boolean(currentBusiness?.phone_setup_completed_at)
  const testComplete = setupState.step3Complete
  const provisioningStatus = currentBusiness?.provisioning_status ?? 'pending'

  const handleCompleteForwarding = async () => {
    const currentBusiness = getCurrentBusiness()
    if (!currentBusiness) return
    
    console.log('[GettingStarted] Starting forwarding completion - click handler start')
    
    try {
      setIsCompletingForwarding(true)
      console.log('[GettingStarted] Database update start')
      
      const supabase = createBrowserClient()
      const { error } = await supabase
        .from('businesses')
        .update({
          call_forwarding_enabled: true,
          phone_setup_completed_at: new Date().toISOString(),
          forwarding_verified: true,
          forwarding_verified_at: new Date().toISOString(),
          onboarding_status: "pending_test",
          onboarding_step: "phone_setup_completed"
        })
        .eq('id', currentBusiness.id)
      
      if (error) {
        console.error('[GettingStarted] Failed to mark forwarding complete:', error)
        setIsCompletingForwarding(false)
        // Show user-friendly error message
        alert('Failed to update forwarding status. Please try again or contact support.')
      } else {
        console.log('[GettingStarted] Database update success')
        
        // Optimistic UI update - immediately update local state
        const optimisticBusiness: Business = {
          ...currentBusiness,
          call_forwarding_enabled: true,
          phone_setup_completed_at: new Date().toISOString(),
          forwarding_verified: true,
          forwarding_verified_at: new Date().toISOString(),
          onboarding_status: "pending_test",
          onboarding_step: "phone_setup_completed"
        }
        
        console.log('[GettingStarted] Local state update - optimistic UI')
        setOptimisticBusinessState(optimisticBusiness)
        
        // Navigate directly to test setup without background refresh to prevent flash
        console.log('[GettingStarted] Navigating to test setup immediately')
        setTimeout(() => {
          setIsCompletingForwarding(false)
          // Use Next.js router for smoother transition with preserved state
          window.location.href = '/dashboard/test-setup'
        }, 100) // Reduced delay for faster perceived transition
      }
    } catch (error) {
      console.error('[GettingStarted] Error completing forwarding:', error)
      setIsCompletingForwarding(false)
      // Show user-friendly error message
      alert('Failed to update forwarding status. Please try again or contact support.')
    }
  }

  const handleProvisionNumber = async () => {
    if (!business) return
    
    setIsHandlingBilling(true)
    
    try {
      console.log('[GettingStarted] Starting number provisioning for beta user:', business.id)
      
      // Get session token for authentication
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        console.error('[GettingStarted] No session token available')
        alert('Authentication required. Please sign in again.')
        return
      }
      
      // Call the same provisioning API used after Stripe checkout
      const response = await fetch('/api/business/trigger-provisioning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          business_id: business.id
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        console.log('[GettingStarted] Provisioning started for beta user:', business.id)
        // Refresh business data to show provisioning status
        refreshBusiness()
      } else {
        console.error('[GettingStarted] Provisioning failed:', data.error)
        alert(data.error || 'Failed to provision ReplyFlow number. Please try again.')
      }
    } catch (error) {
      console.error('[GettingStarted] Provisioning error:', error)
      alert('Failed to provision ReplyFlow number. Please try again.')
    } finally {
      setIsHandlingBilling(false)
    }
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

  // Always emit all 3 onboarding steps with a per-step status. This gives users a
  // consistent, intentional progression instead of a checklist that grows
  // step-by-step as state changes.
  const getChecklistItems = (): ChecklistItem[] => {
    if (!business) return []

    const isTrialing = business.subscription_status === SUBSCRIPTION_STATES.TRIALING
    const isBetaOrComped = business.subscription_status === SUBSCRIPTION_STATES.BETA || business.subscription_status === SUBSCRIPTION_STATES.COMPED
    const isAuthenticated = !!business

    // Use shared setup state for consistency
    const step1Complete = setupState.step1Complete
    const step2Complete = setupState.step2Complete
    const step3Complete = setupState.step3Complete

    // Check if subscription was previously active but now inactive (ACTION NEEDED)
    const subscriptionActionNeeded = !subscriptionActive && business.stripe_customer_id
    // Check if number was provisioned but now has issues (ACTION NEEDED)
    const numberActionNeeded = step1Complete && (!twilioReady || provisioningStatus === 'failed')
    // Check if forwarding was set up but now disabled (ACTION NEEDED)
    const forwardingActionNeeded = step2Complete && !business.call_forwarding_enabled
    // Check if test was previously complete but now failed (ACTION NEEDED)
    const testActionNeeded = step3Complete && !business.forwarding_verified && !realCallDataExists

    return [
      {
        id: 'ready',
        title: 'Activate ReplyFlow',
        description: isBetaOrComped 
          ? 'Beta access is active and your dedicated ReplyFlow number is ready.'
          : 'Your free trial is active and your dedicated ReplyFlow number is ready.',
        status: (subscriptionActionNeeded || numberActionNeeded) ? 'action-needed' : (step1Complete ? 'complete' : 'needs-action'),
        details: (subscriptionActionNeeded || numberActionNeeded)
          ? (subscriptionActionNeeded ? 'Subscription inactive - reactivate to continue' : 'Number setup has issues - check status')
          : step1Complete
            ? (isTrialing ? '14-day free trial active' : isBetaOrComped ? 'Beta access active' : 'Subscription active') + (business.twilio_phone_number ? ` • ${formatPhoneNumber(business.twilio_phone_number)}` : '') + ' • Completed automatically.'
            : 'No charge today. Cancel anytime.',
        buttonText: !step1Complete && !subscriptionActionNeeded && !numberActionNeeded
          ? (isHandlingBilling ? 'Processing…' : (isBetaOrComped ? 'Set Up ReplyFlow Number' : 'Start 14-Day Free Trial'))
          : (step1Complete ? 'Manage Billing' : 'Reactivate'),
        buttonOnClick: !step1Complete && !subscriptionActionNeeded && !numberActionNeeded && isAuthenticated ? (isBetaOrComped ? handleProvisionNumber : handleStartTrial) : undefined,
        buttonHref: (!step1Complete && !subscriptionActionNeeded && !numberActionNeeded && !isAuthenticated) ? '/auth/signup' : undefined,
      },
      {
        id: 'forwarding',
        title: 'Connect your business line',
        description: 'Customers still call your normal business number. Missed calls are automatically forwarded to ReplyFlow so you never lose the lead.',
        status: forwardingActionNeeded ? 'action-needed' : (step2Complete ? 'complete' : 'needs-action'),
        details: forwardingActionNeeded
          ? 'Forwarding disabled - re-enable to continue'
          : step2Complete
            ? 'Your business phone is connected to ReplyFlow. You can review your forwarding instructions anytime.'
            : (step1Complete ? 'Follow the carrier-specific instructions to enable forwarding' : 'Available once ReplyFlow is ready'),
        // Always show button when number is ready and forwarding is not complete
        buttonText: step1Complete && !step2Complete ? 'Set Up Call Forwarding' : undefined,
        buttonHref: (() => {
          const wouldNavigate = step1Complete && !step2Complete
          console.log('[GettingStarted] Forwarding buttonHref calculation', {
            source: 'GettingStarted.tsx',
            subscription_status: business?.subscription_status,
            twilio_phone_number: business?.twilio_phone_number,
            step1Complete,
            step2Complete,
            wouldNavigate,
            targetRoute: wouldNavigate ? '/setup/forwarding' : undefined,
            allowed: wouldNavigate ? 'Yes (subscription check via step1Complete)' : 'No'
          })
          return wouldNavigate ? '/setup/forwarding' : undefined
        })(),
        // Secondary button for users who have already enabled forwarding
        secondaryButtonText: step1Complete && !step2Complete ? (isCompletingForwarding ? "Updating setup..." : "I've Enabled Forwarding") : (step2Complete ? 'Review Forwarding Setup' : undefined),
        secondaryButtonOnClick: step1Complete && !step2Complete && !isCompletingForwarding ? handleCompleteForwarding : undefined,
        secondaryButtonHref: (() => {
          const wouldNavigate = step2Complete
          console.log('[GettingStarted] Forwarding secondaryButtonHref calculation', {
            source: 'GettingStarted.tsx',
            subscription_status: business?.subscription_status,
            step2Complete,
            wouldNavigate,
            targetRoute: wouldNavigate ? '/setup/forwarding' : undefined,
            allowed: wouldNavigate ? 'Yes (forwarding already complete)' : 'No'
          })
          return wouldNavigate ? '/setup/forwarding' : undefined
        })(),
      },
      {
        id: 'test',
        title: 'Test Your Setup',
        description: 'Place a test call to confirm ReplyFlow is live.',
        status: testActionNeeded ? 'action-needed' : (step3Complete ? 'complete' : 'needs-action'),
        details: testActionNeeded
          ? 'Test failed - try again'
          : step3Complete
            ? (realCallDataExists ? 'ReplyFlow is live and monitoring your business line.' : 'ReplyFlow is now monitoring your missed calls.')
            : (step2Complete ? 'This usually takes less than 30 seconds' : 'Available once forwarding is enabled'),
        buttonText: step2Complete && !step3Complete ? 'Test Your Setup' : undefined,
        buttonHref: step2Complete && !step3Complete ? '/dashboard/test-setup' : undefined,
        secondaryButtonText: step3Complete ? 'Run Another Test' : undefined,
        secondaryButtonHref: step3Complete ? '/dashboard/test-setup' : undefined,
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

  // Slim success banner for completed setup
  if (complete) {
    // Calculate progress for expanded view
    const totalSteps = checklistItems.length
    const doneSteps = checklistItems.filter(i => i.status === 'complete').length
    const progressPct = totalSteps === 0 ? 0 : Math.round((doneSteps / totalSteps) * 100)

    return (
      <div className="rounded-xl border border-green-200/60 dark:border-green-800/50 bg-gradient-to-r from-green-50/50 to-emerald-50/40 dark:from-green-900/10 dark:to-emerald-900/10 px-4 sm:px-6 py-2 sm:py-3 mb-6 transition-all duration-300 hover:shadow-md">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-5 h-5 sm:w-6 sm:h-6 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="absolute top-0 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse shadow-sm"></div>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-green-800 dark:text-green-200">
                ReplyFlow is actively monitoring your business line.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button
              onClick={() => window.location.href = '/dashboard/test-setup'}
              className="text-[10px] sm:text-xs text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200 transition-colors font-medium hover:underline"
            >
              Run test
            </button>
            <button
              onClick={handleToggle}
              className="text-[10px] sm:text-xs text-green-600/80 dark:text-green-400/70 hover:text-green-800 dark:hover:text-green-300 transition-colors font-medium hover:underline"
              aria-expanded={isExpanded}
              aria-label="View setup details"
            >
              {isExpanded ? 'Hide details' : 'View setup'}
            </button>
          </div>
        </div>

        {/* Expandable setup details */}
        {isExpanded && (
          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-green-200/50 dark:border-green-800/50">
            <div className={`rounded-xl border p-2 sm:p-4 border-green-200/50 dark:border-green-800/50`}>
              {/* Horizontal layout: left text, right CTA */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-2 sm:mb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 sm:mb-1.5">
                    <h2 className="text-base sm:text-lg font-semibold text-foreground">
                      Setup Complete
                    </h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    ReplyFlow is actively monitoring your business line.
                  </p>
                </div>
                <button
                  onClick={handleToggle}
                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  aria-expanded={isExpanded}
                  aria-label="Collapse setup checklist"
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

              {/* Checklist items */}
              <ul className="space-y-1.5 sm:space-y-2.5">
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
                        ) : (
                          <div
                            className={`w-5 sm:w-6 h-5 sm:h-6 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm ${
                              isActionNeeded
                                ? 'bg-amber-600 text-white shadow-sm'
                                : isCurrent
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {stepNum}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <h3 className={`font-semibold text-sm sm:text-base ${!isCurrent && !isComplete && !isActionNeeded ? 'text-muted-foreground/70' : 'text-foreground'}`}>{item.title}</h3>
                          <span
                            className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                              isComplete
                                ? 'bg-green-100/50 text-green-700/60 dark:bg-green-900/20 dark:text-green-300/50'
                                : isActionNeeded
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                  : isCurrent
                                    ? 'bg-blue-100/70 text-blue-800/80 dark:bg-blue-900/30 dark:text-blue-300/80'
                                    : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isComplete ? 'Done' : isActionNeeded ? 'Action Needed' : isCurrent ? 'IN PROGRESS' : ''}
                          </span>
                          {isForwardingCard && (isComplete || !isComplete && (isCurrent || isActionNeeded)) && (
                            <div className="flex-shrink-0">
                              {isExpandedCard ? (
                                <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              )}
                            </div>
                          )}
                        </div>
                        <p className={`text-sm mb-2.5 ${!isCurrent && !isComplete && !isActionNeeded ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>{item.description}</p>
                        {item.details && (
                          <p className="text-xs text-muted-foreground mb-3.5">{item.details}</p>
                        )}
                        {(item.buttonText || item.secondaryButtonText) && (
                          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                            {item.buttonText && item.buttonHref && (
                              <Link
                                href={item.buttonHref}
                                className={`inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                                  isActionNeeded
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm hover:shadow'
                                    : isCurrent
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow'
                                      : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                                }`}
                              >
                                {item.buttonText}
                              </Link>
                            )}
                            {item.secondaryButtonText && item.secondaryButtonHref && (
                              <Link
                                href={item.secondaryButtonHref}
                                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all border border-border/50"
                              >
                                {item.secondaryButtonText}
                              </Link>
                            )}
                            {item.secondaryButtonText && item.secondaryButtonOnClick && (
                              <button
                                onClick={item.secondaryButtonOnClick}
                                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all border border-border/50"
                              >
                                {item.secondaryButtonText}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Numbered onboarding checklist with progress bar.
  const totalSteps = checklistItems.length
  const doneSteps = checklistItems.filter(i => i.status === 'complete').length
  const progressPct = totalSteps === 0 ? 0 : Math.round((doneSteps / totalSteps) * 100)

  return (
    <div className={`rounded-2xl border-2 ${isOnboardingComplete && !isExpanded ? 'p-4 sm:p-5' : 'p-4 sm:p-6'} ${!complete ? 'border-border bg-card shadow-sm hover:shadow-md' : 'border-green-200/60 dark:border-green-800/60 bg-green-50/30 dark:bg-green-900/20'} transition-all duration-300`}>
      {/* Header with title and status */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className={`text-sm sm:text-lg font-semibold text-foreground ${isOnboardingComplete && !isExpanded ? 'text-sm' : ''}`}>
              {complete ? 'Setup Complete' : 'Setup Progress'}
            </h2>
            {/* Simple chevron expand/collapse control */}
            {!complete && (
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
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2">
            {/* System Status - subtle indicator - compact on mobile */}
            <span className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full leading-none w-fit ${complete ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30'}`}>
              <div className={`w-2 h-2 rounded-full ${complete ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></div>
              <span className={`text-[10px] sm:text-xs font-semibold leading-none ${complete ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {complete ? 'Live' : 
                  incompleteItems.length === 2 ? 'Connect Your Business Line' :
                  incompleteItems.length === 1 ? 'Call Forwarding Required' :
                  'Test Your Setup'
                }
              </span>
            </span>
            {/* Trial badge - only show when in trial and onboarding incomplete - compact on mobile */}
            {!complete && isInTrial && trialDaysRemaining !== null && (
              <span className="inline-flex items-center px-2 sm:px-2 py-1 rounded-full bg-blue-900/20 dark:bg-blue-900/30 border border-blue-900/30 dark:border-blue-800/30 text-[9px] sm:text-[11px] font-medium leading-none text-blue-700 dark:text-blue-300">
                {trialDaysRemaining} {trialDaysRemaining === 1 ? 'day' : 'days'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar - moved up */}
      {(!isOnboardingComplete || isExpanded) && (
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden mb-4 relative">
          <div
            className={`h-full transition-all duration-500 ease-out ${complete ? 'bg-gradient-to-r from-green-500/90 to-emerald-500/90 shadow-lg shadow-green-500/30' : 'bg-gradient-to-r from-blue-500/90 to-indigo-500/90 shadow-lg shadow-blue-500/30'}`}
            style={{ width: `${progressPct}%` }}
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            role="progressbar"
          />
        </div>
      )}

      {/* Status message - moved below progress bar */}
      {(!isOnboardingComplete || isExpanded) && (
        <>
          <p className={`text-xs sm:text-sm text-muted-foreground mb-3 ${isOnboardingComplete && !isExpanded ? 'hidden' : ''}`}>
            {complete ? 'ReplyFlow is live and monitoring missed calls.' : (incompleteItems.length === 1 ? 'Final step remaining: Complete one missed-call test to activate live monitoring.' : `${doneSteps} of ${totalSteps} steps completed`)}
          </p>
          
          {/* Live system reassurance text */}
          {!complete && (
            <p className="text-xs text-muted-foreground/70 italic mb-3">
              {incompleteItems.length === 2 ? 'Waiting for phone number setup to begin monitoring...' : 
               incompleteItems.length === 1 ? 'Ready to activate once final test is completed...' : 
               'Monitoring setup status...'}
            </p>
          )}
          
          {!complete && incompleteItems.length === 1 && (
            <div className="mb-4">
              <Link
                href="/dashboard/test-setup"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-2.5 sm:gap-3 px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold rounded-xl transition-all duration-200 bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg hover:-translate-y-[1px] border border-blue-600 hover:border-blue-700 cursor-pointer"
              >
                <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Complete Final Test
              </Link>
            </div>
          )}
        </>
      )}

      {isExpanded && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300 ease-out mt-4 sm:mt-3">
          <ol className="space-y-3 sm:space-y-2.5">
            {checklistItems.map((item, idx) => {
            const stepNum = idx + 1
            const isComplete = item.status === 'complete'
            const isActionNeeded = item.status === 'action-needed'
            // If all steps are complete, no step should show as CURRENT
            const isCurrent = !complete && !isComplete && !isActionNeeded && checklistItems.findIndex(i => i.status !== 'complete' && i.status !== 'action-needed') === idx
            const isExpanded = expandedCardId === item.id
            const isForwardingCard = item.id === 'forwarding'
            
            return (
              <li
                key={item.id}
                ref={(el) => { cardRefs.current[item.id] = el }}
                className={`flex items-start gap-5 sm:gap-4 ${!isCurrent && !isActionNeeded ? 'p-2 sm:p-2' : 'p-3 sm:p-2.5'} rounded-xl border transition-all duration-300 ease-out ${
                  isComplete
                    ? 'bg-green-50/30 dark:bg-green-900/5 border-green-200/40 dark:border-green-800/20'
                    : isActionNeeded
                      ? 'bg-amber-50/70 dark:bg-amber-900/15 border-amber-300 dark:border-amber-700/60 shadow-sm'
                      : isCurrent
                        ? 'bg-blue-50/70 dark:bg-blue-900/20 border-blue-300/80 dark:border-blue-600/60 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm'
                        : 'bg-muted/50 border-border'
                } ${isForwardingCard && !isComplete ? 'cursor-pointer hover:bg-blue-100/70 dark:hover:bg-blue-900/30' : ''}`}
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
                        isActionNeeded
                          ? 'bg-amber-600 text-white shadow-sm'
                          : isCurrent
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {stepNum}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-sm sm:text-base font-semibold ${
                      isComplete
                        ? 'text-green-800/60 dark:text-green-200/50'
                        : !isCurrent && !isActionNeeded
                          ? 'text-muted-foreground/70'
                          : 'text-foreground'
                    }`}>
                      Step {stepNum} — {item.title}
                    </h3>
                    {isComplete && (
                      <span
                        className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium bg-green-100/50 text-green-700/60 dark:bg-green-900/20 dark:text-green-300/50`}
                      >
                        Done
                      </span>
                    )}
                  </div>
                  {!isComplete && (isCurrent || isActionNeeded) && (
                    <div className="mb-3">
                      <span
                        className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                          isActionNeeded
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-blue-100/70 text-blue-800/80 dark:bg-blue-900/30 dark:text-blue-300/80'
                        }`}
                      >
                        {isActionNeeded ? 'Action Needed' : 'IN PROGRESS'}
                      </span>
                    </div>
                  )}
                  <p className={`text-xs sm:text-sm mb-3 leading-relaxed ${
                    isComplete
                      ? 'text-muted-foreground/60'
                      : !isCurrent && !isActionNeeded
                        ? 'text-muted-foreground/60'
                        : 'text-muted-foreground'
                  }`}>
                    {item.description}
                  </p>
                  {item.details && (
                    <p className={`text-[11px] mb-3 leading-relaxed ${
                      isComplete
                        ? 'text-muted-foreground/50'
                        : 'text-muted-foreground'
                    }`}>
                      {item.details}
                    </p>
                  )}
                  {item.buttonText && (item.buttonOnClick || item.buttonHref) && (
                    <div className="mt-4">
                      {item.buttonOnClick ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!isCompletingForwarding) {
                              item.buttonOnClick!()
                            }
                          }}
                          disabled={isCompletingForwarding}
                          className={`inline-flex items-center justify-center w-full px-4 py-3 sm:py-2.5 text-sm font-medium rounded-lg transition-colors text-center ${
                            isCurrent
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                              : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                          } ${
                            isCompletingForwarding ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {item.buttonText}
                        </button>
                      ) : (
                        <Link
                          href={item.buttonHref!}
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-flex items-center justify-center w-full px-4 py-3 sm:py-2.5 text-sm font-medium rounded-lg transition-colors text-center ${
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
                  {item.secondaryButtonText && item.secondaryButtonOnClick && (
                    <div className="mt-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!isCompletingForwarding) {
                            item.secondaryButtonOnClick!()
                          }
                        }}
                        disabled={isCompletingForwarding}
                        className={`w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors text-foreground border-2 border-border bg-background hover:bg-muted hover:border-border/80 ${
                          isCompletingForwarding ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {item.secondaryButtonText}
                      </button>
                    </div>
                  )}
                  {item.secondaryButtonText && item.secondaryButtonHref && (
                    <div className="mt-3">
                      <Link
                        href={item.secondaryButtonHref}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center justify-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors text-center text-foreground border-2 border-border bg-background hover:bg-muted hover:border-border/80"
                      >
                        {item.secondaryButtonText}
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
        </div>
      )}
    </div>
  )

  // Incomplete setup - show progress with expandable details
  return (
    <div className="rounded-xl border border-border bg-card px-4 sm:px-6 py-3 sm:py-4 mb-6 transition-all duration-300">
      {/* Header with progress */}
      <div className="flex items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0">
            <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shadow-sm ${
              incompleteItems.length === 0 
                ? 'bg-green-500' 
                : incompleteItems.some(item => item.status === 'action-needed')
                  ? 'bg-amber-500' 
                  : 'bg-blue-500'
            }`}>
              {incompleteItems.length === 0 ? (
                <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : incompleteItems.some(item => item.status === 'action-needed') ? (
                <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <div className="text-white text-xs sm:text-sm font-bold">{doneSteps}</div>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm sm:text-base font-semibold text-foreground">
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
        </div>
        <button
          onClick={handleToggle}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-expanded={isExpanded}
          aria-label="View setup details"
        >
          <span className="text-xs sm:text-sm font-medium hover:underline">
            {isExpanded ? 'Hide steps' : 'View steps'}
          </span>
          <svg
            className={`w-4 h-4 ml-1.5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
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
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 transition-all duration-500 ease-out ${
              incompleteItems.length === 0 
                ? 'bg-green-600' 
                : incompleteItems.some(item => item.status === 'action-needed')
                  ? 'bg-amber-600' 
                  : 'bg-blue-600'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Expandable setup details */}
      {isExpanded && (
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border">
          <div className="space-y-1.5 sm:space-y-2.5">
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
                  className={`flex items-start gap-3 sm:gap-4 p-3 sm:p-3.5 rounded-xl border transition-all duration-300 list-none ${
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
                    ) : (
                      <div
                        className={`w-5 sm:w-6 h-5 sm:h-6 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm ${
                          isActionNeeded
                            ? 'bg-amber-600 text-white shadow-sm'
                            : isCurrent
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {stepNum}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className={`text-sm sm:text-base font-semibold ${
                        isComplete
                          ? 'text-green-800/60 dark:text-green-200/50'
                          : !isCurrent && !isActionNeeded
                            ? 'text-muted-foreground/70'
                            : 'text-foreground'
                      }`}>
                        Step {stepNum} — {item.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${
                            isComplete
                              ? 'bg-green-100/50 text-green-700/60 dark:bg-green-900/20 dark:text-green-300/50'
                              : isActionNeeded
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                : isCurrent
                                  ? 'bg-blue-100/70 text-blue-800/80 dark:bg-blue-900/30 dark:text-blue-300/80'
                                  : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {isComplete ? 'Done' : isActionNeeded ? 'Action Needed' : isCurrent ? 'IN PROGRESS' : ''}
                        </span>
                        {isForwardingCard && !isComplete && (isCurrent || isActionNeeded) && (
                          <div className="flex-shrink-0">
                            {isExpandedCard ? (
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
                        : !isCurrent && !isActionNeeded
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
                    {item.secondaryButtonText && item.secondaryButtonOnClick && (
                      <div className="mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            item.secondaryButtonOnClick!()
                          }}
                          className="w-full sm:w-auto px-4 py-2 text-xs font-medium rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-transparent hover:border-border"
                        >
                          {item.secondaryButtonText}
                        </button>
                      </div>
                    )}
                    {item.secondaryButtonText && item.secondaryButtonHref && (
                      <div className="mt-2">
                        <Link
                          href={item.secondaryButtonHref}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-2.5 px-4 py-2 text-xs font-medium rounded-md transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-muted/50 hover:border-border/80 cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          {item.secondaryButtonText}
                        </Link>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
