'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuPortal,
} from '@radix-ui/react-dropdown-menu'
import {
  formatPhoneNumber,
  formatRelativeTime,
  truncateText,
  normalizePhoneNumberForSearch,
  sentenceCase,
  getLeadDisplayName
} from '@/lib/utils'
import { getLeadAIIntake, getLeadRequestTitle } from '@/lib/ai-field-mapping'
import { copyToClipboard } from '@/lib/clipboard'
import { calculateLeadTiming, getCustomerInfoForCopy, getAISummaryForCopy } from '@/lib/lead-timing'
import { getCustomerStatusStyle, normalizeCustomerStatus } from '@/lib/customer-status'
import { cn } from '@/lib/theme'
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
import Input from '@/components/ui/Input'
import Skeleton, { CardSkeleton, ListItemSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import Image from 'next/image'
import { RealtimeChannel } from '@supabase/supabase-js'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import { getLeadLifecycleStatus, calculateLeadStatusCounts } from '@/lib/lead-lifecycle'
import { CustomerStatus } from '@/lib/customer-status'
import StatCard from '@/components/StatCard'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import LeadStatusDropdown from '@/components/LeadStatusDropdown'
import AddCustomerModal from '@/components/AddCustomerModal'
import LeadCard from '@/components/LeadCard'
import FocusSection from '@/components/FocusSection'
import { Wrench, FileText, Clock } from 'lucide-react'

// Helper to get compact summary for lead card
// [simple_mode_structured_preview_generated]
function getCompactSummary(lead: any): string {
  // Prefer structured AI intake fields over raw SMS body
  const intake = getLeadAIIntake(lead)
  const name = intake.customerName
  const service = getLeadRequestTitle(lead) || intake.serviceRequested
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
    if (inbound?.content) return truncateText(inbound.content, 80)
  }

  return 'New customer request'
}

// Status filter options
const statusFilterOptions = [
  { value: 'all', label: 'All', icon: '●' },
  { value: 'new', label: 'New', icon: '📞' },
  { value: 'active', label: 'Active', icon: '💬' },
  { value: 'scheduled', label: 'Scheduled', icon: '📅' },
  { value: 'payment_requested', label: 'Payment Requested', icon: '💳' },
  { value: 'paid', label: 'Paid', icon: '✅' },
  { value: 'completed', label: 'Completed', icon: '✓' },
  { value: 'lost', label: 'Lost', icon: '❌' },
  { value: 'ignored', label: 'Ignored', icon: '🟠' },
]

function getStatusFilterIcon(filter: string): string {
  const option = statusFilterOptions.find(opt => opt.value === filter)
  return option?.icon || '●'
}

function getStatusFilterLabel(filter: string): string {
  const option = statusFilterOptions.find(opt => opt.value === filter)
  return option?.label || 'All'
}

// Helper to get structured AI data for lead card (legacy shape)
function getAIData(lead: any): { reason: string | null; urgency: string | null; details: string | null } {
  const intake = getLeadAIIntake(lead)
  return {
    reason: getLeadRequestTitle(lead) || intake.serviceRequested,
    urgency: intake.desiredCompletion,
    details: intake.additionalDetails,
  }
}

// Helper to get address from lead
function getAddress(lead: any): string | null {
  return getLeadAIIntake(lead).serviceAddress
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

const MOBILE_BOTTOM_NAV_COLLISION_PADDING = 80

export default function LeadsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { business, refreshBusiness } = useBusiness()
  const { user, signOut } = useAuth()
  const [leads, setLeads] = useState<any[]>([])
  const [missedCallCount, setMissedCallCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [quickFilter, setQuickFilter] = useState<'all' | 'active' | 'new' | 'completed' | 'ignored'>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const { checkoutMode, isLoading: eligibilityLoading } = useTrialEligibility()
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  // Note: removed unused deletedFilter state to simplify filtering state

  // Handle query parameters for return flow
  const addCustomer = searchParams?.get('addCustomer')
  const returnTo = searchParams?.get('returnTo')
  const statusParam = searchParams?.get('status')
  const dashboardOrigin = searchParams?.get('dashboard-origin')

  // Auto-open AddCustomerModal if addCustomer=true
  useEffect(() => {
    if (addCustomer === 'true' && !showAddCustomerModal) {
      setShowAddCustomerModal(true)
    }
  }, [addCustomer, showAddCustomerModal])

  // Initialize filters from URL parameters
  useEffect(() => {
    if (statusParam) {
      // Map status parameter to quickFilter
      const validStatuses = ['new', 'active', 'completed', 'ignored']
      if (validStatuses.includes(statusParam)) {
        setQuickFilter(statusParam as 'all' | 'active' | 'new' | 'completed' | 'ignored')
        setStatusFilter('all')
      } else {
        setStatusFilter(statusParam)
        setQuickFilter('all')
      }
    }
  }, [statusParam])

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
      setRefreshing(true)
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

      // Apply deleted filter derived from statusFilter
      if (statusFilter === 'deleted') {
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
    } catch (error: any) {
      console.error('[fetchLeads] Error fetching leads:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        fullError: error
      })
      setError('Failed to load customers. Please try again.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [business?.id, supabase, statusFilter])

  // Handle lead status change from overview page
  const handleLeadStatusChange = async (leadId: string, newStatus: CustomerStatus) => {
    // Store old status for revert on error
    const oldStatus = leads.find(lead => lead.id === leadId)?.status

    // Optimistic update - update local state immediately
    setLeads(prev => prev.map(lead => 
      lead.id === leadId 
        ? { ...lead, status: newStatus }
        : lead
    ))

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
        throw new Error(error.error || `Failed to update customer status to ${newStatus}`)
      }
    } catch (error) {
      console.error('Error updating lead status:', error)
      // Revert optimistic update on error
      if (oldStatus) {
        setLeads(prev => prev.map(lead => 
          lead.id === leadId 
            ? { ...lead, status: oldStatus }
            : lead
        ))
      }
    }
  }

  // Handle ignoring a lead
  const handleIgnoreLead = async (leadId: string) => {
    // Store old status for revert on error
    const oldStatus = leads.find(lead => lead.id === leadId)?.status

    // Optimistic update - update local state immediately
    setLeads(prev => prev.map(lead => 
      lead.id === leadId 
        ? { ...lead, status: 'ignored' }
        : lead
    ))

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
    } catch (error) {
      console.error('Error ignoring lead:', error)
      // Revert optimistic update on error
      if (oldStatus) {
        setLeads(prev => prev.map(lead => 
          lead.id === leadId 
            ? { ...lead, status: oldStatus }
            : lead
        ))
      }
    }
  }

  // Handle restoring ignored lead
  const handleRestoreIgnoredLead = async (leadId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      // Update lead status from ignored to new via API
      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: 'new'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to restore customer')
      }

      // Update local state
      setLeads(prev => prev.map(lead => 
        lead.id === leadId 
          ? { ...lead, status: 'new' }
          : lead
      ))
    } catch (error) {
      console.error('Error restoring ignored lead:', error)
      alert('Failed to restore customer. Please try again.')
    }
  }

  // Handle restore deleted customer
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
        throw new Error(error.error || 'Failed to restore customer')
      }

      // Update local state
      setLeads(prev => prev.map(lead =>
        lead.id === leadId
          ? { ...lead, deleted_at: null, deleted_by: null, deletion_reason: null }
          : lead
      ))
    } catch (error) {
      console.error('Error restoring lead:', error)
      alert('Failed to restore customer. Please try again.')
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
      ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
      ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false) ||
      (intake.serviceRequested?.toLowerCase().includes(q)) ||
      (intake.serviceAddress?.toLowerCase().includes(q)) ||
      normalizePhoneNumberForSearch(lead.caller_phone).includes(normalizePhoneNumberForSearch(searchQuery)) ||
      (lead.messages && lead.messages.some((m: any) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase())
      ))

    const leadStatus = getLeadLifecycleStatus(lead)
    const isDeleted = !!lead.deleted_at

    // Handle Deleted filter specifically
    if (statusFilter === 'deleted') {
      return matchesSearch && isDeleted
    }

    const matchesStatus = statusFilter === 'all' || leadStatus === statusFilter

    // Hide deleted customers from default view (when filter is not 'deleted')
    const shouldShowDeleted = !isDeleted

    // Handle quick filter
    let matchesQuickFilter = true
    if (quickFilter === 'active') {
      matchesQuickFilter = leadStatus === 'active'
    } else if (quickFilter === 'new') {
      matchesQuickFilter = leadStatus === 'new'
    } else if (quickFilter === 'completed') {
      matchesQuickFilter = leadStatus === 'completed'
    } else if (quickFilter === 'ignored') {
      matchesQuickFilter = leadStatus === 'ignored'
    }

    return matchesSearch && matchesStatus && shouldShowDeleted && matchesQuickFilter
  })

  
  
  // Handle start subscription
  const handleStartSubscription = async () => {
    setCheckoutLoading(true)
    
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
        <div className="min-h-screen bg-background page-gradient flex flex-col relative overflow-x-hidden">
            {/* App Header */}
            <AppHeader title="Customers" />

          {/* Main Content */}
          <main className="flex-1 pt-3.5 lg:pt-7 px-4 lg:px-6 pb-6 md:pb-6 relative z-10 overflow-y-auto" style={{ paddingBottom: 'var(--bottom-nav-height, 80px)' }}>
            <div className="max-w-[1400px] mx-auto space-y-2.5 sm:space-y-3.5 lg:space-y-5">
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

            {/* Focus - Lightweight Customer Context */}
            {hasActiveAccess(business) && (
              <FocusSection business={business} view="customers" title="Customer Focus" compact />
            )}


            {/* Pre-trial locked preview - show what users will unlock */}
            {!hasActiveAccess(business) && (
              <div className="relative mb-4 sm:mb-6">
                {/* Leads Preview Content */}
                <div className="space-y-4 sm:space-y-6">
                  {/* Lifecycle Summary Cards Preview */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                    <div className="bg-card border border-slate-200 dark:border-border rounded-lg shadow-sm p-1 sm:p-1.5">
                      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide mb-0.5">New Customers</p>
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
                        Customers
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
                        No Active Customers
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
                    <p className="text-white font-medium mb-4">Unlock your customers inbox</p>
                    <p className="text-white/80 text-sm mb-6 max-w-md mx-auto">
                      Start your trial to begin capturing missed-call customers automatically
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
            {/* Calculate lead status counts for use in multiple sections */}
            {(() => {
              const leadStatusCounts = calculateLeadStatusCounts(leads)
              return (
                <>
            {/* Lifecycle Summary Cards - Compact on mobile */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-2 sm:mb-6">
              <StatCard
                value={leadStatusCounts.new}
                label="Needs Reply"
                description={
                  leadStatusCounts.new === 0
                    ? 'Awaiting your response'
                    : 'Needs your response'
                }
                icon="👥"
                iconColor="blue"
                isInteractive={true}
                isSelected={quickFilter === 'new' && statusFilter === 'all'}
                onClick={() => {
                  if (quickFilter === 'new') {
                    setQuickFilter('all')
                    setStatusFilter('all')
                    // Clear status query parameter
                    const params = new URLSearchParams(searchParams?.toString())
                    params.delete('status')
                    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
                    router.replace(newUrl)
                  } else {
                    setQuickFilter('new')
                    setStatusFilter('all')
                  }
                }}
                ariaLabel="Filter customers needing a reply"
              />
              <StatCard
                value={leadStatusCounts.active}
                label="Active"
                description={
                  leadStatusCounts.active === 0
                    ? 'No active customers'
                    : 'Customers being worked on'
                }
                icon="💬"
                iconColor="green"
                isInteractive={true}
                isSelected={quickFilter === 'active' && statusFilter === 'all'}
                onClick={() => {
                  if (quickFilter === 'active') {
                    setQuickFilter('all')
                    setStatusFilter('all')
                    // Clear status query parameter
                    const params = new URLSearchParams(searchParams?.toString())
                    params.delete('status')
                    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
                    router.replace(newUrl)
                  } else {
                    setQuickFilter('active')
                    setStatusFilter('all')
                  }
                }}
                ariaLabel="Filter active customers"
              />
              <StatCard
                value={leadStatusCounts.completed}
                label="Completed"
                description={
                  leadStatusCounts.completed === 0
                    ? 'No completed customers yet'
                    : 'Successfully completed'
                }
                icon="📅"
                iconColor="slate"
                isInteractive={true}
                isSelected={quickFilter === 'completed' && statusFilter === 'all'}
                onClick={() => {
                  if (quickFilter === 'completed') {
                    setQuickFilter('all')
                    setStatusFilter('all')
                    // Clear status query parameter
                    const params = new URLSearchParams(searchParams?.toString())
                    params.delete('status')
                    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
                    router.replace(newUrl)
                  } else {
                    setQuickFilter('completed')
                    setStatusFilter('all')
                  }
                }}
                ariaLabel="Filter completed customers"
              />
              <StatCard
                value={leadStatusCounts.ignored}
                label="Ignored"
                description={
                  leadStatusCounts.ignored === 0
                    ? 'No ignored customers'
                    : 'Hidden from main list'
                }
                icon="🚫"
                iconColor="orange"
                isInteractive={true}
                isSelected={quickFilter === 'ignored'}
                onClick={() => {
                  if (quickFilter === 'ignored') {
                    setQuickFilter('all')
                    setStatusFilter('all')
                    // Clear status query parameter
                    const params = new URLSearchParams(searchParams?.toString())
                    params.delete('status')
                    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
                    router.replace(newUrl)
                  } else {
                    setQuickFilter('ignored')
                    setStatusFilter('all')
                  }
                }}
                ariaLabel="Filter ignored customers"
              />
            </div>

            {/* Customers Header - Compact on mobile */}
            <div className="mb-1.5 sm:mb-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
                    Customers
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 hidden sm:block">
                    Manage conversations, requests, jobs and customer history.
                  </p>
                </div>
              </div>
            </div>

            {/* Search, Filter, and Overflow - single line layout */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                {/* Search input */}
                <div className="relative flex-1">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search customers..."
                    className="w-full pl-11 pr-4 py-2.5 bg-background border border-border/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-blue-500/40 focus:border-transparent focus:outline-none transition-all"
                  />
                </div>

                {/* Filter dropdown button */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-10 px-3 inline-flex items-center justify-center gap-2 bg-background border border-border/50 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all whitespace-nowrap"
                      title="Filter by status"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-1.447.894l-2-1A1 1 0 0111 18v-5.586L3.293 6.707A1 1 0 013 6V4z" />
                      </svg>
                      <span className="hidden sm:inline">Filter</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuContent
                      align="end"
                      side="bottom"
                      sideOffset={8}
                      collisionPadding={{
                        top: 12,
                        right: 12,
                        bottom: 80,
                        left: 12,
                      }}
                      avoidCollisions
                      className="w-[200px] max-w-[calc(100vw-24px)] max-h-[min(400px,calc(100dvh-140px))] bg-card border border-border/50 rounded-lg shadow-xl shadow-black/10 dark:shadow-black/30 z-[10000] overflow-y-auto overscroll-contain"
                    >
                      <div className="px-2.5 py-1.5">
                        <div className="px-0.5 py-0.5 text-[9px] font-medium text-muted-foreground/50 uppercase tracking-[0.12em]">
                          Filter by Status
                        </div>
                      </div>
                      <div className="px-1 py-1 space-y-0.5">
                        <DropdownMenuItem
                          onClick={() => {
                            setQuickFilter('all')
                            setStatusFilter('all')
                            // Clear status query parameter
                            const params = new URLSearchParams(searchParams?.toString())
                            params.delete('status')
                            const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
                            router.replace(newUrl)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between outline-none focus:bg-muted/50 cursor-pointer rounded-md min-h-[36px]"
                        >
                          <span className="text-sm text-foreground">All</span>
                          {quickFilter === 'all' && statusFilter === 'all' && (
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setQuickFilter('active')
                            setStatusFilter('all')
                            // Clear status query parameter
                            const params = new URLSearchParams(searchParams?.toString())
                            params.delete('status')
                            const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
                            router.replace(newUrl)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between outline-none focus:bg-muted/50 cursor-pointer rounded-md min-h-[36px]"
                        >
                          <span className="text-sm text-foreground">Active</span>
                          {quickFilter === 'active' && statusFilter === 'all' && (
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setQuickFilter('new')
                            setStatusFilter('all')
                            // Clear status query parameter
                            const params = new URLSearchParams(searchParams?.toString())
                            params.delete('status')
                            const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
                            router.replace(newUrl)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between outline-none focus:bg-muted/50 cursor-pointer rounded-md min-h-[36px]"
                        >
                          <span className="text-sm text-foreground">Needs Reply</span>
                          {quickFilter === 'new' && statusFilter === 'all' && (
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setStatusFilter('scheduled')
                            setQuickFilter('all')
                            // Set status query parameter
                            const params = new URLSearchParams(searchParams?.toString())
                            params.set('status', 'scheduled')
                            router.replace(`${pathname}?${params.toString()}`)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between outline-none focus:bg-muted/50 cursor-pointer rounded-md min-h-[36px]"
                        >
                          <span className="text-sm text-foreground">Scheduled</span>
                          {statusFilter === 'scheduled' && (
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setStatusFilter('payment_requested')
                            setQuickFilter('all')
                            // Set status query parameter
                            const params = new URLSearchParams(searchParams?.toString())
                            params.set('status', 'payment_requested')
                            router.replace(`${pathname}?${params.toString()}`)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between outline-none focus:bg-muted/50 cursor-pointer rounded-md min-h-[36px]"
                        >
                          <span className="text-sm text-foreground">Payment Requested</span>
                          {statusFilter === 'payment_requested' && (
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setStatusFilter('paid')
                            setQuickFilter('all')
                            // Set status query parameter
                            const params = new URLSearchParams(searchParams?.toString())
                            params.set('status', 'paid')
                            router.replace(`${pathname}?${params.toString()}`)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between outline-none focus:bg-muted/50 cursor-pointer rounded-md min-h-[36px]"
                        >
                          <span className="text-sm text-foreground">Paid</span>
                          {statusFilter === 'paid' && (
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setStatusFilter('completed')
                            setQuickFilter('all')
                            // Set status query parameter
                            const params = new URLSearchParams(searchParams?.toString())
                            params.set('status', 'completed')
                            router.replace(`${pathname}?${params.toString()}`)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between outline-none focus:bg-muted/50 cursor-pointer rounded-md min-h-[36px]"
                        >
                          <span className="text-sm text-foreground">Completed</span>
                          {statusFilter === 'completed' && (
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setStatusFilter('lost')
                            setQuickFilter('all')
                            // Set status query parameter
                            const params = new URLSearchParams(searchParams?.toString())
                            params.set('status', 'lost')
                            router.replace(`${pathname}?${params.toString()}`)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between outline-none focus:bg-muted/50 cursor-pointer rounded-md min-h-[36px]"
                        >
                          <span className="text-sm text-foreground">Lost</span>
                          {statusFilter === 'lost' && (
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setQuickFilter('ignored')
                            setStatusFilter('all')
                            // Clear status query parameter (ignored uses quickFilter)
                            const params = new URLSearchParams(searchParams?.toString())
                            params.delete('status')
                            const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
                            router.replace(newUrl)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-left hover:bg-muted/50 transition-colors flex items-center justify-between outline-none focus:bg-muted/50 cursor-pointer rounded-md min-h-[36px]"
                        >
                          <span className="text-sm text-foreground">Ignored</span>
                          {quickFilter === 'ignored' && (
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </DropdownMenuItem>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenu>

                {/* Overflow menu for secondary actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-10 w-10 inline-flex items-center justify-center bg-background border border-border/50 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                      title="More options"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuContent
                      align="end"
                      side="bottom"
                      sideOffset={8}
                      collisionPadding={12}
                      avoidCollisions
                      className="w-[200px] max-w-[calc(100vw-24px)] bg-card border border-border/50 rounded-lg shadow-xl shadow-black/10 dark:shadow-black/30 z-[10000]"
                    >
                      <DropdownMenuItem
                        onSelect={() => setShowAddCustomerModal(true)}
                        className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors flex items-center gap-2.5 outline-none focus:bg-muted/50 cursor-pointer"
                      >
                        <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm text-foreground">Add Customer</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1 h-px bg-border/50" />
                      <DropdownMenuItem
                        onSelect={fetchLeads}
                        disabled={loading || refreshing}
                        className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors flex items-center gap-2.5 outline-none focus:bg-muted/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {refreshing ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        ) : (
                          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                        <span className="text-sm text-foreground">Refresh</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenu>
              </div>
            </div>

            {/* Status Filter Dropdown (shown when filters are enabled) */}
            {showFilters && (
              <div className="mb-3 sm:mb-4">
                <DropdownMenu open={showFilters} onOpenChange={setShowFilters}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="w-full h-10 px-3 py-2 bg-background border border-border/50 rounded-lg text-sm text-foreground focus:ring-2 focus:ring-blue-500/40 focus:border-transparent focus:outline-none transition-all cursor-pointer flex items-center justify-between hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {statusFilter === 'all' ? (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-1.447.894l-2-1A1 1 0 0111 18v-5.586L3.293 6.707A1 1 0 013 6V4z" />
                            </svg>
                            <span className="whitespace-nowrap">Filters</span>
                          </>
                        ) : (
                          <>
                            <span className="text-xs">{getStatusFilterIcon(statusFilter)}</span>
                            <span className="whitespace-nowrap">{getStatusFilterLabel(statusFilter)}</span>
                          </>
                        )}
                      </div>
                      <svg 
                        className="w-3 h-3 transition-transform duration-200" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuContent
                      align="start"
                      side="bottom"
                      sideOffset={8}
                      collisionPadding={12}
                      avoidCollisions
                      className="w-full max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-120px))] bg-card border border-border/50 rounded-lg shadow-xl shadow-black/10 dark:shadow-black/30 overflow-y-auto overscroll-contain z-[10000]"
                    >
                      {statusFilterOptions.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onSelect={() => setStatusFilter(option.value)}
                          className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors flex items-center gap-2.5 outline-none focus:bg-muted/50 cursor-pointer"
                        >
                          <span className="text-xs">{option.icon}</span>
                          <div className="flex-1">
                            <div className="text-xs font-medium text-foreground">
                              {option.label}
                            </div>
                          </div>
                          {statusFilter === option.value && (
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenu>
              </div>
            )}

            {/* Small customer count - hidden on mobile to avoid duplication with single-customer view; correct grammar */}
            {(() => { const c = leads.filter(l => !l.deleted_at).length; return (
              <p className="hidden sm:block text-xs text-muted-foreground mb-2 sm:mb-3">{c} {c === 1 ? 'customer' : 'customers'}</p>
            )})()}

            {/* Filter-specific help text - Hide on mobile */}
            {statusFilter === 'ignored' && (
              <p className="text-xs text-muted-foreground mb-4 hidden sm:block">
                Ignored customers are hidden from your main list and can be restored at any time.
              </p>
            )}
            {statusFilter === 'deleted' && (
              <p className="text-xs text-muted-foreground mb-4 hidden sm:block">
                Deleted customers are hidden from your main list and can be restored for up to 30 days.
              </p>
            )}
                </>
              )
            })()}

            {/* Loading State */}
            {loading && (
              <div className="text-center py-20 px-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted/50 mb-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Loading customers</h3>
                <p className="text-muted-foreground text-sm">Please wait while we fetch your conversation history...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && filteredLeads.length === 0 && (
              <EmptyState
                variant="customers"
                title={
                  quickFilter === 'new' ? 'No customers need a reply' :
                  quickFilter === 'active' ? 'No active customers' :
                  quickFilter === 'completed' ? 'No completed customers yet' :
                  quickFilter === 'ignored' ? 'No ignored customers' :
                  'No customers yet'
                }
                description={
                  quickFilter === 'new' ? 'All customers have been responded to or are in other stages.' :
                  quickFilter === 'active' ? 'No conversations are currently in progress.' :
                  quickFilter === 'completed' ? 'Completed customers will appear here when jobs are finished.' :
                  quickFilter === 'ignored' ? 'No customers are currently blocked from automation.' :
                  'Missed callers and conversations will automatically appear here when your business number is active.'
                }
                primaryAction={quickFilter === 'all' ? (
                  <button
                    onClick={() => setShowAddCustomerModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
                  >
                    Add Customer
                  </button>
                ) : undefined}
              />
            )}

            {/* Error State */}
            {error && (
              <div className="text-center py-20 px-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-4">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Unable to load customers</h3>
                <div className="text-red-500 dark:text-red-400 mb-6 max-w-md mx-auto">{error}</div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={fetchLeads}
                    className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Try Again
                  </button>
                  <Link
                    href="/dashboard/settings"
                    className="inline-flex items-center px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-lg transition-colors"
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
                    <EmptyState
                      variant="search"
                      title={`No ${statusFilter} customers`}
                      description="Try changing the status filter to see other customers"
                    />
                  )
                }
                
                const singleLead = filteredLeads.length === 1

                if (singleLead) {
                  // Single customer: centered with supportive text
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
                  const isNewCustomer = (Date.now() - new Date(lastActivity).getTime()) < 24 * 60 * 60 * 1000
                  const aiData = getAIData(lead)
                  const rawStatus = lead.status ?? lead.lead_status ?? 'new'
                  const normalizedStatus = normalizeCustomerStatus(rawStatus)
                  const statusStyle = getCustomerStatusStyle(normalizedStatus)

                  return (
                    <div className="flex flex-col items-center">
                      {/* Removed inline count here to avoid duplication and lift the card on mobile */}
                      <div
                        key={lead.id}
                        className={cn(
                          'w-full max-w-2xl h-full flex flex-col',
                          'relative overflow-hidden rounded-xl border',
                          'p-3.5 sm:p-4',
                          'transition-colors',
                          statusStyle.cardClass
                        )}
                        onClick={() => handleConversationClick(lead.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleConversationClick(lead.id)
                          }
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={`Open ${getLeadDisplayName(lead)}`}
                      >
                        <div
                          aria-hidden="true"
                          className={cn(
                            'pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5',
                            statusStyle.accentStripClass
                          )}
                        />
                        <div className="flex-1 flex flex-col">
                          {/* Header: Name, Phone, Status */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-xl font-semibold text-foreground mb-1 truncate tracking-tight">
                                <span className="text-foreground">{getLeadDisplayName(lead)}</span>
                              </h3>
                              <p className="text-sm text-muted-foreground/70">
                                {lead.caller_phone === '+10000000000' ? 'Test Number' : formatPhoneNumber(lead.caller_phone)}
                              </p>
                            </div>
                            <div onClick={(e) => e.stopPropagation()}>
                              {lead.deleted_at ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                  Deleted
                                </span>
                              ) : (
                                <LeadStatusDropdown
                                  currentStatus={normalizeCustomerStatus(lead.status || lead.lead_status)}
                                  onStatusChange={(newStatus) => handleLeadStatusChange(lead.id, newStatus)}
                                  size="sm"
                                />
                              )}
                            </div>
                          </div>

                          {/* Compact Preview - Simplified Hierarchy */}
                          <div className="mb-2 flex-1">
                            {aiData.reason && (
                              <>
                                <p className="line-clamp-2 text-base font-semibold text-foreground leading-relaxed mb-1">
                                  {sentenceCase(aiData.reason)}
                                </p>
                                {aiData.urgency && (
                                  <p className={`text-sm font-medium ${
                                    aiData.urgency.toLowerCase() === 'urgent' || aiData.urgency.toLowerCase() === 'high'
                                      ? 'text-red-500 dark:text-red-400'
                                      : 'text-muted-foreground/70'
                                  }`}>
                                    {sentenceCase(aiData.urgency)}
                                  </p>
                                )}
                              </>
                            )}
                            {!aiData.reason && aiData.urgency && (
                              <p className={`text-sm font-medium ${
                                aiData.urgency.toLowerCase() === 'urgent' || aiData.urgency.toLowerCase() === 'high'
                                  ? 'text-red-500 dark:text-red-400'
                                  : 'text-muted-foreground/70'
                              }`}>
                                {sentenceCase(aiData.urgency)}
                              </p>
                            )}
                            {!aiData.reason && !aiData.urgency && (
                              <p className="line-clamp-2 text-sm text-muted-foreground/70 leading-relaxed">
                                {getCompactSummary(lead)}
                              </p>
                            )}
                          </div>

                          {/* Metadata */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const status = isNewCustomer ? 'new' : getLeadLifecycleStatus(lead)
                                  setStatusFilter(statusFilter === status ? 'all' : status)
                                }}
                                className={`px-2 py-0.5 text-[10px] font-medium rounded-full ring-1 ring-inset transition-all duration-200 ${
                                  isNewCustomer ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20' :
                                  getLeadLifecycleStatus(lead) === 'new' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20' :
                                  getLeadLifecycleStatus(lead) === 'active' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20' :
                                  'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
                                } hover:opacity-80 cursor-pointer`}
                                title={`Filter by ${isNewCustomer ? 'New' : getLeadLifecycleStatus(lead)} status`}
                                aria-label={`Filter by ${isNewCustomer ? 'New' : getLeadLifecycleStatus(lead)} status`}
                              >
                                {isNewCustomer ? 'New' : getLeadLifecycleStatus(lead).charAt(0).toUpperCase() + getLeadLifecycleStatus(lead).slice(1)}
                              </button>
                              <span className="text-xs text-muted-foreground/70">
                                {formatRelativeTime(lead.created_at)}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons - Open affordance and overflow menu */}
                          <div className="mt-auto flex w-full items-center border-t border-border/40 pt-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleConversationClick(lead.id)
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation()
                              }}
                              className="min-w-0 flex-1 text-left text-xs text-slate-400 dark:text-slate-400 hover:text-foreground hover:bg-muted/50 active:bg-muted/70 px-2 py-1 rounded transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-card"
                              aria-label={`Open ${getLeadDisplayName(lead)}`}
                            >
                              Open customer
                              <svg className="w-3 h-3 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                            <div className="flex shrink-0">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="flex h-11 w-11 items-center justify-center p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                                    title="More actions"
                                    aria-label="Customer actions"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                  >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                  </svg>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuPortal>
                                <DropdownMenuContent
                                  align="end"
                                  side="bottom"
                                  sideOffset={6}
                                  collisionPadding={12}
                                  avoidCollisions
                                  className="z-50 w-[240px] max-w-[calc(100vw-24px)] max-h-[calc(100dvh-100px)] bg-card border border-border/60 rounded-lg shadow-lg shadow-black/10 py-1 overflow-y-auto overscroll-contain"
                                >
                                {lead.deleted_at && (
                                  <DropdownMenuItem
                                    onSelect={() => handleRestoreLead(lead.id)}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors outline-none focus:bg-muted/50 cursor-pointer"
                                  >
                                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.001 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Restore Customer</span>
                                  </DropdownMenuItem>
                                )}
                                {!lead.deleted_at && getLeadLifecycleStatus(lead) !== 'ignored' && (
                                  <DropdownMenuItem
                                    onSelect={() => handleIgnoreLead(lead.id)}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors outline-none focus:bg-muted/50 cursor-pointer"
                                  >
                                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span>Ignore Customer</span>
                                  </DropdownMenuItem>
                                )}
                                {!lead.deleted_at && getLeadLifecycleStatus(lead) === 'ignored' && (
                                  <DropdownMenuItem
                                    onSelect={() => handleLeadStatusChange(lead.id, 'active')}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors outline-none focus:bg-muted/50 cursor-pointer"
                                  >
                                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.001 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Restore Customer</span>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                              </DropdownMenuPortal>
                            </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                } else {
                  // Multiple customers: grid layout
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4 md:pb-0">
                      {filteredLeads.map((lead: any, index: number) => {
                        const lastActivity = lead.last_message_at || lead.first_contact_at || lead.created_at
                        const isNewCustomer = index === 0 && (Date.now() - new Date(lastActivity).getTime()) < 24 * 60 * 60 * 1000

                        return (
                          <LeadCard
                            key={lead.id}
                            lead={lead}
                            onOpen={handleConversationClick}
                            onStatusChange={handleLeadStatusChange}
                            onIgnore={handleIgnoreLead}
                            onRestore={handleRestoreLead}
                            onFilterStatus={(status) => setStatusFilter(statusFilter === status ? 'all' : status)}
                            statusFilter={statusFilter}
                            getCompactSummary={getCompactSummary}
                            isNewCustomer={isNewCustomer}
                            businessId={business?.id || null}
                          />
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
      returnTo={returnTo || undefined}
    />
    </DashboardErrorBoundary>
  )
}
