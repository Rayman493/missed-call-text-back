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
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
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
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
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
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Settings
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Configure your ReplyFlow settings here.
                </p>
              </div>

            {/* Settings Sections */}
            <div className="space-y-8">
              {/* Account Section */}
              <div id="account" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Account</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {user?.email}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Account Status
                    </label>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {getSubscriptionStatusText(business?.subscription_status)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Business Info Section */}
              <div id="business" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Business Info</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Business Name
                    </label>
                    <input
                      type="text"
                      value={formBusiness.name || ''}
                      onChange={(e) => updateBusiness({ name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Business Phone Number
                    </label>
                    <input
                      type="tel"
                      value={formBusiness.business_phone_number || ''}
                      onChange={(e) => updateBusiness({ business_phone_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Messaging Settings */}
              <div id="messaging" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Messaging Settings</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Auto Reply Message
                    </label>
                    <textarea
                      value={formBusiness.auto_reply_message || ''}
                      onChange={(e) => updateBusiness({ auto_reply_message: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      After Hours Message
                    </label>
                    <textarea
                      value={formBusiness.after_hours_message || ''}
                      onChange={(e) => updateBusiness({ after_hours_message: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Automation Settings */}
              <div id="automation" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Automation</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Smart Filtering</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Automatically filter spam and unwanted calls</p>
                    </div>
                    <button
                      onClick={() => updateBusiness({ smart_filtering_enabled: !formBusiness.smart_filtering_enabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formBusiness.smart_filtering_enabled ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formBusiness.smart_filtering_enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Business Hours</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Only send texts during business hours</p>
                    </div>
                    <button
                      onClick={() => updateBusiness({ business_hours_enabled: !formBusiness.business_hours_enabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formBusiness.business_hours_enabled ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formBusiness.business_hours_enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Billing Section */}
              <div id="billing" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Billing</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Current Plan</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
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
              <div id="danger" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-red-200 dark:border-red-700 p-4 sm:p-6">
                <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">Danger Zone</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Reset Demo Data</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
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
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Delete Account</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
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
