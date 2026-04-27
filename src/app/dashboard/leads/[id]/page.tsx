import { supabaseAdmin } from '@/lib/supabase/admin'
import { formatPhoneNumber, formatRelativeTime, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Lead, Message, Conversation } from '@/lib/types'

function getErrorMessage(errorCode?: string | null): string | null {
  if (!errorCode) return null
  if (errorCode === '30007') {
    return 'Carrier filtering detected. This may happen while toll-free verification is pending.'
  }
  return `Twilio error code: ${errorCode}`
}

async function getLeadDetails(leadId: string) {
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    return null
  }

  // Try to get conversation first
  const { data: conversation } = await supabaseAdmin
    .from('conversations')
    .select('id, source')
    .eq('lead_id', leadId)
    .single()

  let messages: Message[] = []

  if (conversation) {
    // Fetch messages by conversation_id
    const { data: conversationMessages } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })

    messages = conversationMessages || []
  } else {
    // Fallback: fetch messages by lead_id
    const { data: leadMessages } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })

    messages = leadMessages || []
  }

  return {
    lead: lead as Lead,
    messages,
    source: conversation?.source || null
  }
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const result = await getLeadDetails(params.id)

  if (!result) {
    notFound()
  }

  const { lead, messages, source } = result

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium transition-colors"
          >
            ← Back to dashboard
          </Link>
        </div>

        {/* Lead Profile Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {formatPhoneNumber(lead.caller_phone)}
              </h1>
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getLeadStatusColor(lead.status)}`}>
                  {lead.status}
                </span>
                {source && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {source}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Created</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.created_at)}</p>
            </div>
            {lead.first_contact_at && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">First Contact</p>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.first_contact_at)}</p>
              </div>
            )}
            {lead.last_message_at && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Last Message</p>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.last_message_at)}</p>
              </div>
            )}
            {lead.last_reply_at && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Last Reply</p>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.last_reply_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Messages Timeline */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Message History ({messages.length})
            </h2>
          </div>

          <div className="p-6">
            {messages.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                No messages found yet.
              </p>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => {
                  const errorMessage = getErrorMessage(message.error_code)
                  const hasError = message.status === 'undelivered' || message.status === 'failed'

                  return (
                    <div
                      key={message.id}
                      className={`flex ${message.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div className="max-w-[80%]">
                        <div
                          className={`rounded-lg p-4 ${
                            message.direction === 'inbound'
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          <p className="text-sm break-words">{message.body || 'No content'}</p>
                          <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="text-xs opacity-70">
                              {formatRelativeTime(message.created_at)}
                            </span>
                            {message.status && (
                              <span className="text-xs opacity-70 capitalize">
                                {message.status}
                              </span>
                            )}
                          </div>
                        </div>
                        {hasError && errorMessage && (
                          <div className="mt-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                            <p className="text-xs text-red-800 dark:text-red-300">
                              {errorMessage}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
