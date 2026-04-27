import { supabaseAdmin } from '@/lib/supabase/admin'
import { formatPhoneNumber, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'

// Helper to hide test numbers
function formatLeadPhone(phone: string): string {
  if (phone === '+10000000000') {
    return 'Test Lead'
  }
  return formatPhoneNumber(phone)
}

// Helper to get friendly error message
function getFriendlyErrorMessage(errorCode?: string | null, errorMessage?: string | null): string {
  if (errorCode === '30007') {
    return 'Carrier blocked this message (likely due to unverified toll-free number)'
  }
  if (errorMessage) {
    return 'Message failed to deliver'
  }
  return 'Message failed to deliver'
}

// Helper to format timestamp with fallback
function formatMessageTimestamp(message: any): string {
  const timestamp = message.status_updated_at || message.created_at
  return formatRelativeTime(timestamp)
}

// Utility functions
function formatRelativeTime(dateString: string): string {
  if (!dateString) return 'Never'
  
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  } else {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  }
}

function formatDateTime(dateString: string): string {
  if (!dateString) return 'Never'
  
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function getLeadDetails(leadId: string) {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select(`
      *,
      messages (
        id,
        direction,
        body,
        from_phone,
        to_phone,
        status,
        error_code,
        error_message,
        status_updated_at,
        created_at
      ),
      business (
        id,
        name,
        twilio_phone_number
      ),
      call_events (
        id,
        call_status,
        twilio_call_sid,
        created_at,
        raw_payload
      )
    `)
    .eq('id', leadId)
    .single()

  if (error || !data) {
    return null
  }

  return data
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const lead = await getLeadDetails(params.id)

  if (!lead) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/dashboard" 
            className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mb-4 text-sm sm:text-base transition-colors duration-200"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l6-6m6 6v4H4a2 2 0 01-2-2h2a2 2 0 01-2 2v6a2 2 0 01-2 2z"/>
            </svg>
            Back to Dashboard
          </Link>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Lead Details</h1>
                <div className="flex items-center gap-3 mb-4">
                  <span className={`inline-flex px-4 py-2 text-sm font-semibold rounded-full ${getLeadStatusColor(lead.status)}`}>
                    {lead.status}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {formatLeadPhone(lead.caller_phone)}
                  </h2>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {lead.business.name}
            </div>
          </div>
        </div>

        {/* Lead Info Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-200">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 01-4-4H5a4 4 0 01-4 4h2a4 4 0 01-4 4h6a4 4 0 01-4 4v2a4 4 0 01-4 4h8a4 4 0 01-4 4h6a4 4 0 01-4 4v14a4 4 0 01-4 4h-4a4 4 0 01-4 4z"/>
              </svg>
              Lead Information
            </h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Business</h3>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{lead.business.name}</span>
                </div>
                <p className="text-gray-900 dark:text-gray-100">{lead.business.twilio_phone_number}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Phone Number</h3>
                  <span className={`inline-flex items-center px-3 py-1 text-lg font-semibold ${getLeadStatusColor(lead.status)}`}>
                    {formatPhoneNumber(lead.caller_phone)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">First Contact</p>
                <p className="text-gray-900 dark:text-gray-100">{formatDateTime(lead.first_contact_at)}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Last Message</h3>
                  {lead.last_message_at ? (
                    <span className="text-gray-900 dark:text-gray-100">{formatDateTime(lead.last_message_at)}</span>
                  ) : (
                    <span className="text-gray-400">No messages yet</span>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Created</h3>
                  <p className="text-gray-900 dark:text-gray-100">{formatDateTime(lead.created_at)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-200">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Message History</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">{lead.messages?.length || 0}</span>
            </div>
          </div>
          <div className="px-6 py-4">
            {lead.messages && lead.messages.length > 0 ? (
              <div className="space-y-4">
                {lead.messages
                  .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map((message: any) => (
                    <div key={message.id} className={`flex items-start gap-4 p-4 rounded-lg border-l-4 ${
                      message.direction === 'inbound' 
                        ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30' 
                        : 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30'
                    } transition-colors duration-200`}>
                      <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                        message.direction === 'inbound' ? 'bg-blue-500' : 'bg-green-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            <div className="flex items-center gap-2">
                              {message.direction === 'inbound' ? (
                                <>
                                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 6H9a2 2 0 01-2-2H7a2 2 0 01-2-2v4a2 2 0 01-2 2h2a2 2 0 01-2 2h6a2 2 0 01-2 2v2a2 2 0 01-2 2h-4a2 2 0 01-2 2z"/>
                                  </svg>
                                  <span className="font-medium">Customer</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12H8a2 2 0 01-2-2H4a2 2 0 01-2-2v6a2 2 0 01-2 2h2a2 2 0 01-2 2v14a2 2 0 01-2 2z"/>
                                  </svg>
                                  <span className="font-medium">Business</span>
                                </>
                              )}
                            </div>
                          </div>
                          <StatusBadge status={message.status} errorCode={message.error_code} />
                        </div>
                        <div className={`p-4 rounded-lg ${
                          message.direction === 'inbound' 
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800' 
                            : 'bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-100 border-green-200 dark:border-green-800'
                        }`}>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 break-words">{message.body}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatMessageTimestamp(message)}
                          </span>
                        </div>
                        {(message.status === 'failed' || message.status === 'undelivered') && (
                          <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-medium">
                            {getFriendlyErrorMessage(message.error_code, message.error_message)}
                          </p>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          From: {formatPhoneNumber(message.from_phone)} → {formatPhoneNumber(message.to_phone)}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V7a2 2 0 01-2-2H7a2 2 0 01-2-2v10a2 2 0 01-2 2h2a2 2 0 01-2 2v6a2 2 0 01-2 2h2a2 2 0 01-2 2v10a2 2 0 01-2 2z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No messages yet</h3>
                <p className="text-gray-600 dark:text-gray-400">Messages will appear here when customers respond to your automated texts.</p>
              </div>
            )}
          </div>
        </div>

        {/* Call Events */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Call Events</h2>
          </div>
          <div className="px-4 sm:px-6 py-4">
            {lead.call_events && lead.call_events.length > 0 ? (
              <div className="space-y-3">
                {lead.call_events
                  .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map((event: any) => (
                    <div key={event.id} className="border-l-2 border-gray-200 dark:border-gray-600 pl-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Call Status: {event.call_status}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDateTime(event.created_at)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Twilio SID: {event.twilio_call_sid}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No call events recorded.</p>
            )}
          </div>
        </div>

        {/* Notes Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Notes</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Internal notes about this lead (placeholder for future use)</p>
          </div>
          <div className="px-4 sm:px-6 py-4">
            <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
                <div className="mb-2">Notes functionality coming soon</div>
                <div className="text-xs">This section will allow you to add and manage internal notes about this lead.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
