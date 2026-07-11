'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber, getReplyFlowPhoneNumberDisplay } from '@/lib/utils'
import { formatForDisplay } from '@/utils/phone-formatting'
import { hasActiveAccess } from '@/lib/subscription-utils'
import { hasValidSubscription } from '@/lib/subscription'
import CallForwardingInstructions from './CallForwardingInstructions'
import BrandIcon from './BrandIcon'

export default function DashboardEmptyState() {
  const router = useRouter()
  const { business } = useBusiness()
  const [showTestModal, setShowTestModal] = useState(false)
  const [showInstructionsModal, setShowInstructionsModal] = useState(false)

  // Only show test setup if user has active access and set up number
  const canShowTestSetup = hasActiveAccess(business) && business?.twilio_phone_number
  
  // Check if user needs to start trial (no active subscription)
  const needsTrial = !hasActiveAccess(business)

  const handleTestSetup = () => {
    setShowTestModal(true)
  }

  const handleCloseTestModal = () => {
    setShowTestModal(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCloseTestModal()
    }
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
    <div className="flex flex-col items-center justify-center py-8 px-6">
      {/* Empty State Icon */}
      <div className="inline-flex items-center justify-center mb-4">
        <BrandIcon size={64} />
      </div>

      {/* Empty State Message */}
      <h2 className="text-xl font-semibold text-foreground mb-2 text-center">
        You're ready to start recovering customers
      </h2>
      <p className="text-sm text-slate-400 text-center mb-6 max-w-md">
        Your first missed call will appear here automatically.
      </p>

      {/* SMS Status */}
      {!hasTwilioNumber && (
        <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-3 mb-6 max-w-md">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm text-green-200">
              Your ReplyFlow texting is ready
            </p>
          </div>
        </div>
      )}

      {/* Trial CTA for users without active subscription */}
      {needsTrial && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 mb-6 max-w-md shadow-lg">
          <h3 className="text-white font-semibold mb-2">Start your 14-day free trial</h3>
          <p className="text-blue-100 text-sm mb-4">
            Get your ReplyFlow number and start recovering customers immediately. No credit card required.
          </p>
          <button
            onClick={() => router.push('/pricing')}
            className="w-full bg-white text-blue-600 py-2.5 px-4 rounded-lg hover:bg-blue-50 transition-colors font-semibold text-sm"
          >
            Start Free Trial
          </button>
        </div>
      )}

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        {canShowTestSetup && (
          <button
            onClick={handleTestSetup}
            className="bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors duration-150 font-medium text-sm"
          >
            Test Your Setup
          </button>
        )}
        <button
          onClick={handleViewInstructions}
          className="bg-slate-800 text-foreground py-2.5 px-4 rounded-lg hover:bg-slate-700 transition-colors duration-150 font-medium text-sm"
        >
          View Setup Instructions
        </button>
      </div>

      {/* Test My Setup Modal */}
      {showTestModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="test-modal-title"
          onKeyDown={handleKeyDown}
        >
          <div className="bg-card rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" tabIndex={-1}>
            <h2 id="test-modal-title" className="text-xl font-bold text-foreground mb-4">
              Test Your Setup
            </h2>
            
            {/* Introductory helper text */}
            <div className="mb-6 p-4 bg-green-900/20 rounded-lg">
              <p className="text-sm text-green-200 leading-relaxed">
                This test verifies that real missed calls forward correctly.
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
                <p className="text-lg font-semibold text-blue-400">
                  {business?.twilio_phone_number ? getReplyFlowPhoneNumberDisplay(business) : 'Assigning...'}
                </p>
              </div>
            </div>

            {/* Test Instructions */}
            <div className="space-y-4 text-sm text-muted-foreground mb-6">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-400 font-semibold text-xs">1</span>
                </div>
                <p className="leading-relaxed">
                  <strong>Call your business number</strong> from another phone.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-400 font-semibold text-xs">2</span>
                </div>
                <p className="leading-relaxed">
                  <strong>Do not answer the call.</strong> Let it ring and go to voicemail.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-400 font-semibold text-xs">3</span>
                </div>
                <p className="leading-relaxed">
                  Your missed call will forward to ReplyFlow.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-400 font-semibold text-xs">4</span>
                </div>
                <p className="leading-relaxed">
                  ReplyFlow will automatically text the caller.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-400 font-semibold text-xs">5</span>
                </div>
                <p className="leading-relaxed">
                  Check your inbox/dashboard for the conversation.
                </p>
              </div>
            </div>

            {/* Fallback Guidance */}
            <div className="bg-muted rounded-lg p-4 mb-6">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Note:</strong> If you haven't enabled forwarding yet, you can configure it later.
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={handleCloseTestModal}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors duration-150 font-medium"
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
