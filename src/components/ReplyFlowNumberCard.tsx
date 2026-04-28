'use client'

import { useState } from 'react'
import { formatPhoneNumber } from '@/lib/utils'
import CallForwardingInstructions from './CallForwardingInstructions'

interface ReplyFlowNumberCardProps {
  business: any
  onTestNumber?: () => void
  testSmsLoading?: boolean
  testSmsMessage?: string
}

export default function ReplyFlowNumberCard({ business, onTestNumber, testSmsLoading, testSmsMessage }: ReplyFlowNumberCardProps) {
  const [copied, setCopied] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  const handleCopyNumber = async () => {
    if (business?.twilio_phone_number) {
      await navigator.clipboard.writeText(business.twilio_phone_number)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const phoneNumber = business?.twilio_phone_number
  const hasNumber = !!phoneNumber

  if (!hasNumber) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-gray-300 dark:hover:border-gray-600 transition">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-2xl">⏳</span>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Your ReplyFlow Number
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your ReplyFlow number is being prepared. Refresh shortly or contact support if this takes too long.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-gray-300 dark:hover:border-gray-600 transition">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Your ReplyFlow Number
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Keep using your normal business number. Forward missed or unanswered calls to your ReplyFlow number, and ReplyFlow will text the caller and save the lead automatically.
      </p>

      {/* Number Display */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Your ReplyFlow number:</p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xl sm:text-2xl font-bold text-blue-900 dark:text-blue-100">
            {formatPhoneNumber(phoneNumber)}
          </p>
          <button
            onClick={handleCopyNumber}
            className="px-3 py-1.5 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex-shrink-0"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Status Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Call tracking: Active</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Text replies: Active</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Call forwarding: Setup needed</span>
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Setup steps:</h4>
        <ol className="space-y-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 list-decimal list-inside">
          <li>Copy your ReplyFlow number</li>
          <li>Set up missed-call forwarding from your business phone</li>
          <li>Test by calling your business number and letting it go unanswered</li>
        </ol>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <button
          onClick={handleCopyNumber}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm sm:text-base"
        >
          Copy Number
        </button>
        <button
          onClick={() => setShowInstructions(true)}
          className="flex-1 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-sm sm:text-base"
        >
          View Forwarding Instructions
        </button>
        <button
          onClick={onTestNumber}
          disabled={testSmsLoading}
          className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors text-sm sm:text-base"
        >
          {testSmsLoading ? 'Testing...' : 'Test My Number'}
        </button>
      </div>

      {/* Forwarding Instructions Modal */}
      <CallForwardingInstructions
        phoneNumber={phoneNumber}
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
      />

      {/* Test SMS Message */}
      {testSmsMessage && (
        <div className={`mt-3 text-xs sm:text-sm ${testSmsMessage.startsWith('Failed') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
          {testSmsMessage}
        </div>
      )}
    </div>
  )
}
