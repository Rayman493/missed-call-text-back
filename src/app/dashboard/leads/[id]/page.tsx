'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import ConversationComposer from '@/components/ConversationComposer'
import MobileConversationComposer from '@/components/MobileConversationComposer'
import AutomaticFollowUpsControl from '@/components/AutomaticFollowUpsControl'
import MobileConversationMessageList from '@/components/MobileConversationMessageList'
import DesktopConversationMessageList from '@/components/DesktopConversationMessageList'
import MobileMenu from '@/components/MobileMenu'
import AppHeader from '@/components/AppHeader'
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
  const [showCustomerInfoModal, setShowCustomerInfoModal] = useState(false)
  const [mobileCustomerExpanded, setMobileCustomerExpanded] = useState(true)
  const [mobileLeadDetailsExpanded, setMobileLeadDetailsExpanded] = useState(false)
  const [mobileActionsExpanded, setMobileActionsExpanded] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)
  
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

  // Handle image load for latest message - scroll after image loads
  const handleImageLoad = () => {
    // Scroll to bottom after image load to ensure full image is visible
    scrollToBottom('auto', true)
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

  // Create combined timeline with messages and voicemail recordings
  const conversationTimeline = useMemo(() => {
    const messages = allMessages || []
    const voicemails = leadData?.voicemailRecordings || []
    
    // Convert voicemails to timeline items
    const voicemailItems = voicemails.map((voicemail: any) => ({
      type: 'voicemail',
      id: voicemail.id,
      created_at: voicemail.created_at,
      data: voicemail
    }))
    
    // Convert messages to timeline items
    const messageItems = messages.map((message: any) => ({
      type: 'message',
      id: message.id,
      created_at: message.created_at,
      data: message
    }))
    
    // Combine and sort chronologically
    const timeline = [...messageItems, ...voicemailItems].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    
    return timeline
  }, [allMessages, leadData?.voicemailRecordings])
  
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

  // Track viewport size for conditional rendering
  useEffect(() => {
    const checkViewport = () => {
      setIsMobileView(window.innerWidth < 1024) // lg breakpoint
    }
    
    checkViewport()
    window.addEventListener('resize', checkViewport)
    
    return () => window.removeEventListener('resize', checkViewport)
  }, [])

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

  return (
    <main className="min-h-screen bg-background flex flex-col">
      {/* Standard App Header */}
      <AppHeader />

      {/* Conversation Sub-Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3">
          {/* Mobile Layout: Messaging App Header */}
          <div className="md:hidden">
            <div className="flex items-center justify-between">
              {/* Back + Phone */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Link
                  href="/dashboard/leads"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors p-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <div className="flex-1 min-w-0">
                  <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-tight truncate">
                    {formatPhoneNumber(lead?.caller_phone || '')}
                  </h1>
                  {/* Small Status Badge */}
                  <div className="mt-0.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getLeadStatusClasses(getLeadLifecycleStatus(leadData))}`}>
                      {getLeadStatusLabel(getLeadLifecycleStatus(leadData))}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Info Button */}
              <button
                onClick={() => setShowLeadInfo(!showLeadInfo)}
                className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
                title="Lead information"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Desktop Layout: Enhanced */}
          <div className="hidden md:block">
            {/* Back to Leads */}
            <div className="mb-3 sm:mb-4">
              <Link
                href="/dashboard/leads"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Leads
              </Link>
            </div>

            {/* Lead Identity Section - Desktop Enhanced */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {/* Lead Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex flex-col gap-1">
                    {leadData?.contact_name && (
                      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-tight truncate">
                        {leadData.contact_name}
                      </h1>
                    )}
                    <h2 className="text-xl sm:text-2xl font-medium text-slate-700 dark:text-slate-300 leading-tight truncate">
                      {formatPhoneNumber(lead?.caller_phone || '')}
                    </h2>
                  </div>
                  
                  {/* Modern Status Badge */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium border ${getLeadStatusClasses(getLeadLifecycleStatus(leadData))}`}>
                      {getLeadStatusLabel(getLeadLifecycleStatus(leadData))}
                    </span>
                  </div>
                </div>
                
                {/* Company Name */}
                {leadData?.company_name && (
                  <div className="mb-3">
                    <p className="text-base text-slate-600 dark:text-slate-400 truncate">
                      {leadData.company_name}
                    </p>
                  </div>
                )}
                
                {/* Enhanced Lead Meta */}
                <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">Created {formatRelativeTime(lead?.created_at)}</span>
                  </div>
                  {lead?.last_message_at && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span className="font-medium">Last Activity {formatRelativeTime(lead.last_message_at)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    <span className="font-medium">{messagesArray.length} Messages</span>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Refresh Button */}
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="w-10 h-10 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200 disabled:opacity-50 hover:shadow-md border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 flex items-center justify-center"
                  title="Refresh conversation"
                >
                  {refreshing ? (
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"></div>
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
                    className="w-10 h-10 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200 hover:shadow-md border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 flex items-center justify-center"
                    title="More actions"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                  
                  {showMoreActions && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                      {getLeadLifecycleStatus(leadData) !== 'completed' && (
                        <button
                          onClick={() => {
                            handleStatusUpdate('completed')
                            setShowMoreActions(false)
                          }}
                          disabled={isCompleting}
                          className="w-full px-3 py-1.5 text-left text-xs text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                        disabled={isIgnoring}
                        className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isIgnoring ? (
                          <>
                            <div className="w-3 h-3 animate-spin rounded-full border border-red-400 border-t-transparent"></div>
                            <span>Ignoring...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span>Ignore Contact</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowRemoveModal(true)
                          setShowMoreActions(false)
                        }}
                        className="w-full px-3 py-1.5 text-left text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        Remove Lead
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conversation Thread - Conditional Rendering */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-2 sm:py-3 lg:py-4">
        {isMobileView ? (
          /* Mobile Layout - Single Column */
          <div className="bg-card rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 border border-border overflow-hidden">
            {/* Mobile Quick Actions Bar */}
            <div className="border-b border-border/50 px-3 py-2.5 bg-background/50">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => window.open(`tel:${leadData?.phone_number}`, '_self')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors flex-shrink-0"
                  title="Call customer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z" />
                  </svg>
                  <span>Call</span>
                </button>
                <button
                  onClick={() => {
                    const composer = document.querySelector('textarea')
                    if (composer) composer.focus()
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full transition-colors border border-blue-200 dark:border-blue-800 flex-shrink-0"
                  title="Send text message"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03 8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span>Text</span>
                </button>
                <button
                  onClick={() => setShowCustomerInfoModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-gray-900/20 hover:bg-gray-100 dark:hover:bg-gray-900/30 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-full transition-colors border border-gray-200 dark:border-gray-800 flex-shrink-0"
                  title="Add note"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Note</span>
                </button>
                <button
                  onClick={() => setShowLeadInfo(!showLeadInfo)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-gray-900/20 hover:bg-gray-100 dark:hover:bg-gray-900/30 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-full transition-colors border border-gray-200 dark:border-gray-800 flex-shrink-0"
                  title="Lead details"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Details</span>
                </button>
              </div>
            </div>
            
            {/* Message Thread */}
            <div ref={conversationContainerRef} className="p-3 sm:p-4 lg:p-5 overflow-y-auto scroll-smooth pb-4" style={{ minHeight: '200px', maxHeight: 'calc(100dvh - 320px)' }}>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : messagesArray.length === 0 ? (
                <div className="text-center py-8 sm:py-12 animate-fadeIn">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-blue-200 dark:border-blue-800">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">
                    Start the conversation
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Send your first message to connect with this customer.
                  </p>
                </div>
              ) : (
                <MobileConversationMessageList
                  messagesArray={messagesArray}
                  conversationTimeline={conversationTimeline}
                  sending={sending}
                  handleRetry={handleRetry}
                  getErrorMessage={getErrorMessage}
                  onImageLoad={handleImageLoad}
                />
              )}
            </div>

            {/* Send Message Input */}
            <div className="shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-sm">
              <MobileConversationComposer
                message={message}
                setMessage={setMessage}
                handleSendMessage={handleSendMessage}
                sending={sending}
              />
            </div>
            {error && (
              <div className={`text-sm p-3 rounded-lg border mx-4 mb-3 ${
                error.includes('verification') || error.includes('carrier')
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
              }`}>
                <p>{error}</p>
              </div>
            )}
          </div>
        ) : (
          /* Desktop Layout - 2 Column */
          <div className="flex gap-6">
            {/* Left Column - Conversation (70%) */}
            <div className="flex-[0.7] bg-card rounded-xl shadow-md hover:shadow-lg transition-all duration-300 border border-border/50 overflow-hidden flex flex-col min-h-[400px] max-h-[calc(100vh-320px)]">
              {/* Quick Actions Bar */}
              <div className="border-b border-border/50 px-4 sm:px-5 lg:px-6 py-3 bg-background/50">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.open(`tel:${leadData?.phone_number}`, '_self')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    title="Call customer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z" />
                    </svg>
                    <span className="hidden sm:inline">Call</span>
                  </button>
                  <button
                    onClick={() => {
                      const composer = document.querySelector('textarea')
                      if (composer) composer.focus()
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium rounded-lg transition-colors border border-blue-200 dark:border-blue-800"
                    title="Send text message"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="hidden sm:inline">Send Text</span>
                  </button>
                  <button
                    onClick={() => setShowCustomerInfoModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-900/20 hover:bg-gray-100 dark:hover:bg-gray-900/30 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors border border-gray-200 dark:border-gray-800"
                    title="Add note"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className="hidden sm:inline">Add Note</span>
                  </button>
                  <button
                    disabled={true}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-900/20 text-gray-400 dark:text-gray-600 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-800 cursor-not-allowed"
                    title="Coming Soon"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="hidden sm:inline">Follow-Up</span>
                  </button>
                </div>
              </div>
              {/* Message Thread */}
              <div ref={conversationContainerRef} className="flex-1 p-4 sm:p-5 lg:p-6 overflow-y-auto overflow-x-hidden scroll-smooth">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : messagesArray.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 animate-fadeIn">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-blue-200 dark:border-blue-800">
                      <svg className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">
                      Start the conversation
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      Send your first message to connect with this customer.
                    </p>
                  </div>
                ) : (
                  <DesktopConversationMessageList
                    messagesArray={messagesArray}
                    conversationTimeline={conversationTimeline}
                    sending={sending}
                    handleRetry={handleRetry}
                    getErrorMessage={getErrorMessage}
                    onImageLoad={handleImageLoad}
                  />
                )}
              </div>

              {/* Send Message Input */}
              <div className="shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-sm">
                <MobileConversationComposer
                  message={message}
                  setMessage={setMessage}
                  handleSendMessage={handleSendMessage}
                  sending={sending}
                />
              </div>
              {error && (
                <div className={`text-sm p-3 rounded-lg border mx-4 mb-3 ${
                  error.includes('verification') || error.includes('carrier')
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}>
                  <p>{error}</p>
                </div>
              )}
            </div>

            {/* Right Column - Simplified Lead Panel (30%) */}
            <div className="flex-[0.3] overflow-y-auto space-y-2" data-sidebar>
            {/* Customer Information Card */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Customer Details</h3>
                <button
                  onClick={() => setShowCustomerInfoModal(true)}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                >
                  Edit
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Phone</span>
                  <span className="text-sm font-medium text-foreground">{formatPhoneNumber(leadData?.phone_number || lead?.caller_phone)}</span>
                </div>
                {leadData?.contact_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Name</span>
                    <span className="text-sm font-medium text-foreground">{leadData.contact_name}</span>
                  </div>
                )}
                {leadData?.company_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Company</span>
                    <span className="text-sm font-medium text-foreground">{leadData.company_name}</span>
                  </div>
                )}
                {leadData?.tags && leadData.tags.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Tags</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {leadData.tags.map((tag: string, index: number) => (
                        <span key={index} className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 text-xs rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {leadData?.notes && (
                  <div>
                    <span className="text-xs text-muted-foreground">Notes</span>
                    <p className="text-sm text-foreground mt-1 line-clamp-3">{leadData.notes}</p>
                  </div>
                )}
                {!leadData?.contact_name && !leadData?.company_name && !leadData?.tags && !leadData?.notes && (
                  <div className="text-center py-2">
                    <p className="text-xs text-muted-foreground">No customer details added yet.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Lead Health Card */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Lead Health</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div className="flex-shrink-0">
                    <LeadStatusDropdown 
                      currentStatus={leadData?.status || 'new'} 
                      onStatusChange={async (newStatus) => {
                        // Handle status change if needed
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Messages</span>
                  <span className="text-sm font-medium text-foreground">{messagesArray.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Voicemails</span>
                  <span className="text-sm font-medium text-foreground">{leadData?.voicemailRecordings?.length || 0}</span>
                </div>
                {leadData?.last_message_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Last Activity</span>
                    <span className="text-sm text-foreground">{formatRelativeTime(leadData.last_message_at)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Follow-Up Automation Section */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Follow-Up Automation</h3>
              <div className="space-y-3">
                {followUpJobs?.find((job: any) => job.status === 'pending') ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Next Follow-Up</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatRelativeTime(followUpJobs.find((job: any) => job.status === 'pending').scheduled_at)}
                      </span>
                    </div>
                    <button className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                      Edit Follow-Ups
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-center py-2">
                      <p className="text-xs text-muted-foreground">No active follow-ups</p>
                    </div>
                    <button className="w-full px-3 py-2 border border-border hover:bg-muted text-foreground text-sm font-medium rounded-lg transition-colors">
                      Configure Follow-Ups
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Actions Card */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => window.open(`tel:${leadData?.phone_number}`, '_self')}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Call Lead
                </button>
                <button
                  onClick={() => setShowLeadInfo(true)}
                  className="w-full px-3 py-2 border border-border hover:bg-muted text-foreground text-sm font-medium rounded-lg transition-colors"
                >
                  View Full Details
                </button>
                <button
                  className="w-full px-3 py-2 border border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg transition-colors"
                >
                  Mark Closed
                </button>
                <button
                  className="w-full px-3 py-2 border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg transition-colors"
                >
                  Block Contact
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Mobile Layout - Single Column - Disabled to prevent duplicate audio elements */}
        {false && (
        <div className="lg:hidden">
          <div className="bg-card rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 border border-border overflow-hidden">
            {/* Message Thread */}
            <div ref={conversationContainerRef} className="p-4 sm:p-5 lg:p-6 overflow-y-auto scroll-smooth" style={{ minHeight: '200px', maxHeight: 'calc(100vh - 280px)' }}>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : messagesArray.length === 0 ? (
                <div className="text-center py-8 sm:py-12 animate-fadeIn">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-blue-200 dark:border-blue-800">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">
                    Start the conversation
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Send your first message to connect with this customer.
                  </p>
                </div>
              ) : (
                <MobileConversationMessageList
                  messagesArray={messagesArray}
                  conversationTimeline={conversationTimeline}
                  sending={sending}
                  handleRetry={handleRetry}
                  getErrorMessage={getErrorMessage}
                  onImageLoad={handleImageLoad}
                />
              )}
            </div>

            {/* Send Message Input */}
            <div className="shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-sm">
              <MobileConversationComposer
                message={message}
                setMessage={setMessage}
                handleSendMessage={handleSendMessage}
                sending={sending}
              />
            </div>
            {error && (
              <div className={`text-sm p-3 rounded-lg border mx-4 mb-3 ${
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
            <div className="mt-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
            </div>
          )}

          {/* Mobile Collapsible Sections */}
          <div className="mt-6 space-y-3">
            {/* Customer Information Section */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setMobileCustomerExpanded(!mobileCustomerExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Customer Information</h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCustomerInfoModal(true)
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                  >
                    Edit
                  </button>
                </div>
                <svg
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    mobileCustomerExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {mobileCustomerExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  {leadData?.contact_name ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Name</span>
                      <span className="text-sm font-medium text-foreground">{leadData.contact_name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Name</span>
                      <span className="text-sm text-muted-foreground">Not set</span>
                    </div>
                  )}
                  {leadData?.company_name ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Company</span>
                      <span className="text-sm font-medium text-foreground">{leadData.company_name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Company</span>
                      <span className="text-sm text-muted-foreground">Not set</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Phone</span>
                    <span className="text-sm font-medium text-foreground">{formatPhoneNumber(leadData?.phone_number || lead?.caller_phone)}</span>
                  </div>
                  {leadData?.tags && leadData.tags.length > 0 ? (
                    <div>
                      <span className="text-xs text-muted-foreground">Tags</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {leadData.tags.map((tag: string, index: number) => (
                          <span key={index} className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 text-xs rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Tags</span>
                      <span className="text-sm text-muted-foreground">None</span>
                    </div>
                  )}
                  {leadData?.notes ? (
                    <div>
                      <span className="text-xs text-muted-foreground">Notes</span>
                      <p className="text-sm text-foreground mt-1 line-clamp-3">{leadData.notes}</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Notes</span>
                      <span className="text-sm text-muted-foreground">None</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Lead Details Section */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setMobileLeadDetailsExpanded(!mobileLeadDetailsExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
              >
                <h3 className="text-sm font-semibold text-foreground">Lead Details</h3>
                <svg
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    mobileLeadDetailsExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {mobileLeadDetailsExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <div className="flex-shrink-0">
                      <LeadStatusDropdown 
                        currentStatus={leadData?.status || 'new'} 
                        onStatusChange={async (newStatus) => {
                          // Handle status change if needed
                        }}
                      />
                    </div>
                  </div>
                  {leadData?.created_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Created</span>
                      <span className="text-sm text-foreground">{formatRelativeTime(leadData.created_at)}</span>
                    </div>
                  )}
                  {leadData?.last_message_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Last Activity</span>
                      <span className="text-sm text-foreground">{formatRelativeTime(leadData.last_message_at)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Messages</span>
                    <span className="text-sm text-foreground">{messagesArray.length}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions Section */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setMobileActionsExpanded(!mobileActionsExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
              >
                <h3 className="text-sm font-semibold text-foreground">Actions</h3>
                <svg
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    mobileActionsExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {mobileActionsExpanded && (
                <div className="px-4 pb-4 space-y-2">
                  <button
                    onClick={() => window.open(`tel:${leadData?.phone_number}`, '_self')}
                    className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Call Lead
                  </button>
                  <button
                    onClick={() => setShowLeadInfo(true)}
                    className="w-full px-3 py-2 border border-border hover:bg-muted text-foreground text-sm font-medium rounded-lg transition-colors"
                  >
                    View Full Details
                  </button>
                  <button
                    className="w-full px-3 py-2 border border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg transition-colors"
                  >
                    Mark Closed
                  </button>
                  <button
                    className="w-full px-3 py-2 border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg transition-colors"
                  >
                    Block Contact
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Automatic Follow-ups */}
          <div className="mt-6 sm:mt-8 lg:mt-10">
            <AutomaticFollowUpsControl 
              followUpJobs={followUpJobs} 
              leadId={params.id}
              onUpdate={() => {
                // Refresh lead data to show updated follow-ups
                getLeadDetails(params.id).then(setLeadData)
              }}
            />
          </div>
        </div>
        )}
      </div>

      {/* Mobile Bottom Sheet for Lead Details */}
      {showLeadInfo && (
        <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl w-full max-h-[80vh] overflow-hidden animate-slide-up">
            {/* Handle */}
            <div className="flex justify-center py-2">
              <div className="w-12 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
            </div>
            
            {/* Header */}
            <div className="px-4 pb-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Lead Details</h3>
                <button
                  onClick={() => setShowLeadInfo(false)}
                  className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="px-4 py-4 overflow-y-auto max-h-[60vh]">
              {/* Contact Information */}
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white">{formatPhoneNumber(lead?.caller_phone || '')}</h4>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getLeadStatusClasses(getLeadLifecycleStatus(leadData))}`}>
                      {getLeadStatusLabel(getLeadLifecycleStatus(leadData))}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Created</span>
                    <span className="text-slate-900 dark:text-white font-medium">{formatRelativeTime(lead?.created_at)}</span>
                  </div>
                  {lead?.last_message_at && (
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Last activity</span>
                      <span className="text-slate-900 dark:text-white font-medium">{formatRelativeTime(lead.last_message_at)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Messages</span>
                    <span className="text-slate-900 dark:text-white font-medium">{messagesArray.length}</span>
                  </div>
                </div>
              </div>
              
              {/* System Information */}
              <div className="space-y-4 mb-6">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">System Details</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">ReplyFlow number</span>
                    <span className="text-slate-900 dark:text-white font-medium font-mono">{formatPhoneNumber(business?.twilio_phone_number || '')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Business number</span>
                    <span className="text-slate-900 dark:text-white font-medium font-mono">{formatPhoneNumber(business?.business_phone_number || '')}</span>
                  </div>
                </div>
              </div>
              
              {/* Follow-up Status */}
              {automationStatus && (
                <div className="space-y-4 mb-6">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Automation Status</h4>
                  <div className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                    {automationStatus === 'Follow-ups cancelled after customer reply' 
                      ? 'Follow-ups automatically paused after customer replied'
                      : automationStatus
                    }
                  </div>
                </div>
              )}
            </div>
            
            {/* Actions */}
            <div className="px-4 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLeadInfo(false)}
                  className="flex-1 px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Modal for Lead Details */}
      {showLeadInfo && (
        <div className="hidden md:block fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Lead Information
            </h3>
            
            {/* Lead Information */}
            <div className="space-y-4">
              {/* Contact Information */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Contact Information
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone:</span>
                    <span className="font-mono">{formatPhoneNumber(lead?.caller_phone || '')}</span>
                  </div>
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Messages:</span>
                    <span>{messagesArray.length}</span>
                  </div>
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
            
            {/* Actions */}
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowLeadInfo(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleIgnoreContact}
                disabled={isIgnoring}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
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
              This will permanently remove this lead and all associated messages. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRemoveModal(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveLead}
                disabled={isRemoving}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
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

      {/* Edit Customer Info Modal */}
      {showCustomerInfoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Edit Customer Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={leadData?.contact_name || ''}
                  onChange={(e) => setLeadData((prev: any) => ({ ...prev, contact_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-background"
                  placeholder="Enter contact name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={leadData?.company_name || ''}
                  onChange={(e) => setLeadData((prev: any) => ({ ...prev, company_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-background"
                  placeholder="Enter company name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  value={leadData?.tags?.join(', ') || ''}
                  onChange={(e) => setLeadData((prev: any) => ({ 
                    ...prev, 
                    tags: e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
                  }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-background"
                  placeholder="Enter tags separated by commas"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separate multiple tags with commas
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Notes
                </label>
                <textarea
                  value={leadData?.notes || ''}
                  onChange={(e) => setLeadData((prev: any) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-background resize-none"
                  rows={3}
                  placeholder="Enter notes about this customer"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowCustomerInfoModal(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // Save customer info
                  const supabase = createBrowserClient()
                  const { data: { session } } = await supabase.auth.getSession()
                  const headers: HeadersInit = { 'Content-Type': 'application/json' }
                  if (session?.access_token) {
                    headers['Authorization'] = `Bearer ${session.access_token}`
                  }

                  try {
                    const response = await fetch(`/api/leads/${lead?.id}`, {
                      method: 'PUT',
                      headers,
                      body: JSON.stringify({
                        contact_name: leadData?.contact_name || null,
                        company_name: leadData?.company_name || null,
                        tags: leadData?.tags || [],
                        notes: leadData?.notes || null
                      })
                    })

                    if (response.ok) {
                      setShowCustomerInfoModal(false)
                      // Refresh lead data
                      const updatedData = await getLeadDetails(lead?.id)
                      if (updatedData) {
                        setLeadData(updatedData)
                      }
                    }
                  } catch (error) {
                    console.error('Error saving customer info:', error)
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
