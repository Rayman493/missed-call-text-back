'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import Link from 'next/link'
import { normalizePhoneNumber, formatDisplayPhone } from '@/lib/utils'
import ThemeToggle from '@/components/ThemeToggle'

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
      const twilioPhoneNumber = formData.get('twilioPhoneNumber') as string
      const autoReplyMessage = formData.get('autoReplyMessage') as string

      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(twilioPhoneNumber)
      if (!normalizedPhone) {
        setError('Please enter a valid phone number.')
        return
      }

      const updatePayload = {
        name: businessName,
        twilio_phone_number: normalizedPhone,
        auto_reply_message: autoReplyMessage,
      }

      console.log('[Settings] Updating business:', business.id, 'with payload:', updatePayload)

      const supabaseAny = supabase as any
      const { error: updateError } = await supabaseAny
        .from('businesses')
        .update(updatePayload)
        .eq('id', business.id)

      if (updateError) {
        console.error('[Settings] Update failed:', updateError)
        throw new Error(updateError.message || 'Failed to update business')
      }

      setSuccess(true)
      await refreshBusiness()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      console.error('[Settings] Unexpected error updating business:', err)
      setError(err.message || 'Failed to update business')
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
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <nav className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  <Link href="/dashboard" className="hover:text-gray-700 dark:hover:text-gray-300">Dashboard</Link>
                  <span className="mx-2">/</span>
                  <span className="text-gray-900 dark:text-gray-100">Settings</span>
                </nav>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Business Settings</h1>
                <p className="text-gray-600 dark:text-gray-400">Configure your business information and auto-reply message.</p>
              </div>
              <ThemeToggle />
            </div>

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

            {/* Settings Form */}
            <form onSubmit={handleUpdate} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
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
                <label htmlFor="twilioPhoneNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Business Phone Number
                </label>
                <input
                  type="tel"
                  id="twilioPhoneNumber"
                  name="twilioPhoneNumber"
                  defaultValue={formatDisplayPhone(business.twilio_phone_number)}
                  required
                  placeholder="(412) 855-3010"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Enter your business phone number. We'll format it automatically.</p>
              </div>

              <div>
                <label htmlFor="autoReplyMessage" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Auto-Reply Message
                </label>
                <textarea
                  id="autoReplyMessage"
                  name="autoReplyMessage"
                  defaultValue={business.auto_reply_message}
                  rows={4}
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This message will be sent to missed callers.</p>
              </div>

              <div className="flex items-center justify-end gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
