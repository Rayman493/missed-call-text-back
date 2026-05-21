'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import SmsVerificationBanner from '@/components/SmsVerificationBanner'
import OffboardingBanner from '@/components/OffboardingBanner'
import GettingStarted from '@/components/GettingStarted'
import AppHeader from '@/components/AppHeader'
import Link from 'next/link'
import { 
  formatPhoneNumber, 
  formatRelativeTime, 
  truncateText, 
  getLeadStatusColor
} from '@/lib/utils'
import { 
  getSubscriptionStatusText, 
  isInTrialPeriod, 
  needsUpgrade,
  getPricingDisplay,
  getTrialDisplay,
  SUBSCRIPTION_STATES,
  hasValidSubscription,
  isActiveSubscription
} from '@/lib/subscription'
import { hasActiveAccess, hasActiveTrial, hasActiveSubscription as hasActiveSubscriptionUtil } from '@/lib/subscription-utils'
import { PRICING_CONFIG } from '@/lib/pricing'
import { handleBillingAction } from '@/lib/billing'
import StatusBadge from '@/components/StatusBadge'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import MobileMenu from '@/components/MobileMenu'
import Image from 'next/image'
import { RealtimeChannel } from '@supabase/supabase-js'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import { getLeadLifecycleStatus, getLeadStatusClasses, getLeadStatusLabel } from '@/lib/lead-lifecycle'

// Helper to get latest activity timestamp for sorting
function getLatestActivity(lead: any): string {
  if (lead.last_message_at) return lead.last_message_at
  if (lead.first_contact_at) return lead.first_contact_at
  return lead.created_at
}

// Helper to determine if lead needs response
function needsResponseCheck(lead: any): boolean {
  const hasInbound = lead.messages?.some((m: any) => m.direction === 'inbound')
  const hasOutboundAfterInbound = lead.messages?.some((m: any) => {
    return m.direction === 'outbound' && 
           new Date(m.created_at) > new Date(lead.first_contact_at)
  })
  return hasInbound && !hasOutboundAfterInbound
}

// Helper to determine if lead is unread
function hasUnread(leadId: string): boolean {
  // This would typically check against read status in the database
  // For now, we'll consider all leads with inbound messages as potentially unread
  return false
}

// Helper to get lead message status
function getLeadMessageStatus(latestMessage: any) {
  if (!latestMessage) {
    return { color: 'blue', icon: '📞' }
  }
  
  if (latestMessage.direction === 'inbound') {
    return { color: 'green', icon: '📱' }
  }
  
  return { color: 'blue', icon: '💬' }
}

export default function LeadsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { business, refreshBusiness } = useBusiness()
  const { user, signOut } = useAuth()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [trialEligibility, setTrialEligibility] = useState<any>(null)
  const [checkoutMode, setCheckoutMode] = useState<'trial' | 'paid'>('trial')

  const supabase = createBrowserClient()

  // Determine if onboarding is fully complete
  const isOnboardingComplete = Boolean(business?.phone_setup_completed_at && business?.forwarding_verified)

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    if (!business?.id) return

    try {
      if (!loading) {
        setRefreshing(true)
      }
      setError(null)

      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          messages (
            id,
            body,
            direction,
            created_at
          )
        `)
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setLeads(data || [])
    } catch (error) {
      console.error('Error fetching leads:', error)
      setError('Failed to load leads. Please try again.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [business?.id, supabase, loading])

  // Realtime updates
  useRealtimeLeads(
    business?.id,
    (newLead) => {
      setLeads(prev => [newLead, ...prev].slice(0, 100)) // Keep only latest 100
    },
    (newMessage) => {
      // Update lead when new message arrives
      setLeads(prev => prev.map(lead => {
        if (lead.id === newMessage.lead_id) {
          return {
            ...lead,
            messages: [...(lead.messages || []), newMessage],
            last_message_at: newMessage.created_at
          }
        }
        return lead
      }))
    },
    (updatedLead) => {
      // Update lead when it changes
      setLeads(prev => prev.map(lead => 
        lead.id === updatedLead.id ? updatedLead : lead
      ))
    }
  )

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  // Handle conversation click
  const handleConversationClick = (leadId: string) => {
    setSelectedLeadId(leadId)
  }

  // Handle billing actions
  const handleBillingActionClick = async (action: 'portal' | 'upgrade') => {
    try {
      const result = await handleBillingAction()
      if (result.success && result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      console.error('Billing action error:', error)
    }
  }

  // Filter leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchQuery || 
      lead.caller_phone.includes(searchQuery) ||
      (lead.messages && lead.messages.some((m: any) => 
        m.body.toLowerCase().includes(searchQuery.toLowerCase())
      ))
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  // Check trial eligibility when business data is available and user is on unpaid plan
  useEffect(() => {
    if (business && user && !hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id)) {
      checkTrialEligibility()
    }
  }, [business, user, business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id])

  // Check trial eligibility
  const checkTrialEligibility = async () => {
    if (!business?.business_phone_number || !user?.email) {
      console.log('[Checkout Mode Decision] Missing required data for eligibility check')
      setCheckoutMode('paid')
      return
    }

    try {
      console.log('[Checkout Mode Decision] Checking trial eligibility for:', {
        businessId: business.id,
        phoneNumber: business.business_phone_number,
        email: user.email
      })

      const response = await fetch('/api/trial/check-eligibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: business.id,
          phoneNumber: business.business_phone_number,
          email: user.email
        })
      })

      const data = await response.json()
      setTrialEligibility(data)

      const hasUsedTrial = !data.eligible
      const cooldownActive = !!data.cooldown_end_date
      
      const mode = hasUsedTrial || cooldownActive ? 'paid' : 'trial'
      setCheckoutMode(mode)

      console.log('[Checkout Mode Decision]', {
        hasUsedTrial,
        cooldownActive,
        checkoutMode: mode,
        businessId: business.id,
        eligible: data.eligible,
        cooldownEndDate: data.cooldown_end_date
      })
    } catch (error) {
      console.error('[Checkout Mode Decision] Error checking trial eligibility:', error)
      setCheckoutMode('paid')
    }
  }

  // Handle start subscription
  const handleStartSubscription = async () => {
    setCheckoutLoading(true)
    console.log('[checkout] ===== STARTING SUBSCRIPTION FLOW =====')
    
    // Check trial eligibility first to determine checkout mode
    await checkTrialEligibility()
    
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId: business?.id,
          mode: checkoutMode
        })
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.cooldown_end_date) {
          const cooldownDate = new Date(data.cooldown_end_date)
          setCheckoutError(`You can start another free trial after ${cooldownDate.toLocaleDateString()}.`)
        } else if (data.error === 'Business has already used a free trial') {
          setCheckoutError('This business has already used a free trial.')
        } else {
          setCheckoutError(data.error || 'Failed to create checkout session')
        }
        return
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('[checkout] Error creating checkout session:', error)
      setCheckoutError('Failed to start checkout. Please try again.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  // Sort leads by latest activity
  const sortedLeads = [...filteredLeads].sort((a, b) => {
    const aTime = new Date(getLatestActivity(a)).getTime()
    const bTime = new Date(getLatestActivity(b)).getTime()
    return bTime - aTime
  })

  if (!business) {
    return (
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-background">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading your leads...</p>
              </div>
            </div>
          </div>
        </BusinessGuard>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-gradient-to-br from-slate-50/80 via-gray-50/60 to-blue-gray-50/40 dark:from-background dark:via-background dark:to-blue-950/10 flex flex-col relative">
            {/* Premium light mode ambient layers */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/30 to-slate-50/50 dark:from-transparent dark:via-slate-900/5 dark:to-slate-900/10 pointer-events-none"></div>
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-50/20 via-transparent to-indigo-50/10 dark:from-transparent dark:via-transparent dark:to-transparent pointer-events-none"></div>
            <div className="absolute inset-0 opacity-60" style={{
              background: 'radial-gradient(circle at 25% 25%, rgba(255, 255, 255, 0.4) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(248, 250, 252, 0.3) 0%, transparent 50%)'
            }}></div>
            {/* App Header */}
            <AppHeader title="Leads" />

          {/* Main Content */}
          <main className="flex-1 pt-5 sm:pt-6 lg:pt-6 px-3 sm:px-4 lg:px-6 pb-20 relative z-10">
            <div className="max-w-[1600px] mx-auto space-y-3 sm:space-y-6">
            {/* SMS Verification Banner */}
            <SmsVerificationBanner business={business} />

            {/* Offboarding Banner - only for FULLY canceled/unpaid/expired subscriptions */}
            {/* Do NOT show when just scheduled to cancel (cancel_at_period_end) */}
            {(business?.subscription_status === 'canceled' || business?.subscription_status === 'unpaid' || business?.subscription_status === 'past_due') && business?.stripe_subscription_id && (
              <OffboardingBanner 
                business={business}
                subscriptionStatus={business?.subscription_status || 'inactive'}
              />
            )}

            {/* Getting Started - match Dashboard spacing */}
            <div className="mb-4 sm:mb-6">
              <GettingStarted isOnboardingComplete={isOnboardingComplete} />
            </div>

            {/* Pre-trial locked preview - show what users will unlock */}
            {!hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && (
              <div className="relative mb-6 sm:mb-8">
                {/* Leads Preview Content */}
                <div className="space-y-4 sm:space-y-6">
                  {/* Lifecycle Summary Cards Preview */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-1">New Leads</p>
                      <p className="text-lg sm:text-2xl font-extrabold text-slate-300 dark:text-slate-600 tracking-tight">—</p>
                    </div>
                    <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-1">Active</p>
                      <p className="text-lg sm:text-2xl font-extrabold text-slate-300 dark:text-slate-600 tracking-tight">—</p>
                    </div>
                    <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-1">Completed</p>
                      <p className="text-lg sm:text-2xl font-extrabold text-slate-300 dark:text-slate-600 tracking-tight">—</p>
                    </div>
                    <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-1">Ignored</p>
                      <p className="text-lg sm:text-2xl font-extrabold text-slate-300 dark:text-slate-600 tracking-tight">—</p>
                    </div>
                  </div>

                  {/* Leads Header Preview */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl sm:text-3xl font-bold text-foreground">
                        Customer Leads
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
                        No leads yet
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-lg p-1 shadow-sm">
                        <button className="px-2 py-1 text-xs sm:text-sm font-medium text-slate-600 dark:text-muted-foreground rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          All
                        </button>
                        <button className="px-2 py-1 text-xs sm:text-sm font-medium text-slate-600 dark:text-muted-foreground rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          New
                        </button>
                        <button className="px-2 py-1 text-xs sm:text-sm font-medium text-slate-600 dark:text-muted-foreground rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          Active
                        </button>
                        <button className="px-2 py-1 text-xs sm:text-sm font-medium text-slate-600 dark:text-muted-foreground rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          Completed
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sample Leads Preview */}
                  <div className="space-y-2 sm:space-y-3">
                    {/* Sample Lead 1 */}
                    <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-3 sm:p-4 border-l-4 border-l-blue-500">
                      <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 border shadow-sm bg-green-50 border-green-200">
                          <span className="text-base sm:text-lg">📱</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                            <p className="font-bold text-base sm:text-lg sm:text-xl text-slate-900 dark:text-foreground truncate">
                              Sarah M.
                            </p>
                            <span className="px-1.5 sm:px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-600/20 dark:text-orange-300 text-[10px] sm:text-xs font-bold rounded-full flex-shrink-0">New</span>
                            <span className="px-1.5 sm:px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-600/20 dark:text-red-300 text-[10px] sm:text-xs font-bold rounded-full flex-shrink-0">Needs Response</span>
                          </div>
                          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-muted-foreground/70">5 minutes ago</p>
                        </div>
                      </div>
                      <div className="ml-11 sm:ml-13">
                        <p className="text-xs sm:text-sm truncate text-slate-600 dark:text-muted-foreground/80 font-semibold">
                          Customer: Hi, I'm interested in your services. Can you call me back?
                        </p>
                      </div>
                    </div>

                    {/* Sample Lead 2 */}
                    <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-3 sm:p-4 border-l-4 border-l-blue-500">
                      <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 border shadow-sm bg-blue-50 border-blue-200">
                          <span className="text-base sm:text-lg">📞</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                            <p className="font-bold text-base sm:text-lg sm:text-xl text-slate-900 dark:text-foreground truncate">
                              John's Plumbing
                            </p>
                            <span className="px-1.5 sm:px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-600/20 dark:text-orange-300 text-[10px] sm:text-xs font-bold rounded-full flex-shrink-0">New</span>
                          </div>
                          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-muted-foreground/70">12 minutes ago</p>
                        </div>
                      </div>
                      <div className="ml-11 sm:ml-13">
                        <p className="text-xs sm:text-sm truncate text-slate-600 dark:text-muted-foreground/80 font-semibold">
                          Customer: We have a pipe emergency at our office. Need help ASAP.
                        </p>
                      </div>
                    </div>

                    {/* Sample Lead 3 */}
                    <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-3 sm:p-4 border-l-4 border-l-green-500">
                      <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 border shadow-sm bg-green-50 border-green-200">
                          <span className="text-base sm:text-lg">📱</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                            <p className="font-bold text-base sm:text-lg sm:text-xl text-slate-900 dark:text-foreground truncate">
                              Mike's Auto Repair
                            </p>
                          </div>
                          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-muted-foreground/70">1 hour ago</p>
                        </div>
                      </div>
                      <div className="ml-11 sm:ml-13">
                        <p className="text-xs sm:text-sm truncate text-blue-600 dark:text-blue-400/90">
                          You: Thanks for reaching out! We'll have someone call you back shortly.
                        </p>
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
                    <p className="text-white font-medium mb-4">Unlock your leads inbox</p>
                    <p className="text-white/80 text-sm mb-6 max-w-md mx-auto">
                      Start your trial to begin capturing missed-call leads automatically
                    </p>
                    <button
                      onClick={() => {
                        setCheckoutError(null)
                        handleStartSubscription()
                      }}
                      disabled={checkoutLoading}
                      className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {checkoutLoading ? 'Starting…' : (checkoutMode === 'trial' ? 'Start Free Trial' : 'Subscribe Now')}
                    </button>
                    {checkoutError && (
                      <div className="mt-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 max-w-md mx-auto">
                        <p className="text-sm text-red-800 dark:text-red-200 font-medium">{checkoutError}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Real Leads content - only show for active users */}
            {hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && (
              <>
            {/* Lifecycle Summary Cards - improved spacing hierarchy */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6 sm:mb-8">
              <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-2 sm:p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-1">New Leads</p>
                <p className="text-lg sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400 tracking-tight mb-0.5">
                  {leads.filter(l => getLeadLifecycleStatus(l) === 'new').length}
                </p>
                <p className="text-[7px] sm:text-[10px] text-slate-500 dark:text-muted-foreground/60 leading-tight">
                  {leads.filter(l => getLeadLifecycleStatus(l) === 'new').length === 0 ? 'awaiting contact' : 'waiting for reply'}
                </p>
              </div>
              <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-2 sm:p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-1">Active Conversations</p>
                <p className="text-lg sm:text-2xl font-extrabold text-green-600 dark:text-green-400 tracking-tight mb-0.5">
                  {leads.filter(l => getLeadLifecycleStatus(l) === 'active').length}
                </p>
                <p className="text-[7px] sm:text-[10px] text-slate-500 dark:text-muted-foreground/60 leading-tight">
                  {leads.filter(l => getLeadLifecycleStatus(l) === 'active').length === 0 ? 'no ongoing talks' : 'conversations open'}
                </p>
              </div>
              <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-2 sm:p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-1">Completed Follow-ups</p>
                <p className="text-lg sm:text-2xl font-extrabold text-slate-600 dark:text-slate-400 tracking-tight mb-0.5">
                  {leads.filter(l => getLeadLifecycleStatus(l) === 'completed').length}
                </p>
                <p className="text-[7px] sm:text-[10px] text-slate-500 dark:text-muted-foreground/60 leading-tight">
                  {leads.filter(l => getLeadLifecycleStatus(l) === 'completed').length === 0 ? 'no follow-ups yet' : 'reminders completed'}
                </p>
              </div>
              <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm p-2 sm:p-3">
                <p className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-1">Ignored Contacts</p>
                <p className="text-lg sm:text-2xl font-extrabold text-orange-600 dark:text-orange-400 tracking-tight mb-0.5">
                  {leads.filter(l => getLeadLifecycleStatus(l) === 'ignored').length}
                </p>
                <p className="text-[7px] sm:text-[10px] text-slate-500 dark:text-muted-foreground/60 leading-tight">
                  {leads.filter(l => getLeadLifecycleStatus(l) === 'ignored').length === 0 ? 'no blocked contacts' : 'blocked from automation'}
                </p>
              </div>
            </div>

            {/* Leads Header - match Dashboard spacing hierarchy */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4 mb-6 sm:mb-8">
              <div>
                <h2 className="text-xl sm:text-2xl sm:text-3xl font-bold text-foreground">
                  Customer Leads
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
                  {leads.filter(l => getLeadLifecycleStatus(l) !== 'completed').length === 0 
                    ? 'No leads yet' 
                    : `${leads.filter(l => getLeadLifecycleStatus(l) !== 'completed').length} ${leads.filter(l => getLeadLifecycleStatus(l) !== 'completed').length === 1 ? 'active lead' : 'active leads'} total`}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                {leads.length > 0 && (
                  <div className="flex items-center gap-1.5 sm:gap-2 bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-lg p-1 shadow-sm">
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                        showFilters 
                          ? 'bg-slate-100 dark:bg-muted text-slate-900 dark:text-foreground' 
                          : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-50 dark:hover:bg-muted/50'
                      }`}
                    >
                      Filters
                    </button>
                    <div className="w-px h-5 bg-slate-200 dark:bg-border/40"></div>
                    <button
                      onClick={fetchLeads}
                      disabled={loading || refreshing}
                      className="px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-50 dark:hover:bg-muted/50 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2"
                    >
                      {refreshing ? (
                        <div className="animate-spin rounded-full h-3 w-3 sm:h-3.5 sm:w-3.5 border-b-2 border-blue-600"></div>
                      ) : (
                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                      <span className="hidden sm:inline">Refresh</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="bg-card rounded-xl border border-border p-4 mb-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Search
                    </label>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by phone or message..."
                      className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                    >
                      <option value="all">All Status</option>
                      <option value="new">New</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="ignored">Ignored</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="text-center py-16 px-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-900/30 mb-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Loading leads</h3>
                <p className="text-muted-foreground text-sm">Please wait while we fetch your conversation history...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && leads.filter(l => getLeadLifecycleStatus(l) !== 'completed').length === 0 && (
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900/20 dark:to-blue-900/10 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 sm:p-10 text-center animate-fadeIn relative overflow-hidden">
                {/* Subtle background gradient for depth */}
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-blue-50/30 to-transparent dark:from-transparent dark:via-blue-900/10 dark:to-transparent pointer-events-none"></div>
                <div className="relative z-10">
                {(() => {
                  // Determine actual onboarding state
                  const hasActiveSubscription = hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id)
                  const isOnboardingComplete = Boolean(business?.phone_setup_completed_at && business?.forwarding_verified)
                  const provisioningStatus = business?.provisioning_status || 'pending'
                  
                  // STATE 1: PRE-TRIAL / NOT ACTIVATED
                  if (!hasActiveSubscription || provisioningStatus === 'pending') {
                    return (
                      <>
                        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-5 shadow-lg">
                          <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2 sm:mb-3">
                          No leads yet
                        </h3>
                        <div className="text-muted-foreground mb-6 sm:mb-8 max-w-md mx-auto text-sm sm:text-base">
                          <p>Activate your free trial to begin setting up ReplyFlow and start capturing missed calls automatically.</p>
                        </div>
                      </>
                    )
                  }
                  
                  // STATE 2: SETUP IN PROGRESS
                  if (!isOnboardingComplete) {
                    return (
                      <>
                        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-5 shadow-lg">
                          <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2 sm:mb-3">
                          No leads yet
                        </h3>
                        <div className="text-muted-foreground mb-6 sm:mb-8 max-w-md mx-auto text-sm sm:text-base">
                          <p>Complete your final missed-call test to activate live monitoring and begin capturing customer conversations automatically.</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 mb-4 sm:mb-5 text-xs sm:text-sm">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800/30">
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Setup in progress
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-muted/30 text-slate-700 dark:text-muted-foreground rounded-full border border-slate-200 dark:border-border/50">
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Almost ready
                          </span>
                        </div>
                      </>
                    )
                  }
                  
                  // STATE 3: FULLY ACTIVE
                  return (
                    <>
                      <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-5 shadow-lg">
                        <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2 sm:mb-3">
                        No leads yet
                      </h3>
                      
                      {/* Operational Status Indicators */}
                      <div className="flex flex-wrap items-center justify-center gap-2 mb-4 sm:mb-5 text-xs sm:text-sm">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full border border-green-200 dark:border-green-800/30">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                          Monitoring Active
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800/30">
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Auto-Replies Enabled
                        </span>
                        {business?.forwarding_verified && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-muted/30 text-slate-700 dark:text-muted-foreground rounded-full border border-slate-200 dark:border-border/50">
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            Forwarding Connected
                          </span>
                        )}
                      </div>

                      <div className="text-muted-foreground mb-6 sm:mb-8 max-w-md mx-auto text-sm sm:text-base">
                        <p>Your captured leads will appear here automatically once ReplyFlow is live and monitoring your business line.</p>
                        {leads.filter(l => getLeadLifecycleStatus(l) === 'completed').length > 0 && (
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 mt-3">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-green-700 dark:text-green-300 font-medium text-sm sm:text-base">
                              {leads.filter(l => getLeadLifecycleStatus(l) === 'completed').length} completed
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )
                })()}
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="text-center py-16 px-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-900/30 mb-4">
                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Unable to load leads</h3>
                <div className="text-red-600 dark:text-red-400 mb-6 max-w-md mx-auto">{error}</div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={fetchLeads}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Try Again
                  </button>
                  <Link
                    href="/dashboard/settings"
                    className="inline-flex items-center px-4 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-lg hover:bg-secondary/80 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Check Settings
                  </Link>
                </div>
              </div>
            )}

            {/* Leads List */}
            {!loading && !error && leads.filter(l => getLeadLifecycleStatus(l) !== 'completed').length > 0 && (
              <div className="bg-white dark:bg-card/80 backdrop-blur rounded-2xl shadow-sm hover:shadow-md border border-slate-100 dark:border-border/40 overflow-hidden transition-all duration-300">
                <div className="divide-y divide-slate-100 dark:divide-border">
                  {sortedLeads.filter(l => getLeadLifecycleStatus(l) !== 'completed').map((lead, index) => {
                    const latestMessage = lead.messages && lead.messages.length > 0
                      ? lead.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]     
                      : null

                    const messageStatus = getLeadMessageStatus(latestMessage)
                    const lastActivity = lead.last_message_at || lead.first_contact_at || lead.created_at
                    const hasReplied = lead.messages?.some((m: any) => m.direction === 'inbound')
                    const hasTexted = lead.messages?.some((m: any) => m.direction === 'outbound')
                    const isUnread = hasUnread(lead.id)
                    const needsResponse = needsResponseCheck(lead.id)

                    // Check if this is the newest lead (within 24 hours)
                    const isNewLead = index === 0 && (Date.now() - new Date(lastActivity).getTime()) < 24 * 60 * 60 * 1000

                    let statusBadge = getLeadStatusLabel(getLeadLifecycleStatus(lead))
                    const statusClasses = getLeadStatusClasses(getLeadLifecycleStatus(lead))

                    return (
                      <Link
                        key={lead.id}
                        href={`/dashboard/leads/${lead.id}`}
                        onClick={() => handleConversationClick(lead.id)}
                        className={`block p-3.5 sm:p-5 hover:bg-slate-50 dark:hover:bg-muted/80 transition-all duration-300 hover:scale-[1.01] relative border-l-4 border-transparent hover:border-l-slate-300 dark:hover:border-l-border/50 cursor-pointer ${
                          isUnread ? 'bg-blue-50/50 dark:bg-blue-900/10 border-l-blue-500' : ''
                        } ${isNewLead ? 'bg-orange-50/50 dark:bg-orange-900/10 border-l-orange-500' : ''}`}
                      >
                        {/* Unread indicator dot */}
                        {isUnread && (
                          <div className="absolute top-4 left-3.5 sm:top-5 sm:left-4 w-2 h-2 bg-blue-600 rounded-full shadow-sm"></div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
                              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 border shadow-sm ${
                                messageStatus.color === 'green' ? 'bg-green-50 border-green-200' :
                                messageStatus.color === 'red' ? 'bg-red-50 border-red-200' :
                                messageStatus.color === 'orange' ? 'bg-orange-50 border-orange-200' :
                                'bg-blue-50 border-blue-200'
                              }`}>
                                <span className="text-base sm:text-lg">{messageStatus.icon}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                  <p className={`font-bold text-base sm:text-lg sm:text-xl text-slate-900 dark:text-foreground truncate ${
                                    isUnread ? 'font-extrabold' : ''
                                  }`}>
                                    {lead.caller_phone === '+10000000000' ? 'Test Lead' : formatPhoneNumber(lead.caller_phone)}
                                  </p>
                                  {isNewLead && (
                                    <span className="px-1.5 sm:px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-600/20 dark:text-orange-300 text-[10px] sm:text-xs font-bold rounded-full flex-shrink-0">New</span>
                                  )}
                                  {needsResponse && (
                                    <span className="px-1.5 sm:px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-600/20 dark:text-red-300 text-[10px] sm:text-xs font-bold rounded-full flex-shrink-0">Needs Response</span>
                                  )}
                                </div>
                                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-muted-foreground/70">{formatRelativeTime(lastActivity)}</p>
                              </div>
                            </div>
                            {latestMessage && (
                              <div className="ml-11 sm:ml-13">
                                <p className={`text-xs sm:text-sm truncate ${
                                  latestMessage.direction === 'inbound'
                                    ? 'text-slate-600 dark:text-muted-foreground/80'
                                    : 'text-blue-600 dark:text-blue-400/90'
                                } ${isUnread && latestMessage.direction === 'inbound' ? 'font-semibold' : ''}`}>
                                  {latestMessage.direction === 'inbound' && 'Customer: '}
                                  {latestMessage.body}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            <span className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium ${statusClasses}`}>
                              {statusBadge}
                            </span>
                            <div className="text-blue-400 hover:text-blue-300 text-xs sm:text-sm font-medium whitespace-nowrap">
                              View →
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
            </>
            )}
            </div>
          </main>
      </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
