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
import { 
  getSubscriptionStatusText, 
  isInTrialPeriod, 
  needsUpgrade,
  getPricingDisplay,
  getTrialDisplay,
  SUBSCRIPTION_STATES
} from '@/lib/subscription'
import { handleBillingAction } from '@/lib/billing'

export default function SettingsPage() {
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
          smart_filtering_enabled: businessData.smart_filtering_enabled,
          only_text_unknown_callers: businessData.only_text_unknown_callers,
          repeat_call_protection_enabled: businessData.repeat_call_protection_enabled,
          repeat_call_cooldown_hours: businessData.repeat_call_cooldown_hours,
          spam_detection_enabled: businessData.spam_detection_enabled,
          after_hours_message: businessData.after_hours_message,
        })
        .eq('id', businessData.id)

      if (error) {
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

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  // Refresh business data when settings page mounts to ensure latest data
  useEffect(() => {
    if (business) {
      refreshBusiness()
    }
  }, [])

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Form is now handled by the global save system via SettingsActionBar
    // No need to handle form submission here
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return

    setIsDeleting(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers
      })

      if (!response.ok) {
        const errorData = await response.json()
        const errorMessage = errorData.step 
          ? `Failed at step: ${errorData.step}. ${errorData.error}`
          : errorData.error || 'Failed to delete account'
        throw new Error(errorMessage)
      }

      // Sign out and redirect
      await supabase.auth.signOut()
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account')
      setIsDeleting(false)
    }
  }

  const handleManageSubscription = async () => {
    console.log('[Settings] Manage Subscription clicked')
    setIsOpeningPortal(true)
    setError('')

    try {
      const result = await handleBillingAction()
      
      if (result.success && result.url) {
        console.log('[Settings] Redirecting to:', result.url, result.action)
        window.location.href = result.url
      } else {
        console.error('[Settings] Billing action failed:', result.error)
        setError(result.error || 'Failed to open billing portal')
        setIsOpeningPortal(false)
      }
    } catch (error) {
      console.error('[Settings] Unexpected error:', error)
      setError('Failed to open billing portal. Please try again.')
      setIsOpeningPortal(false)
    }
  }

  const handleUpgradePlan = async () => {
    console.log('[Settings] Upgrade Plan clicked')
    setIsStartingCheckout(true)
    setError('')

    try {
      const result = await handleBillingAction()
      
      if (result.success && result.url) {
        console.log('[Settings] Redirecting to:', result.url, result.action)
        window.location.href = result.url
      } else {
        console.error('[Settings] Billing action failed:', result.error)
        setError(result.error || 'Failed to start checkout')
        setIsStartingCheckout(false)
      }
    } catch (error) {
      console.error('[Settings] Unexpected error:', error)
      setError('Failed to start checkout. Please try again.')
      setIsStartingCheckout(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const handleResetDemoData = async () => {
    setIsResetting(true)
    setError('')
    setSuccess(false)
    setSuccessMessage('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(`/api/dev/reset-demo-data?secret=${process.env.NEXT_PUBLIC_DEV_RESET_SECRET}`, {
        method: 'POST',
        headers
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to reset demo data')
        setIsResetting(false)
        return
      }

      setSuccess(true)
      setSuccessMessage(`Demo data reset successfully! Deleted: ${result.deleted.leads} leads, ${result.deleted.messages} messages, ${result.deleted.conversations} conversations, ${result.deleted.follow_up_jobs} follow-ups`)
      
      // Refresh business data
      await refreshBusiness()
      
      // Close modal
      setShowResetModal(false)
      setResetConfirmText('')
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        setSuccess(false)
        setSuccessMessage('')
      }, 5000)
    } catch (err) {
      setError('Failed to reset demo data. Please try again.')
    } finally {
      setIsResetting(false)
    }
  }

  // Check if user is admin for demo reset visibility
  const isDemoResetEnabled = process.env.NEXT_PUBLIC_DEV_RESET_SECRET && 
                            user?.email === 'wolfieemail@gmail.com'

  if (!business) {
    return (
      <AuthGuard>
        <BusinessGuard>
          <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>
              <div className="bg-white p-6 rounded-lg shadow">
                <p className="text-gray-600">No business found. Please set up your business first.</p>
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
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden">
          {/* App Header */}
          <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 md:gap-8">
                  <Link href="/" className="flex items-center hover:opacity-90 transition">
                    <span className="text-lg md:text-xl lg:text-2xl font-semibold tracking-tight">
                      <span className="text-gray-900 dark:text-gray-100">Reply</span>
                      <span className="text-blue-600 dark:text-blue-500">Flow</span>
                    </span>
                  </Link>
                  <div className="hidden md:block">
                    <Navigation />
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="hidden sm:block">
                    <ThemeToggle />
                  </div>
                  <div className="sm:hidden">
                    <MobileThemeToggle />
                  </div>
                  <UserDropdown />
                  <MobileMenu />
                </div>
              </div>
            </div>
          </header>

          {/* Settings Action Bar */}
          <SettingsActionBar
            hasUnsavedChanges={hasUnsavedChanges}
            onSave={saveChanges}
            onDiscard={discardChanges}
            isSaving={isSaving}
            saveError={saveError}
            clearError={clearSaveError}
          />

          {/* Toast Container */}
          <ToastContainer
            toasts={toasts}
            onRemoveToast={removeToast}
          />

          {/* Main Content */}
          <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
            <div className="max-w-4xl mx-auto">
              <div className="mb-10">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Settings</h1>
                <p className="text-gray-600 dark:text-gray-400">Control how ReplyFlow works for your business.</p>
              </div>

              {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-8">
                  <p className="text-sm text-green-800 dark:text-green-300">
                    {successMessage || 'Settings updated successfully!'}
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8">
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}

              <div className="space-y-6">
                {/* Account Section */}
                <div id="account" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Account</h2>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Email
                      </label>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{user?.email || 'Not available'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Account Status
                      </label>
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">Active</p>
                    </div>
                    <div className="pt-5 border-t border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleUpdate} className="space-y-6">
                {/* Business Info Section */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Business Info</h2>
                  <div className="space-y-5">
                    <div>
                      <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Business Name
                      </label>
                      <input
                        type="text"
                        id="businessName"
                        name="businessName"
                        value={formBusiness?.name || ''}
                        onChange={(e) => updateBusiness({ name: e.target.value })}
                        required
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Timezone
                      </label>
                      <select
                        id="timezone"
                        name="timezone"
                        value={formBusiness?.business_hours_timezone || 'America/New_York'}
                        onChange={(e) => updateBusiness({ business_hours_timezone: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="America/New_York">Eastern Time</option>
                        <option value="America/Chicago">Central Time</option>
                        <option value="America/Denver">Mountain Time</option>
                        <option value="America/Los_Angeles">Pacific Time</option>
                        <option value="America/Phoenix">Arizona Time</option>
                        <option value="America/Anchorage">Alaska Time</option>
                        <option value="America/Honolulu">Hawaii Time</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* ReplyFlow Number Section */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">ReplyFlow Number</h2>
                  <div className="space-y-5">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        This is the number ReplyFlow uses to receive missed calls and send automated texts for your business.
                      </p>
                      
                      <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                          <div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Assigned ReplyFlow Number</span>
                            <div className="text-lg font-semibold text-blue-600 dark:text-blue-400 mt-1">
                              {business.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Pending assignment'}
                            </div>
                          </div>
                          <span className={`text-sm px-3 py-1 rounded-full ${
                            (business as any).messaging_status === 'active' || (business as any).a2p_status === 'verified' || (business as any).a2p_status === 'approved'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : (business as any).messaging_status === 'failed'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          }`}>
                            {(business as any).messaging_status === 'active' || (business as any).a2p_status === 'verified' || (business as any).a2p_status === 'approved'
                              ? 'Active'
                              : (business as any).messaging_status === 'failed'
                                ? 'Action needed'
                                : (business as any).sms_type === 'local_a2p'
                                  ? 'Pending campaign approval'
                                  : 'Pending verification'
                            }
                          </span>
                        </div>
                        
                        {/* Conditional warnings */}
                        {!business.twilio_phone_number && (
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                            <div className="flex items-center">
                              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                Your ReplyFlow number will be assigned after setup.
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {business.twilio_phone_number && (
                          ((business as any).messaging_status !== 'active' && (business as any).a2p_status !== 'verified' && (business as any).a2p_status !== 'approved') && (
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                              <div className="flex items-center">
                                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                  SMS delivery may be limited until carrier verification is approved.
                                </p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* Business Number Input */}
                    {formBusiness && (
                      <div>
                        <label htmlFor="businessNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Business Number
                        </label>
                        <input
                          id="businessNumber"
                          name="businessNumber"
                          type="tel"
                          value={formBusiness.business_phone_number || ''}
                          onChange={(e) => updateBusiness({ business_phone_number: e.target.value })}
                          placeholder="(412) 555-1234"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Customers call this number.
                        </p>
                      </div>
                    )}

                    {/* Forwarding Number Display */}
                    {formBusiness && formBusiness.twilio_phone_number && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Forwarding Number
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg">
                            <span className="text-gray-900 dark:text-gray-100 font-mono">
                              {formatPhoneNumber(formBusiness.twilio_phone_number)}
                            </span>
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText(formBusiness.twilio_phone_number || '')}
                            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            Copy
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Forward missed calls to this number.
                        </p>
                      </div>
                    )}

                    {/* SMS Sender Display */}
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">SMS Sender</p>
                      <p className="text-lg font-medium text-gray-900 dark:text-gray-100 font-mono">
                        +1 (833) 658-4303
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Automated texts are sent from ReplyFlow's verified messaging number.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Messaging Settings Section */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Messaging Settings</h2>
                  <div className="space-y-5">
                    <div>
                      <label htmlFor="autoReplyMessage" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Auto-Reply Message
                      </label>
                      <textarea
                        id="autoReplyMessage"
                        name="autoReplyMessage"
                        value={formBusiness?.auto_reply_message || ''}
                        onChange={(e) => updateBusiness({ auto_reply_message: e.target.value })}
                        rows={6}
                        required
                        className="w-full px-4 py-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white resize-none"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        Test My Number
                      </button>
                    </div>
                  </div>
                </div>

                {/* Automation Section */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Automation</h2>
                  <div className="space-y-8">
                    {/* Instant Reply */}
                    <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <label htmlFor="instantReplyEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Instant Reply
                        </label>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            id="instantReplyEnabled"
                            name="instantReplyEnabled"
                            checked={formBusiness?.call_forwarding_enabled !== false}
                            onChange={(e) => updateBusiness({ call_forwarding_enabled: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Automatically reply to missed calls</p>
                    </div>

                    {/* Follow-ups */}
                    <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Follow-ups</h3>
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="followUp1Time" className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                            Follow-up #1
                          </label>
                          <select
                            id="followUp1Time"
                            name="followUp1Time"
                            defaultValue={(business as any).follow_up_1_time || '15m'}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                          >
                            <option value="5m">5 minutes</option>
                            <option value="15m">15 minutes</option>
                            <option value="1h">1 hour</option>
                            <option value="4h">4 hours</option>
                            <option value="1d">1 day</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="followUp2Time" className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                            Follow-up #2
                          </label>
                          <select
                            id="followUp2Time"
                            name="followUp2Time"
                            defaultValue={(business as any).follow_up_2_time || '1d'}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                          >
                            <option value="1h">1 hour</option>
                            <option value="4h">4 hours</option>
                            <option value="1d">1 day</option>
                            <option value="3d">3 days</option>
                            <option value="1w">1 week</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Stop Conditions */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Stop Conditions</h3>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="stopOnReply"
                          name="stopOnReply"
                          checked={formBusiness?.smart_filtering_enabled !== false}
                          onChange={(e) => updateBusiness({ smart_filtering_enabled: e.target.checked })}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <label htmlFor="stopOnReply" className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                          Stop follow-ups if customer replies
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Smart Call Filtering Section - Temporarily disabled for unified save flow implementation */}
              {/* <div id="smart-filtering" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <SmartCallFiltering business={formBusiness} updateBusiness={updateBusiness} />
              </div> */}

                {/* Billing Section */}
                <div id="billing" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Billing</h2>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Current Plan</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">ReplyFlow</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{getSubscriptionStatusText(business?.subscription_status)} • {getPricingDisplay()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleManageSubscription}
                      disabled={isOpeningPortal}
                      className="px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isOpeningPortal ? 'Opening…' : 'Manage Subscription'}
                    </button>
                  </div>
                </div>
              </form>

                {/* Danger Zone */}
                <div id="danger-zone" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-red-200 dark:border-red-900 p-4 sm:p-6">
                  <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-5">Danger Zone</h2>
                  
                  {/* Reset Demo Data - Admin Only */}
                  {isDemoResetEnabled && (
                    <div className="flex items-center justify-between mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Reset Demo Data
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1.5">
                          Deletes leads, conversations, messages, and follow-up jobs for this business only. Business settings and subscription stay intact.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowResetModal(true)}
                        className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition-colors"
                      >
                        Reset Demo Data
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Permanently delete your account and all associated data
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1.5">
                        This action cannot be undone
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(true)}
                      className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Legal & Compliance */}
          <div className="mt-8">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Legal & Compliance</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link
                  href="/privacy"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/terms"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Terms of Service
                </Link>
                <Link
                  href="/compliance"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  SMS Compliance
                </Link>
              </div>
            </div>
          </div>
        </div>

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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-white"
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
      </BusinessGuard>
    </AuthGuard>
  )
}
