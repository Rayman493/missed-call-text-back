'use client'

import { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { CheckCircle, Phone, MessageSquare, Inbox, Sparkles, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import { createBrowserClient } from '@/lib/supabase/browser'

export default function TestSetupPage() {
  const { business, refreshBusiness } = useBusiness()
  const router = useRouter()
  const supabase = createBrowserClient()
  const [success, setSuccess] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [latestLead, setLatestLead] = useState<any>(null)

  // Check if setup is already verified on mount
  useEffect(() => {
    if (business?.forwarding_verified) {
      setSuccess(true)
      fetchLatestLead()
    }
  }, [business?.forwarding_verified])

  // Poll for forwarding verification
  useEffect(() => {
    if (!business || business.forwarding_verified || !business.call_forwarding_enabled) {
      return
    }

    setIsPolling(true)
    const pollInterval = setInterval(async () => {
      try {
        const { data: updatedBusiness } = await supabase
          .from('businesses')
          .select('forwarding_verified, forwarding_verified_at, onboarding_status')
          .eq('id', business.id)
          .single()

        if (updatedBusiness?.forwarding_verified) {
          setSuccess(true)
          setIsPolling(false)
          clearInterval(pollInterval)
          await refreshBusiness()
          await fetchLatestLead()
        }
      } catch (error) {
        console.error('[TestSetup] Polling error:', error)
      }
    }, 2000) // Poll every 2 seconds

    return () => {
      clearInterval(pollInterval)
      setIsPolling(false)
    }
  }, [business?.id, business?.forwarding_verified, business?.call_forwarding_enabled])

  const fetchLatestLead = async () => {
    if (!business) return
    try {
      const { data: leads } = await supabase
        .from('leads')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (leads) {
        setLatestLead(leads)
      }
    } catch (error) {
      console.error('[TestSetup] Error fetching latest lead:', error)
    }
  }

  const steps = [
    {
      number: 1,
      title: 'Call your business number',
      description: 'Use another phone to call your business number.',
      icon: Phone,
      outcome: 'Call should forward to ReplyFlow'
    },
    {
      number: 2,
      title: 'Do not answer the call',
      description: 'Allow the call to forward to ReplyFlow.',
      icon: MessageSquare,
      outcome: 'Forwarding activates automatically'
    },
    {
      number: 3,
      title: 'Listen for the greeting',
      description: 'Verify you hear the ReplyFlow greeting/message.',
      icon: MessageSquare,
      outcome: 'Automated greeting plays'
    },
    {
      number: 4,
      title: 'Verify SMS reply',
      description: 'Check that you receive the automated SMS reply.',
      icon: MessageSquare,
      outcome: 'Automated text sent to caller'
    },
    {
      number: 5,
      title: 'Check dashboard',
      description: 'Confirm the lead appears in your dashboard inbox.',
      icon: Inbox,
      outcome: 'Lead created and conversation visible'
    }
  ]

  const expectedOutcomes = [
    'Lead created in your dashboard',
    'Conversation visible in inbox',
    'Automated reply sent to caller',
    'Follow-ups scheduled automatically'
  ]

  const troubleshooting = [
    {
      issue: 'If calls are not forwarding',
      solution: 'Make sure you enabled call forwarding on your business phone using the carrier-specific code provided in the phone setup step.'
    },
    {
      issue: 'If you did not receive a text message',
      solution: 'SMS delivery may be limited while carrier verification is pending. This typically takes 1-2 business days.'
    },
    {
      issue: 'If the lead does not appear',
      solution: 'Try refreshing the dashboard. If the issue persists, check that your Twilio number is properly configured.'
    }
  ]

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <Link 
                href="/dashboard" 
                className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
              >
                ← Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Test Your ReplyFlow Setup
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Follow these steps to verify your ReplyFlow configuration is working correctly.
              </p>
            </div>

            {/* SMS Verification Note */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                    SMS Verification Pending
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    SMS delivery may be limited while carrier verification is pending. This typically takes 1-2 business days. During this time, you may experience delayed or limited SMS delivery.
                  </p>
                </div>
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
                Testing Steps
              </h2>
              <div className="space-y-6">
                {steps.map((step) => {
                  const Icon = step.icon
                  
                  return (
                    <div 
                      key={step.number}
                      className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-600 text-white">
                        <span className="text-sm font-semibold">{step.number}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {step.title}
                          </h3>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {step.description}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle className="w-4 h-4" />
                          <span>{step.outcome}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Expected Outcomes */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Expected Outcomes
              </h2>
              <ul className="space-y-3">
                {expectedOutcomes.map((outcome, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Troubleshooting */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Troubleshooting
              </h2>
              <div className="space-y-4">
                {troubleshooting.map((item, index) => (
                  <div key={index} className="border-l-4 border-amber-500 pl-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      {item.issue}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {item.solution}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-4">
              {success ? (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-2 border-green-200 dark:border-green-700 rounded-2xl p-6 text-center">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-green-900 dark:text-green-100 mb-2">
                    ReplyFlow is live 🎉
                  </h2>
                  <p className="text-green-700 dark:text-green-300 mb-4">
                    Your business phone is connected. Missed callers will now receive an automatic text back.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {latestLead && (
                      <Link
                        href={`/dashboard/leads/${latestLead.id}`}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        View your first lead
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
                    <Link
                      href="/dashboard"
                      className="flex-1 bg-white dark:bg-slate-800 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      Back to dashboard
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <Phone className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                        {isPolling && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        )}
                      </div>
                      <div>
                        <p className="text-blue-100 font-semibold mb-2">
                          {isPolling ? 'Listening for your test call...' : 'Waiting for test call...'}
                        </p>
                        <p className="text-blue-300 text-sm">
                          Call your business number from another phone and let it ring. ReplyFlow will automatically verify your setup when the call forwards successfully.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Link
                    href="/dashboard"
                    className="block w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-center"
                  >
                    Return to Dashboard
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
