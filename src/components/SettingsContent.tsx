'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import DashboardErrorBoundary from '@/components/DashboardErrorBoundary'
import SettingsActionBar from '@/components/SettingsActionBar'
import Toast, { ToastContainer } from '@/components/Toast'
import PasswordInput from '@/components/PasswordInput'
import { useSettingsFormState } from '@/hooks/useSettingsFormState'
import { useTapToPayAwareness } from '@/hooks/useTapToPayAwareness'
import { useTapToPayReaderPresentation } from '@/hooks/useTapToPayReaderPresentation'
import { TapToPayEducationModal } from '@/components/TapToPayEducationModal'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { Capacitor } from '@capacitor/core'
import Link from 'next/link'
import { formatPhoneNumber } from '@/lib/utils'
import Navigation from '@/components/Navigation'
import PageBackground from '@/components/PageBackground'
import UserDropdown from '@/components/UserDropdown'
import AppHeader from '@/components/AppHeader'
import BottomNavigation from '@/components/BottomNavigation'
import { settingsSections, getSettingsSections } from '@/lib/settings-config'
import {
  getSubscriptionStatusText,
  getSubscriptionStatusDescription,
  isInTrialPeriod,
  needsUpgrade,
  getPricingDisplay,
  getTrialDisplay,
  SUBSCRIPTION_STATES
} from '@/lib/subscription'
import { hasActiveSubscription } from '@/lib/subscription-utils'
import { PRICING_CONFIG } from '@/lib/pricing'
import { handleBillingAction } from '@/lib/billing'
import { openStripeConnectOnboarding } from '@/lib/stripe-connect'
import { getBusinessOnboardingState, BusinessData } from '@/lib/onboarding-state'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import { getManualAccessStatus, getManualAccessDisplayInfo } from '@/lib/manual-access'
import ImportContactsModal from '@/components/ImportContactsModal'
import FollowUpSettings from '@/components/FollowUpSettings'
import { getDefaultOutOfOfficeTemplate, getDefaultAfterHoursTemplate } from '@/lib/out-of-office'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useSendingSource, SendingSource } from '@/hooks/useSendingSource'
import { CreditCard, Mail, MessageSquare, Trash2, AlertTriangle, FileText, Clock, CheckCircle, Smartphone, Eye, EyeOff, RefreshCw } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Skeleton, { CardSkeleton, ListItemSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import Input from '@/components/ui/Input'
import { NotificationsPreferences } from '@/components/NotificationsPreferences'

// Check if running in native mobile app
const isNativeMobile = () => {
  try {
    return (window as any).Capacitor?.isNativePlatform?.() ?? false
  } catch {
    return false
  }
}

// Check if running on iOS
const isIOS = () => {
  try {
    return (window as any).Capacitor?.getPlatform?.() === 'ios'
  } catch {
    return false
  }
}

export default function SettingsContent() {
  const router = useRouter()
  const { business, setBusiness, refreshBusiness } = useBusiness()
  const { user, signOut } = useAuth()
  const { sendingSource, isLoading: sendingSourceLoading, updateSendingSource } = useSendingSource()
  const tapToPayAwareness = useTapToPayAwareness(business)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordError, setDeletePasswordError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)
  // Local state for immediate Stripe Connect status updates
  const [localStripeStatus, setLocalStripeStatus] = useState<string | null>(null)
  const [localStripeChargesEnabled, setLocalStripeChargesEnabled] = useState<boolean | null>(null)
  const [localStripeDetailsSubmitted, setLocalStripeDetailsSubmitted] = useState<boolean | null>(null)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])
  const [activeSection, setActiveSection] = useState('general')
  const [showBusinessNumberWarning, setShowBusinessNumberWarning] = useState(false)

  // Default out of office message (use canonical template)
  const DEFAULT_OUT_OF_OFFICE_MESSAGE = getDefaultOutOfOfficeTemplate()

  // Default after hours message (use canonical template)
  const DEFAULT_AFTER_HOURS_MESSAGE = getDefaultAfterHoursTemplate()

  // Use centralized onboarding state machine
  const onboardingState = getBusinessOnboardingState(business, {})

  // Ignored contacts state
  const [ignoredContacts, setIgnoredContacts] = useState<any[]>([])
  const [isLoadingIgnored, setIsLoadingIgnored] = useState(false)
  
  // Add ignored contact modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [label, setLabel] = useState('')

  // Import contacts modal state
  const [showImportModal, setShowImportModal] = useState(false)
  
  // Tap to Pay education modal state
  const [showEducationModal, setShowEducationModal] = useState(false)
  const [educationOfferedThisSession, setEducationOfferedThisSession] = useState(false)

  // Education confirmation modal state
  const [showEducationConfirmationModal, setShowEducationConfirmationModal] = useState(false)

  // Apple Tap to Pay account linkage state (authoritative Apple/Stripe status)
  const [appleAccountLinkageState, setAppleAccountLinkageState] = useState<{
    status: 'unknown' | 'linked' | 'not_linked' | 'error' | 'unavailable'
    isLoading: boolean
  }>({
    status: 'unknown',
    isLoading: false
  })

  // Tap to Pay enablement state
  const [isEnablingTapToPay, setIsEnablingTapToPay] = useState(false)

  // Reader presentation state for configuration progress (reuses existing hook)
  const {
    state: readerState,
    resetState: resetReaderState,
  } = useTapToPayReaderPresentation(isEnablingTapToPay)

  // Trigger education after first successful reader connection
  useEffect(() => {
    if (!business?.stripe_charges_enabled) return
    if (business?.tap_to_pay_education_completed_at) return
    if (educationOfferedThisSession) return

    // Education is triggered by payment orchestration after first successful reader connection
    // This component only handles Settings guide entry, not auto-trigger
    // The trigger should be implemented in the payment flow using readerConnected event
  }, [business, educationOfferedThisSession])
  
  const handleEducationComplete = async () => {
    try {
      const response = await fetch('/api/business/tap-to-pay-education', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to complete education')
      }

      const result = await response.json()
      setBusiness(result.business)
      setShowEducationModal(false)
      showToast('Tap to Pay guide completed', 'success')
    } catch (error) {
      console.error('[SettingsContent] Error completing education:', error)
      showToast('Failed to complete education', 'error')
    }
  }

  // Handle native education guide for iOS 18+ using Apple's ProximityReaderDiscovery
  const handleNativeEducationGuide = async () => {
    try {
      const ReplyflowStripeTerminal = (await import('@/lib/terminal')).default
      const result = await ReplyflowStripeTerminal.presentMerchantEducation()

      if (result.presented && result.method === 'native_ios18') {
        // Native education presented - show confirmation modal immediately
        // Apple's native UI overlays the WebView, so the confirmation modal
        // will be hidden underneath until the user dismisses Apple's native content
        console.log('[SettingsContent] Native education presented via ProximityReaderDiscovery')
        setShowEducationConfirmationModal(true)
      } else {
        // Fallback to React modal if native not available
        console.log('[SettingsContent] Native education not available, using fallback:', result.reason)
        setShowEducationModal(true)
      }
    } catch (error) {
      console.error('[SettingsContent] Failed to present native education:', error)
      showToast('Failed to open Tap to Pay guide', 'error')
    }
  }

  // Handle Tap to Pay enablement from Settings
  const handleEnableTapToPay = async () => {
    // Guard against duplicate concurrent attempts
    if (isEnablingTapToPay) {
      console.log('[SettingsContent] Enablement already in progress, ignoring duplicate request')
      return
    }

    // Verify Stripe Connect setup is configured
    if (!business?.stripe_charges_enabled) {
      showToast('Complete payment setup before enabling Tap to Pay', 'error')
      return
    }

    // Verify platform support
    const platform = tapToPayAwareness.state.tapToPaySupportStatus?.platform
    const status = tapToPayAwareness.state.tapToPaySupportStatus?.status
    const isIOS = platform === 'ios'
    const isSupported = status === 'supported'

    if (!isIOS || !isSupported) {
      showToast('Tap to Pay is not supported on this device', 'error')
      return
    }

    setIsEnablingTapToPay(true)

    try {
      const terminalService = TerminalBridgeService.getInstance()
      if (!terminalService) {
        throw new Error('Terminal service not available')
      }

      // Step 1: Check if already linked (avoid unnecessary initialization/connection)
      const initialCheck = await terminalService.isTapToPayAccountLinked()
      if (initialCheck.isLinked) {
        console.log('[SettingsContent] Apple account already linked, no enablement needed')
        setAppleAccountLinkageState({ status: 'linked', isLoading: false })
        showToast('Tap to Pay is already enabled', 'success')
        setIsEnablingTapToPay(false)
        return
      }

      console.log('[SettingsContent] Apple account not linked, starting enablement flow')

      // Step 2: Initialize Terminal SDK
      console.log('[SettingsContent] Initializing Terminal SDK')
      const initResult = await terminalService.initialize()
      console.log('[SettingsContent] Terminal initialized:', initResult.status)
      if (initResult.status !== 'ready' && initResult.status !== 'connected') {
        throw new Error('Failed to initialize Terminal SDK')
      }

      // Step 3: Connect Tap to Pay (triggers Apple Terms/account-linkage flow)
      console.log('[SettingsContent] Connecting Tap to Pay reader')
      const connectResult = await terminalService.connectTapToPay()
      console.log('[SettingsContent] Connection result:', connectResult.status)
      if (connectResult.status !== 'connected') {
        throw new Error('Failed to connect Tap to Pay reader')
      }

      // Step 4: Re-check Apple account linkage after connection
      console.log('[SettingsContent] Re-checking Apple account linkage after connection')
      const finalCheck = await terminalService.isTapToPayAccountLinked()
      console.log('[SettingsContent] Final linkage check result:', finalCheck.isLinked)

      if (finalCheck.isLinked) {
        // Success: Apple Terms were accepted
        setAppleAccountLinkageState({ status: 'linked', isLoading: false })
        showToast('Tap to Pay enabled successfully', 'success')
      } else {
        // Terms not accepted
        setAppleAccountLinkageState({ status: 'not_linked', isLoading: false })
        showToast('Tap to Pay requires Apple Terms acceptance', 'error')
      }

      // Step 5: Disconnect reader (linkage persists independently)
      console.log('[SettingsContent] Disconnecting reader after enablement')
      try {
        await terminalService.disconnect()
        console.log('[SettingsContent] Reader disconnected successfully')
      } catch (disconnectError) {
        console.warn('[SettingsContent] Failed to disconnect reader (non-critical):', disconnectError)
        // Don't fail the enablement if disconnect fails
      }

    } catch (error) {
      console.error('[SettingsContent] Enablement failed:', error)

      // Attempt fresh linkage check even on failure (Apple may have accepted Terms before error)
      try {
        const terminalService = TerminalBridgeService.getInstance()
        if (terminalService) {
          const fallbackCheck = await terminalService.isTapToPayAccountLinked()
          if (fallbackCheck.isLinked) {
            console.log('[SettingsContent] Apple account linked despite error, marking as enabled')
            setAppleAccountLinkageState({ status: 'linked', isLoading: false })
            showToast('Tap to Pay enabled', 'success')
            setIsEnablingTapToPay(false)
            return
          }
        }
      } catch (fallbackError) {
        console.warn('[SettingsContent] Fallback linkage check failed:', fallbackError)
      }

      // If not linked, show error
      setAppleAccountLinkageState({ status: 'error', isLoading: false })

      // Classify error for user-friendly message
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : ''
      let userMessage = 'Failed to enable Tap to Pay. Please try again.'

      if (errorMessage.includes('location') || errorMessage.includes('permission')) {
        userMessage = 'Tap to Pay requires location permission. Enable it in Settings.'
      } else if (errorMessage.includes('terminal location') || errorMessage.includes('business address')) {
        userMessage = 'Add a valid business address before enabling Tap to Pay.'
      } else if (errorMessage.includes('stripe connect') || errorMessage.includes('payment setup')) {
        userMessage = 'Complete payment setup before enabling Tap to Pay.'
      } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        userMessage = 'Network error. Check your connection and try again.'
      }

      showToast(userMessage, 'error')
    } finally {
      setIsEnablingTapToPay(false)
      // Clean up reader presentation state
      resetReaderState()
    }
  }

  // Check Apple Tap to Pay account linkage status (authoritative Apple/Stripe state)
  // Requires Terminal initialization first (Stripe Terminal 5.7.0 requirement)
  useEffect(() => {
    const checkAppleAccountLinkage = async () => {
      // Only check on native iOS with supported Tap to Pay environment
      const platform = tapToPayAwareness.state.tapToPaySupportStatus?.platform
      const status = tapToPayAwareness.state.tapToPaySupportStatus?.status
      const isSupported = status === 'supported'
      const isIOS = platform === 'ios'
      const isNative = Capacitor.isNativePlatform()

      if (!isNative || !isIOS || !isSupported) {
        setAppleAccountLinkageState({ status: 'unavailable', isLoading: false })
        return
      }

      setAppleAccountLinkageState(prev => ({ ...prev, isLoading: true }))

      try {
        const terminalService = TerminalBridgeService.getInstance()
        if (!terminalService) {
          setAppleAccountLinkageState({ status: 'unavailable', isLoading: false })
          return
        }
        // Initialize Terminal SDK before checking account linkage (required by Stripe Terminal 5.7.0)
        await terminalService.initialize()
        const result = await terminalService.isTapToPayAccountLinked()
        setAppleAccountLinkageState({
          status: result.isLinked ? 'linked' : 'not_linked',
          isLoading: false
        })
      } catch (error) {
        console.error('[SettingsContent] Failed to check Apple account linkage:', error)
        // Degrade gracefully - Settings remains usable even if status check fails
        setAppleAccountLinkageState({ status: 'error', isLoading: false })
      }
    }

    checkAppleAccountLinkage()
  }, [tapToPayAwareness.state.tapToPaySupportStatus])
  
  const handleImportSuccess = (message: string) => {
    fetchIgnoredContacts()
    showToast(message, 'success')
  }

  // Follow-up settings modal state
  const [showFollowUpSettings, setShowFollowUpSettings] = useState(false)

  // Automation section collapsed/expanded states
  const [businessHoursExpanded, setBusinessHoursExpanded] = useState(false)
  const [outOfOfficeExpanded, setOutOfOfficeExpanded] = useState(false)

  // Initialize Business Hours with defaults when first expanded
  const handleBusinessHoursExpand = () => {
    if (!businessHoursExpanded && formBusiness) {
      // Initialize with defaults if not already set
      const defaults = {
        business_hours_timezone: formBusiness.business_hours_timezone || 'America/New_York',
        business_hours_start: formBusiness.business_hours_start || '09:00',
        business_hours_end: formBusiness.business_hours_end || '18:00',
        after_hours_message: formBusiness.after_hours_message || DEFAULT_AFTER_HOURS_MESSAGE
      }
      updateBusiness(defaults)
    }
    setBusinessHoursExpanded(true)
  }

  // Change password modal state
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Change email modal state
  const [showChangeEmailModal, setShowChangeEmailModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [confirmNewEmail, setConfirmNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [isChangingEmail, setIsChangingEmail] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [pendingNewEmail, setPendingNewEmail] = useState<string | null>(null)

  // Handle Sending Number change with Business Number confirmation
  const handleSendingSourceChange = async (source: SendingSource) => {
    if (source === 'business') {
      // Show confirmation modal for Business Number
      setShowBusinessNumberWarning(true)
    } else {
      // Switch to ReplyFlow Number immediately (no confirmation needed)
      try {
        await updateSendingSource('replyflow')
        showToast('Messaging switched to ReplyFlow Number.', 'success')
      } catch (err) {
        showToast('Failed to switch sending number. Please try again.', 'error')
      }
    }
  }

  // Confirm Business Number selection
  const handleConfirmBusinessNumber = async () => {
    setShowBusinessNumberWarning(false)
    try {
      await updateSendingSource('business')
      // Delay toast to ensure modal is fully closed and removed from DOM
      await new Promise(resolve => setTimeout(resolve, 100))
      showToast('Business Number enabled. Messages will open in your phone\'s messaging app.', 'success')
    } catch (err) {
      showToast('Failed to switch sending number. Please try again.', 'error')
    }
  }

  // Spam filtering local state for immediate visual feedback
  const [spamFilteringEnabled, setSpamFilteringEnabled] = useState(false)
  const [isSavingSpamFiltering, setIsSavingSpamFiltering] = useState(false)

  // Automation settings local state for immediate visual feedback
  const [ignoreRepeatCalls, setIgnoreRepeatCalls] = useState(false)
  const [ignoreBlockedPrivateNumbers, setIgnoreBlockedPrivateNumbers] = useState(false)
  const [ignoreSuspectedSpamCallers, setIgnoreSuspectedSpamCallers] = useState(false)

  // Save success state for SettingsActionBar
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Google Calendar integration state
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false)
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false)
  const [isDisconnectingCalendar, setIsDisconnectingCalendar] = useState(false)
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  // Business phone number cooldown state
  const [phoneCooldown, setPhoneCooldown] = useState<{ inCooldown: boolean; nextAvailableDate: string | null } | null>(null)

  // Use local state if available (immediate refresh), otherwise use business object
    const stripeChargesEnabled = localStripeChargesEnabled ?? business?.stripe_charges_enabled
    const stripeDetailsSubmitted = localStripeDetailsSubmitted ?? business?.stripe_details_submitted
    const stripeStatus = localStripeStatus ?? business?.stripe_connect_status
  const [isConnectingStripe, setIsConnectingStripe] = useState(false)
  const [stripeStatusChecking, setStripeStatusChecking] = useState(false)
  const [stripeConnectLoading, setStripeConnectLoading] = useState(false)
  const [stripeConnectLoadingMessage, setStripeConnectLoadingMessage] = useState('')
  const isStripeConnectUnavailable = process.env.NEXT_PUBLIC_STRIPE_CONNECT_ENABLED === 'false'

  const supabase = createBrowserClient()

  useBodyScrollLock(showAddModal || showDeleteModal || showChangePasswordModal || showChangeEmailModal || showFollowUpSettings)

  // Time input refs for better UX
  const openTimeInputRef = useRef<HTMLInputElement>(null)
  const closeTimeInputRef = useRef<HTMLInputElement>(null)
  const outOfOfficeStartRef = useRef<HTMLInputElement>(null)
  const outOfOfficeEndRef = useRef<HTMLInputElement>(null)
  const settingsTabsNavRef = useRef<HTMLElement>(null)
  const settingsTabsContainerRef = useRef<HTMLDivElement>(null)
  
  // Password field refs for focusing
  const currentPasswordRef = useRef<HTMLInputElement>(null)
  const newPasswordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)
  const sectionTabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  
  // Dynamic scroll offset based on actual sticky navigation height
  const [scrollOffset, setScrollOffset] = useState(64)
  
  // Breathing room gap between sticky nav and section divider (ensures target section becomes active)
  const BREATHING_ROOM_GAP = 8
  
  // Measure actual sticky navigation height for accurate scroll offset
  useEffect(() => {
    const measureNavHeight = () => {
      // Measure the container div (has sticky positioning and padding) not the nav element
      if (settingsTabsContainerRef.current) {
        const navHeight = settingsTabsContainerRef.current.offsetHeight
        setScrollOffset(navHeight + BREATHING_ROOM_GAP)
      }
    }
    
    // Use requestAnimationFrame for initial measurement (runs after layout)
    const rafId = requestAnimationFrame(measureNavHeight)
    
    // Use ResizeObserver to detect size changes (more robust than timeout)
    let resizeObserver: ResizeObserver | null = null
    if (settingsTabsContainerRef.current) {
      resizeObserver = new ResizeObserver(measureNavHeight)
      resizeObserver.observe(settingsTabsContainerRef.current)
    }
    
    // Fallback: also measure on window resize for viewport changes
    window.addEventListener('resize', measureNavHeight)
    
    return () => {
      cancelAnimationFrame(rafId)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      window.removeEventListener('resize', measureNavHeight)
    }
  }, [])

  // Form state management
  const {
    business: formBusiness,
    hasUnsavedChanges,
    isSaving,
    saveError,
    updateBusiness,
    saveChanges,
    discardChanges,
    clearSaveError,
    getBusiness
  } = useSettingsFormState({
    initialBusiness: business,
    onSaveBusiness: async (businessData) => {
      // Use automation_settings directly from businessData (already updated via updateBusiness)
      const automationSettings = businessData.automation_settings || {}

      // Validate Out of Office configuration before saving
      if (businessData.out_of_office_enabled) {
        if (!businessData.out_of_office_start || !businessData.out_of_office_end) {
          throw new Error('Out of Office requires both start and end dates')
        }
        if (new Date(businessData.out_of_office_start) >= new Date(businessData.out_of_office_end)) {
          throw new Error('Out of Office end time must be after start time')
        }
      }

      // Only save real business columns that exist in the database schema
      const updatePayload: any = {
        name: businessData.name,
        business_phone_number: businessData.business_phone_number,
        business_type: businessData.business_type,
        business_type_other: businessData.business_type_other,
        service_location_type: ((): 'onsite' | 'customer_comes_to_business' | 'remote' | null => {
          const v = (businessData as any).service_location_type as string | undefined;
          const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
          if (s === 'onsite' || s === 'customer_comes_to_business' || s === 'remote') return s as any;
          return null;
        })(),
        out_of_office_enabled: businessData.out_of_office_enabled,
        out_of_office_start: businessData.out_of_office_start,
        out_of_office_end: businessData.out_of_office_end,
        out_of_office_message: businessData.out_of_office_message || DEFAULT_OUT_OF_OFFICE_MESSAGE,
        call_forwarding_enabled: businessData.call_forwarding_enabled,
        business_hours_enabled: businessData.business_hours_enabled,
        business_hours_start: businessData.business_hours_start,
        business_hours_end: businessData.business_hours_end,
        business_hours_timezone: businessData.business_hours_timezone,
        after_hours_message: businessData.after_hours_message || DEFAULT_AFTER_HOURS_MESSAGE,
        automation_settings: automationSettings,
        venmo_username: businessData.venmo_username,
        paypal_payment_link: businessData.paypal_payment_link
      }

      // Log Out of Office save attempt
      const hasOutOfOfficeFields = (
        'out_of_office_enabled' in updatePayload ||
        'out_of_office_start' in updatePayload ||
        'out_of_office_end' in updatePayload ||
        'out_of_office_message' in updatePayload
      )

      const { data, error } = await supabase
        .from('businesses')
        .update(updatePayload)
        .eq('id', businessData.id)
        .select()
        .single()

      if (error) {
        console.error('[Settings] Save error:', {
          businessId: businessData.id,
          errorCode: error.code,
          errorMessage: error.message
        })
        throw new Error(`Failed to save settings: ${error.message} (code: ${error.code})`)
      }

      // Return the confirmed database record
      return data
    },
    onBusinessUpdated: (updatedBusiness) => {
      setBusiness(updatedBusiness)
      setSaveSuccess(true)
      showToast('Settings saved', 'success')
    }
  })

  // Toast functions
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    // Use stable ID for settings success toast to prevent duplicates
    const stableId = message === 'Settings saved' && type === 'success' 
      ? 'settings-saved-success' 
      : Date.now().toString()
    
    // Remove existing toast with the same stable ID before adding new one
    setToasts(prev => {
      const filtered = prev.filter(toast => toast.id !== stableId)
      return [...filtered, { id: stableId, message, type }]
    })
  }

  // Helper to get automation settings with defaults
  const getAutomationSettings = () => {
    const defaults = {
      spamRepeatFilteringEnabled: false,
      ignoreRepeatCalls: false,
      repeatCallWindowMinutes: 15,
      ignoreBlockedPrivateNumbers: false,
      ignoreSuspectedSpamCallers: false,
      blockedNumbers: [] as string[]
    }
    
    const sourceSettings = formBusiness?.automation_settings || business?.automation_settings

    if (!sourceSettings) {
      return defaults
    }
    
    return { ...defaults, ...sourceSettings }
  }

  // Helper to convert datetime-local format (yyyy-MM-ddThh:mm) to ISO string preserving local time
  const fromDateTimeLocal = (dateTimeLocal: string | null | undefined): string | null => {
    if (!dateTimeLocal) return null

    try {
      // Parse the datetime-local value as local time by appending timezone offset
      const date = new Date(dateTimeLocal)
      if (isNaN(date.getTime())) {
        return null
      }

      // Create ISO string that preserves local time by using the local components
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      
      // Format as ISO without timezone indicator to preserve local time
      const result = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
      return result
    } catch (error) {
      console.error('[Settings] Error converting from datetime-local:', error)
      return null
    }
  }

  // Helper to convert ISO timestamp to datetime-local format (yyyy-MM-ddThh:mm)
  // Preserves the user's intended local time by treating the input as local time
  const toDateTimeLocal = (isoString: string | null | undefined): string => {
    if (!isoString) return ''

    try {
      const date = new Date(isoString)
      if (isNaN(date.getTime())) {
        return ''
      }

      // Format: yyyy-MM-ddThh:mm using local time components
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')

      const result = `${year}-${month}-${day}T${hours}:${minutes}`
      return result
    } catch (error) {
      console.error('[Settings] Error converting datetime:', error)
      return ''
    }
  }

  const formatOutOfOfficeDate = (value: string | null | undefined, options: Intl.DateTimeFormatOptions): string => {
    if (!value) return 'No return schedule selected.'

    const date = new Date(value)
    if (isNaN(date.getTime())) return 'No return schedule selected.'

    return date.toLocaleDateString('en-US', options)
  }

  const formatOutOfOfficeTime = (value: string | null | undefined): string => {
    if (!value) return ''

    const date = new Date(value)
    if (isNaN(date.getTime())) return ''

    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  // Helper to update automation settings
  const updateAutomationSetting = (key: string, value: any) => {
    const currentSettings = getAutomationSettings()
    const updatedSettings = { ...currentSettings, [key]: value }
    
    // Update the business object with merged automation settings
    const updatedBusiness = {
      ...formBusiness,
      automation_settings: updatedSettings
    }
    
    updateBusiness(updatedBusiness)
  }

  // Handler to toggle spam filtering with immediate visual feedback
  const handleToggleSpamFiltering = () => {
    const newValue = !spamFilteringEnabled
    setSpamFilteringEnabled(newValue)
    updateAutomationSetting('spamRepeatFilteringEnabled', newValue)
  }

  // Fetch ignored contacts
  const fetchIgnoredContacts = async () => {
    setIsLoadingIgnored(true)
    try {
      // Check if user is authenticated before making request
      if (!user) {
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        return
      }

      const response = await fetch('/api/ignored-contacts', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          return
        }
        throw new Error('Failed to fetch ignored contacts')
      }

      const data = await response.json()
      setIgnoredContacts(data.ignoredContacts || [])
    } catch (error) {
      console.error('[Settings] Error fetching ignored contacts:', error)
      // Only show toast for non-authentication errors
      if (error instanceof Error && !error.message.includes('Not authenticated') && !error.message.includes('Unauthorized')) {
        showToast('Failed to fetch personal contacts', 'error')
      }
    } finally {
      setIsLoadingIgnored(false)
    }
  }

  // Remove ignored contact
  const removeIgnoredContact = async (contactId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/ignored-contacts/${contactId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to remove personal contact')
      }

      // Update local state
      setIgnoredContacts(prev => prev.filter(contact => contact.id !== contactId))
      showToast('Contact removed successfully', 'success')
    } catch (error) {
      console.error('Error removing personal contact:', error)
      showToast('Could not remove contact. Please try again.', 'error')
    }
  }

  // Add ignored contact
  const handleAddIgnoredContact = async () => {
    if (!phoneNumber.trim()) {
      showToast('Please enter a phone number', 'error')
      return
    }

    setIsAdding(true)
    try {
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
          phoneNumber,
          label: label.trim() || null,
          reason: 'Added manually in settings'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Could not add contact')
      }

      // Update local state
      const data = await response.json()
      setIgnoredContacts(prev => [data.ignoredContact, ...prev])
      
      // Reset form
      setPhoneNumber('')
      setLabel('')
      setShowAddModal(false)
      
      showToast('Contact added successfully', 'success')
    } catch (error) {
      console.error('Error adding personal contact:', error)
      showToast(error instanceof Error ? error.message : 'Could not add contact. Please try again.', 'error')
    } finally {
      setIsAdding(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordError('')

    // Validate all fields are filled
    if (!currentPassword.trim()) {
      setPasswordError('Current password is required')
      currentPasswordRef.current?.focus()
      return
    }

    if (!newPassword.trim()) {
      setPasswordError('New password is required')
      newPasswordRef.current?.focus()
      return
    }

    if (!confirmNewPassword.trim()) {
      setPasswordError('Please confirm your new password')
      confirmPasswordRef.current?.focus()
      return
    }

    // Validate new password length
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long')
      newPasswordRef.current?.focus()
      return
    }

    if (newPassword.length > 128) {
      setPasswordError('Password must be less than 128 characters')
      newPasswordRef.current?.focus()
      return
    }

    // Validate password complexity
    const hasUppercase = /[A-Z]/.test(newPassword)
    const hasLowercase = /[a-z]/.test(newPassword)
    const hasNumber = /[0-9]/.test(newPassword)

    if (!hasUppercase) {
      setPasswordError('Password must contain at least one uppercase letter')
      newPasswordRef.current?.focus()
      return
    }

    if (!hasLowercase) {
      setPasswordError('Password must contain at least one lowercase letter')
      newPasswordRef.current?.focus()
      return
    }

    if (!hasNumber) {
      setPasswordError('Password must contain at least one number')
      newPasswordRef.current?.focus()
      return
    }

    // Validate passwords match
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match')
      confirmPasswordRef.current?.focus()
      return
    }

    // Validate new password is different from current
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from current password')
      newPasswordRef.current?.focus()
      return
    }

    setIsChangingPassword(true)

    try {
      const supabase = createBrowserClient()

      // Verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      })

      if (signInError) {
        setPasswordError('Current password is incorrect')
        currentPasswordRef.current?.focus()
        setIsChangingPassword(false)
        return
      }

      // Update password using authenticated client
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        console.error('Password update error:', updateError)
        setPasswordError('Failed to update password. Please try again.')
        setIsChangingPassword(false)
        return
      }

      // Success
      showToast('Password updated successfully', 'success')
      setShowChangePasswordModal(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setPasswordError('')
      setShowCurrentPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
    } catch (error) {
      console.error('Password change error:', error)
      setPasswordError('Failed to update password. Please try again.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  // Google Calendar handlers
  const fetchCalendarStatus = async () => {
    if (!business || !user) return
    
    setIsLoadingCalendar(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setCalendarConnected(false)
        return
      }

      const response = await fetch('/api/google/calendar/status?provider=google', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          setCalendarConnected(false)
          return
        }
        throw new Error('Failed to fetch calendar status')
      }

      const data = await response.json()
      setCalendarConnected(data.connected || false)
      setCalendarEmail(data.calendarEmail || null)
      if (data.connectedAt) {
        setLastSyncTime(new Date(data.connectedAt))
      }
    } catch (error) {
      console.error('[Settings] Error fetching calendar status:', error)
      setCalendarConnected(false)
    } finally {
      setIsLoadingCalendar(false)
    }
  }

  const handleConnectCalendar = async () => {
    setIsConnectingCalendar(true)
    try {
      const response = await fetch('/api/google/calendar/connect')
      if (!response.ok) {
        throw new Error('Failed to initiate OAuth flow')
      }
      const data = await response.json()
      window.location.href = data.authUrl
    } catch (error) {
      console.error('Error connecting calendar:', error)
      showToast('Failed to connect calendar', 'error')
    } finally {
      setIsConnectingCalendar(false)
    }
  }

  const handleDisconnectCalendar = async () => {
    setIsDisconnectingCalendar(true)
    try {
      const response = await fetch('/api/google/calendar/disconnect', {
        method: 'POST'
      })
      if (!response.ok) {
        throw new Error('Failed to disconnect calendar')
      }
      setCalendarConnected(false)
      showToast('Calendar disconnected successfully', 'success')
      window.location.href = '/dashboard/settings?calendar=disconnected'
    } catch (error) {
      console.error('Error disconnecting calendar:', error)
      showToast('Failed to disconnect calendar', 'error')
    } finally {
      setIsDisconnectingCalendar(false)
    }
  }

  // Check phone number change cooldown
  const checkPhoneCooldown = async () => {
    if (!business?.id) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        return
      }

      const response = await fetch(`/api/business/update-phone-number?businessId=${business.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        console.error('[Settings] Failed to check phone cooldown')
        return
      }

      const data = await response.json()
      setPhoneCooldown({
        inCooldown: data.inCooldown,
        nextAvailableDate: data.nextAvailableChangeDate
      })
    } catch (error) {
      console.error('[Settings] Error checking phone cooldown:', error)
    }
  }

  // Handle Stripe Connect onboarding
  const handleConnectStripe = async () => {
    if (isStripeConnectUnavailable || isConnectingStripe) {
      return
    }

    if (!business?.id) {
      showToast('Business not found', 'error')
      return
    }

    // Show loading modal immediately
    setStripeConnectLoading(true)
    setStripeConnectLoadingMessage('Opening Stripe')
    setIsConnectingStripe(true)
    setStripeStatusChecking(false)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/stripe/connect/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          business_id: business.id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        if (error.error === 'Stripe is not configured') {
          throw new Error('Stripe card payments are not available yet. You can still use Venmo or PayPal.')
        }
        throw new Error(error.error || 'We couldn\'t start the Stripe connection. Please try again.')
      }

      const data = await response.json()

      if (data.connected) {
        showToast('Stripe already connected', 'success')
        refreshBusiness()
      } else if (data.url) {
        // Hide loading modal when native session presents
        setStripeConnectLoading(false)
        // Use native plugin for iOS, fallback to window.location.href for others
        const result = await openStripeConnectOnboarding(data.url)

        // After native session completes, show checking state and refresh status
        if (result.completed || result.callbackMatched) {
          console.log('[STRIPE CONNECT] callback_resolved=true')
          setStripeConnectLoading(true)
          setStripeConnectLoadingMessage('Checking Stripe connection')
          setStripeStatusChecking(true)
          await refreshStripeStatus()
        }
      } else {
        throw new Error('No onboarding URL returned')
      }
    } catch (error) {
      console.error('[Settings] Error connecting Stripe:', error)
      showToast(error instanceof Error ? error.message : 'We couldn\'t connect Stripe. Please try again.', 'error')
    } finally {
      setIsConnectingStripe(false)
      setStripeConnectLoading(false)
    }
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) {
      return 'just now'
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60)
    if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`
    }
    
    const diffInDays = Math.floor(diffInHours / 24)
    return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`
  }

  const handleBillingActionClick = async (action: 'portal' | 'upgrade') => {
    try {
      const result = await handleBillingAction()
      if (result.success && result.url) {
        window.location.href = result.url
      } else if (result.error) {
        showToast(result.error, 'error')
      }
    } catch (error) {
      console.error('Billing action error:', error)
      showToast('Failed to process billing action', 'error')
    }
  }

  // Refresh Stripe Connect status after onboarding return
  const refreshStripeStatus = async () => {
    if (!business?.id) {
      console.log('[STRIPE CONNECT] No business ID, skipping refresh')
      return
    }

    console.log('[STRIPE CONNECT] status_refresh_started=true')
    try {
      setStripeStatusChecking(true)
      const response = await fetch('/api/stripe/connect/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ business_id: business!.id })
      })

      if (response.ok) {
        const data = await response.json()
        console.log('[STRIPE CONNECT] status_refresh_succeeded=true', {
          canonicalStatus: data.canonicalStatus,
          charges_enabled: data.charges_enabled,
          details_submitted: data.details_submitted,
        })

        // Immediately update local state for UI responsiveness
        console.log('[STRIPE CONNECT UI] local_status_before=', localStripeStatus)
        console.log('[STRIPE CONNECT UI] ttp_stripe_ready_before=', stripeChargesEnabled)
        setLocalStripeStatus(data.canonicalStatus)
        setLocalStripeChargesEnabled(data.charges_enabled)
        setLocalStripeDetailsSubmitted(data.details_submitted)
        console.log('[STRIPE CONNECT UI] local_status_after=', data.canonicalStatus)
        console.log('[STRIPE CONNECT UI] ttp_stripe_ready_after=', data.charges_enabled)

        // Sync global business object in background
        await refreshBusiness()

        // Invariant check: use the verified persisted response, not stale business closure
        // The response now comes from server-side readback, not Stripe object
        const persistedStatus = data.canonicalStatus
        console.log('[STRIPE CONNECT UI] refreshed_business_status=', persistedStatus)

        if (persistedStatus !== 'connected') {
          console.error('[STRIPE CONNECT INVARIANT] regression_detected=true')
          console.error('[STRIPE CONNECT INVARIANT] confirmed_status=connected')
          console.error('[STRIPE CONNECT INVARIANT] persisted_status=', persistedStatus)
        }

        showToast('Stripe Connect status updated', 'success')

        // If status is pending_verification, perform bounded recheck
        if (data.canonicalStatus === 'pending_verification' || data.canonicalStatus === 'setup_incomplete') {
          console.log('[STRIPE CONNECT] Transitional status, starting bounded recheck')
          performBoundedRecheck()
        } else {
          // Clear checking state on definitive status
          console.log('[STRIPE CONNECT UI] checking_state=false')
        }
      } else {
        const errorText = await response.text()
        console.error('[STRIPE CONNECT] status_refresh_failed=true', {
          http_status: response.status,
          error_body: errorText
        })
        console.log('[STRIPE CONNECT UI] checking_state=false')
        showToast(`Failed to refresh Stripe status (${response.status})`, 'error')
      }
    } catch (error) {
      console.error('[STRIPE CONNECT] status_refresh_failed=true', {
        error: error instanceof Error ? error.message : String(error)
      })
      console.log('[STRIPE CONNECT UI] checking_state=false')
      showToast('Failed to refresh Stripe status', 'error')
    } finally {
      setStripeStatusChecking(false)
    }
  }

  // Bounded recheck for transitional Stripe Connect statuses
  const performBoundedRecheck = () => {
    let recheckCount = 0
    const maxRechecks = 5 // 5 checks * 3 seconds = 15 seconds total
    const recheckInterval = 3000 // 3 seconds

    const recheck = async () => {
      if (recheckCount >= maxRechecks) {
        console.log('[STRIPE CONNECT] Bounded recheck completed, max attempts reached')
        return
      }

      recheckCount++
      console.log(`[STRIPE CONNECT] Bounded recheck attempt ${recheckCount}/${maxRechecks}`)

      try {
        const response = await fetch('/api/stripe/connect/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ business_id: business!.id })
        })

        if (response.ok) {
          const data = await response.json()
          console.log('[STRIPE CONNECT] Recheck result:', data.canonicalStatus)

          await refreshBusiness()

          // Stop recheck if status stabilizes to connected
          if (data.canonicalStatus === 'connected') {
            console.log('[STRIPE CONNECT] Status stabilized to connected, stopping recheck')
            return
          }

          // Continue recheck if still transitional
          if (data.canonicalStatus === 'pending_verification' || data.canonicalStatus === 'setup_incomplete') {
            setTimeout(recheck, recheckInterval)
          }
        }
      } catch (error) {
        console.error('[STRIPE CONNECT] Recheck error:', error)
      }
    }

    setTimeout(recheck, recheckInterval)
  }

  // Delete account handler
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE' || !deletePassword.trim()) return

    setIsDeleting(true)
    setDeletePasswordError('')
    
    try {
      // Starting account deletion process
      
      // Clear local storage and session storage BEFORE deletion to prevent stale state
      if (typeof window !== 'undefined') {
        localStorage.clear()
        sessionStorage.clear()
      }

      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result?.ok) {
        console.error('[Settings] Delete account server error:', result)
        
        if (result?.step === 'password_verification') {
          setDeletePasswordError(result?.error || 'Incorrect password. Please try again.')
          setIsDeleting(false)
          return
        }
        
        const friendly =
          result?.step === 'stripe_cancel'
            ? (result?.error || 'We could not cancel your subscription. Your account was not deleted. Please try again or contact support.')
            : result?.step === 'stripe_init'
              ? 'Billing service is temporarily unavailable. Please try again in a moment.'
              : (result?.error || 'Failed to delete account. Please try again.')
        showToast(friendly, 'error')
        setIsDeleting(false)
        return
      }

      // Account deleted successfully, redirecting to homepage
      
      // Explicitly sign out from Supabase to clear auth state
      try {
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) {
          console.error('[Settings] SignOut error:', signOutError)
          // Continue anyway - account is deleted
        }
      } catch (signOutError) {
        console.error('[Settings] SignOut exception:', signOutError)
        // Continue anyway - account is deleted
      }
      
      // Force redirect to homepage
      window.location.href = '/'
    } catch (error) {
      console.error('[Settings] Delete account network error:', error)
      showToast('Failed to delete account. Please try again.', 'error')
      setIsDeleting(false)
    }
  }

  // Change email handler
  const handleChangeEmail = async () => {
    if (!newEmail || !confirmNewEmail || !emailPassword) {
      setEmailError('Please fill in all fields')
      return
    }

    if (newEmail !== confirmNewEmail) {
      setEmailError('Email addresses do not match')
      return
    }

    if (newEmail === user?.email) {
      setEmailError('New email must be different from current email')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      setEmailError('Invalid email format')
      return
    }

    setIsChangingEmail(true)
    setEmailError('')
    setEmailSuccess(false)

    try {
      // Verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: emailPassword,
      })

      if (signInError) {
        setEmailError('Current password is incorrect')
        setIsChangingEmail(false)
        return
      }

      // Update email using Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        email: newEmail,
      })

      if (updateError) {
        console.error('[Settings] Email update error:', updateError)
        
        if (updateError.message?.toLowerCase().includes('duplicate') || 
            updateError.message?.toLowerCase().includes('already been registered') ||
            updateError.message?.toLowerCase().includes('already in use')) {
          setEmailError('This email is already in use')
        } else {
          setEmailError(updateError.message || 'Failed to update email')
        }
        setIsChangingEmail(false)
        return
      }

      // Success - email change initiated
      setEmailSuccess(true)
      setPendingNewEmail(newEmail)
      showToast('Check your new inbox to confirm the email change', 'info')
      
      // Clear form
      setNewEmail('')
      setConfirmNewEmail('')
      setEmailPassword('')
      
      // Close modal after delay
      setTimeout(() => {
        setShowChangeEmailModal(false)
        setEmailSuccess(false)
      }, 3000)
    } catch (error) {
      console.error('[Settings] Email change error:', error)
      setEmailError('Failed to update email. Please try again.')
    } finally {
      setIsChangingEmail(false)
    }
  }

  const handleResendConfirmation = async () => {
    if (!pendingNewEmail) return

    try {
      const { error } = await supabase.auth.updateUser({
        email: pendingNewEmail,
      })

      if (error) {
        showToast('Failed to resend confirmation. Please try again.', 'error')
      } else {
        showToast('Confirmation email resent to ' + pendingNewEmail, 'success')
      }
    } catch (error) {
      console.error('[Settings] Resend confirmation error:', error)
      showToast('Failed to resend confirmation. Please try again.', 'error')
    }
  }

  const handleCloseChangeEmailModal = () => {
    setShowChangeEmailModal(false)
    setNewEmail('')
    setConfirmNewEmail('')
    setEmailPassword('')
    setEmailError('')
    setEmailSuccess(false)
  }

  // Fetch ignored contacts when business loads and user is authenticated
  useEffect(() => {
    if (business && user) {
      fetchIgnoredContacts()
      if (!hasUnsavedChanges) {
        const settings = getAutomationSettings()
        setSpamFilteringEnabled(settings.spamRepeatFilteringEnabled)
        setIgnoreRepeatCalls(settings.ignoreRepeatCalls)
        setIgnoreBlockedPrivateNumbers(settings.ignoreBlockedPrivateNumbers)
        setIgnoreSuspectedSpamCallers(settings.ignoreSuspectedSpamCallers)
      }
      fetchCalendarStatus()
      checkPhoneCooldown()
    }
  }, [business, user, hasUnsavedChanges])

  // Check URL params for calendar connection status
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const calendarStatus = urlParams.get('calendar')
    if (calendarStatus === 'disconnected') {
      showToast('Google Calendar disconnected', 'success')
      setCalendarConnected(false)
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (calendarStatus === 'error') {
      showToast('Failed to connect Google Calendar', 'error')
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/settings')
    }
  }, [])

  // App resume reconciliation for Stripe Connect
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && business?.stripe_connect_account_id) {
        // Only refresh if we're on the payments section and have a Connect account
        const urlParams = new URLSearchParams(window.location.search)
        const isPaymentsSection = urlParams.get('stripe_connect_return') !== '1' // Don't double-refresh on return

        if (isPaymentsSection && !stripeStatusChecking) {
          console.log('[STRIPE CONNECT] App resume detected, checking status')
          // Debounce to avoid multiple refreshes
          setTimeout(() => {
            refreshStripeStatus()
          }, 500)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [business, stripeStatusChecking])

  useEffect(() => {
    const activeTab = sectionTabRefs.current[activeSection]
    const tabsNav = settingsTabsNavRef.current

    if (!activeTab || !tabsNav) return

    const tabLeft = activeTab.offsetLeft
    const tabWidth = activeTab.offsetWidth
    const navWidth = tabsNav.clientWidth
    const targetLeft = tabLeft - (navWidth / 2) + (tabWidth / 2)

    tabsNav.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'smooth'
    })
  }, [activeSection])

  // Scroll-aware active section detection using canonical sections
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null

    const updateActiveSection = () => {
      // Get section offsets from canonical sections only
      // This ensures web and native both work correctly
      const sectionOffsets: { [key: string]: number | null } = {}
      let hasAnySection = false

      for (const section of settingsSections) {
        const divider = document.getElementById(`${section.id}-divider`)
        if (divider) {
          sectionOffsets[section.id] = divider.offsetTop
          hasAnySection = true
        } else {
          sectionOffsets[section.id] = null
        }
      }

      // If no sections are available, skip update (may be loading)
      if (!hasAnySection) return
      
      // Get scroll position and viewport dimensions
      const scrollY = window.scrollY
      const viewportHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight
      
      // TOP_THRESHOLD: Force first section when at or near the top of the page
      const TOP_THRESHOLD = 120
      if (scrollY <= TOP_THRESHOLD) {
        setActiveSection(settingsSections[0].id)
        return
      }
      
      // BOTTOM_THRESHOLD: Force last section when at or near the bottom of the page
      const BOTTOM_THRESHOLD = 120
      if (scrollY + viewportHeight >= documentHeight - BOTTOM_THRESHOLD) {
        setActiveSection(settingsSections[settingsSections.length - 1].id)
        return
      }
      
      // Calculate offset for header and tabs using shared helper
      const offset = getScrollOffset()
      
      // Determine active section by comparing scroll position to section offsets
      let computedActiveSection = settingsSections[0].id
      
      for (let i = settingsSections.length - 1; i >= 0; i--) {
        const sectionId = settingsSections[i].id
        const sectionTop = sectionOffsets[sectionId]
        
        if (sectionTop !== null && scrollY >= sectionTop - offset) {
          computedActiveSection = sectionId
          break
        }
      }
      
      // Only update if the section actually changed
      if (computedActiveSection !== activeSection) {
        setActiveSection(computedActiveSection)
      }
    }
    
    const handleScroll = () => {
      // Clear any pending timeout
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      
      // Debounce scroll events
      timeoutId = setTimeout(updateActiveSection, 50)
    }
    
    // Handle URL hash for initial navigation only
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      const sectionIds = settingsSections.map((s: { id: string }) => s.id)
      if (sectionIds.includes(hash)) {
        // Target the divider element for proper scroll offset
        const dividerId = `${hash}-divider`
        const element = document.getElementById(dividerId)
        if (element) {
          // Update active section immediately
          setActiveSection(hash)
          // Scroll to the section using the shared helper
          scrollToSection(hash)
        }
      }
    }
    
    // Initial setup
    const initialize = () => {
      // Handle initial hash
      handleHashChange()
      
      // Initial calculation after a short delay
      setTimeout(updateActiveSection, 100)
    }
    
    // Add event listeners
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('hashchange', handleHashChange)
    
    // Initialize
    initialize()
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('hashchange', handleHashChange)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, []) // No dependencies to prevent stuck state

  // Shared helper to calculate scroll offset based on actual header height
  const getScrollOffset = () => {
    // AppHeader scrolls away, only tab bar remains sticky
    // Use dynamically measured nav height + breathing room gap
    return scrollOffset
  }

  // Shared scroll-to-section helper
  const scrollToSection = (sectionId: string) => {
    // Target the divider element instead of the section content
    const dividerId = `${sectionId}-divider`
    const element = document.getElementById(dividerId)
    if (element) {
      const offset = getScrollOffset()
      const elementPosition = element.getBoundingClientRect().top + window.scrollY - offset
      
      // Respect user's reduced-motion preference
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      
      window.scrollTo({
        top: elementPosition,
        behavior: prefersReducedMotion ? 'auto' : 'smooth'
      })
    }
  }

  // Smooth scroll handler
  const handleSectionClick = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      // Update active section immediately for better UX
      setActiveSection(sectionId)

      // Update URL hash
      const url = new URL(window.location.href)
      url.hash = sectionId
      window.history.replaceState({}, '', url.toString())

      // Use shared scroll helper
      scrollToSection(sectionId)
    }
  }

  // Load ignored contacts

  if (!business || !formBusiness) {
    return (
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-background page-gradient flex flex-col relative">
            <AppHeader title="Settings" sticky={false} />
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                <p className="text-slate-600 dark:text-muted-foreground">Loading settings...</p>
              </div>
            </div>
          </div>
        </BusinessGuard>
      </AuthGuard>
    )
  }

  return (
    <DashboardErrorBoundary>
      <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-background page-gradient flex flex-col relative">
          {/* Header */}
          <AppHeader title="Settings" sticky={false} />

            {/* Main Content */}
            <div className="flex-1 px-4 pb-20 bg-background dark:bg-background">
              <div className="max-w-[1200px] mx-auto">

            {/* Page Header - normal flow */}
            <div className="pt-6 pb-4">
              <h1 className="text-3xl font-semibold text-foreground mb-2">
                Settings
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage your business settings and preferences.
              </p>
            </div>

            {/* Settings Navigation Tabs - sticky only */}
            <div ref={settingsTabsContainerRef} className="sticky z-40 border-b border-border/50 bg-background py-4 top-0 backdrop-blur-sm" style={{ backgroundColor: 'var(--background)' }}>
              <nav ref={settingsTabsNavRef} className="flex items-center gap-3 overflow-x-auto custom-scrollbar-horizontal">
                {settingsSections.map((section) => (
                  <button
                    key={section.id}
                    ref={(element) => { sectionTabRefs.current[section.id] = element }}
                    onClick={() => handleSectionClick(section.id)}
                    aria-current={activeSection === section.id ? 'location' : undefined}
                    className={`px-5 py-3 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                      activeSection === section.id
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 shadow-md'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </nav>
            </div>
            {/* Spacer to maintain consistent spacing */}
            <div className="mb-4"></div>

            {/* Settings Sections */}
            <div className="space-y-6 pb-32">
              {/* Group: General */}
              <div id="general-divider" className="flex items-center gap-4 mb-6 scroll-mt-[64px]">
                <div className="h-px flex-1 bg-border/30"></div>
                <h3 className="text-sm font-medium text-muted-foreground">{settingsSections.find(s => s.id === 'general')?.label}</h3>
                <div className="h-px flex-1 bg-border/30"></div>
              </div>

              {/* General Section */}
              <div id="general" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-foreground mb-1">General</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">Your business identity and contact details.</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={formBusiness.name || ''}
                      onChange={(e) => updateBusiness({ name: e.target.value })}
                      className="w-full px-3 py-2.5 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 bg-white dark:bg-slate-800/40 text-foreground placeholder:text-muted-foreground transition-all duration-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Business Phone
                    </label>
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="tel"
                          value={formBusiness.business_phone_number || ''}
                          onChange={(e) => updateBusiness({ business_phone_number: e.target.value })}
                          placeholder="(555) 123-4567"
                          disabled={phoneCooldown?.inCooldown}
                          className="flex-1 px-3 py-2.5 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 bg-white dark:bg-slate-800/40 text-foreground placeholder:text-muted-foreground transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      
                      {phoneCooldown?.inCooldown && phoneCooldown.nextAvailableDate && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50/60 dark:bg-amber-900/15 border border-amber-200/60 dark:border-amber-800/60 rounded-md">
                          <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-amber-900 dark:text-amber-100 mb-1">
                              Phone number change on cooldown
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                              Phone number changes are limited to help protect your account from fraud and accidental reassignment. You can update your phone number again on{' '}
                              <span className="font-medium">
                                {new Date(phoneCooldown.nextAvailableDate).toLocaleDateString('en-US', {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                              . If you need to switch sooner, contact support.
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {!phoneCooldown?.inCooldown && (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {business?.forwarding_verified
                              ? 'Call forwarding is active and working.'
                              : 'Changing your phone number will require re-activating call forwarding.'}
                          </p>
                          <details className="group rounded-md border border-slate-200/60 dark:border-slate-700/50 bg-slate-50/70 dark:bg-slate-800/30 px-3 py-2">
                            <summary className="cursor-pointer list-none text-xs font-medium text-slate-700 dark:text-slate-300">
                              <span className="group-open:hidden">▸ Number guidance</span>
                              <span className="hidden group-open:inline">▾ Number guidance</span>
                            </summary>
                            <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                              <p>A dedicated business number works best for ReplyFlow.</p>
                              <p>Personal phones are supported too. Use Ignored Contacts to keep personal calls separate from customer calls. Personal voicemails are saved separately.</p>
                            </div>
                          </details>
                        </div>
                      )}
                      
                      {business?.business_phone_changed_at && (
                        <p className="text-xs text-slate-500 dark:text-slate-500">
                          Last changed: {new Date(business.business_phone_changed_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Service Location
                    </label>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                      ReplyFlow uses this to tailor the questions your AI Voice asks callers.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { value: 'onsite', title: 'On-site service', desc: 'You travel to the customer or job location.' },
                        { value: 'customer_comes_to_business', title: 'Customers come to me', desc: 'Customers visit your business location.' },
                        { value: 'remote', title: 'Remote only', desc: 'Your services are provided remotely.' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => updateBusiness({ ...(formBusiness as any), service_location_type: opt.value })}
                          className={`text-left p-3 rounded-md border transition ${
                            ((formBusiness as any).service_location_type || 'onsite') === opt.value
                              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                              : 'border-slate-200/70 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className="text-sm font-medium text-slate-900 dark:text-foreground">{opt.title}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Group: Communication - Only show on native mobile */}
              {isNativeMobile() && (
                <>
                  <div id="communication-divider" className="flex items-center gap-3 mb-6 scroll-mt-[64px]">
                    <div className="h-px flex-1 bg-border/30"></div>
                    <h3 className="text-sm font-medium text-muted-foreground">Communication</h3>
                    <div className="h-px flex-1 bg-border/30"></div>
                  </div>

                  {/* Communication Section */}
                  <div id="communication" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
                    <div className="mb-5">
                      <h2 className="text-base font-semibold text-foreground mb-1">Sending Number</h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Choose how ReplyFlow sends customer messages.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {/* ReplyFlow Number Option */}
                      <div
                        onClick={() => handleSendingSourceChange('replyflow')}
                        className={`p-3 rounded-lg border cursor-pointer transition-all duration-150 ${
                          sendingSource === 'replyflow'
                            ? 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10 shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                        role="radio"
                        aria-checked={sendingSource === 'replyflow'}
                        tabIndex={0}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-sm font-semibold text-foreground">ReplyFlow Number</h3>
                              <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">Strongly Recommended</span>
                            </div>
                            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                              <li className="flex items-start gap-2">
                                <span className="text-blue-600 dark:text-blue-400 mt-0.5">✓</span>
                                <span>Automatic conversation tracking</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-blue-600 dark:text-blue-400 mt-0.5">✓</span>
                                <span>AI automation</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-blue-600 dark:text-blue-400 mt-0.5">✓</span>
                                <span>Delivery tracking</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-blue-600 dark:text-blue-400 mt-0.5">✓</span>
                                <span>Best experience</span>
                              </li>
                            </ul>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            sendingSource === 'replyflow'
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}>
                            {sendingSource === 'replyflow' && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Business Number Option */}
                      <div
                        onClick={() => handleSendingSourceChange('business')}
                        className={`p-3 rounded-lg border cursor-pointer transition-all duration-150 ${
                          sendingSource === 'business'
                            ? 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10 shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                        role="radio"
                        aria-checked={sendingSource === 'business'}
                        tabIndex={0}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-sm font-semibold text-foreground">Business Number</h3>
                              <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full">Advanced</span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                              Uses your phone's messaging app.
                            </p>
                            <ul className="text-xs text-slate-500 dark:text-slate-500 space-y-1">
                              <li className="flex items-start gap-2">
                                <span className="text-slate-400 dark:text-slate-500 mt-0.5">•</span>
                                <span>Uses your personal/business number</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-slate-400 dark:text-slate-500 mt-0.5">•</span>
                                <span>Conversations don't sync</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="text-slate-400 dark:text-slate-500 mt-0.5">•</span>
                                <span>ReplyFlow still tracks payments and business activity</span>
                              </li>
                            </ul>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            sendingSource === 'business'
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}>
                            {sendingSource === 'business' && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Group: Automation */}
              <div id="automation-divider" className="flex items-center gap-3 mb-6 scroll-mt-[64px]">
                <div className="h-px flex-1 bg-border/30"></div>
                <h3 className="text-sm font-medium text-muted-foreground">{settingsSections.find(s => s.id === 'automation')?.label}</h3>
                <div className="h-px flex-1 bg-border/30"></div>
              </div>

              {/* Telecom-dependent settings: only shown after the user starts a trial/subscription. */}
              {!hasActiveSubscription(business) ? (
                <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/40 shadow-sm p-5">
                  <h2 className="text-base font-semibold text-foreground mb-2">Text Messaging & Automation</h2>
                  <p className="text-sm text-muted-foreground mb-3">
                    Instant reply messages, business hours, spam filtering, and ignored contacts unlock
                    once you start your free trial. Your dedicated ReplyFlow number is set up
                    automatically right after activation.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Use the Billing section below to start your 14-day free trial. No charge today.
                  </p>
                </div>
              ) : (
              <>
              {/* Automation Settings */}
              <div id="automation" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-4 scroll-mt-[64px]">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-semibold text-foreground">Instant Response</h2>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">Control automatic missed-call responses.</p>
                </div>
                
                <div className="space-y-3">
                  {/* Spam & Repeat Call Filtering */}
                  <div className="border border-border/30 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-sm font-semibold text-foreground">Spam & Repeat Filtering</h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Ignore spam and repeat callers before they become leads.
                        </p>
                      </div>
                      <button
                        onClick={handleToggleSpamFiltering}
                        disabled={isSavingSpamFiltering}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 flex-shrink-0 ${
                          spamFilteringEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-600 hover:bg-slate-500'
                        } ${isSavingSpamFiltering ? 'opacity-50 cursor-not-allowed' : ''}`}
                        aria-label={spamFilteringEnabled ? 'Disable spam filtering' : 'Enable spam filtering'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-200 shadow-sm ${
                            spamFilteringEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Filtering Options - Only show when enabled */}
                    {spamFilteringEnabled && (
                      <div className="space-y-2.5 mt-2.5">
                        {/* Repeat Call Protection */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h4 className="text-sm font-semibold text-foreground">Prevent duplicate replies</h4>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              Avoid repeated instant-reply SMS to the same caller. Does not affect voice call routing.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const newValue = !ignoreRepeatCalls
                              setIgnoreRepeatCalls(newValue)
                              updateAutomationSetting('ignoreRepeatCalls', newValue)
                            }}
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0 ${
                              ignoreRepeatCalls ? 'bg-blue-600' : 'bg-slate-600'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            aria-label={ignoreRepeatCalls ? 'Disable duplicate instant reply prevention' : 'Enable duplicate instant reply prevention'}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                                ignoreRepeatCalls ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Private/Blocked Numbers */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h4 className="text-sm font-semibold text-foreground">Skip blocked or hidden callers</h4>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Prevent texts from callers who hide their number.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const newValue = !ignoreBlockedPrivateNumbers
                              setIgnoreBlockedPrivateNumbers(newValue)
                              updateAutomationSetting('ignoreBlockedPrivateNumbers', newValue)
                            }}
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0 ${
                              ignoreBlockedPrivateNumbers ? 'bg-blue-600' : 'bg-slate-600'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            aria-label={ignoreBlockedPrivateNumbers ? 'Disable private number blocking' : 'Enable private number blocking'}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                                ignoreBlockedPrivateNumbers ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Spam Detection */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h4 className="text-sm font-semibold text-foreground">Skip suspected spam callers</h4>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Skip obvious spam and robocall numbers.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const newValue = !ignoreSuspectedSpamCallers
                              setIgnoreSuspectedSpamCallers(newValue)
                              updateAutomationSetting('ignoreSuspectedSpamCallers', newValue)
                            }}
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0 ${
                              ignoreSuspectedSpamCallers ? 'bg-blue-600' : 'bg-slate-600'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            aria-label={ignoreSuspectedSpamCallers ? 'Disable spam detection' : 'Enable spam detection'}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                                ignoreSuspectedSpamCallers ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Business Hours */}
                  <div className="border border-border/30 rounded-lg p-3">
                    {!businessHoursExpanded ? (
                      // Collapsed state
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium text-foreground">Business Hours</h3>
                            {formBusiness.business_hours_enabled ? (
                              <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-2">
                                <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                                Active
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-full font-medium">
                                Inactive
                              </span>
                            )}
                          </div>
                          {formBusiness.business_hours_enabled ? (
                            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                              <p className="font-medium text-slate-700 dark:text-slate-300">Monday–Friday · {formBusiness.business_hours_start || '9:00 AM'}–{formBusiness.business_hours_end || '6:00 PM'}</p>
                              <p>{formBusiness.business_hours_timezone === 'America/New_York' ? 'Eastern Time' : formBusiness.business_hours_timezone === 'America/Chicago' ? 'Central Time' : formBusiness.business_hours_timezone === 'America/Denver' ? 'Mountain Time' : formBusiness.business_hours_timezone === 'America/Los_Angeles' ? 'Pacific Time' : formBusiness.business_hours_timezone}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              Business hours not configured.
                            </p>
                          )}
                        </div>
                        <button
                          onClick={handleBusinessHoursExpand}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    
                    ) : (
                      // Expanded state
                      <>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="text-sm font-medium text-foreground">Business Hours</h3>
                              {formBusiness.business_hours_enabled && (
                                <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-2">
                                  <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-1.5">
                              Send different replies inside and outside business hours.
                            </p>
                          </div>
                          <button
                            onClick={async () => {
                              // Auto-enable/disable business hours based on configuration
                              const hasValidConfig =
                                formBusiness.business_hours_timezone &&
                                formBusiness.business_hours_start &&
                                formBusiness.business_hours_end &&
                                formBusiness.after_hours_message

                              // Construct the complete next state to avoid stale React state
                              const nextBusiness = {
                                ...formBusiness,
                                business_hours_enabled: hasValidConfig ? true : false
                              }

                              // Update local state and persist in one operation
                              // Pass nextBusiness directly to saveChanges to avoid stale closure bug
                              updateBusiness(nextBusiness)
                              await saveChanges(nextBusiness)

                              setBusinessHoursExpanded(false)
                            }}
                            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
                          >
                            Done
                          </button>
                        </div>
                        
                        {/* Timezone and Hours Selector */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-900 dark:text-foreground mb-1.5">
                              Timezone
                            </label>
                            <select
                              value={formBusiness.business_hours_timezone || 'America/New_York'}
                              onChange={(e) => updateBusiness({ business_hours_timezone: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground text-sm"
                            >
                              <option value="America/New_York">Eastern Time (ET)</option>
                              <option value="America/Chicago">Central Time (CT)</option>
                              <option value="America/Denver">Mountain Time (MT)</option>
                              <option value="America/Los_Angeles">Pacific Time (PT)</option>
                              <option value="America/Anchorage">Alaska Time (AKT)</option>
                              <option value="Pacific/Honolulu">Hawaii Time (HST)</option>
                              <option value="America/Phoenix">Arizona Time (MST)</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-900 dark:text-foreground mb-1.5">
                                Open Time
                              </label>
                              <div
                                onClick={() => {
                                  openTimeInputRef.current?.focus()
                                  if (openTimeInputRef.current && 'showPicker' in openTimeInputRef.current) {
                                    (openTimeInputRef.current as any).showPicker()
                                  }
                                }}
                                className="relative cursor-pointer"
                              >
                                <input
                                  ref={openTimeInputRef}
                                  type="time"
                                  value={formBusiness.business_hours_start || '09:00'}
                                  onChange={(e) => updateBusiness({ business_hours_start: e.target.value })}
                                  className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground text-sm"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-900 dark:text-foreground mb-1.5">
                                Close Time
                              </label>
                              <div
                                onClick={() => {
                                  closeTimeInputRef.current?.focus()
                                  if (closeTimeInputRef.current && 'showPicker' in closeTimeInputRef.current) {
                                    (closeTimeInputRef.current as any).showPicker()
                                  }
                                }}
                                className="relative cursor-pointer"
                              >
                                <input
                                  ref={closeTimeInputRef}
                                  type="time"
                                  value={formBusiness.business_hours_end || '18:00'}
                                  onChange={(e) => updateBusiness({ business_hours_end: e.target.value })}
                                  className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground text-sm"
                                />
                              </div>
                            </div>
                          </div>
                          {formBusiness.business_hours_start && formBusiness.business_hours_end && formBusiness.business_hours_start > formBusiness.business_hours_end && (
                            <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                              <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              <div className="text-xs text-amber-800 dark:text-amber-200">
                                <span className="font-semibold">Overnight Hours</span> - Hours continue overnight into the next day.
                              </div>
                            </div>
                          )}
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Applies Monday through Friday.
                          </p>
                          <div className="mt-4">
                            <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                              After Hours Message
                            </label>
                            <textarea
                              value={formBusiness.after_hours_message || ''}
                              onChange={(e) => updateBusiness({ after_hours_message: e.target.value })}
                              rows={2}
                              className="w-full px-3 py-2 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-foreground placeholder:text-muted-foreground transition-all duration-200 text-xs sm:text-sm hover:border-border/80 dark:hover:border-border/60 resize-none"
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                              {`{{business_name}}`} inserts your business name.
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Out of Office Mode */}
                  <div className="p-3 rounded-lg border border-border/30">
                    {!outOfOfficeExpanded ? (
                      // Collapsed state
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-4">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium text-slate-900 dark:text-foreground">Out of Office</h3>
                            {(() => {
                              if (!formBusiness.out_of_office_enabled || !formBusiness.out_of_office_start || !formBusiness.out_of_office_end) {
                                return (
                                  <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-full font-medium">
                                    Inactive
                                  </span>
                                )
                              }

                              const now = new Date()
                              const start = new Date(formBusiness.out_of_office_start)
                              const end = new Date(formBusiness.out_of_office_end)

                              if (now >= start && now <= end) {
                                return (
                                  <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-2">
                                    <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                                    Active
                                  </span>
                                )
                              } else if (now < start) {
                                return (
                                  <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full font-medium">
                                    Scheduled
                                  </span>
                                )
                              } else {
                                return (
                                  <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-full font-medium">
                                    Ended
                                  </span>
                                )
                              }
                            })()}
                          </div>
                          {formBusiness.out_of_office_enabled && formBusiness.out_of_office_start && formBusiness.out_of_office_end ? (
                            (() => {
                              const now = new Date()
                              const start = new Date(formBusiness.out_of_office_start)
                              const end = new Date(formBusiness.out_of_office_end)

                              if (now >= start && now <= end) {
                                return (
                                  <p className="text-xs text-slate-600 dark:text-slate-400">
                                    Back {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </p>
                                )
                              } else {
                                return (
                                  <p className="text-xs text-slate-600 dark:text-slate-400">
                                    {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </p>
                                )
                              }
                            })()
                          ) : (
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              No automatic away message scheduled.
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setOutOfOfficeExpanded(true)}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                          {formBusiness.out_of_office_enabled ? 'Edit' : 'Configure'}
                        </button>
                      </div>

                    ) : (
                      // Expanded state
                      <>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-medium text-slate-900 dark:text-foreground">Out of Office</h3>
                              {formBusiness.out_of_office_enabled && (
                                <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-2">
                                  <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Automatically reply while you're away.
                            </p>
                          </div>
                          <button
                            onClick={async () => {
                              // Auto-enable/disable Out of Office based on configuration
                              const hasValidConfig =
                                formBusiness.out_of_office_start &&
                                formBusiness.out_of_office_end

                              // Construct the complete next state to avoid stale React state
                              const nextBusiness = {
                                ...formBusiness,
                                out_of_office_enabled: hasValidConfig ? true : false
                              }

                              // Update local state and persist in one operation
                              // Pass nextBusiness directly to saveChanges to avoid stale closure bug
                              updateBusiness(nextBusiness)
                              await saveChanges(nextBusiness)

                              setOutOfOfficeExpanded(false)
                            }}
                            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
                          >
                            Done
                          </button>
                        </div>

                        {/* Out of Office Settings */}
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-900 dark:text-foreground mb-1.5">
                                Start Date & Time
                              </label>
                              <input
                                type="datetime-local"
                                value={formBusiness.out_of_office_start ? toDateTimeLocal(formBusiness.out_of_office_start) : ''}
                                onChange={(e) => updateBusiness({ out_of_office_start: fromDateTimeLocal(e.target.value) })}
                                className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-900 dark:text-foreground mb-1.5">
                                End Date & Time
                              </label>
                              <input
                                type="datetime-local"
                                value={formBusiness.out_of_office_end ? toDateTimeLocal(formBusiness.out_of_office_end) : ''}
                                onChange={(e) => updateBusiness({ out_of_office_end: fromDateTimeLocal(e.target.value) })}
                                className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground text-sm"
                              />
                            </div>
                          </div>

                          {/* Validation Error */}
                          {formBusiness.out_of_office_start && formBusiness.out_of_office_end && 
                           new Date(formBusiness.out_of_office_start) >= new Date(formBusiness.out_of_office_end) && (
                            <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                              <svg className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              <div className="text-xs text-red-800 dark:text-red-200">
                                <span className="font-semibold">Invalid date range:</span> End time must be after start time.
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                              Custom Message (Optional)
                            </label>
                            <textarea
                              value={formBusiness.out_of_office_message || ''}
                              onChange={(e) => updateBusiness({ out_of_office_message: e.target.value })}
                              rows={2}
                              className="w-full px-3 py-2 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-foreground placeholder:text-muted-foreground transition-all duration-200 text-xs sm:text-sm hover:border-border/80 dark:hover:border-border/60 resize-none"
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                              Use <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{"{{business_name}}"}</code> and <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{"{{return_date}}"}</code> placeholders.
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Automatic Follow-Ups */}
                  <div className="p-3 rounded-lg border border-border/30">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-slate-900 dark:text-foreground">Automatic Follow-Ups</h3>
                          <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full font-medium">
                            New
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          Schedule follow-up texts for quiet leads.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowFollowUpSettings(true)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                      >
                        Configure
                      </button>
                    </div>
                  </div>

                  {/* Automation Status Summary - REMOVED */}
                </div>
              </div>

              {/* Group: Permissions */}
              {/* Group: Notifications */}
              <div id="notifications-divider" className="flex items-center gap-3 mb-6 scroll-mt-[64px]">
                <div className="h-px flex-1 bg-border/30"></div>
                <h3 className="text-sm font-medium text-muted-foreground">{settingsSections.find(s => s.id === 'notifications')?.label}</h3>
                <div className="h-px flex-1 bg-border/30"></div>
              </div>

              <NotificationsPreferences />

              {/* Group: Integrations */}
              <div id="integrations-divider" className="flex items-center gap-3 mb-6 scroll-mt-[64px]">
                <div className="h-px flex-1 bg-border/30"></div>
                <h3 className="text-sm font-medium text-muted-foreground">{settingsSections.find(s => s.id === 'integrations')?.label}</h3>
                <div className="h-px flex-1 bg-border/30"></div>
              </div>

              {/* Integrations Section */}
              <div id="integrations" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-foreground mb-1">Integrations</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">Connect services you already use.</p>
                </div>

                {/* Google Calendar & Meet Card */}
                <div className="border border-border/30 rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <svg className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground mb-1">Google Calendar & Meet</h3>
                          <p className="text-xs text-muted-foreground">
                            Sync your calendar and create appointments.
                          </p>
                        </div>
                        {!isLoadingCalendar && (
                          <button
                            onClick={calendarConnected ? handleDisconnectCalendar : handleConnectCalendar}
                            disabled={isConnectingCalendar || isDisconnectingCalendar}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap ${
                              calendarConnected
                                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            {isConnectingCalendar || isDisconnectingCalendar ? (
                              <>
                                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018 8v4h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.001 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span>Processing...</span>
                              </>
                            ) : (
                              <span>{calendarConnected ? 'Disconnect' : 'Connect'}</span>
                            )}
                          </button>
                        )}
                      </div>
                      {calendarConnected && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">Connected</span>
                          </div>
                          {calendarEmail && (
                            <p className="text-xs text-muted-foreground">
                              {calendarEmail}
                            </p>
                          )}
                          {lastSyncTime && (
                            <p className="text-xs text-muted-foreground">
                              Last synced {formatTimeAgo(lastSyncTime)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Group: Payments */}
              <div id="payments-divider" className="flex items-center gap-3 mb-6 scroll-mt-[64px]">
                <div className="h-px flex-1 bg-border/30"></div>
                <h3 className="text-sm font-medium text-muted-foreground">{settingsSections.find(s => s.id === 'payments')?.label}</h3>
                <div className="h-px flex-1 bg-border/30"></div>
              </div>

              <div id="payments" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-foreground mb-1">Payments</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Connect payment methods for customer requests.
                  </p>
                </div>

                {/* Determine if Tap to Pay card should be visible for grid layout */}
                {(() => {
                  const platform = tapToPayAwareness.state.tapToPaySupportStatus?.platform
                  const unsupportedReason = tapToPayAwareness.state.tapToPaySupportStatus?.unsupportedReason
                  const deviceType = tapToPayAwareness.state.tapToPaySupportStatus?.deviceInfo?.deviceType
                  // Use Capacitor directly for platform check to show card even while support status is loading
                  const isIOSPlatform = isIOS()
                  // Only exclude iPad if device type is available
                  const isIPad = deviceType === 'ipad'
                  const showTapToPayCard = isIOSPlatform && !isIPad

                  return (
                    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${showTapToPayCard ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}`}>
                  {/* Tap to Pay - Only render on supported iPhone (not iPad, iPod, or unsupported devices) */}
                  {(() => {
                    const status = tapToPayAwareness.state.tapToPaySupportStatus?.status
                    const platform = tapToPayAwareness.state.tapToPaySupportStatus?.platform
                    const unsupportedReason = tapToPayAwareness.state.tapToPaySupportStatus?.unsupportedReason
                    const deviceType = tapToPayAwareness.state.tapToPaySupportStatus?.deviceInfo?.deviceType

                    // Hide on non-iOS platforms (use Capacitor directly, not support status which may be loading)
                    if (!isIOS()) {
                      return null
                    }

                    // Hide on iPad, iPod touch, or other unsupported device types
                    if (unsupportedReason === 'unsupported_device_type' || deviceType === 'ipad') {
                      return null
                    }

                    return (
                      <div className="flex flex-col h-full border border-border/30 rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row sm:items-start sm:justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <Smartphone className="h-5 w-auto text-blue-600 dark:text-blue-400 flex-shrink-0" />
                          <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                            Tap to Pay on iPhone
                          </span>
                          {(() => {
                            const status = tapToPayAwareness.state.tapToPaySupportStatus?.status
                            const platform = tapToPayAwareness.state.tapToPaySupportStatus?.platform
                            const isUnsupported = status === 'unsupported_device' || status === 'unsupported_ios_version'
                            const isUnavailable = status === 'unavailable'
                            
                            if (platform === 'web' || platform === 'android') {
                              return (
                                <span className="text-xs px-2.5 py-0.5 bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 rounded-full font-medium">
                                  Not Available
                                </span>
                              )
                            }
                            
                            if (isUnsupported) {
                              return (
                                <span className="text-xs px-2.5 py-0.5 bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 rounded-full font-medium">
                                  Unsupported Device
                                </span>
                              )
                            }
                            
                            if (isUnavailable) {
                              return (
                                <span className="text-xs px-2.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full font-medium flex items-center gap-1.5">
                                  <span className="w-1 h-1 bg-amber-500 rounded-full" />
                                  Requires Attention
                                </span>
                              )
                            }
                            
                            if (status === 'supported' && stripeChargesEnabled && appleAccountLinkageState.status === 'linked') {
                              return (
                                <span className="text-xs px-2.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1.5">
                                  <span className="w-1 h-1 bg-green-500 rounded-full" />
                                  Enabled
                                </span>
                              )
                            }

                            if (status === 'supported' && stripeChargesEnabled && appleAccountLinkageState.status === 'not_linked') {
                              return (
                                <span className="text-xs px-2.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full font-medium flex items-center gap-1.5">
                                  <span className="w-1 h-1 bg-blue-500 rounded-full" />
                                  Not Enabled
                                </span>
                              )
                            }
                            
                            return (
                              <span className="text-xs px-2.5 py-0.5 bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 rounded-full font-medium">
                                Checking...
                              </span>
                            )
                          })()}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Accept contactless payments directly on a supported iPhone.
                        </p>
                      </div>
                      {tapToPayAwareness.state.isLoading ? (
                        <div className="flex-shrink-0 px-3 py-1.5">
                          <Skeleton className="h-8 w-20 rounded-md" />
                        </div>
                      ) : (
                        (() => {
                          const status = tapToPayAwareness.state.tapToPaySupportStatus?.status
                          const platform = tapToPayAwareness.state.tapToPaySupportStatus?.platform
                          const unsupportedReason = tapToPayAwareness.state.tapToPaySupportStatus?.unsupportedReason
                          const isUnsupported = status === 'unsupported_device' || status === 'unsupported_ios_version'
                          const isUnavailable = status === 'unavailable'
                          const isWebOrAndroid = platform === 'web' || platform === 'android'
                          
                          // Hide setup action for web/Android
                          if (isWebOrAndroid) {
                            return null
                          }
                          
                          // Show disabled action for unsupported/unavailable
                          if (isUnsupported || isUnavailable) {
                            return (
                              <button
                                disabled
                                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                                aria-label={`Tap to Pay is ${status === 'unsupported_device' ? 'not supported on this device' : status === 'unsupported_ios_version' ? 'not available on this iOS version' : 'currently unavailable'}`}
                              >
                                Not Available
                              </button>
                            )
                          }
                          
                          // Show active action for supported
                          if (status === 'supported' && isNativeMobile()) {
                            // If Apple account is not linked, show enablement action
                            if (appleAccountLinkageState.status === 'not_linked') {
                              return (
                                <div className="flex flex-col items-end gap-2">
                                  <button
                                    onClick={handleEnableTapToPay}
                                    disabled={isEnablingTapToPay}
                                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-500 dark:disabled:text-slate-400 text-white disabled:cursor-not-allowed transition-colors duration-150"
                                    aria-label="Enable Tap to Pay on iPhone"
                                  >
                                    {isEnablingTapToPay ? 'Enabling…' : 'Enable Tap to Pay on iPhone'}
                                  </button>
                                  {/* Configuration progress UI */}
                                  {readerState.softwareUpdateActive && readerState.softwareUpdateProgress !== null && (
                                    <div className="w-32">
                                      <div className="w-full bg-muted rounded-full h-1.5">
                                        <div
                                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                                          style={{ width: `${readerState.softwareUpdateProgress * 100}%` }}
                                        />
                                      </div>
                                      <p className="text-[10px] text-muted-foreground mt-1 text-right">
                                        Configuring… {Math.round(readerState.softwareUpdateProgress * 100)}%
                                      </p>
                                    </div>
                                  )}
                                  {/* Configuration error */}
                                  {readerState.softwareUpdateError && (
                                    <p className="text-[10px] text-red-600 dark:text-red-400 text-right max-w-32">
                                      {readerState.softwareUpdateError}
                                    </p>
                                  )}
                                </div>
                              )
                            }
                            // If checking status or error, show disabled action
                            if (appleAccountLinkageState.status === 'unknown' || appleAccountLinkageState.status === 'error') {
                              return (
                                <button
                                  disabled
                                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                                  aria-label={appleAccountLinkageState.status === 'unknown' ? 'Checking Tap to Pay status' : 'Tap to Pay status check failed'}
                                >
                                  {appleAccountLinkageState.isLoading ? 'Checking…' : 'Retry'}
                                </button>
                              )
                            }
                            // If Apple account is linked, no setup action needed
                            return null
                          }
                          
                          // Fallback for native mobile without capability status - no action needed
                          return null
                        })()
                      )}
                    </div>
                    <div className="mt-auto space-y-2">
                      {tapToPayAwareness.state.isLoading ? (
                        <div className="p-2.5 sm:p-3">
                          <Skeleton className="h-12 w-full rounded-lg" />
                        </div>
                      ) : (
                        (() => {
                          const status = tapToPayAwareness.state.tapToPaySupportStatus?.status
                          const platform = tapToPayAwareness.state.tapToPaySupportStatus?.platform
                          const unsupportedReason = tapToPayAwareness.state.tapToPaySupportStatus?.unsupportedReason
                          
                          // Web/Android: show informational message
                          if (platform === 'web' || platform === 'android') {
                            return (
                              <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg">
                                <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-300">
                                  Tap to Pay is available on compatible iPhone devices.
                                </p>
                              </div>
                            )
                          }
                          
                          // Stripe not connected
                          if (!stripeChargesEnabled) {
                            return (
                              <div className="p-2.5 sm:p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-300">
                                  <span className="font-semibold">Requires Stripe:</span> Connect Stripe to enable Tap to Pay.
                                </p>
                              </div>
                            )
                          }
                          
                          // Unsupported device (hardware)
                          if (status === 'unsupported_device' && unsupportedReason === 'unsupported_device_type') {
                            const deviceType = tapToPayAwareness.state.tapToPaySupportStatus?.deviceInfo?.deviceType
                            if (deviceType === 'ipad') {
                              return (
                                <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg">
                                  <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-300">
                                    Use a compatible iPhone to accept contactless payments.
                                  </p>
                                </div>
                              )
                            }
                            return (
                              <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg">
                                <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-300">
                                  Tap to Pay requires a compatible iPhone.
                                </p>
                              </div>
                            )
                          }
                          
                          // Unsupported iOS version
                          if (status === 'unsupported_ios_version') {
                            return (
                              <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg">
                                <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-300">
                                  Update iOS to use Tap to Pay on iPhone.
                                </p>
                              </div>
                            )
                          }
                          
                          // Unavailable
                          if (status === 'unavailable') {
                            return (
                              <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg">
                                <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-300">
                                  Tap to Pay is currently unavailable on this device.
                                </p>
                              </div>
                            )
                          }
                          
                          // Unknown status with retry
                          if (status === 'unknown') {
                            return (
                              <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg">
                                <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-300 mb-2">
                                  Unable to verify Tap to Pay availability right now.
                                </p>
                                <button
                                  onClick={() => tapToPayAwareness.checkCapability()}
                                  className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                  aria-label="Retry checking Tap to Pay availability"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Retry
                                </button>
                              </div>
                            )
                          }
                          
                          // Supported but not acknowledged and not yet enabled via Apple
                          if (status === 'supported' && !business?.tap_to_pay_awareness_acknowledged_at && appleAccountLinkageState.status !== 'linked') {
                            return (
                              <div className="p-2.5 sm:p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <p className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-300">
                                  <span className="font-semibold">New feature available:</span> Set up Tap to Pay to accept contactless payments.
                                </p>
                              </div>
                            )
                          }
                          
                          // Supported - show useful information
                          if (status === 'supported' && business?.stripe_charges_enabled) {
                            return (
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-500">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                  Device Supported
                                </div>
                                {appleAccountLinkageState.status === 'linked' && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                    Apple Account Linked
                                  </div>
                                )}
                                {business?.tap_to_pay_education_completed_at ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                    Education Completed
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                                    Education Required
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                                  Connected Reader: iPhone
                                </div>
                              </div>
                            )
                          }
                          
                          // Default: no message
                          return null
                        })()
                      )}
                      
                      {/* Tap to Pay Guide link */}
                      {(() => {
                        const status = tapToPayAwareness.state.tapToPaySupportStatus?.status
                        const platform = tapToPayAwareness.state.tapToPaySupportStatus?.platform

                        // Show guide for supported iOS devices with Stripe connected
                        if (isIOS() && status === 'supported' && business?.stripe_charges_enabled) {
                          return (
                            <button
                              onClick={handleNativeEducationGuide}
                              className="mt-2 text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                              aria-label="Open Tap to Pay on iPhone guide"
                            >
                              Tap to Pay on iPhone Guide
                            </button>
                          )
                        }

                        // Do not show guide for unsupported devices or non-iOS platforms
                        return null
                      })()}
                    </div>
                  </div>
                    )
                  })()}

                  <div className="flex flex-col h-full border border-border/30 rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row sm:items-start sm:justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <img src="/brands/stripe.svg" alt="Stripe" className="h-5 w-auto object-contain sm:h-6 flex-shrink-0" />
                          <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                            Recommended
                          </span>
                          {stripeChargesEnabled && stripeDetailsSubmitted ? (
                            <span className="text-xs px-2.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-2">
                              <span className="w-1 h-1 bg-green-500 rounded-full" />
                              Connected
                            </span>
                          ) : stripeStatusChecking ? (
                            <span className="text-xs px-2.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full font-medium flex items-center gap-2">
                              <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" />
                              Checking...
                            </span>
                          ) : business?.stripe_connect_account_id && stripeDetailsSubmitted && !stripeChargesEnabled ? (
                            <span className="text-xs px-2.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full font-medium flex items-center gap-1.5">
                              <span className="w-1 h-1 bg-amber-500 rounded-full" />
                              Verification Pending
                            </span>
                          ) : business?.stripe_connect_account_id ? (
                            <span className="text-xs px-2.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full font-medium flex items-center gap-1.5">
                              <span className="w-1 h-1 bg-amber-500 rounded-full" />
                              Setup In Progress
                            </span>
                          ) : (
                            <span className="text-xs px-2.5 py-0.5 bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 rounded-full font-medium">
                              Not Connected
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {stripeChargesEnabled && stripeDetailsSubmitted
                            ? 'Stripe is ready to accept payments.'
                            : business?.stripe_connect_account_id && stripeDetailsSubmitted && !stripeChargesEnabled
                              ? 'Stripe is reviewing your account.'
                              : business?.stripe_connect_account_id
                                ? 'Finish setting up your Stripe account.'
                                : 'Accept secure credit card payments from customers.'}
                        </p>
                      </div>
                      {!isConnectingStripe && (
                        <button
                          onClick={handleConnectStripe}
                          disabled={isConnectingStripe || isStripeConnectUnavailable}
                          className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                            stripeChargesEnabled && stripeDetailsSubmitted
                              ? 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'
                              : isStripeConnectUnavailable
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {stripeChargesEnabled && stripeDetailsSubmitted
                            ? 'Manage Stripe'
                            : business?.stripe_connect_account_id && stripeDetailsSubmitted && !stripeChargesEnabled
                              ? 'Verification Pending'
                              : business?.stripe_connect_account_id
                                ? 'Complete Setup'
                                : isStripeConnectUnavailable
                                  ? 'Unavailable'
                                  : 'Connect'}
                        </button>
                      )}
                    </div>
                    <div className="mt-auto space-y-2">
                      {business?.stripe_charges_enabled && business?.stripe_details_submitted && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-500">
                          {business.stripe_charges_enabled && <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>Charges enabled</div>}
                          {business.stripe_payouts_enabled && <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>Payouts enabled</div>}
                          {!business.stripe_payouts_enabled && <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>Additional verification required for payouts</div>}
                        </div>
                      )}
                      {business?.stripe_connect_account_id && !(business?.stripe_charges_enabled && business?.stripe_details_submitted) && (
                        <div className="p-2.5 sm:p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-300">
                            {business?.stripe_details_submitted && !business?.stripe_charges_enabled ? (
                              <>
                                <span className="font-semibold">Verification pending:</span> Stripe is reviewing your account. This usually takes 1-2 business days.
                              </>
                            ) : (
                              <>
                                <span className="font-semibold">Setup in progress:</span> Complete Stripe onboarding to accept card payments.
                              </>
                            )}
                          </p>
                        </div>
                      )}
                      {isStripeConnectUnavailable ? (
                        <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg">
                          <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-300">
                            Stripe card payments are not available yet. You can still use Venmo or PayPal.
                          </p>
                        </div>
                      ) : (!business?.stripe_connect_status || business.stripe_connect_status === 'not_connected') && (
                        <div className="p-2.5 sm:p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                          <p className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-300">
                            <span className="font-semibold">Best for cards:</span> Stripe provides the most complete payment experience in ReplyFlow.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col h-full border border-border/30 rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row sm:items-start sm:justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <img src="/brands/venmo.png" alt="Venmo" className="h-5 w-auto object-contain sm:h-6 flex-shrink-0" />
                        {formBusiness.venmo_username ? (
                          <span className="text-xs px-2.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1.5">
                            <span className="w-1 h-1 bg-green-500 rounded-full" />
                            Configured
                          </span>
                        ) : (
                          <span className="text-xs px-2.5 py-0.5 bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 rounded-full font-medium">
                            Not Configured
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        Accept Venmo payments by username.
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto">
                    <input
                      type="text"
                      value={formBusiness.venmo_username || ''}
                      onChange={(e) => updateBusiness({ venmo_username: e.target.value })}
                      placeholder="joesplumbing"
                      className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all duration-150 text-xs sm:text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      With or without @
                    </p>
                  </div>
                </div>

                  <div className="flex flex-col h-full border border-border/30 rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row sm:items-start sm:justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <img src="/brands/paypal.png" alt="PayPal" className="h-5 w-auto object-contain sm:h-6 flex-shrink-0" />
                          {formBusiness.paypal_payment_link ? (
                            <span className="text-xs px-2.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1.5">
                              <span className="w-1 h-1 bg-green-500 rounded-full" />
                              Configured
                            </span>
                          ) : (
                            <span className="text-xs px-2.5 py-0.5 bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 rounded-full font-medium">
                              Not Configured
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Accept PayPal payments by link.
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto">
                      <input
                        type="text"
                        value={formBusiness.paypal_payment_link || ''}
                        onChange={(e) => updateBusiness({ paypal_payment_link: e.target.value })}
                        placeholder="https://paypal.me/yourbusiness"
                        className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all duration-150 text-xs sm:text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Example: https://paypal.me/joesplumbing
                      </p>
                    </div>
                  </div>
                </div>
                    )
                  })()}

                <div className="mt-4 pt-3 border-t border-border/25">
                  <div className="flex items-start gap-2">
                    <CreditCard className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-foreground mb-0.5">
                        Payment requests
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Choose a payment method when sending a payment request.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group: Contacts */}
              <div id="contacts-divider" className="flex items-center gap-3 mb-6 scroll-mt-[64px]">
                <div className="h-px flex-1 bg-border/30"></div>
                <h3 className="text-sm font-medium text-muted-foreground">{settingsSections.find(s => s.id === 'contacts')?.label}</h3>
                <div className="h-px flex-1 bg-border/30"></div>
              </div>

              {/* Contacts Section */}
              <div id="contacts" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                  <div className="flex-1">
                    <h2 className="text-base font-semibold text-foreground mb-1">Personal Contacts</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">Add your own phone number, friends, family, employees, or other personal callers. Calls from these numbers stay out of your customer workflow and their voicemails appear in ReplyFlow's Personal section.</p>
                  </div>
                  <div className="flex items-center gap-2 sm:flex-shrink-0">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98] text-sm inline-flex items-center justify-center"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="h-10 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition-colors duration-200 text-sm inline-flex items-center justify-center"
                  >
                    Import
                  </button>
                </div>
                </div>
                <div className="space-y-3 sm:space-y-4">
                  {isLoadingIgnored ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
                    </div>
                  ) : ignoredContacts.length === 0 ? (
                    <div className="text-center py-10 bg-muted/30 rounded-lg border border-border/30">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                        <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground mb-2">No personal contacts yet.</h3>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        Add phone numbers whose voicemails should appear in ReplyFlow's Personal section.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {ignoredContacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-muted/30 rounded-lg border border-border/40 hover:bg-muted/50 transition-colors duration-150"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-foreground">
                                {formatPhoneNumber(contact.phone_number)}
                              </span>
                              {contact.label && (
                                <span className="text-[11px] px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full font-medium">
                                  {contact.label}
                                </span>
                              )}
                              {contact.type && (
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                  contact.type === 'spam' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                  contact.type === 'personal' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                                  contact.type === 'employee' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                                  contact.type === 'vendor' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                }`}>
                                  {contact.type === 'existing_customer' ? 'Customer' : contact.type}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => removeIgnoredContact(contact.id)}
                            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors duration-150"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

                            </>
              )}

              {/* Group: Account */}
              <div id="account-divider" className="flex items-center gap-3 mb-6 scroll-mt-[64px]">
                <div className="h-px flex-1 bg-border/30"></div>
                <h3 className="text-sm font-medium text-muted-foreground">{settingsSections.find(s => s.id === 'account')?.label}</h3>
                <div className="h-px flex-1 bg-border/30"></div>
              </div>

              {/* Account Section */}
              <div id="account" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
                <div className="mb-5">
                  <h2 className="text-base font-semibold text-foreground mb-1">Account</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">Your account details and status.</p>
                </div>
                <div className="space-y-px bg-border/20 rounded-lg overflow-hidden">
                  {/* Login Email */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900/60 p-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2.5">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">Login Email</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        This is the email you use to sign in.
                      </span>
                      {pendingNewEmail && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          Pending confirmation: {pendingNewEmail}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{user?.email}</span>
                      <button
                        onClick={() => setShowChangeEmailModal(true)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                      >
                        Change Email
                      </button>
                    </div>
                  </div>

                  {/* Pending Email Confirmation */}
                  {pendingNewEmail && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-50 dark:bg-amber-900/20 p-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2.5">
                          <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Email Change Pending</span>
                        </div>
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                          Check your new inbox to confirm: {pendingNewEmail}
                        </span>
                      </div>
                      <button
                        onClick={handleResendConfirmation}
                        className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 bg-amber-100 dark:bg-amber-800 hover:bg-amber-200 dark:hover:bg-amber-700 text-amber-700 dark:text-amber-300 whitespace-nowrap"
                      >
                        Resend Confirmation
                      </button>
                    </div>
                  )}

                  {/* Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900/60 p-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          isInTrialPeriod(business?.subscription_status)
                            ? 'bg-blue-500'
                            : hasActiveSubscription(business)
                              ? 'bg-green-500'
                              : 'bg-amber-500'
                        }`}></div>
                        <span className="text-sm font-medium text-foreground">Status</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Your account is in good standing.
                      </span>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      isInTrialPeriod(business?.subscription_status)
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : hasActiveSubscription(business)
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                    }`}>
                      {getSubscriptionStatusText(business?.subscription_status)}
                    </span>
                  </div>

                  {/* Access Status */}
                  {(() => {
                    const manualStatus = getManualAccessStatus(business)
                    const accessInfo = getManualAccessDisplayInfo(business)
                    
                    return (
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 bg-white dark:bg-slate-900/60 p-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2.5 h-2.5 rounded-full ${
                              manualStatus.hasManualAccess && accessInfo.status === 'active'
                                ? 'bg-green-500'
                                : manualStatus.hasManualAccess && accessInfo.status === 'expired'
                                  ? 'bg-red-500'
                                  : 'bg-slate-400'
                            }`}></div>
                            <span className={`text-sm font-medium ${
                              manualStatus.hasManualAccess && accessInfo.status === 'active'
                                ? 'text-green-600 dark:text-green-400'
                                : manualStatus.hasManualAccess && accessInfo.status === 'expired'
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-foreground'
                            }`}>
                              Access Status
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            How you currently access ReplyFlow.
                          </span>
                        </div>
                        <div className="flex flex-col items-start sm:items-end">
                          <span className={`text-sm font-semibold ${
                            manualStatus.hasManualAccess && accessInfo.status === 'active' 
                              ? 'text-green-900 dark:text-green-100'
                              : manualStatus.hasManualAccess && accessInfo.status === 'expired'
                                ? 'text-red-900 dark:text-red-100'
                                : 'text-foreground'
                          }`}>
                            {manualStatus.hasManualAccess 
                              ? (accessInfo.status === 'active' 
                                  ? 'Manual Access Active'
                                  : 'Manual Access Expired')
                              : (hasActiveSubscription(business) 
                                  ? 'Active via Subscription'
                                  : 'No manual access granted')
                            }
                          </span>
                          {manualStatus.expiresAt && (
                            <span className="text-xs text-muted-foreground mt-0.5">
                              Until {new Date(manualStatus.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                          {!manualStatus.expiresAt && manualStatus.hasManualAccess && (
                            <span className="text-xs text-muted-foreground mt-0.5">
                              Lifetime access
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Password */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900/60 p-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2.5">
                        <Smartphone className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">Password</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Keep your account secure.
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">•••••••••</span>
                      <button
                        onClick={() => setShowChangePasswordModal(true)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                      >
                        Change Password
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscription & Billing Section */}
              <div id="subscription" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-foreground mb-1">Subscription & Billing</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">Manage your subscription and billing.</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 mb-2">
                      <h3 className="text-sm font-semibold text-foreground">Current Plan</h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isInTrialPeriod(business?.subscription_status)
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : hasActiveSubscription(business)
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }`}>
                        {getSubscriptionStatusText(business?.subscription_status)}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground mb-1">
                      {isInTrialPeriod(business?.subscription_status)
                        ? `ReplyFlow — ${getPricingDisplay()}`
                        : getPricingDisplay()}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {isInTrialPeriod(business?.subscription_status) && business?.trial_ends_at
                        ? `Your free trial ends on ${new Date(business.trial_ends_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}. You won't be charged until then.`
                        : (business?.subscription_status === 'past_due' || business?.subscription_status === 'unpaid')
                          ? 'Your latest payment could not be processed. Stripe will retry automatically. Please update your payment method if needed.'
                          : getSubscriptionStatusDescription(
                              business?.subscription_status,
                              business?.stripe_customer_id,
                              business?.stripe_subscription_id,
                              business?.cancel_at_period_end,
                              business?.current_period_end,
                              business?.trial_ends_at
                            )}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {(business?.subscription_status === 'beta' || business?.subscription_status === 'comped') ? (
                      <p className="text-xs text-muted-foreground">
                        Billing not required
                      </p>
                    ) : (
                      <button
                        onClick={() => handleBillingActionClick('portal')}
                        disabled={isOpeningPortal}
                        className="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                      >
                        {isOpeningPortal ? (
                          <>
                            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018 8v4h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>{business?.stripe_customer_id && business.stripe_customer_id.startsWith('cus_') ? 'Opening...' : 'Loading...'}</span>
                          </>
                        ) : (
                          <span>{business?.stripe_customer_id && business.stripe_customer_id.startsWith('cus_') ? 'Manage Billing' : 'Subscribe Now'}</span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                {needsUpgrade(business?.subscription_status) && !getManualAccessStatus(business).hasManualAccess && (
                  <button
                    onClick={() => handleBillingActionClick('upgrade')}
                    disabled={isStartingCheckout}
                    className="w-full h-11 px-4 text-sm font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98] mt-4"
                  >
                    {isStartingCheckout ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018 8v4h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <span>Upgrade Plan</span>
                    )}
                  </button>
                )}
              </div>

              {/* Danger Zone Section */}
              <div id="danger-zone" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-red-200/40 dark:border-red-900/30 shadow-sm p-5 scroll-mt-[64px]">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-red-700 dark:text-red-400 mb-1">Danger Zone</h2>
                  <p className="text-sm text-red-600/70 dark:text-red-400/70 leading-relaxed">Permanent destructive actions that cannot be undone.</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-foreground mb-1">Delete Account</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Permanently delete your account and associated data.
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 bg-red-600 hover:bg-red-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500/40 whitespace-nowrap"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
            </div>

          {/* Settings Action Bar */}
          <SettingsActionBar
            hasUnsavedChanges={hasUnsavedChanges}
            onSave={saveChanges}
            onDiscard={discardChanges}
            isSaving={isSaving}
            saveError={saveError}
            clearError={clearSaveError}
            saveSuccess={saveSuccess}
            clearSuccess={() => setSaveSuccess(false)}
          />

          {/* Delete Account Modal */}
          {showDeleteModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center z-[80] p-0 sm:p-4 overscroll-contain">
              <div className="bg-white dark:bg-slate-900 rounded-none sm:rounded-xl max-w-lg w-full h-[100vh] sm:h-auto max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Fixed Header */}
                <div className="flex-shrink-0 p-6 border-b border-slate-200/70 dark:border-slate-700/50">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                      <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-slate-900 dark:text-foreground mb-2">
                        Permanently delete your ReplyFlow account
                      </h2>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        This permanently removes your ReplyFlow account and business data. Please review what happens before continuing.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 min-h-0 overflow-y-scroll p-6 space-y-4 overscroll-contain pb-24 sm:pb-6" style={{ touchAction: 'pan-y' }} data-scroll-lock-allow>
                  {/* What happens on deletion */}
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      Billing & Subscription
                    </h3>
                    <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <span>We'll automatically cancel your active subscription (if one exists).</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Offboarding Communications
                    </h3>
                    <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Call forwarding instructions via email and SMS</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Receive a ReplyFlow Journey summary with your business statistics and usage history.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <span>We'll send reminders to help you disable call forwarding. Reminders stop immediately once you confirm forwarding is disabled.</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Data Deletion
                    </h3>
                    <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Permanent deletion of your business, customers, conversations, messages, appointments, settings, and related ReplyFlow data.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Account removal and sign-out from ReplyFlow</span>
                      </li>
                    </ul>
                  </div>

                  {/* Warning callout */}
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1">
                          Important: Call Forwarding
                        </p>
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          If call forwarding is still enabled after deleting your account, new callers may continue reaching your ReplyFlow number instead of your normal voicemail. We'll email and text simple instructions to help you disable forwarding, and reminders stop immediately once you confirm forwarding has been disabled.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Confirmation input */}
                  <div>
                    <label className="block text-sm text-slate-900 dark:text-foreground mb-2">
                      Type <span className="font-mono font-bold">DELETE</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE"
                      disabled={isDeleting}
                      className="w-full px-4 py-3 border border-slate-200/70 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-50"
                    />
                  </div>

                  {/* Final Confirmation - Password */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-2">
                      Final Confirmation
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                      Enter your current password to permanently delete your ReplyFlow account.
                    </p>
                    <div>
                      <label className="block text-sm text-slate-900 dark:text-foreground mb-2">
                        Current Password
                      </label>
                      <PasswordInput
                        id="delete-password"
                        name="delete-password"
                        value={deletePassword}
                        onChange={(e) => {
                          setDeletePassword(e.target.value)
                          setDeletePasswordError('')
                        }}
                        placeholder="Enter your current password"
                        required={false}
                        autoComplete="current-password"
                        disabled={isDeleting}
                        className={`${
                          deletePasswordError 
                            ? 'border-red-500 focus:ring-red-500' 
                            : 'border-slate-200/70 dark:border-slate-700/50 focus:ring-red-500/40 focus:border-red-500/80'
                        }`}
                      />
                      {deletePasswordError && (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                          {deletePasswordError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fixed Footer */}
                <div className="flex-shrink-0 p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 border-t border-slate-200/70 dark:border-slate-700/50">
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteModal(false)
                        setDeleteConfirmText('')
                        setDeletePassword('')
                        setDeletePasswordError('')
                      }}
                      disabled={isDeleting}
                      className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors duration-150 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || !deletePassword.trim() || isDeleting}
                      className="px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isDeleting ? (
                        <>
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent border-solid inline-block"></div>
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Delete Account Permanently
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Personal Contact Modal */}
          {showAddModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-4">
              <div className="bg-card rounded-lg max-w-md w-full max-h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] sm:max-h-[85vh] flex flex-col overflow-hidden">
                <div className="flex-shrink-0 p-4 sm:p-6 border-b border-border/60">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-foreground mb-4">
                    Add Personal Contact
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground">
                    Add people here when you never want ReplyFlow to respond to their missed calls. Friends, family, schools, doctors, and other personal contacts are common examples. When a personal contact calls, ReplyFlow stays out of the conversation (no AI Voice, no automated texts, no lead, no follow-ups—just a simple voicemail). You can remove contacts from this list at any time.
                  </p>
                </div>
                <div data-scroll-lock-allow className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                  <div>
                    <label className="block text-sm text-slate-900 dark:text-foreground mb-2">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-900 dark:text-foreground mb-2">
                      Label (optional)
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground"
                      placeholder="e.g., John Doe"
                    />
                  </div>
                  <div className="p-3 bg-blue-50/70 dark:bg-blue-900/15 border border-blue-200/70 dark:border-blue-800/60 rounded-lg">
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Numbers added here stay out of your customer workflow. Any voicemail they leave will appear separately in Personal Voicemail.
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0 flex justify-end gap-3 p-4 sm:p-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 border-t border-border/60">
                  <button
                    onClick={() => {
                      setShowAddModal(false)
                      setPhoneNumber('')
                      setLabel('')
                    }}
                    disabled={isAdding}
                    className="h-11 px-4 text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddIgnoredContact}
                    disabled={isAdding || !phoneNumber.trim()}
                    className="h-11 px-4 text-sm font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
                  >
                    {isAdding ? (
                      <>
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent border-solid inline-block mr-2"></div>
                        Adding...
                      </>
                    ) : (
                      'Add Contact'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Change Password Modal */}
          {showChangePasswordModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full">
                <div className="p-6 border-b border-slate-200/70 dark:border-slate-700/50">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">
                    Change Password
                  </h3>
                </div>
                
                {passwordError && (
                  <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/50">
                    <p className="text-xs text-red-600 dark:text-red-400">{passwordError}</p>
                  </div>
                )}

                <div className="p-6 space-y-4">
                  {/* Current Password */}
                  <div>
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        ref={currentPasswordRef}
                        id="currentPassword"
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        className="w-full px-3 py-2.5 pr-10 border border-slate-200/70 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm"
                        placeholder="Enter current password"
                        disabled={isChangingPassword}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleChangePassword()
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        tabIndex={-1}
                      >
                        {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        ref={newPasswordRef}
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="w-full px-3 py-2.5 pr-10 border border-slate-200/70 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm"
                        placeholder="Enter new password"
                        disabled={isChangingPassword}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleChangePassword()
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        tabIndex={-1}
                      >
                        {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    
                    {/* Password Strength Indicator */}
                    {newPassword && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                newPassword.length >= 8 && /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /[0-9]/.test(newPassword)
                                  ? 'bg-green-500'
                                  : newPassword.length >= 8 && (/[A-Z]/.test(newPassword) || /[a-z]/.test(newPassword) || /[0-9]/.test(newPassword))
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                              }`}
                              style={{
                                width: `${Math.min(100, (newPassword.length / 8) * 25 + 
                                  (/[A-Z]/.test(newPassword) ? 25 : 0) + 
                                  (/[a-z]/.test(newPassword) ? 25 : 0) + 
                                  (/[0-9]/.test(newPassword) ? 25 : 0))}%`
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            {newPassword.length >= 8 && /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /[0-9]/.test(newPassword)
                              ? 'Strong'
                              : newPassword.length >= 8 && (/[A-Z]/.test(newPassword) || /[a-z]/.test(newPassword) || /[0-9]/.test(newPassword))
                              ? 'Fair'
                              : 'Weak'}
                          </span>
                        </div>
                        
                        {/* Individual Requirements */}
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <div className={`flex items-center gap-1 ${newPassword.length >= 8 ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {newPassword.length >= 8 ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-slate-400 dark:border-slate-600" />}
                            8 characters
                          </div>
                          <div className={`flex items-center gap-1 ${/[A-Z]/.test(newPassword) ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {/[A-Z]/.test(newPassword) ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-slate-400 dark:border-slate-600" />}
                            Uppercase
                          </div>
                          <div className={`flex items-center gap-1 ${/[a-z]/.test(newPassword) ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {/[a-z]/.test(newPassword) ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-slate-400 dark:border-slate-600" />}
                            Lowercase
                          </div>
                          <div className={`flex items-center gap-1 ${/[0-9]/.test(newPassword) ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {/[0-9]/.test(newPassword) ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-slate-400 dark:border-slate-600" />}
                            Number
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        ref={confirmPasswordRef}
                        id="confirmNewPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="w-full px-3 py-2.5 pr-10 border border-slate-200/70 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm"
                        placeholder="Confirm new password"
                        disabled={isChangingPassword}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleChangePassword()
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 p-4 border-t border-slate-200/70 dark:border-slate-700/50">
                  <button
                    onClick={() => {
                      setShowChangePasswordModal(false)
                      setCurrentPassword('')
                      setNewPassword('')
                      setConfirmNewPassword('')
                      setPasswordError('')
                      setShowCurrentPassword(false)
                      setShowNewPassword(false)
                      setShowConfirmPassword(false)
                    }}
                    disabled={isChangingPassword}
                    className="h-11 px-4 text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangePassword}
                    disabled={isChangingPassword || !currentPassword.trim() || !newPassword.trim() || !confirmNewPassword.trim()}
                    className="h-11 px-4 text-sm font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
                  >
                    {isChangingPassword ? (
                      <>
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent border-solid inline-block mr-2"></div>
                        Changing...
                      </>
                    ) : (
                      'Change Password'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Change Email Modal */}
          {showChangeEmailModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full">
                <div className="p-6 border-b border-slate-200/70 dark:border-slate-700/50">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">
                    Change Login Email
                  </h3>
                </div>
                
                {emailError && (
                  <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/50">
                    <p className="text-xs text-red-600 dark:text-red-400">{emailError}</p>
                  </div>
                )}

                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Current Email
                    </label>
                    <div className="px-3 py-2.5 border border-slate-200/70 dark:border-slate-700/50 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 text-sm">
                      {user?.email}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="newEmail" className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      New Login Email
                    </label>
                    <input
                      id="newEmail"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full px-3 py-2.5 border border-slate-200/70 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm"
                      placeholder="Enter new email"
                      disabled={isChangingEmail}
                    />
                  </div>

                  <div>
                    <label htmlFor="confirmNewEmail" className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Confirm New Login Email
                    </label>
                    <input
                      id="confirmNewEmail"
                      type="email"
                      value={confirmNewEmail}
                      onChange={(e) => setConfirmNewEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full px-3 py-2.5 border border-slate-200/70 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm"
                      placeholder="Confirm new email"
                      disabled={isChangingEmail}
                    />
                  </div>

                  <div>
                    <label htmlFor="emailPassword" className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Current Password
                    </label>
                    <PasswordInput
                      id="emailPassword"
                      name="emailPassword"
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full px-3 py-2.5 border border-slate-200/70 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm"
                      placeholder="Enter current password"
                      disabled={isChangingEmail}
                    />
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      <strong>Warning:</strong> This changes your login email only. It does not change your business contact email or any other account settings.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 p-4 border-t border-slate-200/70 dark:border-slate-700/50">
                  <button
                    onClick={handleCloseChangeEmailModal}
                    disabled={isChangingEmail}
                    className="h-11 px-4 text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangeEmail}
                    disabled={isChangingEmail || !newEmail.trim() || !confirmNewEmail.trim() || !emailPassword.trim()}
                    className="h-11 px-4 text-sm font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
                  >
                    {isChangingEmail ? (
                      <>
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent border-solid inline-block mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      'Change Email'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Import Contacts Modal */}
          <ImportContactsModal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            onImportSuccess={handleImportSuccess}
          />

          {/* Follow-Up Settings Modal */}
          <FollowUpSettings
            isOpen={showFollowUpSettings}
            onClose={() => setShowFollowUpSettings(false)}
            onSave={() => {
              showToast('Settings saved', 'success')
            }}
          />

          {/* Tap to Pay Education Modal */}
          <TapToPayEducationModal
            isOpen={showEducationModal}
            onComplete={handleEducationComplete}
            onDismiss={() => setShowEducationModal(false)}
            showTryButton={false}
          />

          {/* Tap to Pay Education Confirmation Modal */}
          {showEducationConfirmationModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">
                  Finished reviewing Tap to Pay?
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                  Confirm that you reviewed Apple's Tap to Pay on iPhone guide.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowEducationConfirmationModal(false)}
                    className="flex-1 h-11 px-4 text-sm font-medium rounded-lg transition-colors duration-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                  >
                    Not Yet
                  </button>
                  <button
                    onClick={async () => {
                      setShowEducationConfirmationModal(false)
                      await handleEducationComplete()
                    }}
                    className="flex-1 h-11 px-4 text-sm font-medium rounded-lg transition-all duration-200 bg-blue-600 hover:bg-blue-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
                  >
                    I Reviewed It
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Business Number Confirmation Modal */}
          {showBusinessNumberWarning && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full p-5">
                <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">
                  Switch to Business Number?
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Messages will open in your phone's messaging app instead of ReplyFlow.
                </p>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 mb-4">
                  <p className="text-xs font-medium text-slate-900 dark:text-foreground mb-2">
                    What to expect:
                  </p>
                  <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <li>• You'll leave ReplyFlow to send each message</li>
                    <li>• Messages won't sync to ReplyFlow</li>
                    <li>• ReplyFlow still tracks payments and business activity</li>
                  </ul>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowBusinessNumberWarning(false)}
                    className="h-11 px-4 text-sm font-medium rounded-lg transition-colors duration-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmBusinessNumber}
                    className="h-11 px-4 text-sm font-medium rounded-lg transition-colors duration-200 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Switch to Business Number
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stripe Connect Loading Modal */}
          {stripeConnectLoading && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[90] p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl">
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">
                  {stripeConnectLoadingMessage}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {stripeConnectLoadingMessage === 'Opening Stripe'
                    ? 'Securely connecting your Stripe account...'
                    : 'Confirming your account with Stripe.'}
                </p>
              </div>
            </div>
          )}

          {/* Toast Container */}
          <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
        </div>
      </BusinessGuard>
    </AuthGuard>
    <BottomNavigation />
    </DashboardErrorBoundary>
  )
}
