'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'

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
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>({
    lastForwardedCall: null,
    lastSuccessfulSms: null,
    lastAiIntake: null,
    deliveryFailures: 0,
    recentErrors: []
  })

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
          .maybeSingle()

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
    return 'healthy'
  }

  const healthStatus = calculateHealthStatus()

  const isTextReplyActive = business?.messaging_status === 'active'
  const isForwardingActive = setupHealth?.forwardingVerified === true

  // Auto-expand if unhealthy
  useEffect(() => {
    if (healthStatus !== 'healthy') {
      setShowSystemDetails(true)
    }
  }, [healthStatus])

  // Simple success indicators - always green when healthy
  const getSuccessIndicator = (isHealthy: boolean, label: string) => {
    if (isHealthy) {
      return (
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="text-sm text-foreground">{label}</span>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm text-amber-600 dark:text-amber-400">{label}</span>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {healthStatus === 'healthy' ? (
          <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
        ) : healthStatus === 'needs-attention' ? (
          <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
        ) : (
          <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
        )}
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {healthStatus === 'healthy' ? '🟢 ReplyFlow Active' : '⚠️ ReplyFlow Needs Attention'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {healthStatus === 'healthy' ? 'Everything is working normally.' : 'Some systems need attention.'}
          </p>
        </div>
      </div>

      {/* Phone Numbers */}
      <div className="space-y-2 mb-6">
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">Business Number:</span>
          <span className="text-sm font-medium text-foreground font-mono">
            {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">ReplyFlow Number:</span>
          <span className="text-sm font-medium text-foreground font-mono">
            {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
          </span>
        </div>
      </div>

      {/* Success Indicators */}
      <div className="space-y-2 mb-6">
        {getSuccessIndicator(isForwardingActive, 'Call Forwarding Verified')}
        {getSuccessIndicator(isTextReplyActive, 'SMS Ready')}
        {getSuccessIndicator(!!liveMetrics.lastAiIntake, 'AI Intake Ready')}
      </div>

      {/* Last Verified */}
      {business?.forwarding_verified_at && (
        <div className="text-sm text-muted-foreground mb-6">
          Forwarding last verified: {formatRelativeTime(business.forwarding_verified_at)}
        </div>
      )}

      {/* Actions */}
      <div className="flex">
        <Link
          href="/setup/phone-forwarding?mode=review"
          className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-lg transition-colors"
        >
          Review Forwarding
        </Link>
      </div>

      {/* System Details - Collapsed by default when healthy */}
      {showSystemDetails && (
        <div className="mt-6 pt-6 border-t border-border">
          <button
            onClick={() => setShowSystemDetails(!showSystemDetails)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            {showSystemDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showSystemDetails ? 'Hide System Details' : 'View System Details'}
          </button>

          {showSystemDetails && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* System Diagnostics */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-foreground mb-3">System Diagnostics</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block mb-1">Twilio Config</span>
                    <span className={`font-medium ${business?.twilio_phone_number ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {business?.twilio_phone_number ? 'Healthy' : 'Pending'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">SMS Service</span>
                    <span className={`font-medium ${isTextReplyActive ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {isTextReplyActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Call Forwarding</span>
                    <span className={`font-medium ${isForwardingActive ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {isForwardingActive ? 'Verified' : 'Not Verified'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Last AI Intake</span>
                    <span className="font-medium text-foreground">
                      {liveMetrics.lastAiIntake ? formatRelativeTime(liveMetrics.lastAiIntake) : 'Never'}
                    </span>
                  </div>
                </div>

                {liveMetrics.deliveryFailures > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <span className="text-muted-foreground text-sm block mb-1">Delivery Failures (24h)</span>
                    <span className={`font-medium ${liveMetrics.deliveryFailures > 5 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {liveMetrics.deliveryFailures} failures
                    </span>
                    {liveMetrics.recentErrors.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {liveMetrics.recentErrors.slice(0, 3).map((error, idx) => (
                          <p key={idx} className="text-xs text-red-600 dark:text-red-400 truncate">{error}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
