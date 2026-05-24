'use client'

import React, { useState, useEffect } from 'react'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { Business } from '@/lib/types'
import { hasActiveAccess, hasActiveTrial } from '@/lib/subscription-utils'
import { createBrowserClient } from '@/lib/supabase/browser'
import Link from 'next/link'
import { X, Check, AlertCircle, Clock, Phone, MessageSquare, CreditCard, TestTube } from 'lucide-react'

interface SetupReviewPanelProps {
  isOpen: boolean
  onClose: () => void
  business: Business | null
}

interface SetupStep {
  id: string
  title: string
  description: string
  status: 'complete' | 'in-progress' | 'needs-action' | 'not-started'
  icon: React.ReactNode
  details?: string
  completionDate?: string
  actionText?: string
  actionHref?: string
  badge?: string
  instructions?: {
    title: string
    steps: string[]
  }
}

export default function SetupReviewPanel({ isOpen, onClose, business }: SetupReviewPanelProps) {
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([])
  const [loading, setLoading] = useState(true)
  const [completedSteps, setCompletedSteps] = useState(0)
  const [activityData, setActivityData] = useState({
    missedCallsProcessed: 0,
    leadsCreated: 0,
    smsSent: 0
  })
  const [showCompactModal, setShowCompactModal] = useState(false)
  const [operationalMetrics, setOperationalMetrics] = useState({
    lastActivity: null as string | null,
    lastSmsSent: null as string | null
  })

  useEffect(() => {
    if (!business) return

    // Fetch activity data for verification logic
    const fetchActivityData = async () => {
      try {
        const supabase = createBrowserClient()
        
        // Get missed calls count (using the same logic as OperationalStatusCard)
        const { data: missedCalls } = await supabase
          .from('leads')
          .select('id, created_at')
          .eq('business_id', business.id)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

        // Get leads created in last 30 days
        const { data: recentLeads } = await supabase
          .from('leads')
          .select('id, created_at')
          .eq('business_id', business.id)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

        // Get messages sent in last 30 days
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('created_at, direction')
          .eq('from_phone', business.twilio_phone_number || '')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

        // Get last activity and last SMS sent
        const { data: lastActivity } = await supabase
          .from('leads')
          .select('created_at')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(1)

        const { data: lastSms } = await supabase
          .from('messages')
          .select('created_at')
          .eq('direction', 'outbound')
          .eq('from_phone', business.twilio_phone_number || '')
          .order('created_at', { ascending: false })
          .limit(1)

        setActivityData({
          missedCallsProcessed: missedCalls?.length || 0,
          leadsCreated: recentLeads?.length || 0,
          smsSent: recentMessages?.filter((m: any) => m.direction === 'outbound').length || 0
        })

        setOperationalMetrics({
          lastActivity: lastActivity?.[0]?.created_at || null,
          lastSmsSent: lastSms?.[0]?.created_at || null
        })
      } catch (error) {
        console.error('Error fetching activity data:', error)
      }
    }

    fetchActivityData()

    const calculateSetupSteps = () => {
      // STEP 1: Business Information
      const businessInfoComplete = Boolean(business?.name && business?.business_phone_number)
      
      // STEP 2: Subscription Active  
      const subscriptionActive = hasActiveAccess(business)
      
      // STEP 3: ReplyFlow Number Ready
      const twilioReady = Boolean(business?.twilio_phone_number) && business?.provisioning_status === 'active'
      
      // STEP 4: Forwarding Configured
      const forwardingConfigured = Boolean(business?.phone_setup_completed_at)
      
      // STEP 5: Call Processing Verification - NEW LOGIC
      // System is verified if ANY of these have occurred:
      // 1. Manual test call completed
      // 2. Calls processed > 0 
      // 3. Leads created > 0
      // 4. SMS sent > 0
      const manualTestVerified = business?.forwarding_verified
      const systemActivityVerified = Boolean(
        activityData.missedCallsProcessed > 0 || 
        activityData.leadsCreated > 0 || 
        activityData.smsSent > 0
      )
      const callProcessingVerified = manualTestVerified || systemActivityVerified
      
      // Calculate completion count
      const completedStepsCount = [
        businessInfoComplete,
        subscriptionActive, 
        twilioReady,
        forwardingConfigured,
        callProcessingVerified
      ].filter(Boolean).length

      const steps: SetupStep[] = [
        // STEP 1: Business Information
        {
          id: 'business-info',
          title: 'Business Information',
          description: 'Your business details and contact information',
          status: businessInfoComplete ? 'complete' : 'needs-action',
          icon: <Phone className="w-5 h-5" />,
          details: businessInfoComplete 
            ? `Business: ${business.name}`
            : 'Enter your business name and phone number',
          completionDate: business?.created_at || undefined,
          actionText: businessInfoComplete ? undefined : 'Update Business Info',
          actionHref: '/dashboard/settings'
        },
        
        // STEP 2: Subscription Active
        {
          id: 'subscription',
          title: 'Subscription Active',
          description: 'Your ReplyFlow subscription plan',
          status: subscriptionActive ? 'complete' : 'needs-action',
          icon: <CreditCard className="w-5 h-5" />,
          details: subscriptionActive 
            ? (hasActiveTrial(business) ? 'Free Trial Active' : 'Paid Subscription Active')
            : 'Start your free trial or activate a subscription',
          completionDate: subscriptionActive ? (business?.trial_ends_at || business?.current_period_end || undefined) : undefined,
          actionText: subscriptionActive ? undefined : 'Start Free Trial',
          actionHref: '/pricing'
        },
        
        // STEP 3: ReplyFlow Number Ready
        {
          id: 'phone-number',
          title: 'ReplyFlow Number Ready',
          description: 'Your dedicated ReplyFlow phone number',
          status: twilioReady ? 'complete' : subscriptionActive ? 'in-progress' : 'not-started',
          icon: <Phone className="w-5 h-5" />,
          details: twilioReady 
            ? `Number: ${formatPhoneNumber(business.twilio_phone_number)}`
            : subscriptionActive ? 'Assigning your ReplyFlow number...' : 'Requires active subscription',
          completionDate: business?.provisioned_at || undefined,
          actionText: twilioReady ? undefined : subscriptionActive ? 'Assign Number' : 'Start Subscription First',
          actionHref: subscriptionActive ? '/dashboard/settings' : '/pricing'
        },
        
        // STEP 4: Forwarding Configured
        {
          id: 'call-forwarding',
          title: callProcessingVerified ? 'Forwarding Verified' : 'Forwarding Configured',
          description: callProcessingVerified ? 'ReplyFlow has successfully received and processed calls' : 'Forward your business phone to ReplyFlow',
          status: forwardingConfigured ? 'complete' : twilioReady ? 'needs-action' : 'not-started',
          icon: <Phone className="w-5 h-5" />,
          details: callProcessingVerified
            ? `ReplyFlow has successfully received and processed calls from ${formatPhoneNumber(business.business_phone_number)}`
            : forwardingConfigured
              ? `Forwarding configured: ${formatPhoneNumber(business.business_phone_number)} → ${formatPhoneNumber(business.twilio_phone_number)}`
              : twilioReady 
                ? `Configure forwarding from ${formatPhoneNumber(business.business_phone_number)} to ${formatPhoneNumber(business.twilio_phone_number)}`
                : 'Requires ReplyFlow number first',
          completionDate: callProcessingVerified ? (business?.test_call_received_at || undefined) : business?.phone_setup_completed_at || undefined,
          actionText: forwardingConfigured && !callProcessingVerified ? undefined : twilioReady ? 'Configure Forwarding' : 'Get ReplyFlow Number First',
          actionHref: twilioReady ? '/setup/phone-forwarding' : '/dashboard/settings',
          instructions: twilioReady && !forwardingConfigured ? {
            title: 'Forwarding Instructions',
            steps: [
              `Dial **${formatPhoneNumber(business.business_phone_number || '')}**`,
              'Enter **##004** (AT&T) or **##004** (Verizon)',
              `Enter forwarding number: **${formatPhoneNumber(business.twilio_phone_number || '')}**`,
              'Wait for confirmation tone',
              'We\'ll verify forwarding during your test call'
            ]
          } : undefined
        },
        
        // STEP 5: Call Processing Verification
        {
          id: 'call-processing-verification',
          title: 'Call Processing Verification',
          description: 'Verify that ReplyFlow successfully receives and processes calls',
          status: callProcessingVerified ? 'complete' : forwardingConfigured ? 'needs-action' : 'not-started',
          icon: <TestTube className="w-5 h-5" />,
          details: callProcessingVerified 
            ? systemActivityVerified 
              ? `ReplyFlow has successfully processed ${activityData.missedCallsProcessed} call${activityData.missedCallsProcessed !== 1 ? 's' : ''} and is actively monitoring`
              : 'Test call received and ReplyFlow workflow verified'
            : forwardingConfigured 
              ? 'Run a test call to confirm ReplyFlow is receiving missed calls correctly'
              : 'Configure forwarding first',
          completionDate: business?.test_call_received_at || undefined,
          actionText: callProcessingVerified ? 'Run Another Test' : forwardingConfigured ? 'Run Test Call' : 'Configure Forwarding First',
          actionHref: forwardingConfigured ? '/dashboard/test-setup' : '/setup/phone-forwarding'
        }
      ]

      setSetupSteps(steps)
      setCompletedSteps(completedStepsCount)
      setLoading(false)
    }

    calculateSetupSteps()
  }, [business, activityData, operationalMetrics])

  const getStatusIcon = (status: SetupStep['status']) => {
    switch (status) {
      case 'complete':
        return <Check className="w-4 h-4 text-green-600" />
      case 'in-progress':
        return <Clock className="w-4 h-4 text-blue-600" />
      case 'needs-action':
        return <AlertCircle className="w-4 h-4 text-amber-600" />
      case 'not-started':
        return <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />
    }
  }

  const getStatusColor = (status: SetupStep['status']) => {
    switch (status) {
      case 'complete':
        return 'text-green-600 dark:text-green-400'
      case 'in-progress':
        return 'text-blue-600 dark:text-blue-400'
      case 'needs-action':
        return 'text-amber-600 dark:text-amber-400'
      case 'not-started':
        return 'text-gray-400'
    }
  }

  const getBadgeColor = (badge?: string) => {
    switch (badge) {
      case 'Active':
      case 'Verified':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      case 'In Progress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      case 'Required':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
      case 'Pending':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const totalSteps = setupSteps.length
  const completionPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  if (!isOpen) return null

  // Show compact completed state when setup is complete
  const isSetupComplete = completedSteps === 5

  if (isSetupComplete) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Compact Modal */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Setup Complete ✓</h2>
                  <p className="text-sm text-muted-foreground">ReplyFlow is actively monitoring your business line</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Completed Steps */}
              <div className="space-y-3 mb-6">
                {setupSteps.map((step) => (
                  <div key={step.id} className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-green-50 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-sm text-foreground">{step.title}</span>
                  </div>
                ))}
              </div>

              {/* Operational Metrics */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-foreground mb-3">Operational Metrics</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Calls Processed</span>
                    <span className="font-medium text-foreground">{activityData.missedCallsProcessed}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Activity</span>
                    <span className="font-medium text-foreground">
                      {operationalMetrics.lastActivity ? formatRelativeTime(operationalMetrics.lastActivity) : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last SMS Sent</span>
                    <span className="font-medium text-foreground">
                      {operationalMetrics.lastSmsSent ? formatRelativeTime(operationalMetrics.lastSmsSent) : 'None'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel - positioned below header */}
      <div className="absolute right-0 top-16 h-[calc(100vh-4rem)] w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-foreground">Setup Review</h2>
              <div className="mt-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-foreground">
                      {completedSteps}
                    </span>
                    <span className="text-sm text-muted-foreground">/ 5 Complete</span>
                  </div>
                  {completedSteps === 5 ? (
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      Setup Complete
                    </span>
                  ) : (
                    <span className="text-sm text-amber-600 dark:text-amber-400">
                      {5 - completedSteps} step{5 - completedSteps > 1 ? 's' : ''} remaining
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {completedSteps === 5 
                    ? 'ReplyFlow is actively monitoring your business line.'
                    : completedSteps === 4
                      ? 'One final step remains. Run a test call to verify your setup.'
                      : `${completedSteps} of 5 steps completed. Continue setup to activate ReplyFlow.`
                  }
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* System Health Dashboard */}
                {completedSteps === totalSteps && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <h4 className="text-sm font-semibold text-green-900 dark:text-green-100">System Ready</h4>
                    </div>
                    <p className="text-sm text-green-800 dark:text-green-200">
                      ReplyFlow is fully configured and ready to capture leads
                    </p>
                  </div>
                )}

                {/* Progress Overview */}
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">Setup Progress</span>
                    <span className="text-sm text-muted-foreground">{completedSteps}/{totalSteps} complete</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {completionPercentage}% complete
                  </div>
                </div>

                {/* Setup Steps */}
                <div className="space-y-4">
                  {setupSteps.map((step) => (
                    <div key={step.id} className="bg-card border border-border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 ${getStatusColor(step.status)}`}>
                          {getStatusIcon(step.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium text-foreground">{step.title}</h3>
                            {step.badge && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getBadgeColor(step.badge)}`}>
                                {step.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{step.description}</p>
                          
                          {step.details && (
                            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                              {step.details}
                            </div>
                          )}

                          {step.completionDate && (
                            <div className="text-xs text-muted-foreground mb-2">
                              Completed: {formatRelativeTime(step.completionDate)}
                            </div>
                          )}

                          {/* Forwarding Instructions */}
                          {step.instructions && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-2">
                              <h5 className="text-xs font-medium text-amber-900 dark:text-amber-100 mb-2">
                                {step.instructions.title}
                              </h5>
                              <ol className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                                {step.instructions.steps.map((instruction, idx) => (
                                  <li key={idx} className="flex items-start gap-2">
                                    <span className="text-amber-600 dark:text-amber-400 font-medium">{idx + 1}.</span>
                                    <span dangerouslySetInnerHTML={{ __html: instruction }} />
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {step.actionText && step.actionHref && (
                            <Link
                              href={step.actionHref}
                              onClick={onClose}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              {step.actionText}
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border bg-slate-50 dark:bg-slate-800/50">
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded-lg transition-colors text-sm font-medium"
              >
                Close
              </button>
              <Link
                href="/dashboard/test-setup"
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Test Setup
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
