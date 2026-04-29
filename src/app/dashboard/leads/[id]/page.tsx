'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { formatPhoneNumber, formatRelativeTime, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { Lead, Message, Conversation } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { RealtimeChannel } from '@supabase/supabase-js'

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
  
  // Realtime subscription management
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createBrowserClient()

  // ALL hooks must be declared here before any conditional returns
  // Auto-scroll to newest message with jump button logic
  const [showJumpButton, setShowJumpButton] = useState(false)
  
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth', force = false) => {
    // Only scroll if user is near bottom (within 200px) or if forced
    const scrollThreshold = 200
    const isNearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - scrollThreshold
    
    if (force || isNearBottom || behavior === 'auto') {
      setTimeout(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior
        })
        setShowJumpButton(false)
      }, 100)
    } else if (!force) {
      // Show jump button if user scrolled up and new message arrives
      setShowJumpButton(true)
    }
  }

  
  
  // Scroll to bottom after sending a message
  useEffect(() => {
    if (!sending && successMessage) {
      scrollToBottom('smooth')
    }
  }, [sending, successMessage])

  // Merge messages by ID to prevent overwriting local state with stale data
  const mergeMessagesById = (existingMessages: any[], newMessages: any[]) => {
    console.log('[Merge] Existing messages count:', existingMessages.length)
    console.log('[Merge] New messages count:', newMessages.length)
    
    const messageMap = new Map()
    
    // Add existing messages first (preserve local state)
    existingMessages.forEach(msg => {
      messageMap.set(msg.id, msg)
    })
    
    // Merge/overwrite with new messages (use latest data)
    newMessages.forEach(msg => {
      messageMap.set(msg.id, msg)
    })
    
    const merged = Array.from(messageMap.values())
    console.log('[Merge] Final merged messages count:', merged.length)
    
    return merged.sort((a: any, b: any) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  // Combine real messages with optimistic message, but avoid duplicates and maintain stable ordering
  const allMessages = useMemo(() => {
    const messages = leadData?.messages || []
    if (!optimisticMessage) return messages
    
    // Check for duplicates using multiple strategies
    const hasDuplicate = messages.some((msg: any) => {
      // 1. Match by exact ID (if optimistic has real ID)
      if (optimisticMessage.id === msg.id) return true
      
      // 2. Match by clientTempId (most reliable)
      if (optimisticMessage.clientTempId && msg.clientTempId === optimisticMessage.clientTempId) return true
      
      // 3. Match by content + direction + timing (fallback for older messages)
      if (msg.body === optimisticMessage.body && 
          msg.direction === optimisticMessage.direction &&
          Math.abs(new Date(msg.created_at).getTime() - new Date(optimisticMessage.created_at).getTime()) < 10000) {
        return true
      }
      
      return false
    })
    
    // If duplicate found, don't add optimistic message
    if (hasDuplicate) return messages
    
    // Otherwise, add optimistic message and sort by created_at to maintain stable ordering
    const combined = [...messages, optimisticMessage]
    return combined.sort((a: any, b: any) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }, [leadData?.messages, optimisticMessage])
  
  const messagesArray = allMessages || []
  const latestMessage = messagesArray.length > 0 ? messagesArray[messagesArray.length - 1] : null
  const latestMessageStatus = latestMessage?.status || 'No messages'

  // Scroll to bottom after messages load
  useEffect(() => {
    if (!loading && messagesArray.length > 0) {
      scrollToBottom('auto')
    }
  }, [loading, messagesArray.length])

  // Check scroll position to show/hide jump button
  useEffect(() => {
    const handleScroll = () => {
      const scrollThreshold = 200
      const isNearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - scrollThreshold
      setShowJumpButton(!isNearBottom && messagesArray.length > 0)
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll() // Check initial position
    
    return () => window.removeEventListener('scroll', handleScroll)
  }, [messagesArray.length])

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

  // Realtime subscription for messages
  useEffect(() => {
    if (!leadData?.id || !supabase) return

    // Quiet setup - only log errors

    // Clean up existing subscription
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current)
    }

    // Set up new subscription
    const channel = supabase
      .channel(`messages:${leadData.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `lead_id=eq.${leadData.id}`
        },
        (payload: any) => {
          // Quiet message handling
          
          if (payload.eventType === 'INSERT') {
            // New message inserted
            const newMessage = payload.new
            setLeadData((prev: any) => {
              if (!prev) return prev
              
              // Check if message already exists to prevent duplicates
              const existingMessage = prev.messages?.find((msg: any) => msg.id === newMessage.id)
              if (existingMessage) {
                // Quiet duplicate handling
                return prev
              }
              
              const updatedMessages = [...(prev.messages || []), newMessage]
                .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              
              // Quiet message count update
              
              // Auto-scroll if user is near bottom
              setTimeout(() => {
                const scrollThreshold = 200
                const isNearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - scrollThreshold
                if (isNearBottom) {
                  scrollToBottom('smooth')
                } else {
                  setShowJumpButton(true)
                }
              }, 100)
              
              return {
                ...prev,
                messages: updatedMessages,
                last_message_at: newMessage.created_at
              }
            })
          } else if (payload.eventType === 'UPDATE') {
            // Message status updated
            const updatedMessage = payload.new
            setLeadData((prev: any) => {
              if (!prev) return prev
              
              const updatedMessages = prev.messages?.map((msg: any) => 
                msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg
              )
              
              // Quiet status update
              
              return {
                ...prev,
                messages: updatedMessages
              }
            })
          }
        }
      )
      .subscribe((status: any) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Channel error for lead:', leadData.id)
        }
        // Quiet SUBSCRIBED status - no need to log
      })

    realtimeChannelRef.current = channel

    // Cleanup on unmount
    return () => {
      if (realtimeChannelRef.current) {
        console.log('[Realtime] Cleaning up message subscription')
        supabase.removeChannel(realtimeChannelRef.current)
        realtimeChannelRef.current = null
      }
    }
  }, [leadData?.id])

  const handleSendMessage = async (e?: React.FormEvent) => {
    // Prevent form submission and page refresh
    if (e) {
      e.preventDefault()
    }
    
    // Don't send if message is empty, whitespace, or already sending
    if (!message.trim() || sending) return

    // Create stable client temp ID
    const clientTempId = crypto.randomUUID()
    
    // Create optimistic message with stable ID
    const optimisticMsg = {
      id: clientTempId,
      clientTempId,
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
        body: JSON.stringify({ 
          leadId: params.id, 
          message: message.trim(),
          clientTempId
        })
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

      // Update optimistic message with real message data using clientTempId
      if (result.clientTempId === clientTempId && result.message) {
        console.log('[Send] Messages before send:', leadData?.messages?.length || 0)
        console.log('[Send] API returned message id:', result.message.id, 'status:', result.message.status)
        
        setOptimisticMessage((prev: any) => {
          // Only update if this is the same message
          if (prev?.clientTempId === clientTempId) {
            const updatedMessage = {
              ...prev,
              id: result.message.id,
              status: result.message.status || 'sent',
              isOptimistic: false,
              // Keep other properties from the real message
              ...result.message
            }
            
            console.log('[Send] Updated optimistic message:', updatedMessage.id, updatedMessage.status)
            return updatedMessage
          }
          return prev
        })
        
        // Merge the returned message into local state to prevent disappearing
        setTimeout(() => {
          setLeadData((prev: any) => {
            if (!prev) return prev
            
            const currentMessages = prev.messages || []
            const mergedMessages = mergeMessagesById(currentMessages, [result.message])
            
            console.log('[Send] Messages after local update:', mergedMessages.length)
            
            return {
              ...prev,
              messages: mergedMessages
            }
          })
        }, 100)
        
        // Clear optimistic message after it's merged into local state
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

  const handleRetry = async (messageBody: string, messageId?: string, clientTempId?: string) => {
    if (sending) return
    
    setSending(true)
    setError('')

    // Generate a new clientTempId for this retry attempt if not provided
    const retryClientTempId = clientTempId || crypto.randomUUID()

    // If retrying an optimistic message, update its status
    if (optimisticMessage?.id === messageId || optimisticMessage?.clientTempId === clientTempId) {
      setOptimisticMessage((prev: any) => {
        if (prev?.id === messageId || prev?.clientTempId === clientTempId) {
          return {
            ...prev,
            clientTempId: retryClientTempId,
            status: 'sending'
          }
        }
        return prev
      })
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
        body: JSON.stringify({ 
          leadId: params.id, 
          message: messageBody,
          clientTempId: retryClientTempId
        })
      })

      const result = await response.json()

      if (!response.ok) {
        // Update optimistic message back to failed
        if (optimisticMessage?.id === messageId || optimisticMessage?.clientTempId === clientTempId) {
          setOptimisticMessage((prev: any) => {
            if (prev?.id === messageId || prev?.clientTempId === clientTempId) {
              return {
                ...prev,
                status: 'failed',
                error_message: result.error || 'Failed to send message'
              }
            }
            return prev
          })
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

      // Update optimistic message with real message data using clientTempId
      if (result.clientTempId === retryClientTempId && result.message) {
        console.log('[Retry] API returned message id:', result.message.id, 'status:', result.message.status)
        
        setOptimisticMessage((prev: any) => {
          // Only update if this is the same message
          if (prev?.clientTempId === retryClientTempId) {
            const updatedMessage = {
              ...prev,
              id: result.message.id,
              status: result.message.status || 'sent',
              isOptimistic: false,
              // Keep other properties from the real message
              ...result.message
            }
            
            console.log('[Retry] Updated optimistic message:', updatedMessage.id, updatedMessage.status)
            return updatedMessage
          }
          return prev
        })
        
        // Merge the returned message into local state to prevent disappearing
        setTimeout(() => {
          setLeadData((prev: any) => {
            if (!prev) return prev
            
            const currentMessages = prev.messages || []
            const mergedMessages = mergeMessagesById(currentMessages, [result.message])
            
            console.log('[Retry] Messages after local update:', mergedMessages.length)
            
            return {
              ...prev,
              messages: mergedMessages
            }
          })
        }, 100)
        
        // Clear optimistic message after it's merged into local state
        setTimeout(() => {
          setOptimisticMessage(null)
        }, 500)
      }
    } catch (err) {
      // Update optimistic message back to failed
      if (optimisticMessage?.id === messageId || optimisticMessage?.clientTempId === clientTempId) {
        setOptimisticMessage((prev: any) => {
          if (prev?.id === messageId || prev?.clientTempId === clientTempId) {
            return {
              ...prev,
              status: 'failed',
              error_message: 'Network error occurred'
            }
          }
          return prev
        })
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
          {/* Skeleton Header */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-6">
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          </div>
          
          {/* Skeleton Messages */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className={`h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 ${i % 2 === 0 ? 'ml-auto' : ''}`}></div>
                  <div className={`h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mt-1 ${i % 2 === 0 ? 'ml-auto' : ''}`}></div>
                </div>
              ))}
            </div>
          </div>
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
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {formatPhoneNumber(lead?.caller_phone || '')}
                </h1>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded-md text-xs font-medium ${getLeadStatusColor(lead?.status)}`}>
                    {lead?.status}
                  </span>
                  {conversation && (
                    <span className={`px-1.5 py-0.5 rounded-md text-xs font-medium ${
                      conversation.status === 'open' 
                        ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' 
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}>
                      {conversation.status}
                    </span>
                  )}
                  {automationStatus && (
                    <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs rounded-md font-medium">
                      {automationStatus}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>Created {formatRelativeTime(lead?.created_at)}</span>
                  {lead?.last_message_at && (
                    <span>Last activity {formatRelativeTime(lead.last_message_at)}</span>
                  )}
                </div>
              </div>
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
              <div className="text-center py-16">
                <div className="text-5xl mb-4">💬</div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  No messages yet
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 max-w-md mx-auto">
                  Messages will appear here after missed calls, replies, or manual sends.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  Start the conversation by sending a message below.
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
                        <div className="flex items-center gap-1.5 mb-1 justify-end flex-wrap">
                          <span className="text-xs text-gray-500 dark:text-gray-400" title={new Date(msg.created_at).toLocaleString()}>
                            {formatRelativeTime(msg.created_at)}
                          </span>
                          {isOptimistic && (
                            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs rounded-md font-medium">
                              Sending...
                            </span>
                          )}
                          {isManual && (
                            <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs rounded-md font-medium">
                              Manual
                            </span>
                          )}
                          {isFollowUp && (
                            <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-xs rounded-md font-medium">
                              Auto
                            </span>
                          )}
                          {isInbound && (
                            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs rounded-md font-medium">
                              Customer
                            </span>
                          )}
                          {isOutbound && !isOptimistic && (
                            <>
                              {msg.status === 'sent' && (
                                <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs rounded-md font-medium">
                                  Sent
                                </span>
                              )}
                              {msg.status === 'delivered' && (
                                <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs rounded-md font-medium">
                                  Delivered
                                </span>
                              )}
                              {msg.status === 'pending' && (
                                <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs rounded-md font-medium">
                                  Pending
                                </span>
                              )}
                              {msg.status === 'undelivered' && (
                                <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-xs rounded-md font-medium">
                                  Failed
                                </span>
                              )}
                              {msg.status === 'failed' && (
                                <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-xs rounded-md font-medium">
                                  Failed
                                </span>
                              )}
                            </>
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
                              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-2">
                                <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                                  {errorMessage || msg.error_message}
                                </p>
                                <button
                                  onClick={() => {
                                    if (!sending) {
                                      handleRetry(msg.body, msg.id, msg.clientTempId)
                                    }
                                  }}
                                  disabled={sending}
                                  className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white rounded transition-colors"
                                >
                                  {sending ? 'Retrying...' : 'Retry'}
                                </button>
                              </div>
                            ) : (
                              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-2">
                                <p className="text-xs text-red-700 dark:text-red-300 mb-2">
                                  {errorMessage || msg.error_message || 'Message failed to send'}
                                </p>
                                <button
                                  onClick={() => {
                                    if (!sending) {
                                      handleRetry(msg.body, msg.id, msg.clientTempId)
                                    }
                                  }}
                                  disabled={sending}
                                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded transition-colors"
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
                              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-2">
                                <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                                  {msg.error_message}
                                </p>
                                <button
                                  onClick={() => {
                                    if (!sending) {
                                      handleRetry(msg.body, msg.id, msg.clientTempId)
                                    }
                                  }}
                                  disabled={sending}
                                  className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white rounded transition-colors"
                                >
                                  {sending ? 'Retrying...' : 'Retry'}
                                </button>
                              </div>
                            ) : (
                              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg p-2">
                                <p className="text-xs text-red-700 dark:text-red-300 mb-2">
                                  {msg.error_message}
                                </p>
                                <button
                                  onClick={() => {
                                    if (!sending) {
                                      handleRetry(msg.body, msg.id, msg.clientTempId)
                                    }
                                  }}
                                  disabled={sending}
                                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded transition-colors"
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

        {/* Jump to Latest Button */}
        {showJumpButton && (
          <button
            onClick={() => scrollToBottom('smooth', true)}
            className="fixed bottom-24 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 shadow-lg transition-all duration-200 hover:scale-105"
            aria-label="Jump to latest message"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}

          {/* Send Message Input */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 sm:p-6 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex gap-3">
                <textarea
                  ref={(textarea) => {
                    if (textarea) {
                      // Auto-resize textarea
                      textarea.style.height = 'auto'
                      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
                    }
                  }}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value)
                    // Auto-resize on change
                    const textarea = e.target
                    textarea.style.height = 'auto'
                    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                  className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all duration-200"
                  rows={1}
                  style={{ minHeight: '44px', maxHeight: '120px' }}
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
