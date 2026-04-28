'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatPhoneNumber, formatRelativeTime, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { Lead, Message, Conversation } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'

function getErrorMessage(errorCode?: string | null): string | null {
  if (!errorCode) return null
  if (errorCode === '30007') {
    return 'Sent (delivery pending). Carrier verification may still be in progress.'
  }
  return `Twilio error code: ${errorCode}`
}

async function getLeadDetails(leadId: string) {
  const supabase = createBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const response = await fetch(`/api/lead-details?id=${leadId}`, { headers })
  if (!response.ok) return null
  return response.json()
}

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [leadData, setLeadData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Fetch lead data on mount
  useEffect(() => {
    console.log('[Lead View] Opening lead details for leadId:', params.id)
    console.log('[Lead View] LeadId type:', typeof params.id)
    console.log('[Lead View] LeadId length:', params.id?.length)
    
    getLeadDetails(params.id).then(result => {
      console.log('[Lead View] API response:', result)
      
      if (!result) {
        console.log('[Lead View] No response returned from API - this is the issue!')
        setLeadData(null)
        setLoading(false)
        return
      }

      if (result.ok && result.lead) {
        console.log('[Lead View] API returned lead data:', result.lead)
        setLeadData(result.lead)
        setLoading(false)
        return
      }

      console.log('[Lead View] API returned error:', result)
      setError(result.error || "Lead not found")
      setLeadData(null)
      setLoading(false)
    }).catch(error => {
      console.error('[Lead View] Error fetching lead details:', error)
      setError('Failed to fetch lead details')
      setLeadData(null)
      setLoading(false)
    })
  }, [params.id])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    setSending(true)
    setError('')
    setSuccessMessage('')

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers,
        body: JSON.stringify({ leadId: params.id, message: message.trim() })
      })

      const result = await response.json()

      if (!response.ok) {
        setError('Failed to send message. Please try again.')
        return
      }

      setMessage('')
      setSuccessMessage('Message sent successfully')
      router.refresh()
      // Refetch data
      const data = await getLeadDetails(params.id)
      setLeadData(data)

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('')
      }, 3000)
    } catch (err) {
      setError('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleRetry = async (messageBody: string) => {
    setSending(true)
    setError('')

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers,
        body: JSON.stringify({ leadId: params.id, message: messageBody })
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to send message')
        return
      }

      router.refresh()
      const data = await getLeadDetails(params.id)
      setLeadData(data)
    } catch (err) {
      setError('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </main>
    )
  }

  if (!leadData) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium transition-colors"
            >
              ← Back to dashboard
            </Link>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Lead not found</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {error || 'The lead you\'re looking for doesn\'t exist or you don\'t have permission to view it.'}
            </p>
            <Link
              href="/dashboard"
              className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const lead = leadData
  const messages = leadData.messages || []
  const conversation = leadData.conversation || null
  const followUpJobs = leadData.followUpJobs || []
  const source = leadData.source || null

  // Get latest message status with safe guards
  const messagesArray = messages || []
  const latestMessage = messagesArray.length > 0 ? messagesArray[messagesArray.length - 1] : null
  const latestMessageStatus = latestMessage?.status || 'No messages'

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

        {/* Lead Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
            Lead Summary
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {formatPhoneNumber(lead?.caller_phone || '')}
              </h1>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getLeadStatusColor(lead?.status)}`}>
                  {lead?.status}
                </span>
                {source && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {source}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 dark:text-gray-400">Latest Message</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium capitalize">{latestMessageStatus}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Created</p>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead?.created_at)}</p>
            </div>
            {lead?.first_contact_at && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">First Contact</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.first_contact_at)}</p>
              </div>
            )}
            {lead?.last_message_at && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Last Message</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.last_message_at)}</p>
              </div>
            )}
            {lead?.last_reply_at && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Last Reply</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{formatRelativeTime(lead.last_reply_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Send Message */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Send Message
          </h2>
          <form onSubmit={handleSendMessage}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              disabled={sending}
            />
            {!message.trim() && (
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Message cannot be empty</p>
            )}
            {error && (
              <p className="text-red-600 dark:text-red-400 text-sm mt-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {sending ? 'Sending...' : 'Send SMS'}
            </button>
          </form>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
          </div>
        )}

        {/* Follow-up Jobs */}
        {followUpJobs.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Follow-up Jobs ({followUpJobs.length})
              </h2>
            </div>
            <div className="p-6">
              {followUpJobs.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                  No follow-up jobs found.
                </p>
              ) : (
                <div className="space-y-3">
                  {followUpJobs.map((job: any) => {
                    const isPending = job.status === 'pending'
                    const isSent = job.status === 'sent'
                    const isCancelled = job.status === 'cancelled'
                    const isFailed = job.status === 'failed'
                    
                    return (
                      <div
                        key={job.id}
                        className={`border rounded-lg p-4 ${
                          isPending ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20' :
                          isSent ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' :
                          isCancelled ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20' :
                          'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                isPending ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
                                isSent ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
                                isCancelled ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200' :
                                'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                              }`}>
                                {job.status}
                              </span>
                              {job.cancelled_reason && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  ({job.cancelled_reason})
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-900 dark:text-gray-100 mb-2">
                              {job.message_body}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                              <span>Scheduled: {formatRelativeTime(job.scheduled_for)}</span>
                              {job.sent_at && (
                                <span>Sent: {formatRelativeTime(job.sent_at)}</span>
                              )}
                              {job.cancelled_at && (
                                <span>Cancelled: {formatRelativeTime(job.cancelled_at)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Message Thread */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Conversation Thread ({messagesArray.length})
              </h2>
              {conversation && (
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    conversation.status === 'open' 
                      ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  }`}>
                    {conversation.status}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ID: {conversation.id}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Notice for undelivered latest message */}
          {latestMessage && (latestMessage.status === 'undelivered' || latestMessage.status === 'failed') && (
            <div className="mx-6 mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                ⚠️ Delivery limited during verification — this will resolve once approved.
              </p>
            </div>
          )}

          <div className="p-6">
            {messagesArray.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">💬</div>
                <p className="text-gray-500 dark:text-gray-400 text-lg">
                  No messages yet
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
                  Start the conversation by sending a message below.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messagesArray.map((msg: any, index: number) => {
                  const errorMessage = getErrorMessage(msg.error_code)
                  const hasError = msg.status === 'undelivered' || msg.status === 'failed'
                  const isInbound = msg.direction === 'inbound'
                  const isOutbound = msg.direction === 'outbound'
                  const isFollowUp = msg.body?.includes('Just following up') || msg.body?.includes('Good morning')
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-3 ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}
                    >
                      {/* Avatar */}
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        isInbound 
                          ? 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
                          : 'bg-blue-600 text-white'
                      }`}>
                        {isInbound ? '👤' : '🤖'}
                      </div>
                      
                      {/* Message Bubble */}
                      <div className={`max-w-[70%] ${isOutbound ? 'text-right' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatRelativeTime(msg.created_at)}
                          </span>
                          {isFollowUp && (
                            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs rounded-full">
                              Follow-up
                            </span>
                          )}
                          {msg.status && (
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              msg.status === 'sent' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
                              msg.status === 'delivered' ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' :
                              msg.status === 'failed' || msg.status === 'undelivered' ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' :
                              'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                            }`}>
                              {msg.status}
                            </span>
                          )}
                        </div>
                        
                        <div
                          className={`rounded-2xl px-4 py-3 ${
                            isInbound
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          <p className="text-sm leading-relaxed break-words">
                            {msg.body || 'No content'}
                          </p>
                        </div>
                        
                        {hasError && errorMessage && (
                          <div className="mt-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                            <p className="text-xs text-amber-800 dark:text-amber-300 mb-2">
                              {errorMessage}
                            </p>
                            <button
                              onClick={() => handleRetry(msg.body)}
                              disabled={sending}
                              className="text-xs px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors disabled:bg-gray-400"
                            >
                              {sending ? 'Retrying...' : 'Retry Send'}
                            </button>
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                              May fail until verification completes
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
