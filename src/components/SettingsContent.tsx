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
import MobileMenu from '@/components/MobileMenu'
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
import { CreditCard, Mail, MessageSquare, Trash2, AlertTriangle, FileText, Clock, CheckCircle } from 'lucide-react'

export default function SettingsContent() {
  const router = useRouter()
  const { business, refreshBusiness } = useBusiness()
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

  // Default out of office message
  const DEFAULT_OUT_OF_OFFICE_MESSAGE = "Thanks for contacting {{business_name}}. We are currently out of office and responses may be delayed. Please provide details about what you need and we will get back to you as soon as possible."

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

  // Business phone number change state
  const [showPhoneChangeModal, setShowPhoneChangeModal] = useState(false)
  const [newPhoneNumber, setNewPhoneNumber] = useState('')
  const [isChangingPhone, setIsChangingPhone] = useState(false)
  const [phoneChangeError, setPhoneChangeError] = useState('')
  const [phoneCooldown, setPhoneCooldown] = useState<{ inCooldown: boolean; nextAvailableDate: string | null } | null>(null)

  // Stripe Connect state
  const [isConnectingStripe, setIsConnectingStripe] = useState(false)

  const supabase = createBrowserClient()

  // Time input refs for better UX
  const openTimeInputRef = useRef<HTMLInputElement>(null)
  const closeTimeInputRef = useRef<HTMLInputElement>(null)

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
        automation_settings: automationSettings
      }

      // Log Out of Office save attempt
      const hasOutOfOfficeFields = (
        'out_of_office_enabled' in updatePayload ||
        'out_of_office_start' in updatePayload ||
        'out_of_office_end' in updatePayload ||
        'out_of_office_message' in updatePayload
      )

      const { error } = await supabase
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
    },
    onBusinessUpdated: (updatedBusiness) => {
      // Set save success state when business is updated after successful save
      setSaveSuccess(true)
      refreshBusiness()
      showToast('Settings saved successfully', 'success')
    }
  })

  // Toast functions
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    // Use stable ID for settings success toast to prevent duplicates
    const stableId = message === 'Settings saved successfully' && type === 'success' 
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
    
    if (!business?.automation_settings) {
      return defaults
    }
    
    return { ...defaults, ...business.automation_settings }
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
  const handleToggleSpamFiltering = async () => {
    const newValue = !spamFilteringEnabled
    
    // Immediate visual feedback
    setSpamFilteringEnabled(newValue)
    
    // Update form state
    updateAutomationSetting('spamRepeatFilteringEnabled', newValue)
    
    // Persist to Supabase
    setIsSavingSpamFiltering(true)
    try {
      await saveChanges()
    } catch (error) {
      // Revert on error
      setSpamFilteringEnabled(!newValue)
      updateAutomationSetting('spamRepeatFilteringEnabled', !newValue)
      showToast('Failed to update spam filtering setting', 'error')
    } finally {
      setIsSavingSpamFiltering(false)
    }
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
    if (!confirm('Disconnect Google Calendar? This will stop syncing your calendar events with ReplyFlow.')) {
      return
    }

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

  // Handle phone number change
  const handleChangePhoneNumber = async () => {
    if (!business?.id || !newPhoneNumber.trim()) {
      setPhoneChangeError('Phone number is required')
      return
    }

    setIsChangingPhone(true)
    setPhoneChangeError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/business/update-phone-number', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          businessId: business.id,
          newPhoneNumber: newPhoneNumber.trim(),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'We couldn\'t change your phone number. Please try again.')
      }

      const data = await response.json()
      
      if (data.success) {
        showToast('Phone number changed successfully', 'success')
        setShowPhoneChangeModal(false)
        setNewPhoneNumber('')
        refreshBusiness()
        // Check cooldown again
        checkPhoneCooldown()
      } else {
        throw new Error(data.error || 'We couldn\'t change your phone number. Please try again.')
      }
    } catch (error) {
      console.error('[Settings] Error changing phone number:', error)
      setPhoneChangeError(error instanceof Error ? error.message : 'We couldn\'t change your phone number. Please try again.')
    } finally {
      setIsChangingPhone(false)
    }
  }

  // Handle Stripe Connect onboarding
  const handleConnectStripe = async () => {
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
      // Initialize spam filtering state from business data
      const settings = getAutomationSettings()
      setSpamFilteringEnabled(settings.spamRepeatFilteringEnabled)
      // Initialize automation settings local state
      setIgnoreRepeatCalls(settings.ignoreRepeatCalls)
      setIgnoreBlockedPrivateNumbers(settings.ignoreBlockedPrivateNumbers)
      setIgnoreSuspectedSpamCallers(settings.ignoreSuspectedSpamCallers)
      // Fetch calendar status
      fetchCalendarStatus()
      // Check phone cooldown status
      checkPhoneCooldown()
    }
  }, [business, user])

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
            <div className="sticky top-[64px] z-40 bg-background/95 dark:bg-background/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 shadow-sm pt-4 pb-4 sm:pb-5 md:pb-6">
              {/* Page Header */}
              <div className="mb-4 sm:mb-5 md:mb-6">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground mb-1.5 sm:mb-2">
                  Settings
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
                  Manage your business settings and automation preferences.
                </p>
              </div>

              {/* Settings Navigation Tabs - Improved mobile touch targets */}
              <div className="py-2 sm:py-2.5">
                <nav className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide">
                  <button
                    onClick={() => handleSectionClick('general')}
                    className={`px-3 sm:px-4 py-2.5 sm:py-2.5 text-xs sm:text-sm font-medium rounded-md sm:rounded-xl transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'general'
                        ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-600/20'
                        : 'text-slate-400 hover:text-foreground hover:bg-slate-800/50'
                    }`}
                  >
                    General
                  </button>
                  <button
                    onClick={() => handleSectionClick('automation')}
                    className={`px-3 sm:px-4 py-2.5 sm:py-2.5 text-xs sm:text-sm font-medium rounded-md sm:rounded-xl transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'automation'
                        ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-600/20'
                        : 'text-slate-400 hover:text-foreground hover:bg-slate-800/50'
                    }`}
                  >
                    Automation
                  </button>
                  <button
                    onClick={() => handleSectionClick('integrations')}
                    className={`px-3 sm:px-4 py-2.5 sm:py-2.5 text-xs sm:text-sm font-medium rounded-md sm:rounded-xl transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'integrations'
                        ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-600/20'
                        : 'text-slate-400 hover:text-foreground hover:bg-slate-800/50'
                    }`}
                  >
                    Integrations
                  </button>
                  <button
                    onClick={() => handleSectionClick('payments')}
                    className={`px-3 sm:px-4 py-2.5 sm:py-2.5 text-xs sm:text-sm font-medium rounded-md sm:rounded-xl transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'payments'
                        ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-600/20'
                        : 'text-slate-400 hover:text-foreground hover:bg-slate-800/50'
                    }`}
                  >
                    Payments
                  </button>
                  <button
                    onClick={() => handleSectionClick('contacts')}
                    className={`px-3 sm:px-4 py-2.5 sm:py-2.5 text-xs sm:text-sm font-medium rounded-md sm:rounded-xl transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'contacts'
                        ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-600/20'
                        : 'text-slate-400 hover:text-foreground hover:bg-slate-800/50'
                    }`}
                  >
                    Contacts
                  </button>
                  <button
                    onClick={() => handleSectionClick('account')}
                    className={`px-3 sm:px-4 py-2.5 sm:py-2.5 text-xs sm:text-sm font-medium rounded-md sm:rounded-xl transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                      activeSection === 'account'
                        ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-600/20'
                        : 'text-slate-400 hover:text-foreground hover:bg-slate-800/50'
                    }`}
                  >
                    Account
                  </button>
              </nav>
              </div>
            </div>
            {/* Spacer to maintain consistent spacing */}
            <div className="mb-4 sm:mb-6 md:mb-8"></div>

            {/* Settings Sections */}
            <div className="space-y-6 sm:space-y-8 pb-40">
              {/* Business Info Section */}
              <div id="general" className="bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-5 sm:p-8 scroll-mt-[220px]">
                <div className="mb-8">
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">Business Info</h2>
                  <p className="text-sm text-slate-400">Your business identity and contact information.</p>
                </div>
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={formBusiness.name || ''}
                      onChange={(e) => updateBusiness({ name: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-slate-800/40 text-foreground placeholder:text-muted-foreground transition-all text-sm hover:border-slate-600/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
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
                          className="flex-1 px-4 py-3 border border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-slate-800/40 text-foreground placeholder:text-muted-foreground transition-all text-sm hover:border-slate-600/50 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button
                          onClick={() => {
                            setNewPhoneNumber(formBusiness.business_phone_number || '')
                            setShowPhoneChangeModal(true)
                          }}
                          disabled={phoneCooldown?.inCooldown}
                          className="px-4 py-3 bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          Change
                        </button>
                      </div>
                      
                      {phoneCooldown?.inCooldown && phoneCooldown.nextAvailableDate && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <div className="flex-1">
                            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-1">
                              Phone number change on cooldown
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300">
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
                        <div className="space-y-3">
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {business?.forwarding_verified ? (
                              <>
                                Phone forwarding is verified and working correctly. No action is needed unless you change your carrier or forwarding settings.
                              </>
                            ) : (
                              <>
                                Changing your business phone number requires updating your call forwarding settings. After saving, ReplyFlow will guide you through re-verifying forwarding so missed calls continue to be captured.
                              </>
                            )}
                          </p>
                          {/* Personal/Business Number Guidance */}
                          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              <div>
                                <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">Best experience: Dedicated business number</p>
                                <p className="text-[10px] text-blue-700 dark:text-blue-300 mb-2">
                                  A dedicated business phone number provides the best experience. It allows ReplyFlow to automatically handle every missed customer call without affecting personal callers.
                                </p>
                                <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">Still fully supported: Personal business phones</p>
                                <p className="text-[10px] text-blue-700 dark:text-blue-300 mb-1">
                                  If you use one phone for both business and personal calls, ReplyFlow still works well. You can use Ignored Contacts to keep known personal callers out of the normal ReplyFlow customer workflow.
                                </p>
                                <p className="text-[10px] text-blue-700 dark:text-blue-300">
                                  See the Ignored Contacts section below for more information.
                                </p>
                              </div>
                            </div>
                          </div>
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
                <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-3 sm:p-5">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-1.5">Text Messaging & Automation</h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-2">
                    Instant reply messages, business hours, spam filtering, and ignored contacts unlock
                    once you start your free trial. Your dedicated ReplyFlow number is set up
                    automatically right after activation.
                  </p>
                  <p className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground">
                    Use the Billing section below to start your 14-day free trial. No charge today.
                  </p>
                </div>
              ) : (
              <>
              {/* Messaging Settings */}
              <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-2 sm:p-3.5">
                <div className="flex items-center justify-between mb-0.5">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground">Text Message Settings</h2>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-2">Customize automatic text responses for missed calls.</p>
                <div className="space-y-1 sm:space-y-1.5">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-0.5">
                      Instant Response Message
                    </label>
                    <textarea
                      value={formBusiness.auto_reply_message || ''}
                      onChange={(e) => updateBusiness({ auto_reply_message: e.target.value })}
                      rows={2}
                      className="w-full px-3 sm:px-4 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all text-xs sm:text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Automation Settings */}
              <div id="automation" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-4 scroll-mt-[220px]">
                <div className="mb-2 sm:mb-3">
                  <div className="flex items-center justify-between mb-1 sm:mb-2">
                    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground">Instant Response Settings</h2>
                  </div>
                  <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-3">Control when ReplyFlow sends instant responses to missed calls.</p>
                </div>
                
                <div className="space-y-3 sm:space-y-4">
                  {/* Spam & Repeat Call Filtering */}
                  <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex items-start justify-between mb-3 sm:mb-4">
                      <div className="flex-1 pr-3 sm:pr-4">
                        <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                          <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">Spam & Repeat Call Filtering</h3>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-2 sm:mb-2.5">
                          Control which callers receive instant text responses and which calls ReplyFlow should ignore.
                        </p>
                        <div className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground">
                          📋 Filtered calls will not create leads, trigger automations, or appear in your inbox.
                        </div>
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
                      <div className="space-y-3 sm:space-y-4 border-t border-border pt-3 sm:pt-4">
                        {/* Repeat Call Protection */}
                        <div className="flex items-start justify-between p-3 sm:p-4 bg-white/60 dark:bg-slate-800/30 rounded-xl border border-slate-200/50 dark:border-slate-700/30">
                          <div className="flex-1 pr-3 sm:pr-4">
                            <div className="flex items-center gap-2 mb-1 sm:mb-1.5">
                              <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">Prevent duplicate instant replies</h4>
                            </div>
                            <p className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground">
                              Avoid sending repeated texts if the same person calls multiple times.
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
                        <div className="flex items-start justify-between p-3 sm:p-4 bg-white/60 dark:bg-slate-800/30 rounded-xl border border-slate-200/50 dark:border-slate-700/30">
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
                              Automatically skip calls from suspected spam or robocall numbers.
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
                  <div className="p-2 sm:p-3 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex items-start justify-between mb-2 sm:mb-3">
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
                          During business hours ReplyFlow sends your standard instant response. Outside business hours it sends your After Hours message.
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
                      <div className="mt-3 pt-3 border-t border-border space-y-3">
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
                        <p className="text-xs text-slate-600 dark:text-muted-foreground">
                          Automated texts will only be sent during these hours, Monday through Friday.
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
                          <p className="text-xs text-slate-600 dark:text-muted-foreground mt-1.5">
                            {`{{business_name}}`} is automatically replaced with your business name when messages are sent.
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
                  <div className="p-2 sm:p-3 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex items-start justify-between mb-2 sm:mb-3">
                      <div className="flex-1 pr-3 sm:pr-4">
                        <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                          <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">Out of Office Mode</h3>
                          {(() => {
                            const now = new Date()
                            const start = formBusiness.out_of_office_start ? new Date(formBusiness.out_of_office_start) : null
                            const end = formBusiness.out_of_office_end ? new Date(formBusiness.out_of_office_end) : null
                            const isEnabled = formBusiness.out_of_office_enabled

                            if (!isEnabled) {
                              return <span className="text-[9px] sm:text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full font-medium">Off</span>
                            }

                            if (start && now < start) {
                              return <span className="text-[9px] sm:text-[10px] px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full font-medium">Scheduled</span>
                            } else if (end && now > end) {
                              return <span className="text-[9px] sm:text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full font-medium">Expired</span>
                            } else if (start && end && now >= start && now <= end) {
                              return <span className="text-[9px] sm:text-[10px] px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full font-medium">Active</span>
                            }
                            return <span className="text-[9px] sm:text-[10px] px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full font-medium">On</span>
                          })()}
                        </div>
                        <p className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground mb-0.5 sm:mb-1">
                          Send a temporary delayed-response message while you're away.
                        </p>
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
                        className={`relative inline-flex h-5 w-10 sm:h-6 sm:w-11 items-center rounded-full transition-all duration-300 flex-shrink-0 ${
                          formBusiness.out_of_office_enabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-600 hover:bg-slate-500'
                        } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                        aria-label={formBusiness.out_of_office_enabled ? 'Disable Out of Office Mode' : 'Enable Out of Office Mode'}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 sm:h-4 sm:w-4 transform rounded-full bg-white transition-all duration-300 shadow-sm ${
                            formBusiness.out_of_office_enabled ? 'translate-x-5 sm:translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Date Range and Message - Only show when enabled */}
                    {formBusiness.out_of_office_enabled && (
                      <div className="space-y-2 sm:space-y-3 border-t border-border pt-2 sm:pt-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                          {/* Start Date/Time */}
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                              Start Date/Time
                            </label>
                            <input
                              type="datetime-local"
                              value={toDateTimeLocal(formBusiness.out_of_office_start)}
                              onChange={(e) => updateBusiness({ out_of_office_start: e.target.value || null })}
                              className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground text-xs sm:text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50"
                            />
                          </div>

                          {/* End Date/Time */}
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                              End Date/Time
                            </label>
                            <input
                              type="datetime-local"
                              value={toDateTimeLocal(formBusiness.out_of_office_end)}
                              onChange={(e) => updateBusiness({ out_of_office_end: e.target.value || null })}
                              className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground text-xs sm:text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50"
                            />
                          </div>
                        </div>

                        {/* Validation error for date range */}
                        {formBusiness.out_of_office_start && formBusiness.out_of_office_end && new Date(formBusiness.out_of_office_end) <= new Date(formBusiness.out_of_office_start) && (
                          <p className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 mt-1">
                            End date/time must be after start date/time
                          </p>
                        )}

                        {/* Custom Message */}
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                            Out of Office Message
                          </label>
                          <textarea
                            value={formBusiness.out_of_office_message || ''}
                            onChange={(e) => updateBusiness({ out_of_office_message: e.target.value })}
                            rows={3}
                            placeholder=""
                            className="w-full px-3 sm:px-4 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all text-xs sm:text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50 resize-none"
                          />
                          {!formBusiness.out_of_office_message && (
                            <div className="flex items-start gap-2 mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                              <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              <div className="text-xs text-amber-800 dark:text-amber-200">
                                <span className="font-semibold">No out-of-office message configured.</span> The default out-of-office response will be used.
                              </div>
                            </div>
                          )}
                          <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                            Use {'{'}{'{'}business_name{'}'}{'}'} to automatically insert your business name.
                          </p>
                        </div>

                        {/* Customer Preview */}
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                            Customer preview
                          </label>
                          <div className="p-2 sm:p-3 bg-slate-100 dark:bg-slate-800/60 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                            <p className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                              {(formBusiness.out_of_office_message || DEFAULT_OUT_OF_OFFICE_MESSAGE).replace('{{business_name}}', formBusiness.name || 'your business')}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Automatic Follow-Ups */}
                  <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-slate-900 dark:text-foreground">Automatic Follow-Ups</h3>
                          <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full font-medium">
                            New
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-muted-foreground mb-1">
                          Configure automated follow-up messages to re-engage leads.
                        </p>
                        <div className="text-xs text-slate-600 dark:text-muted-foreground">
                          📅 Schedule up to 3 follow-ups with custom timing and messages.
                        </div>
                        <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Follow-ups are automatic text messages sent when a customer doesn't respond to your initial message.
                        </div>
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
              <div id="integrations" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-2 sm:p-3.5 scroll-mt-[220px]">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground mb-0.5">Integrations</h2>
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-2">Connect third-party services to extend ReplyFlow's capabilities.</p>
                
                {/* Google Calendar Card */}
                <div className="p-2 sm:p-3 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                  <div className="flex items-start justify-between mb-2 sm:mb-3">
                    <div className="flex-1 pr-3 sm:pr-4">
                      <div className="flex items-center gap-2 sm:gap-2.5 mb-0.5 sm:mb-1">
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">Google Calendar</h3>
                        {calendarConnected && (
                          <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1">
                            <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground">
                        Connect Google Calendar to view and manage appointments on the Schedule page alongside your ReplyFlow jobs.
                      </p>
                      {calendarConnected && calendarEmail && (
                        <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Connected as: {calendarEmail}
                        </p>
                      )}
                      {calendarConnected && lastSyncTime && (
                        <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                          Last synced: {formatTimeAgo(lastSyncTime)}
                        </p>
                      )}
                    </div>
                    {!isLoadingCalendar && (
                      <button
                        onClick={calendarConnected ? handleDisconnectCalendar : handleConnectCalendar}
                        disabled={isConnectingCalendar || isDisconnectingCalendar}
                        className={`flex-shrink-0 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2 ${
                          calendarConnected
                            ? 'bg-red-600 hover:bg-red-700 text-white shadow-md'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
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
                    <div className="mt-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        <span className="font-semibold">Coming soon:</span> Automatic calendar event creation for scheduled follow-ups and appointment reminders.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payments Section */}
              <div id="payments" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-4 scroll-mt-[220px]">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground mb-1">Payments</h2>
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-3 sm:mb-4">Request and receive payments from customers directly in ReplyFlow.</p>
                
                {/* Stripe Connect Card */}
                <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
                        <svg className="w-6 h-6 sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 003-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">Stripe Connect</h3>
                        {business?.stripe_charges_enabled && business?.stripe_details_submitted && (
                          <span className="text-[10px] sm:text-xs px-2.5 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground leading-relaxed">
                        Connect your Stripe account to request and receive payments from customers via text message.
                      </p>
                      {business?.stripe_charges_enabled && business?.stripe_details_submitted && (
                        <div className="mt-2.5 sm:mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                          {business.stripe_charges_enabled && <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>Charges enabled</div>}
                          {business.stripe_payouts_enabled && <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>Payouts enabled</div>}
                          {!business.stripe_payouts_enabled && <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>Additional verification required for payouts</div>}
                        </div>
                      )}
                    </div>
                    {!isConnectingStripe && (
                      <button
                        onClick={handleConnectStripe}
                        disabled={isConnectingStripe}
                        className={`flex-shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-medium rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2 shadow-sm ${
                          business?.stripe_charges_enabled && business?.stripe_details_submitted
                            ? 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                        }`}
                      >
                        {business?.stripe_charges_enabled && business?.stripe_details_submitted ? 'Manage' : 'Connect'}
                      </button>
                    )}
                  </div>
                  {business?.stripe_connect_account_id && !(business?.stripe_charges_enabled && business?.stripe_details_submitted) && (
                    <div className="mt-3 p-2.5 sm:p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-300">
                        <span className="font-semibold">Setup in progress:</span> Complete the Stripe onboarding to start receiving payments.
                      </p>
                    </div>
                  )}
                  {!business?.stripe_connect_status || business.stripe_connect_status === 'not_connected' && (
                    <div className="mt-3 p-2.5 sm:p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-300">
                        <span className="font-semibold">Ready to accept payments:</span> Connect your Stripe account to request payments from customers via SMS.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Ignored Contacts Section */}
              <div id="contacts" className="bg-card rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-border/60 p-3 sm:p-4 scroll-mt-[220px]">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground mb-1">Ignored Contacts</h2>
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Prevent employee, personal, vendor, or spam numbers from becoming leads.</p>
                  </div>
                  <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 text-[10px] sm:text-xs"
                  >
                    + Add
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition-all hover:scale-105 active:scale-95 text-[10px] sm:text-xs"
                  >
                    Import
                  </button>
                </div>
                </div>
                {/* Personal/Business Number Guidance */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-2">Using your personal phone as your business number?</p>
                      <p className="text-[10px] text-blue-700 dark:text-blue-300 mb-2.5">
                        Many small business owners use one phone for both business and personal calls, and ReplyFlow fully supports this.
                      </p>
                      <p className="text-[10px] font-semibold text-blue-900 dark:text-blue-100 mb-1.5">You have complete control:</p>
                      <div className="space-y-1.5 mt-2">
                        <div className="flex items-start gap-2">
                          <span className="text-blue-600 dark:text-blue-400 font-semibold text-[10px] mt-0.5">•</span>
                          <p className="text-[10px] text-blue-700 dark:text-blue-300"><strong>Leave off Ignored Contacts:</strong> ReplyFlow treats it like a customer (AI Voice, lead creation, automated texts, follow-ups).</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-blue-600 dark:text-blue-400 font-semibold text-[10px] mt-0.5">•</span>
                          <p className="text-[10px] text-blue-700 dark:text-blue-300"><strong>Add to Ignored Contacts:</strong> ReplyFlow stays out (no AI Voice, no automated texts, no lead, no follow-ups).</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* When should I use Ignored Contacts */}
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <svg className="w-4 h-4 text-slate-600 dark:text-slate-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">When should I use Ignored Contacts?</p>
                      <p className="text-[10px] text-slate-700 dark:text-slate-300 mb-2">
                        Add people here when you never want ReplyFlow to respond to their missed calls.
                      </p>
                      <p className="text-[10px] text-slate-700 dark:text-slate-300 mb-3">
                        Common examples: friends, family, schools, doctors, and other personal contacts.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-600">
                        <div>
                          <p className="text-[10px] font-semibold text-slate-900 dark:text-slate-100 mb-1">On the list:</p>
                          <p className="text-[10px] text-slate-700 dark:text-slate-300">
                            No AI Voice, no automated texts, no lead is created.
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-900 dark:text-slate-100 mb-1">Off the list:</p>
                          <p className="text-[10px] text-slate-700 dark:text-slate-300">
                            Treated like a customer (AI Voice, texts, follow-ups).
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 sm:space-y-2.5">
                  {isLoadingIgnored ? (
                    <div className="flex items-center justify-center py-4 sm:py-6">
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-blue-600"></div>
                    </div>
                  ) : ignoredContacts.length === 0 ? (
                    <div className="text-center py-6 sm:py-8 bg-muted/40 rounded-lg border border-border/50">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <h3 className="text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1">No ignored contacts yet</h3>
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground max-w-[220px] sm:max-w-[280px] mx-auto">
                        Add employees, family members, vendors, or other personal contacts that ReplyFlow should ignore.
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
                            className="ml-2 sm:ml-3 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all hover:scale-105 active:scale-95"
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
              <div id="account" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-6 scroll-mt-[220px]">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-foreground mb-1 sm:mb-2">Account</h2>
                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-4 sm:mb-5">Your account details and status.</p>
                <div className="bg-slate-50/50 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40 overflow-hidden">
                  {/* Email */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 p-3 sm:p-4 border-b border-slate-200/50 dark:border-slate-700/40 last:border-b-0">
                    <div className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 00-2-2H7a2 2 0 00-2 2z" />
                      </svg>
                      <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Email</span>
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">{user?.email}</span>
                  </div>

                  {/* Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 p-3 sm:p-4 border-b border-slate-200/50 dark:border-slate-700/40 last:border-b-0">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        isInTrialPeriod(business?.subscription_status) 
                          ? 'bg-blue-500' 
                          : hasActiveSubscription(business)
                            ? 'bg-green-500'
                            : 'bg-amber-500'
                      }`}></div>
                      <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Status</span>
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">{getSubscriptionStatusText(business?.subscription_status)}</span>
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
                          {getPricingDisplay()}
                          {isInTrialPeriod(business?.subscription_status) && ` (${getTrialDisplay()})`}
                        </p>
                        <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                          {getSubscriptionStatusDescription(
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
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 text-[10px] sm:text-xs flex items-center gap-2 shadow-sm"
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
                      className="w-full px-4 py-2 sm:px-5 sm:py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 text-[10px] sm:text-xs flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isStartingCheckout ? (
                        <>
                          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
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
                        className="mt-1 sm:mt-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-all hover:scale-105 active:scale-95 text-[10px] sm:text-xs shadow-sm"
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
                      className="px-3 py-1.5 sm:px-4 sm:py-2 bg-red-600/90 hover:bg-red-700 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 text-[10px] sm:text-xs shadow-sm"
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-card rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                <div className="flex items-start gap-4 mb-6">
                  <div className="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                    <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-foreground mb-2">
                      Permanently delete your ReplyFlow account
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-muted-foreground">
                      This permanently removes your ReplyFlow account and business data. Please review what happens before continuing.
                    </p>
                  </div>
                </div>

                {/* What happens on deletion */}
                <div className="space-y-4 mb-6">
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      Billing & Subscription
                    </h3>
                    <ul className="text-sm text-slate-600 dark:text-muted-foreground space-y-2">
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
                    <ul className="text-sm text-slate-600 dark:text-muted-foreground space-y-2">
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
                        <span>We'll send call forwarding instructions by both email and text. If needed, we'll send up to two additional reminder rounds, for a maximum of 3 emails and 3 text messages. Once you confirm call forwarding has been disabled, all reminders stop immediately.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <span>Temporary offboarding records are automatically removed once the offboarding process is complete.</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Data Deletion
                    </h3>
                    <ul className="text-sm text-slate-600 dark:text-muted-foreground space-y-2">
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
                </div>

                {/* Warning callout */}
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-4 mb-6">
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
                <div className="mb-6">
                  <label className="block text-sm text-slate-900 dark:text-foreground mb-2">
                    Type <span className="font-mono font-bold">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    disabled={isDeleting}
                    className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-background text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground disabled:opacity-50"
                  />
                </div>

                {/* Final Confirmation - Password */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-2">
                    Final Confirmation
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-muted-foreground mb-3">
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
                        className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:border-red-500 bg-background text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground disabled:opacity-50 ${
                          deletePasswordError 
                            ? 'border-red-500 focus:ring-red-500' 
                            : 'border-border focus:ring-red-500/40 focus:border-red-500/80'
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

                {/* Action buttons */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false)
                      setDeleteConfirmText('')
                      setDeletePassword('')
                      setDeletePasswordError('')
                    }}
                    disabled={isDeleting}
                    className="px-4 py-2.5 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
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
          )}

          {/* Add Ignored Contact Modal */}
          {showAddModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-foreground mb-4">
                  Add Ignored Contact
                </h2>
                <p className="text-sm text-slate-600 dark:text-muted-foreground mb-4">
                  Add people here when you never want ReplyFlow to respond to their missed calls. Friends, family, schools, doctors, and other personal contacts are common examples. When an ignored contact calls, ReplyFlow stays out of the conversation (no AI Voice, no automated texts, no lead, no follow-ups—just a simple voicemail). You can remove contacts from this list at any time.
                </p>
                <div className="space-y-3">
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
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowAddModal(false)
                      setPhoneNumber('')
                      setLabel('')
                      setContactType('spam')
                      setReason('')
                    }}
                    disabled={isAdding}
                    className="px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddIgnoredContact}
                    disabled={isAdding || !phoneNumber.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
                  Change Password
                </h3>
                
                {passwordError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-3 mb-4">
                    <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      New Password
                    </label>
                    <PasswordInput
                      id="newPassword"
                      name="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-500/80"
                      placeholder="Enter new password"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Must be at least 8 characters long
                    </p>
                  </div>

                  <div>
                    <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Confirm New Password
                    </label>
                    <PasswordInput
                      id="confirmNewPassword"
                      name="confirmNewPassword"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-500/80"
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowChangePasswordModal(false)
                      setNewPassword('')
                      setConfirmNewPassword('')
                      setPasswordError('')
                    }}
                    disabled={isChangingPassword}
                    className="px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangePassword}
                    disabled={isChangingPassword || !newPassword.trim() || !confirmNewPassword.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Change Phone Number Modal */}
          {showPhoneChangeModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
                  Change Business Phone Number
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Current Phone Number
                    </label>
                    <div className="px-4 py-3 bg-slate-100 dark:bg-slate-900 rounded-lg text-slate-900 dark:text-slate-100">
                      {formatPhoneNumber(business?.business_phone_number || '')}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="newPhoneNumber" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      New Phone Number
                    </label>
                    <input
                      id="newPhoneNumber"
                      type="tel"
                      value={newPhoneNumber}
                      onChange={(e) => setNewPhoneNumber(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-500/80"
                    />
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-4">
                    <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-2">
                      Important
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Changing your business number will require you to update call forwarding on the new phone number. After saving, ReplyFlow will guide you through re-verifying forwarding so missed calls continue to be captured.
                    </p>
                  </div>
                  {phoneChangeError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-3">
                      <p className="text-sm text-red-600 dark:text-red-400">{phoneChangeError}</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowPhoneChangeModal(false)
                      setNewPhoneNumber('')
                      setPhoneChangeError('')
                    }}
                    disabled={isChangingPhone}
                    className="px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangePhoneNumber}
                    disabled={isChangingPhone || !newPhoneNumber.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isChangingPhone ? (
                      <>
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent border-solid inline-block mr-2"></div>
                        Changing...
                      </>
                    ) : (
                      'Change Number'
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

          {/* Toast Container */}
          <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
        </div>
      </BusinessGuard>
    </AuthGuard>
    <BottomNavigation />
    </DashboardErrorBoundary>
  )
}
