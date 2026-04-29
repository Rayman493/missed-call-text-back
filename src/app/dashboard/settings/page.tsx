'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import Link from 'next/link'
import { formatPhoneNumber } from '@/lib/utils'
import ThemeToggle, { MobileThemeToggle } from '@/components/ThemeToggle'
import Navigation from '@/components/Navigation'
import UserDropdown from '@/components/UserDropdown'
import MobileMenu from '@/components/MobileMenu'

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
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false)
  const [isStartingCheckout, setIsStartingCheckout] = useState(false)

  const supabase = createBrowserClient()

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!business || !supabase) return

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const formData = new FormData(e.currentTarget)
      const updates: any = {}

      Array.from(formData.entries()).forEach(([key, value]) => {
        if (key.startsWith('followUp')) {
          const followUpNum = key.replace('followUp', '').replace('Time', '')
          updates[`follow_up_${followUpNum}_time`] = value
        } else if (key === 'stopOnReply') {
          updates.stop_on_reply = (e.currentTarget as any).stopOnReply.checked
        }
      })

      const { error } = await supabase
        .from('business')
        .update(updates)
        .eq('id', business.id)

      if (error) throw error

      await refreshBusiness()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError('Failed to update settings')
      console.error(err)
    } finally {
      setLoading(false)
    }
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
    console.log('[Stripe Portal] Manage Subscription clicked')
    setIsOpeningPortal(true)
    setError('')

    try {
      // Get current session for auth
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        console.error('[Stripe Portal] No session found:', sessionError)
        setError('Authentication required. Please sign in again.')
        setIsOpeningPortal(false)
        return
      }

      console.log('[Stripe Portal] Session found, creating portal session')
      
      // Call the API to create portal session
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      const data = await response.json()
      console.log('[Billing UI] portal response:', data)

      // Handle structured responses
      if (data.code === "NO_STRIPE_CUSTOMER") {
        console.log('[Billing UI] no customer, showing upgrade prompt')
        setError("You haven't started a paid subscription yet.")
        setShowUpgradePrompt(true)
        setIsOpeningPortal(false)
        return
      }

      // Check for success response with URL
      if (data.url && response.ok) {
        console.log('[Billing UI] redirecting to:', data.url)
        window.location.href = data.url
        return
      }

      // Handle error responses
      if (!response.ok) {
        console.error('[Billing UI] API error:', response.status, data)
        setError(data.error || 'Failed to open billing portal')
        setIsOpeningPortal(false)
        return
      }

      // Handle unexpected success without URL
      if (!data.url) {
        console.error('[Billing UI] Success response missing URL:', data)
        setError('Failed to open billing portal. Please try again.')
        setIsOpeningPortal(false)
        return
      }
    } catch (error) {
      console.error('[Stripe Portal] Unexpected error:', error)
      setError('Failed to open billing portal. Please try again.')
      setIsOpeningPortal(false)
    }
  }

  const handleUpgradePlan = async () => {
    console.log('[Billing UI] Starting upgrade plan flow')
    setIsStartingCheckout(true)
    setError('')

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
      })

      const data = await response.json()
      console.log('[Billing UI] checkout response:', data)

      if (!response.ok) {
        console.error('[Billing UI] Checkout API error:', response.status, data)
        setError(data.error || 'Failed to start checkout')
        setIsStartingCheckout(false)
        return
      }

      if (data.url) {
        console.log('[Billing UI] Redirecting to checkout:', data.url)
        window.location.href = data.url
      } else {
        console.error('[Billing UI] No checkout URL returned:', data)
        setError('Failed to start checkout. Please try again.')
        setIsStartingCheckout(false)
      }
    } catch (error) {
      console.error('[Billing UI] Checkout error:', error)
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
                  <p className="text-sm text-red-800 dark:text-red-300 mb-3">{error}</p>
                  {showUpgradePrompt && (
                    <div className="flex gap-3 mt-3">
                      <button
                        onClick={handleUpgradePlan}
                        disabled={isStartingCheckout}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isStartingCheckout ? 'Starting...' : 'Upgrade Plan'}
                      </button>
                      <button
                        onClick={() => {
                          setError('')
                          setShowUpgradePrompt(false)
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
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
                        defaultValue={business.name}
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
                        defaultValue={(business as any).timezone || 'America/New_York'}
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
                    
                    {/* Business Phone Display */}
                    {business.forwarding_phone_number && (
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Business Phone</span>
                        <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <span className="text-gray-900 dark:text-gray-100">
                            {formatPhoneNumber(business.forwarding_phone_number)}
                          </span>
                        </div>
                      </div>
                    )}
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
                        defaultValue={business.auto_reply_message}
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
                            defaultChecked={(business as any).instant_reply_enabled !== false}
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
                          defaultChecked={(business as any).stop_on_reply !== false}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <label htmlFor="stopOnReply" className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                          Stop follow-ups if customer replies
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Billing Section */}
                <div id="billing" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Billing</h2>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Current Plan</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pro Plan</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">$29/month — Active</p>
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
                  
                  {/* Save Button */}
                  <div className="flex justify-end pt-6 border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                    >
                      {loading ? 'Saving...' : 'Save Changes'}
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
