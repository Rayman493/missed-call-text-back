'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import SetupError from '@/components/SetupError'
import { normalizePhoneNumber } from '@/lib/utils'
import { useBusiness } from '@/contexts/BusinessContext'

const supabase = createBrowserClient()

export default function OnboardingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refreshBusiness } = useBusiness()
  const [user, setUser] = useState<any>(null)
  const [checkingBusiness, setCheckingBusiness] = useState(true)
  const [error, setError] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // Check for auth error from callback
  useEffect(() => {
    const authError = searchParams?.get('error')
    if (authError === 'auth_failed') {
      setError('Authentication failed. Please try signing in again.')
      console.error('[Onboarding] Auth failed, showing error message')
    }
  }, [searchParams])

  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  useEffect(() => {
    // Get current user and validate session
    const getUser = async () => {
      console.log('[Onboarding] Validating session and user...')
      
      // First validate session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        console.error('[Onboarding] Session validation failed:', sessionError)
        // Clear any stale session
        await supabase.auth.signOut()
        setError('Your session expired. Please sign in again.')
        setTimeout(() => {
          router.push('/auth?mode=signin')
        }, 2000)
        return
      }
      
      // Then validate user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        console.error('[Onboarding] User validation failed:', userError)
        // Clear any stale session
        await supabase.auth.signOut()
        setError('Your session expired. Please sign in again.')
        setTimeout(() => {
          router.push('/auth?mode=signin')
        }, 2000)
        return
      }
      
      console.log('[Onboarding] Session and user validated successfully:', user.id)
      setUserId(user.id)

      // Check if user already has a business
      const { data: existingBusiness, error: existingError } = await supabase
        .from('businesses')
        .select('id, name')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (existingBusiness && !existingError) {
        console.log('[Onboarding] User already has business:', existingBusiness.id, 'onboarding_status:', existingBusiness.onboarding_status, 'redirecting to dashboard')
        // User already has a business, check onboarding status before redirecting
        if (existingBusiness.onboarding_status === 'completed') {
          console.log('[Onboarding] Onboarding completed, redirecting to dashboard')
          router.push('/dashboard')
        } else {
          console.log('[Onboarding] Onboarding incomplete, staying on onboarding page')
          setCheckingBusiness(false)
        }
        return
      } else {
        // User needs onboarding, show the form
        console.log('[Onboarding] User needs onboarding, showing form')
        setCheckingBusiness(false)
      }
    }

    getUser()
  }, [router])

  // Show loading screen while checking if user needs onboarding
  if (checkingBusiness) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-200 text-lg">Setting up your account...</p>
          <p className="text-gray-400 text-sm mt-2">Please wait while we prepare your workspace</p>
        </div>
      </div>
    )
  }

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[Onboarding] Complete Setup clicked')
    
    setLoading(true)
    setError('')

    try {
      // Guard: ensure supabase client exists
      if (!supabase) {
        console.error('[Onboarding] Supabase client not available')
        setError('App is not configured correctly. Missing Supabase client.')
        return
      }

      // Validate current session and user before proceeding
      console.log('[Onboarding] Validating current session before saving...')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      console.log('[Onboarding] Current session:', session ? 'valid' : 'invalid')
      console.log('[Onboarding] Current user:', user ? user.id : 'none')
      
      if (sessionError || !session || userError || !user) {
        console.error('[Onboarding] Invalid session/user during save:', { sessionError, userError })
        // Clear stale session and redirect
        await supabase.auth.signOut()
        setError('Your session expired. Please sign in again.')
        setTimeout(() => {
          router.push('/auth?mode=signin')
        }, 2000)
        return
      }

      // Validate form inputs
      if (!businessName.trim()) {
        console.error('[Onboarding] Missing business name')
        setError('Please enter a business name.')
        return
      }

      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(businessPhone)
      if (!normalizedPhone) {
        console.error('[Onboarding] Invalid phone number:', businessPhone)
        setError('Please enter a valid phone number.')
        return
      }

      console.log('[Onboarding] Saving business for user:', user.id)
      // Use centralized getOrCreateBusiness API - backend will auto-assign shared ReplyFlow number
      const response = await fetch('/api/business/get-or-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessData: {
            name: businessName,
            forwarding_phone_number: normalizedPhone,
            auto_reply_message: `Hi, this is ${businessName}. Sorry we missed your call—how can we help? Reply STOP to opt out.`,
            sms_type: 'toll_free',
            messaging_status: 'active',
            onboarding_status: 'completed',
            subscription_status: 'trialing',
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[Onboarding] Save error:', response.status, errorData)
        const errorMessage = errorData.step
          ? `Failed at step: ${errorData.step}. ${errorData.error}`
          : errorData.error || 'Failed to create business'
        throw new Error(errorMessage)
      }

      const data = await response.json()
      const business = data.business

      if (!business) {
        console.error('[Onboarding] No business returned from API. Response:', data)
        throw new Error('Failed to create business: no business in response')
      }

      console.log('[Onboarding] Save success: business created/updated:', business.id)

      // Refresh business context to update state
      await refreshBusiness()
      
      // Refresh the page to ensure all state is updated
      router.refresh()
      
      // Redirect to success screen
      router.push('/onboarding/success')
    } catch (err: any) {
      console.error('[Onboarding] Save failed:', err)
      const errorMessage = err.message || 'Failed to create business'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-6 sm:p-8">
          <p className="text-xs text-gray-400 mb-2">Step 1 of 3</p>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-100 mb-2">Welcome to ReplyFlow</h1>
          <p className="text-sm text-gray-400 mb-6">Let's set up automatic missed-call texting</p>
          
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="text-blue-400 mt-0.5 flex-shrink-0">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-blue-200 font-medium mb-1">How ReplyFlow Works</p>
                <p className="text-xs text-blue-300 leading-relaxed">Customers call your normal number. When you miss a call, we automatically text them back.</p>
              </div>
            </div>
          </div>
          
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
                className="w-full px-3 py-3 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white"
              />
            </div>

            <div>
              <label htmlFor="businessPhone" className="block text-sm font-medium text-gray-300 mb-2">
                Your Business Phone Number
              </label>
              <input
                id="businessPhone"
                type="tel"
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                required
                placeholder="(412) 855-3010"
                className="w-full px-3 py-3 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white"
              />
              <p className="mt-2 text-xs text-gray-400">
                The number your customers call.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 text-base font-medium"
            >
              {loading ? 'Setting up your business...' : 'Continue to Step 2'}
            </button>
            <p className="text-sm text-gray-400 text-center mt-3">Setup takes only a few minutes</p>
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

          {/* Trust Messaging */}
          <div className="mt-6 space-y-3">
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              ✓ Customers continue calling your normal business number
            </p>
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              ✓ ReplyFlow works behind the scenes automatically
            </p>
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              ✓ Setup usually takes only a few minutes
            </p>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
