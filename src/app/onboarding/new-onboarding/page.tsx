'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBusiness } from '@/contexts/BusinessContext'
import LoadingSpinner from '@/components/LoadingSpinner'

const supabase = createBrowserClient()

const CARRIERS = [
  { id: 'verizon', name: 'Verizon', code: '*71' },
  { id: 'at&t', name: 'AT&T', code: '*004*#', suffix: '#' },
  { id: 't-mobile', name: 'T-Mobile', code: '**21*', suffix: '#' },
  { id: 'other', name: 'Other', code: null }
]

type OnboardingStep = 'number-ready' | 'carrier-selection' | 'enable-forwarding' | 'test-setup' | 'activation-complete'

export default function NewOnboardingPage() {
  const router = useRouter()
  const { business, refreshBusiness } = useBusiness()
  const [step, setStep] = useState<OnboardingStep>('number-ready')
  const [selectedCarrier, setSelectedCarrier] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!business) {
      router.push('/auth?mode=signin')
      return
    }

    // Check if onboarding is already completed
    if (business.onboarding_status === 'completed' && business.forwarding_verified) {
      router.push('/dashboard')
      return
    }

    // If business doesn't have a Twilio number yet, go back to old onboarding
    if (!business.twilio_phone_number) {
      router.push('/onboarding')
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
    try {
      if (business && selectedCarrier) {
        const { error } = await supabase
          .from('businesses')
          .update({ business_phone_carrier: selectedCarrier })
          .eq('id', business.id)

        if (error) throw error
        await refreshBusiness()
        setStep('enable-forwarding')
      }
    } catch (err) {
      console.error('[NewOnboarding] Error saving carrier:', err)
      setError('Failed to save carrier selection')
    } finally {
      setLoading(false)
    }
  }

  const handleForwardingEnabled = async () => {
    setLoading(true)
    try {
      if (business) {
        const { error } = await supabase
          .from('businesses')
          .update({ onboarding_status: 'awaiting_test' })
          .eq('id', business.id)

        if (error) throw error
        await refreshBusiness()
        setStep('test-setup')
      }
    } catch (err) {
      console.error('[NewOnboarding] Error updating onboarding status:', err)
      setError('Failed to update setup status')
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
    
    const code = carrier.code + business.twilio_phone_number
    return carrier.suffix ? code + carrier.suffix : code
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
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Step 1: Number Ready */}
        {step === 'number-ready' && (
          <div className="bg-gray-800 rounded-lg p-8">
            <h1 className="text-3xl font-bold mb-4">Your ReplyFlow Number Is Ready</h1>
            <p className="text-gray-300 mb-6">
              Forward missed calls from your business phone to this number to activate automatic text-back.
            </p>
            
            <div className="bg-gray-700 rounded-lg p-6 mb-6">
              <div className="text-4xl font-mono text-center mb-4">
                {business.twilio_phone_number}
              </div>
              <button
                onClick={handleCopyNumber}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition"
              >
                Copy Number
              </button>
            </div>

            <button
              onClick={() => setStep('carrier-selection')}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              Complete Setup
            </button>
          </div>
        )}

        {/* Step 2: Carrier Selection */}
        {step === 'carrier-selection' && (
          <div className="bg-gray-800 rounded-lg p-8">
            <h1 className="text-3xl font-bold mb-4">What carrier does your business phone use?</h1>
            
            <div className="space-y-3 mb-6">
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
                  <div className="text-lg font-semibold">{carrier.name}</div>
                </button>
              ))}
            </div>

            <button
              onClick={handleContinueToForwarding}
              disabled={!selectedCarrier || loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              {loading ? 'Saving...' : 'Continue'}
            </button>
          </div>
        )}

        {/* Step 3: Enable Forwarding */}
        {step === 'enable-forwarding' && (
          <div className="bg-gray-800 rounded-lg p-8">
            <h1 className="text-3xl font-bold mb-4">Enable Call Forwarding</h1>
            <p className="text-gray-300 mb-6">
              When you miss a call, your carrier will forward it to ReplyFlow automatically so we can text the customer back instantly.
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Your customers will still call your normal business number. ReplyFlow only handles missed calls.
            </p>
            
            <div className="bg-gray-700 rounded-lg p-6 mb-6">
              <p className="text-gray-400 text-sm mb-4">From your business phone, dial exactly as shown:</p>
              <div className="text-4xl sm:text-5xl font-mono text-center mb-4 break-all leading-tight">
                {getForwardingCode()}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(getForwardingCode())}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition mb-4 text-lg"
              >
                Copy Code
              </button>
              <p className="text-yellow-500 text-sm text-center">
                ⚠️ You must dial this from your actual business phone.
              </p>
            </div>

            <button
              onClick={handleForwardingEnabled}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              {loading ? 'Saving...' : "I've Enabled Forwarding"}
            </button>
          </div>
        )}

        {/* Step 4: Test Setup */}
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

        {/* Step 5: Activation Complete */}
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
