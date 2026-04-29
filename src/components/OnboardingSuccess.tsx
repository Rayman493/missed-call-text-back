'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber } from '@/lib/utils'
import { formatForDisplay } from '@/utils/phone-formatting'

export default function OnboardingSuccess() {
  const router = useRouter()
  const { business } = useBusiness()
  const [showTestInstructions, setShowTestInstructions] = useState(false)
  const [showForwardingInstructions, setShowForwardingInstructions] = useState(false)

  const handleGoToDashboard = () => {
    router.push('/dashboard')
  }

  const handleTestSetup = () => {
    setShowTestInstructions(true)
  }

  const handleForwardingInstructions = () => {
    setShowForwardingInstructions(true)
  }

  if (!business) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading your account...</p>
        </div>
      </div>
    )
  }

  const hasTwilioNumber = !!business.twilio_phone_number

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
        {/* Success Icon */}
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Success Message */}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Your ReplyFlow account is ready
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
          ReplyFlow captures missed-call leads and manages your customer conversations.
        </p>

        {/* Business Details */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-8 text-left">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Account Details
          </h2>
          
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Business Name</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">{business.name}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Business Phone Number</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium">
                {business.forwarding_phone_number ? formatPhoneNumber(business.forwarding_phone_number) : 'Not set'}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Auto-Reply Message</p>
              <p className="text-gray-900 dark:text-gray-100 font-medium text-sm italic">
                "{business.auto_reply_message}"
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">ReplyFlow Number</p>
              <p className={`font-medium ${hasTwilioNumber ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                {hasTwilioNumber ? formatForDisplay(business.twilio_phone_number || '') : 'Assigning...'}
              </p>
              {hasTwilioNumber && (
                <p className="text-xs text-gray-400 mt-1">Forward missed calls to this number</p>
              )}
            </div>
          </div>
        </div>

        {/* Verification Warning */}
        {!hasTwilioNumber && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-8">
            <div className="flex items-center justify-center">
              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                SMS delivery may be limited until carrier verification is approved.
              </p>
            </div>
          </div>
        )}

        {/* Setup Confidence Messaging */}
        {hasTwilioNumber && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-8">
            <div className="space-y-2">
              <p className="text-sm text-green-800 dark:text-green-200">
                ✓ Customers continue calling your normal business number
              </p>
              <p className="text-sm text-green-800 dark:text-green-200">
                ✓ When you miss a call, it forwards to ReplyFlow
              </p>
              <p className="text-sm text-green-800 dark:text-green-200">
                ✓ ReplyFlow automatically texts the customer
              </p>
              <p className="text-sm text-green-800 dark:text-green-200">
                ✓ Capture missed-call leads in your ReplyFlow inbox
              </p>
              <p className="text-sm text-green-800 dark:text-green-200">
                ✓ Reply to customers directly from your dashboard
              </p>
              <p className="text-sm text-green-800 dark:text-green-200">
                ✓ Continue conversations from ReplyFlow
              </p>
            </div>
          </div>
        )}

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleGoToDashboard}
            className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Go to Dashboard
          </button>
          <button
            onClick={handleTestSetup}
            className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-3 px-6 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Optional Real-World Test
          </button>
          <button
            onClick={handleForwardingInstructions}
            className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-3 px-6 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Forwarding Instructions
          </button>
        </div>

        {/* Additional Info */}
        <div className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          <p>You can always update these settings in your dashboard.</p>
        </div>
      </div>

      {/* Test Setup Modal */}
      {showTestInstructions && (
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

            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">1</span>
                </div>
                <p className="leading-relaxed">
                  <strong>Enable missed-call forwarding</strong> to your ReplyFlow number
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">2</span>
                </div>
                <p className="leading-relaxed">
                  <strong>Call your business number</strong> from another phone (optional)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">3</span>
                </div>
                <p className="leading-relaxed"><strong>Don't answer</strong> - let it go to voicemail</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">4</span>
                </div>
                <p className="leading-relaxed"><strong>Verify ReplyFlow sends</strong> an automatic text</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">5</span>
                </div>
                <p className="leading-relaxed"><strong>Continue conversation</strong> from your dashboard</p>
              </div>
            </div>
            
            {/* Fallback option */}
            <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                <strong>No pressure:</strong> If you haven't enabled forwarding yet, you can continue using ReplyFlow and configure forwarding later.
              </p>
            </div>

            <div className="flex flex-col gap-3 mt-6">
              <button
                onClick={() => {
                  setShowTestInstructions(false)
                  router.push('/dashboard')
                }}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => setShowTestInstructions(false)}
                className="w-full bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-3 px-4 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forwarding Instructions Modal */}
      {showForwardingInstructions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              How to Turn On Missed-Call Forwarding
            </h2>
            
            <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 leading-relaxed">
                <strong>Important:</strong> Forward calls when unanswered or busy - not all calls. Your phone should ring normally.
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">General Instructions</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                  Most phone providers let you set up forwarding that only activates when you don't answer.
                </p>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Forward to this ReplyFlow number:
                  </p>
                  <p className="text-lg font-mono text-blue-600 dark:text-blue-400 break-all">
                    {business.twilio_phone_number || 'Assigning...'}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Carrier-Specific Instructions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">Verizon</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Instructions coming soon...</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">AT&T</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Instructions coming soon...</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">T-Mobile</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Instructions coming soon...</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">Google Voice</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Instructions coming soon...</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">OpenPhone</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Instructions coming soon...</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">RingCentral</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Instructions coming soon...</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-6">
              <button
                onClick={() => {
                  setShowForwardingInstructions(false)
                  setShowTestInstructions(true)
                }}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Optional Real-World Test
              </button>
              <button
                onClick={() => setShowForwardingInstructions(false)}
                className="w-full bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-3 px-4 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
