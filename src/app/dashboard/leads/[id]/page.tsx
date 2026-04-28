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
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatPhoneNumber(lead?.caller_phone || '')}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getLeadStatusColor(lead?.status)}`}>
                    {lead?.status}
                  </span>
                  {conversation && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      conversation.status === 'open' 
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    }`}>
                      {conversation.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Created {formatRelativeTime(lead?.created_at)}
              </p>
              {lead?.last_message_at && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Last activity {formatRelativeTime(lead.last_message_at)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Message Thread */}
          <div className="p-4 sm:p-6 min-h-[400px] max-h-[calc(100vh-300px)] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : messagesArray.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">💬</div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  No messages yet
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Start the conversation by sending a message below.
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Messages will appear here after missed calls or replies.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
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
                          ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                          : 'bg-gradient-to-br from-gray-400 to-gray-500 text-white'
                      }`}>
                        {isInbound ? '👤' : '🤖'}
                      </div>
                      
                      {/* Message Bubble */}
                      <div className={`max-w-[75%] ${isOutbound ? 'text-right' : ''}`}>
                        <div className="flex items-center gap-2 mb-1 justify-end">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatRelativeTime(msg.created_at)}
                          </span>
                          {isFollowUp && (
                            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs rounded-full">
                              Follow-up
                            </span>
                          )}
                          {msg.status && (
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              msg.status === 'sent' ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' :
                              msg.status === 'delivered' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
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
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-none'
                              : 'bg-blue-600 text-white rounded-tr-none'
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

          {/* Send Message Input */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 sm:p-6 bg-gray-50 dark:bg-gray-900/50">
            <form onSubmit={handleSendMessage}>
              <div className="flex gap-3">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  rows={2}
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !message.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-xl font-medium transition-colors self-end"
                >
                  {sending ? (
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
              {error && (
                <p className="text-red-600 dark:text-red-400 text-sm mt-2">{error}</p>
              )}
            </form>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
          </div>
        )}

        {/* Follow-up Jobs */}
        {followUpJobs.length > 0 && (
          <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Follow-up Jobs ({followUpJobs.length})
            </h3>
            <div className="space-y-2">
              {followUpJobs.map((job: any) => {
                const isPending = job.status === 'pending'
                const isSent = job.status === 'sent'
                const isCancelled = job.status === 'cancelled'
                const isFailed = job.status === 'failed'
                
                return (
                  <div
                    key={job.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isPending ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' :
                      isSent ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' :
                      isCancelled ? 'bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700' :
                      'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          isPending ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
                          isSent ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
                          isCancelled ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200' :
                          'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                        }`}>
                          {job.status}
                        </span>
                        {job.cancelled_reason && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            ({job.cancelled_reason})
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                        {job.message_body}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(job.scheduled_for)}
                      </p>
                      {job.sent_at && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Sent {formatRelativeTime(job.sent_at)}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
