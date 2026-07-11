'use client'

import { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { formatPhoneNumber } from '@/lib/utils'
import { normalizeUSPhoneNumber, validatePhoneNumber } from '@/lib/phone-normalization'

interface BusinessPhoneSetupCardProps {
  business: Business | null
  onUpdate: (business: Business) => void
}

export default function BusinessPhoneSetupCard({ business, onUpdate }: BusinessPhoneSetupCardProps) {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [setupStatus, setSetupStatus] = useState<'not_configured' | 'awaiting_test' | 'working'>('not_configured')
  const [validationError, setValidationError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (business?.business_phone_number) {
      setPhoneNumber(business.business_phone_number)
      setSetupStatus(business.setup_status || 'not_configured')
    }
  }, [business])

  const handleSave = async () => {
    if (!phoneNumber.trim()) {
      return
    }

    // Validate and normalize phone number
    const validation = validatePhoneNumber(phoneNumber.trim())
    if (!validation.isValid) {
      setValidationError(validation.error || 'Enter a valid 10-digit US phone number.')
      return
    }

    const normalizedPhone = normalizeUSPhoneNumber(phoneNumber.trim())
    if (!normalizedPhone) {
      setValidationError('Enter a valid 10-digit US phone number.')
      return
    }

    setIsSaving(true)
    setValidationError('')

    try {
      const response = await fetch('/api/business/update-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_phone_number: normalizedPhone })
      })

      if (response.ok) {
        const data = await response.json()
        onUpdate(data.business)
        setSetupStatus('awaiting_test')
        setShowInstructions(true)
      } else {
        console.error('Failed to update business phone')
        setValidationError('Failed to save phone number. Please try again.')
      }
    } catch (error) {
      console.error('Error updating business phone:', error)
      setValidationError('Failed to save phone number. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(e.target.value)
    setValidationError('') // Clear validation error when user types
  }

  const handleCopyCode = async () => {
    const forwardingNumber = business?.twilio_phone_number
    if (!forwardingNumber) {
      return
    }
    const code = `*71 ${formatPhoneNumber(forwardingNumber)}`
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getStatusColor = () => {
    switch (setupStatus) {
      case 'not_configured': return 'text-gray-500'
      case 'awaiting_test': return 'text-yellow-600'
      case 'working': return 'text-green-600'
      default: return 'text-gray-500'
    }
  }

  const getStatusText = () => {
    switch (setupStatus) {
      case 'not_configured': return 'Not Configured'
      case 'awaiting_test': return 'Awaiting Test'
      case 'working': return 'Working'
      default: return 'Unknown'
    }
  }

  if (!business) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-gray-300 dark:hover:border-gray-600 transition">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-gray-300 dark:hover:border-gray-600 transition">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Business Phone Setup</h3>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Business Phone Number
          </label>
          <div className="flex gap-2">
            <div>
              <input
                type="tel"
                id="phone"
                value={phoneNumber}
                onChange={handlePhoneChange}
                placeholder="412-855-3010 or (412) 855-3010"
                className={`flex-1 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border rounded-md focus:outline-none focus:ring-2 placeholder-gray-400 dark:placeholder-gray-400 ${
                  validationError 
                    ? 'border-red-300 dark:border-red-600 focus:ring-red-500' 
                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                }`}
                disabled={isSaving}
              />
              {validationError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{validationError}</p>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving || !phoneNumber.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {showInstructions && business?.twilio_phone_number && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-4 text-center">Call Forwarding Instructions</h4>
            
            {/* Forwarding Code Box */}
            <div
              onClick={handleCopyCode}
              className="bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-all active:scale-95 select-none mb-4"
            >
              {/* Activation Code */}
              <div className="text-center mb-4">
                <span className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 font-mono tracking-wider">
                  *71
                </span>
              </div>
              
              {/* Arrow */}
              <div className="text-center mb-4">
                <svg className="w-6 h-6 mx-auto text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Phone Number */}
              <div className="text-center">
                {business?.twilio_phone_number ? (
                  <span className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 font-mono tracking-wide">
                    {formatPhoneNumber(business.twilio_phone_number)}
                  </span>
                ) : (
                  <span className="text-lg sm:text-xl font-medium text-gray-500 dark:text-gray-400 text-center px-4">
                    Your ReplyFlow number is still being set up
                  </span>
                )}
              </div>
              
              {/* Tap to Copy Hint */}
              <div className="text-center mt-4">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {copied ? '✓ Copied!' : 'Tap to copy'}
                </span>
              </div>
            </div>

            {/* What You'll Hear */}
            <div className="mb-4 p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg border border-blue-300 dark:border-blue-700">
              <p className="text-sm text-blue-900 dark:text-blue-100 text-center">
                <span className="font-semibold">What you'll hear:</span><br />
                {business?.twilio_phone_number ? (
                  <>
                    Your carrier may say:<br />
                    <span className="font-mono text-blue-800 dark:text-blue-200">"Calls will be forwarded to {business.twilio_phone_number.replace('+1', '1-')}."</span>
                  </>
                ) : (
                  <span className="text-blue-700 dark:text-blue-300">Set up forwarding once your ReplyFlow number is assigned</span>
                )}
              </p>
            </div>

            {/* Carrier Confidence Text */}
            <div className="mb-4 text-center">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                This only activates missed-call forwarding. Your phone still rings normally.
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-3 text-sm text-blue-800 dark:text-blue-200">
              <p><strong>Step 1:</strong> On your business phone, dial the code above</p>
              <p><strong>Step 2:</strong> Save the forwarding settings</p>
              <p><strong>Step 3:</strong> From another phone, call your business number and let it go unanswered</p>
            </div>
          </div>
        )}

        {setupStatus === 'working' && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2">Setup Complete</h5>
            <p className="text-sm text-green-800 dark:text-green-200">Call forwarding is working. Missed calls will be automatically processed.</p>
          </div>
        )}
      </div>
    </div>
  )
}
