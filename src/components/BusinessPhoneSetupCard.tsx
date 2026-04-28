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
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Business Phone Setup</h3>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
            Business Phone Number
          </label>
          <div className="flex gap-2">
            <input
              type="tel"
              id="phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            />
            <button
              onClick={handleSave}
              disabled={isSaving || !phoneNumber.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {showInstructions && business?.twilio_phone_number && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-3">Call Forwarding Instructions</h4>
            <div className="space-y-3 text-sm text-blue-800">
              <p><strong>Step 1:</strong> On your business phone, dial <strong>*#61#</strong></p>
              <p><strong>Step 2:</strong> When prompted, enter your ReplyFlow number: <strong>{business.twilio_phone_number}</strong></p>
              <p><strong>Step 3:</strong> Save the forwarding settings</p>
              <p><strong>Step 4:</strong> Test by calling your business number and not answering</p>
            </div>
            
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <h5 className="font-semibold text-green-900 mb-2">Test Your Setup</h5>
              <button
                onClick={() => setSetupStatus('awaiting_test')}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Call Your Business Number
              </button>
              <p className="text-xs text-green-700 mt-2 text-center">
                Call your business number and let it ring unanswered to test call forwarding
              </p>
            </div>
          </div>
        )}

        {setupStatus === 'working' && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <h5 className="font-semibold text-green-900 mb-2">✅ Setup Complete!</h5>
            <p className="text-sm text-green-800">
              Call forwarding is working. Missed calls will be automatically processed.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
