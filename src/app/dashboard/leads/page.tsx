'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useTrialEligibility } from '@/hooks/useTrialEligibility'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import SmsVerificationBanner from '@/components/SmsVerificationBanner'
import OffboardingBanner from '@/components/OffboardingBanner'
import GettingStarted from '@/components/GettingStarted'
import AppHeader from '@/components/AppHeader'
import BottomNavigation from '@/components/BottomNavigation'
import Link from 'next/link'
import {
  formatPhoneNumber,
  formatRelativeTime,
  truncateText,
  getLeadStatusColor,
  normalizePhoneNumberForSearch,
  sentenceCase,
  getLeadDisplayName
} from '@/lib/utils'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import { copyToClipboard } from '@/lib/clipboard'
import { calculateLeadTiming, getCustomerInfoForCopy, getAISummaryForCopy } from '@/lib/lead-timing'
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
import Image from 'next/image'
import { RealtimeChannel } from '@supabase/supabase-js'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import { getLeadLifecycleStatus, getLeadStatusClasses, getLeadStatusLabel, LeadLifecycleStatus } from '@/lib/lead-lifecycle'
import StatCard from '@/components/StatCard'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import LeadStatusDropdown from '@/components/LeadStatusDropdown'
import AddCustomerModal from '@/components/AddCustomerModal'

// Helper to get compact summary for lead card
// [simple_mode_structured_preview_generated]
function getCompactSummary(lead: any): string {
  // Prefer structured AI intake fields over raw SMS body
  const intake = getLeadAIIntake(lead)
  const name = intake.customerName
  const service = intake.serviceRequested
  if (name && service) { return truncateText(`${name} • ${service}`, 80); }
  if (service) return truncateText(service, 80)
  if (name) return truncateText(name, 80)


  // Try legacy ai_summary key
  const aiSummary = lead.raw_metadata?.ai_summary || lead.raw_metadata?.summary
  if (aiSummary) {
    const firstLine = aiSummary.split('\n')[0]
    // Skip raw SMS header lines
    if (!firstLine.startsWith('Thanks for calling') && !firstLine.startsWith('---')) {
      return truncateText(firstLine, 80)
    }
  }

  // Fall back to latest inbound message body (not outbound SMS summary)
  if (lead.messages && lead.messages.length > 0) {
    const inbound = lead.messages
      .filter((m: any) => m.direction === 'inbound')
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    if (inbound?.body) return truncateText(inbound.body, 80)
  }

  return 'New customer request'
}

// Helper to get structured AI data for lead card (legacy shape)
function getAIData(lead: any): { reason: string | null; urgency: string | null; details: string | null } {
  const intake = getLeadAIIntake(lead)
  return {
    reason: intake.serviceRequested,
    urgency: intake.desiredCompletion,
    details: intake.additionalDetails,
  }
}

// Helper to get address from lead
function getAddress(lead: any): string | null {
  return getLeadAIIntake(lead).serviceAddress
}

// Helper to get lead status accent color
function getLeadStatusAccentColor(status: string): string {
  const normalizedStatus = status?.toLowerCase()
  switch (normalizedStatus) {
    case 'new':
      return 'bg-blue-500'
    case 'active':
      return 'bg-green-500'
    case 'scheduled':
      return 'bg-purple-500'
    case 'completed':
      return 'bg-gray-500'
    case 'ignored':
      return 'bg-red-500'
    default:
      return 'bg-blue-500'
  }
}

// Helper to normalize phone number for deduplication
function normalizePhoneNumber(phone: string): string {
  if (!phone) return ''
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')
  // Handle country code (assume US format)
  if (digits.length === 10) {
    return digits
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1)
  }
  return digits
}

// Helper to merge duplicate leads by phone number - DISABLED to prevent incorrect merging
function mergeDuplicateLeads(leads: any[]): any[] {
  // DO NOT MERGE - return leads as-is to prevent hiding valid leads with different phone numbers
  return leads
}

// Helper to get latest activity timestamp for sorting
function getLatestActivity(lead: any): string {
  if (lead.last_activity_at) return lead.last_activity_at
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
  const pathname = usePathname()
  const { business, refreshBusiness } = useBusiness()
  const { user, signOut } = useAuth()
  const [leads, setLeads] = useState<any[]>([])
  const [missedCallCount, setMissedCallCount] = useState(0)
  const [ignoredContactsCount, setIgnoredContactsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cardOverflowMenu, setCardOverflowMenu] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const { checkoutMode, isLoading: eligibilityLoading } = useTrialEligibility()
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null)
  const [deletedFilter, setDeletedFilter] = useState(false)

  const supabase = createBrowserClient()

  // Determine if onboarding is fully complete using derived logic
  // Priority: existing completed onboarding status > successful missed call > captured lead > conversation
  const hasLeads = leads.length > 0
  const hasConversations = leads.filter(l => l.conversation_id).length > 0
  const isOnboardingComplete = Boolean(
    (business?.onboarding_status === 'completed') ||
    (business?.phone_setup_completed_at && business?.forwarding_verified) ||
    (hasLeads || hasConversations)
  )

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    if (!business?.id) return

    try {
      if (!loading) {
        setRefreshing(true)
      }
      setError(null)

      let query = supabase
        .from('leads')
        .select(`
          id,
          business_id,
          caller_phone,
          status,
          created_at,
          first_contact_at,
          last_message_at,
          last_activity_at,
          conversation_id,
          deleted_at,
          deleted_by,
          deletion_reason,
          raw_metadata,
          messages (
            id,
            body,
            direction,
            created_at
          ),
          ai_call_records (
            id,
            extracted_info,
            caller_phone,
            business_id,
            lead_id,
            created_at
          )
        `)
        .eq('business_id', business.id)

      // Apply deleted filter
      if (deletedFilter) {
        query = query.not('deleted_at', 'is', null)
      } else {
        query = query.is('deleted_at', null)
      }

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error

      // Normalize ai_call_records to aiCallRecords for UI compatibility
      const normalizedLeads = (data || []).map((lead: any) => ({
        ...lead,
        aiCallRecords: lead.ai_call_records || []
      }))

      // Sort by latest activity
      normalizedLeads.sort((a: any, b: any) => {
        const aActivity = getLatestActivity(a)
        const bActivity = getLatestActivity(b)
        return new Date(bActivity).getTime() - new Date(aActivity).getTime()
      })

      setLeads(normalizedLeads)

      // Fetch missed call count
      const { count } = await supabase
        .from('call_events')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business.id)
      
      setMissedCallCount(count || 0)

      // Fetch ignored contacts count
      const { count: ignoredCount } = await supabase
        .from('ignored_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business.id)
      
      setIgnoredContactsCount(ignoredCount || 0)
    } catch (error) {
      console.error('Error fetching leads:', error)
      setError('Failed to load leads. Please try again.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [business?.id, supabase, loading, deletedFilter])

  // Handle lead status change from overview page
  const handleLeadStatusChange = async (leadId: string, newStatus: LeadLifecycleStatus) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      // Update lead status via API
      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: newStatus
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Failed to update lead status to ${newStatus}`)
      }

      // Update local state
      setLeads(prev => prev.map(lead => 
        lead.id === leadId 
          ? { ...lead, status: newStatus }
          : lead
      ))
    } catch (error) {
      console.error('Error updating lead status:', error)
      // Optionally show error feedback to user
    }
  }

  // Handle ignoring a lead
  const handleIgnoreLead = async (leadId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      // Update lead status to ignored via API
      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: 'ignored'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to ignore lead')
      }

      // Update local state
      setLeads(prev => prev.map(lead => 
        lead.id === leadId 
          ? { ...lead, status: 'ignored' }
          : lead
      ))
    } catch (error) {
      console.error('Error ignoring lead:', error)
      alert('Failed to ignore lead. Please try again.')
    }
  }

  // Handle restore deleted lead
  const handleRestoreLead = async (leadId: string) => {
    try {
      const token = await supabase.auth.getSession()
      if (!token.data.session?.access_token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.data.session.access_token}`
        },
        body: JSON.stringify({
          deleted_at: null,
          deleted_by: null,
          deletion_reason: null
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to restore lead')
      }

      // Update local state
      setLeads(prev => prev.map(lead =>
        lead.id === leadId
          ? { ...lead, deleted_at: null, deleted_by: null, deletion_reason: null }
          : lead
      ))
    } catch (error) {
      console.error('Error restoring lead:', error)
      alert('Failed to restore lead. Please try again.')
    }
  }

  // Handle delete lead confirmation
  const handleDeleteLeadClick = (leadId: string) => {
    setLeadToDelete(leadId)
    setShowDeleteModal(true)
    setCardOverflowMenu(null)
  }

  // Handle delete lead
  const handleDeleteLead = async () => {
    if (!leadToDelete) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/leads/${leadToDelete}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete lead')
      }

      // Update local state
      setLeads(prev => prev.map(lead =>
        lead.id === leadToDelete
          ? { ...lead, deleted_at: new Date().toISOString(), deleted_by: user?.id, deletion_reason: 'user_deleted' }
          : lead
      ))

      setShowDeleteModal(false)
      setLeadToDelete(null)
    } catch (error) {
      console.error('Error deleting lead:', error)
      alert('Failed to delete lead. Please try again.')
    }
  }

  // Realtime updates
  useRealtimeLeads(
    business?.id,
    (newLead) => {
      setLeads(prev => {
        // Add new lead and re-deduplicate
        const updatedLeads = [newLead, ...prev]
        const deduplicated = mergeDuplicateLeads(updatedLeads)
        // Sort by latest activity
        deduplicated.sort((a, b) => {
          const aActivity = getLatestActivity(a)
          const bActivity = getLatestActivity(b)
          return new Date(bActivity).getTime() - new Date(aActivity).getTime()
        })
        return deduplicated.slice(0, 100) // Keep only latest 100
      })
    },
    (newMessage) => {
      setLeads(prev => {
        // Update lead when new message arrives and re-deduplicate
        const updatedLeads = prev.map(lead => {
          if (lead.id === newMessage.lead_id) {
            return {
              ...lead,
              messages: [...(lead.messages || []), newMessage],
              last_message_at: newMessage.created_at,
              last_activity_at: newMessage.created_at
            }
          }
          return lead
        })
        const deduplicated = mergeDuplicateLeads(updatedLeads)
        // Sort by latest activity
        deduplicated.sort((a, b) => {
          const aActivity = getLatestActivity(a)
          const bActivity = getLatestActivity(b)
          return new Date(bActivity).getTime() - new Date(aActivity).getTime()
        })
        return deduplicated
      })
    },
    (updatedLead) => {
      setLeads(prev => {
        // Update lead when it changes and re-deduplicate
        const updatedLeads = prev.map(lead => 
          lead.id === updatedLead.id ? updatedLead : lead
        )
        const deduplicated = mergeDuplicateLeads(updatedLeads)
        // Sort by latest activity
        deduplicated.sort((a, b) => {
          const aActivity = getLatestActivity(a)
          const bActivity = getLatestActivity(b)
          return new Date(bActivity).getTime() - new Date(aActivity).getTime()
        })
        return deduplicated
      })
    }
  )

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  // Handle conversation click
  const handleConversationClick = (leadId: string) => {
    router.push(`/dashboard/leads/${leadId}`)
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
    const intake = getLeadAIIntake(lead)
    const q = searchQuery.toLowerCase()
    const matchesSearch = !searchQuery ||
      lead.caller_phone.includes(searchQuery) ||
      lead.name?.toLowerCase().includes(q) ||
      (intake.customerName?.toLowerCase().includes(q)) ||
      (intake.serviceRequested?.toLowerCase().includes(q)) ||
      (intake.serviceAddress?.toLowerCase().includes(q)) ||
      normalizePhoneNumberForSearch(lead.caller_phone).includes(normalizePhoneNumberForSearch(searchQuery)) ||
      (lead.messages && lead.messages.some((m: any) =>
        m.body.toLowerCase().includes(searchQuery.toLowerCase())
      ))

    const leadStatus = getLeadLifecycleStatus(lead)
    const isDeleted = !!lead.deleted_at

    // Handle Deleted filter specifically
    if (statusFilter === 'deleted') {
      return matchesSearch && isDeleted
    }

    const matchesStatus = statusFilter === 'all' || leadStatus === statusFilter

    // Hide ignored leads from default view (when filter is 'all')
    const isIgnored = leadStatus === 'ignored'
    const showIgnored = statusFilter === 'ignored'
    const shouldShowIgnored = showIgnored || statusFilter !== 'all'

    // Hide deleted leads from default view (when filter is not 'deleted')
    const shouldShowDeleted = !isDeleted

    return matchesSearch && matchesStatus && (shouldShowIgnored || !isIgnored) && shouldShowDeleted
  })

  
  
  // Handle start subscription
  const handleStartSubscription = async () => {
    setCheckoutLoading(true)
    console.log('[checkout] ===== STARTING SUBSCRIPTION FLOW =====')
    
    // Eligibility is now handled by useTrialEligibility hook
    
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
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="space-y-4">
                {/* Skeleton KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4">
                      <div className="animate-pulse">
                        <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-lg mb-4"></div>
                        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
                        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Skeleton Lead Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4">
                      <div className="animate-pulse">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                          <div className="flex-1">
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2 w-3/4"></div>
                            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
                          </div>
                        </div>
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </BusinessGuard>
      </AuthGuard>
    )
  }

  return (
    <DashboardErrorBoundary>
      <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-[#f8fafc] dark:bg-background flex flex-col relative">
            {/* App Header */}
            <AppHeader title="Leads" />

          {/* Main Content */}
          <main className="flex-1 pt-4 lg:pt-6 px-4 lg:px-6 pb-16 relative z-10">
            <div className="max-w-[1400px] mx-auto space-y-4 lg:space-y-6">
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


            {/* Pre-trial locked preview - show what users will unlock */}
            {!hasActiveAccess(business) && (
              <div className="relative mb-4 sm:mb-6">
                {/* Leads Preview Content */}
                <div className="space-y-4 sm:space-y-6">
                  {/* Lifecycle Summary Cards Preview */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                    <div className="bg-card border border-slate-200 dark:border-border rounded-lg shadow-sm p-1 sm:p-1.5">
                      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-0.5">New Leads</p>
                      <p className="text-base sm:text-lg font-extrabold text-blue-600 dark:text-blue-400 tracking-tight">—</p>
                    </div>
                    <div className="bg-card border border-slate-200 dark:border-border rounded-lg shadow-sm p-1 sm:p-1.5">
                      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-0.5">Active</p>
                      <p className="text-base sm:text-lg font-extrabold text-green-600 dark:text-green-400 tracking-tight">—</p>
                    </div>
                    <div className="bg-card border border-slate-200 dark:border-border rounded-lg shadow-sm p-1 sm:p-1.5">
                      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-0.5">Completed</p>
                      <p className="text-base sm:text-lg font-extrabold text-slate-600 dark:text-slate-400 tracking-tight">—</p>
                    </div>
                    <div className="bg-card border border-slate-200 dark:border-border rounded-lg shadow-sm p-1 sm:p-1.5">
                      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-0.5">Ignored</p>
                      <p className="text-base sm:text-lg font-extrabold text-slate-600 dark:text-slate-400 tracking-tight">—</p>
                    </div>
                  </div>

                  {/* Leads Header Preview */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl sm:text-3xl font-bold text-foreground">
                        Customer Leads
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
                        No Active Leads
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 bg-card border border-slate-200 dark:border-border/60 rounded-lg p-1 shadow-sm">
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
                    <div className="bg-card border border-slate-200 dark:border-border/60 rounded-lg shadow-sm p-2 sm:p-2.5 border-l-2 border-l-orange-500">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-orange-100 dark:bg-orange-900/30">
                          <span className="text-sm">📱</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-sm text-slate-900 dark:text-foreground truncate">
                              +1 (555) 123-4567
                            </p>
                            <span className="text-[10px] text-slate-500 dark:text-muted-foreground/70">5m ago</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300 text-[9px] font-medium rounded-full">New</span>
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300 text-[9px] font-medium rounded-full">Needs Response</span>
                            <p className="text-xs text-slate-600 dark:text-muted-foreground/80 truncate">
                              Customer: Hi, I'm interested in your services...
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sample Lead 2 */}
                    <div className="bg-card border border-slate-200 dark:border-border/60 rounded-lg shadow-sm p-2 sm:p-2.5 border-l-2 border-l-blue-500">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-100 dark:bg-blue-900/30">
                          <span className="text-sm">📞</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-sm text-slate-900 dark:text-foreground truncate">
                              +1 (555) 987-6543
                            </p>
                            <span className="text-[10px] text-slate-500 dark:text-muted-foreground/70">12m ago</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300 text-[9px] font-medium rounded-full">New</span>
                            <p className="text-xs text-slate-600 dark:text-muted-foreground/80 truncate">
                              Customer: We have a pipe emergency at our office...
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sample Lead 3 */}
                    <div className="bg-card border border-slate-200 dark:border-border/60 rounded-lg shadow-sm p-2 sm:p-2.5 border-l-2 border-l-green-500">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-green-100 dark:bg-green-900/30">
                          <span className="text-sm">📱</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-sm text-slate-900 dark:text-foreground truncate">
                              +1 (555) 456-7890
                            </p>
                            <span className="text-[10px] text-slate-500 dark:text-muted-foreground/70">1h ago</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300 text-[9px] font-medium rounded-full">Completed</span>
                            <p className="text-xs text-slate-600 dark:text-muted-foreground/80 truncate">
                              You: Thanks for reaching out! We'll call...
                            </p>
                          </div>
                        </div>
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
                      onClick={handleStartSubscription}
                      disabled={checkoutLoading || eligibilityLoading}
                      className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {checkoutLoading ? 'Starting…' : (eligibilityLoading ? 'Checking plan...' : (checkoutMode === 'trial' ? 'Start Free Trial' : 'Subscribe Now'))}
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
            {hasActiveAccess(business) && (
              <>
            {/* Lifecycle Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-4 sm:mb-6">
              <StatCard
                value={leads.filter(l => getLeadLifecycleStatus(l) === 'new' && !l.deleted_at).length}
                label="New Leads"
                description={
                  leads.filter(l => getLeadLifecycleStatus(l) === 'new' && !l.deleted_at).length === 0
                    ? 'Awaiting Contact'
                    : 'Waiting For Reply'
                }
                icon="👥"
                iconColor="blue"
                isInteractive={false}
              />
              <StatCard
                value={leads.filter(l => getLeadLifecycleStatus(l) === 'active' && !l.deleted_at && l.payment_status !== 'paid').length}
                label="Active Leads"
                description={
                  leads.filter(l => getLeadLifecycleStatus(l) === 'active' && !l.deleted_at && l.payment_status !== 'paid').length === 0
                    ? 'No active leads'
                    : 'Leads being worked on'
                }
                icon="💬"
                iconColor="green"
                isInteractive={false}
              />
              <StatCard
                value={leads.filter(l => getLeadLifecycleStatus(l) === 'completed' && !l.deleted_at).length}
                label="Completed Leads"
                description={
                  leads.filter(l => getLeadLifecycleStatus(l) === 'completed' && !l.deleted_at).length === 0
                    ? 'No completed leads yet'
                    : 'Successfully completed'
                }
                icon="📅"
                iconColor="slate"
                isInteractive={false}
              />
              <StatCard
                value={ignoredContactsCount}
                label="Ignored Contacts"
                description={
                  ignoredContactsCount === 0
                    ? 'No Blocked Contacts'
                    : 'Blocked From Automation'
                }
                icon="🚫"
                iconColor="orange"
                isInteractive={false}
              />
            </div>

            {/* Leads Header - Simplified */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-foreground tracking-tight">
                  Customer Leads
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {statusFilter === 'all'
                    ? `${leads.filter(l => !l.deleted_at).length} ${leads.filter(l => !l.deleted_at).length === 1 ? 'lead' : 'leads'} total`
                    : `${leads.filter(l => getLeadLifecycleStatus(l) === statusFilter && (String(statusFilter) === 'deleted' ? l.deleted_at : !l.deleted_at)).length} ${statusFilter} ${leads.filter(l => getLeadLifecycleStatus(l) === statusFilter && (String(statusFilter) === 'deleted' ? l.deleted_at : !l.deleted_at)).length === 1 ? 'lead' : 'leads'}`
                  }
                </p>
                {statusFilter === 'ignored' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Ignored leads are hidden from your main list and can be restored for up to 30 days.
                  </p>
                )}
                {statusFilter === 'deleted' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Deleted leads are hidden from your main list and can be restored for up to 30 days.
                  </p>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {leads.length > 0 && (
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/40 rounded-lg p-1">
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                        showFilters 
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm' 
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground hover:bg-white/50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      Filters
                    </button>
                    <div className="w-px h-5 bg-slate-300 dark:bg-slate-600/50 mx-1"></div>
                    <button
                      onClick={fetchLeads}
                      disabled={loading || refreshing}
                      className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground hover:bg-white/50 dark:hover:bg-slate-700/50 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {refreshing ? (
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-600"></div>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                      Refresh
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setShowAddCustomerModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm hover:shadow"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Customer
                </button>
              </div>
            </div>

            {/* Filters - Simplified */}
            {showFilters && (
              <div className="bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-700/40 rounded-lg p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Search
                    </label>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name, phone, service, or address..."
                      className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white dark:bg-slate-800 text-foreground placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-white dark:bg-slate-800 text-foreground"
                    >
                      <option value="all">All Status</option>
                      <option value="new">New</option>
                      <option value="active">Active</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="payment_requested">Payment Requested</option>
                      <option value="paid">Paid</option>
                      <option value="completed">Completed</option>
                      <option value="lost">Lost</option>
                      <option value="ignored">Ignored</option>
                      <option value="deleted">Deleted</option>
                    </select>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="deletedFilter"
                      checked={deletedFilter}
                      onChange={(e) => setDeletedFilter(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="deletedFilter" className="ml-2 text-sm text-foreground">
                      Show Deleted
                    </label>
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
            {!loading && !error && leads.length === 0 && (
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900/20 dark:to-blue-900/10 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 sm:p-10 text-center animate-fadeIn relative overflow-hidden">
                {/* Subtle background gradient for depth */}
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-blue-50/30 to-transparent dark:from-transparent dark:via-blue-900/10 dark:to-transparent pointer-events-none"></div>
                <div className="relative z-10">
                {(() => {
                  // Determine actual onboarding state
                  const hasActiveSubscription = hasActiveAccess(business)
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
                          No active leads
                        </h3>
                        <div className="text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
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
                          No active leads
                        </h3>
                        <div className="text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
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
                    <div className="text-center py-12 sm:py-20 px-4">
                      <div className="max-w-md mx-auto">
                        {/* Visual Process Flow */}
                        <div className="flex flex-col items-center gap-4 mb-8">
                          <div className="flex items-center gap-4 w-full">
                            <div className="flex-1">
                              <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-2">
                                <span className="text-2xl">📞</span>
                              </div>
                              <p className="text-sm font-medium text-slate-900 dark:text-foreground">Missed Call</p>
                            </div>
                            <div className="flex-shrink-0">
                              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center mx-auto mb-2">
                                <span className="text-2xl">💬</span>
                              </div>
                              <p className="text-sm font-medium text-slate-900 dark:text-foreground">Auto Text Sent</p>
                            </div>
                            <div className="flex-shrink-0">
                              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mx-auto mb-2">
                                <span className="text-2xl">👤</span>
                              </div>
                              <p className="text-sm font-medium text-slate-900 dark:text-foreground">Lead Created</p>
                            </div>
                          </div>
                        </div>

                        {/* Header */}
                        <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-foreground mb-3">
                          No Leads Yet
                        </h3>

                        {/* Description */}
                        <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base mb-8 max-w-md mx-auto">
                          When someone misses a call to your business number, ReplyFlow will automatically create a lead here.
                        </p>

                        {/* Passive instruction */}
                        <p className="text-slate-500 dark:text-slate-500 text-xs sm:text-sm max-w-md mx-auto mb-6">
                          Leads will appear here as missed calls are detected.
                        </p>

                        {/* Add Customer Button */}
                        <button
                          onClick={() => setShowAddCustomerModal(true)}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm hover:shadow"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Customer Manually
                        </button>
                      </div>
                    </div>
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

            {/* Leads List - CRM-style Grid */}
            {!loading && !error && sortedLeads.length > 0 && (
              (() => {
                const filteredLeads = statusFilter === 'all' 
                  ? sortedLeads 
                  : sortedLeads.filter(l => getLeadLifecycleStatus(l) === statusFilter)
                
                if (filteredLeads.length === 0) {
                  // No leads match the current filter
                  return (
                    <div className="text-center py-16 px-4">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">No {statusFilter} leads</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Try changing the status filter to see other leads
                      </p>
                    </div>
                  )
                }
                
                const singleLead = filteredLeads.length === 1

                if (singleLead) {
                  // Single lead: centered with supportive text
                  const lead = filteredLeads[0]
                  const latestMessage = lead.messages && lead.messages.length > 0
                    ? lead.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]     
                    : null

                  const messageStatus = getLeadMessageStatus(latestMessage)
                  const lastActivity = lead.last_message_at || lead.first_contact_at || lead.created_at
                  const hasReplied = lead.messages?.some((m: any) => m.direction === 'inbound')
                  const hasTexted = lead.messages?.some((m: any) => m.direction === 'outbound')
                  const isUnread = hasUnread(lead.id)
                  const needsResponse = needsResponseCheck(lead.id)
                  const leadTiming = calculateLeadTiming(lead)
                  const isNewLead = (Date.now() - new Date(lastActivity).getTime()) < 24 * 60 * 60 * 1000
                  const aiData = getAIData(lead)

                  return (
                    <div className="flex flex-col items-center">
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-3.5">
                        {statusFilter === 'all' 
                          ? `${filteredLeads.length} ${filteredLeads.length === 1 ? 'lead' : 'leads'}`
                          : `${filteredLeads.length} ${statusFilter} ${filteredLeads.length === 1 ? 'lead' : 'leads'}`
                        }
                      </p>
                      <div
                        key={lead.id}
                        className="w-full max-w-2xl h-full flex flex-col bg-card rounded-lg border border-slate-700/40 hover:border-slate-600 transition-all duration-200 group cursor-pointer"
                        onClick={() => handleConversationClick(lead.id)}
                      >
                        {/* Status Accent Bar */}
                        <div className={`h-1 rounded-t-lg ${getLeadStatusAccentColor(getLeadLifecycleStatus(lead))}`}></div>
                        <div className="p-4 sm:p-5 flex-1 flex flex-col">
                          {/* Header: Name, Phone, Status */}
                          <div className="flex items-start justify-between mb-3 sm:mb-4">
                            <div className="flex-1 min-w-0">
                              <h3 className={`text-base sm:text-lg font-semibold text-white mb-1 truncate tracking-tight ${isNewLead ? 'text-orange-400' : ''}`}>
                                {getLeadDisplayName(lead)}
                              </h3>
                              <p className="text-sm text-slate-400">
                                {lead.caller_phone === '+10000000000' ? 'Test Number' : formatPhoneNumber(lead.caller_phone)}
                              </p>
                            </div>
                            <div onClick={(e) => e.stopPropagation()}>
                              {lead.deleted_at ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-900/30 text-red-400 border border-red-700/50">
                                  Deleted
                                </span>
                              ) : (
                                <LeadStatusDropdown
                                  currentStatus={getLeadLifecycleStatus(lead)}
                                  onStatusChange={(newStatus) => handleLeadStatusChange(lead.id, newStatus)}
                                  size="sm"
                                />
                              )}
                            </div>
                          </div>

                          {/* Compact Preview */}
                          <div className="mb-3 sm:mb-4 space-y-1.5 sm:space-y-2 flex-1">
                            {aiData.reason && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm">📋</span>
                                <p className="text-sm text-slate-300">
                                  {sentenceCase(aiData.reason)}
                                </p>
                              </div>
                            )}
                            {aiData.details && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm">📝</span>
                                <p className="text-sm text-slate-300">
                                  {sentenceCase(aiData.details)}
                                </p>
                              </div>
                            )}
                            {aiData.urgency && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm">🔥</span>
                                <span className={`text-sm font-medium ${
                                  aiData.urgency.toLowerCase() === 'urgent' || aiData.urgency.toLowerCase() === 'high'
                                    ? 'text-red-400'
                                    : 'text-slate-300'
                                }`}>
                                  {sentenceCase(aiData.urgency)}
                                </span>
                              </div>
                            )}
                            {!aiData.reason && !aiData.details && !aiData.urgency && (
                              <p className="text-sm text-slate-300">
                                {getCompactSummary(lead)}
                              </p>
                            )}
                          </div>

                          {/* Metadata */}
                          <div className="flex items-center justify-between mb-3 sm:mb-4">
                            <div className="flex items-center gap-2 sm:gap-2.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const status = isNewLead ? 'new' : getLeadLifecycleStatus(lead)
                                  setStatusFilter(statusFilter === status ? 'all' : status)
                                }}
                                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                                  isNewLead ? 'bg-orange-600/20 text-orange-300' :
                                  getLeadLifecycleStatus(lead) === 'new' ? 'bg-blue-600/20 text-blue-300' :
                                  getLeadLifecycleStatus(lead) === 'active' ? 'bg-green-600/20 text-green-300' :
                                  'bg-slate-600/20 text-slate-300'
                                } hover:opacity-80 cursor-pointer`}
                                title={`Filter by ${isNewLead ? 'New' : getLeadLifecycleStatus(lead)} status`}
                                aria-label={`Filter by ${isNewLead ? 'New' : getLeadLifecycleStatus(lead)} status`}
                              >
                                {isNewLead ? 'New' : getLeadLifecycleStatus(lead).charAt(0).toUpperCase() + getLeadLifecycleStatus(lead).slice(1)}
                              </button>
                              <span className="text-sm text-slate-400">
                                {formatRelativeTime(lead.created_at)}
                              </span>
                            </div>
                            {isNewLead && (
                              <span className="px-2.5 py-1 bg-orange-600/20 text-orange-300 text-xs font-semibold rounded-full">
                                New
                              </span>
                            )}
                          </div>

                          {/* Action Buttons - Improved mobile touch targets */}
                          <div className="flex items-center gap-2 sm:gap-3 pt-3 border-t border-slate-700/50 mt-auto">
                            {lead.caller_phone && lead.caller_phone !== '+10000000000' && (
                              <a
                                href={`tel:${lead.caller_phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex sm:hidden flex-1 inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors group-hover:bg-blue-900/20 group-hover:text-blue-400"
                                title="Call"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z" />
                                </svg>
                                Call
                              </a>
                            )}
                            <div className="flex-1 sm:flex-1 inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/dashboard/leads/${lead.id}`)
                              }}
                            >
                              View Conversation
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setCardOverflowMenu(cardOverflowMenu === lead.id ? null : lead.id)
                                }}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                title="More actions"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                </svg>
                              </button>
                              {cardOverflowMenu === lead.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-[9999]"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      setCardOverflowMenu(null)
                                    }}
                                  />
                                  <div className="absolute right-0 top-full mt-1 z-[10000] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                                    {lead.deleted_at && (
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          handleRestoreLead(lead.id)
                                          setCardOverflowMenu(null)
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Restore Lead
                                      </button>
                                    )}
                                    {!lead.deleted_at && getLeadLifecycleStatus(lead) !== 'ignored' && (
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          handleIgnoreLead(lead.id)
                                          setCardOverflowMenu(null)
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        Ignore Lead
                                      </button>
                                    )}
                                    {!lead.deleted_at && getLeadLifecycleStatus(lead) === 'ignored' && (
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          handleLeadStatusChange(lead.id, 'active')
                                          setCardOverflowMenu(null)
                                        }}
                                        className="w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Restore Lead
                                      </button>
                                    )}
                                    {!lead.deleted_at && (
                                      <>
                                        <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleDeleteLeadClick(lead.id)
                                          }}
                                          className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2 font-medium"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                          Delete Lead
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                } else {
                  // Multiple leads: grid layout
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {filteredLeads.map((lead: any, index: number) => {
                        const latestMessage = lead.messages && lead.messages.length > 0
                          ? lead.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]     
                          : null

                        const messageStatus = getLeadMessageStatus(latestMessage)
                        const lastActivity = lead.last_message_at || lead.first_contact_at || lead.created_at
                        const hasReplied = lead.messages?.some((m: any) => m.direction === 'inbound')
                        const hasTexted = lead.messages?.some((m: any) => m.direction === 'outbound')
                        const isUnread = hasUnread(lead.id)
                        const needsResponse = needsResponseCheck(lead.id)

                        // Calculate lead timing
                        const leadTiming = calculateLeadTiming(lead)

                        // Check if this is the newest lead (within 24 hours)
                        const isNewLead = index === 0 && (Date.now() - new Date(lastActivity).getTime()) < 24 * 60 * 60 * 1000

                        const aiData = getAIData(lead)

                        return (
                          <div
                            key={lead.id}
                            className="bg-card rounded-lg border border-slate-700/40 hover:border-slate-600 transition-all duration-200 group cursor-pointer"
                            onClick={() => handleConversationClick(lead.id)}
                          >
                            {/* Status Accent Bar */}
                            <div className={`h-1 rounded-t-lg ${getLeadStatusAccentColor(getLeadLifecycleStatus(lead))}`}></div>
                            <div className="p-3 sm:p-4">
                              {/* Header: Name, Phone, Status */}
                              <div className="flex items-start justify-between mb-2 sm:mb-3">
                                <div className="flex-1 min-w-0">
                                  <h3 className={`text-sm sm:text-base font-semibold text-white mb-1 truncate tracking-tight ${isNewLead ? 'text-orange-400' : ''}`}>
                                    {getLeadDisplayName(lead)}
                                  </h3>
                                  <p className="text-xs sm:text-sm text-slate-400">
                                    {lead.caller_phone === '+10000000000' ? 'Test Number' : formatPhoneNumber(lead.caller_phone)}
                                  </p>
                                </div>
                                <div onClick={(e) => e.stopPropagation()}>
                                  {lead.deleted_at ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-900/30 text-red-400 border border-red-700/50">
                                      Deleted
                                    </span>
                                  ) : (
                                    <LeadStatusDropdown
                                      currentStatus={getLeadLifecycleStatus(lead)}
                                      onStatusChange={(newStatus) => handleLeadStatusChange(lead.id, newStatus)}
                                      size="sm"
                                    />
                                  )}
                                </div>
                              </div>

                              {/* Compact Preview */}
                              <div className="mb-2 sm:mb-3 space-y-1 sm:space-y-1.5">
                                {aiData.reason && (
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <span className="text-xs sm:text-sm">📋</span>
                                    <p className="text-xs sm:text-sm text-slate-300">
                                      {aiData.reason}
                                    </p>
                                  </div>
                                )}
                                {aiData.details && (
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <span className="text-xs sm:text-sm">📝</span>
                                    <p className="text-xs sm:text-sm text-slate-300">
                                      {aiData.details}
                                    </p>
                                  </div>
                                )}
                                {aiData.urgency && (
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <span className="text-xs sm:text-sm">🔥</span>
                                    <span className={`text-xs sm:text-sm font-medium ${
                                      aiData.urgency.toLowerCase() === 'urgent' || aiData.urgency.toLowerCase() === 'high'
                                        ? 'text-red-400'
                                        : 'text-slate-300'
                                    }`}>
                                      {aiData.urgency}
                                    </span>
                                  </div>
                                )}
                                {!aiData.reason && !aiData.details && !aiData.urgency && (
                                  <p className="text-xs sm:text-sm text-slate-300">
                                    {getCompactSummary(lead)}
                                  </p>
                                )}
                              </div>

                              {/* Metadata */}
                              <div className="flex items-center justify-between mb-2 sm:mb-3">
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const status = isNewLead ? 'new' : getLeadLifecycleStatus(lead)
                                      setStatusFilter(statusFilter === status ? 'all' : status)
                                    }}
                                    className={`px-2 py-0.5 text-[10px] sm:text-xs font-medium rounded-full transition-all duration-200 ${
                                      isNewLead ? 'bg-orange-600/20 text-orange-300' :
                                      getLeadLifecycleStatus(lead) === 'new' ? 'bg-blue-600/20 text-blue-300' :
                                      getLeadLifecycleStatus(lead) === 'active' ? 'bg-green-600/20 text-green-300' :
                                      'bg-slate-600/20 text-slate-300'
                                    } hover:opacity-80 cursor-pointer`}
                                    title={`Filter by ${isNewLead ? 'New' : getLeadLifecycleStatus(lead)} status`}
                                    aria-label={`Filter by ${isNewLead ? 'New' : getLeadLifecycleStatus(lead)} status`}
                                  >
                                    {isNewLead ? 'New' : getLeadLifecycleStatus(lead).charAt(0).toUpperCase() + getLeadLifecycleStatus(lead).slice(1)}
                                  </button>
                                  <span className="text-xs text-slate-400">
                                    {formatRelativeTime(lead.created_at)}
                                  </span>
                                </div>
                                {isNewLead && (
                                  <span className="px-2 py-0.5 bg-orange-600/20 text-orange-300 text-[10px] font-semibold rounded-full">
                                    New
                                  </span>
                                )}
                              </div>

                              {/* Action Buttons - Improved mobile touch targets */}
                              <div className="flex items-center gap-1.5 sm:gap-2 pt-2 sm:pt-3 border-t border-slate-700/50">
                                {lead.caller_phone && lead.caller_phone !== '+10000000000' && (
                                  <a
                                    href={`tel:${lead.caller_phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex sm:hidden flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-medium rounded-lg transition-colors group-hover:bg-blue-900/20 group-hover:text-blue-400"
                                    title="Call"
                                  >
                                    <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    Call
                                  </a>
                                )}
                                <div className="flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    router.push(`/dashboard/leads/${lead.id}`)
                                  }}
                                >
                                  View
                                  <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                                <div className="relative">
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      setCardOverflowMenu(cardOverflowMenu === lead.id ? null : lead.id)
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                    title="More actions"
                                  >
                                    <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                    </svg>
                                  </button>
                                  {cardOverflowMenu === lead.id && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-[9999]"
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          setCardOverflowMenu(null)
                                        }}
                                      />
                                      <div className="absolute right-0 top-full mt-1 z-[10000] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                                        {lead.deleted_at && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              handleRestoreLead(lead.id)
                                              setCardOverflowMenu(null)
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            Restore Lead
                                          </button>
                                        )}
                                        {!lead.deleted_at && getLeadLifecycleStatus(lead) !== 'ignored' && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              handleIgnoreLead(lead.id)
                                              setCardOverflowMenu(null)
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            Ignore Lead
                                          </button>
                                        )}
                                        {!lead.deleted_at && getLeadLifecycleStatus(lead) === 'ignored' && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              handleLeadStatusChange(lead.id, 'active')
                                              setCardOverflowMenu(null)
                                            }}
                                            className="w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            Restore Lead
                                          </button>
                                        )}
                                        {!lead.deleted_at && (
                                          <>
                                            <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>
                                            <button
                                              onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleDeleteLeadClick(lead.id)
                                              }}
                                              className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2 font-medium"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                              </svg>
                                              Delete Lead
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                }
              })()
            )}
            </>
            )}
            </div>
          </main>
        </div>
      </BusinessGuard>
    </AuthGuard>
    <BottomNavigation />
    <AddCustomerModal
      isOpen={showAddCustomerModal}
      onClose={() => setShowAddCustomerModal(false)}
    />
    {showDeleteModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-2">
            Delete Lead?
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            This will move the lead to Deleted. Nothing will be permanently removed and you can restore this lead at any time.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setShowDeleteModal(false)
                setLeadToDelete(null)
              }}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteLead}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              Delete Lead
            </button>
          </div>
        </div>
      </div>
    )}
    </DashboardErrorBoundary>
  )
}
