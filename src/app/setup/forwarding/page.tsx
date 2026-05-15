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
  const [phoneNumber, setPhoneNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [copiedCode, setCopiedCode] = useState(false)
  const [isForwardingEnabled, setIsForwardingEnabled] = useState(false)

  // Check if user has active subscription before allowing phone setup
  useEffect(() => {
    if (!businessLoading && business) {
      const hasSubscription = business.subscription_status === SUBSCRIPTION_STATES.TRIALING || 
                             business.subscription_status === SUBSCRIPTION_STATES.ACTIVE ||
                             business.subscription_status === SUBSCRIPTION_STATES.PAST_DUE ||
                             business.subscription_status === SUBSCRIPTION_STATES.CANCELED
      
      if (!hasSubscription) {
        console.log('[Forwarding Setup] No active subscription, redirecting to dashboard')
        router.push('/dashboard')
        return
      }
    }
  }, [business, businessLoading, router])

  // Use business's dedicated Twilio number
  const twilioNumber = business?.twilio_phone_number || process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER || '+18336584303'
  const formattedTwilioNumber = formatForDisplay(twilioNumber)

  // Load persisted state on mount
  useEffect(() => {
    // First, try to load from business context if available
    if (business && !businessLoading) {
      setPhoneNumber(business.business_phone_number || '')
      setCarrier(business.carrier || '')
      setIsForwardingEnabled(!!business.call_forwarding_enabled)
    }
    
    // Then, load from persisted state if business data is empty or incomplete
    const persistedState = getPhoneSetupState()
    const isPersistedFresh = isPhoneSetupStateFresh(persistedState)
    
    if (isPersistedFresh && (!business?.business_phone_number || !business?.carrier)) {
      setPhoneNumber(persistedState.phoneNumber || phoneNumber)
      setCarrier(persistedState.carrier || carrier)
    }
  }, [business, businessLoading])

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
              Continue to Test Setup
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
