'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import ConversationComposer from '@/components/ConversationComposer'
import MobileConversationComposer from '@/components/MobileConversationComposer'
import MobileFollowUpSummary from '@/components/MobileFollowUpSummary'
import MobileConversationMessageList from '@/components/MobileConversationMessageList'
import MobileMenu from '@/components/MobileMenu'
import { useRouter } from 'next/navigation'
import { formatPhoneNumber, formatRelativeTime, getLeadStatusColor } from '@/lib/utils'
import Link from 'next/link'
import { Lead, Message, Conversation } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { RealtimeChannel } from '@supabase/supabase-js'

function getErrorMessage(errorCode: string): string {
  // Only show user-friendly messages for known error codes
  if (errorCode === '30007') {
    return 'Phone setup still pending. Delivery may fail until approved.'
  }
  if (errorCode === '21614') {
    return 'Number is not a valid mobile number.'
  }
  if (errorCode === '21612') {
    return 'Phone number not enabled for SMS.'
  }
  // Never expose technical error codes or UNKNOWN to users
  return 'Couldn\'t send. Try again.'
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
    case 'not_sent':
      return 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200'
    case 'pending':
      return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
    case 'simulated':
      return 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
    default:
      return 'bg-muted text-muted-foreground'
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
    case 'not_sent':
      return 'Not sent — configuration issue'
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
  const [refreshing, setRefreshing] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  
  // Realtime subscription management
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createBrowserClient()

  // ALL hooks must must be declared here before any conditional returns
  // Auto-scroll to newest message with jump button logic
  const [showJumpButton, setShowJumpButton] = useState(false)
  const [showLeadInfo, setShowLeadInfo] = useState(false)
  const conversationContainerRef = useRef<HTMLDivElement>(null)
  
  // Close more actions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMoreActions) {
        setShowMoreActions(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMoreActions])
  
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth', force = false) => {
    // Scroll conversation container to bottom
    const container = conversationContainerRef.current
    if (!container) return

    // Only scroll if user is near bottom (within 200px) or if forced
    const scrollThreshold = 200
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= scrollThreshold
    
    if (force || isNearBottom || behavior === 'auto') {
      setTimeout(() => {
        container.scrollTo({
          top: container.scrollHeight,
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
    const container = conversationContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const scrollThreshold = 200
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= scrollThreshold
      setShowJumpButton(!isNearBottom && messagesArray.length > 0)
    }

    container.addEventListener('scroll', handleScroll)
    handleScroll() // Check initial position
    
    return () => container.removeEventListener('scroll', handleScroll)
  }, [messagesArray.length])

  const followUpJobs = leadData?.followUpJobs || []
  const hasCancelledFollowUps = followUpJobs.some((job: any) => job.status === 'cancelled' && job.cancelled_reason === 'customer_replied')
  const hasPendingFollowUps = followUpJobs.some((job: any) => job.status === 'pending')
  const hasSentFollowUps = followUpJobs.some((job: any) => job.status === 'sent')
  const hasInboundReply = messagesArray.some((msg: any) => msg.direction === 'inbound')

  // State for ignore contact modal
  const [showIgnoreModal, setShowIgnoreModal] = useState(false)
  const [isIgnoring, setIsIgnoring] = useState(false)

  // State for remove lead modal
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  // Handle ignore contact
  const handleIgnoreContact = async () => {
    setIsIgnoring(true)
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/ignored-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          phoneNumber: lead?.caller_phone,
          label: lead?.caller_phone,
          reason: 'Marked from conversation'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to ignore contact')
      }

      // Show success message
      setSuccessMessage('Contact ignored. ReplyFlow will no longer send automatic texts to this number.')
      setShowIgnoreModal(false)
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 2000)
    } catch (error) {
      console.error('Error ignoring contact:', error)
      setError(error instanceof Error ? error.message : 'Failed to ignore contact')
    } finally {
      setIsIgnoring(false)
    }
  }

  // Handle remove lead
  const handleRemoveLead = async () => {
    setIsRemoving(true)
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      // Archive the lead by setting status to 'archived'
      const response = await fetch(`/api/leads/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: 'archived'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to remove lead')
      }

      // Show success message
      setSuccessMessage('Lead removed from active inbox.')
      setShowRemoveModal(false)
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 1500)
    } catch (error) {
      console.error('Error removing lead:', error)
      setError(error instanceof Error ? error.message : 'Failed to remove lead')
    } finally {
      setIsRemoving(false)
    }
  }

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
                scrollToBottom('smooth')
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
          setError('Phone setup still pending. Delivery may fail until approved.')
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
        scrollToBottom('smooth')
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

  const handleRefresh = async () => {
    if (refreshing) return
    
    setRefreshing(true)
    setError('')
    
    try {
      console.log('[Refresh] Refreshing conversation data for lead:', params.id)
      
      const result = await getLeadDetails(params.id)
      
      if (!result) {
        console.log('[Refresh] No response returned from API')
        setError('Failed to refresh conversation')
        return
      }

      if (result.ok && result.lead) {
        console.log('[Refresh] Successfully refreshed conversation data')
        
        // Merge new messages with existing ones to preserve optimistic state
        setLeadData((prev: any) => {
          if (!prev) return result.lead
          
          const existingMessages = prev.messages || []
          const newMessages = result.lead.messages || []
          
          // Use the same merge logic as realtime updates
          const mergedMessages = mergeMessagesById(existingMessages, newMessages)
          
          return {
            ...result.lead,
            messages: mergedMessages
          }
        })
      } else {
        console.log('[Refresh] API returned error:', result)
        setError(result.error || 'Failed to refresh conversation')
      }
    } catch (error) {
      console.error('[Refresh] Error refreshing conversation:', error)
      setError('Failed to refresh conversation')
    } finally {
      setRefreshing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
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
          setError('Phone setup still pending. Delivery may fail until approved.')
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
      <main className="h-screen bg-background p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Skeleton Header */}
          <div className="bg-card rounded-xl shadow-sm border border-border p-4 sm:p-6 mb-6">
            <div className="animate-pulse">
              <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </div>
          </div>
          
          {/* Skeleton Messages */}
          <div className="bg-card rounded-xl shadow-sm border border-border p-4 sm:p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className={`h-4 bg-muted rounded w-3/4 ${i % 2 === 0 ? 'ml-auto' : ''}`}></div>
                  <div className={`h-3 bg-muted rounded w-3/4 mt-1 ${i % 2 === 0 ? 'ml-auto' : ''}`}></div>
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
      <main className="h-screen bg-background p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
            >
              ← Back to dashboard
            </Link>
          </div>
          <div className="bg-card rounded-lg shadow border border-border p-8 text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Lead not found</h1>
            <p className="text-muted-foreground mb-6">
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
    <main className="min-h-screen bg-background flex flex-col">
      {/* Debug Box - Development Only */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-900/20 dark:bg-yellow-900/20 border border-yellow-800 dark:border-yellow-800 p-4 m-4 rounded-lg">
          <h3 className="font-bold text-sm mb-2">Debug Info</h3>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      )}
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-slate-900 dark:bg-slate-800/90 border-b border-slate-800 dark:border-slate-700 shadow-sm">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-1.5 sm:py-2">
          {/* Primary Row - Compact */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              {/* Mobile menu - only visible on mobile/tablet */}
              <div className="md:hidden">
                <MobileMenu />
              </div>
              <Link href="/dashboard" className="flex items-center hover:opacity-90 transition flex-shrink-0">
                <span className="text-lg md:text-xl font-semibold tracking-tight">
                  <span className="text-white">Reply</span>
                  <span className="text-blue-400">Flow</span>
                </span>
              </Link>
              {/* Desktop navigation - only visible on desktop */}
              <div className="hidden md:flex items-center gap-2">
                <Link
                  href="/dashboard"
                  className="flex-shrink-0 text-gray-300 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
              </div>
              {/* Phone Number */}
              <h2 className="text-base sm:text-lg font-semibold text-white leading-tight truncate">
                {formatPhoneNumber(lead?.caller_phone || '')}
              </h2>

              {/* Status Pills */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${getLeadStatusColor(lead?.status)}`}>
                  {lead?.status}
                </span>
                {conversation && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                    conversation.status === 'open'
                      ? 'bg-green-900/50 dark:bg-green-900/50 text-green-300 dark:text-green-300'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {conversation.status}
                  </span>
                )}
              </div>
            </div>
            
            {/* Compact Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh"
              >
                {refreshing ? (
                  <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent border-solid"></div>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>
              
              <div className="relative">
                <button
                  onClick={() => setShowMoreActions(!showMoreActions)}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  title="More"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
                
                {showMoreActions && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-card rounded-lg shadow-lg border border-border py-1 z-50">
                    <button
                      onClick={() => {
                        setShowIgnoreModal(true)
                        setShowMoreActions(false)
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-red-400 dark:text-red-400 hover:bg-red-900/20 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Ignore Contact
                    </button>
                    <button
                      onClick={() => {
                        setShowRemoveModal(true)
                        setShowMoreActions(false)
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Remove Lead
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Inline Details Toggle */}
          <div className="mt-2 sm:mt-3 border-t border-border pt-2">
            <button
              onClick={() => setShowLeadInfo(!showLeadInfo)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>{showLeadInfo ? 'Hide details' : 'Show details'}</span>
              <svg
                className={`w-3 h-3 transition-transform duration-300 ${showLeadInfo ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7m7 7V3" />
              </svg>
            </button>
            
            {showLeadInfo && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Created {formatRelativeTime(lead?.created_at)}</span>
                  {lead?.last_message_at && (
                    <span>Last activity {formatRelativeTime(lead.last_message_at)}</span>
                  )}
                </div>
                
                {/* Follow-up Status - Subtle Info */}
                {automationStatus && (
                  <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded border border-border">
                    {automationStatus === 'Follow-ups cancelled after customer reply' 
                      ? 'Follow-ups stopped after customer replied'
                      : automationStatus
                    }
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 pb-8">
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          {/* Message Thread */}
          <div ref={conversationContainerRef} className="p-2.5 sm:p-6 min-h-[300px] sm:min-h-[400px] max-h-[calc(100vh-250px)] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : messagesArray.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">💬</div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  No messages yet
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2 max-w-md mx-auto">
                  Messages will appear here after missed calls, replies, or manual sends.
                </p>
                <p className="text-xs text-muted-foreground">
                  Start the conversation by sending a message below.
                </p>
              </div>
            ) : (
              <MobileConversationMessageList
                messagesArray={messagesArray}
                sending={sending}
                handleRetry={handleRetry}
                getErrorMessage={getErrorMessage}
              />
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
          <MobileConversationComposer
            message={message}
            setMessage={setMessage}
            handleSendMessage={handleSendMessage}
            sending={sending}
          />
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

        {/* Success Message */}
        {successMessage && (
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
          </div>
        )}

        {/* Scheduled Follow-ups */}
        <MobileFollowUpSummary followUpJobs={followUpJobs} />

      </div>

      {/* Ignore Contact Modal */}
      {showIgnoreModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Ignore this contact?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              ReplyFlow will stop creating leads, sending automatic messages, and scheduling follow-ups for this number.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowIgnoreModal(false)}
                disabled={isIgnoring}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary hover:bg-secondary/80 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleIgnoreContact}
                disabled={isIgnoring}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isIgnoring ? (
                  <>
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent border-solid inline-block mr-2"></div>
                    Ignoring...
                  </>
                ) : (
                  'Ignore Contact'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Lead Modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Remove this lead?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              This will remove the lead from your active inbox. Conversation history may still be kept for your records.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRemoveModal(false)}
                disabled={isRemoving}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary hover:bg-secondary/80 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveLead}
                disabled={isRemoving}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRemoving ? (
                  <>
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent border-solid inline-block mr-2"></div>
                    Removing...
                  </>
                ) : (
                  'Remove Lead'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
