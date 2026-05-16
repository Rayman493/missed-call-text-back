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
  const { business, loading: businessLoading, fetchComplete: businessFetchComplete, refreshBusiness } = useBusiness()
  
  // ALL hooks must be called before any conditional returns to prevent React #310
  const [leads, setLeads] = useState<any[]>([])
  const [processedLeads, setProcessedLeads] = useState<any[]>([])
  const [followUpJobs, setFollowUpJobs] = useState<any[]>([])
  const [missedCalls, setMissedCalls] = useState(0)
  const [callEvents, setCallEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [isSetupBannerDismissed, setIsSetupBannerDismissed] = useState(false)
  const [webhookConfirming, setWebhookConfirming] = useState(false)
  const [testSmsLoading, setTestSmsLoading] = useState(false)
  const [testSmsMessage, setTestSmsMessage] = useState('')
  const [currentBusinessId, setCurrentBusinessId] = useState<string | null>(null)
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

  // EMERGENCY BYPASS: Return immediately if subscription is active/trialing
  // This must happen AFTER all hooks to prevent React #310
  if (business) {
    const hasValidSub = hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id)
    if (hasValidSub) {
      console.log('[DASHBOARD EMERGENCY BYPASS] Valid subscription detected, restoring dashboard layout shell')
      console.log('[Dashboard Render] Header')
      console.log('[Dashboard Render] Layout shell')
      console.log('[Dashboard Render] StaticCards')
      console.log('[Dashboard Render] PlaceholderSections')
      return (
        <DashboardErrorBoundary>
          <AuthGuard>
            <BusinessGuard>
              <div className={`min-h-screen bg-background flex flex-col`}>
                {/* App Header */}
                <AppHeader showNavigation={true} />
                {/* Main Content - Static cards only */}
                <div className="flex-1 p-4 sm:p-6 lg:p-8 pb-24">
                  <div className="max-w-6xl mx-auto space-y-6">
                    {/* Static Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-slate-800 dark:bg-slate-800 rounded-xl p-4 border border-slate-700 dark:border-slate-700">
                        <p className="text-slate-400 text-sm">Leads Recovered</p>
                        <p className="text-2xl font-bold text-slate-100">0</p>
                      </div>
                      <div className="bg-slate-800 dark:bg-slate-800 rounded-xl p-4 border border-slate-700 dark:border-slate-700">
                        <p className="text-slate-400 text-sm">Texts Sent</p>
                        <p className="text-2xl font-bold text-slate-100">0</p>
                      </div>
                      <div className="bg-slate-800 dark:bg-slate-800 rounded-xl p-4 border border-slate-700 dark:border-slate-700">
                        <p className="text-slate-400 text-sm">Replies</p>
                        <p className="text-2xl font-bold text-slate-100">0</p>
                      </div>
                      <div className="bg-slate-800 dark:bg-slate-800 rounded-xl p-4 border border-slate-700 dark:border-slate-700">
                        <p className="text-slate-400 text-sm">Follow-ups</p>
                        <p className="text-2xl font-bold text-slate-100">0</p>
                      </div>
                    </div>
                    {/* Static Placeholder Sections */}
                    <div className="bg-slate-800 dark:bg-slate-800 rounded-xl p-6 border border-slate-700 dark:border-slate-700">
                      <h2 className="text-lg font-semibold text-slate-100 mb-4">Recent Leads</h2>
                      <p className="text-slate-400 text-sm">No leads yet - static placeholder</p>
                    </div>
                    <div className="bg-slate-800 dark:bg-slate-800 rounded-xl p-6 border border-slate-700 dark:border-slate-700">
                      <h2 className="text-lg font-semibold text-slate-100 mb-4">Conversations</h2>
                      <p className="text-slate-400 text-sm">No conversations yet - static placeholder</p>
                    </div>
                  </div>
                </div>
                <Footer />
              </div>
            </BusinessGuard>
          </AuthGuard>
        </DashboardErrorBoundary>
      )
    }
  }

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
  
  // Realtime subscription management
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)

  // Process leads whenever raw leads, search, or filter changes
  useEffect(() => {
    const processed = processLeads(leads, searchQuery, statusFilter)
    setProcessedLeads(processed)
  }, [leads, searchQuery, statusFilter])

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

  // Only calculate isActive after business loading is complete
  const isActive = !businessLoading && hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id)


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
      // Clear local dashboard state
      setLeads([])
      setFollowUpJobs([])
      setCurrentBusinessId(null)
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

  useEffect(() => {
    // If business is still loading, don't fetch leads yet
    if (businessLoading) {
      return
    }
    
    // If no business or no supabase, don't fetch leads - guards will handle redirect
    if (!business || !supabase) {
      setLoading(false)
      return
    }

    // If business changed, clear old data
    if (currentBusinessId && currentBusinessId !== business.id) {
      dlog('[DashboardContent] Business changed, clearing old data')
      setLeads([])
      setFollowUpJobs([])
      setCurrentBusinessId(business.id)
    }
    setCurrentBusinessId(business.id)

    const fetchLeads = async () => {
      dlog('[DashboardContent] Fetching leads for business:', business.id)
      setLoading(true)
      try {
        const { data } = await supabase
          .from('leads')
          .select(`
            *,
            messages (
              id,
              body,
              direction,
              from_phone,
              to_phone,
              status,
              error_code,
              error_message,
              status_updated_at,
              created_at,
              conversation_id
            ),
            conversations (
              id,
              status,
              source,
              started_at,
              last_activity_at
            )
          `)
          .eq('business_id', business.id)
          .eq('is_demo', false) // Exclude demo leads from dashboard
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .order('first_contact_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })

        const leadsData = data as any[]

        dlog('[DashboardContent] Fetched', leadsData?.length || 0, 'leads')
        setLeads(leadsData || [])
      } catch (error) {
        console.error('[DashboardContent] Error fetching leads:', error)
      }

      // Fetch follow-up jobs
      try {
        const supabaseAny = supabase as any
        const { data: jobsData } = await supabaseAny
          .from('follow_up_jobs')
          .select('*')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })

        dlog('[DashboardContent] Fetched', jobsData?.length || 0, 'follow-up jobs')
        setFollowUpJobs(jobsData || [])
      } catch (error) {
        console.error('[DashboardContent] Error fetching follow-up jobs:', error)
      }

      // Fetch call events for missed calls count
      try {
        const { data: callEventsData } = await supabase
          .from('call_events')
          .select('*')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })

        dlog('[DashboardContent] Fetched', callEventsData?.length || 0, 'call events')
        setCallEvents(callEventsData || [])
        setMissedCalls(callEventsData?.length || 0)
      } catch (error) {
        console.error('[DashboardContent] Error fetching call events:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchLeads()
  }, [business, businessLoading, supabase, currentBusinessId])

  // Realtime subscription for dashboard updates
  useEffect(() => {
    if (!business?.id || !supabase) return

    // Quiet setup - only log errors

    // Clean up existing subscription
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current)
    }

    // Set up new subscription for messages and leads
    const channel = supabase
      .channel(`dashboard:${business.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `business_id=eq.${business.id}`
        },
        (payload: any) => {
          // Quiet message handling
          
          if (payload.eventType === 'INSERT') {
            // New message - update the lead with new message
            const newMessage = payload.new
            setLeads(prev => {
              if (!prev) return prev
              
              return prev.map(lead => {
                if (lead.id === newMessage.lead_id) {
                  const updatedMessages = [...(lead.messages || []), newMessage]
                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  
                  return {
                    ...lead,
                    messages: updatedMessages,
                    last_message_at: newMessage.created_at
                  }
                }
                return lead
              })
            })
          } else if (payload.eventType === 'UPDATE') {
            // Message status updated - update the specific message
            const updatedMessage = payload.new
            setLeads(prev => {
              if (!prev) return prev
              
              return prev.map(lead => {
                if (lead.id === updatedMessage.lead_id) {
                  const updatedMessages = lead.messages?.map((msg: any) => 
                    msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg
                  )
                  
                  return {
                    ...lead,
                    messages: updatedMessages
                  }
                }
                return lead
              })
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `business_id=eq.${business.id}`
        },
        (payload: any) => {
          // Quiet lead handling
          
          if (payload.eventType === 'INSERT') {
            // New lead - add to the list
            const newLead = payload.new
            setLeads(prev => {
              if (!prev) return [newLead]
              
              // Check if lead already exists
              const existingLead = prev.find(lead => lead.id === newLead.id)
              if (existingLead) return prev
              
              return [newLead, ...prev]
            })
          } else if (payload.eventType === 'UPDATE') {
            // Lead updated - update the specific lead
            const updatedLead = payload.new
            setLeads(prev => {
              if (!prev) return prev
              
              return prev.map(lead => 
                lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead
              )
            })
          }
        }
      )
      .subscribe((status: any) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[Dashboard Realtime] Channel error for business:', business.id)
        }
        // Quiet SUBSCRIBED status - no need to log
      })

    realtimeChannelRef.current = channel

    // Cleanup on unmount
    return () => {
      if (realtimeChannelRef.current) {
        console.log('[Dashboard Realtime] Cleaning up dashboard subscription')
        supabase.removeChannel(realtimeChannelRef.current)
        realtimeChannelRef.current = null
      }
    }
  }, [business?.id])

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
    authLoading: loading,
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
  
  // Hard no-blank fallback: always render something
  if (shouldShowLoading && !loadingTimeout) {
    console.log('[DASHBOARD RENDER BRANCH] final: loading spinner')
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

  // Ensure we always have a valid business object for rendering
  // Null subscription_status is a valid state (not activated yet), not loading
  if (!business && !businessLoading && businessFetchComplete) {
    console.log('[DASHBOARD RENDER BRANCH] final: no business after fetch complete - should redirect to onboarding')
    console.log('[Dashboard] No business object after loading complete, redirecting to onboarding')
    // BusinessGuard should handle this redirect, but as a fallback, redirect here
    router.push('/onboarding')
    return null
  }

  if (!business && !businessLoading) {
    console.log('[DASHBOARD RENDER BRANCH] final: no business, loading not complete - showing loading')
    console.log('[Dashboard] No business object after loading complete, showing activation')
    // This is a resolved state - show activation panel instead of blank
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Loading your account...</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Please wait</p>
        </div>
      </div>
    )
  }

  // missedCalls is now tracked in state
  console.log('[DASHBOARD] rendering main content')
  console.log('[DASHBOARD] business:', business)
  console.log('[DASHBOARD] subscription_status:', business?.subscription_status)
  console.log('[DASHBOARD] isOnboardingComplete:', isOnboardingComplete)
  console.log('[DASHBOARD] leads count:', leads.length)
  const textsSent = leads.reduce((count, lead) => {
    return count + (lead.messages?.length > 0 ? 1 : 0)
  }, 0)
  const replies = leads.reduce((count, lead) => {
    return count + (lead.messages?.filter((m: any) => m.direction === 'inbound').length || 0)
  }, 0)
  const followUpsScheduled = followUpJobs.filter((job: any) => job.status === 'pending').length
  const leadsRecovered = leads.length // Now represents unique callers captured

  console.log('[DASHBOARD] rendering AuthGuard and BusinessGuard')
  return (
    <DashboardErrorBoundary>
      <AuthGuard>
        <BusinessGuard>
          <div className={`min-h-screen bg-background flex flex-col`}>
            {/* App Header */}
            <AppHeader showNavigation={true} />

          {/* Main Content */}
          <div className="flex-1 p-4 sm:p-6 lg:p-8 pb-24">
            <div className="max-w-6xl mx-auto space-y-6">
                        
            {/* Determine if onboarding is fully complete */}
            {/* Only show setup progress and test banner when user has active subscription AND has provisioned number */}
            {!isOnboardingComplete && hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && business?.twilio_phone_number && (
              <div>
                <GettingStarted isOnboardingComplete={isOnboardingComplete} />
              </div>
            )}
            {/* Billing Error */}
            {billingError && (
              <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <p className="text-sm font-semibold text-red-100">
                        Billing Error
                      </p>
                      <p className="text-xs text-red-300">
                        {billingError}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setBillingError('')}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Provisioning Success Banner - Show after checkout success */}
            <ProvisioningSuccessBanner checkoutSuccess={checkoutStatus === 'success'} />

            {/* Setup Health Banner - Show when forwarding not verified AND user has valid subscription AND setup not completed AND banner not dismissed */}
            {business?.onboarding_status === 'completed' && !business?.forwarding_verified && hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && !isSetupBannerDismissed && (
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
            )}

            {/* Success Banner - Show when forwarding is verified AND recently completed (within 5 minutes) */}
            {business?.forwarding_verified && business?.forwarding_verified_at && !isSetupBannerDismissed && (() => {
              const verifiedAt = new Date(business.forwarding_verified_at)
              const now = new Date()
              const minutesSinceVerification = (now.getTime() - verifiedAt.getTime()) / (1000 * 60)
              return minutesSinceVerification < 5
            })() && (
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
            )}

            {/* Subscription Alerts - Only show when action needed */}
            {/* Payment Issue Warning - High Priority */}
            {(business?.subscription_status === 'past_due' || business?.subscription_status === 'unpaid') && (
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
            )}

            {/* Consolidated Subscription/Trial Status Banner */}
            {hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && (
              (() => {
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
              })()
            )}

            {/* Pre-trial premium onboarding hero: single, focused activation card */}
            {!hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && (
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
            )}

            {/* Telecom-active sections: only render once the user has started a trial/subscription. */}
            {hasActiveSubscription(business) ? (
              <>
                {/* Live Activity Section - Top Priority */}
                <div className="mb-6">
                  <LiveActivity
                    leads={leads}
                    followUpJobs={followUpJobs}
                    missedCalls={missedCalls}
                  />
                </div>

                {/* Hero Metrics Section */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-lg shadow-sm">📞</span>
                  <h3 className="text-xs font-medium text-muted-foreground">Missed Calls</h3>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-foreground mb-0.5">{missedCalls}</p>
                <p className="text-[11px] text-muted-foreground">Waiting for first call</p>
              </div>
              <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 bg-blue-900/20 dark:bg-blue-900/20 rounded-lg flex items-center justify-center text-lg shadow-sm">👥</span>
                  <h3 className="text-xs font-medium text-muted-foreground">New Leads</h3>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-blue-500 dark:text-blue-100 mb-0.5">{leadsRecovered}</p>
                <p className="text-[11px] text-muted-foreground">Ready to capture leads</p>
              </div>
              <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 bg-green-900/20 dark:bg-green-900/20 rounded-lg flex items-center justify-center text-lg shadow-sm">💬</span>
                  <h3 className="text-xs font-medium text-muted-foreground">Conversations</h3>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-green-500 dark:text-green-100 mb-0.5">{replies}</p>
                <p className="text-[11px] text-muted-foreground">Customer replies appear here</p>
              </div>
              <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 bg-purple-900/20 dark:bg-purple-900/20 rounded-lg flex items-center justify-center text-lg shadow-sm">⏰</span>
                  <h3 className="text-xs font-medium text-muted-foreground">Follow-ups</h3>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-purple-500 dark:text-purple-100 mb-0.5">{followUpsScheduled}</p>
                <p className="text-[11px] text-muted-foreground">Automation ready</p>
              </div>
                </div>
              </>
            ) : null}

            {/* Checkout success confirming message */}
            {webhookConfirming && (
              <div className="bg-blue-900/20 border border-blue-900/40 rounded-xl px-4 py-3">
                <p className="text-blue-300 text-sm">Payment confirmed. Setting up your account...</p>
              </div>
            )}

            {/* Checkout cancel message */}
            {checkoutStatus === 'cancelled' && (
              <div className="bg-yellow-900/20 border border-yellow-900/40 rounded-xl px-4 py-3">
                <p className="text-yellow-300 text-sm">Checkout cancelled. You can activate anytime.</p>
              </div>
            )}

            {/* Offboarding Banner - only for FULLY canceled/unpaid/expired subscriptions */}
            {/* Only show when subscription_status is actually canceled/unpaid/past_due, not when just scheduled to cancel */}
            {(business?.subscription_status === 'canceled' || business?.subscription_status === 'unpaid' || business?.subscription_status === 'past_due') && business?.stripe_subscription_id && (
              <OffboardingBanner 
                business={business}
                subscriptionStatus={business?.subscription_status || 'inactive'}
              />
            )}

            {/* Telecom-active sections: only render once the user has started a trial/subscription. */}
            {leads.length === 0 ? (
              null
            ) : (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Your Leads</h2>
                    <p className="text-sm text-muted-foreground mt-1">People who called but did not reach you.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {processedLeads.length} of {leads.length} leads
                    </span>
                  </div>
                </div>
                
                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search by phone, message, or status..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={`w-full pl-10 pr-4 py-3 ${borderTokens.default} rounded-xl ${bgTokens.input} ${textTokens.primary} placeholder:${textTokens.muted} focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm shadow-sm transition-all`}
                      />
                      <svg className="absolute left-3 top-3.5 w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className={`px-4 py-3 ${borderTokens.default} rounded-xl ${bgTokens.input} ${textTokens.primary} text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all`}
                    >
                      <option value="all">All</option>
                      <option value="new">New</option>
                      <option value="needs_response">Needs response</option>
                      <option value="replied">Replied</option>
                      <option value="qualified">Qualified</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>

                {/* Lead Cards */}
              <div className="bg-card border border-border rounded-2xl shadow-md hover:shadow-lg transition-shadow overflow-hidden">
                  {processedLeads.length === 0 ? (
                    <div className={`p-6 sm:p-8 text-center border-2 border-dashed rounded-lg m-3 ${isOnboardingComplete ? 'bg-muted border-border' : 'bg-muted/50 border-border/50'}`}>
                      <div className="w-10 h-10 mx-auto mb-2 bg-muted rounded-full flex items-center justify-center text-lg animate-pulse">🔍</div>
                      <h3 className="text-sm font-medium text-foreground mb-1">
                        {searchQuery.trim() ? 'No search results' : 'Your missed-call assistant is ready'}
                      </h3>
                      <p className={`text-xs max-w-md mx-auto ${isOnboardingComplete ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                        {searchQuery.trim() 
                          ? 'No leads match your search criteria.'
                          : 'Your first missed call and customer conversation will appear here automatically.'
                        }
                      </p>
                    </div>
                  ) : (
                    <div className={`divide-y ${borderTokens.light}`}>
                      {processedLeads.map((lead) => {
                        const latestMessage = lead.messages && lead.messages.length > 0
                          ? lead.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                          : null

                        const messageStatus = getLeadMessageStatus(latestMessage)
                        const lastActivity = getLatestActivity(lead)
                        const statusDisplay = getLeadStatusDisplay(lead)
                        const hasUnreadReply = needsResponse(lead)
                        const isNewLead = (Date.now() - new Date(lastActivity).getTime()) < 24 * 60 * 60 * 1000

                        const getStatusColor = (color: string) => {
                          switch (color) {
                            case 'blue': return 'bg-blue-900/30 dark:bg-blue-900/30 text-blue-300 dark:text-blue-300'
                            case 'green': return 'bg-green-900/30 dark:bg-green-900/30 text-green-300 dark:text-green-300'
                            case 'amber': return 'bg-amber-900/30 dark:bg-amber-900/30 text-amber-300 dark:text-amber-300'
                            case 'purple': return 'bg-purple-900/30 dark:bg-purple-900/30 text-purple-300 dark:text-purple-300'
                            case 'gray': return 'bg-muted text-muted-foreground'
                            default: return 'bg-blue-900/30 dark:bg-blue-900/30 text-blue-300 dark:text-blue-300'
                          }
                        }

                        return (
                        <div key={lead.id} className={`p-4 sm:p-6 hover:bg-muted transition-colors ${isNewLead ? 'bg-orange-900/10 dark:bg-orange-900/10' : ''}`}>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  messageStatus.color === 'green' ? 'bg-green-900/30 dark:bg-green-900/30' :
                                  messageStatus.color === 'red' ? 'bg-red-900/30 dark:bg-red-900/30' :
                                  messageStatus.color === 'orange' ? 'bg-orange-900/30 dark:bg-orange-900/30' :
                                  'bg-blue-900/30 dark:bg-blue-900/30'
                                }`}>
                                  <span className="text-lg">{messageStatus.icon}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <p className="font-bold text-lg text-foreground truncate">{formatLeadPhone(lead.caller_phone)}</p>
                                    {hasUnreadReply && (
                                      <span className="px-2.5 py-1 bg-amber-900/30 dark:bg-amber-900/30 text-amber-300 dark:text-amber-300 text-xs font-semibold rounded-full flex-shrink-0 animate-pulse">
                                        Needs response
                                      </span>
                                    )}
                                    {isNewLead && (
                                      <span className="px-2.5 py-1 bg-orange-900/30 dark:bg-orange-900/30 text-orange-300 dark:text-orange-300 text-xs font-semibold rounded-full flex-shrink-0">
                                        New
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs sm:text-sm text-muted-foreground">{formatRelativeTime(lastActivity)}</p>
                                </div>
                              </div>
                              {latestMessage && (
                                <div className="ml-13">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs text-muted-foreground">
                                      {latestMessage.direction === 'inbound' ? 'Customer:' : 'You:'}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground truncate">{latestMessage.body}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(statusDisplay.color)}`}>
                                {statusDisplay.text}
                              </span>
                              <Link
                                href={`/dashboard/leads/${lead.id}`}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all hover:scale-105 shadow-sm"
                              >
                                View
                              </Link>
                            </div>
                          </div>
                        </div>
                      )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Getting Started Section - At Bottom when onboarding complete */}
            {isOnboardingComplete && <GettingStarted isOnboardingComplete={isOnboardingComplete} />}
          </div>
        </div>
      </div>
      <Footer />
      </BusinessGuard>
    </AuthGuard>
    </DashboardErrorBoundary>
  )
}
