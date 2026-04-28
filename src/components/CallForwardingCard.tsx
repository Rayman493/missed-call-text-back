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
    if (!replyFlowNumber) return { status: 'Not set up', color: 'gray' }
    if (!businessNumber) return { status: 'Not set up', color: 'gray' }
    // TODO: Add actual forwarding test logic
    return { status: 'Needs test', color: 'yellow' }
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-gray-600 dark:hover:border-gray-500 transition">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-xl sm:text-2xl">📞</span>
          </div>
          <div className="ml-3 sm:ml-4 flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Connect Your Existing Business Number
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Keep using your current business number. Set up missed-call forwarding so unanswered calls are sent to your ReplyFlow number. When ReplyFlow receives the missed call, we automatically text the caller and save the lead.
            </p>
            
            <div className="mt-3 sm:mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Business phone number:
                </span>
                <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">
                  {businessNumber ? formatPhoneNumber(businessNumber) : 'Not set'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  ReplyFlow forwarding number:
                </span>
                <span className="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400">
                  {replyFlowNumber ? formatPhoneNumber(replyFlowNumber) : 'Not assigned'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Call forwarding status:
                </span>
                <span className={`text-xs sm:text-sm font-medium px-2 py-1 rounded-full ${getStatusColor(forwardingStatus.color)}`}>
                  {forwardingStatus.status}
                </span>
              </div>
            </div>

            <div className="mt-4 sm:mt-6">
              <h4 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Steps to set up:
              </h4>
              <ol className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                <li>Copy your ReplyFlow number</li>
                <li>Set up conditional call forwarding from your business phone to this number</li>
                <li>Call your business number and let it go unanswered to test</li>
              </ol>
            </div>

            <div className="mt-4 sm:mt-6 flex flex-wrap gap-2">
              <button
                onClick={copyReplyFlowNumber}
                disabled={!replyFlowNumber}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs sm:text-sm font-medium rounded-md transition-colors"
              >
                {copiedNumber ? 'Copied!' : 'Copy ReplyFlow Number'}
              </button>
              
              <button
                onClick={() => setShowInstructions(true)}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-xs sm:text-sm font-medium rounded-md transition-colors"
              >
                View Forwarding Instructions
              </button>
              
              <button
                onClick={testForwarding}
                disabled={!replyFlowNumber || !businessNumber}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-xs sm:text-sm font-medium rounded-md transition-colors"
              >
                I Set Up Forwarding — Test It
              </button>
            </div>
          </div>
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
                  className="mt-2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
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
