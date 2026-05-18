'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import ConversationComposer from '@/components/ConversationComposer'
import MobileConversationComposer from '@/components/MobileConversationComposer'
import MobileFollowUpSummary from '@/components/MobileFollowUpSummary'
import MobileConversationMessageList from '@/components/MobileConversationMessageList'
import MobileMenu from '@/components/MobileMenu'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber, formatRelativeTime, getLeadStatusColor } from '@/lib/utils'
import { getLeadLifecycleStatus, getLeadStatusClasses, getLeadStatusLabel, LeadLifecycleStatus } from '@/lib/lead-lifecycle'
import Link from 'next/link'
import { Lead, Message, Conversation } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { RealtimeChannel } from '@supabase/supabase-js'
import LeadStatusDropdown from '@/components/LeadStatusDropdown'

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
  const { business } = useBusiness()
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
  const [isCompleting, setIsCompleting] = useState(false)

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

  // Handle status update (unified handler)
  const handleStatusUpdate = async (newStatus: LeadLifecycleStatus) => {
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      // Update lead status
      const response = await fetch(`/api/leads/${params.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: newStatus
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || `Failed to update lead status to ${newStatus}`)
      }

      // Update local state
      setLeadData((prev: any) => ({
        ...prev,
        lead_status: newStatus,
        updated_at: new Date().toISOString()
      }))

      // Show success message
      const statusMessages = {
        completed: 'Lead marked as complete',
        ignored: 'Lead ignored',
        active: 'Lead marked as active',
        new: 'Lead reset to new'
      }
      setSuccessMessage(statusMessages[newStatus] || `Lead status updated to ${newStatus}`)
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('')
      }, 3000)
      
    } catch (error) {
      console.error('Error updating lead status:', error)
      setError(error instanceof Error ? error.message : `Failed to update lead status`)
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
      {/* Enhanced Header */}
      <div className="sticky top-0 z-10 bg-slate-900 dark:bg-slate-800/95 border-b border-slate-800 dark:border-slate-700 backdrop-blur-sm shadow-lg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          {/* Lead Identity Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Lead Info */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {/* Mobile menu */}
              <div className="md:hidden">
                <MobileMenu />
              </div>
              
              {/* Brand/Back */}
              <div className="flex items-center gap-3">
                <Link href="/dashboard" className="flex items-center hover:opacity-90 transition flex-shrink-0 group">
                  <span className="text-lg md:text-xl font-semibold tracking-tight group-hover:scale-105 transition-transform duration-200">
                    <span className="text-white">Reply</span>
                    <span className="text-blue-400">Flow</span>
                  </span>
                </Link>
                
                {/* Desktop Back */}
                <div className="hidden md:flex items-center">
                  <Link
                    href="/dashboard"
                    className="flex-shrink-0 text-gray-400 hover:text-white transition-colors p-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </Link>
                </div>
              </div>
              
              {/* Lead Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight truncate">
                    {formatPhoneNumber(lead?.caller_phone || '')}
                  </h1>
                  
                  {/* Status Badges */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getLeadStatusClasses(getLeadLifecycleStatus(leadData))}`}>
                      {getLeadStatusLabel(getLeadLifecycleStatus(leadData))}
                    </span>
                    {hasInboundReply && (
                      <span className="px-2 py-1 bg-green-900/40 text-green-300 rounded-full text-xs font-medium flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                        Active
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Lead Meta */}
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>Created {formatRelativeTime(lead?.created_at)}</span>
                  {lead?.last_message_at && (
                    <span>Last activity {formatRelativeTime(lead.last_message_at)}</span>
                  )}
                  {/* Operational Status */}
                  <div className="flex items-center gap-1">
                    {getLeadLifecycleStatus(leadData) === 'completed' && (
                      <span className="px-2 py-0.5 bg-green-900/40 text-green-300 rounded-full text-xs font-medium flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                        Lead handled
                      </span>
                    )}
                    {getLeadLifecycleStatus(leadData) === 'active' && hasInboundReply && (
                      <span className="px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full text-xs font-medium flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
                        Awaiting reply
                      </span>
                    )}
                    {getLeadLifecycleStatus(leadData) === 'new' && (
                      <span className="px-2 py-0.5 bg-orange-900/40 text-orange-300 rounded-full text-xs font-medium flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse"></div>
                        New lead
                      </span>
                    )}
                    {automationStatus && (
                      <span className="text-blue-400">{automationStatus}</span>
                    )}
                  </div>
                </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Primary Action - Status Dropdown */}
              <LeadStatusDropdown
                currentStatus={getLeadLifecycleStatus(leadData)}
                onStatusChange={handleStatusUpdate}
                disabled={isCompleting || isIgnoring || isRemoving}
                size="md"
              />
              
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-110 active:scale-95"
                title="Refresh"
              >
                {refreshing ? (
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>
              
              {/* More Actions */}
              <div className="relative">
                <button
                  onClick={() => setShowMoreActions(!showMoreActions)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
                  title="More actions"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
                
                {showMoreActions && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-card rounded-lg shadow-lg border border-border py-1 z-50">
                    {getLeadLifecycleStatus(leadData) !== 'completed' && (
                      <button
                        onClick={() => {
                          handleStatusUpdate('completed')
                          setShowMoreActions(false)
                        }}
                        disabled={isCompleting}
                        className="w-full px-3 py-1.5 text-left text-xs text-green-400 dark:text-green-400 hover:bg-green-900/20 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isCompleting ? (
                          <>
                            <div className="w-3 h-3 animate-spin rounded-full border border-green-400 border-t-transparent"></div>
                            <span>Completing...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Mark Complete</span>
                          </>
                        )}
                      </button>
                    )}
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
          
          {/* Enhanced Details Section */}
          <div className="mt-2 sm:mt-3 border-t border-border pt-3">
            <button
              onClick={() => setShowLeadInfo(!showLeadInfo)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
            >
              <svg
                className={`w-4 h-4 transition-transform duration-300 ${showLeadInfo ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7m7 7V3" />
              </svg>
              <span className="font-medium group-hover:text-blue-400 transition-colors">
                {showLeadInfo ? 'Hide lead details' : 'Show lead details'}
              </span>
            </button>
            
            {showLeadInfo && (
              <div className="mt-4 bg-muted/30 rounded-xl p-4 border border-border/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Lead Information */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Lead Information
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getLeadStatusClasses(getLeadLifecycleStatus(leadData))}`}>
                          {getLeadStatusLabel(getLeadLifecycleStatus(leadData))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Created:</span>
                        <span>{formatRelativeTime(lead?.created_at)}</span>
                      </div>
                      {lead?.last_message_at && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last activity:</span>
                          <span>{formatRelativeTime(lead.last_message_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* System Information */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      System Details
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ReplyFlow number:</span>
                        <span className="font-mono">{formatPhoneNumber(business?.twilio_phone_number || '')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Business number:</span>
                        <span className="font-mono">{formatPhoneNumber(business?.business_phone_number || '')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Customer number:</span>
                        <span className="font-mono">{formatPhoneNumber(lead?.caller_phone || '')}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Follow-up Status */}
                {automationStatus && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2 text-xs">
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium text-foreground">Automation Status</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground bg-background rounded-lg p-2 border border-border">
                      {automationStatus === 'Follow-ups cancelled after customer reply' 
                        ? 'Follow-ups automatically paused after customer replied'
                        : automationStatus
                      }
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6">
        <div className="bg-card rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 border border-border overflow-hidden flex flex-col">
          {/* Message Thread */}
          <div ref={conversationContainerRef} className="flex-1 p-4 sm:p-8 min-h-[400px] sm:min-h-[500px] max-h-[calc(100vh-280px)] overflow-y-auto scroll-smooth">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : messagesArray.length === 0 ? (
              <div className="text-center py-16 animate-fadeIn">
                <div className="text-5xl mb-4 animate-bounce">💬</div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  No messages yet
                </h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Messages will appear here after missed calls, replies, or manual sends.
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                    Start the conversation by sending a message below
                  </p>
                </div>
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
            className="fixed bottom-24 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 animate-bounce"
            aria-label="Jump to latest message"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}

          {/* Send Message Input */}
          <div className="border-t border-border bg-card/50 backdrop-blur-sm">
            <MobileConversationComposer
              message={message}
              setMessage={setMessage}
              handleSendMessage={handleSendMessage}
              sending={sending}
            />
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

        {/* Success Message */}
        {successMessage && (
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
          </div>
        )}

        {/* Scheduled Follow-ups */}
        <MobileFollowUpSummary followUpJobs={followUpJobs} />

      </div>
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
