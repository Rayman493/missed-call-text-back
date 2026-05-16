'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
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
import SectionErrorBoundary from '@/components/SectionErrorBoundary'

// ErrorBoundary component to catch dashboard render errors
class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    console.error('[DASHBOARD ERROR BOUNDARY] Caught error:', error)
    console.error('[DASHBOARD ERROR BOUNDARY] Error stack:', error.stack)
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[DASHBOARD ERROR BOUNDARY] Component stack:', errorInfo.componentStack)
  }

  render() {
    if (this.state.hasError) {
      console.error('[DASHBOARD ERROR BOUNDARY] Rendering fallback for error:', this.state.error)
      return this.props.fallback || (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-red-900/20 border border-red-900/40 rounded-xl p-6">
            <h2 className="text-xl font-bold text-red-100 mb-4">Dashboard Error</h2>
            <p className="text-red-300 text-sm mb-4">
              A component failed to render. This has been logged for debugging.
            </p>
            <details className="text-xs text-red-400">
              <summary>Error details</summary>
              <pre className="mt-2 whitespace-pre-wrap">{this.state.error?.message}</pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

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

export default function DashboardContent() {
  console.log('[HOOK ORDER CHECK] dashboard render start')

  const { business, loading: businessLoading, fetchComplete: businessFetchComplete, refreshBusiness } = useBusiness()
  
  // ALL hooks must be called before any conditional returns to prevent React #310
  const [processedLeads, setProcessedLeads] = useState<any[]>([])
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [isSetupBannerDismissed, setIsSetupBannerDismissed] = useState(false)
  const [webhookConfirming, setWebhookConfirming] = useState(false)
  const [testSmsLoading, setTestSmsLoading] = useState(false)
  const [testSmsMessage, setTestSmsMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [billingError, setBillingError] = useState('')
  const [isOpeningBilling, setIsOpeningBilling] = useState(false)
  const [loadingTimeout, setLoadingTimeout] = useState(false)
  const searchParams = useSearchParams()
  const checkoutStatus = searchParams?.get('checkout')
  const router = useRouter()
  const supabase = createBrowserClient()

  // Determine if onboarding is fully complete
  const isOnboardingComplete = Boolean(business?.phone_setup_completed_at && business?.forwarding_verified)

  // Initialize setup banner dismissal state from sessionStorage
  useEffect(() => {
    const dismissed = sessionStorage.getItem('replyflow_setup_banner_dismissed') === 'true'
    setIsSetupBannerDismissed(dismissed)
  }, [])

  // Force refresh business after checkout success with server-side recovery
  useEffect(() => {
    const sessionId = searchParams?.get('session_id')
    
    if (checkoutStatus === 'success' && sessionId) {
      console.log('[Dashboard] Checkout success with session_id:', sessionId)
      console.log('[Dashboard] Business ID:', business?.id)
      console.log('[Dashboard] Business user_id:', business?.user_id)
      console.log('[Dashboard] Current onboarding_status:', business?.onboarding_status)
      console.log('[Dashboard] Current subscription_status:', business?.subscription_status)
      setWebhookConfirming(true)

      const checkSubscription = async (attempt: number) => {
        console.log('[Dashboard] Checkout status check attempt:', attempt)
        
        try {
          // Use server-side checkout status API for reliable recovery
          const response = await fetch(`/api/stripe/checkout-status?session_id=${sessionId}`)
          const data = await response.json()
          
          console.log('[Dashboard] Checkout status API response:', data)
          
          if (data.ready || data.subscriptionStatus === 'trialing' || data.subscriptionStatus === 'active') {
            console.log('[Dashboard] Checkout confirmed ready, refreshing business data')
            await refreshBusiness()
            setWebhookConfirming(false)
            router.replace('/dashboard')
            return
          }
          
          if (attempt < 10) {
            console.log('[Dashboard] Checkout not ready yet, retrying in 1 second...')
            setTimeout(() => checkSubscription(attempt + 1), 1000)
          } else {
            console.log('[Dashboard] Checkout not ready after max retries, showing dashboard anyway')
            setWebhookConfirming(false)
            // Even if not ready, show dashboard instead of redirecting to homepage
            router.replace('/dashboard')
          }
        } catch (error) {
          console.error('[Dashboard] Error checking checkout status:', error)
          if (attempt < 10) {
            setTimeout(() => checkSubscription(attempt + 1), 1000)
          } else {
            console.log('[Dashboard] Checkout status check failed after max retries, showing dashboard anyway')
            setWebhookConfirming(false)
            router.replace('/dashboard')
          }
        }
      }

      // Start checking
      checkSubscription(1)
    } else if (checkoutStatus === 'success' && !sessionId) {
      console.log('[Dashboard] Checkout success without session_id, using fallback')
      // Fallback to client-side refresh if no session_id
      setWebhookConfirming(true)

      const checkSubscription = async (attempt: number) => {
        console.log('[Dashboard] Business row refetch attempt:', attempt)
        
        await refreshBusiness()
        
        const isActive = hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id)
        
        console.log('[Dashboard] Subscription active check:', isActive)
        console.log('[Dashboard] Subscription status:', business?.subscription_status)
        console.log('[Dashboard] Stripe customer ID exists:', !!business?.stripe_customer_id)
        console.log('[Dashboard] Stripe subscription ID exists:', !!business?.stripe_subscription_id)

        if (isActive) {
          console.log('[Dashboard] Subscription active confirmed, removing checkout=success from URL')
          setWebhookConfirming(false)
          router.replace('/dashboard')
        } else if (attempt < 10) {
          console.log('[Dashboard] Subscription not active yet, retrying in 1 second...')
          setTimeout(() => checkSubscription(attempt + 1), 1000)
        } else {
          console.log('[Dashboard] Subscription not active after max retries, showing dashboard anyway')
          setWebhookConfirming(false)
          router.replace('/dashboard')
        }
      }

      checkSubscription(1)
    }
  }, [checkoutStatus, searchParams, refreshBusiness, supabase, router, business])

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
    console.log('[checkout] Starting subscription flow')
    
    // Pre-checkout diagnostics
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    console.log('[checkout] Pre-checkout session check:', {
      sessionExists: !!session,
      userId: session?.user?.id,
      sessionError: sessionError?.message,
      domain: window.location.hostname,
      userAgent: navigator.userAgent
    })
    
    // Check for auth-related localStorage keys
    const localStorageKeys: string[] = []
    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.includes('supabase') || key.includes('auth') || key.includes('sb-'))) {
          localStorageKeys.push(key)
        }
      }
    }
    console.log('[checkout] Auth-related localStorage keys:', localStorageKeys)
    
    // Do not redirect to Stripe if session is missing - block checkout
    if (!session) {
      console.error('[checkout] No session found, blocking checkout')
      alert('Please sign in to start your trial. Your session may have expired.')
      setCheckoutLoading(false)
      router.push('/auth/signin?redirect=/dashboard')
      return
    }
    
    console.log('[checkout] Session confirmed, proceeding with checkout')
    
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
      })
      const data = await response.json()
      
      if (!response.ok) {
        console.error('[checkout] API error:', data)
        alert(`Failed to create checkout session: ${data.error || 'Unknown error'}`)
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
        alert(`No checkout URL returned: ${JSON.stringify(data)}`)
      }
    } catch (error) {
      console.error('[checkout] Network error:', error)
      alert('Network error creating checkout session. Please try again.')
    } finally {
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

  // Show loading state while business is loading or webhook is confirming
  // Only require business fetch to complete, not subscription resolution
  // Null subscription_status is valid (means not activated yet)
  const shouldShowLoading = businessLoading || webhookConfirming
  
  // Throttled logging to avoid spamming console
  useEffect(() => {
    console.log('[Dashboard] Loading state check:', {
      businessLoading,
      webhookConfirming,
      shouldShowLoading,
      subscription_status: business?.subscription_status,
      stripe_customer_id: business?.stripe_customer_id,
      stripe_subscription_id: business?.stripe_subscription_id,
      onboarding_status: business?.onboarding_status,
      loadingTimeout,
      checkoutStatus
    })
  }, [businessLoading, webhookConfirming, loadingTimeout, business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id, business?.onboarding_status, checkoutStatus])
  
  // Hard no-blank fallback: always render something
  if (shouldShowLoading && !loadingTimeout) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">
            {webhookConfirming ? 'Payment confirmed. Setting up your account...' : 'Loading your dashboard...'}
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
            Please wait while we prepare your workspace
          </p>
        </div>
      </div>
    )
  }

  // If loading timeout reached, show dashboard anyway (don't render blank)
  if (loadingTimeout) {
    console.log('[Dashboard] Loading timeout, rendering dashboard anyway')
  }

  // Real branch logging for loading state
  console.log('[DASHBOARD RENDER BRANCH]', {
    sessionExists: !!business, // business exists only if session exists
    businessLoading,
    businessFetchComplete,
    businessExists: !!business,
    businessError: business ? 'none' : 'no business',
    subscription_status: business?.subscription_status,
    loadingTimeout,
    webhookConfirming,
    shouldShowLoading,
    finalRenderBranch: 'determining...'
  })
  
  // Throttled logging to avoid spamming console
  useEffect(() => {
    console.log('[Dashboard] Loading state check:', {
      businessLoading,
      businessFetchComplete,
      webhookConfirming,
      shouldShowLoading,
      subscription_status: business?.subscription_status,
      stripe_customer_id: business?.stripe_customer_id,
      stripe_subscription_id: business?.stripe_subscription_id,
      onboarding_status: business?.onboarding_status,
      loadingTimeout,
      checkoutStatus
    })
  }, [businessLoading, businessFetchComplete, webhookConfirming, loadingTimeout, business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id, business?.onboarding_status, checkoutStatus])

  // Handle redirect to onboarding if no business after fetch complete
  useEffect(() => {
    if (!business && !businessLoading && businessFetchComplete) {
      console.log('[DASHBOARD] No business object after loading complete, redirecting to onboarding')
      router.push('/onboarding')
    }
  }, [business, businessLoading, businessFetchComplete, router])

  // Determine if we should show loading state
  const shouldShowLoadingState = shouldShowLoading && !loadingTimeout
  const shouldShowNoBusinessLoading = !business && !businessLoading && !businessFetchComplete

  // If loading timeout reached, show dashboard anyway (don't render blank)
  if (loadingTimeout) {
    console.log('[Dashboard] Loading timeout, rendering dashboard anyway')
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
    <DashboardErrorBoundary>
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-background flex flex-col">
            {/* App Header */}
            <AppHeader showNavigation={true} />

            {/* Main Content */}
            <div className="flex-1 p-4 sm:p-6 lg:p-8 pb-24">
              <div className="max-w-6xl mx-auto space-y-6">
                        
                {/* Determine if onboarding is fully complete */}
                {/* Only show setup progress and test banner when user has active subscription AND has provisioned number */}
                {!isOnboardingComplete && hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && business?.twilio_phone_number && (
                  <SectionErrorBoundary sectionName="SetupProgress">
                    {(() => {
                      console.log('[Render Child] SetupProgress')
                      return null
                    })()}
                    <GettingStarted isOnboardingComplete={isOnboardingComplete} />
                  </SectionErrorBoundary>
                )}

                {/* Provisioning Success Banner - Show after checkout success */}
                <SectionErrorBoundary sectionName="ProvisioningSuccessBanner">
                  {(() => {
                    console.log('[Render Child] ProvisioningSuccessBanner')
                    return null
                  })()}
                  <ProvisioningSuccessBanner checkoutSuccess={checkoutStatus === 'success'} />
                </SectionErrorBoundary>

                {/* Setup Health Banner - Show when forwarding not verified AND user has valid subscription AND setup not completed AND banner not dismissed */}
                {business?.onboarding_status === 'completed' && !business?.forwarding_verified && hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && !isSetupBannerDismissed && (
                  <SectionErrorBoundary sectionName="SetupHealthBanner">
                    {(() => {
                      console.log('[Render Child] SetupHealthBanner')
                      return null
                    })()}
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">⚠️</span>
                          <div>
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                              Finish testing your setup
                            </p>
                            <p className="text-xs text-amber-600 dark:text-amber-300">
                              Call your business number from another phone and let it ring once to confirm ReplyFlow is active.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => router.push('/dashboard/test-setup')}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors"
                          >
                            Test Setup
                          </button>
                          <button
                            onClick={handleDismissSetupBanner}
                            className="px-2.5 py-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-md transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </SectionErrorBoundary>
                )}

                {/* Success Banner - Show when forwarding is verified AND recently completed (within 5 minutes) */}
                {business?.forwarding_verified && business?.forwarding_verified_at && !isSetupBannerDismissed && (() => {
                  const verifiedAt = new Date(business.forwarding_verified_at)
                  const now = new Date()
                  const minutesSinceVerification = (now.getTime() - verifiedAt.getTime()) / (1000 * 60)
                  return minutesSinceVerification < 5
                })() && (
                  <SectionErrorBoundary sectionName="SuccessBanner">
                    {(() => {
                      console.log('[Render Child] SuccessBanner')
                      return null
                    })()}
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700/50 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
                            <span className="text-xl">✅</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                              ReplyFlow is active
                            </p>
                            <p className="text-xs text-green-600 dark:text-green-300">
                              Your missed-call text-back system is working. New leads will appear in your dashboard.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={handleDismissSetupBanner}
                          className="px-2.5 py-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium rounded-md transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
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
                      
                      // If in trial and not cancelled, show trial banner
                      if (isInTrial) {
                        const trialEndDate = formatDate(business?.trial_ends_at)
                        return (
                          <div className={`${themeClasses.banner} rounded-xl px-3 py-2.5`}>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">🎉</span>
                                <div>
                                  <p className={`text-xs font-semibold ${textTokens.primary}`}>
                                    Free trial active
                                  </p>
                                  <p className={`text-[10px] ${textTokens.secondary}`}>
                                    {trialEndDate 
                                      ? `Billing starts at $49/month on ${trialEndDate} unless you cancel.`
                                      : 'Billing starts at $49/month after trial unless you cancel.'}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={handleManageSubscription}
                                disabled={isOpeningBilling}
                                className={`${buttonTokens.primary} px-2 py-1 text-[10px] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {isOpeningBilling ? 'Opening…' : 'Manage Billing'}
                              </button>
                            </div>
                          </div>
                        )
                      }
                      
                      // Active subscription (not trial, not cancelled) - no banner needed
                      return null
                    })()}
                  </SectionErrorBoundary>
                )}

                {/* Pre-trial premium onboarding hero: single, focused activation card */}
                {!hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && (
                  <SectionErrorBoundary sectionName="ActivationHero">
                    {(() => {
                      console.log('[Render Child] ActivationHero')
                      return null
                    })()}
                    <section className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/40 shadow-sm">
                      <div className="absolute inset-0 pointer-events-none opacity-60 dark:opacity-30 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),_transparent_55%)]" />
                      <div className="relative p-6 sm:p-10">
                        <div className="max-w-2xl mx-auto text-center">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/70 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs font-medium mb-5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                            Ready to activate
                          </div>
                          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground tracking-tight mb-3">
                            Start capturing missed calls
                          </h1>
                          <p className="text-sm sm:text-base text-muted-foreground mb-6">
                            Start your free trial to activate your dedicated ReplyFlow number and begin texting missed callers automatically.
                          </p>
                          <ul className="text-sm text-foreground mb-8 space-y-2 text-left max-w-md mx-auto">
                            <li className="flex items-start gap-3">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-300 flex items-center justify-center mt-0.5 text-[11px] font-bold">✓</span>
                              Get your dedicated ReplyFlow number
                            </li>
                            <li className="flex items-start gap-3">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-300 flex items-center justify-center mt-0.5 text-[11px] font-bold">✓</span>
                              Set up call forwarding in minutes
                            </li>
                            <li className="flex items-start gap-3">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-300 flex items-center justify-center mt-0.5 text-[11px] font-bold">✓</span>
                              Automatically text back missed callers
                            </li>
                          </ul>
                          <button
                            onClick={handleStartSubscription}
                            disabled={checkoutLoading}
                            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                          >
                            {checkoutLoading ? 'Starting…' : 'Start 14-Day Free Trial'}
                          </button>
                          <p className="text-xs text-muted-foreground mt-4">
                            No charge today. Cancel anytime before your trial ends.
                          </p>
                        </div>
                      </div>
                    </section>
                  </SectionErrorBoundary>
                )}

                {/* Telecom-active sections: only render once the user has started a trial/subscription. */}
                {hasActiveSubscription(business) ? (
                  <>
                    {/* Live Activity Section - Top Priority */}
                    <SectionErrorBoundary sectionName="LiveActivity">
                      {(() => {
                        console.log('[Render Child] LiveActivity')
                        return null
                      })()}
                      <div className="mb-6">
                        <LiveActivity />
                      </div>
                    </SectionErrorBoundary>

                    {/* Hero Metrics Section */}
                    <SectionErrorBoundary sectionName="StatsCards">
                      {(() => {
                        console.log('[Render Child] StatsCards')
                        return null
                      })()}
                      {(() => {
                        console.log('[Dashboard Render] StatsCards')
                        return null
                      })()}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-lg shadow-sm">📞</span>
                            <h3 className="text-xs font-medium text-muted-foreground">Missed Calls</h3>
                          </div>
                          <p className="text-2xl sm:text-3xl font-bold text-foreground mb-0.5">0</p>
                          <p className="text-[11px] text-muted-foreground">Waiting for first call</p>
                        </div>
                        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-8 h-8 bg-blue-900/20 dark:bg-blue-900/20 rounded-lg flex items-center justify-center text-lg shadow-sm">👥</span>
                            <h3 className="text-xs font-medium text-muted-foreground">New Leads</h3>
                          </div>
                          <p className="text-2xl sm:text-3xl font-bold text-blue-500 dark:text-blue-100 mb-0.5">0</p>
                          <p className="text-[11px] text-muted-foreground">Ready to capture leads</p>
                        </div>
                        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-8 h-8 bg-green-900/20 dark:bg-green-900/20 rounded-lg flex items-center justify-center text-lg shadow-sm">💬</span>
                            <h3 className="text-xs font-medium text-muted-foreground">Conversations</h3>
                          </div>
                          <p className="text-2xl sm:text-3xl font-bold text-green-500 dark:text-green-100 mb-0.5">0</p>
                          <p className="text-[11px] text-muted-foreground">Customer replies appear here</p>
                        </div>
                        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-8 h-8 bg-purple-900/20 dark:bg-purple-900/20 rounded-lg flex items-center justify-center text-lg shadow-sm">📅</span>
                            <h3 className="text-xs font-medium text-muted-foreground">Follow-ups</h3>
                          </div>
                          <p className="text-2xl sm:text-3xl font-bold text-purple-500 dark:text-purple-100 mb-0.5">0</p>
                          <p className="text-[11px] text-muted-foreground">Scheduled</p>
                        </div>
                      </div>
                    </SectionErrorBoundary>

                    {/* Recent Leads Section */}
                    <SectionErrorBoundary sectionName="RecentLeadsSection">
                      {(() => {
                        console.log('[Render Child] RecentLeadsSection')
                        return null
                      })()}
                      {business?.id && <RecentLeadsSection businessId={business.id} />}
                    </SectionErrorBoundary>

                    {/* Conversations Section */}
                    <SectionErrorBoundary sectionName="ConversationsSection">
                      {(() => {
                        console.log('[Render Child] ConversationsSection')
                        return null
                      })()}
                      {(() => {
                        console.log('[Dashboard Render] ConversationsSection')
                        return null
                      })()}
                      <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                          </div>
                          <div>
                            <h2 className="text-lg font-semibold text-foreground">No conversations yet</h2>
                            <p className="text-sm text-muted-foreground">Customer text conversations will appear here once someone replies.</p>
                          </div>
                        </div>
                      </div>
                    </SectionErrorBoundary>
                  </>
                ) : null}

                {/* Getting Started Section - At Bottom when onboarding complete */}
                {isOnboardingComplete && (
                  <SectionErrorBoundary sectionName="GettingStartedBottom">
                    {(() => {
                      console.log('[Render Child] GettingStartedBottom')
                      return null
                    })()}
                    <GettingStarted isOnboardingComplete={isOnboardingComplete} />
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
              <footer className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground">
                      © {new Date().getFullYear()} ReplyFlow. All rights reserved.
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <a href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                        Privacy
                      </a>
                      <a href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                        Terms
                      </a>
                      <a href="/compliance" className="text-muted-foreground hover:text-foreground transition-colors">
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
