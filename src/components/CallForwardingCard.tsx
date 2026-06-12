'use client'

import { useState } from 'react'
import { Business } from '@/lib/types'
import { formatPhoneNumber } from '@/lib/utils'

interface CallForwardingCardProps {
  business: Business | null
}

export default function CallForwardingCard({ business }: CallForwardingCardProps) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [copiedNumber, setCopiedNumber] = useState(false)

  const replyFlowNumber = business?.twilio_phone_number || ''
  const businessNumber = business?.personal_phone_number || ''
  
  // Determine forwarding status (simplified for now)
  const getForwardingStatus = () => {
    if (!replyFlowNumber) return { status: 'Not Configured', color: 'gray' }
    if (!businessNumber) return { status: 'Not Configured', color: 'gray' }
    // TODO: Add actual forwarding verification logic
    return { status: 'Needs Verification', color: 'yellow' }
  }

  const forwardingStatus = getForwardingStatus()

  const copyReplyFlowNumber = async () => {
    if (replyFlowNumber) {
      await navigator.clipboard.writeText(formatPhoneNumber(replyFlowNumber))
      setCopiedNumber(true)
      setTimeout(() => setCopiedNumber(false), 2000)
    }
  }

  const testForwarding = () => {
    // TODO: Implement forwarding test logic
    console.log('Testing forwarding...')
  }

  const getStatusColor = (color: string) => {
    switch (color) {
      case 'green': return 'bg-green-100 text-green-800'
      case 'yellow': return 'bg-yellow-100 text-yellow-800'
      case 'gray': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-gray-300 dark:hover:border-gray-600 transition">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Connect Your Business Number
          </h3>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${replyFlowNumber ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {replyFlowNumber ? 'Connected' : 'Not Connected'}
            </span>
          </div>
        </div>

        {/* ReplyFlow Number Display */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 sm:p-6 mb-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Your ReplyFlow forwarding number:</p>
          <div className="flex items-center justify-between gap-4">
            <p className="text-2xl sm:text-3xl font-bold text-blue-900 dark:text-blue-100">
              {replyFlowNumber ? formatPhoneNumber(replyFlowNumber) : 'Not assigned'}
            </p>
            <button
              onClick={copyReplyFlowNumber}
              disabled={!replyFlowNumber}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md transition-colors flex-shrink-0"
            >
              {copiedNumber ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowInstructions(true)}
            className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-sm"
          >
            View Instructions
          </button>
        </div>
      </div>

      {/* Forwarding Instructions Modal */}
      {showInstructions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                How to forward missed calls to ReplyFlow
              </h2>
              <button
                onClick={() => setShowInstructions(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-gray-700 dark:text-gray-300">
                  Ask your phone provider to set up conditional call forwarding for missed or unanswered calls to your ReplyFlow number.
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Support Script:
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  "Hi, I want unanswered or missed calls from my business number forwarded to this number: <span className="font-mono bg-white dark:bg-gray-600 px-2 py-1 rounded">{replyFlowNumber ? formatPhoneNumber(replyFlowNumber) : '[ReplyFlow number]'}</span>. Can you help me set up conditional call forwarding?"
                </p>
                <button
                  onClick={() => navigator.clipboard.writeText(`Hi, I want unanswered or missed calls from my business number forwarded to this number: ${formatPhoneNumber(replyFlowNumber)}. Can you help me set up conditional call forwarding?`)}
                  className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  Copy script
                </button>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                  Important Notes:
                </h3>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• This is conditional forwarding - only unanswered calls get forwarded</li>
                  <li>• You keep using your existing business number for all calls</li>
                  <li>• ReplyFlow handles missed calls automatically</li>
                  <li>• Test by calling your business number and letting it ring</li>
                </ul>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Common Provider Instructions:
                </h3>
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <div>
                    <strong>AT&T:</strong> Call 611 and ask for "conditional call forwarding"
                  </div>
                  <div>
                    <strong>Verizon:</strong> Call *71 + ReplyFlow number to activate, *730 to deactivate
                  </div>
                  <div>
                    <strong>T-Mobile:</strong> Call 611 or use the T-Mobile app to set up "No Answer/Busy Transfer"
                  </div>
                  <div>
                    <strong>Google Voice:</strong> Settings → Calls → Call forwarding → Enable "Forward unanswered calls"
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowInstructions(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
