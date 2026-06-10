'use client'

import React, { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { CheckCircle, Phone, ChevronDown, Clock, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import { formatPhoneNumber } from '@/lib/utils'

export default function TestSetupPage() {
  const { business, refreshBusiness } = useBusiness()
  const router = useRouter()
  const [troubleshootingOpen, setTroubleshootingOpen] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isPolling, setIsPolling] = useState(false)

  // Guard: Redirect to forwarding setup if not configured
  if (business && !business.call_forwarding_enabled) {
    router.replace('/setup/forwarding')
    return null
  }

  // Guard: If forwarding already verified and onboarding complete, redirect to dashboard
  if (business && business.forwarding_verified && business.onboarding_status === 'completed' && !showSuccess) {
    router.replace('/dashboard')
    return null
  }

  // Auto-poll for verification status every 5 seconds
  useEffect(() => {
    if (!business || business.forwarding_verified) return

    const pollInterval = setInterval(async () => {
      setIsPolling(true)
      try {
        await refreshBusiness()
        // If forwarding becomes verified, the guard will redirect to dashboard
      } catch (error) {
        console.error('[TestSetup] Polling error:', error)
      } finally {
        setIsPolling(false)
      }
    }, 5000)

    return () => clearInterval(pollInterval)
  }, [business, refreshBusiness])

  const handleGoToDashboard = () => {
    router.push('/dashboard')
  }

  const troubleshooting = [
    {
      issue: 'Verizon: Calls answer too quickly',
      solution: 'Call Verizon support and ask to "set conditional call forwarding/no-answer forwarding to your ReplyFlow number after 30 seconds." Do not use immediate forwarding.'
    },
    {
      issue: 'AT&T: Forwarding not activating',
      solution: 'Verify you dialed the full code including the # at the end. Try dialing again and wait for confirmation tone.'
    },
    {
      issue: 'T-Mobile: Calls go to voicemail',
      solution: 'T-Mobile may require deactivating voicemail first. Call T-Mobile support to disable conditional call forwarding voicemail.'
    },
    {
      issue: 'VoIP (RingCentral, 8x8, etc.)',
      solution: 'Log into your VoIP provider dashboard and enable call forwarding in web settings instead of using dial codes.'
    }
  ]

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-background p-4 sm:p-8">
          <div className="max-w-3xl mx-auto">
            {/* Success State */}
            {showSuccess ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
                </div>
                <h1 className="text-3xl font-bold text-foreground mb-4">
                  Setup Complete! 🎉
                </h1>
                <div className="space-y-3 mb-8 max-w-md mx-auto">
                  <div className="flex items-center justify-center gap-3 text-left">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span className="text-foreground">Setup Complete</span>
                  </div>
                  <div className="flex items-center justify-center gap-3 text-left">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span className="text-foreground">Forwarding Verified</span>
                  </div>
                  <div className="flex items-center justify-center gap-3 text-left">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span className="text-foreground">Test Successful</span>
                  </div>
                  <div className="flex items-center justify-center gap-3 text-left">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span className="text-foreground">ReplyFlow is now protecting missed calls</span>
                  </div>
                </div>
                <button
                  onClick={handleGoToDashboard}
                  className="inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  Go to Dashboard
                </button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold text-foreground mb-2">
                    ReplyFlow Is Ready 🎉
                  </h1>
              <p className="text-muted-foreground text-lg">
                Your phone number is connected and ready to capture missed calls.
              </p>
            </div>

            {/* Status Cards */}
            <div className="bg-card rounded-xl shadow-lg p-6 mb-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-900 dark:text-green-100">SMS Active</p>
                    <p className="text-xs text-green-700 dark:text-green-300">Texting enabled</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-900 dark:text-green-100">Call Forwarding</p>
                    <p className="text-xs text-green-700 dark:text-green-300">Configured</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-900 dark:text-green-100">Number Assigned</p>
                    <p className="text-xs text-green-700 dark:text-green-300">ReplyFlow ready</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Business Number</p>
                    <p className="text-sm font-semibold text-foreground">
                      {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Forwarding To</p>
                    <p className="text-sm font-semibold text-foreground">
                      {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Carrier</p>
                    <p className="text-sm font-semibold text-foreground">
                      {business?.business_phone_carrier ? business.business_phone_carrier.charAt(0).toUpperCase() + business.business_phone_carrier.slice(1) : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recommended Test Section */}
            <div className="bg-card rounded-xl shadow p-6 mb-8">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    Recommended Test
                  </h2>
                  <p className="text-muted-foreground mb-4">
                    Call your business number from another phone and let it ring.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  ReplyFlow should:
                </p>
                <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-300">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400">•</span>
                    <span>Answer after your normal ring timeout</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400">•</span>
                    <span>Send an automated text message</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400">•</span>
                    <span>Create a lead in your dashboard</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Collapsible Troubleshooting */}
            <div className="mb-8">
              <button
                onClick={() => setTroubleshootingOpen(!troubleshootingOpen)}
                className="w-full p-4 bg-card rounded-lg shadow flex items-center justify-between text-left hover:bg-muted transition-colors"
              >
                <span className="text-sm font-medium text-foreground">Having trouble?</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${
                  troubleshootingOpen ? 'rotate-180' : ''
                }`} />
              </button>
              {troubleshootingOpen && (
                <div className="mt-2 bg-card rounded-lg shadow p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-4">
                    {troubleshooting.map((item, index) => (
                      <div key={index} className="border-l-4 border-amber-500 pl-4">
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                          {item.issue}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {item.solution}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Waiting for first successful test call...</span>
                {isPolling && <RefreshCw className="w-4 h-4 animate-spin" />}
              </div>
              <Link
                href="/dashboard"
                className="block w-full text-center text-muted-foreground hover:text-foreground text-sm py-2 transition-colors"
              >
                Continue to Dashboard
              </Link>
            </div>
              </>
            )}
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
