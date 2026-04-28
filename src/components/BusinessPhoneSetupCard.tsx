'use client'

import { useState, useEffect } from 'react'
import { Business } from '@/lib/types'

interface BusinessPhoneSetupCardProps {
  business: Business | null
  onUpdate: (business: Business) => void
}

export default function BusinessPhoneSetupCard({ business, onUpdate }: BusinessPhoneSetupCardProps) {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [setupStatus, setSetupStatus] = useState<'not_configured' | 'awaiting_test' | 'working'>('not_configured')

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

    setIsSaving(true)
    try {
      const response = await fetch('/api/business/update-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forwarding_phone_number: phoneNumber.trim() })
      })

      if (response.ok) {
        const data = await response.json()
        onUpdate(data.business)
        setSetupStatus('awaiting_test')
        setShowInstructions(true)
      } else {
        console.error('Failed to update business phone')
      }
    } catch (error) {
      console.error('Error updating business phone:', error)
    } finally {
      setIsSaving(false)
    }
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Business Phone Setup</h3>
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
            <input
              type="tel"
              id="phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="flex-1 px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            />
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
