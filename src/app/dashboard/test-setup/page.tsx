'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { CheckCircle, Phone, MessageSquare, Inbox, Sparkles, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber } from '@/lib/utils'
import { deriveSetupState, getTestStepStates } from '@/lib/setup-state'

export default function TestSetupPage() {
  console.log('[TestSetup] Component render -', new Date().toISOString())
  const { business, refreshBusiness } = useBusiness()
  const router = useRouter()
  const supabase = createBrowserClient()
  const [success, setSuccess] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [latestLead, setLatestLead] = useState<any>(null)
  const [liveStatus, setLiveStatus] = useState<'waiting' | 'call_detected' | 'sms_sent' | 'lead_captured'>('waiting')
  const [currentStep, setCurrentStep] = useState(1)
  const [troubleshootingOpen, setTroubleshootingOpen] = useState(false)
  const [testInitiationTime, setTestInitiationTime] = useState<Date | null>(null)
  const [earlyForwardingWarning, setEarlyForwardingWarning] = useState(false)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])

  // Use shared state resolver for consistency
  const setupState = deriveSetupState(business)
  const testStepStates = getTestStepStates(business, !!latestLead)

  console.log('[TestSetup] Using shared state resolver:', {
    setupState,
    testStepStates,
    businessId: business?.id,
    onboarding_status: business?.onboarding_status,
    forwarding_verified: business?.forwarding_verified,
    test_call_received_at: business?.test_call_received_at,
    test_sms_sent_at: business?.test_sms_sent_at,
    hasLatestLead: !!latestLead
  })
  const [isMounted, setIsMounted] = useState(false)
  const hasScrolledToTopRef = useRef(false)
  const hasInitializedActiveStepRef = useRef(false)

  // Disable browser scroll restoration for this route
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual"
    }
  }, [])

  // Force scroll to top on mount with requestAnimationFrame
  useEffect(() => {
    console.log('[TestSetup] mounted - forcing scroll top')
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior })
      hasScrolledToTopRef.current = true
      setIsMounted(true)
    })
  }, [])

  // Auto-scroll to active step when it changes (but NOT on initial mount and NOT for step 1)
  useEffect(() => {
    if (!hasInitializedActiveStepRef.current) {
      hasInitializedActiveStepRef.current = true
      console.log('[TestSetup] skipping initial active-step scroll')
      return
    }

    if (!isMounted) return // Skip on initial mount
    if (!hasScrolledToTopRef.current) return // Skip if we haven't scrolled to top yet
    if (currentStep === 1) return // Don't auto-scroll to step 1 (hero already shows instructions)

    if (stepRefs.current[currentStep - 1]) {
      console.log('[TestSetup] active step changed to', currentStep, '- scrolling into view')
      stepRefs.current[currentStep - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentStep, isMounted])

  // Check if setup is already verified on mount
  useEffect(() => {
    if (setupState.step3Complete) {
      console.log('[TestSetup] Setup already complete, showing success state')
      setSuccess(true)
      fetchLatestLead()
    }
  }, [setupState.step3Complete])

  // Poll for test completion using shared state
  useEffect(() => {
    // Only poll if setup is not complete and forwarding is enabled
    if (setupState.step3Complete || !setupState.canAccessTestSetup || !business) {
      console.log('[TestSetup] Not polling - setup complete, cannot access test setup, or no business data', {
        step3Complete: setupState.step3Complete,
        canAccessTestSetup: setupState.canAccessTestSetup,
        hasBusiness: !!business
      })
      return
    }

    setIsPolling(true)
    const pollInterval = setInterval(async () => {
      try {
        const { data: updatedBusiness, error } = await supabase
          .from('businesses')
          .select('onboarding_status, phone_setup_completed_at, call_forwarding_enabled, test_call_received_at')
          .eq('id', business.id)
          .maybeSingle()

        if (error) {
          console.error('[TestSetup] Polling query error:', error)
          // Stop polling on repeated errors to prevent flash loops
          clearInterval(pollInterval)
          setIsPolling(false)
          return
        }

        // Check for test call received and calculate timing
        if (updatedBusiness?.test_call_received_at && !testInitiationTime) {
          // First time we detect the test call
          const testReceivedTime = new Date(updatedBusiness.test_call_received_at)
          console.log('[TEST SETUP] Test call detected', {
            testReceivedTime: testReceivedTime.toISOString(),
            businessId: business.id
          });
          
          // Check if this seems like early forwarding (less than 20 seconds suggests improper setup)
          // This is a heuristic - in a real implementation, we'd track actual test initiation time
          const now = new Date();
          const timeSinceTestCall = now.getTime() - testReceivedTime.getTime();
          
          if (timeSinceTestCall < 20000) { // Less than 20 seconds suggests improper forwarding setup
            console.log('[TEST SETUP] EARLY FORWARDING DETECTED', {
              timeSinceTestCall: `${timeSinceTestCall}ms`,
              timeSinceTestCallSeconds: timeSinceTestCall / 1000,
              warning: 'ReplyFlow is activating too soon. Your phone is forwarding before a normal voicemail-style missed call.',
              testReceivedTime: testReceivedTime.toISOString(),
              detectionTime: now.toISOString()
            });
            setEarlyForwardingWarning(true);
          }
        }

        // Check if forwarding is setup complete using existing columns
        const isForwardingSetupComplete = updatedBusiness?.phone_setup_completed_at && 
                                        updatedBusiness?.call_forwarding_enabled &&
                                        updatedBusiness?.onboarding_status === 'completed'

        // Use shared state resolver to check for test completion
        const updatedSetupState = deriveSetupState(updatedBusiness, !!latestLead)

        // Only mark setup complete if early forwarding is NOT detected
        if (updatedSetupState.step3Complete && !earlyForwardingWarning) {
          console.log('[TestSetup] Test setup complete via shared state, stopping poll')
          setSuccess(true)
          setIsPolling(false)
          clearInterval(pollInterval)
          await refreshBusiness()
          await fetchLatestLead()
          // Auto-progress to final step
          setCurrentStep(6)
        } else if (updatedSetupState.step3Complete && earlyForwardingWarning) {
          console.log('[TestSetup] Setup detected but early forwarding prevents completion')
          // Keep polling to allow user to fix forwarding issue
        }
      } catch (error) {
        console.error('[TestSetup] Polling error:', error)
        // Stop polling on errors to prevent flash loops
        clearInterval(pollInterval)
        setIsPolling(false)
      }
    }, 2000) // Poll every 2 seconds

    return () => {
      clearInterval(pollInterval)
      setIsPolling(false)
    }
  }, [business?.id, setupState.step3Complete, setupState.canAccessTestSetup])

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
      solution: 'Wait a minute and try again. Some carriers may take a few extra minutes to activate new numbers.'
    },
    {
      issue: 'If the lead does not appear',
      solution: 'Try refreshing the dashboard. If the issue persists, check that your Twilio number is properly configured.'
    }
  ]

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-background p-4 sm:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <Link 
                href="/dashboard" 
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
              >
                <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
                Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Verify your ReplyFlow setup
              </h1>
              <p className="text-muted-foreground">
                Call your business number once to test that ReplyFlow is capturing missed calls correctly.
              </p>
            </div>

              {/* Hero Card */}
              {!success && (
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-900 dark:to-blue-800 rounded-2xl p-8 mb-8 shadow-lg">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <Phone className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white mb-2">
                      Call your business number now
                    </h2>
                    <p className="text-blue-100 mb-4">
                      ReplyFlow will automatically detect your test call and verify everything is working.
                    </p>
                    <p className="text-sm text-blue-200 mb-4 italic">
                      Your business number still works exactly like normal.
                    </p>
                    <div className="flex items-center gap-6 mb-4">
                      <div className="bg-white/10 rounded-lg px-4 py-2">
                        <p className="text-xs text-blue-200 mb-1">Your business number</p>
                        <p className="text-lg font-semibold text-white">
                          {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
                        </p>
                      </div>
                      <div className="bg-white/10 rounded-lg px-4 py-2">
                        <p className="text-xs text-blue-200 mb-1">Estimated time</p>
                        <p className="text-lg font-semibold text-white">
                          ~30 seconds
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <p className="text-sm text-blue-100">
                        {isPolling ? 'Waiting for test call...' : 'Ready to test'}
                      </p>
                    </div>

                    {/* Forwarding Validation Results */}
                    {earlyForwardingWarning && (
                      <div className="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-red-400 mb-1">
                              ReplyFlow is activating too soon
                            </p>
                            <p className="text-xs text-red-300">
                              Your phone is forwarding before a normal voicemail-style missed call. Disable current forwarding and set up no-answer forwarding through Verizon.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Forwarding Success Message */}
                    {!earlyForwardingWarning && latestLead && (
                      <div className="mt-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-green-400 mb-1">
                              Forwarding looks good
                            </p>
                            <p className="text-xs text-green-300">
                              ReplyFlow will answer missed calls in place of voicemail.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Setup Confirmation Card */}
            <div className="bg-card rounded-xl p-4 mb-6 max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Business phone connected</p>
                  <p className="text-xs text-muted-foreground">Your call forwarding is configured</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-card rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Your business number</p>
                  <p className="text-sm font-semibold text-foreground">
                    {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
                  </p>
                </div>
                <div className="bg-card rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Carrier</p>
                  <p className="text-sm font-semibold text-foreground">
                    {business?.business_phone_carrier ? business.business_phone_carrier.charAt(0).toUpperCase() + business.business_phone_carrier.slice(1) : 'Not set'}
                  </p>
                </div>
                <div className="bg-card rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Forwarding to</p>
                  <p className="text-sm font-semibold text-foreground">
                    {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not set'}
                  </p>
                </div>
              </div>
            </div>

            {/* SMS Verification Status */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-6">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-xs font-semibold text-green-900 dark:text-green-100 mb-1">
                    SMS Active
                  </h3>
                  <p className="text-xs text-green-800 dark:text-green-300">
                    Your ReplyFlow texting is ready. Most test messages arrive within 5–15 seconds.
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                    If your test text does not arrive immediately, wait a minute and try again.
                  </p>
                </div>
              </div>
            </div>

            {/* Troubleshooting Guidance */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-100 mb-1">
                    Verizon Troubleshooting
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    If ReplyFlow answers after 5-6 seconds, call Verizon support and ask:
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium">
                    "Set conditional call forwarding/no-answer forwarding to +16065321162 after 30 seconds"
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    Do not use immediate call forwarding. ReplyFlow should replace voicemail, not intercept calls.
                  </p>
                </div>
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="bg-card rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-6">
                Testing Steps
              </h2>
              <div className="space-y-4">
                {steps.map((step, index) => {
                  const Icon = step.icon
                  const isActive = !success && index === currentStep - 1
                  const isCompleted = success && step.number <= 5
                  
                  return (
                    <div 
                      key={step.number}
                      ref={(el) => {
                        stepRefs.current[index] = el
                      }}
                      className={`flex items-start gap-4 p-4 rounded-lg border transition-all duration-300 ${
                        isCompleted 
                          ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10' 
                          : isActive
                          ? 'border-2 border-blue-500 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 shadow-lg shadow-blue-500/10 animate-pulse'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isCompleted 
                          ? 'bg-green-600 text-white' 
                          : isActive
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 animate-pulse'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4 animate-in zoom-in duration-200" />
                        ) : (
                          <span className="text-sm font-semibold">{step.number}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`w-5 h-5 transition-colors duration-300 ${
                            isCompleted ? 'text-green-600 dark:text-green-400' :
                            isActive ? 'text-blue-600 dark:text-blue-400' :
                            'text-gray-600 dark:text-gray-400'
                          }`} />
                          <h3 className={`text-base font-semibold transition-colors duration-300 ${
                            isCompleted ? 'text-green-900 dark:text-green-100' :
                            isActive ? 'text-blue-900 dark:text-blue-100' :
                            'text-foreground'
                          }`}>
                            {step.title}
                          </h3>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {step.description}
                        </p>
                        {isCompleted && (
                          <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 animate-in fade-in slide-in-from-left-2 duration-300">
                            <CheckCircle className="w-4 h-4" />
                            <span>{step.outcome}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Troubleshooting */}
            <div className="bg-card rounded-lg shadow mb-8">
              <button
                onClick={() => setTroubleshootingOpen(!troubleshootingOpen)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <h2 className="text-xl font-semibold text-foreground">
                  Need help troubleshooting?
                </h2>
                <svg
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    troubleshootingOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {troubleshootingOpen && (
                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-4 pt-4 border-t border-border">
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
              {success ? (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-2 border-green-200 dark:border-green-700 rounded-2xl p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="w-20 h-20 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                    <Sparkles className="w-10 h-10 text-green-600 dark:text-green-400" />
                  </div>
                  <h2 className="text-3xl font-bold text-green-900 dark:text-green-100 mb-3">
                    ReplyFlow is now protecting your missed calls
                  </h2>
                  <p className="text-green-700 dark:text-green-300 mb-6 text-lg">
                    Missed callers will now automatically receive a text and appear in your inbox.
                  </p>
                  <div className="bg-card rounded-xl p-4 mb-6 max-w-md mx-auto">
                    <div className="grid grid-cols-2 gap-4 text-left">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Connected number</p>
                        <p className="text-sm font-semibold text-foreground">
                          {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Forwarding to</p>
                        <p className="text-sm font-semibold text-foreground">
                          {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not set'}
                        </p>
                      </div>
                    </div>
                    {business?.forwarding_verified_at && (
                      <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                        Verified at {new Date(business.forwarding_verified_at).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    {latestLead && (
                      <Link
                        href={`/dashboard/leads/${latestLead.id}`}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-all hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        View Inbox
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
                    <Link
                      href="/dashboard"
                      className="flex-1 bg-card border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20 font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      Go to Dashboard
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <Link
                    href="/dashboard"
                    className="block w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm text-center py-2 transition-colors"
                  >
                    Finish later
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
