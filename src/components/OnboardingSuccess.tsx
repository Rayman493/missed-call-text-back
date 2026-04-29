'use client'

import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber } from '@/lib/utils'

export default function OnboardingSuccess() {
  const router = useRouter()
  const { business } = useBusiness()

  const handleGoToDashboard = () => {
    router.push('/dashboard')
  }

  const handleTestSetup = () => {
    // Navigate to dashboard with test mode or open test instructions
    router.push('/dashboard?test=true')
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
          Your missed-call text-back system is set up.
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
              <p className="text-sm text-gray-500 dark:text-gray-400">ReplyFlow Number Status</p>
              <p className={`font-medium ${hasTwilioNumber ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                {hasTwilioNumber ? 'Assigned' : 'Pending assignment'}
              </p>
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
            Test My Setup
          </button>
        </div>

        {/* Additional Info */}
        <div className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          <p>You can always update these settings in your dashboard.</p>
        </div>
      </div>
    </div>
  )
}
