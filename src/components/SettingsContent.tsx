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
import Link from 'next/link'
import { formatPhoneNumber } from '@/lib/utils'
import Navigation from '@/components/Navigation'
import PageBackground from '@/components/PageBackground'
import UserDropdown from '@/components/UserDropdown'
import AppHeader from '@/components/AppHeader'
import BottomNavigation from '@/components/BottomNavigation'
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
import { getBusinessOnboardingState, BusinessData } from '@/lib/onboarding-state'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import { getManualAccessStatus, getManualAccessDisplayInfo } from '@/lib/manual-access'
import ImportContactsModal from '@/components/ImportContactsModal'
import { getDefaultOutOfOfficeTemplate } from '@/lib/out-of-office'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { CreditCard, Mail, MessageSquare, Trash2, AlertTriangle, FileText, Clock, CheckCircle } from 'lucide-react'
import ConfirmModal from '@/components/ui/ConfirmModal'

export default function SettingsContent() {
  const router = useRouter()
  const { business, setBusiness, refreshBusiness } = useBusiness()
  const { user, signOut } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [showDeletePassword, setShowDeletePassword] = useState(false)
  const [deletePasswordError, setDeletePasswordError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])
  const [activeSection, setActiveSection] = useState('general')

  // Default out of office message (use canonical template)
  const DEFAULT_OUT_OF_OFFICE_MESSAGE = getDefaultOutOfOfficeTemplate()

  // Default after hours message
  const DEFAULT_AFTER_HOURS_MESSAGE = "Thanks for contacting {{business_name}}. We're currently closed and will get back to you during business hours."

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
  const [contactType, setContactType] = useState('spam')
  const [reason, setReason] = useState('')

  // Import contacts modal state
  const [showImportModal, setShowImportModal] = useState(false)

  // Change password modal state
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')

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
  const [isCalendarDisconnectConfirmOpen, setIsCalendarDisconnectConfirmOpen] = useState(false)

  // Business phone number cooldown state
  const [phoneCooldown, setPhoneCooldown] = useState<{ inCooldown: boolean; nextAvailableDate: string | null } | null>(null)

  // Stripe Connect state
  const [isConnectingStripe, setIsConnectingStripe] = useState(false)
  const isStripeConnectUnavailable = process.env.NEXT_PUBLIC_STRIPE_CONNECT_ENABLED === 'false'

  const supabase = createBrowserClient()

  useBodyScrollLock(showAddModal || showDeleteModal || showChangePasswordModal || isCalendarDisconnectConfirmOpen)

  // Time input refs for better UX
  const openTimeInputRef = useRef<HTMLInputElement>(null)
  const closeTimeInputRef = useRef<HTMLInputElement>(null)
  const outOfOfficeStartRef = useRef<HTMLInputElement>(null)
  const outOfOfficeEndRef = useRef<HTMLInputElement>(null)
  const settingsTabsNavRef = useRef<HTMLElement>(null)
  const sectionTabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

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

      // Only save real business columns that exist in the database schema
      const updatePayload: any = {
        name: businessData.name,
        business_phone_number: businessData.business_phone_number,
        business_type: businessData.business_type,
        business_type_other: businessData.business_type_other,
        out_of_office_enabled: businessData.out_of_office_enabled,
        out_of_office_start: businessData.out_of_office_start,
        out_of_office_end: businessData.out_of_office_end,
        out_of_office_message: businessData.out_of_office_message,
        auto_reply_message: businessData.auto_reply_message,
        call_forwarding_enabled: businessData.call_forwarding_enabled,
        business_hours_enabled: businessData.business_hours_enabled,
        business_hours_start: businessData.business_hours_start,
        business_hours_end: businessData.business_hours_end,
        business_hours_timezone: businessData.business_hours_timezone,
        after_hours_message: businessData.after_hours_message,
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
      showToast('✓ Settings saved', 'success')
    }
  })

  // Toast functions
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    // Use stable ID for settings success toast to prevent duplicates
    const stableId = message === '✓ Settings saved' && type === 'success' 
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

  // Helper to convert ISO timestamp to datetime-local format (yyyy-MM-ddThh:mm)
  const toDateTimeLocal = (isoString: string | null | undefined): string => {
    if (!isoString) return ''

    try {
      const date = new Date(isoString)
      if (isNaN(date.getTime())) {
        return ''
      }

      // Format: yyyy-MM-ddThh:mm
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')

      return `${year}-${month}-${day}T${hours}:${minutes}`
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

    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
        showToast('Failed to fetch ignored contacts', 'error')
      }
    } finally {
      setIsLoadingIgnored(false)
    }
  }

  // Remove ignored contact
  const removeIgnoredContact = async (contactId: string) => {
    if (!confirm('Remove this contact from your ignore list? This will allow ReplyFlow to capture missed calls from this number again.')) {
      return
    }

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
        throw new Error('Failed to remove ignored contact')
      }

      // Update local state
      setIgnoredContacts(prev => prev.filter(contact => contact.id !== contactId))
      showToast('Contact removed from ignore list', 'success')
    } catch (error) {
      console.error('Error removing ignored contact:', error)
      showToast('Failed to remove ignored contact', 'error')
    }
  }

  // Add ignored contact
  const handleAddIgnoredContact = async () => {
    if (!phoneNumber.trim()) {
      showToast('Phone number is required', 'error')
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
          type: contactType,
          reason: reason.trim() || 'Added manually in settings'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add ignored contact')
      }

      // Update local state
      const data = await response.json()
      setIgnoredContacts(prev => [data.ignoredContact, ...prev])
      
      // Reset form
      setPhoneNumber('')
      setLabel('')
      setContactType('spam')
      setReason('')
      setShowAddModal(false)
      
      showToast('Contact added to ignore list', 'success')
    } catch (error) {
      console.error('Error adding ignored contact:', error)
      showToast(error instanceof Error ? error.message : 'Failed to add ignored contact', 'error')
    } finally {
      setIsAdding(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordError('')

    // Validate passwords
    if (!newPassword.trim()) {
      setPasswordError('Password is required')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setIsChangingPassword(true)

    try {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        console.error('Password update error:', error)
        setPasswordError('Failed to update password')
        return
      }

      // Success
      showToast('Password updated successfully', 'success')
      setShowChangePasswordModal(false)
      setNewPassword('')
      setConfirmNewPassword('')
      setPasswordError('')
    } catch (err) {
      console.error('Password update error:', err)
      setPasswordError('An unexpected error occurred')
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
        console.log('[Settings] No session token for calendar status, skipping fetch')
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
    setIsCalendarDisconnectConfirmOpen(true)
  }

  const handleDisconnectCalendarConfirmed = async () => {
    setIsCalendarDisconnectConfirmOpen(false)
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
        console.log('[Settings] No session token for phone cooldown check')
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
    if (isStripeConnectUnavailable) {
      return
    }

    if (!business?.id) {
      showToast('Business not found', 'error')
      return
    }

    setIsConnectingStripe(true)
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
        window.location.href = data.url
      } else {
        throw new Error('No onboarding URL returned')
      }
    } catch (error) {
      console.error('[Settings] Error connecting Stripe:', error)
      showToast(error instanceof Error ? error.message : 'We couldn\'t connect Stripe. Please try again.', 'error')
    } finally {
      setIsConnectingStripe(false)
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
    if (!business?.stripe_connect_account_id) return

    console.log('[STRIPE CONNECT] Refresh endpoint called')
    console.log('[STRIPE CONNECT] Connected account id:', business.stripe_connect_account_id)

    try {
      const response = await fetch('/api/stripe/connect/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ business_id: business.id })
      })

      if (response.ok) {
        console.log('[STRIPE CONNECT] Status refreshed successfully')
        console.log('[STRIPE CONNECT] Refreshing business data...')
        await refreshBusiness()
        console.log('[STRIPE CONNECT] Business data refreshed, new state:', {
          stripe_connect_account_id: business?.stripe_connect_account_id,
          stripe_connect_status: business?.stripe_connect_status,
          stripe_charges_enabled: business?.stripe_charges_enabled,
          stripe_payouts_enabled: business?.stripe_payouts_enabled,
          stripe_details_submitted: business?.stripe_details_submitted,
        })
        showToast('Stripe Connect status updated', 'success')
      } else {
        console.error('[STRIPE CONNECT] Failed to refresh status')
      }
    } catch (error) {
      console.error('[STRIPE CONNECT] Error refreshing status:', error)
    }
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

  // Check URL params for Stripe onboarding return
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const stripeOnboarding = urlParams.get('stripe_onboarding')
    if (stripeOnboarding === 'complete' && business?.stripe_connect_account_id) {
      console.log('[STRIPE CONNECT] Onboarding return detected, refreshing status')
      refreshStripeStatus()
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/settings#payments')
    }
  }, [business])

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

  // Scroll-aware active section detection using explicit scroll positions
  useEffect(() => {
    const sections = ['general', 'automation', 'integrations', 'payments', 'contacts', 'account']
    let timeoutId: NodeJS.Timeout | null = null
    
    const updateActiveSection = () => {
      // Get section elements
      const generalSection = document.getElementById('general')
      const automationSection = document.getElementById('automation')
      const integrationsSection = document.getElementById('integrations')
      const paymentsSection = document.getElementById('payments')
      const contactsSection = document.getElementById('contacts')
      const accountSection = document.getElementById('account')
      
      if (!generalSection || !automationSection || !integrationsSection || !paymentsSection || !contactsSection || !accountSection) {
        return
      }
      
      // Get scroll position and viewport dimensions
      const scrollY = window.scrollY
      const viewportHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight
      
      // TOP_THRESHOLD: Force General tab when at or near the top of the page
      const TOP_THRESHOLD = 120
      if (scrollY <= TOP_THRESHOLD) {
        setActiveSection('general')
        return
      }
      
      // BOTTOM_THRESHOLD: Force Account tab when at or near the bottom of the page
      const BOTTOM_THRESHOLD = 120
      if (scrollY + viewportHeight >= documentHeight - BOTTOM_THRESHOLD) {
        setActiveSection('account')
        return
      }
      
      // Get section offsets
      const generalTop = generalSection.offsetTop
      const automationTop = automationSection.offsetTop
      const integrationsTop = integrationsSection.offsetTop
      const paymentsTop = paymentsSection.offsetTop
      const contactsTop = contactsSection.offsetTop
      const accountTop = accountSection.offsetTop
      
      // Calculate offset for header and tabs using shared helper
      const offset = getScrollOffset()
      
      // Calculate which section should be active
      let computedActiveSection = 'general'
      
      if (scrollY < automationTop - offset) {
        computedActiveSection = 'general'
      } else if (scrollY < integrationsTop - offset) {
        computedActiveSection = 'automation'
      } else if (scrollY < paymentsTop - offset) {
        computedActiveSection = 'integrations'
      } else if (scrollY < contactsTop - offset) {
        computedActiveSection = 'payments'
      } else if (scrollY < accountTop - offset) {
        computedActiveSection = 'contacts'
      } else {
        computedActiveSection = 'account'
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
      if (sections.includes(hash)) {
        const element = document.getElementById(hash)
        if (element) {
          // Scroll to the top of the page to ensure the "Settings" heading is always visible
          window.scrollTo({
            top: 0,
            behavior: 'auto'
          })
          // Let the scroll handler update the active section
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
    const header = document.querySelector('header') as HTMLElement | null
    const headerHeight = header ? header.offsetHeight : 0
    // Find the sticky settings header by looking for the sticky element with z-40
    const settingsHeader = document.querySelector('.sticky.z-40') as HTMLElement | null
    const settingsHeaderHeight = settingsHeader ? settingsHeader.offsetHeight : 0
    // Add extra padding for comfortable spacing
    return headerHeight + settingsHeaderHeight + 20
  }

  // Shared scroll-to-section helper
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      const offset = getScrollOffset()
      const elementPosition = element.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({
        top: elementPosition,
        behavior: 'smooth'
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
          <div className="min-h-screen bg-background dark:bg-background flex flex-col relative">
            <AppHeader title="Settings" />
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
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
        <div className="min-h-screen bg-background dark:bg-background flex flex-col relative">
          {/* Header */}
          <AppHeader title="Settings" />

            {/* Main Content */}
            <div className="flex-1 px-3 sm:px-4 lg:px-6 pb-20 bg-background dark:bg-background">
              <div className="max-w-[1400px] mx-auto">

            {/* Settings Header Block - Sticky */}
            <div className="sticky top-[64px] z-40 bg-background/95 dark:bg-background/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 shadow-sm pt-3 pb-3">
              {/* Page Header */}
              <div className="mb-4">
                <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-foreground mb-1">
                  Settings
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Manage your business settings and preferences.
                </p>
              </div>

              {/* Settings Navigation Tabs */}
              <div className="py-1">
                <nav ref={settingsTabsNavRef} className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                  <button
                    ref={(element) => { sectionTabRefs.current.general = element }}
                    onClick={() => handleSectionClick('general')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'general'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    General
                  </button>
                  <button
                    ref={(element) => { sectionTabRefs.current.automation = element }}
                    onClick={() => handleSectionClick('automation')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'automation'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Automation
                  </button>
                  <button
                    ref={(element) => { sectionTabRefs.current.integrations = element }}
                    onClick={() => handleSectionClick('integrations')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'integrations'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Integrations
                  </button>
                  <button
                    ref={(element) => { sectionTabRefs.current.payments = element }}
                    onClick={() => handleSectionClick('payments')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'payments'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Payments
                  </button>
                  <button
                    ref={(element) => { sectionTabRefs.current.contacts = element }}
                    onClick={() => handleSectionClick('contacts')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'contacts'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Contacts
                  </button>
                  <button
                    ref={(element) => { sectionTabRefs.current.account = element }}
                    onClick={() => handleSectionClick('account')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'account'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Account
                  </button>
              </nav>
              </div>
            </div>
            {/* Spacer to maintain consistent spacing */}
            <div className="mb-3"></div>

            {/* Settings Sections */}
            <div className="space-y-3 sm:space-y-4 pb-32">
              {/* Business Info Section */}
              <div id="general" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-slate-200/60 dark:border-slate-700/40 shadow-sm p-4 scroll-mt-[200px]">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1">Business Info</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Your business identity and contact details.</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={formBusiness.name || ''}
                      onChange={(e) => updateBusiness({ name: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-200/70 dark:border-slate-700/50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Business Phone Number
                    </label>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="tel"
                          value={formBusiness.business_phone_number || ''}
                          onChange={(e) => updateBusiness({ business_phone_number: e.target.value })}
                          placeholder="(555) 123-4567"
                          disabled={phoneCooldown?.inCooldown}
                          className="flex-1 px-3 py-2.5 border border-slate-200/70 dark:border-slate-700/50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                              ? 'Phone forwarding is verified.'
                              : 'Changing your phone number requires re-verifying forwarding.'}
                          </p>
                          <details className="group rounded-md border border-slate-200/60 dark:border-slate-700/50 bg-slate-50/70 dark:bg-slate-800/30 px-3 py-2">
                            <summary className="cursor-pointer list-none text-xs font-medium text-slate-700 dark:text-slate-300">
                              <span className="group-open:hidden">▸ Number guidance</span>
                              <span className="hidden group-open:inline">▾ Number guidance</span>
                            </summary>
                            <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                              <p>A dedicated business number gives the cleanest experience.</p>
                              <p>Personal business phones are supported. Use Ignored Contacts to keep known personal callers out of ReplyFlow.</p>
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
                </div>
              </div>

              {/* Telecom-dependent settings: only shown after the user starts a trial/subscription. */}
              {!hasActiveSubscription(business) ? (
                <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-5">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-foreground mb-1.5">Text Messaging & Automation</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                    Instant reply messages, business hours, spam filtering, and ignored contacts unlock
                    once you start your free trial. Your dedicated ReplyFlow number is set up
                    automatically right after activation.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500">
                    Use the Billing section below to start your 14-day free trial. No charge today.
                  </p>
                </div>
              ) : (
              <>
              {/* Messaging Settings */}
              <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-slate-200/60 dark:border-slate-700/40 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground">Text Message Settings</h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Customize missed-call replies.</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Instant Response Message
                    </label>
                    <textarea
                      value={formBusiness.auto_reply_message || ''}
                      onChange={(e) => updateBusiness({ auto_reply_message: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-200/70 dark:border-slate-700/50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all text-sm resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Automation Settings */}
              <div id="automation" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-slate-200/60 dark:border-slate-700/40 shadow-sm p-4 scroll-mt-[200px]">
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground">Instant Response Settings</h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Control automatic missed-call responses.</p>
                </div>
                
                <div className="space-y-2.5">
                  {/* Spam & Repeat Call Filtering */}
                  <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-md border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Spam & Repeat Call Filtering</h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Ignore spam and repeat callers before they become leads.
                        </p>
                      </div>
                      <button
                        onClick={handleToggleSpamFiltering}
                        disabled={isSavingSpamFiltering}
                        className={`relative inline-flex h-5 w-10 sm:h-6 sm:w-11 items-center rounded-full transition-all duration-300 flex-shrink-0 ${
                          spamFilteringEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-600 hover:bg-slate-500'
                        } ${isSavingSpamFiltering ? 'opacity-50 cursor-not-allowed' : ''}`}
                        aria-label={spamFilteringEnabled ? 'Disable spam filtering' : 'Enable spam filtering'}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 sm:h-4 sm:w-4 transform rounded-full bg-white transition-all duration-300 shadow-sm ${
                            spamFilteringEnabled ? 'translate-x-5 sm:translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Filtering Options - Only show when enabled */}
                    {spamFilteringEnabled && (
                      <div className="space-y-2 border-t border-border/70 pt-3">
                        {/* Repeat Call Protection */}
                        <div className="flex items-start justify-between p-3 bg-white/60 dark:bg-slate-800/30 rounded-lg border border-slate-200/40 dark:border-slate-700/30">
                          <div className="flex-1 pr-3 sm:pr-4">
                            <div className="flex items-center gap-2 mb-1 sm:mb-1.5">
                              <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">Prevent duplicate instant replies</h4>
                            </div>
                            <p className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground">
                              Avoid repeated texts to the same caller.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const newValue = !ignoreRepeatCalls
                              setIgnoreRepeatCalls(newValue)
                              updateAutomationSetting('ignoreRepeatCalls', newValue)
                            }}
                            disabled={isSaving}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-1 ${
                              ignoreRepeatCalls ? 'bg-blue-600' : 'bg-slate-600'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            aria-label={ignoreRepeatCalls ? 'Disable repeat call protection' : 'Enable repeat call protection'}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                ignoreRepeatCalls ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Private/Blocked Numbers */}
                        <div className="flex items-start justify-between p-3 bg-white/60 dark:bg-slate-800/30 rounded-lg border border-slate-200/40 dark:border-slate-700/30">
                          <div className="flex-1 pr-3 sm:pr-4">
                            <div className="flex items-center gap-2 mb-1 sm:mb-1.5">
                              <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">Skip blocked or hidden callers</h4>
                            </div>
                            <p className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground">
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
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-1 ${
                              ignoreBlockedPrivateNumbers ? 'bg-blue-600' : 'bg-slate-600'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            aria-label={ignoreBlockedPrivateNumbers ? 'Disable private number blocking' : 'Enable private number blocking'}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                ignoreBlockedPrivateNumbers ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Spam Detection */}
                        <div className="flex items-start justify-between p-2 sm:p-3 bg-white/60 dark:bg-slate-800/30 rounded-xl border border-slate-200/50 dark:border-slate-700/30">
                          <div className="flex-1 pr-3 sm:pr-4">
                            <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                              <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">Skip suspected spam callers</h4>
                            </div>
                            <p className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground">
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
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-1 ${
                              ignoreSuspectedSpamCallers ? 'bg-blue-600' : 'bg-gray-600'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            aria-label={ignoreSuspectedSpamCallers ? 'Disable spam detection' : 'Enable spam detection'}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                ignoreSuspectedSpamCallers ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Business Hours */}
                  <div className="p-3 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 pr-3 sm:pr-4">
                        <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                          <h3 className="text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground">Business Hours Only</h3>
                          {formBusiness.business_hours_enabled && (
                            <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1">
                              <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground mb-0.5 sm:mb-1">
                          Send different replies inside and outside business hours.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          updateBusiness({ business_hours_enabled: !formBusiness.business_hours_enabled })
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                          formBusiness.business_hours_enabled ? 'bg-blue-600' : 'bg-gray-600'
                        }`}
                        aria-label={formBusiness.business_hours_enabled ? 'Disable business hours' : 'Enable business hours'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            formBusiness.business_hours_enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    
                    {/* Timezone and Hours Selector */}
                    {formBusiness.business_hours_enabled && (
                      <div className="mt-3 pt-3 border-t border-border/70 space-y-3">
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
                        <div className="grid grid-cols-2 gap-3">
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
                        <div className="mt-3 pt-3 border-t border-border">
                          <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                            After Hours Message
                          </label>
                          <textarea
                            value={formBusiness.after_hours_message?.trim() ? formBusiness.after_hours_message : DEFAULT_AFTER_HOURS_MESSAGE}
                            onChange={(e) => updateBusiness({ after_hours_message: e.target.value })}
                            rows={2}
                            className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all text-xs sm:text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50 resize-none"
                          />
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                            {`{{business_name}}`} inserts your business name.
                          </p>
                          {formBusiness.business_hours_enabled && !formBusiness.after_hours_message?.trim() && (
                            <div className="flex items-start gap-2 mt-2 px-2 py-1.5 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
                              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              <div className="text-xs text-blue-800 dark:text-blue-200">
                                You're using ReplyFlow's default after-hours message. Edit the message above to customize it.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Out of Office Mode */}
                  <div className={`overflow-hidden rounded-xl border transition-all duration-300 ${
                    formBusiness.out_of_office_enabled
                      ? 'border-blue-200/70 bg-blue-50/50 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/10'
                      : 'border-slate-200/60 bg-slate-50/80 dark:border-slate-700/40 dark:bg-slate-800/40'
                  }`}>
                    <div className="flex items-start justify-between gap-4 p-3 sm:p-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Out of Office</h3>
                          {(() => {
                            const now = new Date()
                            const start = formBusiness.out_of_office_start ? new Date(formBusiness.out_of_office_start) : null
                            const end = formBusiness.out_of_office_end ? new Date(formBusiness.out_of_office_end) : null
                            const isEnabled = formBusiness.out_of_office_enabled

                            if (!isEnabled) {
                              return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Off</span>
                            }

                            if (start && now < start) {
                              return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Scheduled</span>
                            } else if (end && now > end) {
                              return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">Expired</span>
                            } else if (start && end && now >= start && now <= end) {
                              return <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">Active</span>
                            }
                            return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">On</span>
                          })()}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Automatically reply while you're away.</p>
                        {formBusiness.out_of_office_enabled && (
                          <div className="mt-3 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <span className="font-medium">
                              {formatOutOfOfficeDate(formBusiness.out_of_office_start, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="font-medium">
                              {formatOutOfOfficeDate(formBusiness.out_of_office_end, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const newEnabled = !formBusiness.out_of_office_enabled
                          updateBusiness({ out_of_office_enabled: newEnabled })
                          // If enabling and message is empty, set default message
                          if (newEnabled && !formBusiness.out_of_office_message) {
                            updateBusiness({ out_of_office_message: DEFAULT_OUT_OF_OFFICE_MESSAGE })
                          }
                        }}
                        disabled={isSaving}
                        className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2 focus:ring-offset-background ${
                          formBusiness.out_of_office_enabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-600 hover:bg-slate-500'
                        } ${isSaving ? 'cursor-not-allowed opacity-50' : 'active:scale-[0.98]'}`}
                        aria-label={formBusiness.out_of_office_enabled ? 'Disable Out of Office' : 'Enable Out of Office'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-300 ${
                            formBusiness.out_of_office_enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className={`grid transition-all duration-300 ease-out ${formBusiness.out_of_office_enabled ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="space-y-4 border-t border-blue-200/60 p-3 sm:p-4 dark:border-slate-700/60">
                          <div>
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-foreground">Vacation Schedule</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Choose when this reply starts and ends.</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                              <label 
                                className="group relative cursor-pointer rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-sm transition-all hover:border-blue-300 hover:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-700/60 dark:bg-slate-900/40 dark:hover:border-blue-700"
                                onClick={() => {
                                  outOfOfficeStartRef.current?.focus()
                                  if (outOfOfficeStartRef.current && 'showPicker' in outOfOfficeStartRef.current) {
                                    (outOfOfficeStartRef.current as any).showPicker()
                                  }
                                }}
                              >
                                <span className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                  <span>📅</span>
                                  Starts
                                </span>
                                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {formatOutOfOfficeDate(formBusiness.out_of_office_start, { month: 'short', day: 'numeric' })}
                                </span>
                                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                                  {formatOutOfOfficeTime(formBusiness.out_of_office_start) || 'Select a time'}
                                </span>
                                <input
                                  ref={outOfOfficeStartRef}
                                  type="datetime-local"
                                  value={toDateTimeLocal(formBusiness.out_of_office_start)}
                                  onChange={(e) => updateBusiness({ out_of_office_start: e.target.value || null })}
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                  aria-label="Out of office start date and time"
                                />
                              </label>

                              <label 
                                className="group relative cursor-pointer rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-sm transition-all hover:border-blue-300 hover:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-700/60 dark:bg-slate-900/40 dark:hover:border-blue-700"
                                onClick={() => {
                                  outOfOfficeEndRef.current?.focus()
                                  if (outOfOfficeEndRef.current && 'showPicker' in outOfOfficeEndRef.current) {
                                    (outOfOfficeEndRef.current as any).showPicker()
                                  }
                                }}
                              >
                                <span className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                  <span>📅</span>
                                  Ends
                                </span>
                                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {formatOutOfOfficeDate(formBusiness.out_of_office_end, { month: 'short', day: 'numeric' })}
                                </span>
                                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                                  {formatOutOfOfficeTime(formBusiness.out_of_office_end) || 'Select a time'}
                                </span>
                                <input
                                  ref={outOfOfficeEndRef}
                                  type="datetime-local"
                                  value={toDateTimeLocal(formBusiness.out_of_office_end)}
                                  onChange={(e) => updateBusiness({ out_of_office_end: e.target.value || null })}
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                  aria-label="Out of office end date and time"
                                />
                              </label>
                            </div>
                            {formBusiness.out_of_office_start && formBusiness.out_of_office_end && new Date(formBusiness.out_of_office_end) <= new Date(formBusiness.out_of_office_start) && (
                              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                                End date/time must be after start date/time
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-900 dark:text-foreground">
                              Response Message
                            </label>
                            <textarea
                              value={formBusiness.out_of_office_message || ''}
                              onChange={(e) => updateBusiness({ out_of_office_message: e.target.value })}
                              rows={3}
                              placeholder=""
                              className="w-full resize-none rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2.5 text-sm text-slate-900 transition-all hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-foreground dark:hover:border-slate-600"
                            />
                            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                              Supports {'{'}{'{'}business_name{'}'}{'}'} and {'{'}{'{'}return_date{'}'}{'}'}.
                            </p>
                          </div>

                          <div>
                            <div className="mb-1.5 flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-foreground">Customer Preview</h4>
                            </div>
                            <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/50">
                              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-sm dark:bg-blue-950/40">💬</span>
                                ReplyFlow message
                              </div>
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                                {(formBusiness.out_of_office_message || DEFAULT_OUT_OF_OFFICE_MESSAGE)
                                  .replace(/\{\{business_name\}\}/gi, formBusiness.name || 'your business')
                                  .replace(/\{\{return_date\}\}/gi, formBusiness.out_of_office_end 
                                    ? new Date(formBusiness.out_of_office_end).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                                    : 'No return schedule selected.'
                                  )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Automatic Follow-Ups */}
                  <div className="p-3 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-slate-900 dark:text-foreground">Automatic Follow-Ups</h3>
                          <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full font-medium">
                            New
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Schedule follow-up texts for quiet leads.
                        </p>
                      </div>
                      <Link
                        href="/dashboard/settings/follow-ups"
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        Configure
                        <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>

                  {/* Automation Status Summary */}
                  <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-slate-600 dark:text-slate-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-2">Operational Status</h4>
                        <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-1.5">
                          {getAutomationSettings().spamRepeatFilteringEnabled && (
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0"></span>
                              <span>Spam filtering active</span>
                            </div>
                          )}
                          {getAutomationSettings().ignoreRepeatCalls && (
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0"></span>
                              <span>Duplicate reply prevention enabled</span>
                            </div>
                          )}
                          {getAutomationSettings().ignoreBlockedPrivateNumbers && (
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0"></span>
                              <span>Blocked/private callers filtered</span>
                            </div>
                          )}
                          {getAutomationSettings().ignoreSuspectedSpamCallers && (
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0"></span>
                              <span>Spam detection enabled</span>
                            </div>
                          )}
                          {formBusiness.business_hours_enabled && (
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0"></span>
                              <span>Business hours enforced</span>
                            </div>
                          )}
                          {!getAutomationSettings().spamRepeatFilteringEnabled && !formBusiness.business_hours_enabled && (
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full flex-shrink-0"></span>
                              <span>Respond to missed calls - enable settings above to activate automation</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Integrations Section */}
              <div id="integrations" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-slate-200/60 dark:border-slate-700/40 shadow-sm p-4 scroll-mt-[200px]">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1">Integrations</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Connect services you already use.</p>
                
                {/* Google Calendar Card */}
                <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-md border border-slate-200/60 dark:border-slate-700/40">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2.5 mb-1">
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Google Calendar</h3>
                        {calendarConnected && (
                          <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1">
                            <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        View appointments alongside ReplyFlow jobs.
                      </p>
                      {calendarConnected && calendarEmail && (
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1.5">
                          Connected as: {calendarEmail}
                        </p>
                      )}
                      {calendarConnected && lastSyncTime && (
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                          Last synced: {formatTimeAgo(lastSyncTime)}
                        </p>
                      )}
                    </div>
                    {!isLoadingCalendar && (
                      <button
                        onClick={calendarConnected ? handleDisconnectCalendar : handleConnectCalendar}
                        disabled={isConnectingCalendar || isDisconnectingCalendar}
                        className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                          calendarConnected
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isConnectingCalendar || isDisconnectingCalendar ? (
                          <>
                            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018 8v4h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>Processing...</span>
                          </>
                        ) : (
                          <span>{calendarConnected ? 'Disconnect' : 'Connect'}</span>
                        )}
                      </button>
                    )}
                  </div>
                  {!calendarConnected && (
                    <div className="mt-3 p-2.5 bg-blue-50/70 dark:bg-blue-900/15 border border-blue-200/70 dark:border-blue-800/60 rounded-lg">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Coming soon: automatic event creation.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div id="payments" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-slate-200/60 dark:border-slate-700/40 shadow-sm p-4 scroll-mt-[200px]">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1">Payments</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Connect payment methods for customer requests.
                </p>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <div className="flex flex-col h-full p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-md border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <svg className="w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 003-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Stripe</h3>
                          <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                            Recommended
                          </span>
                          {business?.stripe_charges_enabled && business?.stripe_details_submitted ? (
                            <span className="text-xs px-2.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1.5">
                              <span className="w-1 h-1 bg-green-500 rounded-full" />
                              Connected
                            </span>
                          ) : (
                            <span className="text-xs px-2.5 py-0.5 bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 rounded-full font-medium">
                              Not Connected
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          Accept secure card payments.
                        </p>
                      </div>
                      {!isConnectingStripe && (
                        <button
                          onClick={handleConnectStripe}
                          disabled={isConnectingStripe || isStripeConnectUnavailable}
                          className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                            business?.stripe_charges_enabled && business?.stripe_details_submitted
                              ? 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'
                              : isStripeConnectUnavailable
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {business?.stripe_charges_enabled && business?.stripe_details_submitted ? 'Manage' : isStripeConnectUnavailable ? 'Unavailable' : 'Connect'}
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
                            <span className="font-semibold">Setup in progress:</span> Complete Stripe onboarding to accept card payments.
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

                  <div className="flex flex-col h-full p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-md border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <svg className="w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                        </svg>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">Venmo</h3>
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
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
                        Accept Venmo payments by username.
                      </p>
                    </div>
                    <div className="mt-auto">
                      <label className="block text-xs font-medium text-slate-900 dark:text-foreground mb-1.5">
                        Venmo Username
                      </label>
                      <input
                        type="text"
                        value={formBusiness.venmo_username || ''}
                        onChange={(e) => updateBusiness({ venmo_username: e.target.value })}
                        placeholder="joesplumbing"
                        className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all text-xs sm:text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                        With or without @.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col h-full p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-md border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <svg className="w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z"/>
                        </svg>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">PayPal</h3>
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
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
                        Accept PayPal payments by link.
                      </p>
                    </div>
                    <div className="mt-auto">
                      <label className="block text-xs font-medium text-slate-900 dark:text-foreground mb-1.5">
                        Your PayPal.Me Link
                      </label>
                      <input
                        type="text"
                        value={formBusiness.paypal_payment_link || ''}
                        onChange={(e) => updateBusiness({ paypal_payment_link: e.target.value })}
                        placeholder="https://paypal.me/yourbusiness"
                        className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all text-xs sm:text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                        Example: https://paypal.me/joesplumbing
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-2.5 bg-blue-50/70 dark:bg-blue-900/15 border border-blue-200/70 dark:border-blue-800/60 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Choose a payment method when sending a request.
                  </p>
                </div>
              </div>

              {/* Ignored Contacts Section */}
              <div id="contacts" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-slate-200/60 dark:border-slate-700/40 shadow-sm p-4 scroll-mt-[200px]">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1">Ignored Contacts</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Keep non-customer calls out of ReplyFlow.</p>
                  </div>
                  <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="h-9 px-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors text-xs"
                  >
                    + Add
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="h-9 px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-md transition-colors text-xs"
                  >
                    Import
                  </button>
                </div>
                </div>
                <details className="group rounded-md border border-blue-200/60 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-900/10 px-3 py-2 mb-2">
                  <summary className="cursor-pointer list-none text-xs font-medium text-blue-800 dark:text-blue-200">
                    <span className="group-open:hidden">▸ Personal phone guidance</span>
                    <span className="hidden group-open:inline">▾ Personal phone guidance</span>
                  </summary>
                  <div className="mt-2 space-y-1.5 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    <p>Personal business phones are supported.</p>
                    <p>Add personal callers here when you want ReplyFlow to stay out.</p>
                  </div>
                </details>
                <details className="group rounded-md border border-slate-200/60 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/30 px-3 py-2 mb-3">
                  <summary className="cursor-pointer list-none text-xs font-medium text-slate-700 dark:text-slate-300">
                    <span className="group-open:hidden">▸ When to use ignored contacts</span>
                    <span className="hidden group-open:inline">▾ When to use ignored contacts</span>
                  </summary>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">On the list</p>
                      <p>No AI Voice, texts, lead, or follow-ups.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Off the list</p>
                      <p>Treated like a customer.</p>
                    </div>
                  </div>
                </details>
                <div className="space-y-2 sm:space-y-2.5">
                  {isLoadingIgnored ? (
                    <div className="flex items-center justify-center py-4 sm:py-6">
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-blue-600"></div>
                    </div>
                  ) : ignoredContacts.length === 0 ? (
                    <div className="text-center py-5 sm:py-6 bg-slate-50/50 dark:bg-slate-800/30 rounded-md border border-slate-200/60 dark:border-slate-700/60">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <h3 className="text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1">No ignored contacts yet</h3>
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 max-w-[220px] sm:max-w-[280px] mx-auto leading-relaxed">
                        Add numbers ReplyFlow should ignore.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 sm:space-y-2">
                      {ignoredContacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between p-2 sm:p-2.5 bg-muted/40 rounded-lg border border-border/60 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 sm:gap-2.5 mb-1">
                              <span className="text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground">
                                {formatPhoneNumber(contact.phone_number)}
                              </span>
                              {contact.label && (
                                <span className="text-[10px] sm:text-[11px] px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full font-medium">
                                  {contact.label}
                                </span>
                              )}
                              {contact.type && (
                                <span className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full font-medium ${
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
                            className="ml-2 sm:ml-3 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors"
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

              {/* Account Section - Merged Profile and Account Access */}
              <div id="account" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 scroll-mt-[200px]">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1">Account</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Your account details and status.</p>
                <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-md border border-slate-200/60 dark:border-slate-700/40 overflow-hidden">
                  {/* Email */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border-b border-slate-200/60 dark:border-slate-700/40 last:border-b-0">
                    <div className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 00-2-2H7a2 2 0 00-2 2z" />
                      </svg>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Email</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-foreground">{user?.email}</span>
                  </div>

                  {/* Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border-b border-slate-200/60 dark:border-slate-700/40 last:border-b-0">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        isInTrialPeriod(business?.subscription_status) 
                          ? 'bg-blue-500' 
                          : hasActiveSubscription(business)
                            ? 'bg-green-500'
                            : 'bg-amber-500'
                      }`}></div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Status</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-foreground">{getSubscriptionStatusText(business?.subscription_status)}</span>
                  </div>

                  {/* Access Status */}
                  {(() => {
                    const manualStatus = getManualAccessStatus(business)
                    const accessInfo = getManualAccessDisplayInfo(business)
                    
                    return (
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 p-3 sm:p-4 last:border-b-0">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-2.5 h-2.5 rounded-full ${
                            manualStatus.hasManualAccess && accessInfo.status === 'active' 
                              ? 'bg-green-500' 
                              : manualStatus.hasManualAccess && accessInfo.status === 'expired'
                                ? 'bg-red-500'
                                : 'bg-slate-400'
                          }`}></div>
                          <span className={`text-xs sm:text-sm font-medium ${
                            manualStatus.hasManualAccess && accessInfo.status === 'active' 
                              ? 'text-green-600 dark:text-green-400'
                              : manualStatus.hasManualAccess && accessInfo.status === 'expired'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-600 dark:text-slate-400'
                          }`}>
                            Access Status
                          </span>
                        </div>
                        <div className="flex flex-col items-start sm:items-end">
                          <span className={`text-xs sm:text-sm font-semibold ${
                            manualStatus.hasManualAccess && accessInfo.status === 'active' 
                              ? 'text-green-900 dark:text-green-100'
                              : manualStatus.hasManualAccess && accessInfo.status === 'expired'
                                ? 'text-red-900 dark:text-red-100'
                                : 'text-slate-900 dark:text-foreground'
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
                            <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Until {new Date(manualStatus.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                          {!manualStatus.expiresAt && manualStatus.hasManualAccess && (
                            <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Lifetime access
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Subscription & Billing Section */}
              <div id="subscription" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-4 scroll-mt-[220px]">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground mb-1 sm:mb-2">Subscription & Billing</h2>
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-3 sm:mb-4">Manage your subscription and billing.</p>
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/40 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-lg border border-blue-200/60 dark:border-blue-800/50 p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-3 sm:gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 sm:gap-2.5 mb-1.5">
                          <h4 className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-100">Current Plan</h4>
                          <span className={`text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${
                            isInTrialPeriod(business?.subscription_status) 
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                              : hasActiveSubscription(business)
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          }`}>
                            {getSubscriptionStatusText(business?.subscription_status)}
                          </span>
                        </div>
                        <p className="text-sm sm:text-base font-black text-slate-900 dark:text-foreground">
                          {isInTrialPeriod(business?.subscription_status)
                            ? `ReplyFlow — ${getPricingDisplay()}`
                            : getPricingDisplay()}
                        </p>
                        <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                          {isInTrialPeriod(business?.subscription_status) && business?.trial_ends_at
                            ? `Your free trial ends on ${new Date(business.trial_ends_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}. You won't be charged until then.`
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
                          <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 text-right">
                            Billing not required
                          </p>
                        ) : (
                          <button
                            onClick={() => handleBillingActionClick('portal')}
                            disabled={isOpeningPortal}
                            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
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
                  </div>
                  {needsUpgrade(business?.subscription_status) && !getManualAccessStatus(business).hasManualAccess && (
                    <button
                      onClick={() => handleBillingActionClick('upgrade')}
                      disabled={isStartingCheckout}
                      className="w-full px-4 py-2.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
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
              </div>

              {/* Security Section */}
              <div id="security" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-4 scroll-mt-[220px]">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground mb-1 sm:mb-2">Security</h2>
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-3 sm:mb-4">Manage your account security and access.</p>
                <div className="space-y-2 sm:space-y-2.5">
                  {/* Change Password Section */}
                  <div className="bg-slate-50/60 dark:bg-slate-800/30 rounded-lg border border-slate-200/50 dark:border-slate-700/30 p-3 sm:p-4">
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground mb-1.5 sm:mb-2">Change Password</h3>
                      <button
                        onClick={() => setShowChangePasswordModal(true)}
                        className="mt-1 sm:mt-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                      >
                        Change Password
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Danger Zone Section */}
              <div className="mt-6 sm:mt-8">
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mb-2 sm:mb-3 uppercase tracking-wider">Danger Zone</p>
                <div className="bg-red-50/60 dark:bg-red-900/20 rounded-xl border border-red-200/50 dark:border-red-800/30 p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-red-700/80 dark:text-red-300/80 mb-3 sm:mb-4">
                    Permanent destructive actions that cannot be undone.
                  </p>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-red-900 dark:text-red-100 mb-1.5 sm:mb-2">Delete Account</h3>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-red-600 hover:bg-red-700 text-white"
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
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl max-w-lg w-full max-h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] sm:max-h-[85vh] flex flex-col shadow-2xl">
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
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                    <div className="relative">
                      <label className="block text-sm text-slate-900 dark:text-foreground mb-2">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showDeletePassword ? 'text' : 'password'}
                          value={deletePassword}
                          onChange={(e) => {
                            setDeletePassword(e.target.value)
                            setDeletePasswordError('')
                          }}
                          placeholder="Enter your current password"
                          disabled={isDeleting}
                          className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:border-red-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-50 ${
                            deletePasswordError 
                              ? 'border-red-500 focus:ring-red-500' 
                              : 'border-slate-200/70 dark:border-slate-700/50 focus:ring-red-500/40 focus:border-red-500/80'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowDeletePassword(!showDeletePassword)}
                          disabled={isDeleting}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {showDeletePassword ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
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
                      className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || !deletePassword.trim() || isDeleting}
                      className="px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

          {/* Add Ignored Contact Modal */}
          {showAddModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-4">
              <div className="bg-card rounded-lg max-w-md w-full max-h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] sm:max-h-[85vh] flex flex-col overflow-hidden">
                <div className="flex-shrink-0 p-4 sm:p-6 border-b border-border/60">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-foreground mb-4">
                    Add Ignored Contact
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-muted-foreground">
                    Add people here when you never want ReplyFlow to respond to their missed calls. Friends, family, schools, doctors, and other personal contacts are common examples. When an ignored contact calls, ReplyFlow stays out of the conversation (no AI Voice, no automated texts, no lead, no follow-ups—just a simple voicemail). You can remove contacts from this list at any time.
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
                      Label
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground"
                      placeholder="Optional label (e.g., 'John Doe')"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-900 dark:text-foreground mb-2">
                      Type
                    </label>
                    <select
                      value={contactType}
                      onChange={(e) => setContactType(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-slate-900 dark:text-foreground"
                    >
                      <option value="spam">Spam</option>
                      <option value="personal">Personal</option>
                      <option value="employee">Employee</option>
                      <option value="vendor">Vendor</option>
                      <option value="existing_customer">Existing Customer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-900 dark:text-foreground mb-2">
                      Notes/Reason
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground resize-none"
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
                <div className="flex-shrink-0 flex justify-end gap-3 p-4 sm:p-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 border-t border-border/60">
                  <button
                    onClick={() => {
                      setShowAddModal(false)
                      setPhoneNumber('')
                      setLabel('')
                      setContactType('spam')
                      setReason('')
                    }}
                    disabled={isAdding}
                    className="px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddIgnoredContact}
                    disabled={isAdding || !phoneNumber.trim()}
                    className="px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white"
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
                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      New Password
                    </label>
                    <PasswordInput
                      id="newPassword"
                      name="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="w-full px-3 py-2.5 border border-slate-200/70 dark:border-slate-700/50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm"
                      placeholder="Enter new password"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Must be at least 8 characters long
                    </p>
                  </div>

                  <div>
                    <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Confirm New Password
                    </label>
                    <PasswordInput
                      id="confirmNewPassword"
                      name="confirmNewPassword"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="w-full px-3 py-2.5 border border-slate-200/70 dark:border-slate-700/50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm"
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 p-4 border-t border-slate-200/70 dark:border-slate-700/50">
                  <button
                    onClick={() => {
                      setShowChangePasswordModal(false)
                      setNewPassword('')
                      setConfirmNewPassword('')
                      setPasswordError('')
                    }}
                    disabled={isChangingPassword}
                    className="px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangePassword}
                    disabled={isChangingPassword || !newPassword.trim() || !confirmNewPassword.trim()}
                    className="px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isChangingPassword ? (
                      <>
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent border-solid inline-block mr-2"></div>
                        Updating...
                      </>
                    ) : (
                      'Update Password'
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
            onImportSuccess={() => {
              fetchIgnoredContacts()
              showToast('Contacts imported successfully', 'success')
            }}
          />

          {/* Calendar Disconnect Confirmation Modal */}
          <ConfirmModal
            isOpen={isCalendarDisconnectConfirmOpen}
            onClose={() => setIsCalendarDisconnectConfirmOpen(false)}
            onConfirm={handleDisconnectCalendarConfirmed}
            title="Disconnect Google Calendar?"
            description="Your Google Calendar will stop syncing with ReplyFlow. This will NOT delete any events already on your calendar. You can reconnect at any time."
            confirmText="Disconnect"
            cancelText="Cancel"
            isDestructive={true}
            isLoading={isDisconnectingCalendar}
          />

          {/* Toast Container */}
          <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
        </div>
      </BusinessGuard>
    </AuthGuard>
    <BottomNavigation />
    </DashboardErrorBoundary>
  )
}
