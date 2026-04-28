'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatPhoneNumber, formatRelativeTime, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { Lead, Message, Conversation } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'

function getErrorMessage(errorCode?: string | null): string | null {
  if (!errorCode) return null
  if (errorCode === '30007') {
    return 'Carrier verification still pending. Delivery may fail until approved.'
  }
  if (errorCode === '21614') {
    return 'Number is not a valid mobile number.'
  }
  if (errorCode === '21612') {
    return 'Phone number not enabled for SMS.'
  }
  return `Twilio error: ${errorCode}`
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'sending':
      return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
    case 'sent':
      return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
    case 'delivered':
      return 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
    case 'undelivered':
      return 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
    case 'failed':
      return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
    case 'pending':
      return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
    case 'simulated':
      return 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'sending':
      return 'Sending...'
    case 'sent':
      return 'Sent'
    case 'delivered':
      return 'Delivered'
    case 'undelivered':
      return 'Undelivered'
    case 'failed':
      return 'Failed'
    case 'pending':
      return 'Pending'
    case 'simulated':
      return 'Simulated'
    default:
      return status
  }
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
  const [optimisticMessage, setOptimisticMessage] = useState<any>(null)

  // ALL hooks must be declared here before any conditional returns
  // Combine real messages with optimistic message, but avoid duplicates and maintain stable ordering
  const allMessages = useMemo(() => {
    const messages = leadData?.messages || []
    if (!optimisticMessage) return messages
    
    // Check if optimistic message should be displayed (not yet in real messages)
    const isOptimisticStillNeeded = optimisticMessage.isOptimistic || 
      !messages.some((msg: any) => 
        // Match by real message ID if optimistic has been updated
        (optimisticMessage.id !== msg.id && 
         optimisticMessage.id.startsWith('temp-') && 
         msg.body === optimisticMessage.body && 
         msg.direction === 'outbound' &&
         Math.abs(new Date(msg.created_at).getTime() - new Date(optimisticMessage.created_at).getTime()) < 10000)
      )
    
    // If optimistic message is no longer needed (real message exists), don't add it
    if (!isOptimisticStillNeeded) return messages
    
    // Otherwise, add optimistic message and sort by created_at to maintain stable ordering
    const combined = [...messages, optimisticMessage]
    return combined.sort((a: any, b: any) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }, [leadData?.messages, optimisticMessage])
  
  const messagesArray = allMessages || []
  const latestMessage = messagesArray.length > 0 ? messagesArray[messagesArray.length - 1] : null
  const latestMessageStatus = latestMessage?.status || 'No messages'

  // Determine automation status
  const followUpJobs = leadData?.followUpJobs || []
  const hasCancelledFollowUps = followUpJobs.some((job: any) => job.status === 'cancelled' && job.cancelled_reason === 'customer_replied')
  const hasPendingFollowUps = followUpJobs.some((job: any) => job.status === 'pending')
  const hasSentFollowUps = followUpJobs.some((job: any) => job.status === 'sent')
  const hasInboundReply = messagesArray.some((msg: any) => msg.direction === 'inbound')

  let automationStatus = ''
  if (hasCancelledFollowUps && hasInboundReply) {
    automationStatus = 'Follow-ups cancelled after customer reply'
  } else if (hasPendingFollowUps) {
    automationStatus = 'Follow-ups active'
  } else if (hasSentFollowUps) {
    automationStatus = 'Follow-ups completed'
  }

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

  const handleSendMessage = async (e?: React.FormEvent) => {
    // Prevent form submission and page refresh
    if (e) {
      e.preventDefault()
    }
    
    // Don't send if message is empty, whitespace, or already sending
    if (!message.trim() || sending) return

    // Create optimistic message
    const tempId = `temp-${Date.now()}`
    const optimisticMsg = {
      id: tempId,
      direction: 'outbound',
      body: message.trim(),
      status: 'sending',
      created_at: new Date().toISOString(),
      isOptimistic: true
    }
    
    setOptimisticMessage(optimisticMsg)
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
        // Update optimistic message to failed state
        setOptimisticMessage({
          ...optimisticMsg,
          status: 'failed',
          error_message: result.error || 'Failed to send message'
        })
        
        // Show appropriate error message based on response
        if (result.error === 'Lead not found') {
          setError('Lead not found. Please refresh the page and try again.')
        } else if (result.error === 'Business not found') {
          setError('Business not found. Please contact support.')
        } else if (result.error?.includes('verification') || result.error?.includes('carrier')) {
          setError('Carrier verification still pending. Delivery may fail until approved.')
        } else {
          setError('Failed to send message. Please try again.')
        }
        return
      }

      // Update optimistic message with real message data
      if (result.messageId && optimisticMsg.id.startsWith('temp-')) {
        setOptimisticMessage({
          ...optimisticMsg,
          id: result.messageId,
          status: 'sent',
          isOptimistic: false // Mark as real message
        })
        
        // Clear optimistic message after a slightly longer delay to allow real message to appear
        setTimeout(() => {
          setOptimisticMessage(null)
        }, 500)
      }

      // Clear input and set success
      setMessage('')
      setSuccessMessage('Message sent successfully')
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('')
      }, 3000)
      
      // Scroll to bottom to show the new message
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
      }, 50)
    } catch (err) {
      // Update optimistic message to failed state
      setOptimisticMessage({
        ...optimisticMsg,
        status: 'failed',
        error_message: 'Network error occurred'
      })
      setError('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends the message, Shift+Enter creates a new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault() // Prevent new line
      handleSendMessage() // Send the message
    }
    // Allow Shift+Enter to create new line (default behavior)
  }

  const handleRetry = async (messageBody: string, messageId?: string) => {
    if (sending) return
    
    setSending(true)
    setError('')

    // If retrying an optimistic message, update its status
    if (messageId?.startsWith('temp-')) {
      setOptimisticMessage((prev: any) => prev?.id === messageId ? { ...prev, status: 'sending' } : prev)
    }

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
        // Update optimistic message back to failed
        if (messageId?.startsWith('temp-')) {
          setOptimisticMessage((prev: any) => prev?.id === messageId ? { 
            ...prev, 
            status: 'failed',
            error_message: result.error || 'Failed to send message'
          } : prev)
        }
        
        // Show appropriate error message based on response
        if (result.error === 'Lead not found') {
          setError('Lead not found. Please refresh the page and try again.')
        } else if (result.error === 'Business not found') {
          setError('Business not found. Please contact support.')
        } else if (result.error?.includes('verification') || result.error?.includes('carrier')) {
          setError('Carrier verification still pending. Delivery may fail until approved.')
        } else {
          setError(result.error || 'Failed to send message')
        }
        return
      }

      // Update optimistic message with real message data on successful retry
      if (result.messageId && messageId?.startsWith('temp-')) {
        setOptimisticMessage((prev: any) => prev?.id === messageId ? {
          ...prev,
          id: result.messageId,
          status: 'sent',
          isOptimistic: false
        } : prev)
      }

      // Refresh data and clear optimistic message after delay
      router.refresh()
      const data = await getLeadDetails(params.id)
      setLeadData(data)
      
      setTimeout(() => {
        if (messageId?.startsWith('temp-')) {
          setOptimisticMessage(null)
        }
      }, 100)
    } catch (err) {
      // Update optimistic message back to failed
      if (messageId?.startsWith('temp-')) {
        setOptimisticMessage((prev: any) => prev?.id === messageId ? { 
          ...prev, 
          status: 'failed',
          error_message: 'Network error occurred'
        } : prev)
      }
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

  // Now safely destructure after hooks are called
  const lead = leadData
  const messages = leadData?.messages || []
  const conversation = leadData?.conversation || null
  const source = leadData?.source || null

  // Debug info
  const debugInfo = {
    leadId: params.id,
    conversationId: conversation?.id || 'none',
    messagesCount: messagesArray.length,
    queryMethod: 'messages.lead_id',
    latestMessage: latestMessage?.body || 'none',
    messages: messagesArray
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Debug Box - Development Only */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 m-4 rounded-lg">
          <h3 className="font-bold text-sm mb-2">Debug Info</h3>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      )}
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
                  {automationStatus && (
                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 text-xs rounded-full">
                      {automationStatus}
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
                  const isManual = !isFollowUp && isOutbound && !msg.isOptimistic
                  const isOptimistic = msg.isOptimistic
                  const isSending = msg.status === 'sending'
                  
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
                        <div className="flex items-center gap-2 mb-1 justify-end flex-wrap">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatRelativeTime(msg.created_at)}
                          </span>
                          {isOptimistic && (
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full animate-pulse">
                              Sending...
                            </span>
                          )}
                          {isManual && (
                            <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 text-xs rounded-full">
                              Manual
                            </span>
                          )}
                          {isFollowUp && (
                            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs rounded-full">
                              Follow-up
                            </span>
                          )}
                          {isInbound && (
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full">
                              Customer replied
                            </span>
                          )}
                          {isOutbound && msg.status && !isOptimistic && (
                            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getStatusColor(msg.status)}`}>
                              {getStatusText(msg.status)}
                            </span>
                          )}
                        </div>
                        
                        <div
                          className={`rounded-2xl px-4 py-3 relative ${
                            isInbound
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-none'
                              : isOptimistic && isSending
                              ? 'bg-blue-500 text-white rounded-tr-none animate-pulse'
                              : 'bg-blue-600 text-white rounded-tr-none'
                          }`}
                        >
                          {isOptimistic && isSending && (
                            <div className="absolute top-2 right-2">
                              <div className="w-2 h-2 bg-white/30 rounded-full animate-ping"></div>
                            </div>
                          )}
                          <p className="text-sm leading-relaxed break-words">
                            {msg.body || 'No content'}
                          </p>
                        </div>
                        
                        {/* Error/Warning State */}
                        {hasError && (
                          <div className="mt-2">
                            {msg.error_code === '30007' || msg.error_message?.includes('verification') ? (
                              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                                <p className="text-xs text-amber-800 dark:text-amber-300 mb-2">
                                  {errorMessage || msg.error_message}
                                </p>
                                <button
                                  onClick={() => {
                                    if (!sending) {
                                      handleRetry(msg.body, msg.id)
                                    }
                                  }}
                                  disabled={sending}
                                  className="text-xs px-3 py-1 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white rounded transition-colors"
                                >
                                  {sending ? 'Retrying...' : 'Retry'}
                                </button>
                              </div>
                            ) : (
                              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                                <p className="text-xs text-red-800 dark:text-red-300 mb-2">
                                  {errorMessage || msg.error_message || 'Message failed to send'}
                                </p>
                                <button
                                  onClick={() => {
                                    if (!sending) {
                                      handleRetry(msg.body, msg.id)
                                    }
                                  }}
                                  disabled={sending}
                                  className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded transition-colors"
                                >
                                  {sending ? 'Retrying...' : 'Retry'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Optimistic Failed State */}
                        {isOptimistic && msg.status === 'failed' && (
                          <div className="mt-2">
                            {msg.error_message?.includes('verification') || msg.error_message?.includes('carrier') ? (
                              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                                <p className="text-xs text-amber-800 dark:text-amber-300 mb-2">
                                  {msg.error_message}
                                </p>
                                <button
                                  onClick={() => {
                                    if (!sending) {
                                      handleRetry(msg.body, msg.id)
                                    }
                                  }}
                                  disabled={sending}
                                  className="text-xs px-3 py-1 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white rounded transition-colors"
                                >
                                  {sending ? 'Retrying...' : 'Retry'}
                                </button>
                              </div>
                            ) : (
                              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                                <p className="text-xs text-red-800 dark:text-red-300 mb-2">
                                  {msg.error_message}
                                </p>
                                <button
                                  onClick={() => {
                                    if (!sending) {
                                      handleRetry(msg.body, msg.id)
                                    }
                                  }}
                                  disabled={sending}
                                  className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded transition-colors"
                                >
                                  {sending ? 'Retrying...' : 'Retry'}
                                </button>
                              </div>
                            )}
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
              <div className="flex gap-3">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                  className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  rows={2}
                  disabled={sending}
                />
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
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
                <div className={`text-sm p-3 rounded-lg border ${
                  error.includes('verification') || error.includes('carrier')
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}>
                  <p>{error}</p>
                </div>
              )}
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
