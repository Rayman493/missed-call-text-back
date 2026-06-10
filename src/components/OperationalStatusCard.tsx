'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import TestReplyFlowModal from '@/components/TestReplyFlowModal'
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
  const [showForwardingInstructions, setShowForwardingInstructions] = useState(false)
  const [showTestCallInstructions, setShowTestCallInstructions] = useState(false)
  const [selectedCarrier, setSelectedCarrier] = useState<string>('')

  // Carrier-specific forwarding instructions
  const carrierInstructions: Record<string, {
    enableCode: string
    disableCode: string
    notes: string
    tested: boolean
  }> = {
    verizon: {
      enableCode: '*71',
      disableCode: '*73',
      notes: 'Call your business number, enter the code, wait for confirmation tone. Forwarding is now active.',
      tested: true
    },
    att: {
      enableCode: '*71',
      disableCode: '*73',
      notes: 'Call your business number, enter the code, wait for confirmation tone. Forwarding is now active.',
      tested: true
    },
    tmobile: {
      enableCode: '*21',
      disableCode: '#21#',
      notes: 'Call your business number, enter the code, wait for confirmation tone. T-Mobile uses different codes than Verizon/AT&T.',
      tested: true
    },
    sprint: {
      enableCode: '*72',
      disableCode: '*720',
      notes: 'Call your business number, enter the code, wait for confirmation tone.',
      tested: false
    },
    'google-fi': {
      enableCode: '*21',
      disableCode: '#21#',
      notes: 'Open the Google Fi app, go to Settings > Calls, and enable call forwarding to your ReplyFlow number.',
      tested: false
    },
    cricket: {
      enableCode: '*72',
      disableCode: '*720',
      notes: 'Call your business number, enter the code, wait for confirmation tone.',
      tested: false
    },
    other: {
      enableCode: '*71',
      disableCode: '*73',
      notes: 'Carrier instructions may vary. Contact your carrier if this code does not work. Most carriers use *71 to enable forwarding.',
      tested: false
    }
  }

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

        // Get last successful SMS
        const { data: lastSms } = await supabase
          .from('messages')
          .select('created_at')
          .eq('business_id', business.id)
          .eq('direction', 'outbound')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // Get last AI intake
        const { data: lastAiCall } = await supabase
          .from('ai_call_records')
          .select('created_at')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // Get recent delivery failures
        const { data: failedMessages } = await supabase
          .from('messages')
          .select('error, created_at')
          .eq('business_id', business.id)
          .not('error', 'is', null)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(5)

        setLiveMetrics({
          lastForwardedCall: lastCall?.created_at || null,
          lastSuccessfulSms: lastSms?.created_at || null,
          lastAiIntake: lastAiCall?.created_at || null,
          deliveryFailures: failedMessages?.length || 0,
          recentErrors: failedMessages?.map((m: any) => m.error) || []
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
        return { icon: '🟢', text: 'Healthy', color: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-400/25' }
      case 'needs-attention':
        return { icon: '🟡', text: 'Needs Attention', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-400/25' }
      case 'action-required':
        return { icon: '🔴', text: 'Action Required', color: 'text-red-400', bg: 'bg-red-500/15', border: 'border-red-400/25' }
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
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 border border-slate-700 rounded-xl p-3 sm:p-4 hover:shadow-xl transition-all duration-300">
      {/* Compact Status Row - Always Visible */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
        {/* Status indicators */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{healthIndicator.icon}</span>
            <span className={`text-sm font-semibold ${healthIndicator.color}`}>
              {healthStatus === 'healthy' ? 'ReplyFlow is Active' : healthIndicator.text}
            </span>
          </div>
          
          {/* Status chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
              healthStatus === 'healthy' ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'
            }`}>
              {getStatusIndicator(healthStatus === 'healthy' ? 'active' : 'needs-attention')}
              <span className="font-medium">Monitoring</span>
            </div>
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
              isTextReplyActive ? 'bg-green-500/15 text-green-300' : 'bg-slate-500/15 text-slate-300'
            }`}>
              {getStatusIndicator(isTextReplyActive ? 'active' : 'inactive')}
              <span className="font-medium">Text</span>
            </div>
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
              isForwardingActive ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'
            }`}>
              {getStatusIndicator(isForwardingActive ? 'active' : 'warning')}
              <span className="font-medium">Forwarding</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Test Call button - compact secondary action */}
          <button
            onClick={() => setShowTestModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-200 rounded-md transition-colors text-xs font-medium border border-slate-600"
          >
            <Phone className="w-3.5 h-3.5" />
            Test Call
          </button>
          
          {/* Expand/collapse toggle */}
          <button
            onClick={() => setShowSystemDetails(!showSystemDetails)}
            className="inline-flex items-center justify-center w-7 h-7 bg-slate-700/30 hover:bg-slate-700 text-slate-400 rounded-md transition-colors"
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
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-400 pb-2 mb-2 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Business:</span>
          <span className="font-mono text-slate-300">
            {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">ReplyFlow:</span>
          <span className="font-mono text-slate-300">
            {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
          </span>
        </div>
        {business?.forwarding_verified_at && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Last verified:</span>
            <span className="text-slate-300">{formatRelativeTime(business.forwarding_verified_at)}</span>
          </div>
        )}
      </div>

      {/* Expanded Details - Only shown when unhealthy or manually expanded */}
      {showSystemDetails && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Recovery Instructions - Only when unhealthy */}
          {healthStatus !== 'healthy' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
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
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
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
                        <button
                          onClick={() => setShowForwardingInstructions(!showForwardingInstructions)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          {showForwardingInstructions ? 'Hide' : 'Show'} instructions
                        </button>
                      )}
                    </div>
                    {!business?.call_forwarding_enabled && business?.twilio_phone_number && (
                      <p className="text-xs text-blue-200 mt-0.5">Forward calls from your business number to ReplyFlow</p>
                    )}

                    {/* Carrier-specific forwarding instructions */}
                    {showForwardingInstructions && !business?.call_forwarding_enabled && business?.twilio_phone_number && (
                      <div className="mt-2 p-2 bg-slate-800/50 rounded-lg border border-slate-700">
                        <p className="text-xs text-slate-300 mb-1.5 font-medium">Forwarding Instructions:</p>
                        <div className="space-y-2 text-xs text-slate-400">
                          <div>
                            <p className="font-medium text-slate-300 mb-1">Step 1: Select your carrier</p>
                            <select 
                              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-300 text-xs"
                              value={selectedCarrier}
                              onChange={(e) => setSelectedCarrier(e.target.value)}
                            >
                              <option value="" disabled>Select carrier</option>
                              <option value="verizon">Verizon</option>
                              <option value="att">AT&T</option>
                              <option value="tmobile">T-Mobile</option>
                              <option value="sprint">Sprint</option>
                              <option value="google-fi">Google Fi</option>
                              <option value="cricket">Cricket Wireless</option>
                              <option value="other">Other / VoIP</option>
                            </select>
                          </div>
                          
                          {selectedCarrier && carrierInstructions[selectedCarrier] && (
                            <>
                              <div>
                                <p className="font-medium text-slate-300 mb-1">Step 2: Enable forwarding</p>
                                <p className="mb-1">Call your business number and enter this code:</p>
                                <div className="flex items-center gap-2">
                                  <code className="bg-slate-700 px-2 py-1 rounded text-white font-mono flex-1 text-xs">
                                    {carrierInstructions[selectedCarrier].enableCode}{business.twilio_phone_number?.replace(/\D/g, '') || ''}#
                                  </code>
                                  <button
                                    onClick={() => {
                                      const code = `${carrierInstructions[selectedCarrier].enableCode}${business.twilio_phone_number?.replace(/\D/g, '') || ''}#`
                                      navigator.clipboard.writeText(code)
                                      alert('Code copied to clipboard!')
                                    }}
                                    className="bg-slate-600 hover:bg-slate-500 text-white px-2 py-1 rounded text-xs"
                                    title="Copy code"
                                  >
                                    Copy
                                  </button>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{carrierInstructions[selectedCarrier].notes}</p>
                                {!carrierInstructions[selectedCarrier].tested && (
                                  <p className="mt-1 text-xs text-amber-400 font-medium">
                                    ⚠️ Carrier instructions may vary. Contact your carrier if this code does not work.
                                  </p>
                                )}
                              </div>
                              
                              <div className="pt-1.5 border-t border-slate-700">
                                <p className="font-medium text-slate-300 mb-1">To disable forwarding later:</p>
                                <code className="bg-slate-700 px-2 py-1 rounded text-white font-mono text-xs">
                                  {carrierInstructions[selectedCarrier].disableCode}
                                </code>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
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
                          onClick={() => setShowTestCallInstructions(!showTestCallInstructions)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          {showTestCallInstructions ? 'Hide' : 'Show'} instructions
                        </button>
                      )}
                    </div>
                    {business?.call_forwarding_enabled && !liveMetrics.lastForwardedCall && (
                      <p className="text-xs text-blue-200 mt-0.5">Verify your forwarding is working correctly</p>
                    )}

                    {/* Test call instructions */}
                    {showTestCallInstructions && !liveMetrics.lastForwardedCall && (
                      <div className="mt-2 p-2 bg-slate-800/50 rounded-lg border border-slate-700">
                        <p className="text-xs text-slate-300 mb-1.5 font-medium">Test Call Instructions:</p>
                        <div className="space-y-1.5 text-xs text-slate-400">
                          <ol className="list-decimal list-inside space-y-1">
                            <li>Call your business number from another phone</li>
                            <li>Let it ring until ReplyFlow answers</li>
                            <li>Return here and confirm it worked</li>
                          </ol>
                          <button
                            onClick={() => setShowTestModal(true)}
                            className="mt-1.5 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors"
                          >
                            Mark test call complete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Live Metrics Collapsible Section */}
          <div>
            <button
              onClick={() => toggleSection('live-metrics')}
              className="w-full flex items-center justify-between text-left p-2 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-300">Live Operational Metrics</span>
              </div>
              {expandedSection === 'live-metrics' ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {expandedSection === 'live-metrics' && (
              <div className="mt-2 bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-0.5">ReplyFlow Number</span>
                    <span className={`font-medium ${business?.twilio_phone_number ? 'text-green-400' : 'text-red-400'}`}>
                      {business?.twilio_phone_number ? '✓ Yes' : '✗ No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Twilio Config</span>
                    <span className={`font-medium ${business?.twilio_phone_number ? 'text-green-400' : 'text-amber-400'}`}>
                      {business?.twilio_phone_number ? '✓ Healthy' : '⚠️ Pending'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Forwarding</span>
                    <span className={`font-medium ${isForwardingActive ? 'text-green-400' : 'text-amber-400'}`}>
                      {isForwardingActive ? '✓ Yes' : '⚠️ No'}
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
                  <div className="mt-2 pt-2 border-t border-slate-700">
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
            )}
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
