'use client'

// @ts-nocheck - TypeScript disabled due to disabled Admin Tools section with complex type checking

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useTrialEligibility } from '@/hooks/useTrialEligibility'
import { useDashboardRouteTracking } from '@/hooks/useDashboardRouteTracking'
import { useOperationalMetrics } from '@/hooks/useOperationalMetrics'
import AppLoadingScreen from '@/components/AppLoadingScreen'
import RoutingDebugBanner from '@/components/RoutingDebugBanner'
import { isAdminUserById } from '@/lib/admin'
import { 
  formatPhoneNumber, 
  formatRelativeTime, 
  truncateText, 
  getLeadStatusColor,
  formatDate
} from '@/lib/utils'
import { 
  getSubscriptionStatusText,
  isActiveSubscription,
  hasValidSubscription,
  isScheduledToCancel,
  isInTrialPeriod,
  needsUpgrade,
  getPricingDisplay,
  getTrialDisplay,
  SUBSCRIPTION_STATES
} from '@/lib/subscription'
import { hasActiveAccess, hasActiveTrial, hasActiveSubscription, deriveSetupState } from '@/lib/subscription-utils'
import { PRICING_CONFIG } from '@/lib/pricing'
import { handleBillingAction } from '@/lib/billing'
import { getSetupHealth } from '@/lib/setup-health'
import { themeClasses, bgTokens, textTokens, borderTokens, buttonTokens } from '@/lib/theme'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import SmsVerificationBanner from '@/components/SmsVerificationBanner'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import MobileMenu from '@/components/MobileMenu'
import AppHeader from '@/components/AppHeader'
import GettingStarted from '@/components/GettingStarted'
import BottomNavigation from '@/components/BottomNavigation'
import SetupProgress from '@/components/setup/SetupProgress'
import OffboardingBanner from '@/components/OffboardingBanner'
import ProvisioningSuccessBanner from '@/components/ProvisioningSuccessBanner'
import SetupStatusCard from '@/components/SetupStatusCard'
import Footer from '@/components/Footer'
import Image from 'next/image'
import { RealtimeChannel } from '@supabase/supabase-js'
import RecentLeadsSection from '@/components/RecentLeadsSection'
import SectionErrorBoundary from '@/components/SectionErrorBoundary'
import NoBusinessSetup from '@/components/NoBusinessSetup'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import NeedsAttentionCard from '@/components/NeedsAttentionCard'
import FollowUpActivityCard from '@/components/FollowUpActivityCard'
import LeadEngagementCard from '@/components/LeadEngagementCard'
import BusinessWinsCard from '@/components/BusinessWinsCard'
import BusinessSnapshot from '@/components/BusinessSnapshot'
import DashboardMetrics from '@/components/DashboardMetrics'
import OperationalStatusCard from '@/components/OperationalStatusCard'
import RecentActivityCard from '@/components/RecentActivityCard'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import { HelpContext } from '@/components/HelpAssistant'
import BetaFeedbackModal from '@/components/BetaFeedbackModal'
import { reconcileWarmNumbers, getWarmInventoryStats } from '@/app/admin/actions'
import { getBusinessOnboardingState, getEmptyStateCopy, BusinessData } from '@/lib/onboarding-state'
import { getBusinessSetupCompletionState } from '@/lib/setup-completion-state'
import { isBusinessOutOfOffice, getOutOfOfficeStatus } from '@/lib/out-of-office'

const DEBUG = process.env.NODE_ENV === 'development'
const dlog = (...args: any[]) => { if (DEBUG) console.log(...args) }

// Helper to get latest activity timestamp for sorting
function getLatestActivity(lead: any): string {
  if (lead.last_message_at) return lead.last_message_at
  if (lead.first_contact_at) return lead.first_contact_at
  return lead.created_at
}

// Helper to determine if lead needs response
function needsResponse(lead: any): boolean {
  const hasInbound = lead.messages?.some((m: any) => m.direction === 'inbound')
  const hasOutboundAfterInbound = lead.messages?.some((m: any) => {
    if (m.direction !== 'outbound') return false
    const inboundMessages = lead.messages?.filter((msg: any) => msg.direction === 'inbound')
    if (inboundMessages.length === 0) return false
    const latestInbound = inboundMessages.sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    return new Date(m.created_at).getTime() > new Date(latestInbound.created_at).getTime()
  })
  return hasInbound && !hasOutboundAfterInbound
}

// Helper to get lead status display
function getLeadStatusDisplay(lead: any): { text: string; color: string } {
  // Use lead_status if available, otherwise derive from messages
  const status = lead.lead_status || lead.status || 'new'
  
  if (needsResponse(lead)) {
    return { text: 'Needs response', color: 'amber' }
  }
  
  switch (status) {
    case 'new':
      return { text: 'New', color: 'blue' }
    case 'replied':
      return { text: 'Replied', color: 'green' }
    case 'qualified':
      return { text: 'Qualified', color: 'purple' }
    case 'closed':
      return { text: 'Closed', color: 'gray' }
    default:
      return { text: 'New', color: 'blue' }
  }
}

// Helper to filter and sort leads
function processLeads(leads: any[], searchQuery: string, statusFilter: string): any[] {
  let filtered = leads
  
  // Apply status filter
  if (statusFilter !== 'all') {
    filtered = filtered.filter(lead => {
      const status = getLeadStatusDisplay(lead)
      if (statusFilter === 'needs_response') {
        return needsResponse(lead)
      }
      return status.text.toLowerCase() === statusFilter.toLowerCase()
    })
  }
  
  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase()
    filtered = filtered.filter(lead => {
      const phone = lead.caller_phone?.toLowerCase() || ''
      const latestMessage = lead.messages && lead.messages.length > 0
        ? lead.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        : null
      const messageBody = latestMessage?.body?.toLowerCase() || ''
      const status = getLeadStatusDisplay(lead).text.toLowerCase()
      
      return phone.includes(query) || messageBody.includes(query) || status.includes(query)
    })
  }
  
  // Sort by latest activity (newest first)
  return filtered.sort((a, b) => {
    const timeA = new Date(getLatestActivity(a)).getTime()
    const timeB = new Date(getLatestActivity(b)).getTime()
    return timeB - timeA
  })
}
function formatLeadPhone(phone: string): string {
  if (phone === '+10000000000') {
    return 'Test Lead'
  }
  return formatPhoneNumber(phone)
}

// Helper to get friendly error message
function getFriendlyErrorMessage(errorCode: string | null, errorMessage: string | null): string {
  if (errorCode === '30007') {
    return 'Carrier blocked this message'
  }
  if (errorMessage) {
    return truncateText(errorMessage, 50)
  }
  return 'Delivery failed'
}

// Helper to get lead-level status indicator
function getLeadMessageStatus(latestMessage: any): { text: string; color: string; icon: string } {
  if (!latestMessage || !latestMessage.status) {
    return { text: 'Pending...', color: 'gray', icon: '…' }
  }

  const status = latestMessage.status
  const errorCode = latestMessage.error_code

  // Override for carrier blocking
  if (errorCode === '30007') {
    return { text: 'Blocked (Carrier)', color: 'red', icon: '🚫' }
  }

  if (status === 'delivered') return { text: 'Delivered', color: 'green', icon: '✓' }
  if (status === 'sent') return { text: 'Sent', color: 'blue', icon: '→' }
  if (status === 'queued') return { text: 'Sending...', color: 'gray', icon: '…' }
  if (status === 'failed') return { text: 'Failed', color: 'red', icon: '✕' }
  if (status === 'undelivered') return { text: 'Failed', color: 'red', icon: '✕' }
  return { text: 'Unknown', color: 'gray', icon: '?' }
}

// Helper to format timestamp with fallback
function formatMessageTimestamp(message: any): string {
  const timestamp = message.status_updated_at || message.created_at
  return formatRelativeTime(timestamp)
}

const COLLAPSE_PREFERENCE_KEY = 'gettingStartedCollapsed'

// Check if onboarding is expanded
const isOnboardingExpanded = (() => {
  if (typeof window === 'undefined') return false
  const savedPreference = localStorage.getItem(COLLAPSE_PREFERENCE_KEY)
  return savedPreference === 'false' // false means expanded
})()

export default function DashboardContent() {
  // Track dashboard routes for smart redirect
  useDashboardRouteTracking()

  const { business, loading: businessLoading, fetchComplete: businessFetchComplete, refreshBusiness } = useBusiness()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Setup mode detection - check if user came from billing success
  const setupMode = searchParams?.get('setup') === '1'

  // Check if user is admin based on user ID
  const isAdmin = isAdminUserById(user?.id)
  
  // ALL hooks must be called before any conditional returns to prevent React #310
  const [processedLeads, setProcessedLeads] = useState<any[]>([])
  const [missedCallCount, setMissedCallCount] = useState(0)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const { checkoutMode, isLoading: eligibilityLoading, eligibility } = useTrialEligibility()
  const [isOpeningBilling, setIsOpeningBilling] = useState(false)
  const [webhookConfirming, setWebhookConfirming] = useState(false)
  const [testSmsLoading, setTestSmsLoading] = useState(false)
  const [testSmsMessage, setTestSmsMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [billingError, setBillingError] = useState('')
  const [adminPanelCollapsed, setAdminPanelCollapsed] = useState(true)
  const [loadingTimeout, setLoadingTimeout] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [refreshingStats, setRefreshingStats] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [reconciliationResult, setReconciliationResult] = useState<any>(null)
  const [lastRenderedSection, setLastRenderedSection] = useState('')
  const [isRecoveringSession, setIsRecoveringSession] = useState(false)
  const [troubleshootingOpen, setTroubleshootingOpen] = useState(false)
  const [showBetaFeedbackModal, setShowBetaFeedbackModal] = useState(false)
  const autoCompleteInProgress = useRef(false)
  const autoCompleteCompleted = useRef(false)
  
  const checkoutStatus = searchParams?.get('checkout')
  const supabase = createBrowserClient()

  // Central setup health - single source of truth
  const latestLead = processedLeads[0] || null
  const setupHealth = getSetupHealth({
    business,
    leads: processedLeads,
    latestLead,
    metrics: {
      missedCallsCaptured: missedCallCount
    }
  })

  // Determine if onboarding is fully complete
  const isOnboardingComplete = Boolean(business?.phone_setup_completed_at && business?.forwarding_verified)

  // Use centralized onboarding state machine
  const onboardingState = useMemo(() => {
    const businessData: BusinessData = {
      subscription_status: business?.subscription_status,
      stripe_customer_id: business?.stripe_customer_id,
      stripe_subscription_id: business?.stripe_subscription_id,
      twilio_phone_number: business?.twilio_phone_number,
      twilio_phone_number_sid: business?.twilio_phone_number_sid,
      provisioning_status: business?.provisioning_status,
      phone_setup_completed_at: business?.phone_setup_completed_at,
      call_forwarding_enabled: business?.call_forwarding_enabled,
      forwarding_verified: business?.forwarding_verified,
      forwarding_verified_at: business?.forwarding_verified_at,
      onboarding_status: business?.onboarding_status,
      messaging_status: business?.messaging_status,
      a2p_status: business?.a2p_status
    }

    return getBusinessOnboardingState(businessData, {
      hasLeads: processedLeads.length > 0,
      hasConversations: processedLeads.filter(l => l.conversation_id).length > 0,
      hasSuccessfulSms: false, // Would need to check message status
      hasVoiceWebhookSuccess: false, // Would need to check voice webhook logs
      a2pStatus: business?.a2p_status,
      missedCallCount
    })
  }, [business, processedLeads, missedCallCount])

  // Fetch missed call count for Step 3 completion logic
  useEffect(() => {
    const fetchMissedCallCount = async () => {
      if (!business?.id) return

      try {
        const supabase = createBrowserClient()
        const { count } = await supabase
          .from('call_events')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)
        
        setMissedCallCount(count || 0)
      } catch (error) {
        console.error('[DashboardContent] Error fetching missed call count:', error)
      }
    }

    fetchMissedCallCount()
  }, [business?.id])

  // Auto-complete setup if leads exist but setup is not complete
  useEffect(() => {
    const hasLeads = processedLeads.length > 0
    const hasConversations = processedLeads.filter(l => l.conversation_id).length > 0
    const forwardingVerified = business?.forwarding_verified === true
    const phoneSetupComplete = Boolean(business?.phone_setup_completed_at)
    const forwardingEnabled = business?.call_forwarding_enabled === true
    const hasNumber = Boolean(business?.twilio_phone_number)
    
    // Check if setup should be auto-completed
    const shouldAutoComplete = 
      hasLeads || hasConversations
    
    const needsPersistedCompletion = 
      shouldAutoComplete &&
      !forwardingVerified &&
      phoneSetupComplete &&
      forwardingEnabled &&
      hasNumber &&
      business?.id &&
      !autoCompleteCompleted.current &&
      !autoCompleteInProgress.current

    if (needsPersistedCompletion) {
      autoCompleteInProgress.current = true
      const completionReason = hasConversations ? 'conversation_exists' : 'lead_exists'
      
      dlog('[SETUP COMPLETION CHECK]', {
        businessId: business.id,
        hasSuccessfulMissedCall: shouldAutoComplete,
        hasCapturedLead: hasLeads,
        hasConversation: hasConversations,
        hasInitialAutoReply: false, // Would need to check messages
        existingOnboardingStatus: business.onboarding_status,
        completionReason,
        leadCount: processedLeads.length,
        conversationCount: processedLeads.filter(l => l.conversation_id).length
      })

      // Update business record to persist completion
      const persistCompletion = async () => {
        try {
          const supabase = createBrowserClient()
          const updateData: any = {
            forwarding_verified: true,
            forwarding_verified_at: new Date().toISOString(),
            onboarding_status: 'completed'
          }

          // Add setup_completed_at if it exists
          if (business?.setup_completed_at !== undefined) {
            updateData.setup_completed_at = new Date().toISOString()
          }

          const { error } = await supabase
            .from('businesses')
            .update(updateData)
            .eq('id', business.id)

          if (error) {
            console.error('[SETUP AUTO COMPLETED] Failed to persist completion:', error)
            autoCompleteInProgress.current = false
          } else {
            autoCompleteCompleted.current = true
            autoCompleteInProgress.current = false
            dlog('[SETUP AUTO COMPLETED]', {
              businessId: business.id,
              completionReason
            })
          }
        } catch (error) {
          console.error('[SETUP AUTO COMPLETED] Exception persisting completion:', error)
          autoCompleteInProgress.current = false
        }
      }

      persistCompletion()
    }
  }, [business, processedLeads])

  // HARD RENDER GUARD: Single source of truth for subscription status
  // This prevents setup/onboarding UI from rendering for users who have not started trial
  // BETA/COMPED ACCESS: Include beta and comped users for full dashboard access
  const isSubscriptionActive = hasActiveAccess(business)
  
  // Add state resolving flag - wait for business fetch to complete AND subscription state to be stable
  // This prevents flicker by not rendering onboarding UI until state is fully resolved
  const isStateResolving = businessLoading || webhookConfirming
  const isSubscriptionStateResolved = businessFetchComplete && (business?.subscription_status !== null || business?.subscription_status !== undefined)
  const shouldShowLoadingState = isStateResolving || (!isSubscriptionStateResolved && !loadingTimeout)

  
  // CENTRALIZED CHECKOUT RECOVERY FLOW
  // When ?checkout=success is present, wait up to 8 seconds for session restoration
  // This prevents mobile browsers from redirecting to signin unnecessarily
  useEffect(() => {
    const isCheckoutSuccess = checkoutStatus === 'success'
    
    if (!isCheckoutSuccess) {
      return
    }

    dlog('[Checkout Recovery] Starting recovery window for checkout=success')
    setIsRecoveringSession(true)

    // Clean up localStorage markers
    if (typeof window !== 'undefined') {
      localStorage.removeItem('replyflow_checkout_in_progress')
      localStorage.removeItem('replyflow_checkout_return')
    }

    const RECOVERY_TIMEOUT = 8000 // 8 seconds
    const RETRY_INTERVAL = 500 // 500ms
    let recoveryAttempts = 0
    let sessionRestored = false

    const attemptSessionRecovery = async (): Promise<boolean> => {
      recoveryAttempts++

      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('[Checkout Recovery] getSession error:', error.message)
          return false
        }

        if (session && session.user) {
          dlog('[Checkout Recovery] Session restored successfully')
          sessionRestored = true
          return true
        }

        return false
      } catch {
        return false
      }
    }

    const recoveryInterval = setInterval(async () => {
      const restored = await attemptSessionRecovery()
      
      if (restored) {
        clearInterval(recoveryInterval)
        setIsRecoveringSession(false)
        router.replace('/dashboard')
      }
    }, RETRY_INTERVAL)

    // Fallback timeout
    const recoveryTimeout = setTimeout(() => {
      clearInterval(recoveryInterval)

      if (!sessionRestored) {
        setIsRecoveringSession(false)
        router.push('/auth/signin?redirect=/dashboard')
      } else {
        setIsRecoveringSession(false)
        router.replace('/dashboard')
      }
    }, RECOVERY_TIMEOUT)

    return () => {
      clearInterval(recoveryInterval)
      clearTimeout(recoveryTimeout)
    }
  }, [checkoutStatus, searchParams, supabase, router])

  // Add timeout fallback for loading state - 8 seconds max
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (businessLoading || webhookConfirming) {
        setLoadingTimeout(true)
        setWebhookConfirming(false)
      }
    }, 8000) // 8 seconds

    return () => clearTimeout(timeout)
  }, [businessLoading, webhookConfirming])

  // Throttled logging to avoid spamming console
  // Removed debug logging to reduce console noise

  // Admin tools handlers
  const handleReconcileWarmNumbers = async () => {
    setReconciling(true)
    setReconciliationResult(null)
    
    const result = await reconcileWarmNumbers()
    
    setReconciliationResult(result)
    setReconciling(false)
    
    // Auto-refresh stats after reconciliation
    if (result.success) {
      handleRefreshStats()
    }
  }

  const handleRefreshStats = async () => {
    setRefreshingStats(true)
    const result = await getWarmInventoryStats()
    setStats(result)
    setRefreshingStats(false)
  }

  // Removed debug logging

  // Duplicate logging - remove
  // useEffect(() => {
  //   console.log('[Dashboard] Loading state check:', {
  //     businessLoading,
  //     businessFetchComplete,
  //     webhookConfirming,
  //     shouldShowLoading,
  //     subscription_status: business?.subscription_status,
  //     stripe_customer_id: business?.stripe_customer_id,
  //     stripe_subscription_id: business?.stripe_subscription_id,
  //     onboarding_status: business?.onboarding_status,
  //     loadingTimeout,
  //     checkoutStatus
  //   })
  // }, [businessLoading, businessFetchComplete, webhookConfirming, loadingTimeout, business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id, business?.onboarding_status, checkoutStatus])

  // Removed debug logging

  // EMERGENCY BYPASS REMOVED - Restoring full dashboard with selective feature enablement
  // All hooks are called before any conditional returns to prevent React #310

  const handleManageSubscription = async () => {
    setIsOpeningBilling(true)
    setBillingError('')

    try {
      const result = await handleBillingAction()
      
      if (result.success && result.url) {
        window.location.href = result.url
      } else {
        console.error('[Dashboard] Billing action failed:', result.error)
        setBillingError(result.error || 'Failed to open billing portal')
        setIsOpeningBilling(false)
      }
    } catch (error) {
      console.error('[Dashboard] Unexpected error:', error)
      setBillingError('Failed to open billing portal. Please try again.')
      setIsOpeningBilling(false)
    }
  }

  
  const handleStartSubscription = async () => {
    setCheckoutLoading(true)
    console.log('[checkout] ===== STARTING SUBSCRIPTION FLOW =====')
    
    // Eligibility is now handled by useTrialEligibility hook
    
    // Detect mobile device
    const isMobile = typeof window !== 'undefined' && (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth < 768
    )
    
    console.log('[checkout] Mobile device detection:', {
      isMobile,
      userAgent: navigator.userAgent,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight
    })
    
    // Pre-checkout diagnostics
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    console.log('[checkout] ===== PRE-CHECKOUT SESSION CHECK =====')
    console.log('[checkout] Session state before Stripe redirect:', {
      sessionExists: !!session,
      userId: session?.user?.id,
      userEmail: session?.user?.email,
      accessTokenPresent: !!session?.access_token,
      refreshTokenPresent: !!session?.refresh_token,
      expiresAt: session?.expires_at,
      sessionError: sessionError?.message,
      isMobile
    })
    
    // Check for auth-related localStorage keys
    const localStorageKeys: string[] = []
    const localStorageTokenKeys: string[] = []
    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.includes('supabase') || key.includes('auth') || key.includes('sb-'))) {
          localStorageKeys.push(key)
          // Check for specific token keys
          if (key.includes('access_token') || key.includes('refresh_token')) {
            localStorageTokenKeys.push(key)
          }
        }
      }
    }
    console.log('[checkout] Auth-related localStorage keys:', localStorageKeys)
    console.log('[checkout] Token-specific localStorage keys:', localStorageTokenKeys)
    console.log('[checkout] localStorage key count:', localStorageKeys.length)
    
    // Verify session exists before allowing Stripe redirect
    if (!session) {
      console.error('[checkout] ===== SESSION MISSING - BLOCKING CHECKOUT =====')
      console.error('[checkout] No session found before Stripe redirect, blocking checkout')
      setCheckoutError('Please sign in to start your trial. Your session may have expired.')
      setCheckoutLoading(false)
      router.push('/auth/signin?redirect=/dashboard')
      return
    }
    
    // Verify user exists
    if (!session.user) {
      console.error('[checkout] ===== USER MISSING - BLOCKING CHECKOUT =====')
      console.error('[checkout] Session exists but user is missing before Stripe redirect, blocking checkout')
      setCheckoutError('Please sign in to start your trial. Your session may be invalid.')
      setCheckoutLoading(false)
      router.push('/auth/signin?redirect=/dashboard')
      return
    }
    
    // Verify refresh token exists
    if (!session.refresh_token) {
      console.error('[checkout] ===== REFRESH TOKEN MISSING - BLOCKING CHECKOUT =====')
      console.error('[checkout] Session and user exist but refresh token is missing before Stripe redirect, blocking checkout')
      setCheckoutError('Please sign in to start your trial. Your session may be incomplete.')
      setCheckoutLoading(false)
      router.push('/auth/signin?redirect=/dashboard')
      return
    }
    
    console.log('[checkout] ===== SESSION/USER/TOKEN VERIFIED - PROCEEDING WITH STRIPE =====')
    console.log('[checkout] Session, user, and refresh token confirmed, proceeding with checkout')
    
    // Persist temporary checkout markers in localStorage for recovery
    if (typeof window !== 'undefined') {
      localStorage.setItem('replyflow_checkout_in_progress', 'true')
      localStorage.setItem('replyflow_checkout_return', '/dashboard?checkout=success')
      console.log('[checkout] Set localStorage markers for checkout recovery')
    }
    
    try {
      console.log('[Checkout Request Payload]', {
        checkoutMode,
      })
      
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkout_mode: checkoutMode,
        }),
      })
      const data = await response.json()
      
      if (!response.ok) {
        console.error('[checkout] API error:', data)
        // Set inline error instead of browser alert
        if (data.cooldown_end_date) {
          const cooldownDate = new Date(data.cooldown_end_date)
          setCheckoutError(`You can start another free trial after ${cooldownDate.toLocaleDateString()}.`)
        } else if (data.error === 'Business has already used a free trial') {
          setCheckoutError('This business has already used a free trial.')
        } else {
          setCheckoutError(data.error || 'Failed to create checkout session')
        }
        setCheckoutLoading(false)
        return
      }
      
      if (data.url) {
        console.log('[checkout] Redirecting to Stripe checkout:', data.url)
        // Add delay for mobile localStorage persistence
        setTimeout(() => {
          window.location.href = data.url
        }, 500)
      } else {
        console.error('[checkout] No URL returned:', data)
        setCheckoutError('Failed to create checkout session: No URL returned')
        setCheckoutLoading(false)
      }
    } catch (error) {
      console.error('[checkout] Network error:', error)
      setCheckoutError('Network error creating checkout session. Please try again.')
      setCheckoutLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      setTestSmsMessage('')
      await supabase.auth.signOut()
      console.log('[Auth] User signed out')
      router.push('/')
    } catch (error) {
      console.error('[Auth] Sign out error:', error)
    }
  }

  const handleTestSms = async () => {
    if (!business || !supabase) return

    setTestSmsLoading(true)
    setTestSmsMessage('')

    try {
      console.log('[Test Button] Sending test SMS')

      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/test/send-sms', {
        method: 'GET',
        headers,
      })

      const data = await response.json()

      if (response.ok && data.success) {
        console.log('[Test Button] Success')
        setTestSmsMessage(`Test SMS sent to ${data.to}`)
      } else {
        console.log('[Test Button] Failed:', data.error)
        setTestSmsMessage(`Failed to send test SMS. ${data.message || 'Please check your setup.'}`)
      }
    } catch (err: any) {
      console.log('[Test Button] Failed:', err)
      setTestSmsMessage('Failed to send test SMS. Please check your setup.')
    } finally {
      setTestSmsLoading(false)
    }
  }

  const handleManageBilling = async () => {
    setCheckoutLoading(true)
    console.log("Creating Stripe portal session...")
    
    // Get current session
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      console.error('[portal] No session found')
      alert('Please sign in again')
      setCheckoutLoading(false)
      return
    }
    
    try {
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = await response.json()
      
      if (data.url) {
        window.location.href = data.url
      } else {
        console.error('[portal] No URL returned:', data)
      }
    } catch (error) {
      console.error('[portal] Error:', error)
    } finally {
      setCheckoutLoading(false)
    }
  }

  // Add timeout fallback for loading state - 8 seconds max
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (businessLoading || webhookConfirming) {
        console.log('[Dashboard] Loading timeout reached after 8 seconds, forcing render')
        setLoadingTimeout(true)
        setWebhookConfirming(false)
      }
    }, 8000) // 8 seconds

    return () => clearTimeout(timeout)
  }, [businessLoading, webhookConfirming])

  // FULL-SCREEN LOADING GATE: Prevent any UI from rendering until state is resolved
  // This prevents flash of previous setup/onboarding screens during dashboard load
  // Release loading gate when: auth resolved, business fetch resolved, AND (business exists OR no business profile)
  if (authLoading || businessLoading || webhookConfirming || !businessFetchComplete) {
    return <AppLoadingScreen />
  }

  // CENTRAL DASHBOARD GUARD: Prevent incomplete users from accessing full dashboard
  // Uses deriveSetupState to determine if setup is complete and route accordingly
  // Admin/protected accounts are exempt from this guard
  const setupState = deriveSetupState(business)
  const isSetupComplete = setupState === 'complete'
  
  // Check for manual/lifetime access
  const manualAccessActive = (business as any)?.manual_access === true && 
    (!(business as any)?.manual_access_expires_at || new Date((business as any)?.manual_access_expires_at) > new Date())
  const lifetimeAccessActive = (business as any)?.lifetime_access === true
  const subscriptionActive = business?.subscription_status === 'trialing' || 
                         business?.subscription_status === 'active' ||
                         business?.subscription_status === 'beta' ||
                         business?.subscription_status === 'comped' ||
                         business?.stripe_subscription_id
  const hasValidAccess = subscriptionActive || manualAccessActive || lifetimeAccessActive


  if (businessFetchComplete && !businessLoading && business && !isAdmin) {
    // If setup is incomplete, stay on dashboard and show Setup Gate
    // All onboarding now lives in the dashboard - no redirects to separate setup pages
    if (!isSetupComplete) {
      const targetRoute = (() => {
        switch (setupState) {
          case 'needs_trial':
            return null
          case 'provisioning_or_number_pending':
            return null
          case 'needs_forwarding':
            return null
          case 'needs_final_test':
            return null
          default:
            return null
        }
      })()

      if (targetRoute && targetRoute !== pathname) {
        router.push(targetRoute)
        return <AppLoadingScreen />
      }
    }
  }

  // DASHBOARD GATE: Redirect users without complete business profile to onboarding/profile
  // IMPORTANT: Users with trialing/active subscription should NEVER be redirected to onboarding
  if (businessFetchComplete && !businessLoading) {
    // User has no business at all - redirect to onboarding/profile
    if (!business) {
      router.push('/onboarding')
      return <AppLoadingScreen />
    }

    // Check if user has active subscription (trialing or active)
    const hasActiveSubscription = isActiveSubscription(business.subscription_status)

    // User has business but missing required fields - ONLY redirect if NO active subscription
    if (!business.name || !business.business_phone_number) {
      if (!hasActiveSubscription) {
        router.push('/onboarding')
        return <AppLoadingScreen />
      }
      // Allow dashboard access - Setup Progress component will handle incomplete profile
    }
  }

  // Prepare debug info for error boundary
  const debugInfo = {
    pathname: typeof window !== 'undefined' ? window.location.pathname : '/dashboard',
    hasSession: true, // Dashboard is protected by AuthGuard
    businessFetchComplete,
    hasBusiness: !!business,
    subscription_status: business?.subscription_status,
    renderBranch: business ? 'active_dashboard' : 'no_business',
    lastRenderedSection
  }

  // missedCalls is now tracked in state
  console.log('[DASHBOARD] rendering main content')
  console.log('[DASHBOARD] business:', business)
  console.log('[DASHBOARD] subscription_status:', business?.subscription_status)
  console.log('[DASHBOARD] isOnboardingComplete:', isOnboardingComplete)

  console.log('[DASHBOARD] rendering AuthGuard and BusinessGuard')
  console.log('[DASHBOARD RENDER BRANCH] final: main dashboard content')

  // TEMPORARY: Binary search - reintroducing sections one by one
  // Step 1: Header section ✓
  // Step 2: Setup progress section ✓
  // Step 3: ProvisioningSuccessBanner ✓
  // Step 4: SetupHealthBanner ✓
  // Step 5: SuccessBanner ✓
  // Step 6: PaymentIssueBanner ✓
  // Step 7: SubscriptionBanner ✓
  // Step 8: ActivationHero ✓
  // Step 9: LiveActivity ✓
  // Step 10: RecentLeadsSection ✓
  // Step 12: ConversationsSection ✓
  // Step 13: GettingStartedBottom ✓
  // Step 14: Footer (final section)
  return (
    <DashboardErrorBoundary debugInfo={debugInfo}>
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-[#f5f7fb] dark:bg-background flex flex-col relative">
            {/* App Header */}
            <AppHeader showNavigation={true} />

            {/* Main Content */}
            <div className="flex-1 pt-2 sm:pt-3 lg:pt-4 px-3 sm:px-4 lg:px-6 pb-8 relative z-10">
              <div className="max-w-[1400px] mx-auto space-y-1.5 sm:space-y-2 lg:space-y-3">

                {/* Single Collapsible Setup/Status Card - Consolidates all onboarding/health/status banners */}
                <SectionErrorBoundary sectionName="SetupStatusCard">
                  <SetupStatusCard 
                    business={business} 
                    setupHealth={setupHealth}
                    missedCallCount={missedCallCount}
                  />
                </SectionErrorBoundary>

                {/* Out of Office Mode Banner */}
                {business && isBusinessOutOfOffice(business) && (
                  <SectionErrorBoundary sectionName="OutOfOfficeBanner">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <CalendarOff className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                            Out of Office Mode is currently active
                          </h3>
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            Customers are being informed that responses may be delayed.
                          </p>
                          {(() => {
                            const status = getOutOfOfficeStatus(business)
                            if (status.status === 'active' && status.endDate) {
                              const daysRemaining = status.daysRemaining
                              return (
                                <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
                                  Returning {status.endDate.toLocaleDateString()}{daysRemaining !== undefined ? ` (${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining)` : ''}
                                </p>
                              )
                            }
                            return null
                          })()}
                        </div>
                        <Link
                          href="/dashboard/settings#out-of-office"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex-shrink-0"
                        >
                          Settings
                        </Link>
                      </div>
                    </div>
                  </SectionErrorBoundary>
                )}

                {/* Old banners removed - now handled by DashboardHero */}

                {/* Payment issue now handled by DashboardHero */}

                {/* Subscription/Trial status now handled by DashboardHero */}

                {/* Trial/billing blockers now handled by SetupStatusCard */}

                {/* Telecom-active sections: only render once the user has started a trial/subscription. */}
                {hasActiveSubscription(business) ? (
                  <>

                    {/* Dashboard Metrics - De-emphasize when forwarding is not verified */}
                    <SectionErrorBoundary sectionName="DashboardMetrics">
                      <div className={`mb-3 transition-opacity duration-300 ${!business?.forwarding_verified ? 'opacity-40' : ''}`}>
                        <DashboardMetrics business={business} />
                      </div>
                    </SectionErrorBoundary>

                    {/* Latest Lead Section - De-emphasize when forwarding is not verified */}
                    <SectionErrorBoundary sectionName="RecentLeadsSection">
                      <div className={`transition-opacity duration-300 mb-3 ${!business?.forwarding_verified ? 'opacity-40' : ''}`}>
                        {business?.id && (
                          <RecentLeadsSection
                            businessId={business.id}
                            isOnboardingComplete={isOnboardingComplete}
                            provisioningStatus={business?.provisioning_status || 'pending'}
                            forwardingVerified={business?.forwarding_verified || false}
                            isOnboardingExpanded={isOnboardingExpanded}
                          />
                        )}
                      </div>
                    </SectionErrorBoundary>

                    {/* Needs Attention Card - De-emphasize when forwarding is not verified */}
                    <SectionErrorBoundary sectionName="NeedsAttentionCard">
                      <div className={`mb-3 transition-opacity duration-300 ${!business?.forwarding_verified ? 'opacity-40' : ''}`}>
                        <NeedsAttentionCard business={business} />
                      </div>
                    </SectionErrorBoundary>

                    {/* Recent Activity Card - De-emphasize when forwarding is not verified */}
                    <SectionErrorBoundary sectionName="RecentActivityCard">
                      <div className={`mb-3 transition-opacity duration-300 ${!business?.forwarding_verified ? 'opacity-40' : ''}`}>
                        <RecentActivityCard business={business} />
                      </div>
                    </SectionErrorBoundary>

                    {/* Follow-Up Activity Card - De-emphasize when forwarding is not verified */}
                    <SectionErrorBoundary sectionName="FollowUpActivityCard">
                      <div className={`mb-2 transition-opacity duration-300 ${!business?.forwarding_verified ? 'opacity-30 hover:opacity-40' : 'opacity-80 hover:opacity-100'}`}>
                        <FollowUpActivityCard business={business} />
                      </div>
                    </SectionErrorBoundary>

                    {/* Business Wins Card - De-emphasize when forwarding is not verified */}
                    <SectionErrorBoundary sectionName="BusinessWinsCard">
                      <div className={`${!business?.forwarding_verified ? 'opacity-30 hover:opacity-40' : 'opacity-80 hover:opacity-100'} transition-opacity duration-300`}>
                        <BusinessWinsCard business={business} />
                      </div>
                    </SectionErrorBoundary>

                    {/* Beta Feedback Card */}
                    <SectionErrorBoundary sectionName="BetaFeedbackCard">
                      <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              💬 Beta Feedback
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                              Found a bug or have an idea? We'd love to hear your feedback as we improve ReplyFlow.
                            </p>
                          </div>
                          <button
                            onClick={() => setShowBetaFeedbackModal(true)}
                            className="inline-flex items-center justify-center px-4 py-2 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 text-sm font-medium rounded-lg shadow-sm hover:shadow transition-all border border-slate-200 dark:border-slate-600"
                          >
                            Share Feedback
                          </button>
                        </div>
                      </div>
                    </SectionErrorBoundary>
                  </>
                ) : null}

                {/* Admin Tools - Only visible to admin users or development environment */}
                {/* @ts-ignore - Admin tools disabled, moved to /dashboard/admin/diagnostics */}
                {false && (
                  <SectionErrorBoundary sectionName="AdminTools">
                    {/* @ts-ignore */}
                    <div className="bg-slate-900/30 border border-slate-800/30 rounded-lg p-3 sm:p-3.5 mb-4 opacity-75 hover:opacity-100 transition-opacity">
                      {/* Collapsible Header */}
                      <button
                        onClick={() => setAdminPanelCollapsed(!adminPanelCollapsed)}
                        className="w-full flex items-center justify-between gap-3 text-left group"
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <svg
                              className={`w-3 h-3 transition-transform duration-200 ${adminPanelCollapsed ? '' : 'rotate-90'} text-slate-400`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <h2 className="text-[11px] font-medium text-slate-400 dark:text-slate-500">Developer Diagnostics</h2>
                          </div>
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 pl-5.5">Technical provisioning, Twilio status, webhook diagnostics, and onboarding health</span>
                        </div>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono opacity-60 bg-slate-50 dark:bg-slate-800/30 px-1.5 py-0.5 rounded border border-slate-200/30 dark:border-slate-700/30">DEV_ONLY</span>
                      </button>

                      {/* Collapsible Content */}
                      {!adminPanelCollapsed && (
                        <div className="mt-4 space-y-4">
                          {/* Provisioning Status */}
                          <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200/50 dark:border-slate-700/50">
                            <h3 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Provisioning</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Status:</span>
                                <span className={`font-mono ${
                                  business?.provisioning_status === 'active' ? 'text-green-400' : 
                                  business?.provisioning_status === 'failed' ? 'text-red-400' : 
                                  business?.provisioning_status === 'assigned' ? 'text-blue-400' : 
                                  business?.provisioning_status === 'ready' ? 'text-yellow-400' : 
                                  'text-slate-300'
                                }`}>
                                  {business?.provisioning_status || 'N/A'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Twilio SID:</span>
                                <span className="font-mono text-slate-300 truncate max-w-[120px]" title={business?.twilio_phone_number_sid || 'N/A'}>
                                  {business?.twilio_phone_number_sid ? 
                                    `${business?.twilio_phone_number_sid?.slice(0, 8)}...` : 
                                    'N/A'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Phone:</span>
                                <span className="font-mono text-slate-300">{business?.twilio_phone_number || 'N/A'}</span>
                              </div>
                              {business?.provisioning_error && (
                                <div className="flex justify-between col-span-full">
                                  <span className="text-slate-500">Error:</span>
                                  <span className="text-red-400 font-mono text-[10px] truncate max-w-[200px]" title={business?.provisioning_error || ''}>
                                    {business?.provisioning_error}
                                  </span>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={async () => {
                                if (!business?.id) return;
                                
                                const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com';
                                
                                try {
                                  const response = await fetch(`${appUrl}/api/business/retry-provisioning`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ business_id: business.id }),
                                  });

                                  const result = await response.json();

                                  if (result.success) {
                                    console.log('[Retry Provisioning] Success:', result);
                                    alert('Provisioning retry initiated successfully');
                                    window.location.reload();
                                  } else {
                                    console.error('[Retry Provisioning] Failed:', result.error);
                                    alert(`Provisioning retry failed: ${result.error}`);
                                  }
                                } catch (error: any) {
                                  console.error('[Retry Provisioning] Exception:', error);
                                  alert(`Provisioning retry failed: ${error.message}`);
                                }
                              }}
                              disabled={!business?.id}
                              className="mt-2 w-full bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Retry Provisioning
                            </button>
                          </div>

                          {/* Warm Number Inventory */}
                          <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200/50 dark:border-slate-700/50">
                            <h3 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Warm Number Inventory</h3>
                            {stats?.success ? (
                              <div className="flex gap-4 text-xs">
                                <div className="flex-1">
                                  <div className="text-slate-500 mb-1">Available</div>
                                  <div className={`px-2 py-1 rounded font-mono text-center ${
                                    stats.stats.availableCount > 0 ? 'bg-green-900/30 text-green-400' : 'bg-slate-700 text-slate-400'
                                  }`}>
                                    {stats.stats.availableCount}
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <div className="text-slate-500 mb-1">Assigned</div>
                                  <div className="px-2 py-1 rounded font-mono text-center bg-blue-900/30 text-blue-400">
                                    {stats.stats.assignedCount}
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <div className="text-slate-500 mb-1">Failed</div>
                                  <div className={`px-2 py-1 rounded font-mono text-center ${
                                    stats.stats.failedCount > 0 ? 'bg-red-900/30 text-red-400' : 'bg-slate-700 text-slate-400'
                                  }`}>
                                    {stats.stats.failedCount}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500">Loading stats...</div>
                            )}
                            <button
                              onClick={handleRefreshStats}
                              disabled={refreshingStats}
                              className="mt-2 w-full bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {refreshingStats ? 'Refreshing...' : 'Refresh Stats'}
                            </button>
                          </div>

                          {/* Recovery / Repair */}
                          <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200/50 dark:border-slate-700/50">
                            <h3 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Recovery / Repair</h3>
                            <button
                              onClick={handleReconcileWarmNumbers}
                              disabled={reconciling}
                              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {reconciling ? 'Reconciling...' : 'Reconcile Warm Numbers'}
                            </button>

                            {reconciliationResult && (
                              <div className="mt-2 text-xs">
                                {reconciliationResult.success ? (
                                  <div className="text-green-400 space-y-1">
                                    <div className="font-medium">Reconciliation Complete</div>
                                    <div className="grid grid-cols-2 gap-1 text-slate-400">
                                      <div>Checked: {reconciliationResult.data.checked_count}</div>
                                      <div>Kept: {reconciliationResult.data.kept_available_count}</div>
                                      <div>Failed: {reconciliationResult.data.marked_failed_count}</div>
                                      <div>Replenished: {reconciliationResult.data.replenished_count}</div>
                                    </div>
                                    <div className="text-slate-400">Available After: {reconciliationResult.data.available_after}</div>
                                  </div>
                                ) : (
                                  <div className="text-red-400">Error: {reconciliationResult.error}</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </SectionErrorBoundary>
                )}
              </div>
            </div>

            {/* Beta Feedback Modal */}
            <BetaFeedbackModal
              isOpen={showBetaFeedbackModal}
              onClose={() => setShowBetaFeedbackModal(false)}
            />

            {/* Footer */}
            <SectionErrorBoundary sectionName="Footer">
              {(() => {
                console.log('[Render Child] Footer')
                return null
              })()}
              <footer className="border-t border-border/50 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40 mt-6">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-muted-foreground/60">
                      © {new Date().getFullYear()} ReplyFlow. All rights reserved.
                    </div>
                    <div className="flex items-center gap-6 text-xs">
                      <a href="/privacy" className="text-muted-foreground/60 hover:text-foreground/80 transition-colors">
                        Privacy
                      </a>
                      <a href="/terms" className="text-muted-foreground/60 hover:text-foreground/80 transition-colors">
                        Terms
                      </a>
                      <a href="/compliance" className="text-muted-foreground/60 hover:text-foreground/80 transition-colors">
                        Compliance
                      </a>
                    </div>
                  </div>
                </div>
              </footer>
            </SectionErrorBoundary>
          </div>
        </BusinessGuard>
      </AuthGuard>
      <RoutingDebugBanner />
      <BottomNavigation />
      {pathname === '/dashboard' && (
        <FloatingHelpButton context={{
          currentPage: 'dashboard',
          hasLeads: processedLeads.length > 0,
          hasRecentActivity: processedLeads.length > 0,
          forwardingVerified: business?.forwarding_verified ?? false,
          calendarConnected: undefined,
          isTrial: business?.subscription_status === 'trial'
        }} />
      )}
    </DashboardErrorBoundary>
  )
}
