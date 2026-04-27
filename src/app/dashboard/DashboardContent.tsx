'use client'

import { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber, formatRelativeTime, truncateText, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import BusinessGuard from '@/components/BusinessGuard'
import AuthGuard from '@/components/AuthGuard'
import SmsVerificationBanner from '@/components/SmsVerificationBanner'
import ThemeToggle from '@/components/ThemeToggle'

// Helper to hide test numbers
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
  const [leads, setLeads] = useState<any[]>([])
  const [followUpJobs, setFollowUpJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [webhookConfirming, setWebhookConfirming] = useState(false)
  const [testSmsLoading, setTestSmsLoading] = useState(false)
  const [testSmsMessage, setTestSmsMessage] = useState('')
  const searchParams = useSearchParams()
  const checkoutStatus = searchParams.get('checkout')
  const router = useRouter()

  const supabase = createBrowserClient()

  // Force refresh business after checkout success with retry logic
  useEffect(() => {
    if (checkoutStatus === 'success') {
      console.log('[Dashboard] Checkout success return detected')
      setWebhookConfirming(true)

      const checkSubscription = async (attempt: number) => {
        console.log('[Dashboard] Business row refetch attempt:', attempt)
        
        // Refresh business data via context
        await refreshBusiness()
        
        // Directly fetch business from Supabase to get fresh data
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: freshBusiness } = await supabase
            .from('businesses')
            .select('*')
            .eq('user_id', user.id)
            .limit(1)
            .single()
          
          // Check if subscription is now active
          const isActive = freshBusiness?.subscription_status === 'active' || freshBusiness?.subscription_status === 'trialing'
          const hasCustomerId = !!freshBusiness?.stripe_customer_id
          
          console.log('[Dashboard] Subscription active confirmed:', isActive)
          console.log('[Dashboard] Stripe customer ID exists:', hasCustomerId)

          if (isActive && hasCustomerId) {
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
  }, [checkoutStatus, refreshBusiness, supabase, router])

  // Only calculate isActive after business loading is complete
  const isActive = !businessLoading && (business?.subscription_status === 'active' || business?.subscription_status === 'trialing')

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
      
      if (data.url) {
        window.location.href = data.url
      } else {
        console.error('[checkout] No URL returned:', data)
      }
    } catch (error) {
      console.error('[checkout] Error:', error)
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
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
    console.log('[DashboardContent] Business loading:', businessLoading, 'Business:', business?.id, 'Supabase:', !!supabase)
    
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
      } finally {
        console.log('[DashboardContent] Setting loading to false')
        setLoading(false)
      }
    }

    fetchLeads()
  }, [business, businessLoading, supabase])

  // Show loading state while business is loading or webhook is confirming
  if (businessLoading || webhookConfirming) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">
          {webhookConfirming ? 'Payment confirmed. Setting up your account...' : 'Loading your dashboard...'}
        </div>
      </div>
    )
  }

  const missedCalls = leads.length
  const textsSent = leads.reduce((count, lead) => {
    return count + (lead.messages?.filter((m: any) => m.direction === 'outbound').length || 0)
  }, 0)
  const replies = leads.reduce((count, lead) => {
    return count + (lead.messages?.filter((m: any) => m.direction === 'inbound').length || 0)
  }, 0)
  const followUpsScheduled = followUpJobs.filter((job: any) => job.status === 'pending').length
  const leadsRecovered = leads.filter((lead) => {
    return lead.messages?.some((m: any) => m.direction === 'outbound')
  }).length

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          {/* App Header */}
          <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-8">
              <div className="flex items-center justify-between h-14 sm:h-16">
                <div className="flex items-center">
                  <Link href="/dashboard" className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                    ReplyFlow
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  <Link
                    href="/dashboard/settings"
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Sign out"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <div className="p-4 sm:p-8">
            <div className="max-w-7xl mx-auto">
              {/* Page Title */}
              <div className="mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 break-words">Your Missed Call Leads</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">See who called, who got a text, and who replied.</p>
              </div>

            <SmsVerificationBanner business={business} />

            {/* Checkout success confirming message */}
            {webhookConfirming && (
              <div className="bg-blue-900/20 border border-blue-800 rounded-xl px-3 py-2 sm:px-4 sm:py-3 mb-4 sm:mb-6">
                <p className="text-blue-300 text-sm">Payment confirmed. Setting up your account...</p>
              </div>
            )}

            {/* Checkout cancel message */}
            {checkoutStatus === 'cancelled' && (
              <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl px-3 py-2 sm:px-4 sm:py-3 mb-4 sm:mb-6">
                <p className="text-yellow-300 text-sm">Checkout cancelled. You can activate anytime.</p>
              </div>
            )}

            {/* Missed Call Leads Section - MOVED TO TOP */}
            {leads.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 p-4 sm:p-8 rounded-lg shadow text-center">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No missed calls yet</h2>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4 sm:mb-6">When someone calls your ReplyFlow number and you miss it, they'll appear here automatically.</p>

                {business?.twilio_phone_number && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Your ReplyFlow number:</p>
                    <p className="text-base sm:text-lg font-semibold text-blue-900 dark:text-blue-100">{formatPhoneNumber(business.twilio_phone_number)}</p>
                  </div>
                )}

                <div className="text-left bg-gray-50 dark:bg-gray-700 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">To test it now:</h3>
                  <ol className="space-y-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 list-decimal list-inside">
                    <li>Call your ReplyFlow number</li>
                    <li>Let it ring (don't answer)</li>
                    <li>You should receive an automatic text</li>
                    <li>Refresh this page to see the lead</li>
                  </ol>
                </div>

                <button
                  onClick={handleTestSms}
                  disabled={testSmsLoading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors text-sm sm:text-base"
                >
                  {testSmsLoading ? 'Sending...' : 'Test my number'}
                </button>

                {testSmsMessage && (
                  <div className={`mt-3 text-xs sm:text-sm ${testSmsMessage.startsWith('Failed') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {testSmsMessage}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Your Leads</h2>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">People who called but did not reach you.</p>
                <div className="space-y-3 sm:space-y-4">
                  {leads.map((lead) => {
                    const latestMessage = lead.messages && lead.messages.length > 0
                      ? lead.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                      : null

                    const messageStatus = getLeadMessageStatus(latestMessage)
                    const lastActivity = lead.last_message_at || lead.first_contact_at || lead.created_at
                    const hasReplied = lead.messages?.some((m: any) => m.direction === 'inbound')
                    const hasTexted = lead.messages?.some((m: any) => m.direction === 'outbound')
                    const hasBlockedOutbound = lead.messages?.some((m: any) => m.direction === 'outbound' && m.error_code === '30007')
                    const hasFailedMessage = latestMessage && (latestMessage.status === 'failed' || latestMessage.status === 'undelivered')
                    
                    let statusBadge = 'New'
                    let isDeliveryPending = false
                    let smsIssueBadge = null
                    let carrierFilteringBadge = null

                    if (hasBlockedOutbound) {
                      statusBadge = 'Sent'
                      isDeliveryPending = true
                      carrierFilteringBadge = 'Sent (delivery pending)'
                    }
                    else if (hasFailedMessage) {
                      statusBadge = 'Texted'
                      smsIssueBadge = 'SMS issue'
                    }
                    else if (hasReplied) statusBadge = 'Replied'
                    else if (hasTexted) statusBadge = 'Texted'
                    else if (lead.status === 'blocked') statusBadge = 'Blocked'

                    return (
                      <div key={lead.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                messageStatus.color === 'green' ? 'bg-green-100' :
                                messageStatus.color === 'red' ? 'bg-red-100' :
                                messageStatus.color === 'orange' ? 'bg-orange-100' :
                                'bg-blue-100'
                              }`}>
                                <span className="text-sm sm:text-lg">{messageStatus.icon}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm sm:text-base">{formatLeadPhone(lead.caller_phone)}</p>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{formatRelativeTime(lastActivity)}</p>
                                {hasTexted && !hasReplied && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mt-1 hidden sm:block">⚡ We texted this customer instantly so you don't lose them</p>
                                )}
                                {hasReplied && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mt-1 hidden sm:block">Customer responded — opportunity active</p>
                                )}
                                {!hasTexted && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mt-1 hidden sm:block">No follow-up sent yet</p>
                                )}
                              </div>
                            </div>
                            {latestMessage && (
                              <div className="ml-10 sm:ml-13">
                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 truncate">{latestMessage.body}</p>
                                {isDeliveryPending && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Delivery pending (carrier verification)</p>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
                              statusBadge === 'New' ? 'bg-blue-100 text-blue-800' :
                              statusBadge === 'Texted' ? 'bg-yellow-100 text-yellow-800' :
                              statusBadge === 'Replied' ? 'bg-green-100 text-green-800' :
                              statusBadge === 'Sent' ? 'bg-gray-100 text-gray-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {statusBadge}
                            </span>
                            {smsIssueBadge && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                                {smsIssueBadge}
                              </span>
                            )}
                            {carrierFilteringBadge && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300" title="Sent (delivery pending). This may happen while toll-free verification is pending.">
                                {carrierFilteringBadge}
                              </span>
                            )}
                            <Link
                              href={`/dashboard/leads/${lead.id}`}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
                            >
                              View →
                            </Link>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Live Activity Feed */}
            <div className="mb-4 sm:mb-8">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">Live Activity</h2>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                {leads.length === 0 && followUpJobs.length === 0 ? (
                  <div className="p-4 sm:p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                    No activity yet
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {[...leads.slice(0, 5), ...followUpJobs.slice(0, 3)]
                      .sort((a: any, b: any) => {
                        const timeA = new Date(a.created_at || a.scheduled_for).getTime()
                        const timeB = new Date(b.created_at || b.scheduled_for).getTime()
                        return timeB - timeA
                      })
                      .slice(0, 8)
                      .map((item: any, index: number) => {
                        const isLead = 'caller_phone' in item
                        const isJob = 'message_body' in item

                        let icon = ''
                        let text = ''
                        let time = ''

                        if (isLead) {
                          icon = '📞'
                          text = `Missed call from ${formatLeadPhone(item.caller_phone)}`
                          time = formatRelativeTime(item.created_at)
                        } else if (isJob) {
                          if (item.status === 'pending') {
                            icon = '⏱'
                            text = 'Follow-up scheduled'
                          } else if (item.status === 'cancelled') {
                            icon = '✅'
                            text = 'Follow-up cancelled'
                          } else {
                            icon = '⏱'
                            text = 'Follow-up job'
                          }
                          time = formatRelativeTime(item.created_at)
                        }

                        return (
                          <div key={index} className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <span className="text-lg sm:text-xl">{icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">{text}</p>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{time}</p>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-4 sm:mb-8">
              <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow">
                <h3 className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 sm:mb-2">Missed Calls</h3>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{missedCalls}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow">
                <h3 className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 sm:mb-2">Texts Sent</h3>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600">{textsSent}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow">
                <h3 className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 sm:mb-2">Replies</h3>
                <p className="text-2xl sm:text-3xl font-bold text-green-600">{replies}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow">
                <h3 className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 sm:mb-2">Follow-ups Scheduled</h3>
                <p className="text-2xl sm:text-3xl font-bold text-purple-600">{followUpsScheduled}</p>
              </div>
            </div>

            {/* Value Message */}
            {leads.length > 0 && (
              <div className="bg-green-900/20 border border-green-800 rounded-xl px-3 py-2 sm:px-4 sm:py-3 mb-4 sm:mb-8">
                <p className="text-green-300 text-sm sm:text-base">
                  🔥 You recovered {leadsRecovered} lead{leadsRecovered !== 1 ? 's' : ''} automatically
                </p>
              </div>
            )}

            {/* Test Your Setup Section */}
            {business?.twilio_phone_number && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 sm:p-8 mb-4 sm:mb-8 text-center">
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3 sm:mb-4">Test your setup</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4 sm:mb-6 text-sm sm:text-base">
                  Call your ReplyFlow number to test the missed call text back feature.
                </p>
                <div className="mb-4 sm:mb-6">
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1 sm:mb-2">Your ReplyFlow number:</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{formatPhoneNumber(business.twilio_phone_number)}</p>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4 sm:mb-6">
                  Let it ring — you'll receive an automatic text.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                  <button
                    onClick={handleTestSms}
                    disabled={testSmsLoading}
                    className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors text-sm sm:text-base"
                  >
                    {testSmsLoading ? 'Sending...' : 'Send Test SMS'}
                  </button>
                  <button
                    onClick={() => {
                      console.log('[Dashboard] Refresh leads clicked')
                      router.refresh()
                    }}
                    className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
                  >
                    Refresh leads
                  </button>
                </div>
                {testSmsMessage && (
                  <div className={`mt-3 sm:mt-4 text-xs sm:text-sm ${testSmsMessage.startsWith('Failed') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {testSmsMessage}
                  </div>
                )}
              </div>
            )}

            {/* Billing card - always shown for testing */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 shadow">
              {webhookConfirming ? (
                <>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Setting up your subscription</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Please wait while we confirm your payment...</p>
                </>
              ) : isActive ? (
                <>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Subscription active</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Your ReplyFlow subscription is active.</p>
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">$29<span className="text-sm font-normal text-gray-500">/month</span></span>
                  </div>
                  {business?.cancel_at_period_end && (
                    <p className="text-sm text-orange-600 dark:text-orange-400 mb-4">Subscription will cancel at period end</p>
                  )}
                  {process.env.NEXT_PUBLIC_BYPASS_BILLING === 'true' && (
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">Billing bypass enabled (testing mode)</p>
                  )}
                  <button
                    onClick={handleManageBilling}
                    disabled={checkoutLoading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {checkoutLoading ? 'Loading...' : 'Manage billing'}
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Activate ReplyFlow</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Start your subscription to keep missed-call text back active.</p>
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">$29<span className="text-sm font-normal text-gray-500">/month</span></span>
                  </div>
                  {process.env.NEXT_PUBLIC_BYPASS_BILLING === 'true' && (
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">Billing bypass enabled (testing mode)</p>
                  )}
                  <button
                    onClick={handleStartSubscription}
                    disabled={checkoutLoading}
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {checkoutLoading ? 'Loading...' : 'Start Subscription'}
                  </button>
                </>
              )}
            </div>
            </div>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
