'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const supabase = createBrowserClient()

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!business || !supabase) return

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const formData = new FormData(e.currentTarget)
      const businessName = formData.get('businessName') as string
      const timezone = formData.get('timezone') as string
      const autoReplyMessage = formData.get('autoReplyMessage') as string
      const instantReplyEnabled = formData.get('instantReplyEnabled') === 'on'
      const followUp1Time = formData.get('followUp1Time') as string
      const followUp2Time = formData.get('followUp2Time') as string
      const stopOnReply = formData.get('stopOnReply') === 'on'

      const updatePayload = {
        name: businessName,
        timezone: timezone,
        auto_reply_message: autoReplyMessage,
        instant_reply_enabled: instantReplyEnabled,
        follow_up_1_time: followUp1Time,
        follow_up_2_time: followUp2Time,
        stop_on_reply: stopOnReply,
      }

      console.log('[Settings] Updating business:', business.id, 'with payload:', updatePayload)

      const supabaseAny = supabase as any
      const { error: updateError } = await supabaseAny
        .from('businesses')
        .update(updatePayload)
        .eq('id', business.id)

      if (updateError) {
        console.error('[Settings] Update failed:', updateError)
        throw new Error(updateError.message || 'Failed to update settings')
      }

      setSuccess(true)
      await refreshBusiness()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      console.error('[Settings] Unexpected error updating settings:', err)
      setError(err.message || 'Failed to update settings')
    } finally {
      setLoading(false)
    }
  }

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
          <div className="p-4 sm:p-8">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Settings</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8">Control how ReplyFlow works for your business.</p>

              {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                  <p className="text-sm text-green-800 dark:text-green-300">Settings updated successfully!</p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}

              <form onSubmit={handleUpdate} className="space-y-6">
                {/* Business Info Section */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Business Info</h2>
                  <div className="space-y-4">
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

                {/* Phone & Messaging Section */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Phone & Messaging</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Your ReplyFlow Number
                      </label>
                      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                            {business.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
                          </span>
                          <span className={`text-sm px-2 py-1 rounded-full ${
                            business.twilio_phone_number 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          }`}>
                            {business.twilio_phone_number ? 'Active' : 'Pending verification'}
                          </span>
                        </div>
                        {(business as any).sms_type === 'toll_free' && (business as any).a2p_status !== 'verified' && (business as any).a2p_status !== 'approved' && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Status: Pending carrier approval
                          </p>
                        )}
                      </div>
                    </div>
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
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Automation</h2>
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
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Billing</h2>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Current Plan</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pro Plan</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">$29/month — Active</p>
                    </div>
                    <button
                      type="button"
                      className="px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Manage Subscription
                    </button>
                  </div>
                  
                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
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
            </div>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
