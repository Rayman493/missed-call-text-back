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
      <div className="bg-white dark:bg-card rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-card rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
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
                className={`flex-1 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border rounded-lg focus:outline-none focus:ring-2 placeholder-gray-400 dark:placeholder-gray-400 ${
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
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {showInstructions && business?.twilio_phone_number && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 text-center">Call Forwarding Instructions</h4>

            {/* Mental model — what forwarding does, at a glance */}
            <p className="mb-4 text-center text-xs text-blue-800/70 dark:text-blue-200/60">
              Missed call → Forwarded to ReplyFlow → ReplyFlow answers
            </p>

            {/* Forwarding code — the exact thing to dial (tap to copy) */}
            <div
              onClick={handleCopyCode}
              className="bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-800 rounded-xl py-6 px-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-all active:scale-95 select-none mb-3"
            >
              <div className="text-center">
                {business?.twilio_phone_number ? (
                  <span className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 font-mono tracking-wider break-all leading-snug">
                    *71 {formatPhoneNumber(business.twilio_phone_number)}
                  </span>
                ) : (
                  <span className="text-lg sm:text-xl font-medium text-gray-500 dark:text-gray-400 text-center px-4">
                    Your ReplyFlow number is still being set up
                  </span>
                )}
              </div>

              {/* Tap to Copy Hint */}
              <div className="text-center mt-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {copied ? '✓ Copied!' : 'Tap to copy'}
                </span>
              </div>
            </div>

            <p className="mb-4 text-center text-xs text-blue-800/80 dark:text-blue-200/80">
              Dial this code from your business phone, then press Call/Send.
            </p>

            {/* Steps */}
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <p><strong>Step 1:</strong> On your business phone, dial the code above</p>
              <p><strong>Step 2:</strong> Save the forwarding settings</p>
              <p><strong>Step 3:</strong> From another phone, call your business number and let it go unanswered</p>
            </div>

            {/* Secondary help — demoted below the primary steps */}
            <div className="mt-4 pt-3 border-t border-blue-200/60 dark:border-blue-800/50 space-y-2">
              <p className="text-[11px] text-blue-800/70 dark:text-blue-200/60">
                <span className="font-semibold">What you'll hear:</span>{' '}
                {business?.twilio_phone_number ? (
                  <>
                    Your carrier may say{' '}
                    <span className="font-mono">"Calls will be forwarded to {business.twilio_phone_number.replace('+1', '1-')}."</span>
                  </>
                ) : (
                  'Set up forwarding once your ReplyFlow number is assigned'
                )}
              </p>
              <p className="text-[11px] text-blue-800/70 dark:text-blue-200/60">
                This only activates missed-call forwarding. Your phone still rings normally.
              </p>
              <p className="text-[11px] text-blue-800/70 dark:text-blue-200/60">
                Already use voicemail? In some cases, your carrier&apos;s existing voicemail
                may answer before ReplyFlow does. If missed calls are still going to
                voicemail after call forwarding is set up, you may need to disable or
                adjust your carrier voicemail settings.
              </p>
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
