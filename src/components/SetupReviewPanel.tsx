'use client'

import React, { useState, useEffect } from 'react'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { Business } from '@/lib/types'
import { hasActiveAccess, hasActiveTrial } from '@/lib/subscription-utils'
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

  useEffect(() => {
    if (!business) return

    const calculateSetupSteps = () => {
      const subscriptionActive = hasActiveAccess(business)
      const twilioReady = Boolean(business?.twilio_phone_number) && business?.provisioning_status === 'active'
      const forwardingSetupComplete = Boolean(business?.phone_setup_completed_at)
      const testComplete = business?.forwarding_verified

      const steps: SetupStep[] = [
        {
          id: 'business-info',
          title: 'Business Information',
          description: 'Your business details and contact information',
          status: business?.name ? 'complete' : 'needs-action',
          icon: <Phone className="w-5 h-5" />,
          details: business?.name ? `Business: ${business.name}` : undefined,
          completionDate: business?.created_at || undefined,
          actionText: business?.name ? undefined : 'Update Business Info',
          actionHref: '/dashboard/settings'
        },
        {
          id: 'subscription',
          title: 'Trial/Subscription Status',
          description: 'Your ReplyFlow subscription plan',
          status: subscriptionActive ? 'complete' : 'needs-action',
          icon: <CreditCard className="w-5 h-5" />,
          details: subscriptionActive 
            ? (hasActiveTrial(business) ? 'Active Trial' : 'Active Subscription')
            : 'No active subscription',
          completionDate: subscriptionActive ? (business?.trial_ends_at || business?.current_period_end || undefined) : undefined,
          actionText: subscriptionActive ? undefined : 'Start Free Trial',
          actionHref: '/pricing',
          badge: subscriptionActive ? 'Active' : 'Required'
        },
        {
          id: 'phone-number',
          title: 'ReplyFlow Phone Number',
          description: 'Your dedicated ReplyFlow phone number',
          status: twilioReady ? 'complete' : subscriptionActive ? 'in-progress' : 'not-started',
          icon: <Phone className="w-5 h-5" />,
          details: business?.twilio_phone_number 
            ? `Number: ${formatPhoneNumber(business.twilio_phone_number)}`
            : undefined,
          completionDate: business?.provisioned_at || undefined,
          actionText: twilioReady ? undefined : subscriptionActive ? 'Assign Number' : 'Start Trial First',
          actionHref: subscriptionActive ? '/dashboard/settings' : '/pricing',
          badge: twilioReady ? 'Active' : subscriptionActive ? 'In Progress' : 'Pending'
        },
        {
          id: 'call-forwarding',
          title: 'Call Forwarding',
          description: 'Forward your business phone to ReplyFlow',
          status: forwardingSetupComplete ? 'complete' : twilioReady ? 'needs-action' : 'not-started',
          icon: <Phone className="w-5 h-5" />,
          details: business?.business_phone_number && business?.twilio_phone_number
            ? `Forward ${formatPhoneNumber(business.business_phone_number)} → ${formatPhoneNumber(business.twilio_phone_number)}`
            : business?.business_phone_number 
            ? `Business: ${formatPhoneNumber(business.business_phone_number)}`
            : undefined,
          completionDate: business?.phone_setup_completed_at || undefined,
          actionText: forwardingSetupComplete ? undefined : twilioReady ? 'Setup Forwarding' : 'Assign Number First',
          actionHref: twilioReady ? '/setup/phone-forwarding' : '/dashboard/settings',
          badge: forwardingSetupComplete ? 'Active' : twilioReady ? 'Required' : 'Pending',
          instructions: twilioReady && !forwardingSetupComplete ? {
            title: 'Forwarding Instructions',
            steps: [
              `Dial **${formatPhoneNumber(business.business_phone_number || '')}**`,
              'Enter **##004** (AT&T) or **##004** (Verizon)',
              `Enter forwarding number: **${formatPhoneNumber(business.twilio_phone_number || '')}**`,
              'Wait for confirmation tone',
              'Test by calling your business number'
            ]
          } : undefined
        },
        {
          id: 'test-verification',
          title: 'Test Call Verification',
          description: 'Verify your setup with a test call',
          status: testComplete ? 'complete' : forwardingSetupComplete ? 'needs-action' : 'not-started',
          icon: <TestTube className="w-5 h-5" />,
          details: testComplete ? 'Test call verified successfully' : undefined,
          completionDate: business?.test_call_received_at || undefined,
          actionText: testComplete ? 'Run Another Test' : forwardingSetupComplete ? 'Run Test Call' : 'Setup Forwarding First',
          actionHref: forwardingSetupComplete ? '/dashboard/test-setup' : '/setup/phone-forwarding',
          badge: testComplete ? 'Verified' : forwardingSetupComplete ? 'Required' : 'Pending'
        }
      ]

      setSetupSteps(steps)
      setLoading(false)
    }

    calculateSetupSteps()
  }, [business])

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

  const completedSteps = setupSteps.filter(step => step.status === 'complete').length
  const totalSteps = setupSteps.length
  const completionPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Setup Review</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Review your ReplyFlow configuration
              </p>
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
