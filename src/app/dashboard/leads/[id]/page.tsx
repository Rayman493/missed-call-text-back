import { supabase } from '@/lib/supabase'
import { formatPhoneNumber, formatDateTime, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'

async function getLeadDetails(leadId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select(`
      *,
      messages (
        id,
        direction,
        body,
        from_phone,
        to_phone,
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
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/dashboard" 
            className="text-blue-600 hover:text-blue-800 mb-4 inline-block text-sm sm:text-base"
          >
            &larr; Back to Dashboard
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Lead Details</h1>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getLeadStatusColor(lead.status)}`}>
                    {lead.status}
                  </span>
                  <span className="text-lg sm:text-xl font-semibold text-gray-900">
                    {formatPhoneNumber(lead.caller_phone)}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {lead.business.name}
            </div>
          </div>
        </div>

        {/* Lead Info Card */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Lead Information</h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Business</p>
                <p className="text-sm text-gray-900">{lead.business.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Phone Number</p>
                <p className="text-sm text-gray-900">{formatPhoneNumber(lead.caller_phone)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">First Contact</p>
                <p className="text-sm text-gray-900">{formatDateTime(lead.first_contact_at)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Last Message</p>
                <p className="text-sm text-gray-900">{formatDateTime(lead.last_message_at)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Created</p>
                <p className="text-sm text-gray-900">{formatDateTime(lead.created_at)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Updated</p>
                <p className="text-sm text-gray-900">{formatDateTime(lead.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Message History</h2>
          </div>
          <div className="px-4 sm:px-6 py-4">
            {lead.messages && lead.messages.length > 0 ? (
              <div className="space-y-4">
                {lead.messages
                  .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map((message: any) => (
                    <div key={message.id} className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                        message.direction === 'inbound' ? 'bg-blue-500' : 'bg-green-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
                          <span className="text-sm font-medium text-gray-900">
                            {message.direction === 'inbound' ? 'Customer' : 'Business'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDateTime(message.created_at)}
                          </span>
                        </div>
                        <div className={`p-3 rounded-lg ${
                          message.direction === 'inbound' 
                            ? 'bg-blue-50 text-blue-900' 
                            : 'bg-green-50 text-green-900'
                        }`}>
                          <p className="text-sm break-words">{message.body}</p>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          From: {formatPhoneNumber(message.from_phone)} &rarr; {formatPhoneNumber(message.to_phone)}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-gray-500">No messages yet.</p>
            )}
          </div>
        </div>

        {/* Call Events */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Call Events</h2>
          </div>
          <div className="px-4 sm:px-6 py-4">
            {lead.call_events && lead.call_events.length > 0 ? (
              <div className="space-y-3">
                {lead.call_events
                  .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map((event: any) => (
                    <div key={event.id} className="border-l-2 border-gray-200 pl-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          Call Status: {event.call_status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDateTime(event.created_at)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Twilio SID: {event.twilio_call_sid}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-gray-500">No call events recorded.</p>
            )}
          </div>
        </div>

        {/* Notes Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Notes</h2>
            <p className="text-sm text-gray-500 mt-1">Internal notes about this lead (placeholder for future use)</p>
          </div>
          <div className="px-4 sm:px-6 py-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-500 text-center">
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
