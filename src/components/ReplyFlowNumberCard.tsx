'use client'

import { useState } from 'react'
import { formatPhoneNumber, getReplyFlowPhoneNumber, getReplyFlowPhoneNumberDisplay } from '@/lib/utils'
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
    const phoneNumber = getReplyFlowPhoneNumber(business)
    if (phoneNumber) {
      await navigator.clipboard.writeText(phoneNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const phoneNumber = getReplyFlowPhoneNumberDisplay(business)
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
              ReplyFlow is Active
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            ReplyFlow is Active
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Handling missed calls automatically
          </p>
        </div>
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
      </div>

      {/* Number Display */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 sm:p-6 mb-6">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Your ReplyFlow number:</p>
        <div className="flex items-center justify-between gap-4">
          <p className="text-2xl sm:text-3xl font-bold text-blue-900 dark:text-blue-100">
            {formatPhoneNumber(phoneNumber)}
          </p>
          <button
            onClick={handleCopyNumber}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex-shrink-0"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onTestNumber}
          disabled={testSmsLoading}
          className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors text-sm sm:text-base"
        >
          {testSmsLoading ? 'Testing...' : 'Test SMS'}
        </button>
      </div>

      {/* Test SMS Message */}
      {testSmsMessage && (
        <div className={`mt-3 text-sm ${testSmsMessage.startsWith('Failed') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
          {testSmsMessage}
        </div>
      )}
    </div>
  )
}
