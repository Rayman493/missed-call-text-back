'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber } from '@/lib/utils'
import { formatForDisplay } from '@/utils/phone-formatting'
import CallForwardingInstructions from './CallForwardingInstructions'

export default function DashboardEmptyState() {
  const router = useRouter()
  const { business } = useBusiness()
  const [showTestModal, setShowTestModal] = useState(false)
  const [showInstructionsModal, setShowInstructionsModal] = useState(false)

  const handleTestSetup = () => {
    setShowTestModal(true)
  }

  const handleViewInstructions = () => {
    if (!business?.twilio_phone_number) {
      alert('Your ReplyFlow number is still being assigned. Please try again in a few minutes.')
      return
    }
    setShowInstructionsModal(true)
  }

  const hasTwilioNumber = !!business?.twilio_phone_number

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      {/* Empty State Icon */}
      <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-6">
        <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      </div>

      {/* Empty State Message */}
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3 text-center">
        No missed-call leads yet
      </h2>
      <p className="text-gray-600 dark:text-gray-400 text-center mb-8 max-w-md">
        Call your ReplyFlow number to test your setup. Missed calls and replies will appear here.
      </p>

      {/* Verification Warning */}
      {!hasTwilioNumber && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-8 max-w-md">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              SMS delivery may be limited until carrier verification is approved.
            </p>
          </div>
        </div>
      )}

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={handleTestSetup}
          className="bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 transition-colors font-medium"
        >
          Optional Real-World Test
        </button>
        <button
          onClick={handleViewInstructions}
          className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-3 px-6 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
        >
          View Setup Instructions
        </button>
      </div>

      {/* Additional Help */}
      <div className="mt-8 text-center max-w-md">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your missed calls and customer replies will appear here.
        </p>
      </div>

      {/* Test My Setup Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Test Real Missed Calls
            </h2>
            
            {/* Introductory helper text */}
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200 leading-relaxed">
                You've already experienced ReplyFlow demo. This optional test verifies that real missed calls forward correctly.
              </p>
            </div>

            {/* Phone Numbers Display */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
              <div className="mb-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Your Business Number</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">ReplyFlow Number</p>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  {business?.twilio_phone_number ? formatForDisplay(business.twilio_phone_number) : 'Assigning...'}
                </p>
              </div>
            </div>

            {/* Test Instructions */}
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">1</span>
                </div>
                <p className="leading-relaxed">
                  <strong>Call your business number</strong> from another phone.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">2</span>
                </div>
                <p className="leading-relaxed">
                  <strong>Do not answer the call.</strong> Let it ring and go to voicemail.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">3</span>
                </div>
                <p className="leading-relaxed">
                  Your missed call should forward to ReplyFlow.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">4</span>
                </div>
                <p className="leading-relaxed">
                  ReplyFlow should automatically text the caller.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">5</span>
                </div>
                <p className="leading-relaxed">
                  Check your inbox/dashboard for the conversation.
                </p>
              </div>
            </div>

            {/* Fallback Guidance */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                <strong>No pressure:</strong> If you haven't enabled forwarding yet, you can continue using ReplyFlow and configure forwarding later.
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setShowTestModal(false)}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Setup Instructions Modal */}
      <CallForwardingInstructions
        phoneNumber={business?.twilio_phone_number || ''}
        isOpen={showInstructionsModal}
        onClose={() => setShowInstructionsModal(false)}
      />
    </div>
  )
}
