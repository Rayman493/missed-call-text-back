'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuPortal,
} from '@radix-ui/react-dropdown-menu'
import { createPortal } from 'react-dom'
import ConversationComposer from '@/components/ConversationComposer'
import MobileConversationComposer from '@/components/MobileConversationComposer'
import BusinessNumberPanel from '@/components/BusinessNumberPanel'
import AutomaticFollowUpsControl from '@/components/AutomaticFollowUpsControl'
import MobileConversationMessageList from '@/components/MobileConversationMessageList'
import DesktopConversationMessageList from '@/components/DesktopConversationMessageList'
import AppHeader from '@/components/AppHeader'
import { memoryService } from '@/lib/business-memory/memory-service'
import { invalidateIntelligence } from '@/lib/intelligence-invalidation/intelligence-invalidation-service'
import { analyticsService } from '@/lib/analytics/analytics-service'
import AppBackButton from '@/components/AppBackButton'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber, formatRelativeTime, formatCurrency, getLeadDisplayName } from '@/lib/utils'
import { getCustomerSourceInfo } from '@/lib/customer-source'
import { PhoneIncoming, UserPlus, RefreshCw } from 'lucide-react'
import { getLeadAIIntake, getLeadRequestTitle, getAIIntakeStatus, getAIIntakeStatusLabel, getAIIntakeStatusColor } from '@/lib/ai-field-mapping'
import { deriveJobSchedulingPrefill } from '@/lib/job-scheduling-prefill'
import { getLeadLifecycleStatus, getLeadStatusClasses, getLeadStatusLabel, LeadLifecycleStatus } from '@/lib/lead-lifecycle'
import { CustomerStatus, normalizeCustomerStatus } from '@/lib/customer-status'
import { formatJobStatus, formatPaymentStatus } from '@/lib/status-formatter'
import { calculateLeadTiming, getCustomerInfoForCopy, getAISummaryForCopy } from '@/lib/lead-timing'
import { isProviderAvailable, getAvailableProviders, PaymentProvider } from '@/lib/payment-links'
import Link from 'next/link'
import { Lead, Message, Conversation } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { RealtimeChannel } from '@supabase/supabase-js'
import LeadStatusDropdown from '@/components/LeadStatusDropdown'
import AICallDetails from '@/components/AICallDetails'
import VoicemailSummary from '@/components/VoicemailSummary'
import FocusSection from '@/components/FocusSection'
import RevenueOpportunityCard from '@/components/RevenueOpportunityCard'
import CustomerReactivationCard from '@/components/CustomerReactivationCard'
import CustomerSuccessCard from '@/components/CustomerSuccessCard'
import CustomerActivityTimeline from '@/components/CustomerActivityTimeline'
import { groupCorrectionsWithSourceMessages } from '@/lib/timeline-event-ordering'
import { ImageMessage } from '@/components/ImageMessage'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import PhotoModal from '@/components/PhotoModal'
import Skeleton, { CardSkeleton, ListItemSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import Modal from '@/components/ui/Modal'
import JobComposer, { JobPrefill, Job } from '@/components/jobs/JobComposer'
import { CalendarDays, ClipboardPlus, CreditCard, PhoneCall, MessageSquare, Smartphone, Maximize2, Minimize2 } from 'lucide-react'
import NewAppointmentModal from '@/components/calendar/NewAppointmentModal'
import { SidebarSection } from '@/components/SidebarSection'
import SuccessBanner from '@/components/SuccessBanner'
import BusinessPhoneModal from '@/components/BusinessPhoneModal'
import { launchSMS, copyToClipboard, openBusinessSms } from '@/lib/sms-launch'
import { useSendingSource } from '@/hooks/useSendingSource'
import { useSupportsBusinessNumber } from '@/lib/platform-capabilities'

// Helper functions for consistent formatting
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Helper to get customer name from lead data
const getCustomerName = (lead: any, leadData: any) => {
  const intake = getLeadAIIntake(leadData || lead)
  const customerName = intake.customerName || leadData?.name || lead?.name || ''
  return customerName
}

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
  return 'Your message wasn\'t sent. Please try again.'
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
    return currentStatus
  }
  
  // Terminal state: Failed cannot replace Delivered
  if (currentStatus === 'delivered' && (newStatus === 'failed' || newStatus === 'undelivered' || newStatus === 'not_sent')) {
    return currentStatus
  }
  
  // Terminal state: Delivered cannot replace a confirmed terminal failure
  if ((currentStatus === 'failed' || currentStatus === 'undelivered' || currentStatus === 'not_sent') && newStatus === 'delivered') {
    return currentStatus
  }
  
  // Queued cannot replace Sent
  if (currentStatus === 'sent' && newStatus === 'queued') {
    return currentStatus
  }
  
  // Sent cannot replace Delivered
  if (currentStatus === 'delivered' && newStatus === 'sent') {
    return currentStatus
  }
  
  // Only upgrade if new status has higher or equal rank
  if (newRank >= currentRank) {
    return newStatus
  }
  
  // Keep current status if new status would downgrade
  return currentStatus
}

/**
 * Canonical message merge function
 * - Matches by database ID, clientMessageId, or Twilio SID
 * - Enforces status monotonicity
 * - Prevents duplicates
 * - Preserves chronological ordering
 * - Clears optimistic flags on server reconciliation
 */
function mergeMessageWithMonotonicity(existingMessages: any[], incomingMessage: any, source: string = 'unknown'): any[] {
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
  
  console.log('[SMS RECONCILE] =========================================')
  console.log('[SMS RECONCILE] source:', source)
  console.log('[SMS RECONCILE] incomingMessageId:', incomingMessage.id)
  console.log('[SMS RECONCILE] incomingClientMessageId:', incomingClientMessageId)
  console.log('[SMS RECONCILE] incomingTwilioSid:', incomingTwilioSid)
  console.log('[SMS RECONCILE] incomingStatus:', incomingMessage.status)
  console.log('[SMS RECONCILE] =========================================')
  
  // 1. Match by exact database ID
  if (incomingMessage.id && messageMap.has(incomingMessage.id)) {
    existingMessage = messageMap.get(incomingMessage.id)
    matchKey = 'id'
    console.log('[SMS RECONCILE] Matched by database ID')
  }
  // 2. Match by clientMessageId (for optimistic message reconciliation)
  else if (incomingClientMessageId) {
    for (const [id, msg] of Array.from(messageMap.entries())) {
      const msgClientMessageId = msg.clientMessageId || msg.client_message_id
      if (msgClientMessageId === incomingClientMessageId) {
        existingMessage = msg
        matchKey = 'clientMessageId'
        console.log('[SMS RECONCILE] Matched by clientMessageId:', incomingClientMessageId)
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
        console.log('[SMS RECONCILE] Matched by Twilio SID:', incomingTwilioSid)
        break
      }
    }
  }
  
  if (existingMessage) {
    console.log('[SMS RECONCILE] Found existing message, merging...')
    console.log('[SMS RECONCILE] existingStatus:', existingMessage.status)
    console.log('[SMS RECONCILE] existingIsOptimistic:', existingMessage.isOptimistic)
    
    // Merge with monotonic status
    const mergedMessage = {
      ...existingMessage,
      ...incomingMessage,
      // Preserve clientMessageId from optimistic message
      clientMessageId: existingMessage.clientMessageId || incomingMessage.clientMessageId || incomingMessage.client_message_id,
      // Clear optimistic flag when server confirms
      isOptimistic: false,
      status: getMonotonicStatus(existingMessage.status, incomingMessage.status)
    }
    
    console.log('[SMS RECONCILE] mergedStatus:', mergedMessage.status)
    console.log('[SMS RECONCILE] mergedIsOptimistic:', mergedMessage.isOptimistic)
    
    // If matched by clientMessageId but incoming has real ID, update the map key
    if (matchKey === 'clientMessageId' && incomingMessage.id && incomingMessage.id !== existingMessage.id) {
      console.log('[SMS RECONCILE] Updating map key from optimistic ID to server ID:', {
        oldKey: existingMessage.id,
        newKey: incomingMessage.id
      })
      messageMap.delete(existingMessage.id)
      messageMap.set(incomingMessage.id, mergedMessage)
    } else {
      messageMap.set(existingMessage.id, mergedMessage)
    }
  } else {
    console.log('[SMS RECONCILE] No existing message found, adding as new')
    // New message - add to map
    messageMap.set(incomingMessage.id, incomingMessage)
  }
  
  console.log('[SMS RECONCILE] Total messages after merge:', messageMap.size)
  console.log('[SMS RECONCILE] =========================================')
  
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
  const { sendingSource, effectiveSource, isNativeMobile: isNativeMobilePlatform } = useSendingSource()
  const supportsBusiness = useSupportsBusinessNumber()

    const [leadData, setLeadData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [externalActionSuccess, setExternalActionSuccess] = useState<{ primary: string; secondary: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [showMobileOverflow, setShowMobileOverflow] = useState(false)
  const [showInternalNotesModal, setShowInternalNotesModal] = useState(false)
  const [internalNotesValue, setInternalNotesValue] = useState('')
  const [triggerEditCustomerDetails, setTriggerEditCustomerDetails] = useState(false)
  const [mobileCustomerExpanded, setMobileCustomerExpanded] = useState(true)
  const [mobileLeadDetailsExpanded, setMobileLeadDetailsExpanded] = useState(false)
  const [mobileActionsExpanded, setMobileActionsExpanded] = useState(false)
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
        aiIntake: false, // Default to expanded - show current request immediately
        schedule: true, // Default to collapsed for conversation-first
        payments: true, // Default to collapsed
        appointments: true, // Default to collapsed
      }
    }

    return {
      photos: true,
      activity: true,
      automation: true,
      customerHealth: false,
      quickActions: true,
      aiIntake: false,
      schedule: true,
      payments: true,
      appointments: true,
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

  // Shared function to record Business Phone actions using the new API
  const recordBusinessPhoneAction = async (config: {
    actionType: 'text' | 'payment_request' | 'appointment' | 'follow_up'
    leadId: string
    customerName: string
    customerPhone: string
    message: string
    relatedId?: string
    relatedType?: string
  }) => {
    try {
      const response = await fetch('/api/business-phone/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      if (!response.ok) {
        throw new Error('Failed to record Business Phone action')
      }
      // Refresh lead data to update timeline
      const updatedData = await getLeadDetails(config.leadId)
      if (updatedData) {
        setLeadData(updatedData)
      }
    } catch (error) {
      console.error('[BusinessPhone] Failed to record action:', error)
      throw error
    }
  }

  // (Diagnostics removed) 

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
  const [internalNotesExpanded, setInternalNotesExpanded] = useState(false)
  const [autoFocusNotes, setAutoFocusNotes] = useState(false)
  const [highlightedTimelineItemId, setHighlightedTimelineItemId] = useState<string | null>(null)
  const conversationContainerRef = useRef<HTMLDivElement>(null)
  const mobileConversationContainerRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  const isInitialAutoScrollingRef = useRef(false)
  const initialScrollDoneRef = useRef<string | null>(null)
  // Full-screen conversation state and refs
  const [isFullScreen, setIsFullScreen] = useState(false)
  const fullScreenToggleBtnRef = useRef<HTMLButtonElement>(null)
  const preservedScrollRef = useRef(0)
  const fullScreenScrollRef = useRef<HTMLDivElement>(null)

  // Body scroll lock and Escape/back handling for full-screen
  useEffect(() => {
    if (!isFullScreen) return
    const previousOverflow = typeof document !== 'undefined' ? document.body.style.overflow : ''
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden'
    }
    // Focus scroll container on next frame for accessibility
    let focusRaf: number | null = null
    if (typeof window !== 'undefined') {
      focusRaf = window.requestAnimationFrame(() => {
        fullScreenScrollRef.current?.focus()
      })
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullScreen(false)
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKeyDown)
    }
    let backHandle: any = null
    if (App?.addListener) {
      App.addListener('backButton', () => {
        setIsFullScreen(false)
      }).then((h: any) => { backHandle = h }).catch(() => {})
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = previousOverflow
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown)
        if (focusRaf && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(focusRaf)
        }
      }
      backHandle?.remove?.()
      fullScreenToggleBtnRef.current?.focus()
    }
  }, [isFullScreen])

  // Preserve and restore scroll position when toggling full-screen
  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
    const source = isDesktop ? conversationContainerRef.current : mobileConversationContainerRef.current
    if (isFullScreen) {
      preservedScrollRef.current = source?.scrollTop || 0
      if (typeof window !== 'undefined') {
        const id = window.requestAnimationFrame(() => {
          if (fullScreenScrollRef.current) {
            fullScreenScrollRef.current.scrollTop = preservedScrollRef.current
          }
        })
        return () => { if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(id) }
      }
    } else {
      const target = source
      if (target) target.scrollTop = preservedScrollRef.current
    }
  }, [isFullScreen])

  // Native call capability — when customerPhone is valid
  const customerPhoneRaw = (getLeadAIIntake(leadData || {}).customerPhone || (leadData as any)?.caller_phone || '') as string
  const dialNumber = customerPhoneRaw.replace(/[^+\d]/g, '')
  const digitCount = dialNumber.replace(/\D/g, '').length
  const canDialPhone = Boolean(dialNumber && (dialNumber.replace(/\D/g, '').length >= 10))
  const handleNativeCall = async () => {
    // Use native phone app for all platforms
    try {
      if (canDialPhone) {
        window.location.href = `tel:${dialNumber}`
      }
    } catch {}
  }

  // Text Customer handlers
  const handleTextCustomer = () => {
    // Focus on the message composer for all platforms
    setTimeout(() => {
      const composerInput = document.querySelector('textarea[placeholder*="Type a message"]') as HTMLTextAreaElement
      if (composerInput) {
        composerInput.focus()
        composerInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }

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

  // Persist collapsedSections to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('customerDetailsCollapsedSections', JSON.stringify(collapsedSections))
    }
  }, [collapsedSections])

  // Prevent body scrolling when Customer Details modal is open
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (showLeadInfo) {
        document.body.style.overflow = 'hidden'
        document.body.style.position = 'fixed'
        document.body.style.width = '100%'
      } else {
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
      }
    }
  }, [showLeadInfo])

  // Reset triggerEditCustomerDetails after it's been consumed
  useEffect(() => {
    if (triggerEditCustomerDetails) {
      setTriggerEditCustomerDetails(false)
    }
  }, [triggerEditCustomerDetails])
  
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

      // Refresh lead data to get the updated notes
      const updatedData = await getLeadDetails(params.id)
      if (updatedData?.ok && updatedData.lead) {
        setLeadData(updatedData.lead)
        setInternalNotes(updatedData.lead.notes || '')
      }

      setSuccessMessage('Notes saved successfully.')
    } catch (error) {
      console.error('Failed to save notes:', error)
      setError('Failed to save notes. Please try again.')
    } finally {
      setIsSavingNotes(false)
    }
  }

  const handleImageLoad = () => {
    // Scroll to bottom after image load to ensure full image is visible
    // Only scroll if user is near bottom (don't force scroll if user is reading older messages)
    const isDesktop = window.innerWidth >= 1024
    const container = isDesktop ? conversationContainerRef.current : mobileConversationContainerRef.current
    
    if (container) {
      const scrollThreshold = 200
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= scrollThreshold
      
      if (isNearBottom) {
        scrollToBottom('auto', false)
      }
    }
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
        // Skip fetching media for optimistic messages - they don't exist in the database yet
        if (message.isOptimistic) {
          console.log('[fetchMessageMedia] Skipping optimistic message:', {
            messageId: message.id,
            clientMessageId: message.clientMessageId || message.client_message_id
          })
          continue
        }

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
    let merged = existingMessages
    
    // Merge each new message using the canonical merge function
    newMessages.forEach((msg, index) => {
      merged = mergeMessageWithMonotonicity(merged, msg, `${source}[${index}]`)
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
        const serviceRequested = getLeadRequestTitle(leadData) || 'Unknown request'
        const extractedInfo = aiCall.extracted_info || leadData?.raw_metadata?.extracted_info || {}
        
        // Determine which fields are present for observability
        const hasName = Boolean(extractedInfo.customerName || extractedInfo.callerName || extractedInfo.name)
        const hasService = Boolean(extractedInfo.serviceRequested || extractedInfo.reasonForCalling || extractedInfo.request)
        const hasAddress = Boolean(extractedInfo.serviceAddress || extractedInfo.addressOrLocation)
        const hasTiming = Boolean(extractedInfo.desiredCompletionTime || extractedInfo.desiredCompletion)
        const hasCallback = Boolean(extractedInfo.callbackTime || extractedInfo.preferredCallbackTime)
        
        // Detect quality issues
        const serviceRaw = extractedInfo.serviceRequested || extractedInfo.reasonForCalling || extractedInfo.request || ''
        const serviceLooksLikeQuestion = hasService && /^(how much|what do you charge|what are your|when are you|do you|can you|who|what|when|where|why|how)\s/i.test(serviceRaw)
        
        // Determine message based on actual outcome
        let intakeMessage = ''
        if (intakeStatus === 'complete') {
          intakeMessage = `Intake Complete: ${serviceRequested}`
        } else if (intakeStatus === 'partial') {
          // For partial intakes, show what was captured to improve trust
          const capturedFields = []
          if (hasName) capturedFields.push('name')
          if (hasService) capturedFields.push('service')
          if (hasAddress) capturedFields.push('address')
          if (hasTiming) capturedFields.push('timing')
          if (hasCallback) capturedFields.push('callback')
          
          const capturedText = capturedFields.length > 0 
            ? ` (${capturedFields.join(', ')})` 
            : ' (no fields captured)'
          
          intakeMessage = `Partial Intake: ${serviceRequested}${capturedText}`
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
            isDivider: false,
            // Add field presence for observability and debugging
            fieldPresence: {
              hasName,
              hasService,
              hasAddress,
              hasTiming,
              hasCallback
            },
            // Add quality issue flags for trust
            qualityIssues: {
              serviceLooksLikeQuestion
            }
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
    
    // Add Payment Request events - permanent history for all statuses
    const paymentRequests = leadData?.paymentRequests || []
    const currentConversationId = leadData?.conversationId || leadData?.conversation?.id

    console.log('[TIMELINE PAYMENT FILTER] Filtering payment requests:', {
      totalPaymentRequests: paymentRequests.length,
      currentConversationId,
      paymentRequestIds: paymentRequests.map((pr: any) => ({
        id: pr.id,
        conversation_id: pr.conversation_id,
        status: pr.status
      }))
    })

    if (paymentRequests.length > 0) {
      paymentRequests.forEach((pr: any) => {
        // Only show payment events for the current conversation
        const isIncluded = pr.conversation_id === currentConversationId
        console.log('[TIMELINE PAYMENT FILTER] Payment request:', {
          payment_request_id: pr.id,
          payment_conversation_id: pr.conversation_id,
          active_conversation_id: currentConversationId,
          included: isIncluded,
          exclusion_reason: isIncluded ? null : 'conversation_id_mismatch',
          payment_status: pr.status
        })

        if (isIncluded) {
          systemEvents.push({
            type: 'payment_requested',
            id: `payment-requested-${pr.id}`,
            created_at: pr.created_at,
            data: {
              payment_request_id: pr.id,
              amount_cents: pr.amount_cents,
              description: pr.description,
              status: pr.status,
              payment_provider: pr.payment_provider,
              timestamp: pr.created_at,
              conversation_id: pr.conversation_id,
              paid_at: pr.paid_at,
              cancelled_at: pr.cancelled_at,
              failed_at: pr.failed_at,
              expires_at: pr.expires_at
            }
          })
        }
      })
    }

    console.log('[TIMELINE PAYMENT FILTER] Final payment events in timeline:', {
      paymentEventCount: systemEvents.filter((e: any) => e.type === 'payment_requested').length,
      totalSystemEvents: systemEvents.length
    })
    
    // Add Customer Marked Complete event
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

    // Combine all events
    const allEvents = [...messageItems, ...voicemailItems, ...systemEvents]

    // Group correction events with their source messages
    const timeline = groupCorrectionsWithSourceMessages(allEvents, leadData?.raw_metadata?.corrected_fields)

    // Debug logging for timeline order
    console.log('[TIMELINE DEBUG] Timeline items after sorting:', {
      total: timeline.length,
      messages: messageItems.length,
      voicemails: voicemailItems.length,
      systemEvents: systemEvents.length,
      hasCorrections: !!leadData?.raw_metadata?.corrected_fields,
      correctedFields: leadData?.raw_metadata?.corrected_fields,
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

  // App-resume refresh for Business Number payment handoff
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    const handleAppResume = async () => {
      console.log('[APP RESUME] App resumed, checking for pending payment refresh')
      
      try {
        const pendingRefresh = localStorage.getItem('pendingPaymentRefresh')
        if (!pendingRefresh) {
          console.log('[APP RESUME] No pending payment refresh found')
          return
        }

        const { leadId, conversationId, paymentRequestId } = JSON.parse(pendingRefresh)
        console.log('[APP RESUME] Pending payment refresh found:', { leadId, conversationId, paymentRequestId })

        // Only refresh if we're still on the same lead
        if (leadId !== params.id) {
          console.log('[APP RESUME] Lead ID mismatch, skipping refresh')
          localStorage.removeItem('pendingPaymentRefresh')
          return
        }

        console.log('[APP RESUME] Refreshing lead data')
        const updatedData = await getLeadDetails(leadId)
        console.log('[APP RESUME] Lead data refresh result:', {
          leadId,
          hasData: !!updatedData,
          paymentRequestsCount: updatedData?.lead?.paymentRequests?.length || 0,
          paymentRequests: updatedData?.lead?.paymentRequests?.map((pr: any) => ({
            id: pr.id,
            amount_cents: pr.amount_cents,
            conversation_id: pr.conversation_id,
            status: pr.status,
            created_at: pr.created_at
          }))
        })

        // Only update state if we got valid data - preserve existing state to prevent Unknown Caller
        if (updatedData && updatedData.lead) {
          setLeadData(updatedData)
          console.log('[APP RESUME] Lead data state updated successfully')
        } else {
          console.error('[APP RESUME] Failed to get valid lead data, preserving existing state')
        }

        // Clear the pending refresh flag
        localStorage.removeItem('pendingPaymentRefresh')
        console.log('[APP RESUME] Pending payment refresh cleared')
      } catch (error) {
        console.error('[APP RESUME] Error during refresh:', error)
        // Clear the flag even on error to prevent retry loops
        localStorage.removeItem('pendingPaymentRefresh')
      }
    }

    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        console.log('[APP RESUME] App became active')
        handleAppResume()
      }
    })

    return () => {
      listener.then(fn => fn.remove())
    }
  }, [params.id])

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

  const [isCompleting, setIsCompleting] = useState(false)

  // State for payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDescription, setPaymentDescription] = useState('')
  const [isCreatingPayment, setIsCreatingPayment] = useState(false)
  const [isLaunchingSMS, setIsLaunchingSMS] = useState(false)
  const [showPaymentLinkModal, setShowPaymentLinkModal] = useState(false)
  const [paymentLinkData, setPaymentLinkData] = useState<{ paymentLink: string; amount: string; description: string; paymentRequestId?: string; message?: string; dialNumber?: string; customerName?: string } | null>(null)
  const [selectedPaymentProvider, setSelectedPaymentProvider] = useState<'stripe' | 'venmo' | 'paypal'>('stripe')
  const paymentAmountRef = useRef<HTMLInputElement>(null)

  // State for shared Business Phone modal
  const [showBusinessPhoneModal, setShowBusinessPhoneModal] = useState(false)
  const [businessPhoneModalConfig, setBusinessPhoneModalConfig] = useState<{
    title: string
    description: string
    secondaryDescription?: string
    message: string
    recipient: string
    recipientName?: string
    actionType: 'text' | 'payment_request' | 'appointment' | 'follow_up'
    relatedId?: string
    relatedType?: string
  } | null>(null)

  // State for appointment confirmation
  const [showAppointmentSelection, setShowAppointmentSelection] = useState(false)
  const [isSendingConfirmation, setIsSendingConfirmation] = useState(false)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const [leadJobs, setLeadJobs] = useState<any[]>([])
  const [leadTasks, setLeadTasks] = useState<any[]>([])
  const [appointments, setAppointments] = useState<any[]>([])
  const [loadingAppointments, setLoadingAppointments] = useState(false)
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('')
  const [showAppointmentSuccessModal, setShowAppointmentSuccessModal] = useState(false)
  const [appointmentSuccessData, setAppointmentSuccessData] = useState<{ customerName: string; date: string; time: string } | null>(null)
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
        if (business?.preferred_payment_provider && availableProviders.includes(business.preferred_payment_provider as PaymentProvider)) {
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

  const fetchLeadTasks = async () => {
    if (!leadData?.id || !business) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) return

      const response = await fetch(`/api/tasks?lead_id=${leadData.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setLeadTasks(data.tasks || [])
      }
    } catch (error) {
      console.error('Error fetching lead tasks:', error)
    }
  }

  const fetchAppointments = async () => {
    if (!leadData?.id || !business) return

    try {
      setLoadingAppointments(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) return

      // Use bounded date range: 30 days past to 90 days future
      const timeMin = new Date()
      timeMin.setDate(timeMin.getDate() - 30)
      const timeMax = new Date()
      timeMax.setDate(timeMax.getDate() + 90)

      const response = await fetch(
        `/api/google/calendar/events?lead_id=${leadData.id}&timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        setAppointments(data.events || [])
      } else {
        // Non-blocking failure - Customer Details remains usable
        console.warn('Failed to fetch appointments, continuing without them')
        setAppointments([])
      }
    } catch (error) {
      console.error('Error fetching appointments:', error)
      setAppointments([])
    } finally {
      setLoadingAppointments(false)
    }
  }

  // Fetch jobs for lead to check for scheduled appointments
  useEffect(() => {
    fetchLeadJobs()
    fetchLeadTasks()
    fetchAppointments()
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
      // Desktop fallback: if Business Number is default but platform is not native mobile, use ReplyFlow
      const effectiveSource = (sendingSource === 'business' && supportsBusiness) ? 'business' : 'replyflow'
      
      if (effectiveSource === 'business') {
        // Business Phone flow: get job details and open Business Phone modal
        const job = leadJobs.find(j => j.id === jobId)
        if (!job) {
          throw new Error('Job not found')
        }
        
        const customerName = getCustomerName(lead, leadData)
        const dialNumber = leadData?.caller_phone || lead?.caller_phone || ''
        
        // Format appointment date/time for message
        const appointmentDate = job.scheduled_date || ''
        const appointmentTime = job.scheduled_time || ''
        const dateTimeString = appointmentDate && appointmentTime 
          ? `${appointmentDate} at ${appointmentTime}` 
          : appointmentDate || appointmentTime || 'your scheduled time'
        
        const message = `Hi ${customerName}, this is a reminder about your appointment on ${dateTimeString}. Please confirm or let us know if you need to reschedule.`

        try {
          // Launch SMS using shared helper
          await openBusinessSms({ recipient: dialNumber, body: message, source: 'confirmation' })
          
          // Record the Business Phone action only after successful launch
          await recordBusinessPhoneAction({
            actionType: 'appointment',
            leadId: params.id,
            customerName: customerName,
            customerPhone: dialNumber,
            message: message,
            relatedId: jobId
          })
          
          setShowAppointmentSelection(false)
          setSuccessMessage(`Reminder sent\nMessage opened in your messaging app.`)
        } catch (error) {
          console.error('[Appointment Confirmation] Failed to launch SMS:', error)
          // Keep modal open for retry (shared helper handles fallback internally)
          setSuccessMessage(`Reminder sent\nCouldn't open your messaging app. Please try again.`)
        }
      } else {
        // ReplyFlow Number flow: use existing API
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
      }
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
  const handleStatusUpdate = async (newStatus: CustomerStatus) => {
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
        status: newStatus,
        updated_at: new Date().toISOString()
      }))

      // Show success message
      const statusMessages: Record<CustomerStatus, string> = {
        new: 'Customer marked as new',
        needs_reply: 'Customer marked as needs reply',
        active: 'Customer marked as active',
        scheduled: 'Customer marked as scheduled',
        payment_requested: 'Customer marked as payment requested',
        paid: 'Customer marked as paid',
        completed: 'Customer marked as complete',
        lost: 'Customer marked as lost',
        ignored: 'Customer marked as ignored'
      }
      setSuccessMessage(statusMessages[newStatus] || `Customer status updated to ${newStatus}`)

      // Invalidate intelligence after successful status change
      const previousStatus = leadData?.status
      let mutationType: 'customer_status_changed' | 'job_completed' | 'customer_reactivated' | null = null

      // Detect specific mutations
      if (newStatus === 'completed') {
        mutationType = 'job_completed'
        // Track job completed event
        analyticsService.track('job_completed', { duration: undefined }, business?.id).catch(error => {
          console.error('[Analytics] Failed to track job_completed:', error)
        })
      } else if ((previousStatus === 'lost' || previousStatus === 'ignored') && newStatus === 'active') {
        mutationType = 'customer_reactivated'
      } else {
        mutationType = 'customer_status_changed'
      }

      if (mutationType && business?.id) {
        // Fire and forget - don't await, don't block
        invalidateIntelligence({
          businessId: business.id,
          customerId: params.id,
          mutation: mutationType
        }).catch(error => {
          console.error('[IntelligenceInvalidation] Failed:', error)
        })
      }

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('')
      }, 3000)
      
    } catch (error) {
      console.error('Error updating lead status:', error)
      setError(error instanceof Error ? error.message : `Failed to update lead status`)
    }
  }

  // Handle navigate to timeline item from Request History
  const handleNavigateToTimeline = (aiCallRecordId: string) => {
    // Guard against SSR
    if (typeof window === 'undefined') {
      return
    }

    const timelineItemId = `ai-intake-${aiCallRecordId}`
    const timelineElement = document.getElementById(timelineItemId)

    if (!timelineElement) {
      // Timeline item not found - could be older record without matching timeline entry
      console.log('[handleNavigateToTimeline] Timeline item not found:', timelineItemId)
      return
    }

    // Determine which container to scroll
    const isDesktop = window.innerWidth >= 1024
    const container = isDesktop ? conversationContainerRef.current : mobileConversationContainerRef.current

    if (!container) {
      console.log('[handleNavigateToTimeline] Container not found')
      return
    }

    // Set highlight state
    setHighlightedTimelineItemId(timelineItemId)

    // Scroll to the element with smooth behavior
    timelineElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    })

    // Remove highlight after 2 seconds
    setTimeout(() => {
      setHighlightedTimelineItemId(null)
    }, 2000)
  }

  let automationStatus = ''
  if (hasCancelledFollowUps && hasInboundReply) {
    automationStatus = 'Follow-ups cancelled after customer reply'
  } else if (hasPendingFollowUps) {
    automationStatus = 'Follow-ups active'
  } else if (hasSentFollowUps) {
    automationStatus = 'Follow-ups completed'
  }

  // Fetch lead data on mount with race condition protection
  const latestFetchRequestRef = useRef<number>(0)

  useEffect(() => {
    const requestId = ++latestFetchRequestRef.current

    getLeadDetails(params.id).then(result => {
      // Check if this is the latest request (ignore stale fetches)
      if (requestId !== latestFetchRequestRef.current) {
        console.log('[LeadDetails] Ignoring stale fetch result')
        return
      }

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
      // Check if this is the latest request (ignore stale errors)
      if (requestId !== latestFetchRequestRef.current) {
        console.log('[LeadDetails] Ignoring stale fetch error')
        return
      }

      setError('Failed to fetch lead details')
      setLeadData(null)
      setLoading(false)
    })
  }, [params.id])

  // Initial scroll to bottom when conversation loads (works for both desktop and mobile)
  useEffect(() => {
    // Only scroll if:
    // 1. Lead data is loaded and not loading
    // 2. This is a new conversation (different from previous)
    // 3. We haven't already scrolled this conversation
    if (!loading && leadData && leadData.id && initialScrollDoneRef.current !== leadData.id) {
      console.log('[Initial Scroll] Scrolling to bottom for conversation:', leadData.id)
      
      // Mark this conversation as scrolled
      initialScrollDoneRef.current = leadData.id
      
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        // Use a second frame to account for image/media loading
        requestAnimationFrame(() => {
          const isDesktop = window.innerWidth >= 1024
          const container = isDesktop ? conversationContainerRef.current : mobileConversationContainerRef.current
          
          if (container) {
            console.log('[Initial Scroll] Container found, scrolling to bottom', {
              isDesktop,
              scrollHeight: container.scrollHeight,
              clientHeight: container.clientHeight
            })
            // Use 'auto' behavior for instant scroll (no animation)
            container.scrollTop = container.scrollHeight
          } else {
            console.log('[Initial Scroll] Container not found yet')
          }
        })
      })
    }
  }, [loading, leadData])

  // Reset initial scroll tracking when navigating to a different conversation
  useEffect(() => {
    return () => {
      // When the component unmounts (navigation away), reset the scroll tracking
      initialScrollDoneRef.current = null
    }
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
              mediaCount: newMessage.media_count,
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
            
            // Immediately fetch media for new MMS messages
            if (newMessage.media_count && newMessage.media_count > 0) {
              console.log('[REALTIME INSERT] Fetching media immediately for new MMS message:', {
                messageId: newMessage.id,
                mediaCount: newMessage.media_count
              })
              
              supabase.auth.getSession().then(({ data }: any) => {
                const session = data?.session
                fetch(`/api/message-media?messageId=${newMessage.id}`, {
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                  }
                })
                .then(response => response.json())
                .then(mediaData => {
                  console.log('[REALTIME INSERT] Media fetched successfully:', {
                    messageId: newMessage.id,
                    mediaCount: mediaData.length
                  })
                  setMessageMedia((prev: any) => ({
                    ...prev,
                    [newMessage.id]: {
                      urls: mediaData.map((m: any) => m.media_url),
                      types: mediaData.map((m: any) => m.mime_type)
                    }
                  }))
                })
                .catch(error => {
                  console.error('[REALTIME INSERT] Failed to fetch media:', error)
                })
              })
            }
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
              // Deduplicate: only add if this payment request ID doesn't already exist
              const alreadyExists = paymentRequests.some((pr: any) => pr.id === payload.new.id)
              if (alreadyExists) {
                console.log('[REALTIME PAYMENT INSERT] Payment request already exists, skipping')
                return prev
              }
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
    
    console.log('[MMS] handleSendMessage called:', {
      isMMS,
      mediaCount: mediaFiles?.length || 0,
      messageLength: message.trim().length,
      mediaFileNames: mediaFiles?.map(f => f.name)
    })
    
    // Don't send if message is empty (unless media is present), whitespace, or already sending
    if (!message.trim() && !mediaFiles) return
    if (sending) return

    // Capture the message text immediately before clearing
    const submittedText = message.trim()
    const submittedMediaFiles = mediaFiles

    // Create stable client message ID for correlation
    const clientMessageId = crypto.randomUUID()
    
    console.log('[OPTIMISTIC CREATION] Creating optimistic message:', {
      temporaryId: clientMessageId,
      clientMessageId,
      body: submittedText.substring(0, 30),
      isMMS,
      mediaCount: submittedMediaFiles?.length || 0
    })
    
    // Create optimistic message with local preview URLs for MMS
    const optimisticMedia = submittedMediaFiles?.map((file, index) => ({
      id: `${clientMessageId}-media-${index}`,
      media_url: URL.createObjectURL(file), // Local preview URL
      mime_type: file.type || 'image/jpeg',
      isLocalPreview: true, // Mark as local preview for recovery
      filename: file.name
    })) || []
    
    const optimisticMsg = {
      id: clientMessageId,
      clientMessageId,
      direction: 'outbound',
      body: submittedText,
      status: 'sending',
      created_at: new Date().toISOString(),
      isOptimistic: true,
      media: optimisticMedia,
      media_count: optimisticMedia.length
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

    // Clear the composer immediately after creating optimistic message
    // This prevents the text from appearing in both the composer and thread
    setMessage('')
    
    // Clear attachment previews immediately for MMS
    if (isMMS) {
      setMobileImages([])
      if (clearComposerImagesRef.current) {
        clearComposerImagesRef.current()
      }
    }
    
    setSending(true)
    setError('')
    setSuccessMessage('')

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()

      console.log('[MMS] Session obtained:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token
      })

      let response: Response

      if (mediaFiles && mediaFiles.length > 0) {
        console.log('[MMS] Preparing FormData for MMS:', {
          leadId: params.id,
          messageLength: submittedText.length,
          mediaCount: submittedMediaFiles?.length || 0,
          mediaFileNames: submittedMediaFiles?.map(f => f.name) || [],
          mediaFileSizes: submittedMediaFiles?.map(f => f.size) || [],
          mediaFileTypes: submittedMediaFiles?.map(f => f.type) || []
        })
        
        // Use FormData for MMS
        const formData = new FormData()
        formData.append('leadId', params.id)
        formData.append('message', submittedText)
        formData.append('clientMessageId', clientMessageId)
        
        if (submittedMediaFiles) {
        submittedMediaFiles.forEach((file, index) => {
          console.log('[MMS] Appending file to FormData:', {
            index,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type
          })
          formData.append(`media_${index}`, file)
        })
      }

        const headers: HeadersInit = {}
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
          console.log('[MMS] Authorization header set')
        }

        console.log('[MMS] Sending API request to /api/send-sms with FormData')
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
            message: submittedText,
            clientMessageId
          })
        })
      }

      console.log('[MMS] API response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      })

      console.log('[API REQUEST] Sent message with clientMessageId:', {
        clientMessageId,
        body: submittedText.substring(0, 30)
      })

      const result = await response.json()
      console.log('[MMS] API response parsed:', {
        success: result.success,
        error: result.error,
        hasMessage: !!result.message,
        messageSid: result.message?.twilio_message_sid,
        twilioAccepted: result.twilioAccepted,
        messagePersisted: result.messagePersisted,
        mediaPersisted: result.mediaPersisted,
        mediaPersistenceError: result.mediaPersistenceError
      })

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
              body: submittedText,
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
          
          // Restore the submitted text to the composer only if it's still empty
          // This allows the user to retry without retyping, but doesn't overwrite new input
          setMessage(current => current.trim() === '' ? submittedText : current)
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

      // Update optimistic message with real message data using clientMessageId
      if (result.clientMessageId === clientMessageId && result.message) {
        console.log('[SEND RECONCILIATION] API returned persisted message:', {
          messageId: result.message.id,
          status: result.message.status,
          twilioSid: result.message.twilio_message_sid,
          clientMessageId: result.message.client_message_id,
          body: result.message.body?.substring(0, 30),
          isMMS
        })
        
        // For MMS: preserve local preview URLs in optimistic message until media records arrive
        const currentMessages = leadData?.messages || []
        const optimisticMessage = currentMessages.find((m: any) => m.id === clientMessageId)
        const localPreviewUrls = optimisticMessage?.media?.filter((m: any) => m.isLocalPreview) || []
        
        // Add clientMessageId to the persisted message for proper reconciliation
        const persistedMessageWithClientId = {
          ...result.message,
          clientMessageId: result.message.client_message_id || clientMessageId
        }
        
        // For MMS with local previews: keep only local previews initially
        // The fetchMessageMedia effect will fetch persisted media records from database
        // This prevents the image from swapping before the server URL is ready
        if (isMMS && localPreviewUrls.length > 0) {
          persistedMessageWithClientId.media = localPreviewUrls
          persistedMessageWithClientId.hasLocalPreview = true // Flag to indicate we're waiting for server media
          
          // Fetch persisted media for this specific message after a short delay
          // This avoids full conversation refresh while still getting server URLs
          setTimeout(async () => {
            try {
              console.log('[MMS] Fetching persisted media for message:', result.message.id)
              const { data: { session } } = await supabase.auth.getSession()
              const headers: HeadersInit = { 'Content-Type': 'application/json' }
              if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`
              }
              
              const response = await fetch(`/api/message-media?messageId=${result.message.id}`, { headers })
              if (response.ok) {
                const mediaData = await response.json()
                console.log('[MMS] Fetched persisted media records:', mediaData.length)
                
                // Update the message with server media, preserving local preview until loaded
                setLeadData((prev: any) => {
                  if (!prev) return prev
                  
                  const updatedMessages = prev.messages.map((msg: any) => {
                    if (msg.id === result.message.id || msg.clientMessageId === result.message.client_message_id) {
                      // Replace local previews with server media
                      return {
                        ...msg,
                        media: mediaData.map((m: any) => ({
                          id: m.id,
                          media_url: m.media_url,
                          mime_type: m.mime_type,
                          created_at: m.created_at
                        })),
                        hasLocalPreview: false // Local preview replaced with server media
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
            } catch (error) {
              console.error('[MMS] Error fetching persisted media:', error)
              // Keep local preview visible on error
            }
          }, 1500) // Short delay to allow database persistence to complete
        } else if (result.message.media && result.message.media.length > 0) {
          // For SMS or MMS without local previews, use the persisted media from API response
          persistedMessageWithClientId.media = result.message.media
        }
        
        // Atomic update: merge persisted message AND clear optimistic in single setState
        // This prevents the duplicate flash by ensuring both happen together
        setLeadData((prev: any) => {
          if (!prev) return prev
          
          const currentMsgs = prev.messages || []
          const mergedMessages = mergeMessageWithMonotonicity(currentMsgs, persistedMessageWithClientId, 'send-response-reconcile')
          
          return {
            ...prev,
            messages: mergedMessages
          }
        })
        
        // Note: We no longer perform a delayed refresh for MMS media.
        // The fetchMessageMedia effect will automatically fetch persisted media records
        // once the message is no longer optimistic (isOptimistic becomes false).
        // This prevents scroll position jumps caused by full conversation refetches.

        // Invalidate intelligence after successful message send
        if (business?.id) {
          // Track message sent event
          analyticsService.track('message_sent', { direction: 'outbound', hasMedia: false }, business.id).catch(error => {
            console.error('[Analytics] Failed to track message_sent:', error)
          })

          invalidateIntelligence({
            businessId: business.id,
            customerId: params.id,
            mutation: 'message_sent'
          }).catch(error => {
            console.error('[IntelligenceInvalidation] Failed:', error)
          })
        }
      }

      // Scroll to bottom to show the new message
      setTimeout(() => {
        scrollToBottom('smooth')
      }, 50)
    } catch (err) {
      // Update optimistic message to failed state (both SMS and MMS)
      const currentMessages = leadData?.messages || []
      const optimisticMessage = currentMessages.find((m: any) => m.id === clientMessageId)
      const localPreviewUrls = optimisticMessage?.media?.filter((m: any) => m.isLocalPreview) || []
      
      const failedMessage = {
        id: clientMessageId,
        clientMessageId,
        direction: 'outbound',
        body: submittedText,
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Network error occurred',
        created_at: new Date().toISOString(),
        isOptimistic: true,
        media: localPreviewUrls.length > 0 ? localPreviewUrls : undefined,
        media_count: localPreviewUrls.length
      }
      
      setLeadData((prev: any) => {
        if (!prev) return prev
        
        const currentMsgs = prev.messages || []
        const mergedMessages = mergeMessageWithMonotonicity(currentMsgs, failedMessage, 'network-error-failed')
        
        return {
          ...prev,
          messages: mergedMessages
        }
      })
      
      // Restore the submitted text to the composer only if it's still empty
      setMessage(current => current.trim() === '' ? submittedText : current)
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
    const leadReason = getLeadRequestTitle(leadData) || intake.serviceRequested
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
        conciseRequestTitle: intake.conciseRequestTitle,
        serviceRequested: intake.serviceRequested,
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
      // Use canonical request title helper
      title: getLeadRequestTitle(leadData) || intake.serviceRequested || `Job for ${leadName || 'Customer'}`,
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
      <div className="space-y-4">
        {/* Jobs & Appointments - Collapsible - Compact on mobile */}
        <div className="bg-background dark:bg-background rounded-xl border border-border/50 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <button
              onClick={() => setCollapsedSections((prev: any) => ({ ...prev, schedule: !prev.schedule }))}
              className="flex items-center gap-2 group"
            >
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">Jobs</h3>
              <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.schedule ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <Link
              href="/dashboard/calendar"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          {!collapsedSections.schedule && (
            <div className="transition-all duration-200">
              {leadJobs.length === 0 ? (
                <div className="text-center py-2 sm:py-4">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">No jobs scheduled for this customer yet.</p>
                  <button
                    onClick={handleCreateJobClick}
                    className="inline-flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] sm:text-xs font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
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
                    <div key={job.id} className="flex items-center justify-between p-2.5 bg-muted/40 hover:bg-muted/60 rounded-lg transition-colors duration-200">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{job.title || 'Job'}</p>
                        <p className="text-xs text-muted-foreground/80">
                          {job.scheduled_date ? formatDate(job.scheduled_date) : 'No date'}
                          {job.scheduled_time ? ` • ${job.scheduled_time}` : ''}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted/80 text-muted-foreground/90 capitalize whitespace-nowrap ml-2 border border-border/40">
                        {formatJobStatus(job.status).text}
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
        <div className="bg-background dark:bg-background rounded-xl border border-border/50 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <button
              onClick={() => setCollapsedSections((prev: any) => ({ ...prev, payments: !prev.payments }))}
              className="flex items-center gap-2 group"
            >
              <h3 className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">Payments</h3>
              <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.payments ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <Link
              href="/dashboard/payments"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          {!collapsedSections.payments && (
            <div className="transition-all duration-200">
              {paymentRequests.length === 0 ? (
                <div className="text-center py-2 sm:py-4">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">You haven't requested payment from this customer yet.</p>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    disabled={!business || getAvailableProviders(business).length === 0}
                    className="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3 sm:py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] sm:text-xs font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <div key={pr.id} className="flex items-center justify-between p-2.5 bg-muted/40 hover:bg-muted/60 rounded-lg transition-colors duration-200">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(pr.amount_cents / 100)}</p>
                        <p className="text-xs text-muted-foreground/80">{formatDate(pr.created_at)}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize whitespace-nowrap ml-2 border ${
                        pr.status === 'paid'
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                          : pr.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          : 'bg-muted/80 text-muted-foreground/90 border-border/40'
                      }`}>
                        {formatPaymentStatus(pr.status).text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Internal Notes - Standalone Section */}
        <div className="bg-background dark:bg-background rounded-xl border border-border/50 p-4 sm:p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-medium text-foreground">Internal Notes</h3>
                <div className="text-[10px] text-muted-foreground/70">Private to your business</div>
              </div>
              {Boolean((leadData?.notes || '').trim()) ? (
                <div className="mt-2 text-xs text-muted-foreground line-clamp-3 break-words">
                  {(leadData?.notes || '').trim()}
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground/70">
                  No notes yet
                </div>
              )}
            </div>
            <div className="flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setInternalNotesValue(leadData?.notes || '')
                  setShowInternalNotesModal(true)
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
              >
                {Boolean((leadData?.notes || '').trim()) ? 'Edit' : 'Add note'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false)
  const handleAppointmentClick = () => {
    // Open unified appointment modal preselected to this customer; lock customer; disallow inline add
    setIsNewAppointmentOpen(true)
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

      // Track appointment scheduled event
      if (business?.id) {
        const mutationType = selectedAppointmentJob ? 'appointment_updated' : 'appointment_created'
        if (mutationType === 'appointment_created') {
          analyticsService.track('appointment_scheduled', { isRecurring: false }, business.id).catch(error => {
            console.error('[Analytics] Failed to track appointment_scheduled:', error)
          })
          analyticsService.track('job_created', { jobType: 'appointment' }, business.id).catch(error => {
            console.error('[Analytics] Failed to track job_created:', error)
          })
        }
      }

      // Invalidate intelligence after successful appointment save
      if (business?.id) {
        const mutationType = selectedAppointmentJob ? 'appointment_updated' : 'appointment_created'
        invalidateIntelligence({
          businessId: business.id,
          customerId: params.id,
          mutation: mutationType
        }).catch(error => {
          console.error('[IntelligenceInvalidation] Failed:', error)
        })
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
    const leadReason = getLeadRequestTitle(leadData) || intake.serviceRequested || leadData?.company_name || ''
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
        conciseRequestTitle: intake.conciseRequestTitle,
      })
    }

    // Generate title using canonical AI request title first
    const canonicalTitle = intake.conciseRequestTitle || leadReason
    const title = canonicalTitle
      ? `${canonicalTitle} - ${leadName}`
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

      const customerName = getCustomerName(lead, leadData)

      // Show appointment success modal for all platforms
      setAppointmentSuccessData({ customerName, date: appointmentDate, time: appointmentTime })
      setShowAppointmentSuccessModal(true)
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
      <main className="h-screen bg-background p-6 sm:p-10">
        <div className="max-w-4xl mx-auto">
          {/* Skeleton Header */}
          <div className="bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border border-border/50 p-6 mb-6">
            <div className="animate-pulse">
              <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </div>
          </div>
          
          {/* Skeleton Messages */}
          <div className="bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border border-border/50 p-6">
            <div className="space-y-6">
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
      <main className="h-screen bg-background p-6 sm:p-10">
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
          <div className="bg-white dark:bg-slate-800/80 rounded-xl shadow-sm border border-border/50 p-10 text-center">
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
      <main className="h-[100dvh] bg-background flex flex-col overflow-x-hidden">
      {/* Standard App Header */}
      <AppHeader />

      {/* Customer Identity Header - Distinct from global navigation */}
      <div className="flex-shrink-0 border-y border-slate-700/35 bg-slate-900/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Mobile Layout: Compact Information Header */}
          <div className="md:hidden">
            <div className="flex items-center gap-2">
              {/* Back button */}
              <div className="flex-shrink-0">
                <AppBackButton fallbackHref="/dashboard/leads" label="" />
              </div>
              
              {/* Customer Avatar */}
              <div className="flex-shrink-0">
                {lead?.photo_url ? (
                  <img
                    src={lead.photo_url}
                    alt={getLeadDisplayName(leadData || lead)}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <span className="text-white font-semibold text-xs">
                      {getLeadDisplayName(leadData || lead)
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Customer Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <h1 className="font-medium text-foreground text-sm leading-tight truncate">
                    {getLeadDisplayName(leadData || lead)}
                  </h1>
                  {(() => {
                    const customerSourceInfo = getCustomerSourceInfo(leadData?.source || lead?.source)
                    return customerSourceInfo && (
                      <span
                        className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full text-[9px] font-medium border whitespace-nowrap flex-shrink-0"
                        title={customerSourceInfo.description}
                        style={{
                          backgroundColor: customerSourceInfo.type === 'replyflow' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                          color: customerSourceInfo.type === 'replyflow' ? 'rgb(139, 92, 246)' : 'rgb(100, 116, 139)',
                          borderColor: customerSourceInfo.type === 'replyflow' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(100, 116, 139, 0.2)'
                        }}
                      >
                        {customerSourceInfo.icon === 'PhoneIncoming' && <PhoneIncoming className="w-2.5 h-2.5" />}
                        {customerSourceInfo.icon === 'UserPlus' && <UserPlus className="w-2.5 h-2.5" />}
                      </span>
                    )
                  })()}
                </div>
                <p className="text-[11px] text-muted-foreground/80 truncate">
                  {formatPhoneNumber(getLeadAIIntake(leadData || lead).customerPhone || lead?.caller_phone || '')}
                </p>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Info Button */}
                <button
                  onClick={() => setShowLeadInfo(!showLeadInfo)}
                  className="h-10 w-10 inline-flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors duration-200"
                  title="Customer information"
                  aria-label="Customer information"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                
                {/* Mobile Overflow Button */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-10 w-10 inline-flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors duration-200"
                      title="More actions"
                      aria-label="Conversation actions"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuContent
                      align="end"
                      side="bottom"
                      sideOffset={8}
                      collisionPadding={12}
                      avoidCollisions
                      className="z-[10000] w-[260px] max-w-[calc(100vw-24px)] max-h-[calc(100dvh-96px)] overflow-y-auto overscroll-contain rounded-lg border border-border/60 bg-popover ring-1 ring-border/40 shadow-[0_4px_16px_rgb(0,0,0,0.12),0_2px_6px_rgb(0,0,0,0.08)]"
                    >
                      {/* Section Label */}
                      <div className="px-3 py-2">
                        <div className="px-0.5 py-1 text-[9px] font-medium text-muted-foreground/60 uppercase tracking-[0.12em]">
                          Conversation Actions
                        </div>
                      </div>

                      {/* Primary Actions Group */}
                      <div className="px-1.5 py-1 space-y-0.5">
                        {canDialPhone && (
                          <DropdownMenuItem
                            onSelect={() => handleNativeCall()}
                            className="w-full px-1.5 py-1 text-left text-xs font-medium text-foreground hover:bg-accent/40 flex items-center gap-2 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer min-h-[44px] group"
                          >
                            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded bg-accent/30 group-hover:bg-accent/40 transition-colors">
                              <PhoneCall className="w-3 h-3 stroke-[2]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium">Call Customer</div>
                              <div className="text-[9px] text-muted-foreground/70 font-normal leading-tight">Call this customer</div>
                            </div>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={() => handleCreateJobClick()}
                          className="w-full px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-accent/40 flex items-center gap-2.5 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer"
                        >
                          <ClipboardPlus className="w-4 h-4" />
                          <span>Create Job</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleAppointmentClick()}
                          className="w-full px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-accent/40 flex items-center gap-2.5 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer"
                        >
                          <CalendarDays className="w-4 h-4" />
                          <span>Schedule</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setShowPaymentModal(true)}
                          disabled={!business || getAvailableProviders(business).length === 0}
                          className="w-full px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-accent/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>Request Payment</span>
                        </DropdownMenuItem>
                      </div>

                      {/* Subtle Divider */}
                      <div className="px-3 py-1">
                        <div className="h-px bg-border/20"></div>
                      </div>

                      {/* Secondary Actions Group */}
                      <div className="px-1.5 py-1 space-y-0.5">
                        <DropdownMenuItem
                          onSelect={() => {
                            setInternalNotesValue(leadData?.notes || '')
                            setShowInternalNotesModal(true)
                          }}
                          className="w-full px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-accent/40 flex items-center gap-2.5 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Internal Notes</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleRefresh()}
                          disabled={refreshing}
                          className="w-full px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-accent/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer"
                        >
                          <svg
                            className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Refresh</span>
                        </DropdownMenuItem>
                      </div>

                                          </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Desktop Layout: Premium Profile Header */}
          <div className="hidden md:block flex-shrink-0">
            {/* Workspace Header Surface */}
            <div className="border-y border-slate-800/20 bg-slate-900/20">
              <div className="max-w-7xl mx-auto px-6 lg:px-8 py-3">
                {/* Back Link Row */}
                <div className="mb-1">
                  <AppBackButton fallbackHref="/dashboard/leads" label="Back to Customers" />
                </div>

                {/* Main Row */}
                <div className="flex items-center justify-between gap-6">
                  {/* Customer Identity - Horizontal */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {lead?.photo_url ? (
                        <img
                          src={lead.photo_url}
                          alt={getLeadDisplayName(leadData || lead)}
                          className="w-16 h-16 rounded-full object-cover border-2 border-border/10"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center border-2 border-border/10">
                          <span className="text-white font-semibold text-xl">
                            {getLeadDisplayName(leadData || lead)
                              .split(' ')
                              .map(n => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Name, Request Title, Phone, Status */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h1 className="text-2xl font-semibold text-foreground tracking-tight leading-tight">
                          {getLeadDisplayName(leadData || lead)}
                        </h1>
                        {(() => {
                          const customerSourceInfo = getCustomerSourceInfo(leadData?.source || lead?.source)
                          return customerSourceInfo && (
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap"
                              title={customerSourceInfo.description}
                              style={{
                                backgroundColor: customerSourceInfo.type === 'replyflow' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                                color: customerSourceInfo.type === 'replyflow' ? 'rgb(139, 92, 246)' : 'rgb(100, 116, 139)',
                                borderColor: customerSourceInfo.type === 'replyflow' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(100, 116, 139, 0.2)'
                              }}
                            >
                              {customerSourceInfo.icon === 'PhoneIncoming' && <PhoneIncoming className="w-3 h-3" />}
                              {customerSourceInfo.icon === 'UserPlus' && <UserPlus className="w-3 h-3" />}
                              <span>{customerSourceInfo.label}</span>
                            </span>
                          )
                        })()}
                      </div>
                      <div className="flex items-center gap-3 mb-1">
                        <p className="text-sm text-slate-400 leading-tight truncate">
                          {getLeadRequestTitle(leadData || lead) || getLeadAIIntake(leadData || lead).serviceRequested || 'No request'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-slate-500 leading-tight">
                          {formatPhoneNumber(getLeadAIIntake(leadData || lead).customerPhone || lead?.caller_phone || '')}
                        </p>
                      </div>
                    </div>

                  {/* Right Action Cluster - Status + Three-dot menu */}
                  <div className="flex items-center gap-2">
                    <LeadStatusDropdown
                      currentStatus={normalizeCustomerStatus((leadData || lead).status || (leadData || lead).lead_status)}
                      onStatusChange={handleStatusUpdate}
                      size="sm"
                    />
                    {/* Three-dot menu */}
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="h-9 w-9 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-slate-800 rounded-md transition-colors"
                        aria-label="More actions"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuContent
                        align="end"
                        side="bottom"
                        sideOffset={8}
                        collisionPadding={12}
                        avoidCollisions
                        className="z-[10000] w-[240px] max-w-[calc(100vw-24px)] max-h-[calc(100dvh-96px)] overflow-y-auto overscroll-contain rounded-lg border border-border/60 bg-popover ring-1 ring-border/40 shadow-[0_4px_16px_rgb(0,0,0,0.12),0_2px_6px_rgb(0,0,0,0.08)]"
                      >
                        {/* CREATE Section */}
                        <div className="px-2.5 py-1.5">
                          <div className="px-0.5 py-0.5 text-[9px] font-medium text-muted-foreground/60 uppercase tracking-[0.12em]">
                            Create
                          </div>
                        </div>

                        {/* Create Job */}
                        <div className="px-1 py-0.5">
                          <DropdownMenuItem
                            onSelect={handleCreateJobClick}
                            className="w-full px-2 py-1.5 text-left text-sm font-medium text-foreground hover:bg-accent/40 flex items-center gap-2.5 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer"
                          >
                            <ClipboardPlus className="w-3.5 h-3.5" />
                            <span>Create Job</span>
                          </DropdownMenuItem>
                        </div>

                        {/* Schedule */}
                        <div className="px-1 py-0.5">
                          <DropdownMenuItem
                            onSelect={handleAppointmentClick}
                            className="w-full px-2 py-1.5 text-left text-sm font-medium text-foreground hover:bg-accent/40 flex items-center gap-2.5 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer"
                          >
                            <CalendarDays className="w-3.5 h-3.5" />
                            <span>Schedule</span>
                          </DropdownMenuItem>
                        </div>

                        {/* Request Payment */}
                        <div className="px-1 py-0.5">
                          <DropdownMenuItem
                            onSelect={() => setShowPaymentModal(true)}
                            disabled={!business || getAvailableProviders(business).length === 0}
                            className="w-full px-2 py-1.5 text-left text-sm font-medium text-foreground hover:bg-accent/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Request Payment</span>
                          </DropdownMenuItem>
                        </div>

                        {/* Divider */}
                        <div className="px-2.5 py-1">
                          <div className="h-px bg-border/20"></div>
                        </div>

                        {/* SETTINGS Section */}
                        <div className="px-2.5 py-1.5">
                          <div className="px-0.5 py-0.5 text-[9px] font-medium text-muted-foreground/60 uppercase tracking-[0.12em]">
                            Settings
                          </div>
                        </div>

                        {/* Messaging & Availability */}
                        <div className="px-1 py-0.5">
                          <DropdownMenuItem
                            onSelect={() => {
                              window.location.href = '/dashboard/settings#automation'
                            }}
                            className="w-full px-1.5 py-1 text-left text-xs font-medium text-foreground hover:bg-accent/40 flex items-center gap-2 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer min-h-[32px] group"
                          >
                            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded bg-accent/30 group-hover:bg-accent/40 transition-colors">
                              <MessageSquare className="w-3 h-3 stroke-[2]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium">Messaging & Availability</div>
                              <div className="text-[9px] text-muted-foreground/70 font-normal leading-tight">Configure auto-replies</div>
                            </div>
                          </DropdownMenuItem>
                        </div>

                        {/* Divider */}
                        <div className="px-2.5 py-1">
                          <div className="h-px bg-border/20"></div>
                        </div>

                        {/* OTHER Section */}
                        <div className="px-2.5 py-1.5">
                          <div className="px-0.5 py-0.5 text-[9px] font-medium text-muted-foreground/60 uppercase tracking-[0.12em]">
                            Other
                          </div>
                        </div>

                        {/* Refresh */}
                        <div className="px-1 py-0.5">
                          <DropdownMenuItem
                            onSelect={() => handleRefresh()}
                            disabled={refreshing}
                            className="w-full px-2 py-1.5 text-left text-sm font-medium text-foreground hover:bg-accent/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors rounded-md outline-none focus:bg-accent/40 cursor-pointer"
                          >
                            <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>Refresh</span>
                          </DropdownMenuItem>
                        </div>

                                              </DropdownMenuContent>
                    </DropdownMenuPortal>
                  </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          </div>

            {successMessage && (
              <SuccessBanner
                message={successMessage}
                onComplete={() => setSuccessMessage('')}
              />
            )}

            {externalActionSuccess && (
              <SuccessBanner
                primary={externalActionSuccess.primary}
                secondary={externalActionSuccess.secondary}
                onComplete={() => setExternalActionSuccess(null)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Conversation Thread - Conditional Rendering to Prevent Duplicate Audio Elements */}
      <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full px-6 lg:px-8 py-4">

        {/* Desktop Layout - Only render when not mobile view */}
        {!isMobileView && (
          <div className="grid grid-cols-[minmax(0,3fr)_minmax(320px,380px)] gap-8 h-full min-h-0">
            {/* Desktop Conversation Section - Primary workspace */}
            <section className="flex flex-col h-full min-h-0 bg-background rounded-xl border border-border/50 shadow-sm overflow-hidden">
              {/* Desktop Conversation Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-border/30 bg-muted/40">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground/90">Conversation</h2>
                </div>
                <button
                  ref={fullScreenToggleBtnRef}
                  type="button"
                  onClick={() => setIsFullScreen(true)}
                  className="p-1.5 rounded-md hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                  aria-label="Open conversation in full screen"
                  title="Open in full screen"
                >
                  <Maximize2 className="w-4 h-4 text-foreground/70 hover:text-foreground" />
                </button>
              </div>
              
              {/* Desktop Message Thread - Scrollable */}
              {!isFullScreen && (
              <div ref={conversationContainerRef} className="flex-1 overflow-y-auto scroll-smooth px-5 py-4 min-h-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : messagesArray.length === 0 ? (
                  <div className="flex items-center justify-center py-16 animate-fadeIn">
                    <div className="text-center max-w-md px-6">
                      <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">Start the conversation</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                        Send a message to {getLeadDisplayName(leadData || lead).split(' ')[0]} to begin the conversation.
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
                    highlightedItemId={highlightedTimelineItemId}
                  />
                )}
              </div>
              )}

              {/* Desktop Message Composer - Fixed to Bottom */}
              {!isFullScreen && (
              <div className="flex-shrink-0 border-t border-border/20 bg-muted/30 px-6 py-4 rounded-b-2xl">
                {(() => {
                  const effectiveSource = (sendingSource === 'business' && supportsBusiness) ? 'business' : 'replyflow'

                  if (effectiveSource === 'business') {
                    const customerName = getCustomerName(lead, leadData)
                    const dialNumber = leadData?.caller_phone || lead?.caller_phone || ''

                    return (
                      <BusinessNumberPanel
                        recipient={dialNumber}
                        recipientName={customerName}
                      />
                    )
                  }

                  return (
                    <ConversationComposer
                      message={message}
                      setMessage={setMessage}
                      handleSendMessage={handleSendMessage}
                      sending={sending}
                      sendingSource={sendingSource}
                      isNativeMobilePlatform={supportsBusiness}
                      onClearImages={(clearFn: () => void) => {
                        clearComposerImagesRef.current = clearFn
                      }}
                      messagingContext={
                        business?.id && lead?.id ? (() => {
                          const memory = memoryService.getCustomerMemory(business.id, lead.id)
                          if (!memory) return undefined
                          return {
                            preferredContactMethod: memory.preferredContactMethod,
                            averageResponseDelay: memory.averageResponseDelay,
                            lastFollowUpTime: memory.lastSuccessfulFollowUp
                          }
                        })() : undefined
                      }
                    />
                  )
                })()}
              </div>
              )}
            </section>

            {/* Desktop Sidebar - Premium Card */}
            <aside className="h-full min-h-0" data-sidebar>
              <div className="h-full min-h-0 bg-background rounded-2xl border border-border/40 shadow-sm p-5 overflow-y-auto custom-scrollbar">
                {(() => {
                  const paymentRequests = leadData?.paymentRequests || []
                  return (
                    <div className="space-y-8">
                      {/* Customer Context */}
                      <div>
                        <div className="px-1 py-1">
                          <div className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-3">Customer Context</div>
                        </div>
                        <div className="space-y-4">
                          {/* AI Intake Summary */}
                          {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && business?.id && (
                            <div>
                              <AICallDetails
                                leadId={params.id}
                                businessId={business.id}
                                conversationId={leadData?.conversation?.id}
                                callerPhone={leadData?.phone_number || lead?.phone}
                                leadData={leadData}
                                triggerEdit={triggerEditCustomerDetails}
                                collapsible={false}
                                onSave={handleRefresh}
                              />
                            </div>
                          )}

                          {/* Customer Summary */}
                          {!(leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && business?.id) && (
                            <div className="bg-muted/30 rounded-xl border border-border/30 p-4">
                              <VoicemailSummary leadData={leadData} triggerEdit={triggerEditCustomerDetails} />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Schedule - Unified Jobs + Tasks */}
                      <SidebarSection
                        title="Schedule"
                        collapsible={true}
                        isCollapsed={collapsedSections.schedule}
                        onToggleCollapse={() => setCollapsedSections((prev: any) => ({ ...prev, schedule: !prev.schedule }))}
                        className="mb-3"
                      >
                        {leadJobs.length === 0 && leadTasks.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No scheduled work</p>
                        ) : (
                          <div className="space-y-2">
                            {/* Jobs */}
                            {leadJobs.map((job: any) => (
                              <div key={job.id} className="flex items-center gap-3 p-2.5 bg-muted/30 hover:bg-muted/50 rounded-lg transition-all duration-200">
                                <div className="flex-shrink-0 w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center">
                                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                  </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground truncate">{job.title || 'Job'}</p>
                                  <p className="text-xs text-muted-foreground/80">
                                    {job.scheduled_date ? formatDate(job.scheduled_date) : 'No date'}
                                    {job.scheduled_time ? ` • ${job.scheduled_time}` : ''}
                                  </p>
                                </div>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground/90 capitalize whitespace-nowrap border border-border/30">
                                  {formatJobStatus(job.status).text}
                                </span>
                              </div>
                            ))}
                            {/* Tasks */}
                            {leadTasks.map((task: any) => (
                              <div key={task.id} className="flex items-center gap-3 p-2.5 bg-muted/30 hover:bg-muted/50 rounded-lg transition-all duration-200">
                                <div className="flex-shrink-0 w-6 h-6 rounded bg-purple-500/10 flex items-center justify-center">
                                  <svg className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground truncate">{task.title || 'Task'}</p>
                                  <p className="text-xs text-muted-foreground/80">
                                    {task.due_date ? formatDate(task.due_date) : 'No due date'}
                                    {task.due_time ? ` • ${task.due_time}` : ''}
                                  </p>
                                </div>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground/90 capitalize whitespace-nowrap border border-border/30">
                                  {task.completed ? 'Done' : 'Open'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </SidebarSection>

                      {/* Payment */}
                      <SidebarSection
                        title="Payments"
                        className="mb-3"
                      >
                        {paymentRequests.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No payments yet</p>
                        ) : (
                          <div>
                            <div className="text-sm font-medium text-foreground mb-2">
                              {paymentRequests.filter((pr: any) => pr.status === 'paid').length === paymentRequests.length
                                ? `Paid ${formatCurrency(paymentRequests.reduce((sum: number, pr: any) => sum + (pr.amount_cents || 0), 0) / 100)}`
                                : `$${(paymentRequests.reduce((sum: number, pr: any) => sum + (pr.amount_cents || 0) - (pr.status === 'paid' ? pr.amount_cents || 0 : 0), 0) / 100).toFixed(2)} outstanding`
                              }
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {paymentRequests.length} request{paymentRequests.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        )}
                      </SidebarSection>

                      {/* Appointments */}
                      <SidebarSection
                        title="Appointments"
                        className="mb-3"
                      >
                        {loadingAppointments ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                          </div>
                        ) : appointments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No appointments</p>
                        ) : (
                          <div className="space-y-2">
                            {(() => {
                              const now = new Date()
                              const sorted = [...appointments].sort((a: any, b: any) => {
                                const dateA = new Date(a.start?.dateTime || a.start?.date)
                                const dateB = new Date(b.start?.dateTime || b.start?.date)
                                const isAPast = dateA < now
                                const isBPast = dateB < now

                                // Upcoming events always before past events
                                if (isAPast && !isBPast) return 1
                                if (!isAPast && isBPast) return -1

                                // Within same group, sort by date
                                // For upcoming: earliest first
                                // For past: newest first
                                if (isAPast && isBPast) {
                                  return dateB.getTime() - dateA.getTime() // newest past first
                                }
                                return dateA.getTime() - dateB.getTime() // earliest upcoming first
                              })
                              return sorted.slice(0, 5).map((event: any) => {
                                const startDate = new Date(event.start?.dateTime || event.start?.date)
                                const isPast = startDate < now
                                const isAllDay = !!(event.start?.date && !event.start?.dateTime)
                                let timeStr = ''
                                if (isAllDay) {
                                  timeStr = 'All day'
                                } else if (event.start?.dateTime) {
                                  timeStr = new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                }
                                const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                return (
                                  <div key={event.id} className="flex items-center gap-3 p-2.5 bg-muted/30 hover:bg-muted/50 rounded-lg transition-all duration-200">
                                    <div className="flex-shrink-0 w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center">
                                      <CalendarDays className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-foreground truncate">{event.summary}</p>
                                      <p className="text-xs text-muted-foreground/80">
                                        {dateStr} • {timeStr}
                                      </p>
                                    </div>
                                    {isPast && (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize whitespace-nowrap border border-border/30">
                                        Past
                                      </span>
                                    )}
                                  </div>
                                )
                              })
                            })()}
                          </div>
                        )}
                      </SidebarSection>

                      {/* Internal Notes */}
                      <SidebarSection
                        title="Internal Notes"
                        headerAction={
                          <button
                            type="button"
                            onClick={() => {
                              setInternalNotesValue(leadData?.notes || '')
                              setShowInternalNotesModal(true)
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
                          >
                            {Boolean((leadData?.notes || '').trim()) ? 'Edit' : 'Add'}
                          </button>
                        }
                      >
                        <div className="text-[10px] text-muted-foreground/70 mb-2">Private</div>
                        {Boolean((leadData?.notes || '').trim()) ? (
                          <div className="text-xs text-muted-foreground line-clamp-3 break-words">
                            {(leadData?.notes || '').trim()}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No notes yet</p>
                        )}
                      </SidebarSection>
                    </div>
                  )
                })()}
              </div>
            </aside>
          </div>
        )}

      </div>

      {/* Mobile Layout - Only render when mobile view */}
        {isMobileView && (
          <div className="px-4 sm:px-5 space-y-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
          {/* Conversation Workspace Card - Fixed height with internal scrolling */}
          <div className="bg-background rounded-2xl border border-border/40 shadow-sm overflow-hidden flex flex-col min-h-0 h-[calc(100vh-12rem-4rem)]">
            {/* Conversation Header - Distinct header */}
            <div className="px-4 py-3 border-b border-border/30 bg-muted/50 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-foreground">Conversation</h2>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                  {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && (
                    <span>AI answered</span>
                  )}
                  {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && leadData?.messages?.some((m: any) => m.direction === 'inbound') && (
                    <span>•</span>
                  )}
                  {leadData?.messages?.some((m: any) => m.direction === 'inbound') && (
                    <span>Customer replied</span>
                  )}
                  {(leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 || leadData?.messages?.some((m: any) => m.direction === 'inbound')) && (followUpJobs && followUpJobs.length > 0 || followUpSettings?.enabled) && (
                    <span>•</span>
                  )}
                  {(followUpJobs && followUpJobs.length > 0 || followUpSettings?.enabled) && (
                    <span>Follow-ups available</span>
                  )}
                </div>
              </div>
            </div>

            {/* Message Area - Scrollable viewport with flex-1 */}
            <div className="flex-1 overflow-y-auto scroll-smooth overscroll-contain bg-muted/20 min-h-0" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', scrollPaddingBottom: '5rem' }}>
            {/* Mobile Message Thread */}
            <div ref={mobileConversationContainerRef} className="px-3 py-2 flex flex-col justify-end min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : messagesArray.length === 0 ? (
                <div className="flex items-center justify-center py-12 animate-fadeIn">
                  <div className="text-center max-w-sm px-6">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                      <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2">Start the conversation</h3>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                      Send a message to {getLeadDisplayName(leadData || lead).split(' ')[0]} to begin the conversation.
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
                  highlightedItemId={highlightedTimelineItemId}
                />
              )}
            </div>
            </div>
            {/* Divider above composer */}
            <div className="border-t border-border/30 flex-shrink-0"></div>
            {/* Composer - Attached to workspace, fixed at bottom */}
            <div className="px-4 py-3 bg-muted/40 flex-shrink-0" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
              {(() => {
                const effectiveSource = (sendingSource === 'business' && supportsBusiness) ? 'business' : 'replyflow'

                if (effectiveSource === 'business') {
                  const customerName = getCustomerName(lead, leadData)
                  const dialNumber = leadData?.caller_phone || lead?.caller_phone || ''

                  return (
                    <BusinessNumberPanel
                      recipient={dialNumber}
                      recipientName={customerName}
                    />
                  )
                }

                return (
                  <>
                    {/* Image Previews */}
                    {mobileImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {mobileImages.map((file, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={URL.createObjectURL(file)}
                              alt="Preview"
                              className="w-16 h-16 object-cover rounded-md border border-border/30 transition-opacity duration-200"
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
                    <div className="flex items-center gap-1 bg-muted/40 dark:bg-muted/30 border border-border/20 rounded-lg p-1 hover:shadow-md transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500/40 focus-within:bg-muted/60 dark:focus-within:bg-muted/40">
                      {/* Image Upload Button */}
                      <button
                        type="button"
                        onClick={() => mobileFileInputRef.current?.click()}
                        className="p-2 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted/30 transition-all duration-200 flex-none rounded-lg h-11 w-11 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2 focus:ring-offset-background"
                        disabled={sending}
                        aria-label="Add image"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                      <div className="flex-1 min-w-0">
                        <textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          onKeyDown={handleMobileKeyDown}
                          placeholder="Type a message..."
                          autoCapitalize="sentences"
                          autoCorrect="on"
                          spellCheck={true}
                          autoComplete="on"
                          enterKeyHint="send"
                          className="composer-textarea-no-scrollbar w-full min-h-[44px] max-h-[120px] px-1.5 py-2.5 bg-transparent text-foreground resize-none focus:outline-none text-base leading-normal h-11 placeholder:text-muted-foreground/50"
                          rows={1}
                          disabled={sending}
                        />
                      </div>
                      <button
                        onClick={() => handleSendMessage(mobileImages.length > 0 ? mobileImages : undefined)}
                        disabled={(!message.trim() && mobileImages.length === 0) || sending}
                        className={`w-11 h-11 rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow flex items-center justify-center flex-none disabled:shadow-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2 focus:ring-offset-background ${
                          (message.trim() || mobileImages.length > 0) && !sending
                            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md hover:shadow-lg'
                            : 'bg-muted/50 dark:bg-muted/30 text-muted-foreground/50 dark:text-muted-foreground/40 hover:bg-muted/60 dark:hover:bg-muted/40 disabled:cursor-not-allowed'
                        }`}
                        aria-label="Send message"
                      >
                        {sending ? (
                          <span
                            aria-hidden="true"
                            className="h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current motion-safe:animate-spin motion-reduce:animate-none"
                          />
                        ) : (
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          {/* Customer Summary - Hero Card for non-AI-intake customers */}
          {!(leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && business?.id) && (
            <VoicemailSummary leadData={leadData} triggerEdit={triggerEditCustomerDetails} />
          )}

          {/* Collapsible Sections - Below conversation */}
          {/* AI Intake - Collapsible */}
          {leadData?.aiCallRecords && leadData.aiCallRecords.length > 0 && business?.id && (
            <div className="bg-muted/30 border border-border/30 rounded-xl p-3 shadow-sm">
              <button
                onClick={() => setCollapsedSections((prev: any) => ({ ...prev, aiIntake: !prev.aiIntake }))}
                className="flex items-center justify-between w-full"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground/90 uppercase tracking-wider">AI Intake</span>
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
                    triggerEdit={triggerEditCustomerDetails}
                    collapsible={false}
                    onSave={handleRefresh}
                    onNavigateToTimeline={handleNavigateToTimeline}
                  />
                </div>
              )}
            </div>
          )}

          {/* Jobs - Collapsible */}
          <div className="bg-muted/30 border border-border/30 rounded-xl p-3 shadow-sm">
            <button
              onClick={() => setCollapsedSections((prev: any) => ({ ...prev, schedule: !prev.schedule }))}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-muted-foreground/90 uppercase tracking-wider">Jobs</span>
                {leadJobs.length > 0 && (
                  <span className="text-xs text-muted-foreground">({leadJobs.length})</span>
                )}
              </div>
              <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.schedule ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!collapsedSections.schedule && (
              <div className="mt-2">
                {leadJobs.length === 0 ? (
                  <button
                    onClick={handleCreateJobClick}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Job
                  </button>
                ) : (
                  <div className="space-y-1">
                    {leadJobs.slice(0, 3).map((job: any) => (
                      <div key={job.id} className="flex items-center justify-between p-2 bg-muted/50 hover:bg-muted/70 rounded-lg transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{job.title || 'Job'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {job.scheduled_date ? formatDate(job.scheduled_date) : 'No date'}
                            {job.scheduled_time ? ` • ${job.scheduled_time}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize whitespace-nowrap ml-2 border border-border/50">
                          {formatJobStatus(job.status).text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payments - Collapsible */}
          <div className="bg-muted/30 border border-border/30 rounded-xl p-3 shadow-sm">
            <button
              onClick={() => setCollapsedSections((prev: any) => ({ ...prev, payments: !prev.payments }))}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-muted-foreground/90 uppercase tracking-wider">Payments</span>
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
                          {formatPaymentStatus(pr.status).text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        <div className="bg-muted/30 border border-border/30 rounded-xl p-3 shadow-sm">
          <button
            onClick={() => setCollapsedSections((prev: any) => ({ ...prev, appointments: !prev.appointments }))}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground/90 uppercase tracking-wider">Appointments</span>
              {appointments.length > 0 && (
                <span className="text-xs text-muted-foreground">{appointments.length}</span>
              )}
            </div>
            <svg className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${collapsedSections.appointments ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections.appointments && (
            <div className="mt-2">
              {loadingAppointments ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              ) : appointments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No appointments</p>
              ) : (
                <div className="space-y-1.5">
                  {(() => {
                    const now = new Date()
                    const sorted = [...appointments].sort((a: any, b: any) => {
                      const dateA = new Date(a.start?.dateTime || a.start?.date)
                      const dateB = new Date(b.start?.dateTime || b.start?.date)
                      const isAPast = dateA < now
                      const isBPast = dateB < now

                      // Upcoming events always before past events
                      if (isAPast && !isBPast) return 1
                      if (!isAPast && isBPast) return -1

                      // Within same group, sort by date
                      // For upcoming: earliest first
                      // For past: newest first
                      if (isAPast && isBPast) {
                        return dateB.getTime() - dateA.getTime() // newest past first
                      }
                      return dateA.getTime() - dateB.getTime() // earliest upcoming first
                    })
                    return sorted.slice(0, 3).map((event: any) => {
                      const startDate = new Date(event.start?.dateTime || event.start?.date)
                      const isPast = startDate < now
                      const isAllDay = !!(event.start?.date && !event.start?.dateTime)
                      let timeStr = ''
                      if (isAllDay) {
                        timeStr = 'All day'
                      } else if (event.start?.dateTime) {
                        timeStr = new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                      }
                      const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      return (
                        <div key={event.id} className="flex items-center justify-between p-2 bg-muted/50 hover:bg-muted/70 rounded-lg transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{event.summary}</p>
                            <p className="text-[10px] text-muted-foreground">{dateStr} {timeStr ? '• ' + timeStr : ''}</p>
                          </div>
                          {isPast && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize whitespace-nowrap ml-2">
                              Past
                            </span>
                          )}
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
        )}

      {/* Mobile Bottom Sheet for Customer Details */}
      {showLeadInfo && (
        <div className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50" onClick={() => setShowLeadInfo(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl w-full max-h-[80vh] overflow-hidden animate-slide-up" onClick={(e) => e.stopPropagation()}>
            {/* Handle */}
            <div className="flex justify-center py-1.5">
              <div className="w-12 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
            </div>
            
            {/* Header */}
            <div className="px-3 pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Customer Details</h3>
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
            <div className="px-3 py-3 overflow-y-auto max-h-[60vh]">
              {/* Contact Information */}
              <div className="space-y-3 mb-4">
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
                
                <div className="space-y-2 text-sm">
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
              <div className="space-y-3 mb-4">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">System Details</h4>
                <div className="space-y-2 text-sm">
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
                <div className="space-y-3 mb-4">
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
            <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
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
                  className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Modal for Customer Details */}
      {showLeadInfo && (
        <div className="hidden md:block fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowLeadInfo(false)}>
          <div className="bg-white dark:bg-slate-800/80 rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
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
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ignore Contact Modal */}
      {showIgnoreModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800/80 rounded-xl shadow-xl max-w-md w-full p-6">
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

      {/* Internal Notes Modal */}
      {showInternalNotesModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800/80 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              {internalNotesValue?.trim() ? 'Edit Internal Notes' : 'Add Internal Notes'}
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Private — customers cannot see these notes.</p>
                <textarea
                  value={internalNotesValue}
                  onChange={(e) => setInternalNotesValue(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-background resize-none"
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck={true}
                  inputMode="text"
                  rows={5}
                  placeholder="Enter notes about this customer"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowInternalNotesModal(false)
                  setInternalNotesValue('')
                }}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const supabase = createBrowserClient()
                  const { data: { session } } = await supabase.auth.getSession()
                  const headers: HeadersInit = { 'Content-Type': 'application/json' }
                  if (session?.access_token) {
                    headers['Authorization'] = `Bearer ${session.access_token}`
                  }

                  try {
                    const response = await fetch(`/api/leads/${lead?.id}`, {
                      method: 'PATCH',
                      headers,
                      body: JSON.stringify({
                        notes: internalNotesValue || null
                      })
                    })

                    if (response.ok) {
                      setShowInternalNotesModal(false)
                      setInternalNotesValue('')
                      // Refresh lead data
                      const updatedData = await getLeadDetails(lead?.id)
                      if (updatedData?.ok && updatedData.lead) {
                        setLeadData({ ...updatedData.lead, messages: updatedData.lead.messages || updatedData.messages || [] })
                      }
                    } else {
                      const errorData = await response.json()
                      setError(errorData.error || 'Failed to save notes')
                    }
                  } catch (error) {
                    console.error('Error saving notes:', error)
                    setError(error instanceof Error ? error.message : 'Failed to save notes')
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

                  // Resolve canonical conversation ID from multiple sources
                  const resolvedConversationId = leadData?.conversationId || leadData?.conversation?.id

                  if (!resolvedConversationId) {
                    console.error('[PAYMENT CREATE] No conversation ID available from leadData:', {
                      conversationId: leadData?.conversationId,
                      conversationIdNested: leadData?.conversation?.id,
                      leadId: leadData?.id
                    })
                    throw new Error('Unable to determine conversation for payment request. Please refresh the page and try again.')
                  }

                  const payload = {
                    business_id: business?.id,
                    lead_id: leadData?.id || params.id,
                    conversation_id: resolvedConversationId,
                    amount_cents: Math.round(parseFloat(paymentAmount) * 100),
                    description: paymentDescription || undefined,
                    payment_provider: selectedPaymentProvider,
                    skip_sms: false,
                  }

                  console.log('[PAYMENT CREATE] Payload:', payload)

                  // Desktop fallback: if Business Number is default but platform is not native mobile, use ReplyFlow
                  const effectiveSource = (sendingSource === 'business' && supportsBusiness) ? 'business' : 'replyflow'

                  if (effectiveSource === 'business') {
                    // Skip SMS and prepare for Business Phone modal
                    payload.skip_sms = true
                  }

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

                  console.log('[PAYMENT BUSINESS SMS] submit entered')
                  console.log('[PAYMENT BUSINESS SMS] effective source:', effectiveSource)
                  console.log('[PAYMENT BUSINESS SMS] API success, payment_request_id:', data.payment_request_id || data.id)

                  // Optimistic insertion: Add new payment request to leadData immediately
                  if (data.payment_request_id && data.conversation_id) {
                    const newPaymentRequest = {
                      id: data.payment_request_id,
                      conversation_id: data.conversation_id,
                      lead_id: data.lead_id,
                      business_id: data.business_id,
                      amount_cents: data.amount_cents,
                      description: data.description,
                      status: data.status,
                      payment_provider: data.payment_provider,
                      created_at: data.created_at
                    }

                    console.log('[PAYMENT OPTIMISTIC] Adding payment request to leadData:', {
                      payment_request_id: newPaymentRequest.id,
                      conversation_id: newPaymentRequest.conversation_id,
                      amount_cents: newPaymentRequest.amount_cents
                    })

                    setLeadData((prev: any) => {
                      const existingRequests = prev?.paymentRequests || []
                      // Deduplicate: only add if this payment request ID doesn't already exist
                      const alreadyExists = existingRequests.some((pr: any) => pr.id === newPaymentRequest.id)
                      if (alreadyExists) {
                        console.log('[PAYMENT OPTIMISTIC] Payment request already exists, skipping optimistic insertion')
                        return prev
                      }
                      return {
                        ...prev,
                        paymentRequests: [...existingRequests, newPaymentRequest]
                      }
                    })
                  }

                  // Handle based on effective sending source
                  if (effectiveSource === 'business') {
                    // Launch SMS directly with payment request message
                    const businessName = business?.name || 'our business'
                    const amount = (parseFloat(paymentAmount) || 0).toFixed(2)
                    const description = paymentDescription || 'Service payment'
                    const message = `${businessName} has sent you a payment request of $${amount}${description ? ` for ${description}` : ''}.

Pay securely here:
${data.payment_link}

If you have questions, reply to this message.`
                    const recipient = leadData?.caller_phone || lead?.caller_phone || ''

                    try {
                      // In-flight guard to prevent duplicate launches
                      if (isLaunchingSMS) {
                        return
                      }
                      setIsLaunchingSMS(true)
                      
                      console.log('[PAYMENT BUSINESS SMS] Storing payment data locally before modal close')
                      // Store payment data locally for app-resume refresh
                      const pendingPaymentRefresh = {
                        leadId: lead?.id,
                        conversationId: leadData?.conversationId,
                        paymentRequestId: data.payment_request_id || data.id
                      }
                      localStorage.setItem('pendingPaymentRefresh', JSON.stringify(pendingPaymentRefresh))
                      
                      console.log('[PAYMENT BUSINESS SMS] Closing modal before native launch')
                      // Close modal immediately before native launch
                      setShowPaymentModal(false)
                      setPaymentAmount('')
                      setPaymentDescription('')
                      setSuccessMessage(`Payment request sent\nMessage opened in your messaging app.`)
                      
                      // Allow React to commit the close before native launch
                      await new Promise(resolve => setTimeout(resolve, 0))
                      
                      console.log('[PAYMENT BUSINESS SMS] Launching native Messages')
                      // Launch SMS using shared helper
                      await openBusinessSms({ recipient, body: message, source: 'payment' })
                      
                      console.log('[PAYMENT BUSINESS SMS] Native launch completed, refresh will happen on app resume')
                    } catch (error) {
                      console.error('[PAYMENT BUSINESS SMS] launch error:', error)
                      // Keep modal open for retry (shared helper handles fallback internally)
                      setSuccessMessage(`Payment request sent\nCouldn't open your messaging app. Please try again.`)
                    } finally {
                      setIsLaunchingSMS(false)
                    }
                  } else if (effectiveSource === 'replyflow' && isNativeMobilePlatform) {
                    // ReplyFlow Number flow on native mobile: ReplyFlow sends the SMS automatically
                    const customerName = getCustomerName(lead, leadData)
                    const secondaryText = customerName
                      ? `${customerName} has been texted a secure payment link.`
                      : 'The customer has been texted a secure payment link.'
                    // Close modal and reset form after server confirms success
                    setShowPaymentModal(false)
                    setPaymentAmount('')
                    setPaymentDescription('')
                    setSuccessMessage(`Payment request sent\n${secondaryText}`)
                  } else {
                    // Desktop or unsupported platform: send automatically through ReplyFlow
                    const customerName = getCustomerName(lead, leadData)
                    const secondaryText = customerName
                      ? `${customerName} has been texted a secure payment link.`
                      : 'The customer has been texted a secure payment link.'
                    // Close modal and reset form after server confirms success
                    setShowPaymentModal(false)
                    setPaymentAmount('')
                    setPaymentDescription('')
                    setSuccessMessage(`Payment request sent\n${secondaryText}`)
                  }

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

    {/* New Unified Appointment Modal for Customer context */}
    <NewAppointmentModal
      isOpen={isNewAppointmentOpen}
      onClose={() => setIsNewAppointmentOpen(false)}
      onRefresh={async () => {
        await fetchAppointments()
      }}
      onSuccess={() => {
        setSuccessMessage('Appointment created successfully.')
      }}
      context="customer"
      preselectedLeadId={params.id}
      preselectedLeadDisplay={getLeadDisplayName(leadData)}
      allowAddCustomer={false}
      requireCustomer={true}
      lockCustomer={true}
    />

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
              <div key={job.id} className="flex flex-col gap-2">
                <button
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
                    {job.scheduled_date && formatDate(job.scheduled_date)}
                    {job.scheduled_time && ` • ${job.scheduled_time}`}
                  </div>
                  {job.confirmation_sms_sent_at && (
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                      ✓ Confirmation sent
                    </div>
                  )}
                </button>
                {effectiveSource === 'business' && (
                  <button
                    onClick={async () => {
                      const customerName = getCustomerName(lead, leadData)
                      const dialNumber = leadData?.caller_phone || lead?.caller_phone || ''
                      const message = `Appointment reminder: ${job.title || 'Appointment'} scheduled for ${job.scheduled_date} at ${job.scheduled_time}.`

                      try {
                        // Launch SMS using shared helper
                        await openBusinessSms({ recipient: dialNumber, body: message, source: 'reminder' })
                        
                        // Record the Business Phone action only after successful launch
                        await recordBusinessPhoneAction({
                          actionType: 'appointment',
                          leadId: params.id,
                          customerName: customerName,
                          customerPhone: dialNumber,
                          message: message,
                          relatedId: job.id,
                          relatedType: 'job'
                        })
                        
                        setShowAppointmentSelection(false)
                        setSuccessMessage(`Reminder sent\nMessage opened in your messaging app.`)
                      } catch (error) {
                        console.error('[Appointment Reminder] Failed to launch SMS:', error)
                        // Keep modal open for retry (shared helper handles fallback internally)
                        setSuccessMessage(`Reminder sent\nCouldn't open your messaging app. Please try again.`)
                      }
                    }}
                    className="w-full text-left p-2 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-sm"
                  >
                    Send via Business Number
                  </button>
                )}
              </div>
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

    {/* Appointment Success Modal */}
    {showAppointmentSuccessModal && appointmentSuccessData && (
      <Modal
        isOpen={showAppointmentSuccessModal}
        onClose={() => setShowAppointmentSuccessModal(false)}
        title=""
        className="max-w-md"
      >
        <div className="p-6">
          <div className="flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
            <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2 text-center">
            Appointment created
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">
            {appointmentSuccessData.customerName} is scheduled for {appointmentSuccessData.date} at {appointmentSuccessData.time}.
          </p>
          <div className="space-y-3">
            {effectiveSource === 'business' && (
              <button
                onClick={async () => {
                  const customerName = appointmentSuccessData.customerName
                  const dialNumber = leadData?.caller_phone || lead?.caller_phone || ''
                  const message = `Appointment scheduled for ${appointmentSuccessData.date} at ${appointmentSuccessData.time}.`

                  try {
                    // Launch SMS using shared helper
                    await openBusinessSms({ recipient: dialNumber, body: message, source: 'confirmation' })
                    
                    // Record the Business Phone action only after successful launch
                    await recordBusinessPhoneAction({
                      actionType: 'appointment',
                      leadId: params.id,
                      customerName: customerName,
                      customerPhone: dialNumber,
                      message: message
                    })
                    
                    setShowAppointmentSuccessModal(false)
                    setSuccessMessage(`Appointment sent\nMessage opened in your messaging app.`)
                  } catch (error) {
                    console.error('[Appointment Success] Failed to launch SMS:', error)
                    // Keep modal open for retry (shared helper handles fallback internally)
                    setSuccessMessage(`Appointment sent\nCouldn't open your messaging app. Please try again.`)
                  }
                }}
                className="w-full px-4 py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              >
                Send via Business Number
              </button>
            )}
            <button
              onClick={() => {
                setShowAppointmentSuccessModal(false)
                router.push('/dashboard/calendar')
              }}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              View Schedule
            </button>
            <button
              onClick={() => setShowAppointmentSuccessModal(false)}
              className="w-full px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    )}

    {/* Shared Business Phone Modal */}
    {showBusinessPhoneModal && businessPhoneModalConfig && (
      <BusinessPhoneModal
        isOpen={showBusinessPhoneModal}
        onClose={() => {
          setShowBusinessPhoneModal(false)
          setBusinessPhoneModalConfig(null)
        }}
        title={businessPhoneModalConfig.title}
        description={businessPhoneModalConfig.description}
        message={businessPhoneModalConfig.message}
        recipient={businessPhoneModalConfig.recipient}
        recipientName={businessPhoneModalConfig.recipientName}
        actionType={businessPhoneModalConfig.actionType}
        onSend={async () => {
          // Copy the message to clipboard as fallback
          try {
            await navigator.clipboard.writeText(businessPhoneModalConfig.message)
            console.log('[BusinessPhone] Message copied to clipboard')
          } catch (error) {
            console.error('[BusinessPhone] Failed to copy message:', error)
          }

          // Record the Business Phone action
          await recordBusinessPhoneAction({
            actionType: businessPhoneModalConfig.actionType,
            leadId: params.id,
            customerName: businessPhoneModalConfig.recipientName || 'Customer',
            customerPhone: businessPhoneModalConfig.recipient,
            message: businessPhoneModalConfig.message,
            relatedId: businessPhoneModalConfig.relatedId,
            relatedType: businessPhoneModalConfig.relatedType
          })

          // Launch the native Messages app
          const smsUrl = `sms:${businessPhoneModalConfig.recipient}?body=${encodeURIComponent(businessPhoneModalConfig.message)}`

          // On native mobile, use anchor element click to launch the SMS app
          if (Capacitor.isNativePlatform()) {
            const link = document.createElement('a')
            link.href = smsUrl
            link.click()
          } else {
            // On desktop/web, open in new tab
            window.open(smsUrl, '_blank')
          }
        }}
      />
    )}

    {/* Full-screen Conversation Overlay */}
    {isFullScreen && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 animate-in fade-in duration-200 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Full screen conversation">
        {/* Side depth layer - radial gradients for environmental depth */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-blue-950/20 via-transparent to-transparent"></div>
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-950/20 via-transparent to-transparent"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-radial-gradient from-transparent via-slate-900/30 to-slate-950/50"></div>
        </div>

        {/* Unified workspace container with subtle boundary */}
        <div className="relative flex flex-col w-full max-w-6xl h-full bg-slate-900/60 border border-border/30 shadow-2xl animate-in zoom-in-95 duration-200 ease-out">
          {/* Header - Substantial elevated surface */}
          <div className="flex items-center justify-between px-6 sm:px-8 py-4 sm:py-5 border-b border-border/40 bg-gradient-to-b from-slate-900 to-slate-900/95 flex-shrink-0 shadow-sm" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Conversation</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsFullScreen(false)}
              className="p-2 rounded-md hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
              aria-label="Exit full screen"
            >
              <Minimize2 className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Scrollable thread - Conversation stage with dedicated surface */}
          <div ref={fullScreenScrollRef} tabIndex={-1} className="flex-1 overflow-y-auto min-h-0 outline-none bg-slate-900/40">
            <div className="max-w-full px-6 sm:px-8 py-6 sm:py-8">
            {isMobileView ? (
              loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : messagesArray.length === 0 ? (
                <div className="flex items-center justify-center py-12 animate-fadeIn">
                  <div className="text-center max-w-sm px-6">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                      <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2">Start the conversation</h3>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                      Send a message to {getLeadDisplayName(leadData || lead).split(' ')[0]} to begin the conversation.
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
                  highlightedItemId={highlightedTimelineItemId}
                />
              )
            ) : (
              loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : messagesArray.length === 0 ? (
                <div className="flex items-center justify-center h-full py-16 animate-fadeIn">
                  <div className="text-center max-w-md px-6">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                      <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Start the conversation</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                      Send a message to {getLeadDisplayName(leadData || lead).split(' ')[0]} to begin the conversation.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto">
                  <DesktopConversationMessageList
                    messagesArray={messagesArray}
                    conversationTimeline={conversationTimeline}
                    sending={sending}
                    handleRetry={handleRetry}
                    getErrorMessage={getErrorMessage}
                    onImageLoad={() => scrollToBottom('smooth', true)}
                    highlightedItemId={highlightedTimelineItemId}
                  />
                </div>
              )
            )}
          </div>
        </div>

        {/* Composer pinned bottom - Elevated surface with stronger separation */}
        <div className="shrink-0 border-t border-border/40 bg-gradient-to-b from-slate-900/80 via-slate-900/70 to-slate-900/60 px-6 sm:px-8 py-4 sm:py-5 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}>
          {(() => {
            const effectiveSource = (sendingSource === 'business' && supportsBusiness) ? 'business' : 'replyflow'
            if (effectiveSource === 'business') {
              const customerName = getCustomerName(lead, leadData)
              const dialNumber = leadData?.caller_phone || lead?.caller_phone || ''
              return (
                <BusinessNumberPanel recipient={dialNumber} recipientName={customerName} />
              )
            }
            return (
              <ConversationComposer
                message={message}
                setMessage={setMessage}
                handleSendMessage={handleSendMessage}
                sending={sending}
                sendingSource={sendingSource}
                isNativeMobilePlatform={supportsBusiness}
                onClearImages={(clearFn: () => void) => { clearComposerImagesRef.current = clearFn }}
                messagingContext={
                  business?.id && lead?.id ? (() => {
                    const memory = memoryService.getCustomerMemory(business.id, lead.id)
                    if (!memory) return undefined
                    return {
                      preferredContactMethod: memory.preferredContactMethod,
                      averageResponseDelay: memory.averageResponseDelay,
                      lastFollowUpTime: memory.lastSuccessfulFollowUp
                    }
                  })() : undefined
                }
              />
            )
          })()}
        </div>
        </div>
      </div>,
      document.body
    )}
    </DashboardErrorBoundary>
  )
}

