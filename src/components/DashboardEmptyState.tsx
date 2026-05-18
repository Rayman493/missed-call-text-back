'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber, getReplyFlowPhoneNumberDisplay } from '@/lib/utils'
import { formatForDisplay } from '@/utils/phone-formatting'
import { hasValidSubscription } from '@/lib/subscription'
import CallForwardingInstructions from './CallForwardingInstructions'

export default function DashboardEmptyState() {
  const router = useRouter()
  const { business } = useBusiness()
  const [showTestModal, setShowTestModal] = useState(false)
  const [showInstructionsModal, setShowInstructionsModal] = useState(false)

  // Only show test setup if user has valid subscription and set up number
  const canShowTestSetup = hasValidSubscription(business?.subscription_status, business?.stripe_customer_id, business?.stripe_subscription_id) && business?.twilio_phone_number

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
    <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-6">
      {/* Empty State Icon */}
      <div className="w-16 h-16 sm:w-24 sm:h-24 bg-muted rounded-full flex items-center justify-center mb-4 sm:mb-6">
        <svg className="w-8 h-8 sm:w-12 sm:h-12 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      </div>

      {/* Empty State Message */}
      <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2 sm:mb-3 text-center">
        No missed-call leads yet
      </h2>
      <p className="text-sm sm:text-base text-muted-foreground text-center mb-6 sm:mb-8 max-w-md">
        Call your ReplyFlow number to test your setup. Missed calls and replies will appear here.
      </p>

      {/* SMS Status */}
      {!hasTwilioNumber && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-8 max-w-md">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm text-green-800 dark:text-green-200">
              Your ReplyFlow texting is ready. Most messages arrive within 5–15 seconds.
            </p>
          </div>
        </div>
      )}

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        {canShowTestSetup && (
          <button
            onClick={handleTestSetup}
            className="bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Optional Real-World Test
          </button>
        )}
        <button
          onClick={handleViewInstructions}
          className="bg-secondary text-foreground py-3 px-6 rounded-lg hover:bg-secondary/80 transition-colors font-medium"
        >
          View Setup Instructions
        </button>
      </div>

      {/* Additional Help */}
      <div className="mt-8 text-center max-w-md">
        <p className="text-sm text-muted-foreground">
          Your missed calls and customer replies will appear here.
        </p>
      </div>

      {/* Test My Setup Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-foreground mb-4">
              Test Real Missed Calls
            </h2>
            
            {/* Introductory helper text */}
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200 leading-relaxed">
                You've already experienced ReplyFlow demo. This optional test verifies that real missed calls forward correctly.
              </p>
            </div>

            {/* Phone Numbers Display */}
            <div className="bg-muted rounded-lg p-4 mb-6">
              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-1">Your Business Number</p>
                <p className="text-lg font-semibold text-foreground">
                  {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">ReplyFlow Number</p>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  {business?.twilio_phone_number ? getReplyFlowPhoneNumberDisplay(business) : 'Assigning...'}
                </p>
              </div>
            </div>

            {/* Test Instructions */}
            <div className="space-y-4 text-sm text-muted-foreground mb-6">
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
            <div className="bg-muted rounded-lg p-4 mb-6">
              <p className="text-xs text-muted-foreground leading-relaxed">
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
