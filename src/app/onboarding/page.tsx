'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import Link from 'next/link'
import LoadingSpinner from '@/components/LoadingSpinner'
import { normalizePhoneNumber } from '@/lib/utils'
import { getTrialDisplay, getPricingDisplay, SUBSCRIPTION_STATES, isActiveSubscription } from '@/lib/subscription'
import { useSearchParams } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import SetupError from '@/components/SetupError'
import Footer from '@/components/Footer'
import { useBusiness } from '@/contexts/BusinessContext'
import { clearAnonymousAppState } from '@/lib/clear-anonymous-state'

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
  const [provisioningComplete, setProvisioningComplete] = useState(false)

  // Check for auth error from callback
  useEffect(() => {
    const authError = searchParams?.get('error')
    if (authError === 'auth_failed') {
      setError('Authentication failed. Please try signing in again.')
      console.error('[Onboarding] Auth failed, showing error message')
    }
  }, [searchParams])

  // Hard auth gate: Clear anonymous state and redirect to homepage if no session
  useEffect(() => {
    const checkAuthGate = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.error('[Onboarding] No session found, clearing anonymous state and redirecting to homepage')
        const { clearedKeys } = clearAnonymousAppState()
        console.log('[Onboarding] Anonymous State Cleanup]', {
          hasSession: false,
          pathname: window.location.pathname,
          clearedKeys,
        })
        router.replace('/')
        return
      }
      console.log('[Onboarding] Session verified, allowing access to onboarding')
    }
    checkAuthGate()
  }, [router])

  // Get current user and validate session
  useEffect(() => {
    // Get current user and validate session
    const getUser = async () => {
      console.log('[Onboarding] Validating session and user...')
      
      // First validate session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        console.error('[Onboarding] Session validation failed:', sessionError)
        console.log('[Onboarding] Redirecting unauthenticated user to sign in')
        setError('Your session expired. Please sign in again.')
        setTimeout(() => {
          router.push('/auth/signin?redirect=/onboarding')
        }, 2000)
        return
      }
      
      // Then validate user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        console.error('[Onboarding] User validation failed:', userError)
        console.log('[Onboarding] Redirecting unauthenticated user to sign in')
        setError('Your session expired. Please sign in again.')
        setTimeout(() => {
          router.push('/auth/signin?redirect=/onboarding')
        }, 2000)
        return
      }
      
      console.log('[Onboarding] Session and user validated successfully:', user.id)
      setUserId(user.id)

      // Check if user already has a business
      const { data: existingBusiness, error: existingError } = await supabase
        .from('businesses')
        .select('id, name, onboarding_status, subscription_status, twilio_phone_number')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (existingBusiness && !existingError) {
        console.log('[Onboarding Routing Decision] Raw business data:', {
          businessId: existingBusiness.id,
          raw_subscription_status: existingBusiness.subscription_status,
          raw_onboarding_status: existingBusiness.onboarding_status,
          hasTwilioNumber: !!existingBusiness.twilio_phone_number,
          stripe_customer_id: existingBusiness.stripe_customer_id,
          stripe_subscription_id: existingBusiness.stripe_subscription_id
        })
        
        // Check local cached onboarding state
        let cachedOnboardingState = null
        try {
          if (typeof window !== 'undefined') {
            const cached = localStorage.getItem('onboarding_status')
            if (cached) {
              cachedOnboardingState = cached
              console.log('[Onboarding Routing Decision] Local cached onboarding state:', cachedOnboardingState)
            }
          }
        } catch (error) {
          console.warn('[Onboarding Routing Decision] Failed to read cached onboarding state:', error)
        }
        
        // If business has a Twilio number and active subscription, redirect to new onboarding flow
        if (existingBusiness.twilio_phone_number && existingBusiness.onboarding_status !== 'completed' && isActiveSubscription(existingBusiness.subscription_status)) {
          console.log('[Onboarding Routing Decision] Derived setup route decision: /onboarding/new-onboarding')
          console.log('[Onboarding Routing Decision] Redirect allowed: Twilio number exists AND subscription active')
          
          // Verify session exists before redirecting
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) {
            console.error('[Onboarding Routing Decision] Redirect blocked: No session exists')
            console.log('[Onboarding Routing Decision] Derived setup route decision: /auth/signin (fallback)')
            router.push('/auth/signin?redirect=/onboarding')
            return
          }
          
          router.push('/onboarding/new-onboarding')
          return
        } else {
          console.log('[Onboarding Routing Decision] Redirect blocked: Missing Twilio number OR inactive subscription')
          console.log('[Onboarding Routing Decision] Twilio number exists:', !!existingBusiness.twilio_phone_number)
          console.log('[Onboarding Routing Decision] Subscription active:', isActiveSubscription(existingBusiness.subscription_status))
        }
        
        // User already has a business, check if they should be redirected
        // Only redirect to dashboard if onboarding is completed AND subscription is active
        if (existingBusiness.onboarding_status === 'completed' && isActiveSubscription(existingBusiness.subscription_status)) {
          console.log('[Onboarding Routing Decision] Derived setup route decision: /dashboard')
          console.log('[Onboarding Routing Decision] Redirect allowed: Onboarding completed AND subscription active')
          router.push('/dashboard')
          return
        } else {
          console.log('[Onboarding Routing Decision] Redirect blocked: Onboarding not completed OR inactive subscription')
          console.log('[Onboarding Routing Decision] Onboarding completed:', existingBusiness.onboarding_status === 'completed')
          console.log('[Onboarding Routing Decision] Subscription active:', isActiveSubscription(existingBusiness.subscription_status))
        }
        
        // If user has active/trialing subscription, don't restart onboarding
        if (isActiveSubscription(existingBusiness.subscription_status)) {
          console.log('[Onboarding Routing Decision] Derived setup route decision: /dashboard')
          console.log('[Onboarding Routing Decision] Redirect allowed: Subscription active')
          router.push('/dashboard')
          return
        } else {
          console.log('[Onboarding Routing Decision] Redirect blocked: Inactive subscription')
          console.log('[Onboarding Routing Decision] Subscription active:', isActiveSubscription(existingBusiness.subscription_status))
        }
        
        // Otherwise, stay on onboarding page
        console.log('[Onboarding Routing Decision] Derived setup route decision: /onboarding (stay)')
        console.log('[Onboarding Routing Decision] Stay on onboarding page: Onboarding incomplete AND no active subscription')
        setCheckingBusiness(false)
        return
      } else {
        // User needs onboarding, show the form
        console.log('[Onboarding] User needs onboarding, showing form')
        setCheckingBusiness(false)
      }
    }

    getUser()
  }, [router])

  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  // Show loading screen while checking if user needs onboarding
  if (checkingBusiness) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-slate-200 text-lg">Setting up your account...</p>
          <p className="text-slate-400 text-sm mt-2">Please wait while we prepare your workspace</p>
        </div>
      </div>
    )
  }

  // Show loading transition when provisioning is complete
  if (provisioningComplete) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-slate-200 text-lg">Setting up your dedicated ReplyFlow number...</p>
          <p className="text-slate-400 text-sm mt-2">Almost there!</p>
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
        console.log('[Onboarding] Redirecting unauthenticated user to sign in')
        // Don't clear session - it might be a temporary mobile issue
        setError('Your session expired. Please sign in again.')
        setTimeout(() => {
          router.push('/auth/signin?redirect=/onboarding')
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
      console.log('[Onboarding] Received business phone number:', businessPhone)
      const normalizedPhone = normalizePhoneNumber(businessPhone)
      console.log('[Onboarding] Normalized business phone number (E.164):', normalizedPhone)
      
      if (!normalizedPhone) {
        console.error('[Onboarding] Invalid phone number:', businessPhone)
        setError('Please enter a valid phone number.')
        return
      }

      console.log('[Onboarding] Saving business for user:', user.id)
      console.log('[Onboarding] IMPORTANT: NOT setting subscription_status to trialing - Stripe webhook should be the source of truth')
      console.log('[Onboarding] Sending business data to get-or-create API:', {
        name: businessName,
        business_phone_number: normalizedPhone,
        onboarding_status: 'completed'
      })
      // Use centralized getOrCreateBusiness API - backend will provision dedicated local number
      const response = await fetch('/api/business/get-or-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessData: {
            name: businessName,
            business_phone_number: normalizedPhone,
            auto_reply_message: `Hi, this is ${businessName}. Sorry we missed your call—how can we help? Reply STOP to opt out.`,
            sms_type: 'local_a2p',
            messaging_status: 'active',
            onboarding_status: 'completed',
            // subscription_status is NOT set here - Stripe webhook will set it to trialing after successful checkout
            // This prevents incorrect trial activation before Stripe payment is completed
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
      console.log('[Onboarding] Verifying subscription_status after save:', business.subscription_status)
      console.log('[Onboarding] Expected: null (trial should only activate after Stripe webhook)')

      // Refresh business context to update state
      await refreshBusiness()
      
      // Refresh the page to ensure all state is updated
      router.refresh()
      
      // Show loading transition before redirecting to new onboarding flow
      setLoading(true)
      setProvisioningComplete(true)
      
      // Brief delay to show loading state for better UX
      setTimeout(() => {
        // Redirect to new onboarding flow for setup
        router.push('/onboarding/new-onboarding')
      }, 1000)
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-md w-full bg-slate-800 rounded-xl shadow-lg p-5 sm:p-8">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-1 flex-1 bg-blue-600 rounded-full"></div>
              <div className="h-1 flex-1 bg-slate-600 rounded-full"></div>
            </div>
            <p className="text-xs text-slate-400 text-right">Step 1 of 2</p>
          </div>
          
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 mb-2">Welcome to ReplyFlow</h1>
          <p className="text-sm text-slate-400 mb-5">You keep your phone number. We only handle missed calls.</p>
          
          {/* Pricing Information */}
          <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3 mb-6">
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="text-green-400 font-medium">✓ {getTrialDisplay()}</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-300">{getPricingDisplay()} after trial</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-400">Cancel anytime</span>
            </div>
          </div>
          
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="text-blue-400 mt-0.5 flex-shrink-0">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-blue-200 font-medium mb-1">How it works</p>
                <p className="text-xs text-blue-300 leading-relaxed">When you can't answer a call, ReplyFlow automatically texts the customer back. You keep your regular phone number.</p>
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
                className="w-full px-3 py-3 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white text-sm"
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
                placeholder="(555) 123-4567"
                className="w-full px-3 py-3 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white text-sm"
              />
              <p className="mt-2 text-xs text-gray-400">
                The phone number customers call to reach you
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  Setting up your account...
                </>
              ) : (
                'Continue to Free Trial'
              )}
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">Takes about 2 minutes</p>
          </form>

          {/* Live Preview Section */}
          <div className="mt-8 pt-6 border-t border-gray-700">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Your auto-reply message</h3>
            <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-800">
              <p className="text-sm text-gray-200">
                "Hi, this is {businessName || 'Your Business'}. Sorry we missed your call — how can we help?"
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              This message goes out automatically when you miss a call
            </p>
          </div>

          {/* Trust Messaging */}
          <div className="mt-6 space-y-2">
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              ✓ You'll still receive all your normal calls
            </p>
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              ✓ ReplyFlow only responds when a call is missed
            </p>
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              ✓ You can turn this off anytime
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </AuthGuard>
  )
}
