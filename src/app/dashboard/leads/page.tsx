'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import Link from 'next/link'
import ThemeToggle, { MobileThemeToggle } from '@/components/ThemeToggle'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import MobileMenu from '@/components/MobileMenu'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'

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

export default function LeadsPage() {
  const router = useRouter()
  const { business } = useBusiness()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createBrowserClient()

  useEffect(() => {
    if (!business || !supabase) return

    const fetchLeads = async () => {
      try {
        const { data } = await supabase
          .from('leads')
          .select(`
            *,
            messages (
              id,
              body,
              direction,
              status,
              error_code,
              created_at
            )
          `)
          .eq('business_id', business.id)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .order('first_contact_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })

        setLeads(data || [])
      } catch (error) {
        console.error('Error fetching leads:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchLeads()
  }, [business, supabase])

  if (!business) {
    return (
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-3xl font-bold text-gray-900 mb-8">Leads</h1>
              <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-600">No business found. Please set up your business first.</p>
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
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden">
          {/* App Header */}
          <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 md:gap-8">
                  <Link href="/" className="flex items-center hover:opacity-90 transition">
                    <span className="text-lg md:text-xl lg:text-2xl font-semibold tracking-tight">
                      <span className="text-gray-900 dark:text-gray-100">Reply</span>
                      <span className="text-blue-600 dark:text-blue-500">Flow</span>
                    </span>
                  </Link>
                  <div className="hidden md:block">
                    <Navigation />
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="hidden sm:block">
                    <ThemeToggle />
                  </div>
                  <div className="sm:hidden">
                    <MobileThemeToggle />
                  </div>
                  <UserDropdown />
                  <MobileMenu />
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <div className="p-4 sm:p-8">
            <div className="max-w-5xl mx-auto">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Your Leads</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8">People who called but did not reach you.</p>

              {loading ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">Loading leads...</p>
                </div>
              ) : leads.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-center">
                  <div className="text-4xl mb-4">📞</div>
                  <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">No leads yet</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Your missed calls will start appearing here automatically</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {leads.map((lead, index) => {
                      const latestMessage = lead.messages && lead.messages.length > 0
                        ? lead.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                        : null

                      const messageStatus = getLeadMessageStatus(latestMessage)
                      const lastActivity = lead.last_message_at || lead.first_contact_at || lead.created_at
                      const hasReplied = lead.messages?.some((m: any) => m.direction === 'inbound')
                      const hasTexted = lead.messages?.some((m: any) => m.direction === 'outbound')

                      // Check if this is the newest lead (within 24 hours)
                      const isNewLead = index === 0 && (Date.now() - new Date(lastActivity).getTime()) < 24 * 60 * 60 * 1000

                      let statusBadge = 'New'
                      if (hasReplied) statusBadge = 'Replied'
                      else if (hasTexted) statusBadge = 'Texted'
                      else if (lead.status === 'blocked') statusBadge = 'Blocked'

                      return (
                        <div key={lead.id} className={`p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${isNewLead ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  messageStatus.color === 'green' ? 'bg-green-100 dark:bg-green-900/30' :
                                  messageStatus.color === 'red' ? 'bg-red-100 dark:bg-red-900/30' :
                                  messageStatus.color === 'orange' ? 'bg-orange-100 dark:bg-orange-900/30' :
                                  'bg-blue-100 dark:bg-blue-900/30'
                                }`}>
                                  <span className="text-lg">{messageStatus.icon}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                      {lead.caller_phone === '+10000000000' ? 'Test Lead' : formatPhoneNumber(lead.caller_phone)}
                                    </p>
                                    {isNewLead && (
                                      <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 text-xs font-medium rounded-full flex-shrink-0">New</span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">{formatRelativeTime(lastActivity)}</p>
                                </div>
                              </div>
                              {latestMessage && (
                                <div className="ml-13">
                                  <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{latestMessage.body}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                statusBadge === 'New' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' :
                                statusBadge === 'Texted' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                                statusBadge === 'Replied' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                                statusBadge === 'Sent' ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300' :
                                'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                              }`}>
                                {statusBadge}
                              </span>
                              <Link
                                href={`/dashboard/leads/${lead.id}`}
                                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium whitespace-nowrap"
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
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
