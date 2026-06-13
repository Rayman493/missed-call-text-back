'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import TestReplyFlowModal from '@/components/TestReplyFlowModal'
import ForwardingHelpCenter from '@/components/ForwardingHelpCenter'
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, ChevronDown, ChevronUp, Clock, Phone } from 'lucide-react'

interface OperationalStatusCardProps {
  business: Business | null
  missedCallCount?: number
  lastActivity?: string
  onReviewSetup?: () => void
  setupHealth?: import('@/lib/setup-health').SetupHealth
}

type HealthStatus = 'healthy' | 'needs-attention' | 'action-required'

interface LiveMetrics {
  lastForwardedCall: string | null
  lastSuccessfulSms: string | null
  lastAiIntake: string | null
  deliveryFailures: number
  recentErrors: string[]
}

export default function OperationalStatusCard({ 
  business, 
  missedCallCount = 0, 
  onReviewSetup,
  lastActivity,
  setupHealth
}: OperationalStatusCardProps) {
  const [showSystemDetails, setShowSystemDetails] = useState(false)
  const [showTestModal, setShowTestModal] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>({
    lastForwardedCall: null,
    lastSuccessfulSms: null,
    lastAiIntake: null,
    deliveryFailures: 0,
    recentErrors: []
  })
  const [showRecoveryInstructions, setShowRecoveryInstructions] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [showOnboardingChecklist, setShowOnboardingChecklist] = useState(true)

  // Carrier-specific forwarding instructions - REMOVED
  // Forwarding setup now handled at /setup/phone-forwarding with verified codes

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch live operational metrics
  useEffect(() => {
    const fetchLiveMetrics = async () => {
      if (!business?.id) return

      try {
        const supabase = createBrowserClient()
        
        // Get last forwarded call
        const { data: lastCall } = await supabase
          .from('call_events')
          .select('created_at')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // Get last successful SMS (use from_phone since messages has no business_id)
        const businessPhone = business.twilio_phone_number || ''
        const { data: lastSms } = await supabase
          .from('messages')
          .select('created_at')
          .eq('from_phone', businessPhone)
          .eq('direction', 'outbound')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        // Get last AI intake
        const { data: lastAiCall } = await supabase
          .from('ai_call_records')
          .select('created_at')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        // Get recent delivery failures (use error_code instead of error)
        const { data: failedMessages } = await supabase
          .from('messages')
          .select('error_code, error_message, created_at')
          .eq('from_phone', businessPhone)
          .not('error_code', 'is', null)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(5)

        setLiveMetrics({
          lastForwardedCall: lastCall?.created_at || null,
          lastSuccessfulSms: lastSms?.created_at || null,
          lastAiIntake: lastAiCall?.created_at || null,
          deliveryFailures: failedMessages?.length || 0,
          recentErrors: failedMessages?.map((m: any) => m.error_message || m.error_code) || []
        })
      } catch (error) {
        console.error('[OperationalStatusCard] Failed to fetch live metrics:', error)
      }
    }

    fetchLiveMetrics()
  }, [business?.id])

  // Calculate overall health status
  const calculateHealthStatus = (): HealthStatus => {
    if (!business?.twilio_phone_number) return 'action-required'
    if (!setupHealth?.forwardingVerified) return 'needs-attention'
    if (business.messaging_status !== 'active') return 'needs-attention'
    if (liveMetrics.deliveryFailures > 5) return 'action-required'
    if (liveMetrics.deliveryFailures > 0) return 'needs-attention'
    return 'healthy'
  }

  const healthStatus = calculateHealthStatus()

  const getHealthIndicator = () => {
    switch (healthStatus) {
      case 'healthy':
        return { icon: <CheckCircle className="w-5 h-5" />, text: 'Healthy', color: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-400/25' }
      case 'needs-attention':
        return { icon: <AlertTriangle className="w-5 h-5" />, text: 'Needs Attention', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-400/25' }
      case 'action-required':
        return { icon: <XCircle className="w-5 h-5" />, text: 'Action Required', color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-400/25' }
    }
  }

  const healthIndicator = getHealthIndicator()

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  const getStatusIndicator = (status: 'active' | 'inactive' | 'warning' | 'needs-attention') => {
    const colors = {
      active: 'bg-green-500',
      inactive: 'bg-gray-400',
      warning: 'bg-amber-500',
      'needs-attention': 'bg-amber-500'
    }
    return (
      <div className={`w-2 h-2 ${colors[status]} rounded-full ${status === 'active' ? 'animate-pulse' : ''}`}></div>
    )
  }

  const getStatusText = (status: 'active' | 'inactive' | 'warning') => {
    const texts = {
      active: 'Active',
      inactive: 'Inactive',
      warning: 'Warning'
    }
    return texts[status]
  }

  const isTextReplyActive = business?.messaging_status === 'active'
  const isForwardingActive = setupHealth?.forwardingVerified === true
  const isOnboardingComplete = business?.onboarding_status === 'completed' && isForwardingActive

  // Auto-expand if unhealthy
  useEffect(() => {
    if (healthStatus !== 'healthy') {
      setShowSystemDetails(true)
    }
  }, [healthStatus])

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 border border-slate-700 rounded-xl p-2 sm:p-2.5 md:p-3 hover:shadow-xl transition-all duration-300">
      {/* Compact Status Row - Always Visible */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <span className={healthIndicator.color}>{healthIndicator.icon}</span>
          <div className="flex flex-col">
            <span className={`text-xs sm:text-sm font-semibold ${healthIndicator.color}`}>
              {healthStatus === 'healthy' ? 'ReplyFlow is Active' : healthIndicator.text}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-400">
              {healthStatus === 'healthy' ? 'All systems operational' : 'Requires attention'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center">
          {/* Expand/collapse toggle */}
          <button
            onClick={() => setShowSystemDetails(!showSystemDetails)}
            className="inline-flex items-center justify-center w-10 h-10 sm:w-7 sm:h-7 bg-slate-700/30 hover:bg-slate-700 text-slate-400 rounded-md transition-colors"
            aria-label={showSystemDetails ? 'Collapse details' : 'Expand details'}
          >
            {showSystemDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Phone Configuration - Inline compact row */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4 text-[10px] sm:text-xs text-slate-400 pb-1.5 mb-1.5 border-b border-slate-700/50">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Business:</span>
          <span className="font-mono text-slate-300">
            {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">ReplyFlow:</span>
          <span className="font-mono text-slate-300">
            {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
          </span>
        </div>
        {business?.forwarding_verified_at && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Last verified:</span>
            <span className="text-slate-300">{formatRelativeTime(business.forwarding_verified_at)}</span>
          </div>
        )}
      </div>

      {/* Expanded Details - Only shown when unhealthy or manually expanded */}
      {showSystemDetails && (
        <div className="space-y-2 sm:space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Recovery Instructions - Only when unhealthy */}
          {healthStatus !== 'healthy' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
              <button
                onClick={() => setShowRecoveryInstructions(!showRecoveryInstructions)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-amber-100 mb-0.5">Recovery Instructions</h4>
                    <p className="text-xs text-amber-200">
                      {showRecoveryInstructions ? 'Hide' : 'Show'} troubleshooting steps
                    </p>
                  </div>
                </div>
                {showRecoveryInstructions ? (
                  <ChevronUp className="w-4 h-4 text-amber-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-amber-400" />
                )}
              </button>
              
              {showRecoveryInstructions && (
                <div className="mt-2 pt-2 border-t border-amber-500/30">
                  <p className="text-xs text-amber-200 mb-1.5">If calls are not reaching ReplyFlow:</p>
                  <ol className="text-xs text-amber-200 space-y-1 list-decimal list-inside">
                    <li>Verify your carrier forwarding settings</li>
                    <li>Confirm the correct ReplyFlow number is configured</li>
                    <li>Run a test call</li>
                    <li>Restart your phone if forwarding changes were just made</li>
                    <li>Contact support if the issue persists</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Onboarding Checklist - Only shown when not complete */}
          {!isOnboardingComplete && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2.5">
              <h4 className="text-sm font-semibold text-blue-100 mb-2">Setup Checklist</h4>
              
              {/* Reassurance message */}
              <div className="mb-3 p-2 bg-blue-500/5 rounded-lg border border-blue-500/20">
                <p className="text-xs text-blue-200">
                  💡 Your existing business phone number stays the same. ReplyFlow only handles missed calls after forwarding is enabled.
                </p>
              </div>
              
              <div className="space-y-2">
                {/* Step 1: ReplyFlow number assigned */}
                <div className={`flex items-start gap-2 ${!business?.twilio_phone_number ? 'bg-blue-500/10 -mx-1 px-1 py-1 rounded-lg border border-blue-500/30' : ''}`}>
                  {business?.twilio_phone_number ? (
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-blue-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${business?.twilio_phone_number ? 'text-slate-300 line-through' : 'text-blue-300 font-semibold'}`}>
                        ReplyFlow number assigned
                      </span>
                      {business?.twilio_phone_number && (
                        <span className="text-xs text-green-400">Complete</span>
                      )}
                    </div>
                    {!business?.twilio_phone_number && (
                      <p className="text-xs text-blue-200 mt-0.5">Provisioning your ReplyFlow number...</p>
                    )}
                  </div>
                </div>

                {/* Step 2: Set up call forwarding */}
                <div className={`flex items-start gap-2 ${business?.twilio_phone_number && !business?.call_forwarding_enabled ? 'bg-blue-500/10 -mx-1 px-1 py-1 rounded-lg border border-blue-500/30' : ''}`}>
                  {business?.call_forwarding_enabled ? (
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-blue-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${business?.call_forwarding_enabled ? 'text-slate-300 line-through' : 'text-blue-300 font-semibold'}`}>
                        Set up call forwarding
                      </span>
                      {business?.call_forwarding_enabled ? (
                        <span className="text-xs text-green-400">Complete</span>
                      ) : (
                        <Link
                          href="/setup/phone-forwarding"
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Go to setup page
                        </Link>
                      )}
                    </div>
                    {!business?.call_forwarding_enabled && business?.twilio_phone_number && (
                      <p className="text-xs text-blue-200 mt-0.5">Forward calls from your business number to ReplyFlow</p>
                    )}
                  </div>
                </div>

                {/* Step 3: Run a test call */}
                <div className={`flex items-start gap-2 ${business?.call_forwarding_enabled && !liveMetrics.lastForwardedCall ? 'bg-blue-500/10 -mx-1 px-1 py-1 rounded-lg border border-blue-500/30' : ''}`}>
                  {liveMetrics.lastForwardedCall ? (
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-blue-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${liveMetrics.lastForwardedCall ? 'text-slate-300 line-through' : 'text-blue-300 font-semibold'}`}>
                        Run a test call
                      </span>
                      {liveMetrics.lastForwardedCall ? (
                        <span className="text-xs text-green-400">Complete</span>
                      ) : (
                        <button
                          onClick={() => setShowTestModal(true)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Run Test Call
                        </button>
                      )}
                    </div>
                    {business?.call_forwarding_enabled && !liveMetrics.lastForwardedCall && (
                      <p className="text-xs text-blue-200 mt-0.5">Verify your forwarding is working correctly</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* System Diagnostics Card */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-300">System Diagnostics</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Twilio Config</span>
                <span className={`font-medium ${business?.twilio_phone_number ? 'text-green-400' : 'text-amber-400'}`}>
                  {business?.twilio_phone_number ? 'Healthy' : 'Pending'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">SMS Service</span>
                <span className={`font-medium ${isTextReplyActive ? 'text-green-400' : 'text-amber-400'}`}>
                  {isTextReplyActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Call Forwarding</span>
                <span className={`font-medium ${isForwardingActive ? 'text-green-400' : 'text-amber-400'}`}>
                  {isForwardingActive ? 'Verified' : 'Not Verified'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Last AI Intake</span>
                <span className="font-medium text-slate-300">
                  {liveMetrics.lastAiIntake ? formatRelativeTime(liveMetrics.lastAiIntake) : 'Never'}
                </span>
              </div>
            </div>

            {liveMetrics.deliveryFailures > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <span className="text-slate-400 text-xs block mb-0.5">Delivery Failures (24h)</span>
                <span className={`font-medium ${liveMetrics.deliveryFailures > 5 ? 'text-red-400' : 'text-amber-400'}`}>
                  {liveMetrics.deliveryFailures} failures
                </span>
                {liveMetrics.recentErrors.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {liveMetrics.recentErrors.slice(0, 3).map((error, idx) => (
                      <p key={idx} className="text-xs text-red-300 truncate">{error}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Call Forwarding Status Card - Simplified summary */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-300">Call Forwarding Status</span>
            </div>

            <div className="space-y-2">
              {/* Status indicator */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Status:</span>
                <span className={`text-xs font-medium ${isForwardingActive ? 'text-green-400' : 'text-amber-400'}`}>
                  {isForwardingActive ? 'Verified' : 'Not Verified'}
                </span>
              </div>

              {/* Numbers display */}
              <div className="space-y-1.5 pt-2 border-t border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Business:</span>
                  <span className="text-xs font-mono text-slate-300">
                    {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">ReplyFlow:</span>
                  <span className="text-xs font-mono text-slate-300">
                    {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
                  </span>
                </div>
              </div>

              {/* CTA button */}
              {!isForwardingActive && (
                <div className="pt-2">
                  <Link
                    href="/setup/phone-forwarding"
                    className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-2 px-3 rounded transition-colors"
                  >
                    Set Up Call Forwarding
                  </Link>
                </div>
              )}

              {isForwardingActive && (
                <div className="pt-2">
                  <Link
                    href="/setup/phone-forwarding"
                    className="block w-full text-center bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium py-2 px-3 rounded transition-colors"
                  >
                    Review Forwarding Setup
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Trial Status */}
          {business?.trial_ends_at && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  <span className="text-xs font-medium text-slate-300">🎉 Free Trial</span>
                </div>
                <div className="text-xs text-amber-400">
                  {new Date(business.trial_ends_at) > new Date()
                    ? `${Math.ceil((new Date(business.trial_ends_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days remaining`
                    : 'Expired'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Test ReplyFlow Modal */}
      <TestReplyFlowModal 
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
      />
    </div>
  )
}
