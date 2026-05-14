'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { 
  formatPhoneNumber, 
  formatRelativeTime, 
  truncateText, 
  getLeadStatusColor
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
import { hasActiveAccess, hasActiveTrial } from '@/lib/subscription-utils'
import { PRICING_CONFIG } from '@/lib/pricing'
import { handleBillingAction } from '@/lib/billing'
import { themeClasses, bgTokens, textTokens, borderTokens, buttonTokens } from '@/lib/theme'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import BusinessGuard from '@/components/BusinessGuard'
import AuthGuard from '@/components/AuthGuard'
import SmsVerificationBanner from '@/components/SmsVerificationBanner'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import MobileMenu from '@/components/MobileMenu'
import SetupHealth from '@/components/SetupHealth'
import LiveActivity from '@/components/LiveActivity'
import GettingStarted from '@/components/GettingStarted'
import OffboardingBanner from '@/components/OffboardingBanner'
import ProvisioningSuccessBanner from '@/components/ProvisioningSuccessBanner'
import ForwardingSetupModal from '@/components/ForwardingSetupModal'
import Footer from '@/components/Footer'
import Image from 'next/image'
import { RealtimeChannel } from '@supabase/supabase-js'

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
  const { business, loading: businessLoading, refreshBusiness } = useBusiness()
  const { setBusiness } = useBusiness()
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
  const searchParams = useSearchParams()
  const checkoutStatus = searchParams?.get('checkout')
  const router = useRouter()

  const supabase = createBrowserClient()

  // Initialize setup banner dismissal state from sessionStorage
  useEffect(() => {
    const dismissed = sessionStorage.getItem('replyflow_setup_banner_dismissed') === 'true'
    setIsSetupBannerDismissed(dismissed)
  }, [])

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

  // Force refresh business after checkout success with retry logic
  useEffect(() => {
    if (checkoutStatus === 'success') {
      console.log('[Dashboard] Checkout success redirect reached')
      console.log('[Dashboard] Business ID:', business?.id)
      console.log('[Dashboard] Business user_id:', business?.user_id)
      console.log('[Dashboard] Current onboarding_status:', business?.onboarding_status)
      console.log('[Dashboard] Current subscription_status:', business?.subscription_status)
      setWebhookConfirming(true)

      const checkSubscription = async (attempt: number) => {
        console.log('[Dashboard] Business row refetch attempt:', attempt)
        
        // Refresh business data via context
        await refreshBusiness()
        
        // Directly fetch business from Supabase to get fresh data
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          console.log('[Dashboard] Fetching fresh business data for user:', user.id)
          const { data: freshBusiness } = await supabase
            .from('businesses')
            .select('*')
            .eq('user_id', user.id)
            .limit(1)
            .single()
          
          console.log('[Dashboard] Fresh business data:', {
            businessId: freshBusiness?.id,
            onboardingStatus: freshBusiness?.onboarding_status,
            subscriptionStatus: freshBusiness?.subscription_status,
            stripeCustomerId: freshBusiness?.stripe_customer_id,
            stripeSubscriptionId: freshBusiness?.stripe_subscription_id
          })
          
          // Check if subscription is now active
          const isActive = hasValidSubscription(freshBusiness?.subscription_status, freshBusiness?.stripe_customer_id, freshBusiness?.stripe_subscription_id)
          
          console.log('[Dashboard] Subscription active confirmed:', isActive)
          console.log('[Dashboard] Subscription status:', freshBusiness?.subscription_status)
          console.log('[Dashboard] Stripe customer ID exists:', !!freshBusiness?.stripe_customer_id)
          console.log('[Dashboard] Stripe subscription ID exists:', !!freshBusiness?.stripe_subscription_id)

          if (isActive) {
            console.log('[Dashboard] Subscription active confirmed, removing checkout=success from URL')
            setWebhookConfirming(false)
            // Remove checkout=success from URL
            router.replace('/dashboard')
          } else if (attempt < 10) {
            // Retry after 1 second
            console.log('[Dashboard] Subscription not active yet, retrying in 1 second...')
            setTimeout(() => checkSubscription(attempt + 1), 1000)
          } else {
            console.error('[Dashboard] Subscription not active after 10 seconds, showing error')
            setWebhookConfirming(false)
          }
        }
      }

      // Start checking
      checkSubscription(1)
    }
  }, [checkoutStatus, refreshBusiness, supabase, router, business])

  // Only calculate isActive after business loading is complete
  const isActive = !businessLoading && hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id)

  console.log('[Dashboard] Business loading:', businessLoading)
  console.log('[Dashboard] Business subscription status:', business?.subscription_status)
  console.log('[Dashboard] Is subscription active:', isActive)

  const handleStartSubscription = async () => {
    setCheckoutLoading(true)
    console.log("Creating Stripe checkout session...")
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
        window.location.href = data.url
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
    console.log('[DashboardContent] Business loading:', businessLoading, 'Business ID:', business?.id, 'Business Name:', business?.name, 'Supabase:', !!supabase)
    
    // If business is still loading, don't fetch leads yet
    if (businessLoading) {
      console.log('[DashboardContent] Business still loading, waiting...')
      return
    }
    
    // If no business or no supabase, don't fetch leads - guards will handle redirect
    if (!business || !supabase) {
      console.log('[DashboardContent] No business or supabase, setting loading to false')
      setLoading(false)
      return
    }

    // If business changed, clear old data
    if (currentBusinessId && currentBusinessId !== business.id) {
      console.log('[DashboardContent] Business changed, clearing old data')
      setLeads([])
      setFollowUpJobs([])
      setCurrentBusinessId(business.id)
    }
    setCurrentBusinessId(business.id)

    const fetchLeads = async () => {
      console.log('[DashboardContent] Fetching leads for business:', business.id)
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

        console.log('[DashboardContent] Fetched', leadsData?.length || 0, 'leads')
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

        console.log('[DashboardContent] Fetched', jobsData?.length || 0, 'follow-up jobs')
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

        console.log('[DashboardContent] Fetched', callEventsData?.length || 0, 'call events')
        setCallEvents(callEventsData || [])
        setMissedCalls(callEventsData?.length || 0)
      } catch (error) {
        console.error('[DashboardContent] Error fetching call events:', error)
      } finally {
        console.log('[DashboardContent] Setting loading to false')
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

  // Show loading state while business is loading or webhook is confirming
  if (businessLoading || webhookConfirming) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">
          {webhookConfirming ? 'Payment confirmed. Setting up your account...' : 'Loading your dashboard...'}
        </div>
      </div>
    )
  }

  // missedCalls is now tracked in state
  const textsSent = leads.reduce((count, lead) => {
    return count + (lead.messages?.length > 0 ? 1 : 0)
  }, 0)
  const replies = leads.reduce((count, lead) => {
    return count + (lead.messages?.filter((m: any) => m.direction === 'inbound').length || 0)
  }, 0)
  const followUpsScheduled = followUpJobs.filter((job: any) => job.status === 'pending').length
  const leadsRecovered = leads.length // Now represents unique callers captured

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col`}>
          {/* App Header */}
          <header className={`sticky top-0 z-50 bg-white/90 dark:bg-slate-900 backdrop-blur border-b border-slate-200 dark:border-slate-700 flex-shrink-0`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
              <div className="flex items-center justify-between">
                {/* Left side - Mobile menu and logo */}
                <div className="flex items-center gap-3 md:gap-8">
                  {/* Mobile menu - only visible on mobile/tablet */}
                  <div className="md:hidden">
                    <MobileMenu />
                  </div>
                  <Link href="/dashboard" className="flex items-center hover:opacity-90 transition">
                    <span className="text-lg md:text-xl lg:text-2xl font-semibold tracking-tight">
                      <span className="text-slate-800 dark:text-white">Reply</span>
                      <span className="text-blue-600 dark:text-blue-400">Flow</span>
                    </span>
                  </Link>
                  {/* Desktop navigation - only visible on desktop */}
                  <div className="hidden md:block">
                    <Navigation />
                  </div>
                </div>
                
                {/* Right side - Theme toggle, user dropdown, etc. */}
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="hidden sm:block">
                    {/* Theme toggle removed */}
                  </div>
                  <div className="sm:hidden">
                    {/* Mobile menu placeholder */}
                  </div>
                  <UserDropdown />
                  {/* Mobile menu placeholder on desktop (empty div to maintain layout) */}
                  <div className="hidden md:block w-10"></div>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <div className="flex-1 p-4 sm:p-6 lg:p-8 pb-24">
            <div className="max-w-6xl mx-auto space-y-8">
                        
            {/* Billing Error */}
            {billingError && (
              <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-2">
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

            {/* Forwarding Setup Modal - Show after trial activation if setup not complete */}
            <ForwardingSetupModal />

            {/* Setup Health Banner - Show when forwarding not verified AND user has valid subscription AND setup not completed AND banner not dismissed */}
            {business?.onboarding_status === 'completed' && !business?.forwarding_verified && hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && !isSetupBannerDismissed && (
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3">
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
                      className="px-2.5 py-1 bg-slate-500 hover:bg-slate-600 text-white text-xs font-medium rounded-md transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Subscription Alerts - Only show when action needed */}
            {/* Payment Issue Warning - High Priority */}
            {(business?.subscription_status === 'past_due' || business?.subscription_status === 'unpaid') && (
              <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-2">
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

            {/* Trial Banner - Lower Priority */}
            {hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && isInTrialPeriod(business?.subscription_status) && (
              <div className={`${themeClasses.banner} rounded-xl p-1.5`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🎉</span>
                    <div>
                      <p className={`text-sm font-semibold ${textTokens.primary}`}>
                        Free trial active
                      </p>
                      <p className={`text-xs ${textTokens.secondary}`}>
                        Billing starts at $49/month after trial unless you cancel.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleManageSubscription}
                    disabled={isOpeningBilling}
                    className={`${buttonTokens.primary} px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isOpeningBilling ? 'Opening…' : 'Manage Billing'}
                  </button>
                </div>
              </div>
            )}

            {/* Inactive Subscription - Primary CTA for New Users */}
            {!hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && (
              <div className={`${bgTokens.muted} ${borderTokens.focus} rounded-xl p-4`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🚀</span>
                    <div>
                      {hasActiveTrial(business) && hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) ? (
                        <>
                          <p className={`text-sm font-semibold ${textTokens.primary}`}>
                            Free trial active
                          </p>
                          <p className={`text-xs ${textTokens.secondary}`}>
                            {getTrialDisplay()}
                          </p>
                          <p className={`text-xs ${textTokens.link} mt-1`}>
                            Upgrade anytime during or after trial.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className={`text-sm font-semibold ${textTokens.primary}`}>
                            Start your 14-day free trial
                          </p>
                          <p className={`text-xs ${textTokens.secondary}`}>
                            Activate ReplyFlow to capture missed calls and grow your business
                          </p>
                          <p className={`text-xs ${textTokens.muted} mt-1`}>
                            No charge today. Cancel anytime before your trial ends.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleStartSubscription}
                    disabled={checkoutLoading}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-all hover:shadow-md hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                  >
                    {checkoutLoading ? 'Starting…' : 'Start 14-Day Free Trial'}
                  </button>
                </div>
              </div>
            )}
                        
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
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-xl sm:text-2xl shadow-sm">📞</span>
                  <h3 className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">Missed Calls</h3>
                </div>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white mb-1">{missedCalls}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">total missed</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-xl sm:text-2xl shadow-sm">👥</span>
                  <h3 className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">New Leads</h3>
                </div>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-blue-600 dark:text-blue-100 mb-1">{leadsRecovered}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">captured leads</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center text-xl sm:text-2xl shadow-sm">💬</span>
                  <h3 className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">Conversations</h3>
                </div>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-green-600 dark:text-green-100 mb-1">{textsSent}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">messages sent</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center text-xl sm:text-2xl shadow-sm">⏰</span>
                  <h3 className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">Follow-ups</h3>
                </div>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-purple-600 dark:text-purple-100 mb-1">{followUpsScheduled}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">scheduled</p>
              </div>
            </div>

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

            {/* Canceling Banner - when scheduled to cancel */}
            {isActive && isScheduledToCancel(business?.cancel_at, business?.cancel_at_period_end) && (
              <div className="bg-amber-900/20 border border-amber-900/40 rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">⏰</span>
                    <div>
                      <p className="text-sm font-semibold text-amber-100">
                        Your subscription will end on {business?.cancel_at ? new Date(business.cancel_at).toLocaleDateString() : business?.current_period_end ? new Date(business.current_period_end).toLocaleDateString() : 'soon'}
                      </p>
                      <p className="text-xs text-amber-300">
                        ReplyFlow remains active until then. You can resume your subscription anytime.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleManageSubscription}
                    disabled={isOpeningBilling}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isOpeningBilling ? 'Opening…' : 'Resume Subscription'}
                  </button>
                </div>
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

            {/* Billing card - only show when action needed */}
            {!isActive && !business?.stripe_subscription_id && (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-4 hover:border-gray-600 transition">
                {webhookConfirming ? (
                  <>
                    <h2 className="text-lg font-semibold text-gray-100 mb-2">Activating your account</h2>
                    <p className="text-sm text-gray-400 mb-4">Please wait while we confirm your payment...</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold text-gray-100 mb-2">Start Capturing Missed Calls</h2>
                    <p className="text-sm text-gray-400 mb-4">Start capturing missed calls instantly.</p>
                    <button
                      onClick={handleStartSubscription}
                      disabled={checkoutLoading}
                      className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                    >
                      {checkoutLoading ? 'Processing...' : 'Start capturing missed calls instantly'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Missed Call Leads Section - LIVE ACTIVITY */}
            {leads.length === 0 ? (
              null
            ) : (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-12">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Your Leads</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">People who called but did not reach you.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {processedLeads.length} of {leads.length} leads
                    </span>
                  </div>
                </div>
                
                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search by phone, message, or status..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={`w-full pl-10 pr-4 py-3 ${borderTokens.default} rounded-xl ${bgTokens.input} ${textTokens.primary} placeholder:${textTokens.muted} focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm shadow-sm transition-all`}
                      />
                      <svg className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-md hover:shadow-lg transition-shadow overflow-hidden">
                  {processedLeads.length === 0 ? (
                    <div className="p-6 sm:p-8 text-center bg-slate-50/50 dark:bg-slate-900/50 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg m-4">
                      <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-2xl">🔍</div>
                      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                        {searchQuery.trim() ? 'No search results' : 'No leads yet'}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                        {searchQuery.trim() 
                          ? 'No leads match your search criteria.'
                          : 'Missed calls will appear here once ReplyFlow starts capturing leads.'
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
                            case 'blue': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                            case 'green': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            case 'amber': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
                            case 'purple': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                            case 'gray': return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                            default: return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                          }
                        }

                        return (
                        <div key={lead.id} className={`p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${isNewLead ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  messageStatus.color === 'green' ? 'bg-green-100 dark:bg-green-900/30' :
                                  messageStatus.color === 'red' ? 'bg-red-100 dark:bg-red-900/30' :
                                  messageStatus.color === 'orange' ? 'bg-orange-100 dark:bg-orange-900/30' :
                                  'bg-blue-100 dark:bg-blue-900/30'
                                }`}>
                                  <span className="text-lg">{messageStatus.icon}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <p className="font-bold text-lg text-slate-900 dark:text-gray-100 truncate">{formatLeadPhone(lead.caller_phone)}</p>
                                    {hasUnreadReply && (
                                      <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-semibold rounded-full flex-shrink-0 animate-pulse">
                                        Needs response
                                      </span>
                                    )}
                                    {isNewLead && (
                                      <span className="px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 text-xs font-semibold rounded-full flex-shrink-0">
                                        New
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{formatRelativeTime(lastActivity)}</p>
                                </div>
                              </div>
                              {latestMessage && (
                                <div className="ml-13">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {latestMessage.direction === 'inbound' ? 'Customer:' : 'You:'}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{latestMessage.body}</p>
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

            {/* Getting Started Section - At Bottom */}
            <GettingStarted />
          </div>
        </div>
      </div>
      <Footer />
      </BusinessGuard>
    </AuthGuard>
  )
}
