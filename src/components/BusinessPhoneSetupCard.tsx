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

  useEffect(() => {
    if (business?.forwarding_phone_number) {
      setPhoneNumber(business.forwarding_phone_number)
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
        body: JSON.stringify({ forwarding_phone_number: normalizedPhone })
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
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">Call Forwarding Instructions</h4>
            <div className="space-y-3 text-sm text-blue-800 dark:text-blue-200">
              <p><strong>Step 1:</strong> On your business phone, dial <strong>*#61#</strong></p>
              <p><strong>Step 2:</strong> When prompted, enter your ReplyFlow number: <strong>{business.twilio_phone_number}</strong></p>
              <p><strong>Step 3:</strong> Save the forwarding settings</p>
              <p><strong>Step 4:</strong> Test by calling your business number and letting it go unanswered</p>
            </div>
            
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2">Test Your Setup</h5>
              <button
                onClick={() => setSetupStatus('awaiting_test')}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
              >
                Call Your Business Number
              </button>
            </div>
          </div>
        )}

        {setupStatus === 'working' && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2">✅ Setup Complete!</h5>
            <p className="text-sm text-green-800 dark:text-green-200">Call forwarding is working. Missed calls will be automatically processed.</p>
          </div>
        )}
      </div>
    </div>
  )
}
