'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBusiness } from '@/contexts/BusinessContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import HelpAssistant from '@/components/HelpAssistant'
import { hasValidSubscription, isActiveSubscription } from '@/lib/subscription'

const supabase = createBrowserClient()

const CARRIERS = [
  { id: 'verizon', name: 'Verizon', code: '*71' },
  { id: 'at&t', name: 'AT&T', code: '*004*', suffix: '#' },
  { id: 't-mobile', name: 'T-Mobile', code: '**21*', suffix: '#' },
  { id: 'other', name: 'Other', code: null }
]

type OnboardingStep = 'number-ready' | 'enable-forwarding' | 'test-setup' | 'activation-complete'

export default function NewOnboardingPage() {
  const router = useRouter()
  const { business, refreshBusiness } = useBusiness()
  const [step, setStep] = useState<OnboardingStep>('number-ready')
  const [selectedCarrier, setSelectedCarrier] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)
  const [error, setError] = useState('')
  const [isBusinessLoaded, setIsBusinessLoaded] = useState(false)

  useEffect(() => {
    // Only evaluate routing when business is fully loaded
    if (business === undefined) {
      console.log('[Routing] Business loading...')
      return
    }

    setIsBusinessLoaded(true)

    if (!business) {
      console.log('[Routing] No business found, redirecting to auth')
      router.push('/auth?mode=signin')
      return
    }

    console.log('[Routing] Business loaded:', {
      id: business.id,
      onboarding_status: business.onboarding_status,
      forwarding_verified: business.forwarding_verified,
      twilio_phone_number: business.twilio_phone_number,
      subscription_status: business.subscription_status,
      stripe_customer_id: business.stripe_customer_id,
      stripe_subscription_id: business.stripe_subscription_id
    })

    // Check if user has valid subscription (active or trialing with Stripe IDs)
    const hasValidSub = hasValidSubscription(
      business.subscription_status,
      business.stripe_customer_id,
      business.stripe_subscription_id
    )
    const isActiveSub = isActiveSubscription(business.subscription_status)

    console.log('[Routing] Subscription check:', {
      hasValidSub,
      isActiveSub,
      subscription_status: business.subscription_status,
      stripe_customer_id: business.stripe_customer_id,
      stripe_subscription_id: business.stripe_subscription_id
    })

    // If no valid subscription, redirect to dashboard to activate trial/subscription
    if (!hasValidSub) {
      console.log('[Routing] No valid subscription, redirecting to dashboard for activation')
      router.push('/dashboard')
      return
    }

    // Check if onboarding is already completed - only redirect if BOTH conditions met
    if (business.onboarding_status === 'completed' && business.forwarding_verified === true) {
      console.log('[Routing] Onboarding complete, redirecting to dashboard')
      router.push('/dashboard')
      return
    }

    console.log('[Routing] Onboarding incomplete, staying on onboarding')
    console.log('[Routing] Reason:', {
      onboarding_status: business.onboarding_status,
      forwarding_verified: business.forwarding_verified,
      completed: business.onboarding_status === 'completed' && business.forwarding_verified === true
    })

    // If business doesn't have a Twilio number yet, go back to old onboarding
    if (!business.twilio_phone_number) {
      console.log('[Routing] No Twilio number, redirecting to old onboarding')
      
      // Verify session exists before redirecting
      supabase.auth.getSession().then(({ data: { session } }: any) => {
        if (!session) {
          console.error('[Routing] No session exists, redirecting to sign in')
          router.push('/auth/signin?redirect=/onboarding')
          return
        }
        router.push('/onboarding')
      })
      return
    }
  }, [business, router])

  const handleCopyNumber = () => {
    if (business?.twilio_phone_number) {
      navigator.clipboard.writeText(business.twilio_phone_number)
    }
  }

  const handleCarrierSelect = (carrierId: string) => {
    setSelectedCarrier(carrierId)
  }

  const handleContinueToForwarding = async () => {
    setLoading(true)
    setError('')
    
    console.log('[Onboarding] Saving carrier selection')
    console.log('[Onboarding] Carrier selected:', selectedCarrier)
    console.log('[Onboarding] Business ID:', business?.id)
    
    try {
      if (business && selectedCarrier) {
        // Get current user ID
        const { data: { user } } = await supabase.auth.getUser()
        
        // Use API endpoint to save carrier and mark onboarding as completed
        // (uses service role key for proper permissions)
        const response = await fetch('/api/onboarding/carrier', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            carrier: selectedCarrier,
            businessId: business.id,
            userId: user?.id,
            onboardingStatus: 'completed'
          })
        })

        const data = await response.json()

        if (!response.ok) {
          console.error('[Onboarding] Save failed with API error:', data.error)
          throw new Error(data.error || 'Failed to save carrier selection')
        }

        console.log('[Onboarding] Save success via API')
        console.log('[Onboarding] Onboarding marked as completed (forwarding_verified=false)')
        await refreshBusiness()
        
        console.log('[Onboarding] Redirecting to dashboard')
        
        // Redirect to dashboard instead of test-setup screen
        router.push('/dashboard')
      } else {
        console.error('[Onboarding] Missing business or carrier selection')
        setError('Please select a carrier before continuing')
      }
    } catch (err) {
      console.error('[Onboarding] Save failed:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to save carrier selection. Please try again.'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleStartTest = async () => {
    setTesting(true)
    setError('')

    try {
      // Poll for recent voice webhook activity
      let attempts = 0
      const maxAttempts = 30 // 30 seconds

      const pollInterval = setInterval(async () => {
        attempts++

        try {
          // Check for recent call events for this business
          const { data: recentCalls, error } = await supabase
            .from('call_events')
            .select('*')
            .eq('business_id', business?.id)
            .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last 60 seconds
            .order('created_at', { ascending: false })
            .limit(1)

          if (error) throw error

          if (recentCalls && recentCalls.length > 0) {
            // Verify lead was created
            const { data: leads } = await supabase
              .from('leads')
              .select('*')
              .eq('business_id', business?.id)
              .gte('created_at', new Date(Date.now() - 60000).toISOString())
              .order('created_at', { ascending: false })
              .limit(1)

            if (leads && leads.length > 0) {
              // Verify SMS was sent
              const { data: messages } = await supabase
                .from('messages')
                .select('*')
                .eq('lead_id', leads[0].id)
                .eq('direction', 'outbound')
                .limit(1)

              if (messages && messages.length > 0) {
                // Test successful
                clearInterval(pollInterval)
                setTesting(false)
                setTestSuccess(true)
                setStep('activation-complete')

                // Update business with verified status
                await supabase
                  .from('businesses')
                  .update({
                    forwarding_verified: true,
                    forwarding_verified_at: new Date().toISOString(),
                    onboarding_status: 'completed'
                  })
                  .eq('id', business?.id)

                await refreshBusiness()
              }
            }
          }

          if (attempts >= maxAttempts) {
            clearInterval(pollInterval)
            setTesting(false)
            setError('Test timed out. Please try calling your business number again.')
          }
        } catch (pollError) {
          console.error('[NewOnboarding] Polling error:', pollError)
        }
      }, 1000)
    } catch (err) {
      console.error('[NewOnboarding] Test error:', err)
      setError('Failed to start test')
      setTesting(false)
    }
  }

  const getForwardingCode = () => {
    if (!business?.twilio_phone_number) return ''
    const carrier = CARRIERS.find(c => c.id === selectedCarrier)
    if (!carrier || !carrier.code) return 'Contact your carrier to enable call forwarding'
    
    // Remove plus sign from phone number for cleaner display
    const phoneNumber = business.twilio_phone_number.replace(/^\+/, '')
    // Add space between carrier code and phone number for readability
    const code = carrier.code + ' ' + phoneNumber
    return carrier.suffix ? code + carrier.suffix : code
  }

  // Show loading screen while business is loading to prevent flicker
  if (!isBusinessLoaded) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!business) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Step 1: Number Ready with Inline Instructions */}
        {step === 'number-ready' && (
          <div className="bg-gray-800 rounded-xl p-6 sm:p-8">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-1 flex-1 bg-blue-600 rounded-full"></div>
                <div className="h-1 flex-1 bg-slate-600 rounded-full"></div>
                <div className="h-1 flex-1 bg-slate-600 rounded-full"></div>
              </div>
              <p className="text-xs text-slate-400 text-right">Step 1 of 3</p>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold mb-3">Your ReplyFlow number is ready</h1>
            <p className="text-gray-300 mb-6 text-sm sm:text-base">
              Now we'll set up call forwarding. This lets ReplyFlow automatically text back when you miss a call. You'll still receive all your normal calls.
            </p>

            {/* Visual Flow Diagram - Enhanced */}
            <div className="bg-gradient-to-br from-blue-900/30 to-green-900/30 border border-blue-500/50 rounded-lg p-6 mb-6">
              <p className="text-white font-semibold mb-4 text-center text-base">How call forwarding works:</p>
              <div className="flex flex-col items-center space-y-3 text-sm sm:text-base">
                <div className="bg-blue-600 rounded-lg px-6 py-3 text-center text-white font-semibold shadow-lg">
                  Customer Calls Your Business
                </div>
                <div className="text-2xl text-gray-400">↓</div>
                <div className="bg-gray-700 rounded-lg px-6 py-3 text-center text-white">
                  You Don't Answer
                </div>
                <div className="text-2xl text-gray-400">↓</div>
                <div className="bg-green-600 rounded-lg px-6 py-3 text-center text-white font-semibold shadow-lg">
                  Call Forwards To ReplyFlow
                </div>
                <div className="text-2xl text-gray-400">↓</div>
                <div className="bg-blue-600 rounded-lg px-6 py-3 text-center text-white font-semibold shadow-lg">
                  ReplyFlow Sends Text Back
                </div>
              </div>
            </div>

            {/* Common Mistake Warning - Enhanced */}
            <div className="bg-red-600 border-2 border-red-400 rounded-xl p-6 mb-6 shadow-lg">
              <p className="text-white font-bold mb-3 text-base flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                Common Mistake to Avoid:
              </p>
              <p className="text-white text-sm font-semibold mb-2">
                Forward YOUR BUSINESS NUMBER → TO → ReplyFlow Number
              </p>
              <p className="text-red-100 text-sm">
                Do NOT forward the ReplyFlow number to your business number. This will not work.
              </p>
            </div>

            <div className="bg-gray-700 rounded-lg p-6 mb-6">
              <p className="text-gray-400 text-sm mb-2">Your dedicated ReplyFlow number:</p>
              <div className="text-4xl sm:text-5xl font-mono text-center mb-4 break-all leading-tight bg-green-900/20 border border-green-500 rounded-lg p-4">
                {business.twilio_phone_number}
              </div>
              <button
                onClick={handleCopyNumber}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition mb-4"
              >
                Copy Number
              </button>
            </div>

            {/* Carrier Selection */}
            <div className="mb-6">
              <p className="text-gray-300 font-medium mb-3 text-sm">Who is your phone carrier?</p>
              <div className="space-y-2">
                {CARRIERS.map(carrier => (
                  <button
                    key={carrier.id}
                    onClick={() => handleCarrierSelect(carrier.id)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition ${
                      selectedCarrier === carrier.id
                        ? 'border-blue-600 bg-blue-600/20'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <div className="text-base sm:text-lg font-semibold">{carrier.name}</div>
                    {carrier.id === 'verizon' && (
                      <div className="text-xs text-gray-400 mt-1">Dial code: *71 + ReplyFlow number</div>
                    )}
                    {carrier.id === 'at&t' && (
                      <div className="text-xs text-gray-400 mt-1">Dial code: *004* + ReplyFlow number #</div>
                    )}
                    {carrier.id === 't-mobile' && (
                      <div className="text-xs text-gray-400 mt-1">Dial code: **21* + ReplyFlow number #</div>
                    )}
                    {carrier.id === 'other' && (
                      <div className="text-xs text-gray-400 mt-1">Contact your carrier for forwarding instructions</div>
                    )}
                  </button>
                ))}
              </div>

              {/* VoIP Guidance */}
              <div className="mt-4 p-4 bg-gray-700 rounded-lg">
                <p className="text-gray-300 font-semibold text-sm mb-2">Using a VoIP service?</p>
                <p className="text-gray-400 text-xs mb-2">
                  If you use RingCentral, 8x8, Grasshopper, Google Voice, or other VoIP providers, you typically set up forwarding through their website dashboard instead of dialing codes on your phone.
                </p>
                <p className="text-gray-400 text-xs">
                  Look for "Call Forwarding" or "Forwarding Settings" in your provider's online portal.
                </p>
              </div>
            </div>

            {/* Dynamic Forwarding Instructions - Simplified */}
            {selectedCarrier && selectedCarrier !== 'other' && (
              <div className="bg-gray-700 rounded-lg p-5 sm:p-6 mb-6">
                <p className="text-gray-400 text-sm mb-3 font-medium">STEP 1: Dial this code on your business phone</p>
                <div className="text-3xl sm:text-4xl font-mono text-center mb-4 break-all leading-tight bg-gray-800 rounded-lg p-4">
                  {getForwardingCode()}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(getForwardingCode())}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition mb-4 text-sm"
                >
                  Copy Code
                </button>
                <p className="text-gray-400 text-xs sm:text-sm text-center">
                  After dialing, you'll hear a confirmation tone. Your phone will still ring normally for all incoming calls.
                </p>
              </div>
            )}

            {/* Other Carrier Instructions */}
            {selectedCarrier === 'other' && (
              <div className="bg-gray-700 rounded-lg p-5 sm:p-6 mb-6">
                <p className="text-gray-400 text-sm mb-3 font-medium">STEP 1: Set up forwarding with your carrier</p>
                <p className="text-gray-300 text-sm mb-3">
                  Contact your phone provider and ask them to enable "conditional call forwarding" to your ReplyFlow number.
                </p>
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                  <p className="text-gray-400 text-xs mb-1">Forward to this number:</p>
                  <p className="text-xl font-mono text-white">{business.twilio_phone_number}</p>
                </div>
                <p className="text-gray-400 text-xs sm:text-sm">
                  Tell them: "Forward my calls when I don't answer to this number"
                </p>
              </div>
            )}

            {/* Additional Instructions */}
            {selectedCarrier && (
              <div className="bg-gray-700 rounded-lg p-5 sm:p-6 mb-6">
                <p className="text-gray-400 text-sm mb-3 font-medium">STEP 2: Test your setup</p>
                <p className="text-gray-300 text-sm">Call your business number from another phone and let it ring. ReplyFlow will automatically text back.</p>
              </div>
            )}

            {selectedCarrier && (
              <div className="bg-gray-700 rounded-lg p-5 sm:p-6 mb-6">
                <p className="text-gray-400 text-sm mb-3 font-medium">STEP 3: You're done!</p>
                <p className="text-gray-300 text-sm">ReplyFlow is now monitoring your missed calls. You can turn this off anytime.</p>
              </div>
            )}

            {/* Reassurance Text */}
            {selectedCarrier && (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-6 mb-6">
                <p className="text-blue-300 text-sm">
                  ✓ Customers still call your normal business number
                </p>
                <p className="text-blue-300 text-sm">
                  ✓ Your phone still rings normally
                </p>
              </div>
            )}

            {/* Need Help Section */}
            {selectedCarrier && (
              <div className="bg-gray-700 rounded-lg p-6 mb-6">
                <p className="text-gray-300 font-semibold mb-3 text-sm">Need help?</p>
                <p className="text-gray-400 text-sm mb-3">
                  If you're having trouble with call forwarding, we're here to help.
                </p>
                <div className="space-y-2">
                  <a
                    href="mailto:support@replyflowhq.com"
                    className="block text-blue-400 hover:text-blue-300 text-sm"
                  >
                    📧 support@replyflowhq.com
                  </a>
                  <Link
                    href="/faq"
                    className="block text-blue-400 hover:text-blue-300 text-sm"
                  >
                    📖 View Troubleshooting FAQ
                  </Link>
                </div>
              </div>
            )}

            {/* Help Assistant */}
            {selectedCarrier && (
              <div className="mt-6">
                <HelpAssistant defaultCategory="Call Forwarding" />
              </div>
            )}

            {error && (
              <div className="bg-red-600/20 border border-red-600 text-red-400 p-4 rounded-lg mb-6">
                {error}
              </div>
            )}

            <button
              onClick={handleContinueToForwarding}
              disabled={!selectedCarrier || loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition text-base sm:text-lg"
            >
              {loading ? 'Saving...' : "I've enabled forwarding"}
            </button>
          </div>
        )}

        {/* Step 2: Test Setup */}
        {step === 'test-setup' && (
          <div className="bg-gray-800 rounded-lg p-8">
            <h1 className="text-3xl font-bold mb-4">Test Your Setup</h1>
            <div className="space-y-4 mb-6">
              <div className="flex items-start">
                <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-1">1</div>
                <p className="text-gray-300">Call your business number from another phone</p>
              </div>
              <div className="flex items-start">
                <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-1">2</div>
                <p className="text-gray-300">Let the call ring</p>
              </div>
              <div className="flex items-start">
                <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-1">3</div>
                <p className="text-gray-300">ReplyFlow will verify your setup automatically</p>
              </div>
            </div>

            {error && (
              <div className="bg-red-600/20 border border-red-600 text-red-400 p-4 rounded-lg mb-6">
                {error}
              </div>
            )}

            {testing ? (
              <div className="text-center">
                <LoadingSpinner />
                <p className="text-gray-300 mt-4">Waiting for your call...</p>
              </div>
            ) : (
              <button
                onClick={handleStartTest}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition"
              >
                Start Test
              </button>
            )}
          </div>
        )}

        {/* Step 3: Activation Complete */}
        {step === 'activation-complete' && (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-3xl font-bold mb-4">ReplyFlow is Active</h1>
            <p className="text-gray-300 mb-6">
              Your setup is complete! Missed calls to your business phone will now automatically receive text-back messages.
            </p>

            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
