'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import ConversationComposer from '@/components/ConversationComposer'
import MobileConversationComposer from '@/components/MobileConversationComposer'
import AutomaticFollowUpsControl from '@/components/AutomaticFollowUpsControl'
import MobileConversationMessageList from '@/components/MobileConversationMessageList'
import DesktopConversationMessageList from '@/components/DesktopConversationMessageList'
import MobileMenu from '@/components/MobileMenu'
import AppHeader from '@/components/AppHeader'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber, formatRelativeTime, getLeadStatusColor, getLeadDisplayName } from '@/lib/utils'
import { getLeadLifecycleStatus, getLeadStatusClasses, getLeadStatusLabel, LeadLifecycleStatus } from '@/lib/lead-lifecycle'
import { copyToClipboard } from '@/lib/clipboard'
import { calculateLeadTiming, getCustomerInfoForCopy, getAISummaryForCopy } from '@/lib/lead-timing'
import Link from 'next/link'
import { Lead, Message, Conversation } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { RealtimeChannel } from '@supabase/supabase-js'
import LeadStatusDropdown from '@/components/LeadStatusDropdown'
import AICallDetails from '@/components/AICallDetails'
import VoicemailSummary from '@/components/VoicemailSummary'
import { ImageMessage } from '@/components/ImageMessage'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import PhotoModal from '@/components/PhotoModal'
import { HelpContext } from '@/components/HelpAssistant'
import EventComposer from '@/components/calendar/EventComposer'

function getErrorMessage(errorCode: string): string {
  // Only show user-friendly messages for known error codes
  if (errorCode === '30007') {
    return 'Phone setup still pending. Delivery may fail until approved.'
  }
  if (errorCode === '21614') {
    return 'This number is not a valid mobile number.'
  }
  if (errorCode === '21612') {
    return 'Phone number not enabled for SMS.'
  }
  // Never expose technical error codes or UNKNOWN to users
  return 'We couldn\'t send this message. Please try again.'
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
  const [mobileInternalNotesExpanded, setMobileInternalNotesExpanded] = useState(false)
  const latestMessageRef = useRef<HTMLDivElement>(null)
  const [mobileLeadHealthExpanded, setMobileLeadHealthExpanded] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)
  const [messageMedia, setMessageMedia] = useState<Record<string, { urls: string[]; types: string[] }>>({})
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState({
    photos: true,
    activity: true,
    automation: true,
    leadHealth: false,
    quickActions: true,
    aiIntake: false
  })
  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState('')
  const [mobileImages, setMobileImages] = useState<File[]>([])
  const mobileFileInputRef = useRef<HTMLInputElement>(null)
  const clearComposerImagesRef = useRef<(() => void) | null>(null)
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false)

  // Realtime subscription management
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createBrowserClient()

  // ALL hooks must must be declared here before any conditional returns
  // Auto-scroll to newest message with jump button logic
  const [showJumpButton, setShowJumpButton] = useState(false)
  const [hasScrolledToBottomOnLoad, setHasScrolledToBottomOnLoad] = useState(false)
  const [initialScrollReady, setInitialScrollReady] = useState(false)
  const [internalNotes, setInternalNotes] = useState(leadData?.notes || '')
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [showLeadInfo, setShowLeadInfo] = useState(false)
  const conversationContainerRef = useRef<HTMLDivElement>(null)
  const mobileConversationContainerRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  const isInitialAutoScrollingRef = useRef(false)
  
  // Close more actions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMoreActions) {
        setShowMoreActions(false)
      }
    }
    
    // Guard against SSR
    if (typeof document !== 'undefined') {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMoreActions])
  
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth', force = false, isInitialLoad = false) => {
    // Guard against SSR
    if (typeof window === 'undefined') {
      return
    }

    // Get the correct container based on viewport size
    const isDesktop = window.innerWidth >= 1024
    const container = isDesktop ? conversationContainerRef.current : mobileConversationContainerRef.current
    
    if (!container) {
      return
    }

    // Only scroll if user is near bottom (within 200px) or if forced
    const scrollThreshold = 200
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= scrollThreshold

    // Force scroll on initial load regardless of scroll position
    if (force || isInitialLoad || isNearBottom || behavior === 'auto') {
      requestAnimationFrame(() => {
        // Scroll to sentinel if available, otherwise to bottom
        if (bottomSentinelRef.current) {
          bottomSentinelRef.current.scrollIntoView({ behavior, block: 'end' })
        } else {
          container.scrollTo({
            top: container.scrollHeight,
            behavior
          })
        }
        setShowJumpButton(false)
        if (isInitialLoad) {
          setHasScrolledToBottomOnLoad(true)
        }
      })
    } else if (!force) {
      // Show jump button if user scrolled up and new message arrives
      setShowJumpButton(true)
    }
  }

  // Handle image load for latest message - scroll after image loads
  const handleSaveNotes = async () => {
    if (!lead?.id) return
    setIsSavingNotes(true)
    try {
      const { error } = await supabase
        .from('leads')
        .update({ notes: internalNotes })
        .eq('id', lead.id)
      if (error) throw error
    } catch (error) {
      console.error('Failed to save notes:', error)
    } finally {
      setIsSavingNotes(false)
    }
  }

  const handleImageLoad = () => {
    // Scroll to bottom after image load to ensure full image is visible
    scrollToBottom('auto', true)
  }

  const validateImageFile = (file: File): { valid: boolean; error?: string } => {
    // Check file type - Twilio MMS only supports JPEG, PNG, GIF
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
    if (!validTypes.includes(file.type)) {
      return { valid: false, error: 'WEBP images are not supported for MMS. Please upload a JPG or PNG.' }
    }

    // Check file size (5MB max)
    const maxSize = 5 * 1024 * 1024 // 5MB in bytes
    if (file.size > maxSize) {
      return { valid: false, error: 'Image must be less than 5MB' }
    }

    return { valid: true }
  }

  const handleMobileImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const validFiles: File[] = []
    const errors: string[] = []

    // Check max 10 images total
    if (mobileImages.length + files.length > 10) {
      setError('Maximum 10 images allowed')
      return
    }

    Array.from(files).forEach(file => {
      const validation = validateImageFile(file)
      if (validation.valid) {
        validFiles.push(file)
      } else {
        errors.push(validation.error || 'Invalid file')
      }
    })

    if (errors.length > 0) {
      setError(errors[0])
    }

    setMobileImages(prev => [...prev, ...validFiles])
  }

  const removeMobileImage = (index: number) => {
    setMobileImages(prev => prev.filter((_, i) => i !== index))
  }

  
  
  // Scroll to bottom after sending a message
  useEffect(() => {
    if (!sending && successMessage) {
      scrollToBottom('smooth')
      setMobileImages([]) // Clear mobile images after successful send
    }
  }, [sending, successMessage])

  // Sync internal notes when leadData changes
  useEffect(() => {
    if (leadData?.notes !== undefined) {
      setInternalNotes(leadData.notes)
    }
  }, [leadData?.notes])

  // Fetch media for messages with media_count > 0
  useEffect(() => {
    const fetchMessageMedia = async () => {
      if (!leadData?.messages) return

      const messagesWithMedia = leadData.messages.filter((msg: any) => msg.media_count && msg.media_count > 0)
      if (messagesWithMedia.length === 0) return

      const mediaMap: Record<string, { urls: string[]; types: string[] }> = {}

      for (const message of messagesWithMedia) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const headers: HeadersInit = { 'Content-Type': 'application/json' }
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`
          }

          const response = await fetch(`/api/message-media?messageId=${message.id}`, { headers })
          if (response.ok) {
            const mediaData = await response.json()
            mediaMap[message.id] = {
              urls: mediaData.map((m: any) => m.media_url),
              types: mediaData.map((m: any) => m.mime_type)
            }
          }
        } catch {
          // Continue without media for this message
        }
      }

      setMessageMedia(mediaMap)
    }

    fetchMessageMedia()
  }, [leadData?.messages, supabase])

  // Merge messages by ID to prevent overwriting local state with stale data
  // Always re-sort by chronological timestamp with tie-breakers
  const mergeMessagesById = (existingMessages: any[], newMessages: any[]) => {
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
    
    // Sort by created_at ascending, then inbound before outbound if same timestamp, then id ascending
    return merged.sort((a: any, b: any) => {
      const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (timeDiff !== 0) return timeDiff
      
      // Tie-breaker: inbound before outbound if same timestamp
      if (a.direction === 'inbound' && b.direction === 'outbound') return -1
      if (a.direction === 'outbound' && b.direction === 'inbound') return 1
      
      // Final tie-breaker: id ascending
      return a.id.localeCompare(b.id)
    })
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
    const systemEvents: any[] = []
    
    // Add AI Intake Completed event
    if (leadData?.aiCallRecords && leadData.aiCallRecords.length > 0) {
      const latestAiCall = leadData.aiCallRecords[0]
      systemEvents.push({
        type: 'system_event',
        id: `ai-intake-${latestAiCall.id}`,
        created_at: latestAiCall.created_at,
        data: {
          message: 'AI Intake Completed',
          timestamp: latestAiCall.created_at
        }
      })
    }
    
    // Add Customer Corrected Address event
    if (leadData?.raw_metadata?.customer_corrected_info || leadData?.raw_metadata?.corrected_fields) {
      const correctionTimestamp = leadData.raw_metadata.last_customer_reply_at || leadData.updated_at
      const hasAddressCorrection = leadData.raw_metadata.corrected_fields?.address
      systemEvents.push({
        type: 'system_event',
        id: `correction-${leadData.id}`,
        created_at: correctionTimestamp,
        data: {
          message: hasAddressCorrection ? 'Customer Corrected Address' : 'Customer Updated Information',
          timestamp: correctionTimestamp,
          isDivider: true
        }
      })
    }
    
    // Add Follow-Ups Cancelled event
    const cancelledFollowUps = leadData?.followUpJobs?.filter((job: any) => job.status === 'cancelled')
    if (cancelledFollowUps && cancelledFollowUps.length > 0) {
      const latestCancelled = cancelledFollowUps[0]
      systemEvents.push({
        type: 'system_event',
        id: `followups-cancelled-${latestCancelled.id}`,
        created_at: latestCancelled.created_at,
        data: {
          message: latestCancelled.cancelled_reason === 'customer_replied' 
            ? 'Follow-Ups Cancelled (Customer Replied)' 
            : 'Follow-Ups Cancelled',
          timestamp: latestCancelled.created_at
        }
      })
    }

    // Add Customer Sent Photos event
    const messagesWithPhotos = messages.filter((msg: any) => msg.media_count && msg.media_count > 0)
    if (messagesWithPhotos.length > 0) {
      const firstPhotoMessage = messagesWithPhotos[0]
      const totalPhotos = messagesWithPhotos.reduce((sum: number, msg: any) => sum + (msg.media_count || 0), 0)
      systemEvents.push({
        type: 'system_event',
        id: `customer-sent-photos-${leadData.id}`,
        created_at: firstPhotoMessage.created_at,
        data: {
          message: `Customer Sent ${totalPhotos} Photo${totalPhotos > 1 ? 's' : ''}`,
          timestamp: firstPhotoMessage.created_at,
          isDivider: true
        }
      })
    }
    
    // Add Lead Marked Complete event
    if (leadData?.status === 'completed') {
      systemEvents.push({
        type: 'system_event',
        id: `lead-complete-${leadData.id}`,
        created_at: leadData.updated_at,
        data: {
          message: 'Lead Marked Complete',
          timestamp: leadData.updated_at
        }
      })
    }
    
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
    
    // Combine and sort chronologically with tie-breaker
    const timeline = [...messageItems, ...voicemailItems, ...systemEvents].sort((a, b) => {
      const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (timeDiff !== 0) return timeDiff
      
      // Tie-breaker: inbound before outbound if same timestamp
      const aDirection = a.type === 'message' ? a.data?.direction : null
      const bDirection = b.type === 'message' ? b.data?.direction : null
      if (aDirection === 'inbound' && bDirection === 'outbound') return -1
      if (aDirection === 'outbound' && bDirection === 'inbound') return 1
      
      // Final tie-breaker: id ascending
      return a.id.localeCompare(b.id)
    })

    // Debug logging for timeline order
    console.log('[TIMELINE DEBUG] Timeline items after sorting:', {
      total: timeline.length,
      messages: messageItems.length,
      voicemails: voicemailItems.length,
      systemEvents: systemEvents.length,
      items: timeline.map((item, idx) => ({
        index: idx,
        type: item.type,
        id: item.id,
        created_at: item.created_at,
        message_preview: item.type === 'message' ? item.data?.message_body?.substring(0, 30) || item.data?.body?.substring(0, 30) : null
      }))
    })

    return timeline
  }, [allMessages, leadData?.voicemailRecordings, leadData?.aiCallRecords, leadData?.raw_metadata, leadData?.followUpJobs, leadData?.status, leadData?.updated_at, leadData?.id])
  
  const messagesArray = allMessages || []
  const latestMessage = messagesArray.length > 0 ? messagesArray[messagesArray.length - 1] : null
  const latestMessageStatus = latestMessage?.status || 'No messages'

  // Scroll to bottom after messages load
  useEffect(() => {
    if (!loading && messagesArray.length > 0 && !hasScrolledToBottomOnLoad) {
      // Set initial scroll not ready to hide message pane during scroll
      setInitialScrollReady(false)
      
      // Guard against SSR
      if (typeof window === 'undefined') {
        return
      }
      
      const isDesktop = window.innerWidth >= 1024
      const container = isDesktop ? conversationContainerRef.current : mobileConversationContainerRef.current
      
      // Set initial auto-scrolling flag to prevent other scroll effects from interfering
      isInitialAutoScrollingRef.current = true
      
      if (!container) {
        return
      }
      
      // Use requestAnimationFrame + setTimeout + scrollTop for deterministic scroll
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            container.scrollTop = container.scrollHeight
            // Don't set hasScrolledToBottomOnLoad yet - wait for media fetch final scroll
          }, 200)
        })
      })
    }
  }, [loading, messagesArray.length, hasScrolledToBottomOnLoad])

  // Final scroll after media fetch completes during initial load
  useEffect(() => {
    // Only run final scroll during initial auto-scrolling phase
    if (isInitialAutoScrollingRef.current && Object.keys(messageMedia).length > 0 && !hasScrolledToBottomOnLoad) {
      // Guard against SSR
      if (typeof window === 'undefined') {
        return
      }
      
      const isDesktop = window.innerWidth >= 1024
      const container = isDesktop ? conversationContainerRef.current : mobileConversationContainerRef.current
      
      if (!container) {
        return
      }
      
      // Use double requestAnimationFrame + 100ms timeout for final scroll
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            container.scrollTop = container.scrollHeight
            
            // Clear initial auto-scrolling flag and mark initial scroll complete
            isInitialAutoScrollingRef.current = false
            setHasScrolledToBottomOnLoad(true)
            setInitialScrollReady(true)
          }, 100)
        })
      })
    }
  }, [messageMedia, hasScrolledToBottomOnLoad])

  // Scroll to bottom when messages array changes (for MMS refresh and realtime updates)
  useEffect(() => {
    if (hasScrolledToBottomOnLoad && messagesArray.length > 0) {
      // Guard against SSR
      if (typeof window === 'undefined') {
        return
      }
      
      // Only scroll if we're near bottom or if this is after a refresh
      const isDesktop = window.innerWidth >= 1024
      const container = isDesktop ? conversationContainerRef.current : mobileConversationContainerRef.current
      
      if (container) {
        const scrollThreshold = 200
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= scrollThreshold
        
        if (isNearBottom) {
          // Use double requestAnimationFrame to ensure React has finished rendering
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollToBottom('smooth', false)
            })
          })
        }
      }
    }
  }, [messagesArray.length])

  // Check scroll position to show/hide jump button
  useEffect(() => {
    // Guard against SSR
    if (typeof window === 'undefined') {
      return
    }
    
    const isDesktop = window.innerWidth >= 1024
    const container = isDesktop ? conversationContainerRef.current : mobileConversationContainerRef.current
    
    if (!container) return

    const handleScroll = () => {
      // Don't interfere during initial auto-scrolling phase
      if (isInitialAutoScrollingRef.current) {
        return
      }
      
      const scrollThreshold = 200
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= scrollThreshold
      setShowJumpButton(!isNearBottom && messagesArray.length > 0)
    }

    container.addEventListener('scroll', handleScroll)
    
    // Only check initial position if not during initial auto-scrolling
    if (!isInitialAutoScrollingRef.current) {
      handleScroll()
    }
    
    return () => container.removeEventListener('scroll', handleScroll)
  }, [messagesArray.length])

  // Track viewport size for conditional rendering
  useEffect(() => {
    // Guard against SSR
    if (typeof window === 'undefined') {
      return
    }
    
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
      
      // Redirect to leads list after a short delay
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = '/dashboard/leads'
        }
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
      
      // Redirect to leads list after a short delay
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = '/dashboard/leads'
        }
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
    getLeadDetails(params.id).then(result => {
      if (!result) {
        setLeadData(null)
        setLoading(false)
        return
      }

      if (result.ok && result.lead) {
        // Read messages and conversationId from either top-level or nested location
        const messages = result.messages || result.lead.messages || []
        const conversationId = result.conversationId || result.lead.conversationId || result.lead.conversation_id || null

        // Merge top-level data into lead object for consistency
        const leadWithMergedData = {
          ...result.lead,
          conversation_id: conversationId,
          conversationId: conversationId,
          messages: messages,
          conversation: result.conversation || result.lead.conversation
        }

        setLeadData(leadWithMergedData)
        setLoading(false)
        return
      }

      setError(result.error || "Lead not found")
      setLeadData(null)
      setLoading(false)
    }).catch(error => {
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

  const handleSendMessage = async (e?: React.FormEvent | File[]) => {
    // Prevent form submission and page refresh
    if (e instanceof Event) {
      e.preventDefault()
    }
    
    // Check if media files were passed
    const mediaFiles = Array.isArray(e) ? e : undefined
    const isMMS = mediaFiles && mediaFiles.length > 0
    
    // Don't send if message is empty (unless media is present), whitespace, or already sending
    if (!message.trim() && !mediaFiles) return
    if (sending) return

    // Create stable client temp ID
    const clientTempId = crypto.randomUUID()
    
    // Only create optimistic message for text-only SMS (skip for MMS)
    if (!isMMS) {
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
    }
    
    setSending(true)
    setError('')
    setSuccessMessage('')

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()

      let response: Response

      if (mediaFiles && mediaFiles.length > 0) {
        // Use FormData for MMS
        const formData = new FormData()
        formData.append('leadId', params.id)
        formData.append('message', message.trim())
        formData.append('clientTempId', clientTempId)
        
        mediaFiles.forEach((file, index) => {
          formData.append(`media_${index}`, file)
        })

        const headers: HeadersInit = {}
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }

        response = await fetch('/api/send-sms', {
          method: 'POST',
          headers,
          body: formData
        })
      } else {
        // Use JSON for regular SMS
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }

        response = await fetch('/api/send-sms', {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            leadId: params.id, 
            message: message.trim(),
            clientTempId
          })
        })
      }

      const result = await response.json()

      if (!response.ok) {
        // Update optimistic message to failed state (SMS only)
        if (!isMMS) {
          setOptimisticMessage((prev: any) => ({
            ...prev,
            status: 'failed',
            error_message: result.error || 'We couldn\'t send this message'
          }))
        }
        
        // Show appropriate error message based on response
        if (result.error === 'Lead not found') {
          setError('Lead not found. Please refresh the page and try again.')
        } else if (result.error === 'Business not found') {
          setError('Business not found. Please contact support.')
        } else if (result.error?.includes('verification') || result.error?.includes('carrier')) {
          setError('Phone setup still pending. Delivery may fail until approved.')
        } else if (result.error?.includes('blocked') || result.error?.includes('opted out')) {
          setError('This number has opted out. You cannot send messages.')
        } else {
          setError('We couldn\'t send this message. Please try again.')
        }
        return
      }

      // Update optimistic message with real message data using clientTempId (SMS only)
      if (!isMMS && result.clientTempId === clientTempId && result.message) {
        console.log('[Send] SMS - Messages before send:', leadData?.messages?.length || 0)
        console.log('[Send] SMS - API returned message id:', result.message.id, 'status:', result.message.status)
        
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

      // For MMS, call refreshConversationData to get complete message with media
      if (isMMS && result.message) {
        await handleRefresh()
        
        // Clear mobile images after successful MMS send
        setMobileImages([])
        
        // Clear desktop composer images after successful MMS send
        if (clearComposerImagesRef.current) {
          clearComposerImagesRef.current()
        }
        
        // Scroll to bottom after refresh completes
        setTimeout(() => {
          scrollToBottom('smooth', true)
        }, 100)
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
      // Update optimistic message to failed state (SMS only)
      if (!isMMS) {
        setOptimisticMessage((prev: any) => ({
          ...prev,
          status: 'failed',
          error_message: 'Network error occurred'
        }))
      }
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleMobileKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleAppointmentSave = async (event: any) => {
    try {
      const response = await fetch('/api/google/calendar/create-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(event),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create appointment')
      }

      const data = await response.json()

      // Store appointment data in lead metadata
      const appointmentData = {
        googleEventId: data.event.id,
        googleEventLink: data.event.htmlLink,
        title: data.event.summary,
        start: data.event.start,
        end: data.event.end,
        scheduledAt: new Date().toISOString()
      }

      await supabase
        .from('leads')
        .update({
          raw_metadata: {
            ...(leadData?.raw_metadata || {}),
            appointment: appointmentData
          }
        })
        .eq('id', params.id)

      // Refresh lead data
      const updatedLead = await getLeadDetails(params.id)
      if (updatedLead) {
        setLeadData(updatedLead)
      }

      setSuccessMessage('Appointment scheduled successfully')
      setIsAppointmentModalOpen(false)
    } catch (error: any) {
      console.error('Failed to create appointment:', error)
      setError(error.message || 'Failed to create appointment')
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
            <a
              href="/dashboard/leads"
              className="inline-flex items-center text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
              onClick={() => console.log('[LEAD DETAIL HEADER BACK] clicked -> /dashboard/leads')}
            >
              ← Back to Leads
            </a>
          </div>
          <div className="bg-card rounded-lg shadow border border-border p-8 text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Lead not found</h1>
            <p className="text-muted-foreground mb-6">
              {error || 'The lead you\'re looking for doesn\'t exist or you don\'t have permission to view it.'}
            </p>
            <a
              href="/dashboard/leads"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              onClick={() => console.log('[LEAD DETAIL HEADER BACK] clicked -> /dashboard/leads')}
            >
              Return to Leads
            </a>
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
    <DashboardErrorBoundary>
      <main className="min-h-screen bg-background flex flex-col">
      {/* Standard App Header */}
      <AppHeader />

      {/* Conversation Sub-Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3">
          {/* Mobile Layout: Messaging App Header */}
          <div className="md:hidden">
            <div className="flex items-center justify-between">
              {/* Back + Name/Phone */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/dashboard/leads'
                  }}
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors p-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex-1 min-w-0">
                  <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-tight truncate">
                    {getLeadDisplayName(leadData || lead)}
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {formatPhoneNumber(lead?.caller_phone || '')}
                  </p>
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
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/dashboard/leads'
                }}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Leads
              </button>
            </div>

            {/* Lead Identity Section - Desktop Enhanced */}
            <div className="flex items-start gap-5 flex-1 min-w-0">
              {/* Lead Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 mb-2">
                  {/* Name - Emphasized */}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight tracking-tight">
                      {getLeadDisplayName(leadData || lead)}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1 font-medium">
                      {formatPhoneNumber(lead?.caller_phone || '')}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <span className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold border ${getLeadStatusClasses(getLeadLifecycleStatus(leadData))} flex-shrink-0`}>
                    {getLeadStatusLabel(getLeadLifecycleStatus(leadData))}
                  </span>

                  {/* Correction Badge */}
                  {leadData?.raw_metadata?.corrected_fields && Object.keys(leadData.raw_metadata.corrected_fields).length > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex-shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{Object.keys(leadData.raw_metadata.corrected_fields).length}</span>
                    </span>
                  )}

                  {/* Appointment Badge */}
                  {leadData?.raw_metadata?.appointment && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 flex-shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Appointment</span>
                    </span>
                  )}

                  {/* Quick Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => window.open(`tel:${lead?.caller_phone}`, '_self')}
                      className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700"
                      title="Call"
                    >
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setIsAppointmentModalOpen(true)}
                      className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20 hover:bg-green-200 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300 transition-colors border border-green-200 dark:border-green-800"
                      title="Schedule Appointment"
                    >
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        const composer = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement
                        if (composer) composer.focus()
                      }}
                      className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20 hover:bg-blue-200 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 transition-colors border border-blue-200 dark:border-blue-800"
                      title="Send Text"
                    >
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </button>
                    <LeadStatusDropdown
                      currentStatus={leadData?.status || 'new'}
                      onStatusChange={async (newStatus) => {
                        // Status change handled by dropdown
                      }}
                    />
                  </div>
                </div>

                {/* Compact Meta Row */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && (
                    <span className="text-green-600 dark:text-green-400 font-semibold flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      AI Intake Complete
                    </span>
                  )}
                  <span className="text-muted-foreground/50">•</span>
                  <span>Created {formatRelativeTime(lead?.created_at)}</span>
                  {lead?.last_message_at && (
                    <>
                      <span className="text-muted-foreground/50">•</span>
                      <span>Last Activity {formatRelativeTime(lead.last_message_at)}</span>
                    </>
                  )}
                  <span className="text-muted-foreground/50">•</span>
                  <span>{messagesArray.length} Messages</span>
                  {leadData?.company_name && (
                    <>
                      <span className="text-muted-foreground/50">•</span>
                      <span className="truncate">{leadData.company_name}</span>
                    </>
                  )}
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Refresh Button */}
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="w-11 h-11 text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200 disabled:opacity-50 border border-border hover:border-border flex items-center justify-center"
                  title="Refresh conversation"
                >
                  {refreshing ? (
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"></div>
                  ) : (
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </button>
                
                {/* More Actions */}
                <div className="relative">
                  <button
                    onClick={() => setShowMoreActions(!showMoreActions)}
                    className="w-11 h-11 text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200 border border-border hover:border-border flex items-center justify-center"
                    title="More actions"
                  >
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Conversation Thread - CSS-based Layout */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Desktop Layout */}
        <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
          {/* Desktop Conversation Section */}
          <section className="flex flex-col min-h-0 bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden h-[calc(100vh-350px)]">
            {/* Desktop Message Thread */}
            <div ref={conversationContainerRef} className="flex-1 overflow-y-auto scroll-smooth p-6 sm:p-7 lg:p-8 min-h-0 bg-background/20" style={{ minHeight: '200px' }}>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : conversationTimeline.length === 0 ? (
                <div className="text-center py-8 sm:py-12 animate-fadeIn">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-blue-200 dark:border-blue-800">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1 sm:mb-2">No messages yet</h3>
                  <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-md mx-auto">Send a message to start the conversation with this customer.</p>
                </div>
              ) : (
                <DesktopConversationMessageList
                  messagesArray={messagesArray}
                  conversationTimeline={conversationTimeline}
                  sending={sending}
                  handleRetry={handleRetry}
                  getErrorMessage={getErrorMessage}
                  onImageLoad={() => scrollToBottom('smooth', true)}
                />
              )}
            </div>

            {/* Desktop Message Composer */}
            <div className="shrink-0 border-t border-border/50 bg-background/90 backdrop-blur-sm">
              <ConversationComposer
                message={message}
                setMessage={setMessage}
                handleSendMessage={handleSendMessage}
                sending={sending}
                onClearImages={(clearFn: () => void) => {
                  clearComposerImagesRef.current = clearFn
                }}
              />
            </div>
          </section>
          
          {/* Desktop Sidebar */}
          <aside className="sticky top-6 overflow-y-auto max-h-[calc(100vh-230px)]" data-sidebar>
            <div className="space-y-4">
              {/* AI Intake Summary Card - Sticky on Desktop */}
              {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && business?.id && (
                <div className="sticky top-0 bg-background z-10 pb-4">
                  <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
                    <button
                      onClick={() => setCollapsedSections(prev => ({ ...prev, aiIntake: !prev.aiIntake }))}
                      className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Intake Summary</h3>
                      <svg className={`w-4 h-4 text-muted-foreground transition-transform ${collapsedSections.aiIntake ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {!collapsedSections.aiIntake && (
                      <div className="px-4 pb-4 pt-2">
                        <AICallDetails
                          leadId={params.id}
                          businessId={business.id}
                          conversationId={leadData?.conversation?.id}
                          callerPhone={leadData?.phone_number || lead?.phone}
                          leadData={leadData}
                          collapsible={false}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Voicemail Summary Card - Show when voicemail extraction exists */}
              <VoicemailSummary leadData={leadData} />
              {/* Lead Health Card */}
              <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setCollapsedSections(prev => ({ ...prev, leadHealth: !prev.leadHealth }))}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead Health</h3>
                  <svg className={`w-4 h-4 text-muted-foreground transition-transform ${collapsedSections.leadHealth ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {!collapsedSections.leadHealth && (
                  <div className="px-4 pb-4 pt-2">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">AI Intake</span>
                        <span className="text-xs font-medium text-foreground">
                          {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 ? 'Complete' : 'Incomplete'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Customer Replied</span>
                        <span className="text-xs font-medium text-foreground">
                          {leadData?.raw_metadata?.customer_replied || leadData?.raw_metadata?.replied_after_ai_call || leadData?.raw_metadata?.last_customer_reply_at || followUpJobs.some((j: any) => j.cancelled_reason === 'customer_replied') ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Corrections Made</span>
                        <span className="text-xs font-medium text-foreground">
                          {leadData?.raw_metadata?.corrected_fields ? Object.keys(leadData.raw_metadata.corrected_fields).length : 0}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Follow-Ups</span>
                        <span className="text-xs font-medium text-foreground">
                          {followUpJobs.some((j: any) => j.status === 'pending') ? 'Active' : 
                           followUpJobs.some((j: any) => j.status === 'cancelled') ? 'Cancelled' : 'Complete'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Photos Received Card */}
              {Object.keys(messageMedia).length > 0 && (
                <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
                  <button
                    onClick={() => setCollapsedSections(prev => ({ ...prev, photos: !prev.photos }))}
                    className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Photos Received</h3>
                    <svg className={`w-4 h-4 text-muted-foreground transition-transform ${collapsedSections.photos ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {!collapsedSections.photos && (
                    <div className="px-4 pb-4">
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(messageMedia).slice(0, showAllPhotos ? undefined : 4).map(([messageId, media]: [string, any]) => (
                          media.urls.slice(0, 1).map((url: string, idx: number) => (
                            <div
                              key={`${messageId}-${idx}`}
                              className="relative group cursor-pointer"
                              onClick={() => {
                                setSelectedPhotoUrl(url)
                                setPhotoModalOpen(true)
                              }}
                            >
                              <img
                                src={url}
                                alt="Customer photo"
                                className="w-full h-24 object-cover rounded-lg border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity"
                                loading="lazy"
                              />
                            </div>
                          ))
                        ))}
                      </div>
                      {Object.keys(messageMedia).length > 4 && (
                        <button
                          onClick={() => setShowAllPhotos(!showAllPhotos)}
                          className="w-full mt-3 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                        >
                          {showAllPhotos ? 'Show Less' : `View All Photos (${Object.keys(messageMedia).length})`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Quick Actions Card */}
              <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setCollapsedSections(prev => ({ ...prev, quickActions: !prev.quickActions }))}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h3>
                  <svg className={`w-4 h-4 text-muted-foreground transition-transform ${collapsedSections.quickActions ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {!collapsedSections.quickActions && (
                  <div className="px-4 pb-4 pt-2">
                    <div className="flex flex-wrap gap-2">
                      {/* Primary Actions */}
                      <button
                        onClick={() => window.open(`tel:${leadData?.phone_number}`, '_self')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span>Call</span>
                      </button>
                      {getLeadLifecycleStatus(leadData) !== 'completed' && (
                        <button
                          onClick={() => handleStatusUpdate('completed')}
                          disabled={isCompleting}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{isCompleting ? 'Marking...' : 'Complete'}</span>
                        </button>
                      )}
                      {/* Secondary Actions */}
                      <button
                        onClick={() => {
                          const phone = leadData?.phone_number || lead?.phone
                          if (phone) {
                            copyToClipboard(phone)
                          }
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs font-medium rounded-md transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy</span>
                      </button>
                      <button
                        onClick={() => setShowIgnoreModal(true)}
                        disabled={isIgnoring}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/10 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>{isIgnoring ? 'Ignoring...' : 'Ignore'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Automatic Follow-ups */}
              <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setCollapsedSections(prev => ({ ...prev, automation: !prev.automation }))}
                  className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Follow-Up Status</h3>
                  <svg className={`w-4 h-4 text-muted-foreground transition-transform ${collapsedSections.automation ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {!collapsedSections.automation && (
                  <div className="px-4 pb-4 pt-2">
                    <AutomaticFollowUpsControl
                      followUpJobs={followUpJobs}
                      leadId={params.id}
                      leadData={leadData}
                      onUpdate={() => {
                        getLeadDetails(params.id).then(setLeadData)
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
        
        {/* Mobile Layout */}
        <div className="lg:hidden space-y-4">
          {/* Mobile Quick Actions */}
          <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 overflow-x-auto">
              {(leadData?.phone_number || lead?.phone) && (leadData?.phone_number || lead?.phone) !== '+10000000000' && (
                <a
                  href={`tel:${leadData?.phone_number || lead?.phone}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                  title="Call customer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z" />
                  </svg>
                  <span>Call</span>
                </a>
              )}
              <button
                onClick={() => {
                  const composer = document.querySelector('textarea')
                  if (composer) composer.focus()
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full transition-colors border border-blue-200 dark:border-blue-800 flex-shrink-0"
                title="Send text message"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>Text</span>
              </button>
              <button
                onClick={() => setShowLeadInfo(!showLeadInfo)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-900/20 hover:bg-slate-100 dark:hover:bg-slate-900/30 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full transition-colors border border-slate-200 dark:border-slate-800 flex-shrink-0"
                title="More actions"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
                <span>More</span>
              </button>
            </div>
          </div>
          
          {/* Mobile Message Thread */}
          <div ref={mobileConversationContainerRef} className="p-4 sm:p-5 lg:p-6 overflow-y-auto scroll-smooth bg-card rounded-2xl border border-border/50 shadow-sm" style={{ minHeight: '200px', maxHeight: 'calc(100vh-280px)' }}>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : conversationTimeline.length === 0 ? (
              <div className="text-center py-8 sm:py-12 animate-fadeIn">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-blue-200 dark:border-blue-800">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1 sm:mb-2">No messages yet</h3>
                <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-md mx-auto">Send a message to start the conversation with this customer.</p>
              </div>
            ) : (
              <MobileConversationMessageList
                messagesArray={messagesArray}
                conversationTimeline={conversationTimeline}
                sending={sending}
                handleRetry={handleRetry}
                getErrorMessage={getErrorMessage}
                renderAudio={false}
              />
            )}
          </div>
          
          {/* Mobile Message Composer */}
          <div className="border-t border-border/50 px-4 sm:px-5 lg:px-6 py-4 bg-background/90 backdrop-blur-sm">
            {/* Image Previews */}
            {mobileImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {mobileImages.map((file, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={URL.createObjectURL(file)}
                      alt="Preview"
                      className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                    />
                    <button
                      onClick={() => removeMobileImage(index)}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      type="button"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 items-end">
              <button
                type="button"
                onClick={() => mobileFileInputRef.current?.click()}
                className="p-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                disabled={sending}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <input
                ref={mobileFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif"
                multiple
                onChange={handleMobileImageSelect}
                className="hidden"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleMobileKeyDown}
                placeholder="Type a message..."
                className="flex-1 min-h-[60px] max-h-[120px] px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm sm:text-base text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                rows={2}
              />
              <button
                onClick={() => handleSendMessage(mobileImages.length > 0 ? mobileImages : undefined)}
                disabled={(!message.trim() && mobileImages.length === 0) || sending}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-medium rounded-xl transition-all flex items-center gap-2 self-end"
              >
                {sending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    <span className="hidden sm:inline">Send</span>
                  </>
                )}
              </button>
            </div>
          </div>
          
          {/* AI Intake Summary Card */}
          {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && business?.id && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">AI Intake Summary</h3>
              <AICallDetails
                leadId={params.id}
                businessId={business.id}
                conversationId={leadData?.conversation?.id}
                callerPhone={leadData?.phone_number || lead?.phone}
              />
            </div>
          )}
          
          {/* Customer Details Card */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Customer Details</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Phone</span>
                <span className="text-sm font-medium text-foreground">{formatPhoneNumber(leadData?.phone_number || lead?.phone)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className={`text-sm font-medium ${getLeadStatusColor(leadData?.status || lead?.status)}`}>
                  {leadData?.status || lead?.status || 'New'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Internal Notes Card */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Internal Notes</h3>
            <textarea
              placeholder="Add internal notes..."
              className="w-full min-h-[80px] px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Lead Health Card */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Lead Health</h3>
            <div className="space-y-2">
              {/* Intake Status */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0
                    ? 'AI Intake'
                    : leadData?.voicemailRecordings && leadData.voicemailRecordings.some((v: any) => v.transcription_text)
                      ? 'Voicemail Intake'
                      : 'Intake'}
                </span>
                <span className={`text-xs font-medium ${
                  leadData?.aiCallRecords && leadData.aiCallRecords.length > 0
                    ? 'text-green-600 dark:text-green-400'
                    : leadData?.voicemailRecordings && leadData.voicemailRecordings.some((v: any) => v.transcription_text)
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}>
                  {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0
                    ? 'Complete'
                    : leadData?.voicemailRecordings && leadData.voicemailRecordings.some((v: any) => v.transcription_text)
                      ? 'Complete'
                      : 'Incomplete'}
                </span>
              </div>
              {/* Customer Replied */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Customer Replied</span>
                <span className={`text-xs font-medium ${leadData?.messages?.some((m: any) => m.direction === 'inbound') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {leadData?.messages?.some((m: any) => m.direction === 'inbound') ? 'Yes' : 'No'}
                </span>
              </div>
              {/* Corrections Made */}
              {leadData?.raw_metadata?.corrected_fields && Object.keys(leadData.raw_metadata.corrected_fields).length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Corrections</span>
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    {Object.keys(leadData.raw_metadata.corrected_fields).length}
                  </span>
                </div>
              )}
              {/* Appointment */}
              {leadData?.raw_metadata?.appointment && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Appointment</span>
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    Scheduled
                  </span>
                </div>
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
                className="w-full px-3 py-2 border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-lg transition-colors"
              >
                Mark Closed
              </button>
            </div>
          </div>
          
          {/* Automatic Follow-ups */}
          <div className="mt-6 sm:mt-8 lg:mt-10">
            <AutomaticFollowUpsControl 
              followUpJobs={followUpJobs} 
              leadId={params.id}
              onUpdate={() => {
                getLeadDetails(params.id).then(setLeadData)
              }}
            />
          </div>
        </div>
      </div>
          {/* Desktop Layout - 2 Column */}
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
    <PhotoModal
      imageUrl={selectedPhotoUrl}
      isOpen={photoModalOpen}
      onClose={() => {
        setPhotoModalOpen(false)
        setSelectedPhotoUrl('')
      }}
    />

    {/* Appointment Modal */}
    <EventComposer
      isOpen={isAppointmentModalOpen}
      onClose={() => setIsAppointmentModalOpen(false)}
      onSave={handleAppointmentSave}
      prefill={{
        title: `Appointment - ${leadData?.contact_name || leadData?.caller_phone || 'Lead'}`,
        description: `Phone: ${formatPhoneNumber(leadData?.caller_phone || '')}${leadData?.company_name ? `\nCompany: ${leadData.company_name}` : ''}`,
        eventType: 'appointment'
      }}
    />
    </DashboardErrorBoundary>
  )
}

