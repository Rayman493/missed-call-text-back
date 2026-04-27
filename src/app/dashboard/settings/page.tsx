'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import Link from 'next/link'

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

      const updatePayload = {
        name: businessName,
        twilio_phone_number: twilioPhoneNumber,
        auto_reply_message: autoReplyMessage,
        updated_at: new Date().toISOString()
      }

      const supabaseAny = supabase as any
      const { error: updateError } = await supabaseAny
        .from('businesses')
        .update(updatePayload)
        .eq('id', business.id)

      if (updateError) {
        console.error('Failed to update business:', updateError)
        throw new Error('Failed to update business')
      }

      setSuccess(true)
      await refreshBusiness()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      console.error('Unexpected error updating business:', err)
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
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <nav className="text-sm text-gray-500 mb-4">
                <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
                <span className="mx-2">/</span>
                <span className="text-gray-900">Settings</span>
              </nav>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Business Settings</h1>
              <p className="text-gray-600">Configure your business information and auto-reply message.</p>
            </div>

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-green-800">Settings updated successfully!</p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Settings Form */}
            <form onSubmit={handleUpdate}>
              <div className="bg-white rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.405 1.405H8.02c0-1.405.594-1.405H6.375c-1.405-.594-1.405H4.317c-1.405-.594 1.405H2.68c-.426 0-.594.426-.594.426H1.405c-.426.594-.426.594H.594c0 .426.594.426.594h.821c.426 0 .594-.426.594h1.405c.426.594.426.594H16.53c.426-.594.426-.594h.821c.426 0 .594-.426.594h1.405c.426.594.426.594z"/>
                    </svg>
                    Business Settings
                  </h2>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-2">
                        Business Name
                      </label>
                      <input
                        type="text"
                        id="businessName"
                        name="businessName"
                        defaultValue={business.name}
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 hover:border-gray-400"
                      />
                    </div>
                    <div>
                      <label htmlFor="twilioPhoneNumber" className="block text-sm font-medium text-gray-700 mb-2">
                        Business Phone Number
                      </label>
                      <input
                        type="tel"
                        id="twilioPhoneNumber"
                        name="twilioPhoneNumber"
                        defaultValue={business.twilio_phone_number}
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 hover:border-gray-400"
                        pattern="\+[0-9]+"
                        title="Format: +1234567890"
                      />
                      <p className="text-xs text-gray-500 mt-1">Format: +1234567890 (with country code)</p>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="autoReplyMessage" className="block text-sm font-medium text-gray-700 mb-2">
                      Auto Reply Message
                    </label>
                    <textarea
                      id="autoReplyMessage"
                      name="autoReplyMessage"
                      defaultValue={business.auto_reply_message}
                      rows={4}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 hover:border-gray-400 resize-none"
                      placeholder="Hi, this is ReplyFlow. Sorry we missed your call—how can we help? Reply STOP to opt out."
                    />
                    <p className="text-xs text-gray-500 mt-1">This message will be sent automatically when customers miss your calls.</p>
                  </div>
                </div>
                <div className="flex justify-end mt-6 px-6 pb-6">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center px-6 py-3 text-sm font-medium text-white bg-blue-600 border border-blue-300 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 shadow-sm hover:shadow-md disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L16 7l-4-4"/>
                    </svg>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
