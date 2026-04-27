'use client'

import { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber, formatRelativeTime, truncateText, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
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
  const { business } = useBusiness()
  const [leads, setLeads] = useState<any[]>([])
  const [followUpJobs, setFollowUpJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient()

  useEffect(() => {
    console.log('[DashboardContent] Business:', business?.id, 'Supabase:', !!supabase)
    
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
  }, [business, supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
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
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Your Missed Call Leads</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">See who called, who got a text, and who replied.</p>
              </div>
              <div className="flex gap-4">
                <ThemeToggle />
                <Link
                  href="/dashboard/settings"
                  className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Settings
                </Link>
              </div>
            </div>

            <SmsVerificationBanner business={business} />

            {/* Value Summary Section */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
              <h2 className="text-2xl font-semibold text-gray-100 mb-2">Never Miss a Lead</h2>
              <p className="text-gray-400 mb-6">Missed Call → Instant Text → Conversation Started</p>
              
              {leads.length === 0 ? (
                <p className="text-gray-400">Once you miss a call, ReplyFlow will automatically text them and track it here.</p>
              ) : (
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Total Leads:</span>
                    <span className="text-xl font-semibold text-gray-100">{missedCalls}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Messages Sent:</span>
                    <span className="text-xl font-semibold text-gray-100">{textsSent}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Leads Recovered:</span>
                    <span className="text-xl font-semibold text-green-400">{leadsRecovered}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Missed Calls</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{missedCalls}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Texts Sent</h3>
                <p className="text-3xl font-bold text-blue-600">{textsSent}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Replies</h3>
                <p className="text-3xl font-bold text-green-600">{replies}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Follow-ups Scheduled</h3>
                <p className="text-3xl font-bold text-purple-600">{followUpsScheduled}</p>
              </div>
            </div>

            {/* Live Activity Feed */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Live Activity</h2>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                {leads.length === 0 && followUpJobs.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
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
                          <div key={index} className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <span className="text-xl">{icon}</span>
                            <div className="flex-1">
                              <p className="text-sm text-gray-900 dark:text-gray-100">{text}</p>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{time}</p>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>

            {leads.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow text-center">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No missed calls yet</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">When someone calls your ReplyFlow number and you miss it, they'll appear here automatically.</p>
                
                {business?.twilio_phone_number && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Your ReplyFlow number:</p>
                    <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">{business.twilio_phone_number}</p>
                  </div>
                )}

                <div className="text-left bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">To test it now:</h3>
                  <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400 list-decimal list-inside">
                    <li>Call your ReplyFlow number</li>
                    <li>Let it ring (don't answer)</li>
                    <li>You should receive an automatic text</li>
                    <li>Refresh this page to see the lead</li>
                  </ol>
                </div>

                <button
                  onClick={() => {
                    const instructions = document.querySelector('.bg-gray-50.dark\\:bg-gray-700')
                    if (instructions) {
                      instructions.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      instructions.classList.add('ring-2', 'ring-blue-500')
                      setTimeout(() => {
                        instructions.classList.remove('ring-2', 'ring-blue-500')
                      }, 2000)
                    }
                  }}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  Test my number
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Missed Call Leads</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">People who called but did not reach you.</p>
                <div className="space-y-4">
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
                      carrierFilteringBadge = 'Carrier filtering'
                    }
                    else if (hasFailedMessage) {
                      statusBadge = 'Texted'
                      smsIssueBadge = 'SMS issue'
                    }
                    else if (hasReplied) statusBadge = 'Replied'
                    else if (hasTexted) statusBadge = 'Texted'
                    else if (lead.status === 'blocked') statusBadge = 'Blocked'

                    return (
                      <div key={lead.id} className="bg-white dark:bg-gray-800 rounded-lg p-5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                messageStatus.color === 'green' ? 'bg-green-100' :
                                messageStatus.color === 'red' ? 'bg-red-100' :
                                messageStatus.color === 'orange' ? 'bg-orange-100' :
                                'bg-blue-100'
                              }`}>
                                <span className="text-lg">{messageStatus.icon}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{formatLeadPhone(lead.caller_phone)}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{formatRelativeTime(lastActivity)}</p>
                                {hasTexted && !hasReplied && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mt-1">⚡ We texted this customer instantly so you don't lose them</p>
                                )}
                                {hasReplied && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mt-1">Customer responded — opportunity active</p>
                                )}
                                {!hasTexted && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mt-1">No follow-up sent yet</p>
                                )}
                              </div>
                            </div>
                            {latestMessage && (
                              <div className="ml-13">
                                <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{latestMessage.body}</p>
                                {isDeliveryPending && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Delivery pending (carrier verification)</p>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
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
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300" title="Carrier filtering detected. This may happen while toll-free verification is pending.">
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
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
