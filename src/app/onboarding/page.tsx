'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import SetupError from '@/components/SetupError'
import { normalizePhoneNumber } from '@/lib/utils'
import { useBusiness } from '@/contexts/BusinessContext'

const supabase = createBrowserClient()

export default function OnboardingPage() {
  const router = useRouter()
  const { refreshBusiness } = useBusiness()
  const [businessName, setBusinessName] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [checkingBusiness, setCheckingBusiness] = useState(true)

  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  useEffect(() => {
    // Get current user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setCheckingBusiness(false)
        return // AuthGuard will handle redirect
      }
      setUserId(user.id)

      // Check if user already has a business
      const { data } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)

      const businesses = data as any[]

      if (businesses && businesses.length > 0) {
        // User already has a business, redirect to dashboard
        router.push('/dashboard')
      } else {
        // User needs onboarding, show the form
        setCheckingBusiness(false)
      }
    }

    getUser()
  }, [router])

  // Don't render anything while checking if user needs onboarding
  if (checkingBusiness) {
    return null
  }

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    setLoading(true)
    setError('')

    try {
      // Guard: ensure supabase client exists
      if (!supabase) {
        setError('App is not configured correctly. Missing Supabase client.')
        return
      }

      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(businessPhone)
      if (!normalizedPhone) {
        setError('Please enter a valid phone number.')
        return
      }

      // Insert business with user_id
      const businessPayload = {
        user_id: userId,
        name: businessName,
        twilio_phone_number: normalizedPhone,
        auto_reply_message: 'Hi, this is ReplyFlow. Sorry we missed your call—how can we help? Reply STOP to opt out.',
      }

      const { error: insertError } = await supabase
        .from('businesses')
        .insert(businessPayload as any)

      if (insertError) throw insertError

      // Refresh business context to update state
      await refreshBusiness()
      
      // Refresh the page to ensure all state is updated
      router.refresh()
      
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-gray-800 rounded-lg shadow p-8">
          <p className="text-sm text-gray-400 mb-2">Step 1 of 2</p>
          <h1 className="text-2xl font-bold text-gray-100 mb-2">Welcome to ReplyFlow</h1>
          <p className="text-gray-400 mb-6">Let's set up your business</p>
          
          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleOnboarding} className="space-y-4">
            <div>
              <label htmlFor="businessName" className="block text-sm font-medium text-gray-300 mb-2">
                Business Name
              </label>
              <input
                id="businessName"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                placeholder="e.g., ABC Plumbing"
                className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white"
              />
            </div>

            <div>
              <label htmlFor="businessPhone" className="block text-sm font-medium text-gray-300 mb-2">
                Business Phone Number
              </label>
              <input
                id="businessPhone"
                type="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                required
                placeholder="(412) 855-3010"
                className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white"
              />
              <p className="mt-1 text-xs text-gray-400">
                Enter your business phone number. We'll format it automatically.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Creating business...' : 'Set Up My Auto-Reply'}
            </button>
            <p className="text-sm text-gray-400 text-center mt-2">Takes less than 2 minutes</p>
          </form>

          {/* Live Preview Section */}
          <div className="mt-8 pt-6 border-t border-gray-700">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Preview of what your customers will receive</h3>
            <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-800">
              <p className="text-sm text-gray-200">
                "Hi, this is {businessName || 'Your Business'}. Sorry we missed your call — how can we help?"
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
