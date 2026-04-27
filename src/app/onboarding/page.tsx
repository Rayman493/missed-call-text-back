'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function OnboardingPage() {
  const router = useRouter()
  const [businessName, setBusinessName] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [messagingServiceSid, setMessagingServiceSid] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    // Get current user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return // AuthGuard will handle redirect
      }
      setUserId(user.id)

      // Check if user already has a business
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)

      if (businesses && businesses.length > 0) {
        // User already has a business, redirect to dashboard
        router.push('/dashboard')
      }
    }

    getUser()
  }, [router])

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    setLoading(true)
    setError('')

    try {
      // Insert business with user_id
      const { error: insertError } = await supabase
        .from('businesses')
        .insert({
          user_id: userId,
          name: businessName,
          twilio_phone_number: businessPhone,
          twilio_messaging_service_sid: messagingServiceSid || null,
          auto_reply_message: 'Hi, this is ReplyFlow. Sorry we missed your call—how can we help? Reply STOP to opt out.',
        })

      if (insertError) throw insertError

      // Redirect to dashboard
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to create business')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to ReplyFlow</h1>
          <p className="text-gray-600 mb-6">Let's set up your business</p>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleOnboarding} className="space-y-4">
            <div>
              <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-2">
                Business Name
              </label>
              <input
                id="businessName"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                placeholder="e.g., ABC Plumbing"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="businessPhone" className="block text-sm font-medium text-gray-700 mb-2">
                Business Phone Number
              </label>
              <input
                id="businessPhone"
                type="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                required
                placeholder="+15551234567"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter your Twilio phone number
              </p>
            </div>

            <div>
              <label htmlFor="messagingServiceSid" className="block text-sm font-medium text-gray-700 mb-2">
                Twilio Messaging Service SID (Optional)
              </label>
              <input
                id="messagingServiceSid"
                type="text"
                value={messagingServiceSid}
                onChange={(e) => setMessagingServiceSid(e.target.value)}
                placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave blank if you don't have a messaging service
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Creating business...' : 'Continue to Dashboard'}
            </button>
          </form>
        </div>
      </div>
    </AuthGuard>
  )
}
