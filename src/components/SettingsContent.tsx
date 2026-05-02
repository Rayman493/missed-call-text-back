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
import ThemeToggle, { MobileThemeToggle } from '@/components/ThemeToggle'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import MobileMenu from '@/components/MobileMenu'
import BackToDashboard from '@/components/BackToDashboard'
import {
  getSubscriptionStatusText,
  isInTrialPeriod,
  needsUpgrade,
  getPricingDisplay,
  getTrialDisplay,
  SUBSCRIPTION_STATES
} from '@/lib/subscription'
import { PRICING_CONFIG } from '@/lib/pricing'
import { handleBillingAction } from '@/lib/billing'

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
  const [isResetting, setIsResetting] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [showResetModal, setShowResetModal] = useState(false)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])

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
      // Extract automation settings from form data
      const automationSettings = {
        spamRepeatFilteringEnabled: getAutomationSettings().spamRepeatFilteringEnabled || false,
        ignoreRepeatCalls: getAutomationSettings().ignoreRepeatCalls || false,
        repeatCallWindowMinutes: 15, // Default 15 minutes
        ignoreBlockedPrivateNumbers: getAutomationSettings().ignoreBlockedPrivateNumbers || false,
        ignoreSuspectedSpamCallers: getAutomationSettings().ignoreSuspectedSpamCallers || false,
        blockedNumbers: getAutomationSettings().blockedNumbers || []
      }

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
    return settings.blockedNumbers.join('\n')
  }

  // Helper to update blocked numbers
  const updateBlockedNumbers = (text: string) => {
    const numbers = text.split('\n').filter((n: string) => n.trim()).map((n: string) => n.trim())
    updateAutomationSetting('blockedNumbers', numbers)
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
      const { error } = await supabase.rpc('delete_user_account')
      if (error) throw error

      await signOut()
      router.push('/')
    } catch (error) {
      console.error('Delete account error:', error)
      showToast('Failed to delete account. Please try again.', 'error')
    } finally {
      setIsDeleting(false)
      setShowDeleteModal(false)
      setDeleteConfirmText('')
    }
  }

  // Reset demo data handler
  const handleResetDemoData = async () => {
    if (resetConfirmText !== 'RESET') return

    setIsResetting(true)
    try {
      const { error } = await supabase.rpc('reset_demo_data')
      if (error) throw error

      await refreshBusiness()
      showToast('Demo data reset successfully', 'success')
    } catch (error) {
      console.error('Reset demo data error:', error)
      showToast('Failed to reset demo data. Please try again.', 'error')
    } finally {
      setIsResetting(false)
      setShowResetModal(false)
      setResetConfirmText('')
    }
  }

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
          <div className="min-h-screen bg-gray-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading settings...</p>
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
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                  <BackToDashboard />
                  <div className="flex items-center gap-4">
                    <ThemeToggle />
                    <UserDropdown />
                  </div>
                </div>
              </div>
            </header>

            {/* Mobile Navigation */}
            <MobileMenu />

            {/* Main Content */}
            <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-y-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-100 mb-2">
                  Settings
                </h1>
                <p className="text-gray-400">
                  Configure your ReplyFlow settings here.
                </p>
              </div>

            {/* Settings Sections */}
            <div className="space-y-8">
              {/* Account Section */}
              <div id="account" className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-100 mb-4">Account</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Email
                    </label>
                    <div className="text-sm text-gray-400">
                      {user?.email}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Account Status
                    </label>
                    <div className="text-sm text-gray-400">
                      {getSubscriptionStatusText(business?.subscription_status)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Business Info Section */}
              <div id="business" className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-100 mb-4">Business Info</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={formBusiness.name || ''}
                      onChange={(e) => updateBusiness({ name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Business Phone Number
                    </label>
                    <input
                      type="tel"
                      value={formBusiness.business_phone_number || ''}
                      onChange={(e) => updateBusiness({ business_phone_number: e.target.value })}
                      placeholder="(555) 123-4567"
                      className="w-full px-3 py-2 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-gray-100"
                    />
                  </div>
                </div>
              </div>

              {/* Messaging Settings */}
              <div id="messaging" className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-100 mb-4">Messaging Settings</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Auto Reply Message
                    </label>
                    <textarea
                      value={formBusiness.auto_reply_message || ''}
                      onChange={(e) => updateBusiness({ auto_reply_message: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      After Hours Message
                    </label>
                    <textarea
                      value={formBusiness.after_hours_message || ''}
                      onChange={(e) => updateBusiness({ after_hours_message: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-gray-100"
                    />
                  </div>
                </div>
              </div>

              {/* Automation Settings */}
              <div id="automation" className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-4 sm:p-6">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-gray-100 mb-2">Automation Settings</h2>
                  <p className="text-sm text-gray-400">
                    Configure how ReplyFlow automatically handles your missed calls and follow-ups.
                  </p>
                </div>
                
                <div className="space-y-6">
                  {/* Spam & Repeat Call Filtering */}
                  <div className="bg-gray-700/50 rounded-lg border border-gray-600 p-4 sm:p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-base font-semibold text-gray-100">Spam & Repeat Call Filtering</h3>
                          {getAutomationSettings().spamRepeatFilteringEnabled && (
                            <span className="text-xs px-2 py-1 bg-green-900/30 text-green-400 rounded-full font-medium">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-300 mb-2">
                          Control which callers receive automated text responses and which calls ReplyFlow should ignore.
                        </p>
                        <div className="text-xs text-gray-400">
                          📋 Filtered calls will not create leads, trigger automations, or appear in your inbox.
                        </div>
                      </div>
                      <button
                        onClick={() => updateAutomationSetting('spamRepeatFilteringEnabled', !getAutomationSettings().spamRepeatFilteringEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                          getAutomationSettings().spamRepeatFilteringEnabled ? 'bg-blue-600' : 'bg-gray-600'
                        }`}
                        aria-label={getAutomationSettings().spamRepeatFilteringEnabled ? 'Disable spam filtering' : 'Enable spam filtering'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            getAutomationSettings().spamRepeatFilteringEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Filtering Options - Only show when enabled */}
                    {getAutomationSettings().spamRepeatFilteringEnabled && (
                      <div className="space-y-6 border-t border-gray-600 pt-6">
                        {/* Repeat Call Protection */}
                        <div className="flex items-start justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-sm font-semibold text-gray-100">Prevent duplicate auto-replies</h4>
                              <span className="text-xs px-2 py-1 bg-blue-900/30 text-blue-400 rounded-full font-medium">
                                Recommended
                              </span>
                            </div>
                            <p className="text-sm text-gray-300 mb-2">
                              If the same person calls multiple times in a short period, ReplyFlow will avoid sending repeated text messages.
                            </p>
                            <div className="text-xs text-gray-400 italic">
                              Example: A customer calls 3 times within 15 minutes and only receives 1 automated reply.
                            </div>
                          </div>
                          <button
                            onClick={() => updateAutomationSetting('ignoreRepeatCalls', !getAutomationSettings().ignoreRepeatCalls)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-1 ${
                              getAutomationSettings().ignoreRepeatCalls ? 'bg-blue-600' : 'bg-gray-600'
                            }`}
                            aria-label={getAutomationSettings().ignoreRepeatCalls ? 'Disable repeat call protection' : 'Enable repeat call protection'}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                getAutomationSettings().ignoreRepeatCalls ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Private/Blocked Numbers */}
                        <div className="flex items-start justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-sm font-semibold text-gray-100">Skip blocked or hidden callers</h4>
                              <span className="text-xs px-2 py-1 bg-blue-900/30 text-blue-400 rounded-full font-medium">
                                Recommended
                              </span>
                            </div>
                            <p className="text-sm text-gray-300">
                              Prevent automated texts from being sent to callers who hide their number or appear as 'Unknown'.
                            </p>
                          </div>
                          <button
                            onClick={() => updateAutomationSetting('ignoreBlockedPrivateNumbers', !getAutomationSettings().ignoreBlockedPrivateNumbers)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-1 ${
                              getAutomationSettings().ignoreBlockedPrivateNumbers ? 'bg-blue-600' : 'bg-gray-600'
                            }`}
                            aria-label={getAutomationSettings().ignoreBlockedPrivateNumbers ? 'Disable private number blocking' : 'Enable private number blocking'}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                getAutomationSettings().ignoreBlockedPrivateNumbers ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Spam Detection */}
                        <div className="flex items-start justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Filter likely spam callers</h4>
                              <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded-full font-medium">
                                Optional
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              Reduce spam leads and unnecessary text messages from known spam or robocall numbers.
                            </p>
                          </div>
                          <button
                            onClick={() => updateAutomationSetting('ignoreSuspectedSpamCallers', !getAutomationSettings().ignoreSuspectedSpamCallers)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-1 ${
                              getAutomationSettings().ignoreSuspectedSpamCallers ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                            aria-label={getAutomationSettings().ignoreSuspectedSpamCallers ? 'Disable spam detection' : 'Enable spam detection'}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                getAutomationSettings().ignoreSuspectedSpamCallers ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Blocked Numbers List */}
                        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Blocked phone numbers</h4>
                              <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded-full font-medium">
                                Optional
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                              ReplyFlow will ignore calls from these numbers and will not create leads or send texts.
                            </p>
                          </div>
                          <textarea
                            value={getBlockedNumbersText()}
                            onChange={(e) => updateBlockedNumbers(e.target.value)}
                            rows={4}
                            placeholder="+14125551234&#10;+14125559876"
                            className="w-full px-3 py-2 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-gray-100 text-sm font-mono"
                          />
                          <div className="text-xs text-gray-400 mt-2">
                            Enter one phone number per line in format: +14125551234
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Business Hours */}
                  <div className="flex items-start justify-between p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-medium text-gray-100">Business Hours Only</h3>
                        {formBusiness.business_hours_enabled && (
                          <span className="text-xs px-2 py-1 bg-green-900/30 text-green-400 rounded-full font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mb-2">
                        Only send automated texts during your business hours (9 AM - 6 PM, Mon-Fri).
                      </p>
                      <div className="text-xs text-gray-500">
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

                  {/* Automation Status Summary */}
                  <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-800">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <h4 className="text-sm font-medium text-blue-100 mb-1">Automation Status</h4>
                        <div className="text-sm text-blue-200 space-y-1">
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
                              <span>Automation features are disabled</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Billing Section */}
              <div id="billing" className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-100 mb-4">Billing</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-100">Current Plan</h3>
                    <p className="text-sm text-gray-400">
                      {getPricingDisplay()} 
                      {isInTrialPeriod(business?.subscription_status) && ` (${getTrialDisplay()})`}
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleBillingActionClick('portal')}
                      disabled={isOpeningPortal}
                      className="px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                      Manage Billing
                    </button>
                    {needsUpgrade(business?.subscription_status) && (
                      <button
                        onClick={() => handleBillingActionClick('upgrade')}
                        disabled={isStartingCheckout}
                        className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        Upgrade Plan
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div id="danger" className="bg-gray-800 rounded-xl shadow-sm border border-red-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-100">Reset Demo Data</h3>
                    <p className="text-sm text-gray-400 mb-2">
                      Delete all leads, conversations, and messages for this business.
                    </p>
                    <button
                      onClick={() => setShowResetModal(true)}
                      className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition-colors"
                    >
                      Reset Demo Data
                    </button>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-100">Delete Account</h3>
                    <p className="text-sm text-gray-400 mb-2">
                      Permanently delete your account and all data.
                    </p>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>

          {/* Settings Action Bar */}
          <SettingsActionBar
            hasUnsavedChanges={hasUnsavedChanges}
            onSave={saveChanges}
            onDiscard={discardChanges}
            isSaving={isSaving}
            saveError={saveError}
            clearError={clearSaveError}
          />

          {/* Delete Account Modal */}
          {showDeleteModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  Delete Account
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  This permanently deletes your account, business, leads, messages, conversations, and follow-ups. This cannot be undone.
                </p>
                <div className="mb-4">
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Type <span className="font-mono font-bold">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="DELETE"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false)
                      setDeleteConfirmText('')
                    }}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                    className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? 'Deleting...' : 'Permanently Delete Account'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Reset Demo Data Modal */}
          {showResetModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  Reset Demo Data
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  This will delete all leads, conversations, messages, and follow-up jobs for this business. Business settings and subscription will remain intact. This action cannot be undone.
                </p>
                <div className="mb-4">
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Type <span className="font-mono font-bold">RESET</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="RESET"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowResetModal(false)
                      setResetConfirmText('')
                    }}
                    disabled={isResetting}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetDemoData}
                    disabled={resetConfirmText !== 'RESET' || isResetting}
                    className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResetting ? 'Resetting...' : 'Reset Demo Data'}
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
