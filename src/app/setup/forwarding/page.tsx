'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { normalizeForCarrier, formatForDisplay, generateForwardingCode } from '@/utils/phone-formatting'
import { formatPhoneNumber } from '@/lib/utils'
import { savePhoneSetupState, getPhoneSetupState, isPhoneSetupStateFresh } from '@/lib/phone-setup-persistence'
import { Phone, ArrowRight, CheckCircle, Copy, Video, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import { SUBSCRIPTION_STATES } from '@/lib/subscription'
import { deriveSetupState } from '@/lib/subscription-utils'

// Carrier types and their specific forwarding instructions
const CARRIER_INSTRUCTIONS: Record<string, { dialCode: string; notes?: string }> = {
  verizon: {
    dialCode: '*71 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code'
  },
  att: {
    dialCode: '*004*{{TWILIO_NUMBER}}#',
    notes: 'Press Send/Call after entering the code'
  },
  tmobile: {
    dialCode: '**61*{{TWILIO_NUMBER}}#',
    notes: 'Press Send/Call after entering the code'
  },
  comcast: {
    dialCode: '*72 {{TWILIO_NUMBER}}',
    notes: 'Press Send/Call after entering the code'
  },
  ringcentral: {
    dialCode: 'Configure in RingCentral portal settings',
    notes: 'Go to Settings → Phone System → Call Forwarding'
  },
  grasshopper: {
    dialCode: 'Configure in Grasshopper portal settings',
    notes: 'Go to Settings → Call Forwarding'
  },
  google_voice: {
    dialCode: 'Configure in Google Voice settings',
    notes: 'Go to Settings → Calls → Call Forwarding and enable conditional forwarding'
  },
  other: {
    dialCode: 'Contact your phone provider',
    notes: 'Enable conditional call forwarding for missed calls'
  }
}

const CARRIER_OPTIONS = [
  { value: 'verizon', label: 'Verizon' },
  { value: 'att', label: 'AT&T' },
  { value: 'tmobile', label: 'T-Mobile' },
  { value: 'comcast', label: 'Comcast' },
  { value: 'ringcentral', label: 'RingCentral' },
  { value: 'grasshopper', label: 'Grasshopper' },
  { value: 'google_voice', label: 'Google Voice' },
  { value: 'other', label: 'Other' }
]

export default function ForwardingSetupPage() {
  const router = useRouter()
  const { business, loading: businessLoading, refreshBusiness } = useBusiness()
  
  // All hooks must be called before any early returns
  const [phoneNumber, setPhoneNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [copiedCode, setCopiedCode] = useState(false)
  const [isForwardingEnabled, setIsForwardingEnabled] = useState(false)
  const [loadingTimeout, setLoadingTimeout] = useState(false)

  // Use business's dedicated Twilio number
  const twilioNumber = business?.twilio_phone_number || process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER || '+18336584303'
  const formattedTwilioNumber = formatForDisplay(twilioNumber)

  // Loading timeout - after 15 seconds, show recovery option
  useEffect(() => {
    if (businessLoading) {
      const timer = setTimeout(() => {
        console.log('[Forwarding Setup] Loading timeout reached - businessLoading still true after 15s')
        setLoadingTimeout(true)
      }, 15000)
      return () => clearTimeout(timer)
    } else {
      setLoadingTimeout(false)
    }
  }, [businessLoading])

  // Auto-poll when provisioning is pending
  useEffect(() => {
    if (!business || businessLoading) return

    const setupState = deriveSetupState(business)
    
    if (setupState === 'provisioning_or_number_pending') {
      console.log('[Forwarding Setup] Provisioning pending - starting auto-poll')
      
      const pollInterval = setInterval(async () => {
        try {
          console.log('[Forwarding Setup] Auto-polling for provisioning status')
          await refreshBusiness()
        } catch (error) {
          console.error('[Forwarding Setup] Auto-poll error:', error)
        }
      }, 3000) // Poll every 3 seconds

      return () => {
        console.log('[Forwarding Setup] Stopping auto-poll')
        clearInterval(pollInterval)
      }
    }
  }, [business, businessLoading, refreshBusiness])

  // Load persisted state on mount
  useEffect(() => {
    console.log('[Forwarding Setup] Loading persisted state - business:', !!business, 'businessLoading:', businessLoading)
    
    // First, try to load from business context if available
    if (business && !businessLoading) {
      console.log('[Forwarding Setup] Loading from business context:', {
        business_phone_number: business.business_phone_number,
        carrier: business.carrier,
        call_forwarding_enabled: business.call_forwarding_enabled
      })
      setPhoneNumber(business.business_phone_number || '')
      setCarrier(business.carrier || '')
      setIsForwardingEnabled(!!business.call_forwarding_enabled)
    }
    
    // Then, load from persisted state if business data is empty or incomplete
    const persistedState = getPhoneSetupState()
    const isPersistedFresh = isPhoneSetupStateFresh(persistedState)
    
    console.log('[Forwarding Setup] Persisted state:', {
      hasPersisted: !!persistedState,
      isFresh: isPersistedFresh,
      phoneNumber: persistedState?.phoneNumber,
      carrier: persistedState?.carrier
    })
    
    if (isPersistedFresh && (!business?.business_phone_number || !business?.carrier)) {
      console.log('[Forwarding Setup] Loading from persisted state')
      setPhoneNumber(persistedState.phoneNumber || phoneNumber)
      setCarrier(persistedState.carrier || carrier)
    }
  }, [business, businessLoading, phoneNumber, carrier])

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (phoneNumber || carrier) {
      savePhoneSetupState({
        phoneNumber,
        carrier,
        currentStep: carrier ? 2 : 1,
        copiedTwilioNumber: twilioNumber,
        copiedForwardingCode: carrier ? generateForwardingCode(CARRIER_INSTRUCTIONS[carrier]?.dialCode || '', twilioNumber) : undefined
      })
    }
  }, [phoneNumber, carrier, twilioNumber])
  
  console.log('[Forwarding Setup Route] Component mounted')
  console.log('[Forwarding Setup Route] Current pathname:', typeof window !== 'undefined' ? window.location.pathname : 'unknown')

  // HARD GUARD: Check subscription status BEFORE any UI rendering
  // This prevents flash of forwarding UI when subscription is not active
  if (businessLoading) {
    if (loadingTimeout) {
      // Show recovery option after timeout
      return (
        <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-4">Setup Taking Longer</h1>
            <p className="text-muted-foreground mb-6">
              We're having trouble loading your setup information. This can happen when returning from payment.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Refresh Page
              </button>
              <Link
                href="/dashboard"
                className="block w-full px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-foreground font-medium rounded-lg transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>
      )
    }
    console.log('[Forwarding Setup Route] Business data loading - showing loading')
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Loading...</p>
        </div>
      </div>
    )
  }

  if (!business) {
    console.log('[Forwarding Setup Route] Business data not loaded - showing loading')
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Loading...</p>
        </div>
      </div>
    )
  }

  console.log('[Forwarding Setup Route] Business state loaded:', {
    id: business.id,
    subscription_status: business.subscription_status,
    twilio_phone_number: business.twilio_phone_number,
    forwarding_verified: business.forwarding_verified,
    provisioning_status: business.provisioning_status,
  })

  const setupState = deriveSetupState(business)
  console.log('[Forwarding Setup Route] Derived setup state:', setupState)
  console.log('[Forwarding Setup Route] Route decision:', {
    canAccess: setupState === 'needs_forwarding' || setupState === 'needs_final_test',
    reason: setupState === 'needs_trial' ? 'Subscription not active' :
             setupState === 'loading' ? 'Business data not loaded' :
             setupState === 'provisioning_or_number_pending' ? 'Number not ready' :
             setupState === 'complete' ? 'Setup already complete' :
             'Unknown state',
    redirectTarget: '/dashboard'
  })

  // Show friendly provisioning state when number is still being set up
  if (setupState === 'provisioning_or_number_pending') {
    console.log('[Forwarding Setup Route] Provisioning pending - showing friendly message')
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Setting Up Your ReplyFlow Number</h1>
          <p className="text-muted-foreground mb-6">
            We're provisioning your ReplyFlow phone number. This usually takes less than a minute.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => refreshBusiness()}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Check Status
            </button>
            <Link
              href="/dashboard"
              className="block w-full px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-foreground font-medium rounded-lg transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // HARD GUARD: If subscription is not active, immediately redirect without rendering any UI
  if (setupState !== 'needs_forwarding' && setupState !== 'needs_final_test') {
    console.log('[Forwarding Setup Route] Blocking access - redirecting to dashboard (no UI rendered)', { setupState })
    router.replace('/dashboard')
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Loading...</p>
        </div>
      </div>
    )
  }

  console.log('[Forwarding Setup Route] Access granted - rendering forwarding UI')

  const handleForwardingEnabled = async () => {
    if (!phoneNumber || !carrier) {
      setError('Please enter your business phone number and select a carrier first.')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const supabase = createBrowserClient()
      
      // Update business with forwarding enabled and completion timestamp
      const { error } = await supabase
        .from('businesses')
        .update({
          business_phone_number: phoneNumber,
          business_phone_carrier: carrier,
          call_forwarding_enabled: true,
          call_forwarding_status: 'enabled',
          phone_setup_completed_at: new Date().toISOString(),
          onboarding_status: 'pending_test',
          updated_at: new Date().toISOString()
        })
        .eq('id', business?.id)

      if (error) throw error

      // Update local state
      setIsForwardingEnabled(true)
      
      // Refresh business data to get latest state
      await refreshBusiness()
      
      console.log('[Forwarding Setup] Forwarding enabled and saved successfully')
      
      // Navigate to test setup page
      router.push('/dashboard/test-setup')
    } catch (error) {
      console.error('[Forwarding Setup] Failed to save forwarding status:', error)
      setError('Unable to continue setup. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch (error) {
      console.error('Failed to copy code:', error)
    }
  }

  const handleOpenDialer = (dialCode: string) => {
    // URL-encode special characters for tel: protocol
    const encodedCode = dialCode.replace(/\*/g, '%2A').replace(/#/g, '%23')
    const telUrl = `tel:${encodedCode}`
    
    console.log('[Forwarding Setup] Opening dialer with code:', {
      originalCode: dialCode,
      encodedCode,
      telUrl
    })
    
    // Open dialer
    window.location.href = telUrl
  }

  const getCarrierInstructions = () => {
    if (!carrier) return null
    const instructions = CARRIER_INSTRUCTIONS[carrier]
    if (!instructions) return null

    const dialCode = generateForwardingCode(instructions.dialCode, twilioNumber)

    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
          <Phone className="w-5 h-5" />
          Setup Instructions
        </h3>
        
        <div className="bg-white dark:bg-slate-900 rounded-lg p-4 mb-4 border border-blue-100 dark:border-blue-800">
          <p className="text-sm text-muted-foreground mb-2">Dial this from your business phone:</p>
          <div className="flex items-center gap-2">
            <code className="text-2xl font-mono text-foreground flex-1 p-4 bg-slate-100 dark:bg-slate-800 rounded text-center">
              {dialCode}
            </code>
            <button
              onClick={() => handleCopyCode(dialCode)}
              className="p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground rounded transition-colors"
              title="Copy forwarding code"
            >
              {copiedCode ? (
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Forwarding to: {formattedTwilioNumber}
          </p>
        </div>
        
        {instructions.notes && (
          <p className="text-sm text-blue-900 dark:text-blue-100 mb-4">{instructions.notes}</p>
        )}
        
        <div className="text-sm text-muted-foreground space-y-2 mb-6">
          <p>You may hear your carrier confirm that calls will be forwarded to your ReplyFlow number.</p>
          <p>Your carrier may read the forwarding number aloud.</p>
          <p>If activation fails, contact your carrier and ask for conditional call forwarding.</p>
        </div>

        {/* Utility buttons */}
        <div className="flex items-center gap-3 mb-6">
          {carrier !== 'ringcentral' && carrier !== 'grasshopper' && carrier !== 'google_voice' && carrier !== 'other' && (
            <button
              onClick={() => handleOpenDialer(dialCode)}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Open Dialer
            </button>
          )}
          <button
            onClick={() => handleCopyCode(dialCode)}
            className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-foreground text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copy code
          </button>
          <button
            onClick={() => router.push('/demo')}
            className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-foreground text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Video className="w-4 h-4" />
            Watch setup demo
          </button>
        </div>

        {/* Primary action button */}
        <button
          onClick={handleForwardingEnabled}
          disabled={isSaving}
          className={`w-full px-6 py-4 text-base font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
            isSaving
              ? 'bg-blue-600 text-white cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-[0.98] text-white cursor-pointer'
          }`}
        >
          {isSaving ? (
            <>
              <div className="w-5 h-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              Preparing test setup...
            </>
          ) : (
            <>
              I've Forwarded My Calls
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>

        {/* Reassurance text */}
        <p className="text-xs text-muted-foreground text-center mt-3">
          You can disable forwarding anytime from your phone carrier settings.
        </p>
      </div>
    )
  }

  if (businessLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-background p-4 sm:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <Link 
                href="/dashboard" 
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Set up call forwarding
              </h1>
              <p className="text-muted-foreground">
                Forward missed calls from your business phone to ReplyFlow.
              </p>
            </div>

            {/* Progress indicator */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">Step 3 of 4</p>
                <p className="text-xs text-muted-foreground">Almost ready — about 1 minute left</p>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '75%' }}></div>
              </div>
            </div>

            {/* Main card */}
            <div className="bg-card rounded-xl shadow-lg p-6 sm:p-8 mb-8 border border-border">
              {/* Error message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                  <p className="text-sm text-red-900 dark:text-red-300">{error}</p>
                </div>
              )}

              {/* Step 1: Business phone number */}
              <div className="mb-8">
                <label htmlFor="phoneNumber" className="block text-sm font-medium text-foreground mb-2">
                  Your Business Phone Number
                </label>
                <input
                  id="phoneNumber"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="w-full px-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  The phone number your customers already call
                </p>
              </div>

              {/* Step 2: Carrier dropdown */}
              <div className="mb-8">
                <label htmlFor="carrier" className="block text-sm font-medium text-foreground mb-2">
                  Phone Carrier
                </label>
                <select
                  id="carrier"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full px-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                >
                  <option value="">Select your carrier</option>
                  {CARRIER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 3: Dynamic carrier instructions */}
              {getCarrierInstructions()}
            </div>

            {/* Finish later link */}
            <div className="text-center">
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Finish later
              </Link>
            </div>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
