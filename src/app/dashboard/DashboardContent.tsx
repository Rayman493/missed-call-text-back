'use client'

// @ts-nocheck - TypeScript disabled due to disabled Admin Tools section with complex type checking

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useTrialEligibility } from '@/hooks/useTrialEligibility'
import AppLoadingScreen from '@/components/AppLoadingScreen'
import { AuthDebugPanel } from '@/components/AuthDebugPanel'
import { isAdminUser } from '@/lib/admin'
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
import { hasActiveAccess, hasActiveTrial, hasActiveSubscription } from '@/lib/subscription-utils'
import { PRICING_CONFIG } from '@/lib/pricing'
import { handleBillingAction } from '@/lib/billing'
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
import LiveActivity from '@/components/LiveActivity'
import GettingStarted from '@/components/GettingStarted'
import OffboardingBanner from '@/components/OffboardingBanner'
import ProvisioningSuccessBanner from '@/components/ProvisioningSuccessBanner'
import Footer from '@/components/Footer'
import Image from 'next/image'
import { RealtimeChannel } from '@supabase/supabase-js'
import RecentLeadsSection from '@/components/RecentLeadsSection'
import StatsCards from '@/components/StatsCards'
import SectionErrorBoundary from '@/components/SectionErrorBoundary'
import BusinessActivity from '@/components/BusinessActivity'
import NoBusinessSetup from '@/components/NoBusinessSetup'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import { reconcileWarmNumbers, getWarmInventoryStats } from '@/app/admin/actions'
import { getBusinessOnboardingState, getEmptyStateCopy, BusinessData } from '@/lib/onboarding-state'

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
  console.log('[HOOK ORDER CHECK] dashboard render start')
  
  // Trace log at dashboard component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[TRACE Dashboard Mounted]', {
        pathname: window.location.pathname,
        search: window.location.search
      })
    }
  }, [])

  const { business, loading: businessLoading, fetchComplete: businessFetchComplete, refreshBusiness } = useBusiness()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Trace log on Dashboard render
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      const checkoutSuccess = url.searchParams.get('checkout') === 'success'
      console.log('[TRACE Dashboard Render]', {
        pathname: window.location.pathname,
        search: window.location.search,
        checkoutSuccess,
        sessionExists: !!user,
        userExists: !!user,
        businessStatus: business?.subscription_status,
        subscriptionStatus: business?.subscription_status
      })
    }
  }, [user, business])

  // Check if user is admin based on email allowlist
  const isAdmin = isAdminUser(user?.email)
  
  // ALL hooks must be called before any conditional returns to prevent React #310
  const [processedLeads, setProcessedLeads] = useState<any[]>([])
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
  const [isSetupBannerDismissed, setIsSetupBannerDismissed] = useState(false)
  const [adminPanelCollapsed, setAdminPanelCollapsed] = useState(true)
  const [loadingTimeout, setLoadingTimeout] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [refreshingStats, setRefreshingStats] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [reconciliationResult, setReconciliationResult] = useState<any>(null)
  const [lastRenderedSection, setLastRenderedSection] = useState('')
  const [isRecoveringSession, setIsRecoveringSession] = useState(false)
  
  const checkoutStatus = searchParams?.get('checkout')
  const supabase = createBrowserClient()

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
      hasSuccessfulSms: false // Would need to check message status
    })
  }, [business, processedLeads])

  // HARD RENDER GUARD: Single source of truth for subscription status
  // This prevents setup/onboarding UI from rendering for users who have not started trial
  const isSubscriptionActive = business?.subscription_status === 'trialing' || business?.subscription_status === 'active'
  
  console.log('[Render Guard] DashboardContent subscription check', {
    subscription_status: business?.subscription_status,
    isSubscriptionActive,
    loading: businessLoading,
    fetchComplete: businessFetchComplete
  })

  // Add state resolving flag - wait for business fetch to complete AND subscription state to be stable
  // This prevents flicker by not rendering onboarding UI until state is fully resolved
  const isStateResolving = businessLoading || webhookConfirming
  const isSubscriptionStateResolved = businessFetchComplete && (business?.subscription_status !== null || business?.subscription_status !== undefined)
  const shouldShowLoadingState = isStateResolving || (!isSubscriptionStateResolved && !loadingTimeout)

  // Log state resolution for debugging
  useEffect(() => {
    console.log('[Dashboard State Resolution]', {
      businessLoading,
      businessFetchComplete,
      webhookConfirming,
      isStateResolving,
      isSubscriptionStateResolved,
      shouldShowLoadingState,
      loadingTimeout,
      subscription_status: business?.subscription_status,
      twilio_phone_number: business?.twilio_phone_number,
      provisioning_status: business?.provisioning_status,
      derivedOnboardingState: onboardingState?.state
    })
  }, [businessLoading, businessFetchComplete, webhookConfirming, isStateResolving, isSubscriptionStateResolved, shouldShowLoadingState, loadingTimeout, business?.subscription_status, business?.twilio_phone_number, business?.provisioning_status, onboardingState?.state])

  // Initialize setup banner dismissal state from sessionStorage
  useEffect(() => {
    const dismissed = sessionStorage.getItem('replyflow_setup_banner_dismissed') === 'true'
    setIsSetupBannerDismissed(dismissed)
  }, [])

  
  // CENTRALIZED CHECKOUT RECOVERY FLOW
  // When ?checkout=success is present, wait up to 8 seconds for session restoration
  // This prevents mobile browsers from redirecting to signin unnecessarily
  useEffect(() => {
    const isCheckoutSuccess = checkoutStatus === 'success'
    
    if (!isCheckoutSuccess) {
      return
    }

    console.log('[Checkout Recovery] Starting recovery window for checkout=success')
    setIsRecoveringSession(true)

    const sessionId = searchParams?.get('session_id')
    console.log('[Checkout Recovery] Session ID:', sessionId)

    // Clean up localStorage markers
    if (typeof window !== 'undefined') {
      localStorage.removeItem('replyflow_checkout_in_progress')
      localStorage.removeItem('replyflow_checkout_return')
      console.log('[Checkout Recovery] Cleaned up localStorage markers')
    }

    const RECOVERY_TIMEOUT = 8000 // 8 seconds
    const RETRY_INTERVAL = 500 // 500ms
    let recoveryAttempts = 0
    let sessionRestored = false

    const attemptSessionRecovery = async (): Promise<boolean> => {
      recoveryAttempts++
      console.log(`[Checkout Recovery] Attempt ${recoveryAttempts} to restore session`)

      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.log('[Checkout Recovery] getSession error:', error.message)
          return false
        }

        if (session && session.user) {
          console.log('[Checkout Recovery] Session restored successfully', {
            userId: session.user.id,
            email: session.user.email
          })
          sessionRestored = true
          return true
        }

        console.log('[Checkout Recovery] Session not yet available')
        return false
      } catch (error) {
        console.log('[Checkout Recovery] getSession exception:', error)
        return false
      }
    }

    const recoveryInterval = setInterval(async () => {
      const restored = await attemptSessionRecovery()
      
      if (restored) {
        clearInterval(recoveryInterval)
        console.log('[Checkout Recovery] Session restored, ending recovery mode')
        setIsRecoveringSession(false)
        
        // Clean URL params
        router.replace('/dashboard')
      }
    }, RETRY_INTERVAL)

    // Fallback timeout
    const recoveryTimeout = setTimeout(() => {
      clearInterval(recoveryInterval)
      
      if (!sessionRestored) {
        console.log('[Checkout Recovery] Recovery failed after timeout, redirecting to signin')
        setIsRecoveringSession(false)
        router.push('/auth/signin?redirect=/dashboard')
      } else {
        console.log('[Checkout Recovery] Timeout reached but session was restored')
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
        console.log('[Dashboard] Loading timeout reached after 8 seconds, forcing render')
        setLoadingTimeout(true)
        setWebhookConfirming(false)
      }
    }, 8000) // 8 seconds

    return () => clearTimeout(timeout)
  }, [businessLoading, webhookConfirming])

  // Throttled logging to avoid spamming console
  useEffect(() => {
    console.log('[Dashboard] Loading state check:', {
      businessLoading,
      webhookConfirming,
      shouldShowLoading: businessLoading || webhookConfirming,
      subscription_status: business?.subscription_status,
      stripe_customer_id: business?.stripe_customer_id,
      stripe_subscription_id: business?.stripe_subscription_id,
      onboarding_status: business?.onboarding_status,
      loadingTimeout,
      checkoutStatus
    })
  }, [businessLoading, webhookConfirming, loadingTimeout, business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id, business?.onboarding_status, checkoutStatus])

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

  // Log when Admin Tools mounts
  useEffect(() => {
    console.log('[Admin Tools] mounted')
    handleRefreshStats()
  }, [])

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

  console.log('[HOOK ORDER CHECK] all hooks completed')

  // EMERGENCY BYPASS REMOVED - Restoring full dashboard with selective feature enablement
  // All hooks are called before any conditional returns to prevent React #310

  const handleDismissSetupBanner = () => {
    setIsSetupBannerDismissed(true)
    sessionStorage.setItem('replyflow_setup_banner_dismissed', 'true')
  }
  
  const handleManageSubscription = async () => {
    console.log('[Dashboard] Manage Subscription clicked')
    setIsOpeningBilling(true)
    setBillingError('')

    try {
      const result = await handleBillingAction()
      
      if (result.success && result.url) {
        console.log('[Dashboard] Redirecting to:', result.url, result.action)
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
    console.log('[Dashboard Gate] loading - waiting for auth/business/subscription/state to resolve', {
      authLoading,
      businessLoading,
      webhookConfirming,
      businessFetchComplete,
      hasBusiness: !!business,
      onboardingState: onboardingState?.state,
      subscription_status: business?.subscription_status
    })
    return <AppLoadingScreen />
  }

  // State is resolved - log which dashboard state we're rendering
  if (!isSubscriptionActive) {
    console.log('[Dashboard Gate] rendering pre-trial dashboard', {
      subscription_status: business?.subscription_status,
      isSubscriptionActive
    })
  } else {
    console.log('[Dashboard Gate] rendering active setup dashboard', {
      subscription_status: business?.subscription_status,
      isSubscriptionActive
    })
  }

  console.log('[Dashboard Gate] resolved - state fully loaded', {
    subscription_status: business?.subscription_status,
    isSubscriptionActive,
    onboardingState: onboardingState.state,
    hasBusiness: !!business
  })

  // If loading timeout reached, show dashboard anyway (don't render blank)
  if (loadingTimeout) {
    console.log('[Dashboard] Loading timeout, rendering dashboard anyway')
  }

  // DASHBOARD GATE: Redirect users without complete business profile to onboarding/profile
  // IMPORTANT: Users with trialing/active subscription should NEVER be redirected to onboarding
  if (businessFetchComplete && !businessLoading) {
    // User has no business at all - redirect to onboarding/profile
    if (!business) {
      console.log('[Post Trial Routing Decision]', {
        pathname: '/dashboard',
        destination: '/onboarding',
        subscriptionStatus: null,
        onboardingStatus: null,
        hasBusiness: false,
        reason: 'No business exists'
      })
      console.log('[Dashboard Gate] No business found, redirecting to onboarding/profile')
      router.push('/onboarding')
      return <AppLoadingScreen />
    }
    
    // Check if user has active subscription (trialing or active)
    const hasActiveSubscription = isActiveSubscription(business.subscription_status)
    
    // User has business but missing required fields - ONLY redirect if NO active subscription
    if (!business.name || !business.business_phone_number) {
      if (hasActiveSubscription) {
        console.log('[Post Trial Routing Decision]', {
          pathname: '/dashboard',
          destination: 'dashboard',
          subscriptionStatus: business.subscription_status,
          onboardingStatus: business.onboarding_status,
          hasBusiness: true,
          reason: 'Active subscription allows dashboard access despite missing profile'
        })
        console.log('[Dashboard Gate] User has active subscription, allowing dashboard access despite missing profile', {
          subscriptionStatus: business.subscription_status,
          hasName: !!business.name,
          hasPhone: !!business.business_phone_number
        })
        // Allow dashboard access - Setup Progress component will handle incomplete profile
      } else {
        console.log('[Post Trial Routing Decision]', {
          pathname: '/dashboard',
          destination: '/onboarding',
          subscriptionStatus: business.subscription_status,
          onboardingStatus: business.onboarding_status,
          hasBusiness: true,
          reason: 'No active subscription AND missing profile'
        })
        console.log('[Dashboard Gate] Business missing name or phone AND no active subscription, redirecting to onboarding/profile', {
          hasName: !!business.name,
          hasPhone: !!business.business_phone_number,
          subscriptionStatus: business.subscription_status
        })
        router.push('/onboarding')
        return <AppLoadingScreen />
      }
    }
  }

  // Log when rendering active dashboard
  if (business) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    console.log('[rendering active dashboard]', {
      isMobile,
      hasBusiness: !!business,
      subscription_status: business?.subscription_status,
      onboarding_status: business?.onboarding_status
    })
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
  // Step 10: StatsCards ✓
  // Step 11: RecentLeadsSection ✓
  // Step 12: ConversationsSection ✓
  // Step 13: GettingStartedBottom ✓
  // Step 14: Footer (final section)
  return (
    <DashboardErrorBoundary debugInfo={debugInfo}>
      <AuthGuard>
        <BusinessGuard>
          <AuthDebugPanel />
          <div className="min-h-screen bg-[#f5f7fb] dark:bg-background flex flex-col relative">
            {/* App Header */}
            <AppHeader showNavigation={true} />

            {/* Main Content */}
            <div className="flex-1 pt-5 sm:pt-6 lg:pt-6 px-3 sm:px-4 lg:px-6 pb-20 relative z-10">
              <div className="max-w-[1600px] mx-auto space-y-2 sm:space-y-4">
                
                {/* Temporary Admin Debug Button */}
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Admin Debug
                      </span>
                    </div>
                    <Link
                      href="/app-debug/auth"
                      className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm font-medium"
                    >
                      View Auth Debug Logs
                    </Link>
                  </div>
                </div>
                        
                {/* Determine if onboarding is fully complete */}
                {/* Only show setup progress and test banner when subscription is active/trialing AND state is fully resolved */}
                {isSubscriptionActive && onboardingState.state !== 'PRE_TRIAL' && onboardingState.state !== 'ACTIVATING' && (onboardingState.state as string) !== 'unknown' && !shouldShowLoadingState && (
                  <SectionErrorBoundary sectionName="SetupProgress">
                    {(() => {
                      console.log('[Render Guard] GettingStarted rendered', {
                        subscription_status: business?.subscription_status,
                        isSubscriptionActive,
                        allowed: true
                      })
                      console.log('[Dashboard Routing] Rendering GettingStarted section', {
                        section: 'SetupProgress',
                        pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
                        hasBusiness: !!business,
                        subscriptionStatus: business?.subscription_status,
                        onboardingStatus: business?.onboarding_status,
                        derivedOnboardingState: onboardingState.state,
                        shouldShowLoadingState,
                      })
                      console.log('[Render Child] SetupProgress')
                      return null
                    })()}
                    <GettingStarted isOnboardingComplete={isOnboardingComplete} />
                  </SectionErrorBoundary>
                )}

                {/* HARD RENDER GUARD: ProvisioningSuccessBanner if subscription is active */}
                {isSubscriptionActive && (
                  <SectionErrorBoundary sectionName="ProvisioningSuccessBanner">
                      {(() => {
                        console.log('[Render Guard] ProvisioningSuccessBanner rendered', {
                          subscription_status: business?.subscription_status,
                          isSubscriptionActive,
                          checkoutStatus,
                          allowed: true
                        })
                        console.log('[SECTION RENDER]', {
                          section: 'ProvisioningSuccessBanner',
                          mobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
                          hasBusiness: !!business,
                          subscriptionStatus: business?.subscription_status,
                          onboardingStatus: business?.onboarding_status,
                          checkoutStatus
                        })
                        console.log('[Render Child] ProvisioningSuccessBanner')
                        return null
                      })()}
                      <ProvisioningSuccessBanner checkoutSuccess={checkoutStatus === 'success'} />
                    </SectionErrorBoundary>
                )}

                {/* Subscription Alerts - Only show when action needed */}
                {/* Payment Issue Warning - High Priority */}
                {(business?.subscription_status === 'past_due' || business?.subscription_status === 'unpaid') && (
                  <SectionErrorBoundary sectionName="PaymentIssueBanner">
                    {(() => {
                      console.log('[Render Child] PaymentIssueBanner')
                      return null
                    })()}
                    <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">⚠️</span>
                          <div>
                            <p className="text-sm font-semibold text-red-100">
                              Payment issue — update billing to keep ReplyFlow active
                            </p>
                            <p className="text-xs text-red-300">
                              {getSubscriptionStatusText(business?.subscription_status)} • Update payment method to continue service
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={handleManageSubscription}
                          disabled={isOpeningBilling}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isOpeningBilling ? 'Opening…' : 'Update Billing'}
                        </button>
                      </div>
                    </div>
                  </SectionErrorBoundary>
                )}

                {/* Consolidated Subscription/Trial Status Banner */}
                {hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && (
                  <SectionErrorBoundary sectionName="SubscriptionBanner">
                    {(() => {
                      console.log('[Render Child] SubscriptionBanner')
                      return null
                    })()}
                    {(() => {
                      const isScheduledToCancelValue = isScheduledToCancel(business?.cancel_at, business?.cancel_at_period_end)
                      const isInTrial = isInTrialPeriod(business?.subscription_status)
                      
                      // If scheduled to cancel, show cancellation banner (supersedes trial banner)
                      if (isScheduledToCancelValue) {
                        const endDate = isInTrial ? business?.trial_ends_at : business?.current_period_end
                        const formattedDate = formatDate(endDate)
                        
                        return (
                          <div className="bg-amber-900/20 border border-amber-900/40 rounded-xl p-4">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <span className="text-xl">⏰</span>
                                <div>
                                  <p className="text-sm font-semibold text-amber-100">
                                    {isInTrial ? 'Trial cancelled' : 'Subscription cancelled'}
                                  </p>
                                  <p className="text-xs text-amber-300">
                                    {isInTrial 
                                      ? (formattedDate 
                                        ? `You can continue using ReplyFlow until ${formattedDate}. You will not be charged.`
                                        : 'You can continue using ReplyFlow until your trial ends. You will not be charged.')
                                      : (formattedDate
                                        ? `Access remains active until ${formattedDate}.`
                                        : 'Access remains active until your subscription ends.')
                                    }
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={handleManageSubscription}
                                disabled={isOpeningBilling}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isOpeningBilling ? 'Opening…' : (isInTrial ? 'Reactivate Trial' : 'Resume Plan')}
                              </button>
                            </div>
                          </div>
                        )
                      }
                      
                      // If in trial and not cancelled, show trial banner - REMOVED to reduce dashboard clutter
                      // Trial status now shown in Setup Progress card as compact pill
                      if (isInTrial) {
                        // Return null to remove the full-width banner
                        return null
                      }
                      
                      // Active subscription (not trial, not cancelled) - no banner needed
                      return null
                    })()}
                  </SectionErrorBoundary>
                )}

                {/* Pre-trial activation CTA - compact, not hero-sized */}
                {!hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && (
                  <SectionErrorBoundary sectionName="ActivationCTA">
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border border-blue-200 dark:border-blue-800 p-4 sm:p-5">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div>
                            <h3 className="text-base font-semibold text-foreground mb-1">
                              {eligibilityLoading ? 'Checking plan...' : (checkoutMode === 'trial' ? 'Start your free trial' : 'Subscribe Now')}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {eligibilityLoading 
                                ? 'Determining your subscription options...'
                                : (checkoutMode === 'trial' 
                                  ? 'Activate ReplyFlow to begin capturing missed calls automatically.'
                                  : 'Activate ReplyFlow to begin capturing missed calls automatically.'
                                )
                              }
                            </p>
                          </div>
                          <button
                            onClick={handleStartSubscription}
                            disabled={checkoutLoading || eligibilityLoading}
                            className="inline-flex items-center justify-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {checkoutLoading ? 'Starting…' : (eligibilityLoading ? 'Checking plan...' : (checkoutMode === 'trial' ? 'Start Free Trial' : 'Subscribe Now'))}
                          </button>
                        </div>
                        {checkoutError && (
                          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                            <p className="text-sm text-red-800 dark:text-red-200 font-medium mb-1">{checkoutError}</p>
                            <p className="text-xs text-red-600 dark:text-red-400">
                              Need help? Contact <a href="mailto:support@replyflowhq.com" className="underline hover:no-underline">support@replyflowhq.com</a> and we'll take a look.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </SectionErrorBoundary>
                )}

                {/* Locked Dashboard Preview - Show what users will unlock */}
                {!hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && (
                  <SectionErrorBoundary sectionName="LockedDashboardPreview">
                    <div className="relative">
                      {/* Dashboard Preview Content */}
                      <div className="space-y-4 sm:space-y-6">
                        {/* Setup Progress Preview */}
                        <div className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base sm:text-lg font-semibold text-foreground">Setup Progress</h3>
                            <div className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Preview</span>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                              <span className="text-sm text-slate-500 dark:text-slate-400">Business phone number</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                              <span className="text-sm text-slate-500 dark:text-slate-400">Call forwarding setup</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                              <span className="text-sm text-slate-500 dark:text-slate-400">Test your setup</span>
                            </div>
                          </div>
                        </div>

                        {/* Recent Leads Preview */}
                        <div className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base sm:text-lg font-semibold text-foreground">Recent Leads</h3>
                            <div className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Preview</span>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                                <div>
                                  <div className="w-24 h-4 bg-slate-200 dark:bg-slate-700 rounded mb-1"></div>
                                  <div className="w-16 h-3 bg-slate-200 dark:bg-slate-700 rounded"></div>
                                </div>
                              </div>
                              <div className="w-16 h-6 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                                <div>
                                  <div className="w-24 h-4 bg-slate-200 dark:bg-slate-700 rounded mb-1"></div>
                                  <div className="w-16 h-3 bg-slate-200 dark:bg-slate-700 rounded"></div>
                                </div>
                              </div>
                              <div className="w-16 h-6 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                                <div>
                                  <div className="w-24 h-4 bg-slate-200 dark:bg-slate-700 rounded mb-1"></div>
                                  <div className="w-16 h-3 bg-slate-200 dark:bg-slate-700 rounded"></div>
                                </div>
                              </div>
                              <div className="w-16 h-6 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Lock Overlay */}
                      <div className="absolute inset-0 bg-slate-900/40 dark:bg-slate-900/60 backdrop-blur-[2px] rounded-xl flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-12 h-12 bg-slate-800/80 dark:bg-slate-700/80 rounded-full flex items-center justify-center mb-4 mx-auto">
                            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </div>
                          <p className="text-white font-medium mb-4">Start your trial to unlock your ReplyFlow dashboard</p>
                          <button
                            onClick={() => {
                              setCheckoutError(null)
                              handleStartSubscription()
                            }}
                            disabled={checkoutLoading || eligibilityLoading}
                            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {checkoutLoading ? 'Starting…' : (eligibilityLoading ? 'Checking plan...' : (checkoutMode === 'trial' ? 'Start Free Trial' : 'Subscribe Now'))}
                          </button>
                        </div>
                      </div>
                    </div>
                  </SectionErrorBoundary>
                )}

                {/* Telecom-active sections: only render once the user has started a trial/subscription. */}
                {hasActiveSubscription(business) ? (
                  <>
                    {/* Live Activity Section - Top Priority */}
                    <SectionErrorBoundary sectionName="LiveActivity">
                      {(() => {
                        console.log('[SECTION RENDER]', {
                          section: 'LiveActivity',
                          mobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
                          hasBusiness: !!business,
                          subscriptionStatus: business?.subscription_status,
                          onboardingStatus: business?.onboarding_status
                        })
                        console.log('[Render Child] LiveActivity')
                        return null
                      })()}
                      {/* Hide LiveActivity when Setup Progress is visible to avoid redundant messaging */}
                      {!(!isOnboardingComplete && hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && business?.twilio_phone_number) && (
                        <div className="mb-4 transition-opacity duration-300">
                          <LiveActivity 
                            isOnboardingComplete={isOnboardingComplete}
                            provisioningStatus={business?.provisioning_status || 'pending'}
                            forwardingVerified={business?.forwarding_verified || false}
                          />
                        </div>
                      )}
                    </SectionErrorBoundary>

                    {/* Hero Metrics Section - always visible to maintain operational feel */}
                    <SectionErrorBoundary sectionName="StatsCards">
                      {(() => {
                        console.log('[SECTION RENDER]', {
                          section: 'StatsCards',
                          mobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
                          hasBusiness: !!business,
                          subscriptionStatus: business?.subscription_status,
                          onboardingStatus: business?.onboarding_status
                        })
                        console.log('[Render Child] StatsCards')
                        return null
                      })()}
                      <div className="transition-opacity duration-300 mb-2">
                        {business?.id && (
                          <StatsCards 
                            businessId={business.id} 
                            isOnboardingComplete={isOnboardingComplete}
                            provisioningStatus={business?.provisioning_status || 'pending'}
                            forwardingVerified={business?.forwarding_verified || false}
                          />
                        )}
                      </div>
                    </SectionErrorBoundary>

                    {/* Recent Leads Section */}
                    <SectionErrorBoundary sectionName="RecentLeadsSection">
                      {(() => {
                        console.log('[SECTION RENDER]', {
                          section: 'RecentLeadsSection',
                          mobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
                          hasBusiness: !!business,
                          subscriptionStatus: business?.subscription_status,
                          onboardingStatus: business?.onboarding_status
                        })
                        console.log('[Render Child] RecentLeadsSection')
                        return null
                      })()}
                      {/* Hide RecentLeadsSection when onboarding is expanded to avoid duplicate messaging */}
                      {!(isOnboardingExpanded && !isOnboardingComplete && hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && business?.twilio_phone_number) && (
                        <div className="transition-opacity duration-300 mb-2">
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
                      )}
                    </SectionErrorBoundary>

                    {/* Conversations Section */}
                    <SectionErrorBoundary sectionName="ConversationsSection">
                      {(() => {
                        console.log('[SECTION RENDER]', {
                          section: 'ConversationsSection',
                          mobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
                          hasBusiness: !!business,
                          subscriptionStatus: business?.subscription_status,
                          onboardingStatus: business?.onboarding_status
                        })
                        console.log('[Render Child] ConversationsSection')
                        return null
                      })()}
                      {(() => {
                        console.log('[Dashboard Render] ConversationsSection')
                        return null
                      })()}
                      {/* Only show conversations section when onboarding is complete */}
                      {isOnboardingComplete && (
                        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                              <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                              </svg>
                            </div>
                            <div>
                              <h2 className="text-lg font-semibold text-foreground">No customer replies yet</h2>
                              <p className="text-sm text-slate-600 dark:text-slate-400">
                                When a customer replies to a ReplyFlow text, you'll see the conversation here.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
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

            {/* Footer */}
            <SectionErrorBoundary sectionName="Footer">
              {(() => {
                console.log('[Render Child] Footer')
                return null
              })()}
              <footer className="border-t border-border/50 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40 mt-12">
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
    </DashboardErrorBoundary>
  )
}
