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
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient()

  useEffect(() => {
    if (!business || !supabase) return

    const fetchLeads = async () => {
      console.log('[DashboardContent] Fetching leads for business:', business.id)
      setLoading(true)
      try {
        const { data: leadsData } = await supabase
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

        console.log('[DashboardContent] Fetched', leadsData?.length || 0, 'leads')
        setLeads(leadsData || [])
      } catch (error) {
        console.error('[DashboardContent] Error fetching leads:', error)
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

  const newLeads = leads.filter(lead => lead.status === 'new').length
  const contactedLeads = leads.filter(lead => lead.status === 'contacted').length

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-600 mt-1">{business?.name}</p>
              </div>
              <div className="flex gap-4">
                <Link
                  href="/dashboard/settings"
                  className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Settings
                </Link>
              </div>
            </div>

            <SmsVerificationBanner business={business} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Total Leads</h3>
                <p className="text-3xl font-bold text-gray-900">{leads.length}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500 mb-2">New Leads</h3>
                <p className="text-3xl font-bold text-blue-600">{newLeads}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Contacted</h3>
                <p className="text-3xl font-bold text-green-600">{contactedLeads}</p>
              </div>
            </div>

            {leads.length === 0 ? (
              <div className="bg-white p-8 rounded-lg shadow text-center">
                <p className="text-gray-600 mb-4">No leads yet</p>
                <p className="text-sm text-gray-500">Call your Twilio number and hang up to test the missed call flow.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {leads.map((lead) => {
                  const latestMessage = lead.messages && lead.messages.length > 0
                    ? lead.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                    : null

                  console.log("LATEST MESSAGE for lead", lead.id, ":", latestMessage)

                  const messageStatus = getLeadMessageStatus(latestMessage)

                  return (
                    <div key={lead.id} className="bg-gray-50 rounded-lg p-4 hover:bg-white transition-colors duration-200 border border border-gray-200">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              messageStatus.color === 'green' ? 'bg-green-100' :
                              messageStatus.color === 'red' ? 'bg-red-100' :
                              messageStatus.color === 'orange' ? 'bg-orange-100' :
                              'bg-blue-100'
                            }`}>
                              <span className="text-xl">{messageStatus.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900">{formatLeadPhone(lead.caller_phone)}</p>
                              <p className="text-sm text-gray-500">{messageStatus.text}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getLeadStatusColor(lead.status)}`}>
                            {lead.status}
                          </span>
                          <Link
                            href={`/dashboard/leads/${lead.id}`}
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                          >
                            View →
                          </Link>
                        </div>
                      </div>

                      {latestMessage && (
                        <div className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-700 break-words">{latestMessage.body}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <StatusBadge status={latestMessage.status} errorCode={latestMessage.error_code} />
                                <span className="text-xs text-gray-500">
                                  {formatMessageTimestamp(latestMessage)}
                                </span>
                              </div>
                            </div>
                          </div>
                          {latestMessage.error_message && (
                            <p className="text-xs text-red-600 mt-2">
                              {getFriendlyErrorMessage(latestMessage.error_code, latestMessage.error_message)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
