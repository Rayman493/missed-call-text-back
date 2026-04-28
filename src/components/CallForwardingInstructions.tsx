'use client'

import { useState } from 'react'
import { formatPhoneNumber } from '@/lib/utils'

interface CallForwardingInstructionsProps {
  phoneNumber: string
  isOpen: boolean
  onClose: () => void
}

export default function CallForwardingInstructions({ phoneNumber, isOpen, onClose }: CallForwardingInstructionsProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyScript = async () => {
    const script = `Hi, I want unanswered calls from my business number forwarded to this number: ${phoneNumber}. Can you help me set up conditional call forwarding?`
    await navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyNumber = async () => {
    await navigator.clipboard.writeText(phoneNumber)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">
            How to connect ReplyFlow to your business phone
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* Explanation */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              You do not need to replace your business number. ReplyFlow works in the background by receiving missed or unanswered calls that are forwarded from your current business phone.
            </p>
          </div>

          {/* Steps */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Setup Steps:</h3>
            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">1</span>
                <p className="text-sm text-gray-700 dark:text-gray-300 pt-0.5">Copy your ReplyFlow number</p>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">2</span>
                <p className="text-sm text-gray-700 dark:text-gray-300 pt-0.5">Open your phone or carrier call forwarding settings</p>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">3</span>
                <p className="text-sm text-gray-700 dark:text-gray-300 pt-0.5">Choose missed-call, unanswered-call, or conditional forwarding</p>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">4</span>
                <p className="text-sm text-gray-700 dark:text-gray-300 pt-0.5">Forward those calls to your ReplyFlow number</p>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">5</span>
                <p className="text-sm text-gray-700 dark:text-gray-300 pt-0.5">Test by calling your business number and letting it go unanswered</p>
              </li>
            </ol>
          </div>

          {/* ReplyFlow Number Display */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Your ReplyFlow number:</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {formatPhoneNumber(phoneNumber)}
              </p>
              <button
                onClick={handleCopyNumber}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Platform-specific Instructions */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Platform-specific instructions:</h3>
            <div className="space-y-4">
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">iPhone (iOS)</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Settings → Phone → Call Forwarding → Enter your ReplyFlow number
                </p>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Android</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Phone app → Settings → Call forwarding → Enter your ReplyFlow number
                </p>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Landline/Office Phone</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Contact your phone provider to set up conditional call forwarding
                </p>
              </div>
            </div>
          </div>

          {/* Support Script */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Support script for your phone provider:</h4>
            <div className="bg-white dark:bg-gray-800 rounded p-3 mb-3">
              <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                "Hi, I want unanswered calls from my business number forwarded to this number: {formatPhoneNumber(phoneNumber)}. Can you help me set up conditional call forwarding?"
              </p>
            </div>
            <button
              onClick={handleCopyScript}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              {copied ? 'Copied!' : 'Copy Support Script'}
            </button>
          </div>

          {/* Note */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <p>Note: Set up "forward when busy" or "forward when unanswered" to only forward missed calls. This way you can still answer calls normally.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
