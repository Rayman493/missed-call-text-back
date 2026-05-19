'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import SettingsActionBar from '@/components/SettingsActionBar'
import Toast, { ToastContainer } from '@/components/Toast'
import { useSettingsFormState } from '@/hooks/useSettingsFormState'
import Link from 'next/link'
import { formatPhoneNumber } from '@/lib/utils'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import MobileMenu from '@/components/MobileMenu'
import AppHeader from '@/components/AppHeader'
import {
  getSubscriptionStatusText,
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
  const [isDeleting, setIsDeleting] = useState(false)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])

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
  const [reason, setReason] = useState('')

  // Spam filtering local state for immediate visual feedback
  const [spamFilteringEnabled, setSpamFilteringEnabled] = useState(false)
  const [isSavingSpamFiltering, setIsSavingSpamFiltering] = useState(false)

  // Automation settings local state for immediate visual feedback
  const [ignoreRepeatCalls, setIgnoreRepeatCalls] = useState(false)
  const [ignoreBlockedPrivateNumbers, setIgnoreBlockedPrivateNumbers] = useState(false)
  const [ignoreSuspectedSpamCallers, setIgnoreSuspectedSpamCallers] = useState(false)

  // Save success state for SettingsActionBar
  const [saveSuccess, setSaveSuccess] = useState(false)

  const supabase = createBrowserClient()

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
      const { error } = await supabase
        .from('businesses')
        .update({
          name: businessData.name,
          business_phone_number: businessData.business_phone_number,
          auto_reply_message: businessData.auto_reply_message,
          call_forwarding_enabled: businessData.call_forwarding_enabled,
          business_hours_enabled: businessData.business_hours_enabled,
          business_hours_start: businessData.business_hours_start,
          business_hours_end: businessData.business_hours_end,
          business_hours_timezone: businessData.business_hours_timezone,
          after_hours_message: businessData.after_hours_message,
          automation_settings: automationSettings
        })
        .eq('id', businessData.id)

      if (error) {
        console.error('Settings save error:', error)
        throw new Error('Failed to save settings')
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
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, type }])
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

  // Helper to get form value for blocked numbers
  const getBlockedNumbersText = () => {
    const settings = getAutomationSettings()
    // If numbers are stored space-separated (legacy format), split them first
    const numbers = settings.blockedNumbers.flatMap((n: string) => {
      // Check if this is a space-separated string (legacy format)
      if (n.includes(' ')) {
        return n.split(' ').filter((x: string) => x.trim())
      }
      return [n]
    })
    return numbers.join('\n')
  }

  // Helper to update blocked numbers
  const updateBlockedNumbers = (text: string) => {
    const numbers = text.split('\n').filter((n: string) => n.trim()).map((n: string) => n.trim())
    updateAutomationSetting('blockedNumbers', numbers)
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
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/ignored-contacts', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch ignored contacts')
      }

      const data = await response.json()
      setIgnoredContacts(data.ignoredContacts || [])
    } catch (error) {
      console.error('Error fetching ignored contacts:', error)
      showToast('Failed to fetch ignored contacts', 'error')
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
        throw new Error('Failed to remove ignored contact')
      }

      // Update local state
      setIgnoredContacts(prev => prev.filter(contact => contact.id !== contactId))
      showToast('Contact unignored successfully', 'success')
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
      setReason('')
      setShowAddModal(false)
      
      showToast('Contact added to ignored contacts', 'success')
    } catch (error) {
      console.error('Error adding ignored contact:', error)
      showToast(error instanceof Error ? error.message : 'Failed to add ignored contact', 'error')
    } finally {
      setIsAdding(false)
    }
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
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

  // Delete account handler
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return

    setIsDeleting(true)
    try {
      console.log('[Delete Account] Starting account deletion process')
      
      // Clear local storage and session storage BEFORE deletion to prevent stale state
      if (typeof window !== 'undefined') {
        console.log('[Delete Account] Clearing local storage')
        localStorage.clear()
        console.log('[Delete Account] Clearing session storage')
        sessionStorage.clear()
      }

      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result?.ok) {
        console.error('[Delete Account] Server error:', result)
        const friendly =
          result?.step === 'stripe_cancel'
            ? (result?.error || 'We could not cancel your subscription. Your account was not deleted. Please try again or contact support.')
            : result?.step === 'stripe_init'
              ? 'Billing service is temporarily unavailable. Please try again in a moment.'
              : (result?.error || 'Failed to delete account. Please try again.')
        showToast(friendly, 'error')
        return
      }

      console.log('[Delete Account] Account deleted successfully, redirecting to homepage')
      // Force redirect to homepage immediately without waiting for signOut
      // since the user is already deleted from Supabase Auth
      window.location.href = '/'
    } catch (error) {
      console.error('[Delete Account] Network error:', error)
      showToast('Failed to delete account. Please try again.', 'error')
    } finally {
      setIsDeleting(false)
      setShowDeleteModal(false)
      setDeleteConfirmText('')
    }
  }

  // Fetch ignored contacts when business loads
  useEffect(() => {
    if (business) {
      fetchIgnoredContacts()
      // Initialize spam filtering state from business data
      const settings = getAutomationSettings()
      setSpamFilteringEnabled(settings.spamRepeatFilteringEnabled)
      // Initialize automation settings local state
      setIgnoreRepeatCalls(settings.ignoreRepeatCalls)
      setIgnoreBlockedPrivateNumbers(settings.ignoreBlockedPrivateNumbers)
      setIgnoreSuspectedSpamCallers(settings.ignoreSuspectedSpamCallers)
    }
  }, [business])

  // Debug logs
  useEffect(() => {
    console.log('[Settings] Business loaded:', business)
    console.log('[Settings] User loaded:', user)
    console.log('[Settings] Form business:', formBusiness)
  }, [business, user, formBusiness])

  if (!business || !formBusiness) {
    return (
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-blue-50/30 dark:from-background dark:via-background dark:to-blue-950/10 flex flex-col">
            <AppHeader title="Settings" showBackLink={true} showNavigation={false} />
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
    <AuthGuard>
      <BusinessGuard>
          <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-blue-50/30 dark:from-background dark:via-background dark:to-blue-950/10 flex flex-col">
            {/* Header */}
            <AppHeader title="Settings" showBackLink={true} showNavigation={false} />

            {/* Main Content */}
            <div className="flex-1 p-4 sm:p-6 lg:p-8 pb-24">
              <div className="max-w-7xl mx-auto">

            {/* System Status Section */}
            <div className={`rounded-xl p-2.5 sm:p-3 mb-4 sm:mb-6 bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/50 shadow-sm`}>
              <div className="flex flex-wrap items-center gap-2">
                {onboardingState.state === 'PRE_TRIAL' && (
                  <>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-muted/30 text-slate-700 dark:text-slate-600 dark:text-muted-foreground rounded-full text-xs">
                      Waiting for activation
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-muted/30 text-slate-700 dark:text-slate-600 dark:text-muted-foreground rounded-full text-xs">
                      Business texting inactive
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-muted/30 text-slate-700 dark:text-slate-600 dark:text-muted-foreground rounded-full text-xs">
                      Monitoring inactive
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-full text-xs">
                      Trial needed
                    </span>
                  </>
                )}
                {onboardingState.state === 'ACTIVATING' && (
                  <>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      Preparing system
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      Activating texting
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                      Setup in progress
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      Trial active
                    </span>
                  </>
                )}
                {onboardingState.state === 'MESSAGING_SETUP' && (
                  <>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      Activating messaging
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      Finalizing ReplyFlow line
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                      Carrier setup in progress
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      Trial active
                    </span>
                  </>
                )}
                {onboardingState.state === 'AWAITING_FORWARDING' && (
                  <>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      ReplyFlow line ready
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      Waiting for connection
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-muted/30 text-slate-700 dark:text-slate-600 dark:text-muted-foreground rounded-full text-xs">
                      Not watching for calls
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      Trial active
                    </span>
                  </>
                )}
                {onboardingState.state === 'VERIFICATION_PENDING' && (
                  <>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      Waiting for test call
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      ReplyFlow standing by
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-muted/30 text-slate-700 dark:text-slate-600 dark:text-muted-foreground rounded-full text-xs">
                      Waiting to start watching
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                      Trial active
                    </span>
                  </>
                )}
                {onboardingState.state === 'LIVE' && (
                  <>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full text-xs">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      Watching for missed calls
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full text-xs">
                      Instant replies are on
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full text-xs">
                      Text messaging working
                    </span>
                    {isInTrialPeriod(business?.subscription_status) ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                        Trial active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full text-xs">
                        Subscription active
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Settings Sections */}
            <div className="space-y-4 sm:space-y-5">
              {/* Account Section */}
              <div id="account" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-1.5 sm:mb-2">Account</h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-3 sm:mb-4">Manage your account details and preferences.</p>
                <div className="space-y-2.5 sm:space-y-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1">
                      Email
                    </label>
                    <div className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground">
                      {user?.email}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1">
                      Account Status
                    </label>
                    <div className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground">
                      {getSubscriptionStatusText(business?.subscription_status)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Billing Section */}
              <div id="billing" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-4">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-2 sm:mb-2.5">Billing</h2>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1">
                      Subscription Status
                    </label>
                    <div className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground">
                      {getSubscriptionStatusText(business?.subscription_status)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Business Info Section */}
              <div id="business" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-1.5 sm:mb-2">Business Info</h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-3 sm:mb-4">Manage the phone number and business identity customers interact with.</p>
                <div className="space-y-2.5 sm:space-y-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={formBusiness.name || ''}
                      onChange={(e) => updateBusiness({ name: e.target.value })}
                      className="w-full px-4 py-2.5 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Business Phone Number
                    </label>
                    <input
                      type="tel"
                      value={formBusiness.business_phone_number || ''}
                      onChange={(e) => updateBusiness({ business_phone_number: e.target.value })}
                      placeholder="(555) 123-4567"
                      className="w-full px-4 py-2.5 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50"
                    />
                  </div>
                </div>
              </div>

              {/* Telecom-dependent settings: only shown after the user starts a trial/subscription. */}
              {!hasActiveSubscription(business) ? (
                <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-3.5 sm:p-6">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-2">Text Messaging & Automation</h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-2.5 sm:mb-3">
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
              <div id="messaging" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground">Text Message Settings</h2>
                  {hasActiveSubscription(business) && (
                    <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1">
                      <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-3 sm:mb-4">Customize the instant text customers receive after missed calls.</p>
                <div className="space-y-2.5 sm:space-y-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      Instant Response Message
                    </label>
                    <textarea
                      value={formBusiness.auto_reply_message || ''}
                      onChange={(e) => updateBusiness({ auto_reply_message: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2.5 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
                      After Hours Message
                    </label>
                    <textarea
                      value={formBusiness.after_hours_message || ''}
                      onChange={(e) => updateBusiness({ after_hours_message: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2.5 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground transition-all text-sm hover:border-slate-300/60 dark:hover:border-slate-600/50 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Automation Settings */}
              <div id="automation" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-4 sm:p-6">
                <div className="mb-3 sm:mb-4">
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground">Instant Response Settings</h2>
                    {spamFilteringEnabled && (
                      <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1">
                        <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground">
                    Control when ReplyFlow sends instant responses to missed calls.
                  </p>
                </div>
                
                <div className="space-y-2 sm:space-y-2.5">
                  {/* Spam & Repeat Call Filtering */}
                  <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex items-start justify-between mb-3 sm:mb-4">
                      <div className="flex-1 pr-3 sm:pr-4">
                        <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                          <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-foreground">Spam & Repeat Call Filtering</h3>
                          {spamFilteringEnabled && (
                            <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-green-500/15 text-green-600 dark:text-green-400 rounded-full font-medium">
                              Enabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-1.5 sm:mb-2">
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
                        <div className="flex items-start justify-between p-3 sm:p-4 bg-white/60 dark:bg-slate-800/30 rounded-lg border border-slate-200/50 dark:border-slate-700/30">
                          <div className="flex-1 pr-3 sm:pr-4">
                            <div className="flex items-center gap-2 mb-1 sm:mb-2">
                              <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground">Prevent duplicate instant replies</h4>
                              <span className="text-[10px] sm:text-xs px-2 py-1 bg-blue-900/30 text-blue-400 dark:bg-blue-900/30 dark:text-blue-400 rounded-full font-medium">
                                Recommended
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-1.5 sm:mb-2">
                              If the same person calls multiple times in a short period, ReplyFlow will avoid sending repeated text messages.
                            </p>
                            <div className="text-[10px] sm:text-xs text-slate-600 dark:text-muted-foreground italic">
                              Example: A customer calls 3 times within 15 minutes and only receives 1 instant reply.
                            </div>
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
                        <div className="flex items-start justify-between p-4 bg-white/60 dark:bg-slate-800/30 rounded-lg border border-slate-200/50 dark:border-slate-700/30">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-foreground">Skip blocked or hidden callers</h4>
                              <span className="text-xs px-2 py-1 bg-blue-900/30 text-blue-400 dark:bg-blue-900/30 dark:text-blue-400 rounded-full font-medium">
                                Recommended
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-muted-foreground">
                              Prevent instant texts from being sent to callers who hide their number or appear as 'Unknown'.
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
                        <div className="flex items-start justify-between p-4 bg-white/60 dark:bg-slate-800/30 rounded-lg border border-slate-200/50 dark:border-slate-700/30">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-foreground">Skip suspected spam callers</h4>
                              <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full font-medium">
                                Recommended
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-muted-foreground">
                              Automatically identify and skip calls from numbers suspected of being spam or robocalls.
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

                        {/* Blocked Numbers List */}
                        <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                          <div className="mb-2.5">
                            <div className="flex items-center gap-2 mb-1.5">
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-foreground">Blocked phone numbers</h4>
                              <span className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded-full font-medium">
                                Optional
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-muted-foreground mb-2.5">
                              ReplyFlow will ignore calls from these numbers and will not create leads or send texts.
                            </p>
                          </div>
                          <textarea
                            value={getBlockedNumbersText()}
                            onChange={(e) => updateBlockedNumbers(e.target.value)}
                            rows={3}
                            placeholder="+14125551234&#10;+14125559876"
                            className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground text-sm font-mono"
                          />
                          <div className="text-xs text-slate-600 dark:text-muted-foreground mt-2">
                            Enter one phone number per line. Example:
                            <br />
                            <span className="font-mono">+14125551234</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Business Hours */}
                  <div className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-200/60 dark:border-slate-700/40">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-slate-900 dark:text-foreground">Business Hours Only</h3>
                          {formBusiness.business_hours_enabled && (
                            <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-medium flex items-center gap-1">
                              <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-muted-foreground mb-1">
                          Only send instant texts during your business hours.
                        </p>
                        <div className="text-xs text-slate-600 dark:text-muted-foreground">
                          🕐 Prevents late-night texts and respects customer communication preferences.
                        </div>
                      </div>
                      <button
                        onClick={() => updateBusiness({ business_hours_enabled: !formBusiness.business_hours_enabled })}
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
                              Start Time
                            </label>
                            <input
                              type="time"
                              value={formBusiness.business_hours_start || '09:00'}
                              onChange={(e) => updateBusiness({ business_hours_start: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-900 dark:text-foreground mb-1.5">
                              End Time
                            </label>
                            <input
                              type="time"
                              value={formBusiness.business_hours_end || '18:00'}
                              onChange={(e) => updateBusiness({ business_hours_end: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-200/60 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white/60 dark:bg-slate-800/40 text-slate-900 dark:text-foreground text-sm"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-muted-foreground">
                          Automated texts will only be sent during these hours, Monday through Friday.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Automation Status Summary */}
                  <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">Automation Status</h4>
                        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                          {getAutomationSettings().spamRepeatFilteringEnabled && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              <span>Spam & repeat call filtering active</span>
                            </div>
                          )}
                          {getAutomationSettings().ignoreRepeatCalls && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              <span>Repeat-call protection enabled</span>
                            </div>
                          )}
                          {getAutomationSettings().ignoreBlockedPrivateNumbers && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              <span>Private callers blocked</span>
                            </div>
                          )}
                          {getAutomationSettings().ignoreSuspectedSpamCallers && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              <span>Spam detection active</span>
                            </div>
                          )}
                          {formBusiness.business_hours_enabled && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              <span>Business hours enforced</span>
                            </div>
                          )}
                          {!getAutomationSettings().spamRepeatFilteringEnabled && !formBusiness.business_hours_enabled && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                              <span>Automation is currently turned off. Enable one of the options above to automatically respond to missed calls.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ignored Contacts Section */}
              <div id="ignored-contacts" className="bg-card rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-border/60 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-1">Ignored Contacts</h2>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground">Prevent personal numbers, employees, vendors, or spam callers from becoming leads.</p>
                  </div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 text-sm"
                  >
                    + Add Contact
                  </button>
                </div>
                <div className="space-y-3">
                  {isLoadingIgnored ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  ) : ignoredContacts.length === 0 ? (
                    <div className="text-center py-8 sm:py-10 bg-muted/40 rounded-xl border border-border/50">
                      <div className="text-3xl sm:text-4xl mb-3">📵</div>
                      <h3 className="text-sm sm:text-base font-medium text-slate-900 dark:text-foreground mb-2">No ignored contacts yet</h3>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-4 max-w-sm mx-auto">
                        Add family, employees, personal numbers, or other contacts that should never receive automated texts or create leads.
                      </p>
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 text-sm"
                      >
                        + Add Ignored Contact
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {ignoredContacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between p-3 sm:p-4 bg-muted/40 rounded-lg border border-border/60 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-slate-900 dark:text-foreground">
                                {formatPhoneNumber(contact.phone_number)}
                              </span>
                              {contact.label && (
                                <span className="text-xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full font-medium">
                                  {contact.label}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-muted-foreground">
                              {contact.reason && `Reason: ${contact.reason}`}
                              {contact.reason && contact.created_at && ' • '}
                              {contact.created_at && `Added ${new Date(contact.created_at).toLocaleDateString()}`}
                            </div>
                          </div>
                          <button
                            onClick={() => removeIgnoredContact(contact.id)}
                            className="ml-3 sm:ml-4 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all hover:scale-105 active:scale-95"
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

              {/* Billing Section */}
              <div id="billing" className="bg-card rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-border p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-1.5 sm:mb-2">Billing</h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-4 sm:mb-5">Manage your subscription and trial.</p>
                <div className="space-y-4 sm:space-y-5">
                  <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/40 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-lg border border-blue-200/60 dark:border-blue-800/50 p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Current Plan</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isInTrialPeriod(business?.subscription_status) 
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                          : hasActiveSubscription(business)
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }`}>
                        {getSubscriptionStatusText(business?.subscription_status)}
                      </span>
                    </div>
                    <p className="text-sm sm:text-base font-medium text-slate-900 dark:text-foreground mb-1">
                      {getPricingDisplay()}
                      {isInTrialPeriod(business?.subscription_status) && ` (${getTrialDisplay()})`}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-muted-foreground">
                      {isInTrialPeriod(business?.subscription_status) 
                        ? 'Your trial includes full access to all features. No charge until trial ends.'
                        : 'Your subscription is active and all features are unlocked.'}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleBillingActionClick('portal')}
                      disabled={isOpeningPortal}
                      className="px-4 py-2.5 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 text-sm"
                    >
                      Manage Billing
                    </button>
                    {needsUpgrade(business?.subscription_status) && (
                      <button
                        onClick={() => handleBillingActionClick('upgrade')}
                        disabled={isStartingCheckout}
                        className="px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 text-sm"
                      >
                        Upgrade Plan
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div id="danger" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-300/60 dark:border-slate-600/40 shadow-sm hover:shadow-md transition-all duration-200 p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground mb-1.5 sm:mb-2">Account Management</h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-3 sm:mb-4">Manage your account and data preferences.</p>
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="bg-slate-50/60 dark:bg-slate-800/30 rounded-lg border border-slate-300/50 dark:border-slate-600/30 p-3 sm:p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1.5">Delete Account</h3>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-muted-foreground mb-3">
                        Permanently delete your account, cancel your subscription, and remove all data. This action cannot be undone.
                      </p>
                      <button
                        onClick={() => setShowDeleteModal(true)}
                        className="px-4 py-2 bg-red-600/90 hover:bg-red-700 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 text-sm"
                      >
                        Delete Account
                      </button>
                    </div>
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
              <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-foreground mb-4">
                  Delete your account?
                </h2>
                <p className="text-sm text-slate-600 dark:text-muted-foreground mb-3">
                  This will:
                </p>
                <ul className="text-sm text-slate-600 dark:text-muted-foreground mb-4 list-disc pl-5 space-y-1">
                  <li>Cancel your active subscription in Stripe immediately</li>
                  <li>Permanently delete your business, leads, messages, conversations, and automatic check-ins</li>
                  <li>Sign you out and delete your login</li>
                </ul>
                <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-4">
                  This action cannot be undone.
                </p>
                <div className="mb-4">
                  <label className="block text-sm text-slate-900 dark:text-foreground mb-2">
                    Type <span className="font-mono font-bold">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false)
                      setDeleteConfirmText('')
                    }}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-secondary text-secondary-foreground font-medium rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                    className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? 'Cancelling subscription and deleting account...' : 'Permanently Delete Account'}
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
                  ReplyFlow will ignore missed calls from this number and will not send automated texts or create leads.
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
                      placeholder="Optional label (e.g., 'Spam', 'Personal')"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-900 dark:text-foreground mb-2">
                      Notes/Reason
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-slate-900 dark:text-foreground placeholder:text-slate-600 dark:text-muted-foreground resize-none"
                      placeholder="Personal contact, employee, vendor, etc."
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowAddModal(false)
                      setPhoneNumber('')
                      setLabel('')
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

          {/* Toast Container */}
          <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
