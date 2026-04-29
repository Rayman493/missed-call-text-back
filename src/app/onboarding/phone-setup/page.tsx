'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BusinessProvider, useBusiness } from '@/contexts/BusinessContext'

const supabase = createBrowserClient()

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

function PhoneSetupContent() {
  const router = useRouter()
  const { business, loading: businessLoading, refreshBusiness } = useBusiness()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  
  // TODO: Future enhancement - automatic forwarding verification
  // TODO: Future enhancement - test call flow
  // TODO: Future enhancement - carrier-specific screenshots
  // TODO: Future enhancement - onboarding analytics tracking

  const twilioNumber = process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER || '+18336584303'

  useEffect(() => {
    if (business && !businessLoading) {
      setPhoneNumber(business.forwarding_phone_number || '')
      setCarrier(business.carrier || '')
    }
  }, [business, businessLoading])

  const handleSave = async () => {
    if (!phoneNumber) {
      setError('Please enter your business phone number')
      return
    }

    if (!carrier) {
      setError('Please select your phone carrier')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth?mode=signin')
        return
      }

      // Update business with phone setup information
      const { error: updateError } = await supabase
        .from('businesses')
        .update({
          forwarding_phone_number: phoneNumber,
          carrier: carrier,
          onboarding_status: 'phone_setup_completed'
        })
        .eq('user_id', user.id)

      if (updateError) {
        console.error('[Phone Setup] Error updating business:', updateError)
        setError('Failed to save your information. Please try again.')
        return
      }

      // Refresh business context
      await refreshBusiness()

      // Continue to next onboarding step
      router.push('/onboarding/success')
    } catch (err: any) {
      console.error('[Phone Setup] Unexpected error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const getCarrierInstructions = () => {
    if (!carrier) return null
    const instructions = CARRIER_INSTRUCTIONS[carrier]
    if (!instructions) return null

    const dialCode = instructions.dialCode.replace('{{TWILIO_NUMBER}}', twilioNumber)

    return (
      <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-blue-100 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Setup Instructions
        </h3>
        
        <div className="bg-gray-900 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-400 mb-2">Dial this code on your phone:</p>
          <code className="text-lg font-mono text-green-400 block p-3 bg-gray-800 rounded border border-gray-700">
            {dialCode}
          </code>
        </div>
        
        {instructions.notes && (
          <p className="text-sm text-blue-200">{instructions.notes}</p>
        )}
      </div>
    )
  }

  if (businessLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-2xl w-full">
        {/* Progress indicator */}
        <div className="mb-8">
          <p className="text-xs text-gray-400 mb-2">Step 2 of 3</p>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full" style={{ width: '66%' }}></div>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8 mb-6">
          {/* Page title and subtitle */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-100 mb-3">
              Connect Your Business Number
            </h1>
            <p className="text-sm sm:text-base text-gray-400">
              Keep your existing number. ReplyFlow only activates when you miss a call.
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Step 1: Business phone number */}
          <div className="mb-6">
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-300 mb-2">
              Business Phone Number
            </label>
            <input
              id="phoneNumber"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full px-4 py-3 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-gray-100"
            />
            <p className="text-xs text-gray-500 mt-2">
              The number your customers call to reach your business
            </p>
          </div>

          {/* Step 2: Carrier dropdown */}
          <div className="mb-6">
            <label htmlFor="carrier" className="block text-sm font-medium text-gray-300 mb-2">
              Phone Carrier
            </label>
            <select
              id="carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full px-4 py-3 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-gray-100"
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

          {/* Action button */}
          <button
            onClick={handleSave}
            disabled={isSaving || !phoneNumber || !carrier}
            className="w-full bg-blue-600 text-white font-semibold py-4 px-6 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving...' : 'I Enabled Call Forwarding'}
          </button>
        </div>

        {/* How it works card */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8 mb-6">
          <h2 className="text-xl font-semibold text-gray-100 mb-6 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How it works
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-green-900/30 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">Your phone still rings normally</p>
                <p className="text-xs text-gray-400">You answer calls as usual</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-900/30 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">ReplyFlow only activates if you miss the call</p>
                <p className="text-xs text-gray-400">Automatic text response sent when you can't answer</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-900/30 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">Customers continue calling your existing number</p>
                <p className="text-xs text-gray-400">No need to change your business cards or marketing</p>
              </div>
            </div>
          </div>
        </div>

        {/* Placeholder screenshot section */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-gray-100 mb-4">Carrier Setup Guide</h2>
          <div className="bg-gray-700/50 border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
            <svg className="w-16 h-16 text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-400 text-sm">Carrier setup screenshot coming soon</p>
            <p className="text-gray-500 text-xs mt-2">Visual guides for each carrier</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PhoneSetupPage() {
  return (
    <BusinessProvider>
      <PhoneSetupContent />
    </BusinessProvider>
  )
}
