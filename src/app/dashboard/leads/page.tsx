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
  hasValidSubscription
} from '@/lib/subscription'
import { PRICING_CONFIG } from '@/lib/pricing'
import { handleBillingAction } from '@/lib/billing'
import StatusBadge from '@/components/StatusBadge'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import MobileMenu from '@/components/MobileMenu'
import Image from 'next/image'
import { RealtimeChannel } from '@supabase/supabase-js'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import Footer from '@/components/Footer'

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

  const supabase = createBrowserClient()

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    if (!business?.id) return

    try {
      setLoading(true)
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
    }
  }, [business?.id, supabase])

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
                <p className="text-muted-foreground">Loading leads...</p>
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
        <div className="min-h-screen bg-background flex flex-col">
          {/* App Header */}
          <AppHeader title="Leads" showBackLink={true} showNavigation={false} />

          {/* Main Content */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24">
            <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
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

            {/* Getting Started - moved above empty state for onboarding focus */}
            <div className="mb-6">
              <GettingStarted />
            </div>

            {/* Leads Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-8">
              <div>
                <h2 className="text-xl sm:text-2xl sm:text-3xl font-bold text-foreground">
                  Customer Leads
                </h2>
                <p className="text-sm sm:text-muted-foreground mt-0.5 sm:mt-1">
                  {leads.length} {leads.length === 1 ? 'lead' : 'leads'} total
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                {leads.length > 0 && (
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-input rounded-lg hover:bg-muted transition-colors"
                  >
                    Filters
                  </button>
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
                      <option value="qualified">Qualified</option>
                      <option value="replied">Replied</option>
                      <option value="closed">Closed</option>
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

            {/* Empty State */}
            {!loading && !error && leads.length === 0 && (
              <>
                {/* Onboarding Helper Card - only when no leads */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                        Next step
                      </h3>
                      <p className="text-xs text-blue-800 dark:text-blue-300 mb-3">
                        Enable call forwarding to begin capturing missed-call leads.
                      </p>
                      <Link
                        href="/setup/phone-forwarding"
                        className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        Open Setup
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Empty State */}
                <div className="text-center py-8 sm:py-12 px-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-blue-900/30 mb-4 sm:mb-6">
                    <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2 sm:mb-3">
                    No leads yet
                  </h3>
                  <div className="text-muted-foreground mb-6 max-w-md mx-auto text-sm sm:text-base">
                    <p>Missed calls and conversations will appear here automatically once your forwarding is active.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    {hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && business?.twilio_phone_number && (
                      <Link
                        href="/dashboard/test-setup"
                        className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        Test My Setup
                      </Link>
                    )}
                    <Link
                      href="/demo"
                      className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-3 bg-transparent border border-border text-secondary-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      View Demo
                    </Link>
                  </div>
                </div>
              </>
            )}

            {/* Leads List */}
            {!loading && !error && leads.length > 0 && (
              <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                <div className="divide-y divide-border">
                  {sortedLeads.map((lead, index) => {
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

                    let statusBadge = 'New'
                    if (lead.lead_status === 'qualified') statusBadge = 'Qualified'
                    else if (lead.lead_status === 'closed') statusBadge = 'Closed'
                    else if (lead.lead_status === 'replied') statusBadge = 'Replied'
                    else if (hasReplied) statusBadge = 'Replied'
                    else if (lead.status === 'blocked') statusBadge = 'Blocked'

                    return (
                      <Link
                        key={lead.id}
                        href={`/dashboard/leads/${lead.id}`}
                        onClick={() => handleConversationClick(lead.id)}
                        className={`block p-5 sm:p-6 hover:bg-muted transition-colors relative ${
                          isUnread ? 'bg-blue-900/10 dark:bg-blue-900/10' : ''
                        } ${isNewLead ? 'bg-orange-900/10 dark:bg-orange-900/10' : ''}`}
                      >
                        {/* Unread indicator dot */}
                        {isUnread && (
                          <div className="absolute top-6 left-4 w-2 h-2 bg-blue-600 rounded-full"></div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                messageStatus.color === 'green' ? 'bg-green-900/30' :
                                messageStatus.color === 'red' ? 'bg-red-900/30' :
                                messageStatus.color === 'orange' ? 'bg-orange-900/30' :
                                'bg-blue-900/30'
                              }`}>
                                <span className="text-lg">{messageStatus.icon}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`font-semibold text-foreground truncate ${
                                    isUnread ? 'font-bold' : ''
                                  }`}>
                                    {lead.caller_phone === '+10000000000' ? 'Test Lead' : formatPhoneNumber(lead.caller_phone)}
                                  </p>
                                  {isNewLead && (
                                    <span className="px-2 py-0.5 bg-orange-900/30 text-orange-300 text-xs font-medium rounded-full flex-shrink-0">New</span>
                                  )}
                                  {needsResponse && (
                                    <span className="px-2 py-0.5 bg-red-900/30 text-red-300 text-xs font-medium rounded-full flex-shrink-0">Needs Response</span>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{formatRelativeTime(lastActivity)}</p>
                              </div>
                            </div>
                            {latestMessage && (
                              <div className="ml-13">
                                <p className={`text-sm truncate ${
                                  latestMessage.direction === 'inbound'
                                    ? 'text-muted-foreground'
                                    : 'text-blue-400'
                                } ${isUnread && latestMessage.direction === 'inbound' ? 'font-semibold' : ''}`}>
                                  {latestMessage.direction === 'inbound' && 'Customer: '}
                                  {latestMessage.body}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              statusBadge === 'New' ? 'bg-blue-900/30 text-blue-300' :
                              statusBadge === 'Qualified' ? 'bg-purple-900/30 text-purple-300' :
                              statusBadge === 'Replied' ? 'bg-green-900/30 text-green-300' :
                              statusBadge === 'Closed' ? 'bg-muted text-muted-foreground' :
                              statusBadge === 'Blocked' ? 'bg-red-900/30 text-red-400' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {statusBadge}
                            </span>
                            <div className="text-blue-400 hover:text-blue-300 text-sm font-medium whitespace-nowrap">
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
            </div>
          </main>
        <Footer />
      </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
