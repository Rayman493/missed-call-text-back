'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import ConversationComposer from '@/components/ConversationComposer'
import MobileConversationComposer from '@/components/MobileConversationComposer'
import AutomaticFollowUpsControl from '@/components/AutomaticFollowUpsControl'
import MobileConversationMessageList from '@/components/MobileConversationMessageList'
import DesktopConversationMessageList from '@/components/DesktopConversationMessageList'
import AppHeader from '@/components/AppHeader'
import AppBackButton from '@/components/AppBackButton'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber, formatRelativeTime, formatCurrency, getLeadStatusColor, getLeadDisplayName } from '@/lib/utils'
import { getLeadAIIntake, getAIIntakeStatus, getAIIntakeStatusLabel, getAIIntakeStatusColor } from '@/lib/ai-field-mapping'
import { deriveJobSchedulingPrefill } from '@/lib/job-scheduling-prefill'
import { getLeadLifecycleStatus, getLeadStatusClasses, getLeadStatusLabel, LeadLifecycleStatus } from '@/lib/lead-lifecycle'
import { copyToClipboard } from '@/lib/clipboard'
import { calculateLeadTiming, getCustomerInfoForCopy, getAISummaryForCopy } from '@/lib/lead-timing'
import { isProviderAvailable, getAvailableProviders, PaymentProvider } from '@/lib/payment-links'
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
import JobComposer, { JobPrefill, Job } from '@/components/jobs/JobComposer'
import { CalendarDays, ClipboardPlus, CreditCard } from 'lucide-react'

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

function getLeadStatusAccentColor(status: string): string {
  const normalizedStatus = status?.toLowerCase()
  switch (normalizedStatus) {
    case 'new':
      return 'bg-blue-500'
    case 'active':
      return 'bg-green-500'
    case 'scheduled':
      return 'bg-purple-500'
    case 'completed':
      return 'bg-gray-500'
    case 'ignored':
      return 'bg-red-500'
    default:
      return 'bg-blue-500'
  }
}

// Canonical status rank for monotonicity enforcement
// Higher rank = more final state. Status can only move to higher ranks.
const STATUS_RANK: Record<string, number> = {
  'pending': 0,
  'sending': 1,
  'accepted': 2,
  'queued': 3,
  'sent': 4,
  'delivered': 5,
  // Terminal failure states (highest rank to prevent downgrade)
  'undelivered': 6,
  'failed': 7,
  'not_sent': 8
}

/**
 * Get monotonic status - prevents status downgrades with explicit terminal-state rules
 * 
 * Terminal-state rules:
 * - Delivered cannot downgrade to any other status
 * - Failed cannot replace Delivered
 * - Delivered cannot replace a confirmed terminal failure
 * - Queued cannot replace Sent
 * - Sent cannot replace Delivered
 */
function getMonotonicStatus(currentStatus: string, newStatus: string): string {
  const currentRank = STATUS_RANK[currentStatus] ?? 0
  const newRank = STATUS_RANK[newStatus] ?? 0
  
  // Terminal state: Delivered cannot downgrade
  if (currentStatus === 'delivered') {
    console.log('[MONOTONIC STATUS] Delivered is terminal - preventing downgrade:', {
      currentStatus,
      newStatus
    })
    return currentStatus
  }
  
  // Terminal state: Failed cannot replace Delivered
  if (currentStatus === 'delivered' && (newStatus === 'failed' || newStatus === 'undelivered' || newStatus === 'not_sent')) {
    console.log('[MONOTONIC STATUS] Failed cannot replace Delivered:', {
      currentStatus,
      newStatus
    })
    return currentStatus
  }
  
  // Terminal state: Delivered cannot replace a confirmed terminal failure
  if ((currentStatus === 'failed' || currentStatus === 'undelivered' || currentStatus === 'not_sent') && newStatus === 'delivered') {
    console.log('[MONOTONIC STATUS] Delivered cannot replace terminal failure:', {
      currentStatus,
      newStatus
    })
    return currentStatus
  }
  
  // Queued cannot replace Sent
  if (currentStatus === 'sent' && newStatus === 'queued') {
    console.log('[MONOTONIC STATUS] Queued cannot replace Sent:', {
      currentStatus,
      newStatus
    })
    return currentStatus
  }
  
  // Sent cannot replace Delivered
  if (currentStatus === 'delivered' && newStatus === 'sent') {
    console.log('[MONOTONIC STATUS] Sent cannot replace Delivered:', {
      currentStatus,
      newStatus
    })
    return currentStatus
  }
  
  // Only upgrade if new status has higher or equal rank
  if (newRank >= currentRank) {
    return newStatus
  }
  
  // Keep current status if new status would downgrade
  console.log('[MONOTONIC STATUS] Preventing downgrade:', {
    currentStatus,
    newStatus,
    currentRank,
    newRank
  })
  return currentStatus
}

/**
 * Canonical message merge function
 * - Matches by database ID, clientMessageId, or Twilio SID
 * - Enforces status monotonicity
 * - Prevents duplicates
 * - Preserves chronological ordering
 */
function mergeMessageWithMonotonicity(existingMessages: any[], incomingMessage: any, source: string = 'unknown'): any[] {
  console.log('[MERGE START]', {
    source,
    incoming: {
      id: incomingMessage.id,
      clientMessageId: incomingMessage.clientMessageId || incomingMessage.client_message_id,
      twilioMessageSid: incomingMessage.twilio_message_sid,
      direction: incomingMessage.direction,
      status: incomingMessage.status,
      preview: (incomingMessage.body || incomingMessage.message_body || '').substring(0, 20),
      createdAt: incomingMessage.created_at
    },
    existingCount: existingMessages.length,
    existingIds: existingMessages.map(m => ({
      id: m.id,
      clientMessageId: m.clientMessageId || m.client_message_id,
      twilioMessageSid: m.twilio_message_sid
    }))
  })

  const messageMap = new Map<string, any>()
  
  // Add existing messages first
  existingMessages.forEach(msg => {
    messageMap.set(msg.id, msg)
  })
  
  // Find existing message by multiple correlation keys
  let existingMessage: any = null
  let matchKey: string = ''
  
  // Normalize field names for matching
  const incomingClientMessageId = incomingMessage.clientMessageId || incomingMessage.client_message_id
  const incomingTwilioSid = incomingMessage.twilio_message_sid
  
  // 1. Match by exact database ID
  if (incomingMessage.id && messageMap.has(incomingMessage.id)) {
    existingMessage = messageMap.get(incomingMessage.id)
    matchKey = 'id'
  }
  // 2. Match by clientMessageId (for optimistic message reconciliation)
  else if (incomingClientMessageId) {
    for (const [id, msg] of Array.from(messageMap.entries())) {
      const msgClientMessageId = msg.clientMessageId || msg.client_message_id
      if (msgClientMessageId === incomingClientMessageId) {
        existingMessage = msg
        matchKey = 'clientMessageId'
        break
      }
    }
  }
  // 3. Match by Twilio SID (for status updates)
  else if (incomingTwilioSid) {
    for (const [id, msg] of Array.from(messageMap.entries())) {
      if (msg.twilio_message_sid === incomingTwilioSid) {
        existingMessage = msg
        matchKey = 'twilio_message_sid'
        break
      }
    }
  }
  
  if (existingMessage) {
    // Merge with monotonic status
    const mergedMessage = {
      ...existingMessage,
      ...incomingMessage,
      status: getMonotonicStatus(existingMessage.status, incomingMessage.status)
    }
    
    // If matched by clientMessageId but incoming has real ID, update the map key
    if (matchKey === 'clientMessageId' && incomingMessage.id && incomingMessage.id !== existingMessage.id) {
      messageMap.delete(existingMessage.id)
      messageMap.set(incomingMessage.id, mergedMessage)
      console.log('[MERGE] Replaced optimistic message with persisted message:', {
        source,
        matchKey,
        clientMessageId: incomingClientMessageId,
        oldId: existingMessage.id,
        newId: incomingMessage.id
      })
    } else {
      messageMap.set(existingMessage.id, mergedMessage)
      console.log('[MERGE] Updated existing message:', {
        source,
        matchKey,
        messageId: existingMessage.id,
        oldStatus: existingMessage.status,
        newStatus: mergedMessage.status
      })
    }
  } else {
    // New message - add to map
    messageMap.set(incomingMessage.id, incomingMessage)
    console.log('[MERGE] Added new message:', {
      source,
      messageId: incomingMessage.id,
      status: incomingMessage.status
    })
  }
  
  // Convert back to array and sort chronologically
  const merged = Array.from(messageMap.values())
  const sorted = merged.sort((a: any, b: any) => {
    const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (timeDiff !== 0) return timeDiff
    
    // Tie-breaker: inbound before outbound if same timestamp
    if (a.direction === 'inbound' && b.direction === 'outbound') return -1
    if (a.direction === 'outbound' && b.direction === 'inbound') return 1
    
    // Final tie-breaker: id ascending
    return a.id.localeCompare(b.id)
  })

  console.log('[MERGE END]', {
    source,
    resultCount: sorted.length,
    resultIds: sorted.map(m => ({
      id: m.id,
      clientMessageId: m.clientMessageId || m.client_message_id,
      status: m.status,
      preview: (m.body || m.message_body || '').substring(0, 20)
    }))
  })

  return sorted
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
  const [refreshing, setRefreshing] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [showMobileOverflow, setShowMobileOverflow] = useState(false)
  const [showCustomerInfoModal, setShowCustomerInfoModal] = useState(false)
  const [savingCustomerInfo, setSavingCustomerInfo] = useState(false)
  const [mobileCustomerExpanded, setMobileCustomerExpanded] = useState(true)
  const [mobileLeadDetailsExpanded, setMobileLeadDetailsExpanded] = useState(false)
  const [mobileActionsExpanded, setMobileActionsExpanded] = useState(false)
  const [mobileInternalNotesExpanded, setMobileInternalNotesExpanded] = useState(false)
  const latestMessageRef = useRef<HTMLDivElement>(null)
  const [mobileLeadHealthExpanded, setMobileLeadHealthExpanded] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)
  const [messageMedia, setMessageMedia] = useState<Record<string, { urls: string[]; types: string[] }>>({})
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState(() => {
    // Guard against SSR
    if (typeof window === 'undefined') {
      return {
        photos: true,
        activity: true,
        automation: true,
        customerHealth: false,
        quickActions: true,
        aiIntake: true, // Default to collapsed
        jobs: true, // Default to collapsed for conversation-first
        payments: true, // Default to collapsed for conversation-first
        recentActivity: true // Default to collapsed for conversation-first
      }
    }
    const saved = localStorage.getItem('customerDetailsCollapsedSections')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return {
          photos: true,
          activity: true,
          automation: true,
          customerHealth: false,
          quickActions: true,
          aiIntake: true,
          jobs: true,
          payments: true,
          recentActivity: true
        }
      }
    }
    return {
      photos: true,
      activity: true,
      automation: true,
      customerHealth: false,
      quickActions: true,
      aiIntake: true, // Default to collapsed
      jobs: true, // Default to collapsed for conversation-first
      payments: true, // Default to collapsed for conversation-first
      recentActivity: true // Default to collapsed for conversation-first
    }
  })
  const [photoModalOpen, setPhotoModalOpen] = useState(false)
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState('')
  const [mobileImages, setMobileImages] = useState<File[]>([])
  const mobileFileInputRef = useRef<HTMLInputElement>(null)
  const clearComposerImagesRef = useRef<(() => void) | null>(null)
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false)
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [isLoadingCalendarStatus, setIsLoadingCalendarStatus] = useState(false)
  const [followUpSettings, setFollowUpSettings] = useState<any>(null)
  const [isJobComposerOpen, setIsJobComposerOpen] = useState(false)
  const [jobPrefill, setJobPrefill] = useState<JobPrefill | undefined>(undefined)

  // Realtime subscription management
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const currentLeadIdRef = useRef<string | null>(null)
  const supabaseRef = useRef(createBrowserClient())
  const supabase = supabaseRef.current
  
  // Fallback refresh for stuck messages
  const stuckMessageCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // ALL hooks must must be declared here before any conditional returns
  // Auto-scroll to newest message with jump button logic
  const [showJumpButton, setShowJumpButton] = useState(false)
  const [hasScrolledToBottomOnLoad, setHasScrolledToBottomOnLoad] = useState(false)
  const [initialScrollReady, setInitialScrollReady] = useState(false)
  const [internalNotes, setInternalNotes] = useState(leadData?.notes || '')
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [showLeadInfo, setShowLeadInfo] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [internalNotesExpanded, setInternalNotesExpanded] = useState(false)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)
  const overflowButtonRef = useRef<HTMLButtonElement>(null)
  const [overflowMenuPosition, setOverflowMenuPosition] = useState<{ top: number; left: number } | null>(null)
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

  // Calculate overflow menu position when opening
  useEffect(() => {
    if (showOverflowMenu && overflowButtonRef.current) {
      const rect = overflowButtonRef.current.getBoundingClientRect()
      const menuWidth = 160
      const menuHeight = 200
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      // Calculate position with viewport clamping
      let left = rect.right
      let top = rect.bottom + 4

      // Clamp to right edge
      if (left + menuWidth > viewportWidth) {
        left = rect.left - menuWidth
      }

      // Clamp to bottom edge
      if (top + menuHeight > viewportHeight) {
        top = rect.top - menuHeight - 4
      }

      setOverflowMenuPosition({ top, left })
    } else {
      setOverflowMenuPosition(null)
    }
  }, [showOverflowMenu])

  // Close overflow menu on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showOverflowMenu) {
        setShowOverflowMenu(false)
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [showOverflowMenu])

  // Persist collapsedSections to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('customerDetailsCollapsedSections', JSON.stringify(collapsedSections))
    }
  }, [collapsedSections])
  
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

  const handleDeleteCustomer = async () => {
    if (!lead?.id) return
    setIsDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'DELETE',
        headers
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Failed to delete customer:', result.error)
        alert(result.error || 'Failed to delete customer')
        return
      }

      // Redirect to customers list on successful deletion
      router.push('/dashboard/leads')
    } catch (error) {
      console.error('Error deleting customer:', error)
      alert('Failed to delete customer')
    } finally {
      setIsDeleting(false)
      setShowDeleteModal(false)
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
  const mergeMessagesById = (existingMessages: any[], newMessages: any[], source: string = 'mergeMessagesById') => {
    console.log('[MERGE MESSAGES BY ID START]', {
      source,
      existingCount: existingMessages.length,
      newCount: newMessages.length
    })
    
    let merged = existingMessages
    
    // Merge each new message using the canonical merge function
    newMessages.forEach((msg, index) => {
      merged = mergeMessageWithMonotonicity(merged, msg, `${source}[${index}]`)
    })
    
    console.log('[MERGE MESSAGES BY ID END]', {
      source,
      finalCount: merged.length
    })
    return merged
  }

  // Create combined timeline with messages and voicemail recordings
  const conversationTimeline = useMemo(() => {
    const messages = leadData?.messages || []
    const voicemails = leadData?.voicemailRecordings || []
    const systemEvents: any[] = []
    
    // Add AI Intake events - show ALL AI call records as separate timeline events
    if (leadData?.aiCallRecords && leadData.aiCallRecords.length > 0) {
      leadData.aiCallRecords.forEach((aiCall: any) => {
        const outcome = aiCall.outcome
        const intakeStatus = getAIIntakeStatus({ aiCallRecords: [aiCall] })
        const serviceRequested = aiCall.extracted_info?.reasonForCalling || aiCall.extracted_info?.serviceRequested || 'Unknown request'
        
        // Determine message based on actual outcome
        let intakeMessage = ''
        if (intakeStatus === 'complete') {
          intakeMessage = `Completed Request: ${serviceRequested}`
        } else if (intakeStatus === 'partial') {
          intakeMessage = `Partial Request: ${serviceRequested}`
        } else if (outcome === 'early_hangup') {
          intakeMessage = `Caller Hung Up: ${serviceRequested}`
        } else if (outcome === 'no_speech') {
          intakeMessage = 'No Speech Detected'
        } else if (outcome === 'ai_connection_failed') {
          intakeMessage = 'AI Connection Failed'
        } else {
          intakeMessage = `Request: ${serviceRequested}`
        }
        
        systemEvents.push({
          type: 'system_event',
          id: `ai-intake-${aiCall.id}`,
          created_at: aiCall.created_at,
          data: {
            message: intakeMessage,
            timestamp: aiCall.created_at,
            isDivider: false
          }
        })
      })
    }
    
    // Add Customer Corrected Address event
    if (leadData?.raw_metadata?.customer_corrected_info || leadData?.raw_metadata?.corrected_fields) {
      const correctionTimestamp = leadData.raw_metadata.last_customer_reply_at || leadData.last_activity_at || leadData.created_at
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
    
    // Add Payment Request events
    const paymentRequests = leadData?.paymentRequests || []
    if (paymentRequests.length > 0) {
      paymentRequests.forEach((pr: any) => {
        if (pr.status === 'paid') {
          systemEvents.push({
            type: 'system_event',
            id: `payment-paid-${pr.id}`,
            created_at: pr.paid_at || pr.created_at,
            data: {
              message: `Payment Received: $${(pr.amount_cents / 100).toFixed(2)}`,
              timestamp: pr.paid_at || pr.created_at,
              isDivider: true
            }
          })
        } else if (pr.status === 'pending') {
          systemEvents.push({
            type: 'system_event',
            id: `payment-requested-${pr.id}`,
            created_at: pr.created_at,
            data: {
              message: `Payment Requested: $${(pr.amount_cents / 100).toFixed(2)}`,
              timestamp: pr.created_at
            }
          })
        }
      })
    }
    
    // Add Lead Marked Complete event
    if (leadData?.status === 'completed') {
      systemEvents.push({
        type: 'system_event',
        id: `lead-complete-${leadData.id}`,
        created_at: leadData.last_activity_at || leadData.created_at,
        data: {
          message: 'Lead Marked Complete',
          timestamp: leadData.last_activity_at || leadData.created_at
        }
      })
    }
    
    // Add Customer Added Manually event - only for manual leads with no messages
    const isManualLead = leadData?.raw_metadata?.source === 'manual_entry'
    const hasNoMessages = messages.length === 0
    if (isManualLead && hasNoMessages) {
      systemEvents.push({
        type: 'system_event',
        id: `manual-creation-${leadData.id}`,
        created_at: leadData.created_at,
        data: {
          message: 'Customer added manually',
          timestamp: leadData.created_at,
          isDivider: true
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
  }, [leadData?.messages, leadData?.voicemailRecordings, leadData?.aiCallRecords, leadData?.raw_metadata, leadData?.followUpJobs, leadData?.status, leadData?.last_activity_at, leadData?.created_at, leadData?.id])
  
  const messagesArray = leadData?.messages || []
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

  // State for payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDescription, setPaymentDescription] = useState('')
  const [isCreatingPayment, setIsCreatingPayment] = useState(false)
  const [selectedPaymentProvider, setSelectedPaymentProvider] = useState<'stripe' | 'venmo' | 'paypal'>('stripe')
  const paymentAmountRef = useRef<HTMLInputElement>(null)

  // State for appointment confirmation
  const [showAppointmentSelection, setShowAppointmentSelection] = useState(false)
  const [isSendingConfirmation, setIsSendingConfirmation] = useState(false)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const [leadJobs, setLeadJobs] = useState<any[]>([])
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('')
  const [appointmentNote, setAppointmentNote] = useState('')
  const [selectedAppointmentJob, setSelectedAppointmentJob] = useState<any>(null)
  const [isSavingAppointment, setIsSavingAppointment] = useState(false)
  const [appointmentError, setAppointmentError] = useState('')

  useEffect(() => {
    if (!isAppointmentModalOpen || typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isAppointmentModalOpen])

  // Set default payment provider when modal opens
  useEffect(() => {
    if (showPaymentModal && business) {
      const availableProviders = getAvailableProviders(business)
      if (availableProviders.length > 0) {
        // Use business preferred provider if available, otherwise use priority: Stripe > Venmo > PayPal
        if (business.preferred_payment_provider && availableProviders.includes(business.preferred_payment_provider as PaymentProvider)) {
          setSelectedPaymentProvider(business.preferred_payment_provider as PaymentProvider)
        } else if (availableProviders.includes('stripe')) {
          setSelectedPaymentProvider('stripe')
        } else if (availableProviders.includes('venmo')) {
          setSelectedPaymentProvider('venmo')
        } else if (availableProviders.includes('paypal')) {
          setSelectedPaymentProvider('paypal')
        }
      }
      // Autofocus amount field
      setTimeout(() => {
        paymentAmountRef.current?.focus()
      }, 100)
    }
  }, [showPaymentModal, business])

  const fetchLeadJobs = async () => {
    if (!leadData?.id || !business) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) return

      const response = await fetch(`/api/jobs?lead_id=${leadData.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setLeadJobs(data.jobs || [])
      }
    } catch (error) {
      console.error('Error fetching lead jobs:', error)
    }
  }

  // Fetch jobs for lead to check for scheduled appointments
  useEffect(() => {
    fetchLeadJobs()
  }, [leadData?.id, business])

  // Get future scheduled appointments for this lead
  const futureAppointments = leadJobs.filter((job: any) => {
    if (!job.scheduled_date) return false
    const scheduledDate = new Date(job.scheduled_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return scheduledDate >= today
  })

  // Handle appointment confirmation sending
  const handleSendConfirmation = async (jobId: string, successText = 'Appointment confirmation sent.') => {
    if (isSendingConfirmation) return
    setIsSendingConfirmation(true)
    setConfirmationError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/jobs/${jobId}/send-confirmation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send confirmation')
      }

      // Refresh lead data to update job confirmation status
      await handleRefresh()
      await fetchLeadJobs()
      setSuccessMessage(successText)
      setShowAppointmentSelection(false)
    } catch (error: any) {
      setConfirmationError(error.message || 'Failed to send confirmation')
    } finally {
      setIsSendingConfirmation(false)
    }
  }

  // Handle appointment confirmation button click
  const handleConfirmationClick = () => {
    if (futureAppointments.length === 0) {
      return // Should not happen due to button visibility check
    }

    if (futureAppointments.length === 1) {
      const job = futureAppointments[0]
      handleSendConfirmation(job.id)
    } else {
      setShowAppointmentSelection(true)
    }
  }

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
      const statusMessages: Record<LeadLifecycleStatus, string> = {
        new: 'Customer reset to new',
        active: 'Customer marked as active',
        scheduled: 'Customer marked as scheduled',
        payment_requested: 'Customer marked as payment requested',
        paid: 'Customer marked as paid',
        completed: 'Customer marked as complete',
        lost: 'Customer marked as lost',
        ignored: 'Customer marked as ignored'
      }
      setSuccessMessage(statusMessages[newStatus] || `Customer status updated to ${newStatus}`)
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('')
      }, 3000)
      
    } catch (error) {
      console.error('Error updating lead status:', error)
      setError(error instanceof Error ? error.message : `Failed to update lead status`)
    }
  }

  // Handle remove customer
  const handleRemoveCustomer = async () => {
    setIsRemoving(true)
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      // Soft delete the customer using DELETE endpoint
      const response = await fetch(`/api/leads/${params.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete customer')
      }

      // Show success message
      setSuccessMessage('Customer deleted successfully.')
      setShowRemoveModal(false)

      // Redirect to customers list after a short delay
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = '/dashboard/leads'
        }
      }, 1500)
    } catch (error) {
      console.error('Error removing customer:', error)
      setError(error instanceof Error ? error.message : 'Failed to remove customer')
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

  // Fetch business follow-up settings
  useEffect(() => {
    const fetchFollowUpSettings = async () => {
      try {
        const response = await fetch('/api/settings/follow-ups')
        if (response.ok) {
          const data = await response.json()
          setFollowUpSettings(data)
        }
      } catch (error) {
        console.error('Error fetching follow-up settings:', error)
      }
    }

    fetchFollowUpSettings()
  }, [])

  // Realtime subscription for messages, leads, and payment requests
  useEffect(() => {
    const leadId = leadData?.id
    const conversationId = leadData?.conversation_id || leadData?.conversationId
    if (!leadId || !supabase) return

    console.log('[REALTIME SUBSCRIPTION SETUP]', {
      leadId,
      conversationId,
      channelName: `lead-detail:${leadId}`,
      timestamp: new Date().toISOString()
    })

    // Only recreate subscription if lead ID actually changed (navigation to different lead)
    if (currentLeadIdRef.current === leadId) {
      console.log('[REALTIME SUBSCRIPTION] Skipping - lead ID unchanged:', leadId)
      return
    }
    
    // Update ref with new lead ID
    currentLeadIdRef.current = leadId

    // Clean up existing subscription
    if (realtimeChannelRef.current) {
      console.log('[REALTIME SUBSCRIPTION] Cleaning up existing channel')
      supabase.removeChannel(realtimeChannelRef.current)
    }
    
    // Clear any existing stuck message check interval
    if (stuckMessageCheckIntervalRef.current) {
      clearInterval(stuckMessageCheckIntervalRef.current)
      stuckMessageCheckIntervalRef.current = null
    }

    // Set up new subscription
    const channel = supabase
      .channel(`lead-detail:${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `lead_id=eq.${leadId}`
        },
        (payload: any) => {
          console.log('[REALTIME MESSAGE EVENT]', {
            leadId,
            conversationId,
            eventType: payload.eventType,
            messageId: payload.new?.id,
            messageLeadId: payload.new?.lead_id,
            messageConversationId: payload.new?.conversation_id,
            messageStatus: payload.new?.status,
            timestamp: new Date().toISOString()
          })
          
          // Validate filter match
          if (payload.new?.lead_id !== leadId) {
            console.warn('[REALTIME MESSAGE EVENT] Filter mismatch - ignoring:', {
              expectedLeadId: leadId,
              actualLeadId: payload.new?.lead_id,
              messageId: payload.new?.id
            })
            return
          }
          
          if (payload.eventType === 'INSERT') {
            const newMessage = payload.new
            console.log('[REALTIME INSERT] Incoming message payload:', {
              messageId: newMessage.id,
              clientMessageId: newMessage.client_message_id,
              twilioSid: newMessage.twilio_message_sid,
              status: newMessage.status,
              body: newMessage.body?.substring(0, 30),
              created_at: newMessage.created_at
            })
            
            setLeadData((prev: any) => {
              if (!prev) {
                console.log('[REALTIME MESSAGE INSERT] No prev leadData, skipping')
                return prev
              }
              
              const currentMessages = prev.messages || []
              const mergedMessages = mergeMessageWithMonotonicity(currentMessages, newMessage, 'realtime-insert')
              
              // Only scroll if this is a new message (not an optimistic reconciliation)
              const incomingClientMessageId = newMessage.clientMessageId || newMessage.client_message_id
              const isNewMessage = !currentMessages.some((msg: any) => 
                msg.id === newMessage.id || 
                (msg.clientMessageId && msg.clientMessageId === incomingClientMessageId) ||
                (msg.client_message_id && msg.client_message_id === incomingClientMessageId)
              )
              
              if (isNewMessage) {
                setTimeout(() => scrollToBottom('smooth'), 100)
              }
              
              return {
                ...prev,
                messages: mergedMessages,
                last_message_at: newMessage.created_at
              }
            })
          } else if (payload.eventType === 'UPDATE') {
            const updatedMessage = payload.new
            setLeadData((prev: any) => {
              if (!prev) {
                console.log('[REALTIME UPDATE] No prev leadData, skipping')
                return prev
              }
              
              const currentMessages = prev.messages || []
              const mergedMessages = mergeMessageWithMonotonicity(currentMessages, updatedMessage, 'realtime-update')
              
              return { ...prev, messages: mergedMessages }
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leads',
          filter: `id=eq.${leadId}`
        },
        (payload: any) => {
          console.log('[REALTIME LEAD EVENT]', {
            leadId,
            eventType: payload.eventType,
            updatedLeadId: payload.new?.id,
            updatedName: payload.new?.name,
            updatedRawMetadata: payload.new?.raw_metadata
          })
          const updatedLead = payload.new
          setLeadData((prev: any) => {
            if (!prev) {
              console.log('[REALTIME LEAD UPDATE] No prev leadData, skipping')
              return prev
            }
            const merged = { ...prev, ...updatedLead, raw_metadata: { ...prev.raw_metadata, ...updatedLead.raw_metadata } }
            console.log('[REALTIME LEAD UPDATE] Merging lead update:', {
              previousName: prev.name,
              newName: merged.name,
              previousCustomerName: getLeadAIIntake(prev).customerName,
              newCustomerName: getLeadAIIntake(merged).customerName
            })
            return merged
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_requests',
          filter: `lead_id=eq.${leadId}`
        },
        (payload: any) => {
          setLeadData((prev: any) => {
            if (!prev) return prev
            
            const paymentRequests = prev.paymentRequests || []
            if (payload.eventType === 'INSERT') {
              return { ...prev, paymentRequests: [...paymentRequests, payload.new] }
            } else if (payload.eventType === 'UPDATE') {
              return { 
                ...prev, 
                paymentRequests: paymentRequests.map((pr: any) => 
                  pr.id === payload.new.id ? { ...pr, ...payload.new } : pr
                )
              }
            }
            return prev
          })
          fetchLeadJobs()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `lead_id=eq.${leadId}`
        },
        (payload: any) => {
          fetchLeadJobs()
        }
      )
      .subscribe((status: any) => {
        console.log('[REALTIME CONNECTION]', {
          leadId,
          status,
          timestamp: new Date().toISOString()
        })
        
        if (status === 'SUBSCRIBED') {
          console.log('[REALTIME] Successfully subscribed to lead:', leadId)
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[REALTIME] Channel error for lead:', leadId, '- attempting recovery')
          // Attempt recovery after a short delay
          setTimeout(() => {
            console.log('[REALTIME RECOVERY] Refreshing conversation data after channel error')
            handleRefresh()
          }, 2000)
        } else if (status === 'CLOSED') {
          console.log('[REALTIME] Channel closed for lead:', leadId, '- attempting recovery')
          // Attempt recovery after a short delay
          setTimeout(() => {
            console.log('[REALTIME RECOVERY] Refreshing conversation data after channel close')
            handleRefresh()
          }, 2000)
        } else if (status === 'TIMED_OUT') {
          console.warn('[REALTIME] Channel timed out for lead:', leadId, '- attempting recovery')
          // Attempt recovery after a short delay
          setTimeout(() => {
            console.log('[REALTIME RECOVERY] Refreshing conversation data after channel timeout')
            handleRefresh()
          }, 2000)
        }
      })

    realtimeChannelRef.current = channel

    // Start stuck message check interval (bounded recovery - only check twice)
    let checkCount = 0
    const maxChecks = 2
    stuckMessageCheckIntervalRef.current = setInterval(() => {
      checkCount++
      
      const messages = leadData?.messages || []
      const stuckMessages = messages.filter((msg: any) => {
        // Check for messages stuck in "sending" for more than 10 seconds
        if (msg.status === 'sending' || msg.status === 'pending') {
          const messageAge = Date.now() - new Date(msg.created_at).getTime()
          return messageAge > 10000 // 10 seconds
        }
        return false
      })
      
      if (stuckMessages.length > 0 && checkCount <= maxChecks) {
        console.log('[STUCK MESSAGE CHECK] Found stuck messages, refreshing:', {
          count: stuckMessages.length,
          messageIds: stuckMessages.map((m: any) => m.id),
          checkCount,
          maxChecks
        })
        handleRefresh()
      } else if (checkCount > maxChecks) {
        // Stop checking after max checks to avoid infinite polling
        console.log('[STUCK MESSAGE CHECK] Max checks reached, stopping interval')
        if (stuckMessageCheckIntervalRef.current) {
          clearInterval(stuckMessageCheckIntervalRef.current)
          stuckMessageCheckIntervalRef.current = null
        }
      }
    }, 10000) // Check every 10 seconds

    // Cleanup on unmount or lead ID change
    return () => {
      if (realtimeChannelRef.current) {
        console.log('[REALTIME SUBSCRIPTION CLEANUP] Removing channel')
        supabase.removeChannel(realtimeChannelRef.current)
        realtimeChannelRef.current = null
        currentLeadIdRef.current = null
      }
      if (stuckMessageCheckIntervalRef.current) {
        clearInterval(stuckMessageCheckIntervalRef.current)
        stuckMessageCheckIntervalRef.current = null
      }
    }
  }, [leadData?.id]) // Only depend on leadId, not supabase (which is now a ref)

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

    // Create stable client message ID for correlation
    const clientMessageId = crypto.randomUUID()
    
    console.log('[OPTIMISTIC CREATION] Creating optimistic message:', {
      temporaryId: clientMessageId,
      clientMessageId,
      body: message.trim().substring(0, 30)
    })
    
    // Only create optimistic message for text-only SMS (skip for MMS)
    // Merge it directly into leadData.messages to prevent duplicate flash
    if (!isMMS) {
      const optimisticMsg = {
        id: clientMessageId,
        clientMessageId,
        direction: 'outbound',
        body: message.trim(),
        status: 'sending',
        created_at: new Date().toISOString(),
        isOptimistic: true
      }
      
      // Atomic: merge optimistic message directly into messages array
      // This prevents duplicate flash by having single source of truth
      setLeadData((prev: any) => {
        if (!prev) return prev
        
        const currentMessages = prev.messages || []
        const mergedMessages = mergeMessageWithMonotonicity(currentMessages, optimisticMsg, 'optimistic-create')
        
        return {
          ...prev,
          messages: mergedMessages
        }
      })
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
        formData.append('clientMessageId', clientMessageId)
        
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
            clientMessageId
          })
        })
      }

      console.log('[API REQUEST] Sent message with clientMessageId:', {
        clientMessageId,
        body: message.trim().substring(0, 30)
      })

      const result = await response.json()

      if (!response.ok) {
        // Update optimistic message to failed state (SMS only)
        if (!isMMS) {
          setLeadData((prev: any) => {
            if (!prev) return prev
            
            const currentMessages = prev.messages || []
            const failedMessage = {
              id: clientMessageId,
              clientMessageId,
              direction: 'outbound',
              body: message.trim(),
              status: 'failed',
              error_message: result.error || 'We couldn\'t send this message',
              created_at: new Date().toISOString(),
              isOptimistic: true
            }
            
            const mergedMessages = mergeMessageWithMonotonicity(currentMessages, failedMessage, 'optimistic-failed')
            
            return {
              ...prev,
              messages: mergedMessages
            }
          })
        }
        
        // Show appropriate error message based on response
        if (result.error === 'Lead not found') {
          setError('Customer not found. Please refresh the page and try again.')
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

      // Update optimistic message with real message data using clientMessageId (SMS only)
      if (!isMMS && result.clientMessageId === clientMessageId && result.message) {
        console.log('[SEND RECONCILIATION] API returned persisted message:', {
          messageId: result.message.id,
          status: result.message.status,
          twilioSid: result.message.twilio_message_sid,
          clientMessageId: result.message.client_message_id,
          body: result.message.body?.substring(0, 30)
        })
        
        // Add clientMessageId to the persisted message for proper reconciliation
        const persistedMessageWithClientId = {
          ...result.message,
          clientMessageId: result.message.client_message_id || clientMessageId
        }
        
        // Atomic update: merge persisted message AND clear optimistic in single setState
        // This prevents the duplicate flash by ensuring both happen together
        setLeadData((prev: any) => {
          if (!prev) return prev
          
          const currentMessages = prev.messages || []
          const mergedMessages = mergeMessageWithMonotonicity(currentMessages, persistedMessageWithClientId, 'send-response-reconcile')
          
          return {
            ...prev,
            messages: mergedMessages
          }
        })
        
        // Fallback: if message still shows Sending after 3 seconds, refresh
        setTimeout(() => {
          setLeadData((prev: any) => {
            if (!prev) return prev
            
            const message = prev.messages?.find((m: any) => m.id === result.message.id)
            if (message && (message.status === 'sending' || message.status === 'pending')) {
              console.log('[SEND RECONCILIATION FALLBACK] Message still Sending after 3 seconds, refreshing:', result.message.id)
              handleRefresh()
            }
            
            return prev
          })
        }, 3000)
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

      // Clear input - no success banner, bubble status is the confirmation
      setMessage('')
      
      // Scroll to bottom to show the new message
      setTimeout(() => {
        scrollToBottom('smooth')
      }, 50)
    } catch (err) {
      // Update optimistic message to failed state (SMS only)
      if (!isMMS) {
        setLeadData((prev: any) => {
          if (!prev) return prev
          
          const currentMessages = prev.messages || []
          const failedMessage = {
            id: clientMessageId,
            clientMessageId,
            direction: 'outbound',
            body: message.trim(),
            status: 'failed',
            error_message: 'Network error occurred',
            created_at: new Date().toISOString(),
            isOptimistic: true
          }
          
          const mergedMessages = mergeMessageWithMonotonicity(currentMessages, failedMessage, 'network-error-failed')
          
          return {
            ...prev,
            messages: mergedMessages
          }
        })
      }
      setError('Failed to send message')
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
          const mergedMessages = mergeMessagesById(existingMessages, newMessages, 'refresh')
          
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

  const checkCalendarConnection = async () => {
    setIsLoadingCalendarStatus(true)
    try {
      const response = await fetch('/api/google/calendar/status', {
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        setCalendarConnected(data.connected || false)
      } else {
        setCalendarConnected(false)
      }
    } catch (error) {
      console.error('Failed to check calendar connection:', error)
      setCalendarConnected(false)
    } finally {
      setIsLoadingCalendarStatus(false)
    }
  }

  useEffect(() => {
    checkCalendarConnection()
  }, [])

  const handleScheduleClick = () => {
    // Check if there are existing jobs for this lead
    if (leadJobs && leadJobs.length > 0) {
      // If there are jobs, open JobComposer to edit the first job's schedule
      const firstJob = leadJobs[0]
      setJobPrefill({
        ...generateJobPrefill(),
        title: firstJob.title,
        customer_name: firstJob.customer_name,
        customer_phone: firstJob.customer_phone,
        service_address: firstJob.service_address,
        notes: firstJob.notes,
        scheduled_date: firstJob.scheduled_date,
        scheduled_time: firstJob.scheduled_time,
      })
      setIsJobComposerOpen(true)
    } else {
      // If no jobs, create a new job with scheduling
      setJobPrefill(generateJobPrefill())
      setIsJobComposerOpen(true)
    }
  }

  // Generate JobComposer prefill data from lead and AI intake
  const generateJobPrefill = (): JobPrefill => {
    const intake = getLeadAIIntake(leadData)
    const leadName = intake.customerName || leadData?.name || ''
    const leadPhone = intake.customerPhone || leadData?.caller_phone || ''
    const leadReason = intake.serviceRequested
    const leadAddress = intake.serviceAddress

    if (process.env.NODE_ENV !== 'production') {
      console.log('[generateJobPrefill debug]', {
        leadId: params.id,
        leadName: leadData?.name,
        callerPhone: leadData?.caller_phone,
        aiCallRecordsCount: leadData?.aiCallRecords?.length,
        firstOutcome: leadData?.aiCallRecords?.[0]?.outcome,
        firstCallSid: leadData?.aiCallRecords?.[0]?.call_sid,
        intake,
      })
    }

    const noteSections = []
    
    if (intake.additionalDetails) {
      noteSections.push(`Additional Details\n• ${intake.additionalDetails}`)
    }

    // Derive scheduling prefill from AI intake
    const schedulingPrefill = deriveJobSchedulingPrefill(
      intake.desiredCompletion,
      intake.callbackTime
    )

    return {
      title: leadReason || `Job for ${leadName || 'Customer'}`,
      customer_name: leadName || undefined,
      customer_phone: leadPhone || undefined,
      service_address: leadAddress || undefined,
      notes: noteSections.length > 0 ? noteSections.join('\n\n') : undefined,
      lead_id: params.id,
      conversation_id: leadData?.conversation_id || undefined,
      scheduled_date: schedulingPrefill.date,
      scheduled_time: schedulingPrefill.time,
      requested_completion_label: schedulingPrefill.requestedCompletionLabel,
      callback_preference_label: schedulingPrefill.callbackPreferenceLabel,
    }
  }

  const handleCreateJobClick = () => {
    setJobPrefill(generateJobPrefill())
    setIsJobComposerOpen(true)
  }

  const renderWorkspaceSection = () => {
    const paymentRequests = leadData?.paymentRequests || []

    return (
      <div className="space-y-3 sm:space-y-5">
        {/* Jobs & Appointments - Collapsible - Compact on mobile */}
        <div className="bg-card rounded-xl border border-border/50 p-3 sm:p-4">
          <button
            onClick={() => setCollapsedSections((prev: any) => ({ ...prev, jobs: !prev.jobs }))}
            className="flex items-center justify-between w-full mb-2 sm:mb-3 group"
          >
            <h3 className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">Jobs</h3>
            <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.jobs ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections.jobs && (
            <div className="transition-all duration-200">
              {leadJobs.length === 0 ? (
                <div className="text-center py-2 sm:py-4">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">No jobs scheduled for this customer yet.</p>
                  <button
                    onClick={handleCreateJobClick}
                    className="inline-flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] sm:text-xs font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">Add Job</span>
                    <span className="sm:hidden">Add Job</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {leadJobs.slice(0, 3).map((job: any) => (
                    <div key={job.id} className="flex items-center justify-between p-2.5 bg-muted/50 hover:bg-muted/70 rounded-lg transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{job.title || 'Job'}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : 'No date'}
                          {job.scheduled_time ? ` • ${job.scheduled_time}` : ''}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize whitespace-nowrap ml-2 border border-border/50">
                        {job.status}
                      </span>
                    </div>
                  ))}
                  {leadJobs.length > 3 && (
                    <button
                      onClick={handleAppointmentClick}
                      className="w-full text-center text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      View all {leadJobs.length} jobs
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Payment Requests - Collapsible - Compact on mobile */}
        <div className="bg-card rounded-xl border border-border/50 p-3 sm:p-4">
          <button
            onClick={() => setCollapsedSections((prev: any) => ({ ...prev, payments: !prev.payments }))}
            className="flex items-center justify-between w-full mb-2 sm:mb-3 group"
          >
            <h3 className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">Payments</h3>
            <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.payments ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections.payments && (
            <div className="transition-all duration-200">
              {paymentRequests.length === 0 ? (
                <div className="text-center py-2 sm:py-4">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">You haven't requested payment from this customer yet.</p>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    disabled={!business || getAvailableProviders(business).length === 0}
                    className="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3 sm:py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] sm:text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">Request Payment</span>
                    <span className="sm:hidden">Request</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {paymentRequests.map((pr: any) => (
                    <div key={pr.id} className="flex items-center justify-between p-2.5 bg-muted/50 hover:bg-muted/70 rounded-lg transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{formatCurrency(pr.amount_cents / 100)}</p>
                        <p className="text-xs text-muted-foreground">{pr.created_at ? new Date(pr.created_at).toLocaleDateString() : ''}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize whitespace-nowrap ml-2 border border-border/50 ${
                        pr.status === 'paid'
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : pr.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {pr.status === 'paid' ? 'Paid' : pr.status === 'pending' ? 'Awaiting Payment' : pr.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Activity - Collapsible - Compact on mobile */}
        <div className="bg-card rounded-xl border border-border/50 p-3 sm:p-4">
          <button
            onClick={() => setCollapsedSections((prev: any) => ({ ...prev, recentActivity: !prev.recentActivity }))}
            className="flex items-center justify-between w-full mb-2 sm:mb-3 group"
          >
            <h3 className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">Recent Activity</h3>
            <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.recentActivity ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections.recentActivity && (
            <div className="transition-all duration-200">
              {conversationTimeline.length === 0 ? (
                <div className="text-center py-2 sm:py-4">
                  <p className="text-xs sm:text-sm text-muted-foreground">No activity yet.</p>
                </div>
              ) : (
                <div className="space-y-0 max-h-60 sm:max-h-80 overflow-y-auto pr-1">
                  {conversationTimeline.slice(-10).reverse().map((item: any, index: number) => {
                    // Determine event label and icon
                    let eventLabel = ''
                    let eventIcon = null
                    let isExpandable = false
                    let expandedContent = null

                    if (item.type === 'message') {
                      if (item.data?.direction === 'inbound') {
                        eventLabel = 'Customer replied'
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      } else {
                        eventLabel = 'SMS sent'
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                      }
                    } else if (item.type === 'voicemail') {
                      eventLabel = 'Voicemail'
                      eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    } else if (item.type === 'system_event') {
                      const message = item.data?.message || ''
                      if (message.includes('Completed Request') || message.includes('Partial Request') || message.includes('Caller Hung Up')) {
                        eventLabel = 'AI intake'
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        isExpandable = true
                        const aiCallId = item.id.replace('ai-intake-', '')
                        const aiCall = leadData?.aiCallRecords?.find((r: any) => r.id === aiCallId)
                        if (aiCall?.extracted_info) {
                          const extracted = aiCall.extracted_info
                          expandedContent = (
                            <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-border/50 space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs">
                              {extracted.reasonForCalling && (
                                <div><span className="text-muted-foreground">Service:</span> {extracted.reasonForCalling}</div>
                              )}
                              {extracted.addressOrLocation && (
                                <div><span className="text-muted-foreground">Address:</span> {extracted.addressOrLocation}</div>
                              )}
                              {extracted.preferredCallbackTime && (
                                <div><span className="text-muted-foreground">Callback:</span> {extracted.preferredCallbackTime}</div>
                              )}
                              {extracted.desiredCompletionTime && (
                                <div><span className="text-muted-foreground">Completion:</span> {extracted.desiredCompletionTime}</div>
                              )}
                              {extracted.importantDetails && (
                                <div><span className="text-muted-foreground">Details:</span> {extracted.importantDetails}</div>
                              )}
                            </div>
                          )
                        }
                      } else if (message.includes('Customer Corrected') || message.includes('Customer Updated')) {
                        eventLabel = 'Customer updated'
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2h2.828l8.586-8.586z" /></svg>
                      } else if (message.includes('Follow-Ups Cancelled')) {
                        eventLabel = 'Follow-ups cancelled'
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      } else if (message.includes('Customer Sent Photos')) {
                        eventLabel = 'Photos sent'
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      } else if (message.includes('Payment Received')) {
                        eventLabel = 'Payment received'
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      } else if (message.includes('Payment Requested')) {
                        eventLabel = 'Payment requested'
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                      } else if (message.includes('Lead Marked Complete')) {
                        eventLabel = 'Marked complete'
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      } else if (message.includes('added manually')) {
                        eventLabel = 'Customer created'
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                      } else {
                        eventLabel = message
                        eventIcon = <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      }
                    }

                    return (
                      <div key={item.id}>
                        <div className="flex gap-2 sm:gap-3 py-1.5 sm:py-3">
                          <div className="mt-0.5 flex-shrink-0">
                            {eventIcon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <button
                              onClick={() => {
                                if (isExpandable) {
                                  const element = document.getElementById(`expanded-${item.id}`)
                                  if (element) {
                                    element.classList.toggle('hidden')
                                  }
                                }
                              }}
                              className="text-left w-full"
                            >
                              <p className="text-[11px] sm:text-sm font-medium text-foreground break-words hover:text-primary transition-colors">
                                {eventLabel}
                              </p>
                              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{formatRelativeTime(item.created_at)}</p>
                            </button>
                            {isExpandable && expandedContent && (
                              <div id={`expanded-${item.id}`} className="hidden">
                                {expandedContent}
                              </div>
                            )}
                          </div>
                        </div>
                        {index < conversationTimeline.slice(-10).reverse().length - 1 && (
                          <div className="border-t border-border/30"></div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const handleAppointmentClick = () => {
    const appointmentJob = futureAppointments[0] || leadJobs[0] || null
    setSelectedAppointmentJob(appointmentJob)
    setAppointmentDate(appointmentJob?.scheduled_date || '')
    setAppointmentTime(appointmentJob?.scheduled_time?.slice(0, 5) || '')
    setAppointmentNote(appointmentJob?.notes || '')
    setAppointmentError('')
    setIsAppointmentModalOpen(true)
  }

  const handleSaveAppointment = async (sendConfirmation = false) => {
    if (isSavingAppointment || isSendingConfirmation) return
    if (sendConfirmation && (!appointmentDate || !appointmentTime)) {
      setAppointmentError('Choose an appointment date and time before sending confirmation.')
      return
    }

    setIsSavingAppointment(true)
    setAppointmentError('')
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const prefill = generateJobPrefill()
      const body = {
        title: selectedAppointmentJob?.title || prefill.title,
        customer_name: selectedAppointmentJob?.customer_name || prefill.customer_name || null,
        customer_phone: selectedAppointmentJob?.customer_phone || prefill.customer_phone || null,
        service_address: selectedAppointmentJob?.service_address || prefill.service_address || null,
        notes: appointmentNote.trim() || selectedAppointmentJob?.notes || prefill.notes || null,
        scheduled_date: appointmentDate || null,
        scheduled_time: appointmentTime || null,
        status: selectedAppointmentJob?.status || 'scheduled',
        source: 'replyflow',
        lead_id: params.id,
        conversation_id: leadData?.conversation_id || null,
      }

      const response = await fetch(selectedAppointmentJob ? `/api/jobs/${selectedAppointmentJob.id}` : '/api/jobs', {
        method: selectedAppointmentJob ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save appointment')
      }

      const data = await response.json()
      const savedJob = data.job
      await fetchLeadJobs()

      if (sendConfirmation) {
        await handleSendConfirmation(savedJob.id, 'Appointment saved and confirmation sent.')
      } else {
        setSuccessMessage('Appointment saved.')
      }

      setIsAppointmentModalOpen(false)
    } catch (error: any) {
      setAppointmentError(error.message || 'Failed to save appointment')
    } finally {
      setIsSavingAppointment(false)
    }
  }

  const handleJobSave = (job: Job) => {
    setSuccessMessage('Job created.\nAdded to your schedule.')
    setIsJobComposerOpen(false)
    fetchLeadJobs()
  }

  // Generate comprehensive prefill data from customer and AI intake
  const generateAppointmentPrefill = () => {
    const intake = getLeadAIIntake(leadData)
    const leadName = intake.customerName || leadData?.name || 'Customer'
    const leadPhone = formatPhoneNumber(intake.customerPhone || leadData?.caller_phone || '')
    const leadReason = intake.serviceRequested || leadData?.company_name || ''
    const leadDetails = intake.additionalDetails || ''
    const leadUrgency = intake.desiredCompletion || ''
    const leadLocation = intake.serviceAddress || ''
    const leadCallbackTime = intake.callbackTime || ''
    const leadCallbackNumber = leadPhone

    if (process.env.NODE_ENV !== 'production') {
      console.log('[generateAppointmentPrefill debug]', {
        leadId: params.id,
        leadName,
        leadReason,
        leadLocation,
        intake,
      })
    }

    // Generate title
    const title = leadReason
      ? `${leadReason} - ${leadName}`
      : `Appointment with ${leadName}`

    // Generate comprehensive description
    let description = `Customer: ${leadName}\n`
    description += `Phone: ${leadPhone}\n`
    
    if (leadCallbackNumber && leadCallbackNumber !== leadPhone) {
      description += `Callback number: ${leadCallbackNumber}\n`
    }
    
    if (leadReason) {
      description += `Reason: ${leadReason}\n`
    }
    
    if (leadDetails) {
      description += `Details: ${leadDetails}\n`
    }
    
    if (leadUrgency) {
      description += `Urgency: ${leadUrgency}\n`
    }
    
    if (leadCallbackTime) {
      description += `Preferred callback time: ${leadCallbackTime}\n`
    }

    description += `\nCustomer link: https://replyflowhq.com/dashboard/leads/${params.id}`

    return {
      title,
      description,
      eventType: 'appointment',
      location: leadLocation || undefined
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
      if (updatedLead?.ok && updatedLead.lead) {
        setLeadData({ ...updatedLead.lead, messages: updatedLead.lead.messages || updatedLead.messages || [] })
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

    // Generate a new clientMessageId for this retry attempt if not provided
    const retryClientMessageId = clientTempId || crypto.randomUUID()

    // If retrying an optimistic message, update its status in the messages array
    if (messageId || clientTempId) {
      setLeadData((prev: any) => {
        if (!prev) return prev
        
        const currentMessages = prev.messages || []
        const updatedMessages = currentMessages.map((msg: any) => {
          if (msg.id === messageId || msg.clientMessageId === clientTempId) {
            return {
              ...msg,
              clientMessageId: retryClientMessageId,
              status: 'sending'
            }
          }
          return msg
        })
        
        return {
          ...prev,
          messages: updatedMessages
        }
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
          clientMessageId: retryClientMessageId
        })
      })

      const result = await response.json()

      if (!response.ok) {
        // Update message back to failed
        if (messageId || clientTempId) {
          setLeadData((prev: any) => {
            if (!prev) return prev
            
            const currentMessages = prev.messages || []
            const updatedMessages = currentMessages.map((msg: any) => {
              if (msg.id === messageId || msg.clientMessageId === clientTempId) {
                return {
                  ...msg,
                  status: 'failed',
                  error_message: result.error || 'Failed to send message'
                }
              }
              return msg
            })
            
            return {
              ...prev,
              messages: updatedMessages
            }
          })
        }
        
        // Show appropriate error message based on response
        if (result.error === 'Lead not found') {
          setError('Customer not found. Please refresh the page and try again.')
        } else if (result.error === 'Business not found') {
          setError('Business not found. Please contact support.')
        } else if (result.error?.includes('verification') || result.error?.includes('carrier')) {
          setError('Phone setup still pending. Delivery may fail until approved.')
        } else {
          setError(result.error || 'Failed to send message')
        }
        return
      }

      // Update message with real message data using clientMessageId
      if (result.clientMessageId === retryClientMessageId && result.message) {
        console.log('[Retry] API returned message id:', result.message.id, 'status:', result.message.status)
        
        // Merge the returned message into local state
        setLeadData((prev: any) => {
          if (!prev) return prev
          
          const currentMessages = prev.messages || []
          const persistedMessageWithClientId = {
            ...result.message,
            clientMessageId: result.message.client_message_id || retryClientMessageId
          }
          const mergedMessages = mergeMessageWithMonotonicity(currentMessages, persistedMessageWithClientId)
          
          console.log('[Retry] Messages after local update:', mergedMessages.length)
          
          return {
            ...prev,
            messages: mergedMessages
          }
        })
      }
    } catch (err) {
      // Update message back to failed on network error
      if (messageId || clientTempId) {
        setLeadData((prev: any) => {
          if (!prev) return prev
          
          const currentMessages = prev.messages || []
          const updatedMessages = currentMessages.map((msg: any) => {
            if (msg.id === messageId || msg.clientMessageId === clientTempId) {
              return {
                ...msg,
                status: 'failed',
                error_message: 'Network error occurred'
              }
            }
            return msg
          })
          
          return {
            ...prev,
            messages: updatedMessages
          }
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
              href="/dashboard/leads"
              className="inline-flex items-center text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
              onClick={() => console.log('[LEAD DETAIL HEADER BACK] clicked -> /dashboard/leads')}
            >
              ← Back to Customers
            </Link>
          </div>
          <div className="bg-card rounded-lg shadow border border-border p-8 text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Customer not found</h1>
            <p className="text-muted-foreground mb-6">
              {error || 'The customer you\'re looking for doesn\'t exist or you don\'t have permission to view it.'}
            </p>
            <Link
              href="/dashboard/leads"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              onClick={() => console.log('[LEAD DETAIL HEADER BACK] clicked -> /dashboard/leads')}
            >
              Return to Customers
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
    <DashboardErrorBoundary>
      <main className="min-h-screen bg-background flex flex-col overflow-x-hidden">
      {/* Standard App Header */}
      <AppHeader />

      {/* Conversation Sub-Header - Compact on mobile */}
      <div className="bg-white/95 dark:bg-slate-950/95 border-b border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3">
          {/* Mobile Layout: Compact Information Header */}
          <div className="md:hidden">
            <div className="flex items-center justify-between gap-2">
              {/* Back button + Customer name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <AppBackButton fallbackHref="/dashboard/leads" label="" />
                <h1 className="font-semibold text-slate-950 dark:text-white text-base leading-tight truncate">
                  {getLeadDisplayName(leadData || lead)}
                </h1>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Info Button */}
                <button
                  onClick={() => setShowLeadInfo(!showLeadInfo)}
                  className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
                  title="Customer information"
                  aria-label="Customer information"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                
                {/* Mobile Overflow Button */}
                <button
                  onClick={() => setShowMobileOverflow(!showMobileOverflow)}
                  className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
                  title="More actions"
                  aria-label="More actions"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>

                    {/* Mobile Overflow Menu */}
                    {showMobileOverflow && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowMobileOverflow(false)}
                        />
                        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[180px]">
                          {(leadData?.phone_number || lead?.phone) && (leadData?.phone_number || lead?.phone) !== '+10000000000' && (
                            <a
                              href={`tel:${leadData?.phone_number || lead?.phone}`}
                              onClick={() => setShowMobileOverflow(false)}
                              className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z" />
                              </svg>
                              Call
                            </a>
                          )}
                          <button
                            onClick={() => {
                              handleCreateJobClick()
                              setShowMobileOverflow(false)
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                          >
                            <ClipboardPlus className="w-4 h-4 stroke-[1.8]" />
                            Create Job
                          </button>
                          <button
                            onClick={() => {
                              handleAppointmentClick()
                              setShowMobileOverflow(false)
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                          >
                            <CalendarDays className="w-4 h-4 stroke-[1.8]" />
                            Appointment
                          </button>
                          <button
                            onClick={() => {
                              setShowPaymentModal(true)
                              setShowMobileOverflow(false)
                            }}
                            disabled={!business || getAvailableProviders(business).length === 0}
                            className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
                          >
                            <CreditCard className="w-3.5 h-3.5 stroke-[1.8]" />
                            Request Payment
                          </button>
                          <button
                            onClick={() => {
                              setShowRemoveModal(true)
                              setShowMobileOverflow(false)
                            }}
                            className="w-full px-3 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Remove
                          </button>
                          <button
                            onClick={() => {
                              setMobileInternalNotesExpanded(!mobileInternalNotesExpanded)
                              setShowMobileOverflow(false)
                            }}
                            className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 flex items-center gap-2.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2h2.828l8.586-8.586z" />
                            </svg>
                            Internal Notes
                          </button>
                          {getLeadLifecycleStatus(leadData || lead) !== 'ignored' && (
                            <button
                              onClick={() => {
                                handleStatusUpdate('ignored')
                                setShowMobileOverflow(false)
                              }}
                              className="w-full px-3 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              Mark as Ignored
                            </button>
                          )}
                          {getLeadLifecycleStatus(leadData || lead) === 'ignored' && (
                            <button
                              onClick={() => {
                                handleStatusUpdate('active')
                                setShowMobileOverflow(false)
                              }}
                              className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 flex items-center gap-2.5"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Restore Customer
                            </button>
                          )}
                          <div className="border-t border-border/50 my-1" />
                          <button
                            onClick={() => {
                              handleRefresh()
                              setShowMobileOverflow(false)
                            }}
                            disabled={refreshing}
                            className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
                          >
                            <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                          </button>
                          <button
                            onClick={() => {
                              setShowDeleteModal(true)
                              setShowMobileOverflow(false)
                            }}
                            className="w-full px-3 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete Customer
                          </button>
                        </div>
                      </>
                    )}
              </div>
            </div>
            
            {/* Compact metadata row - only show essential info */}
            <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
              <span>{formatPhoneNumber(getLeadAIIntake(leadData || lead).customerPhone || lead?.caller_phone || '')}</span>
              <span>•</span>
              <span>{messagesArray.length} msg</span>
              {lead?.last_message_at && (
                <>
                  <span>•</span>
                  <span>{formatRelativeTime(lead.last_message_at)}</span>
                </>
              )}
            </div>
          </div>

          {/* Desktop Layout: Premium Header */}
          <div className="hidden md:block">
            {/* Back to Leads */}
            <div className="mb-4">
              <AppBackButton fallbackHref="/dashboard/leads" label="Back" />
            </div>

            {/* Simplified Two-Column Header */}
            <div className="flex items-start justify-between gap-6">
              {/* LEFT: Customer Info */}
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-2">
                  {getLeadDisplayName(leadData || lead)}
                </h1>
                <p className="text-sm text-muted-foreground mb-2">
                  {formatPhoneNumber(getLeadAIIntake(leadData || lead).customerPhone || lead?.caller_phone || '')}
                </p>
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <span>Customer since {formatRelativeTime(lead?.created_at)}</span>
                  <span>•</span>
                  <span>{messagesArray.length} message{messagesArray.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* RIGHT: Status and Actions */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Status Pill */}
                <div className="flex-shrink-0">
                  <LeadStatusDropdown
                    currentStatus={getLeadLifecycleStatus(leadData || lead)}
                    onStatusChange={handleStatusUpdate}
                    size="sm"
                  />
                </div>

                {/* Primary Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreateJobClick}
                    className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg text-foreground hover:bg-muted transition-colors text-xs font-medium"
                    title="Create job"
                  >
                    <ClipboardPlus className="w-3.5 h-3.5 stroke-[1.8]" />
                    <span className="leading-none">Create Job</span>
                  </button>
                  <button
                    onClick={handleAppointmentClick}
                    className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg text-foreground hover:bg-muted transition-colors text-xs font-medium"
                    title="Schedule appointment"
                  >
                    <CalendarDays className="w-3.5 h-3.5 stroke-[1.8]" />
                    <span className="leading-none">Schedule</span>
                  </button>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    disabled={!business || getAvailableProviders(business).length === 0}
                    className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg text-foreground hover:bg-muted transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!business || getAvailableProviders(business).length === 0 ? 'Configure a payment method in Settings to request payments' : 'Request payment'}
                  >
                    <CreditCard className="w-3.5 h-3.5 stroke-[1.8]" />
                    <span className="leading-none">Request Payment</span>
                  </button>

                  {/* Desktop Overflow Button */}
                  <button
                    ref={overflowButtonRef}
                    onClick={() => setShowOverflowMenu(!showOverflowMenu)}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                    aria-label="More actions"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>

                  {showOverflowMenu && overflowMenuPosition && typeof document !== 'undefined' && createPortal(
                    <>
                      <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => setShowOverflowMenu(false)}
                      />
                      <div
                        className="fixed z-[9999] bg-card border border-border/50 rounded-lg shadow-lg py-1 min-w-[180px]"
                        style={{
                          top: `${overflowMenuPosition.top}px`,
                          left: `${overflowMenuPosition.left}px`
                        }}
                      >
                        <button
                          onClick={() => {
                            handleCreateJobClick()
                            setShowOverflowMenu(false)
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors"
                        >
                          <ClipboardPlus className="w-3.5 h-3.5 stroke-[1.8]" />
                          Create Job
                        </button>
                        <button
                          onClick={() => {
                            handleAppointmentClick()
                            setShowOverflowMenu(false)
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors"
                        >
                          <CalendarDays className="w-3.5 h-3.5 stroke-[1.8]" />
                          Schedule
                        </button>
                        <button
                          onClick={() => {
                            setShowPaymentModal(true)
                            setShowOverflowMenu(false)
                          }}
                          disabled={!business || getAvailableProviders(business).length === 0}
                          className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors"
                        >
                          <CreditCard className="w-3.5 h-3.5 stroke-[1.8]" />
                          Request Payment
                        </button>
                        <div className="border-t border-border/50 my-1" />
                        <button
                          onClick={() => {
                            setMobileInternalNotesExpanded(true)
                            setShowLeadInfo(true)
                            setShowOverflowMenu(false)
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Internal Notes
                        </button>
                        <button
                          onClick={() => {
                            handleRefresh()
                            setShowOverflowMenu(false)
                          }}
                          disabled={refreshing}
                          className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors"
                        >
                          <svg
                            className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Refresh
                        </button>
                        <div className="border-t border-border/50 my-1" />
                        {getLeadLifecycleStatus(leadData || lead) !== 'ignored' && (
                          <button
                            onClick={() => {
                              handleStatusUpdate('ignored')
                              setShowOverflowMenu(false)
                            }}
                            className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Mark Ignored
                          </button>
                        )}
                        {getLeadLifecycleStatus(leadData || lead) === 'ignored' && (
                          <button
                            onClick={() => {
                              handleStatusUpdate('active')
                              setShowOverflowMenu(false)
                            }}
                            className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Restore Customer
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setShowRemoveModal(true)
                            setShowOverflowMenu(false)
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Remove
                        </button>
                        <button
                          onClick={() => {
                            setShowDeleteModal(true)
                            setShowOverflowMenu(false)
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862 2 2 0 011-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Customer
                        </button>
                      </div>
                    </>
                  , document.body)}
                </div>
              </div>
            </div>

            {successMessage && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 whitespace-pre-line dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300">
                {successMessage}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conversation Thread - CSS-based Layout */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 lg:px-8 py-2">
        
        {/* Desktop Layout */}
        <div className="hidden lg:grid lg:grid-cols-[minmax(0,2.5fr)_340px] gap-10 items-start">
          {/* Desktop Conversation Section - Independent Scroll */}
          <section className="flex flex-col min-h-0 h-[calc(100vh-260px)]">
            {/* Desktop Message Thread - Scrollable */}
            <div ref={conversationContainerRef} className="flex-1 overflow-y-auto scroll-smooth px-4 py-3 min-h-0 custom-scrollbar" style={{ minHeight: '200px' }}>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : conversationTimeline.length === 0 ? (
                <div className="flex items-center justify-center h-full py-12 animate-fadeIn">
                  <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-200 dark:border-slate-800">
                      <svg className="w-8 h-8 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Start the conversation</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-sm mx-auto leading-relaxed">
                      Send your first text message to this customer. Messages will appear here in real time as the conversation grows.
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mx-auto">
                      Your message history, customer replies, AI requests, and timeline will automatically build here.
                    </p>
                  </div>
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

            {/* Desktop Message Composer - Fixed to Bottom */}
            <div className="shrink-0 pt-3">
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

          {/* Desktop Sidebar - Simplified */}
          <aside className="sticky top-4 overflow-y-auto max-h-[calc(100vh-260px)]" data-sidebar>
            <div className="space-y-4">
              {/* Consolidated Information Panel - Simplified */}
              <div className="bg-card rounded-xl border border-border/40 p-5">
                <div className="space-y-5">
                  {/* AI Intake Summary */}
                  {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && business?.id && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-4">AI Intake</h3>
                      {(() => {
                        const intake = getLeadAIIntake(leadData || lead)
                        const hasIntake = intake.serviceRequested || leadData?.aiCallRecords?.length > 0
                        if (hasIntake && (intake.serviceRequested || intake.desiredCompletion || intake.callbackTime)) {
                          return (
                            <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border/30">
                              <p className="text-[11px] font-medium text-muted-foreground mb-2">Current Request</p>
                              <p className="text-sm font-semibold text-foreground mb-1">{intake.serviceRequested || 'Service request'}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {intake.desiredCompletion && <span>{intake.desiredCompletion}</span>}
                                {intake.callbackTime && <span>• {intake.callbackTime}</span>}
                              </div>
                            </div>
                          )
                        }
                      })()}
                      <AICallDetails
                        leadId={params.id}
                        businessId={business.id}
                        conversationId={leadData?.conversation?.id}
                        callerPhone={leadData?.phone_number || lead?.phone}
                        leadData={leadData}
                        collapsible={false}
                        onSave={handleRefresh}
                      />
                    </div>
                  )}

                  {/* Customer Summary - Show only for manual customers (no AI intake) */}
                  {!(leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && business?.id) && (
                    <VoicemailSummary leadData={leadData} />
                  )}

                  {/* Customer Status - Premium rows */}
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Customer Status</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm text-foreground font-medium">AI Intake</span>
                        <span className={`text-sm font-semibold ${getAIIntakeStatusColor(getAIIntakeStatus(leadData || lead)).replace('bg-', 'text-').replace('dark:bg-', 'dark:text-').replace('/30', '').replace('/20', '')}`}>
                          {getAIIntakeStatusLabel(getAIIntakeStatus(leadData || lead))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm text-foreground font-medium">Customer Replied</span>
                        <span className={`text-sm font-semibold ${
                          leadData?.raw_metadata?.customer_replied || leadData?.raw_metadata?.replied_after_ai_call || leadData?.raw_metadata?.last_customer_reply_at || followUpJobs.some((j: any) => j.cancelled_reason === 'customer_replied')
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-muted-foreground'
                        }`}>
                          {leadData?.raw_metadata?.customer_replied || leadData?.raw_metadata?.replied_after_ai_call || leadData?.raw_metadata?.last_customer_reply_at || followUpJobs.some((j: any) => j.cancelled_reason === 'customer_replied') ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm text-foreground font-medium">Corrections</span>
                        <span className={`text-sm font-semibold ${
                          (leadData?.raw_metadata?.corrected_fields && Object.keys(leadData.raw_metadata.corrected_fields).length > 0)
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                        }`}>
                          {leadData?.raw_metadata?.corrected_fields ? Object.keys(leadData.raw_metadata.corrected_fields).length : 0}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm text-foreground font-medium">Follow-Ups</span>
                        <span className={`text-sm font-semibold ${
                          !followUpSettings || !followUpSettings.followUps || followUpSettings.followUps.length === 0
                            ? 'text-muted-foreground'
                            : !followUpSettings.enabled
                            ? 'text-muted-foreground'
                            : followUpJobs.some((j: any) => j.status === 'pending')
                            ? 'text-amber-600 dark:text-amber-400'
                            : followUpJobs.some((j: any) => j.status === 'sent')
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}>
                          {!followUpSettings || !followUpSettings.followUps || followUpSettings.followUps.length === 0
                            ? 'Not Configured'
                            : !followUpSettings.enabled
                            ? 'Disabled'
                            : followUpJobs.some((j: any) => j.status === 'pending')
                            ? 'Active'
                            : followUpJobs.some((j: any) => j.status === 'sent')
                            ? 'Complete'
                            : 'Configured'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Photos Received - Simplified */}
                  {Object.keys(messageMedia).length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">Photos</h3>
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
                                className="w-full h-24 object-cover rounded-lg border border-slate-200/50 dark:border-slate-700/50 hover:opacity-90 transition-opacity"
                                loading="lazy"
                              />
                            </div>
                          ))
                        ))}
                      </div>
                      {Object.keys(messageMedia).length > 4 && (
                        <button
                          onClick={() => setShowAllPhotos(!showAllPhotos)}
                          className="w-full mt-3 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                        >
                          {showAllPhotos ? 'Show Less' : `View All Photos (${Object.keys(messageMedia).length})`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* Workspace Section - Below conversation for desktop */}
          <div className="hidden lg:block lg:col-span-2 mt-8">
            {renderWorkspaceSection()}
          </div>
        </div>
        
        {/* Mobile Layout - Conversation-first: Header -> Conversation -> Collapsible Sections */}
        <div className="lg:hidden space-y-2 pb-[calc(6rem+env(safe-area-inset-bottom))]">
          {/* Minimal Header */}
          <div className="flex items-center gap-3 px-2 py-2">
            <AppBackButton fallbackHref="/dashboard/leads" label="Back" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-foreground tracking-tight mb-0.5 truncate">
                {getLeadDisplayName(leadData)}
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground font-normal">
                  {formatPhoneNumber(getLeadAIIntake(leadData || lead).customerPhone || lead?.caller_phone || '')}
                </p>
                {!loading && conversationTimeline.length > 0 && (
                  <>
                    <span className="text-muted-foreground/50">•</span>
                    <p className="text-xs text-muted-foreground">
                      {conversationTimeline.length} message{conversationTimeline.length !== 1 ? 's' : ''}
                    </p>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowMobileOverflow(!showMobileOverflow)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-xl transition-all duration-200 flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          </div>

          {/* Compact Status Pills */}
          <div className="flex flex-wrap gap-1.5 px-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-200 ${
              leadData?.aiCallRecords && leadData.aiCallRecords.length > 0
                ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200/50 dark:border-green-800/30'
                : leadData?.voicemailRecordings && leadData.voicemailRecordings.some((v: any) => v.transcription_text)
                  ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200/50 dark:border-green-800/30'
                  : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/20 border border-slate-200/50 dark:border-slate-800/30'
            }`}>
              {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0
                ? 'AI Answered'
                : leadData?.voicemailRecordings && leadData.voicemailRecordings.some((v: any) => v.transcription_text)
                  ? 'Voicemail Saved'
                  : 'Waiting for Call'}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-200 ${leadData?.messages?.some((m: any) => m.direction === 'inbound') ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/30' : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/20 border border-slate-200/50 dark:border-slate-800/30'}`}>
              {leadData?.messages?.some((m: any) => m.direction === 'inbound') ? 'Customer Replied' : 'Awaiting Reply'}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-200 ${
              followUpJobs && followUpJobs.length > 0
                ? followUpJobs.some((job: any) => job.status === 'active' || job.status === 'scheduled')
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/30'
                  : followUpJobs.some((job: any) => job.status === 'completed')
                    ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200/50 dark:border-green-800/30'
                    : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/20 border border-slate-200/50 dark:border-slate-800/30'
                : followUpSettings?.enabled
                  ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200/50 dark:border-green-800/30'
                  : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/20 border border-slate-200/50 dark:border-slate-800/30'
            }`}>
              {followUpJobs && followUpJobs.length > 0
                ? followUpJobs.some((job: any) => job.status === 'active' || job.status === 'scheduled')
                  ? 'Follow-Up Scheduled'
                  : followUpJobs.some((job: any) => job.status === 'completed')
                    ? 'Follow-Up Sent'
                    : 'Follow-Up Paused'
                : followUpSettings?.enabled
                  ? 'Follow-Ups Ready'
                  : 'Follow-Ups Off'}
            </span>
          </div>

          {/* Conversation Section - Primary content, conversation-first */}
          <div className="bg-card/95 border border-border/40 rounded-2xl lg:hidden flex flex-col overflow-hidden shadow-sm" style={{ minHeight: '420px', height: '60dvh', maxHeight: '680px' }}>
            {/* Mobile Message Thread - Scrollable viewport */}
            <div ref={mobileConversationContainerRef} className="flex-1 min-h-0 overflow-y-auto scroll-smooth overscroll-contain bg-slate-50/40 dark:bg-slate-950/20" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', scrollPaddingBottom: '5rem' }}>
              {/* Inner content wrapper for justify-end */}
              <div className="min-h-full px-2 py-1 flex flex-col justify-end">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : conversationTimeline.length === 0 ? (
                  <div className="flex items-center justify-center h-full py-6 animate-fadeIn">
                    <div className="text-center max-w-sm">
                      <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900/50 rounded-xl flex items-center justify-center mx-auto mb-3 border border-slate-200 dark:border-slate-800">
                        <svg className="w-6 h-6 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Start the conversation</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                        Send your first text message to this customer.
                      </p>
                    </div>
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
            </div>
            {/* Divider - Softer for natural integration */}
            <div className="border-t border-border/30 flex-shrink-0"></div>
            {/* Composer - Integrated at bottom with better mobile spacing and safe-area for bottom nav */}
            <div className="px-3 py-3 flex-shrink-0 bg-card/98 shadow-[0_-8px_30px_rgba(2,6,23,0.08)]" style={{ paddingBottom: 'max(90px, calc(80px + env(safe-area-inset-bottom)))' }}>
              {/* Image Previews */}
              {mobileImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {mobileImages.map((file, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={URL.createObjectURL(file)}
                        alt="Preview"
                        className="w-16 h-16 object-cover rounded-lg border border-slate-200/50 dark:border-slate-700/50 transition-opacity duration-200"
                      />
                      <button
                        onClick={() => removeMobileImage(index)}
                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
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
              <div className="flex gap-2 items-end rounded-2xl border border-slate-200/50 bg-white/90 p-2 shadow-sm dark:border-slate-700/50 dark:bg-slate-950/90 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => mobileFileInputRef.current?.click()}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-200 flex-shrink-0 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                  disabled={sending}
                >
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="flex-1 min-h-[40px] max-h-[100px] px-3 py-2 bg-transparent border-0 rounded-xl text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none focus:ring-0 transition-all duration-200 leading-relaxed"
                  rows={1}
                />
                <button
                  onClick={() => handleSendMessage(mobileImages.length > 0 ? mobileImages : undefined)}
                  disabled={(!message.trim() && mobileImages.length === 0) || sending}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-medium rounded-xl transition-all duration-200 flex items-center gap-1.5 flex-shrink-0 h-10 shadow-sm active:scale-95 disabled:active:scale-100"
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
          </div>

          {/* Collapsible Sections - Below conversation */}
          {/* AI Intake - Collapsible */}
          {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && business?.id && (
            <div className="bg-card/95 border border-border/70 rounded-xl p-2.5 shadow-sm ring-1 ring-white/5">
              <button
                onClick={() => setCollapsedSections((prev: any) => ({ ...prev, aiIntake: !prev.aiIntake }))}
                className="flex items-center justify-between w-full"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-semibold text-foreground">AI Intake</span>
                </div>
                <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.aiIntake ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {!collapsedSections.aiIntake && (
                <div className="mt-2">
                  <AICallDetails
                    leadId={params.id}
                    businessId={business.id}
                    conversationId={leadData?.conversation?.id}
                    callerPhone={leadData?.phone_number || lead?.phone}
                    leadData={leadData}
                    collapsible={false}
                    onSave={handleRefresh}
                  />
                </div>
              )}
            </div>
          )}

          {/* Jobs - Collapsible */}
          <div className="bg-card/95 border border-border/70 rounded-xl p-2.5 shadow-sm ring-1 ring-white/5">
            <button
              onClick={() => setCollapsedSections((prev: any) => ({ ...prev, jobs: !prev.jobs }))}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-sm font-semibold text-foreground">Jobs</span>
              </div>
              <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.jobs ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!collapsedSections.jobs && (
              <div className="mt-2">
                {leadJobs.length === 0 ? (
                  <button
                    onClick={handleCreateJobClick}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Job
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    {leadJobs.slice(0, 3).map((job: any) => (
                      <div key={job.id} className="flex items-center justify-between p-2 bg-muted/50 hover:bg-muted/70 rounded-lg transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{job.title || 'Job'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : 'No date'}
                            {job.scheduled_time ? ` • ${job.scheduled_time}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize whitespace-nowrap ml-2 border border-border/50">
                          {job.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payments - Collapsible */}
          <div className="bg-card/95 border border-border/70 rounded-xl p-2.5 shadow-sm ring-1 ring-white/5">
            <button
              onClick={() => setCollapsedSections((prev: any) => ({ ...prev, payments: !prev.payments }))}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <span className="text-sm font-semibold text-foreground">Payments</span>
              </div>
              <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.payments ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!collapsedSections.payments && (
              <div className="mt-2">
                {(leadData?.paymentRequests || []).length === 0 ? (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Request Payment
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    {(leadData?.paymentRequests || []).slice(0, 3).map((pr: any) => (
                      <div key={pr.id} className="flex items-center justify-between p-2 bg-muted/50 hover:bg-muted/70 rounded-lg transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground">${(pr.amount_cents / 100).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">{formatRelativeTime(pr.created_at)}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize whitespace-nowrap ml-2 ${
                          pr.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                        }`}>
                          {pr.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timeline - Collapsible */}
          <div className="bg-card/95 border border-border/70 rounded-xl p-2.5 shadow-sm ring-1 ring-white/5">
            <button
              onClick={() => setCollapsedSections((prev: any) => ({ ...prev, recentActivity: !prev.recentActivity }))}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold text-foreground">Timeline</span>
              </div>
              <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.recentActivity ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!collapsedSections.recentActivity && (
              <div className="mt-2 space-y-1">
                {conversationTimeline.slice(-10).reverse().slice(0, 5).map((item: any, index: number) => (
                  <div key={item.id} className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0">
                    <div className="flex-shrink-0 pt-0.5">
                      {item.type === 'message' ? (
                        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      ) : item.type === 'voicemail' ? (
                        <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground truncate">{item.type === 'message' ? (item.data?.direction === 'inbound' ? 'Customer message' : 'Your message') : item.type === 'voicemail' ? 'Voicemail' : 'System event'}</p>
                      <p className="text-[9px] text-muted-foreground">{formatRelativeTime(item.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Customer Details</h3>
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
              Customer Information
            </h3>
            
            {/* Customer Information */}
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
              ReplyFlow will stop creating customers, sending automatic messages, and scheduling follow-ups for this number.
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

      {/* Remove Customer Modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Remove this customer?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              This will permanently remove this customer and all associated messages. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRemoveModal(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveCustomer}
                disabled={isRemoving}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isRemoving ? (
                  <>
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent border-solid inline-block mr-2"></div>
                    Removing...
                  </>
                ) : (
                  'Remove Customer'
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
                  if (savingCustomerInfo) return
                  setSavingCustomerInfo(true)
                  
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
                      if (updatedData?.ok && updatedData.lead) {
                        setLeadData({ ...updatedData.lead, messages: updatedData.lead.messages || updatedData.messages || [] })
                      }
                    }
                  } catch (error) {
                    console.error('Error saving customer info:', error)
                  } finally {
                    setSavingCustomerInfo(false)
                  }
                }}
                disabled={savingCustomerInfo}
                className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors ${savingCustomerInfo ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {savingCustomerInfo ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>

    {/* Payment Request Modal */}
    {showPaymentModal && (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowPaymentModal(false)
            setPaymentAmount('')
            setPaymentDescription('')
          }
        }}
      >
        <div 
          className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowPaymentModal(false)
              setPaymentAmount('')
              setPaymentDescription('')
            }
          }}
        >
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Request Payment
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            Send a payment request to {lead?.name || 'this customer'} via text message.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                <input
                  ref={paymentAmountRef}
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                Description
              </label>
              <textarea
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
                placeholder="Service payment"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                This will be prefilled from the service requested when available.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-3">
                Payment Method
              </label>
              <div className="space-y-3">
                {/* Stripe */}
                <label className={`relative flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                  selectedPaymentProvider === 'stripe'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                } ${!business || !isProviderAvailable('stripe', business) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input
                    type="radio"
                    name="payment_provider"
                    value="stripe"
                    checked={selectedPaymentProvider === 'stripe'}
                    onChange={() => setSelectedPaymentProvider('stripe')}
                    disabled={!business || !isProviderAvailable('stripe', business)}
                    className="w-5 h-5 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">Stripe</span>
                      {business && isProviderAvailable('stripe', business) ? (
                        <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">Connected</span>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Set up in Settings</span>
                      )}
                    </div>
                  </div>
                </label>

                {/* Venmo */}
                <label className={`relative flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                  selectedPaymentProvider === 'venmo'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                } ${!business || !isProviderAvailable('venmo', business) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input
                    type="radio"
                    name="payment_provider"
                    value="venmo"
                    checked={selectedPaymentProvider === 'venmo'}
                    onChange={() => setSelectedPaymentProvider('venmo')}
                    disabled={!business || !isProviderAvailable('venmo', business)}
                    className="w-5 h-5 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">Venmo</span>
                      {business && isProviderAvailable('venmo', business) ? (
                        <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">Configured</span>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Set up in Settings</span>
                      )}
                    </div>
                  </div>
                </label>

                {/* PayPal */}
                <label className={`relative flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                  selectedPaymentProvider === 'paypal'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                } ${!business || !isProviderAvailable('paypal', business) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input
                    type="radio"
                    name="payment_provider"
                    value="paypal"
                    checked={selectedPaymentProvider === 'paypal'}
                    onChange={() => setSelectedPaymentProvider('paypal')}
                    disabled={!business || !isProviderAvailable('paypal', business)}
                    className="w-5 h-5 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">PayPal</span>
                      {business && isProviderAvailable('paypal', business) ? (
                        <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">Configured</span>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Set up in Settings</span>
                      )}
                    </div>
                  </div>
                </label>
              </div>

              {/* Show message if no providers are available */}
              {!business || (!isProviderAvailable('stripe', business) && !isProviderAvailable('venmo', business) && !isProviderAvailable('paypal', business)) && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Configure a payment provider in Settings before sending payment requests.
                  </p>
                  <Link
                    href="/dashboard/settings"
                    className="inline-block mt-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Go to Settings → Payments
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <button
              onClick={() => {
                setShowPaymentModal(false)
                setPaymentAmount('')
                setPaymentDescription('')
              }}
              disabled={isCreatingPayment}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
                  setError('Please enter a valid amount')
                  return
                }

                setIsCreatingPayment(true)
                try {
                  const { data: { session } } = await supabase.auth.getSession()
                  const token = session?.access_token

                  if (!token) {
                    throw new Error('Not authenticated')
                  }

                  const payload = {
                    business_id: business?.id,
                    lead_id: leadData?.id || params.id,
                    conversation_id: leadData?.conversation?.id,
                    amount_cents: Math.round(parseFloat(paymentAmount) * 100),
                    description: paymentDescription || undefined,
                    payment_provider: selectedPaymentProvider,
                  }

                  console.log('[PAYMENT CREATE] Payload:', payload)

                  const response = await fetch('/api/payments/create', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify(payload),
                  })

                  if (!response.ok) {
                    const error = await response.json()
                    throw new Error(error.error || 'Failed to create payment request')
                  }

                  const data = await response.json()
                  setShowPaymentModal(false)
                  setPaymentAmount('')
                  setPaymentDescription('')
                  setSuccessMessage('Payment request sent.\nThe customer has been texted a payment link.')
                  
                  // Refresh lead data
                  const updatedData = await getLeadDetails(lead?.id)
                  if (updatedData) {
                    setLeadData(updatedData)
                  }
                } catch (error) {
                  console.error('Error creating payment request:', error)
                  setError(error instanceof Error ? error.message : 'Failed to create payment request')
                } finally {
                  setIsCreatingPayment(false)
                }
              }}
              disabled={isCreatingPayment || !paymentAmount || parseFloat(paymentAmount) <= 0 || !business || !isProviderAvailable(selectedPaymentProvider, business)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingPayment ? 'Sending Payment Request...' : 'Send Payment Request'}
            </button>
          </div>
        </div>
      </div>
    )}

    <PhotoModal
      imageUrl={selectedPhotoUrl}
      isOpen={photoModalOpen}
      onClose={() => {
        setPhotoModalOpen(false)
        setSelectedPhotoUrl('')
      }}
    />

    {/* Appointment Modal */}
    {isAppointmentModalOpen && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[90dvh] overflow-y-auto p-6 border border-slate-200 dark:border-slate-800" data-scroll-lock-allow>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Appointment
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
            Set or update this customer’s appointment.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Note
              </label>
              <textarea
                value={appointmentNote}
                onChange={(e) => setAppointmentNote(e.target.value)}
                rows={3}
                data-scroll-lock-allow
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
                placeholder="Optional appointment details"
              />
            </div>
            {appointmentError && (
              <p className="text-sm text-red-600 dark:text-red-400">{appointmentError}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-end mt-6">
            <button
              onClick={() => setIsAppointmentModalOpen(false)}
              disabled={isSavingAppointment || isSendingConfirmation}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSaveAppointment(false)}
              disabled={isSavingAppointment || isSendingConfirmation}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingAppointment && !isSendingConfirmation ? 'Saving...' : 'Save Appointment'}
            </button>
            <button
              onClick={() => handleSaveAppointment(true)}
              disabled={isSavingAppointment || isSendingConfirmation}
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingAppointment || isSendingConfirmation ? 'Saving...' : 'Save & Send Confirmation'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Job Composer Modal */}
    <JobComposer
      isOpen={isJobComposerOpen}
      onClose={() => setIsJobComposerOpen(false)}
      onSave={handleJobSave}
      prefill={jobPrefill}
    />

    {/* Appointment Selection Modal */}
    {showAppointmentSelection && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Select Appointment
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Choose which appointment to send a confirmation for.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {futureAppointments.map((job: any) => (
              <button
                key={job.id}
                onClick={() => {
                  handleSendConfirmation(job.id)
                  setShowAppointmentSelection(false)
                }}
                className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="font-medium text-slate-900 dark:text-white">
                  {job.title || 'Appointment'}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {job.scheduled_date && new Date(job.scheduled_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                  })}
                  {job.scheduled_time && ` • ${job.scheduled_time}`}
                </div>
                {job.confirmation_sms_sent_at && (
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                    ✓ Confirmation sent
                  </div>
                )}
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={() => setShowAppointmentSelection(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </DashboardErrorBoundary>
  )
}

