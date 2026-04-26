import { supabaseAdmin } from '@/lib/supabase'
import { formatPhoneNumber, formatRelativeTime, truncateText, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'
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

// Helper to get lead-level status indicator
function getLeadMessageStatus(latestMessage: any): { text: string; color: string } {
  if (!latestMessage || !latestMessage.status) {
    return { text: 'No messages', color: 'gray' }
  }
  
  const status = latestMessage.status
  if (status === 'delivered') return { text: 'Delivered', color: 'green' }
  if (status === 'sent') return { text: 'Sent', color: 'blue' }
  if (status === 'queued') return { text: 'Sending', color: 'gray' }
  if (status === 'failed') return { text: 'Issue sending', color: 'red' }
  if (status === 'undelivered') return { text: 'Issue sending', color: 'orange' }
  return { text: 'Unknown', color: 'gray' }
}

// Helper to format timestamp with fallback
function formatMessageTimestamp(message: any): string {
  const timestamp = message.status_updated_at || message.created_at
  return formatRelativeTime(timestamp)
}

// Force dynamic rendering to prevent stale data
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function markLeadAsContacted(leadId: string) {
  'use server'
  
  try {
    const { error } = await supabaseAdmin
      .from('leads')
      .update({ 
        status: 'contacted'
      })
      .eq('id', leadId)

    if (error) {
      console.error('Failed to mark lead as contacted:', error)
      throw new Error('Failed to update lead status')
    }

    // Redirect back to dashboard to refresh the data
    redirect('/dashboard?success=lead-contacted')
  } catch (error) {
    console.error('Unexpected error marking lead as contacted:', error)
    throw error
  }
}

async function getDashboardData() {
  // TODO: This is temporary and should later be replaced with proper user/business ownership
  // Fetch the first business row from public.businesses without filtering by user
  const { data: business, error } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .limit(1)
    .single()

  if (error || !business) {
    console.log('No business found in database:', error)
    return { business: null, leads: [], allBusinesses: [], businessLeadCounts: [] }
  }

  console.log('Selected business:', { id: business.id, name: business.name, phone: business.twilio_phone_number })

  // Query leads with their latest messages and conversations
  console.log("Dashboard fetching leads for business:", { business_id: business.id, business_name: business.name })
  
  const { data: leads, error: leadsError } = await supabaseAdmin
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
  
  console.log("Dashboard leads query result:", { leads_count: leads?.length || 0, leads_error: leadsError })
  
  if (leadsError) {
    console.log("Dashboard leads query error:", leadsError)
  }

  return {
    business,
    leads: leads || [],
    allBusinesses: [business],
    businessLeadCounts: [{
      businessId: business.id,
      businessName: business.name,
      leadCount: leads?.length || 0
    }]
  }
}

export default async function DashboardPage({ searchParams }: { searchParams?: { success?: string } }) {
  const { business, leads, allBusinesses, businessLeadCounts } = await getDashboardData()
  
  // Calculate lead counts
  const newLeads = leads.filter(lead => lead.status === 'new').length
  const contactedLeads = leads.filter(lead => lead.status === 'contacted').length

  if (!business) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600">No business found. Please set up your business first.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Success Message */}
        {searchParams?.success === 'settings-updated' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="text-sm text-green-800">
              <strong>Success!</strong> Your business settings have been updated.
            </div>
          </div>
        )}
        {searchParams?.success === 'lead-contacted' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="text-sm text-green-800">
              <strong>Success!</strong> Lead has been marked as contacted.
            </div>
          </div>
        )}
        
        {/* Header */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
                <p className="text-sm text-gray-600">Automated text responses for missed calls</p>
              </div>
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l6-6m6 6v4H4a2 2 0 01-4-4H5a4 4 0 01-4 4h2a4 4 0 01-4 4v6a2 4 0 01-4 4h6a4 4 0 01-4 4h6a4 4 0 01-4 4z"/>
                </svg>
                Settings
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Total Leads</h3>
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 21v-2a4 4 0 01-4-4H5a4 4 0 01-4 4h2a4 4 0 01-4 4h6a4 4 0 01-4 4h6a4 4 0 01-4 4v2a4 4 0 01-4 4h8a4 4 0 01-4 4h6a4 4 0 01-4-4v14a4 4 0 01-4-4h-4a4 4 0 01-4 4z"/>
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{leads.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">New Leads</h3>
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-4H8m8 4v8m-4 4h4"/>
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{newLeads}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">Contacted</h3>
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2m0 0l-2-2m2 2l-2-2"/>
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{contactedLeads}</p>
          </div>
        </div>

        {/* Recent Leads */}
        <div className="bg-white rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Recent Leads</h2>
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{leads.length}</span>
            </div>
          </div>
          <div className="p-6">
            {leads.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V7a2 2 0 01-2-2H7a2 2 0 01-2 2v10a2 2 0 01-2 2h2a2 2 0 01-2 2v6a2 2 0 01-2 2h2a2 2 0 01-2 2v10a2 2 0 01-2 2z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No leads yet</h3>
                <p className="text-gray-600">Missed calls will appear here automatically.</p>
                <p className="text-sm text-gray-500 mt-2">Call your Twilio number and hang up to test the missed call flow.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {leads.map((lead) => {
                  // Get latest message for preview
                  const latestMessage = lead.messages && lead.messages.length > 0 
                    ? lead.messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                    : null

                  // Get latest conversation info
                  const latestConversation = lead.conversations && lead.conversations.length > 0
                    ? lead.conversations.sort((a: any, b: any) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime())[0]
                    : null

                  // Get lead-level message status
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
                              <svg className={`w-6 h-6 ${
                                messageStatus.color === 'green' ? 'text-green-600' :
                                messageStatus.color === 'red' ? 'text-red-600' :
                                messageStatus.color === 'orange' ? 'text-orange-600' :
                                'text-blue-600'
                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 01-2-2h14a2 2 0 01-2 2v14a2 2 0 01-2 2H5a2 2 0 01-2 2V7z"/>
                              </svg>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                  {formatLeadPhone(lead.caller_phone)}
                                </h3>
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getLeadStatusColor(lead.status)}`}>
                                    {lead.status}
                                  </span>
                                  {latestMessage && (
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${
                                      messageStatus.color === 'green' ? 'bg-green-100 text-green-700' :
                                      messageStatus.color === 'red' ? 'bg-red-100 text-red-700' :
                                      messageStatus.color === 'orange' ? 'bg-orange-100 text-orange-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {messageStatus.color === 'green' && '✓'}
                                      {messageStatus.color === 'red' && '✕'}
                                      {messageStatus.color === 'orange' && '⚠'}
                                      {messageStatus.text}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-sm text-gray-500">
                                {latestConversation?.last_activity_at ? (
                                  <>Last activity {formatRelativeTime(latestConversation.last_activity_at)}</>
                                ) : (
                                  <>First contact {formatRelativeTime(lead.first_contact_at)}</>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 sm:gap-4">
                          {lead.status === 'new' && (
                            <form action={markLeadAsContacted.bind(null, lead.id)}>
                              <button
                                type="submit"
                                className="inline-flex items-center px-4 py-2 text-sm font-medium text-green-700 bg-green-100 border border-green-300 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200"
                              >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L16 7l-4-4"/>
                                </svg>
                                Mark Contacted
                              </button>
                            </form>
                          )}
                          <Link
                            href={`/dashboard/leads/${lead.id}`}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-300 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                            </svg>
                            View Details
                          </Link>
                        </div>
                      </div>
                      
                      {/* Latest Message Preview */}
                      {latestMessage && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                              latestMessage.direction === 'inbound' ? 'bg-blue-500' : 'bg-green-500'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-xs font-medium text-gray-500">
                                  {latestMessage.direction === 'inbound' ? 'Customer' : 'Business'}
                                </span>
                                {latestMessage.status && (
                                  <StatusBadge status={latestMessage.status} />
                                )}
                              </div>
                              <div className="text-sm font-semibold text-gray-900 bg-gray-50 rounded-lg p-3 border border-gray-200">
                                {truncateText(latestMessage.body, 100)}
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-gray-400">
                                  {formatMessageTimestamp(latestMessage)}
                                </span>
                              </div>
                              {(latestMessage.status === 'failed' || latestMessage.status === 'undelivered') && (
                                <p className="text-sm text-red-600 mt-2 font-medium">
                                  {getFriendlyErrorMessage(latestMessage.error_code, latestMessage.error_message)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
