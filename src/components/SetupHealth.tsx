'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatForDisplay } from '@/utils/phone-formatting'
import { 
  getSubscriptionStatusText, 
  getSubscriptionStatusDescription,
  getSubscriptionActionButton,
  getSubscriptionTrustNote,
  hasValidSubscription,
  hasInvalidTrialState,
  SUBSCRIPTION_STATES 
} from '@/lib/subscription'
import TestCallFlowModal from './TestCallFlowModal'

interface HealthItem {
  title: string
  description: string
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  details?: string
}

export default function SetupHealth() {
  const router = useRouter()
  const { business, loading } = useBusiness()
  const [isTestModalOpen, setIsTestModalOpen] = useState(false)
  const [testCompleted, setTestCompleted] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('setup-health-collapsed')
      if (saved !== null) {
        setIsCollapsed(JSON.parse(saved))
      }
    } catch (error) {
      console.warn('Failed to load collapsed state from localStorage:', error)
    }
  }, [])

  // Save collapsed state to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('setup-health-collapsed', JSON.stringify(isCollapsed))
    } catch (error) {
      console.warn('Failed to save collapsed state to localStorage:', error)
    }
  }, [isCollapsed])

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
  }

  const handleHeaderClick = () => {
    toggleCollapse()
  }

  if (loading || !business) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Setup Health</h2>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-3"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-3"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  // Calculate health status
  const healthItems: HealthItem[] = []

  // 1. Forwarding connected - use new verification states
  let forwardingStatus: HealthItem['status']
  let forwardingTitle: string
  let forwardingDescription: string
  let forwardingDetails: string

  // Not Configured (Red) - Only if no business phone, no setup completion, or forwarding disabled
  if (!business.business_phone_number || !business.phone_setup_completed_at || !business.call_forwarding_enabled) {
    forwardingStatus = 'error'
    forwardingTitle = 'Forwarding Not Configured'
    forwardingDescription = 'Call forwarding setup not completed'
    forwardingDetails = 'Complete phone setup to enable call forwarding'
  } 
  // Verified Working (Green) - If forwarding_verified is true
  else if (business.forwarding_verified) {
    forwardingStatus = 'healthy'
    forwardingTitle = 'Forwarding Verified'
    forwardingDescription = 'Missed-call forwarding is working correctly'
    forwardingDetails = business.forwarding_verified_at 
      ? `Verified at ${new Date(business.forwarding_verified_at).toLocaleDateString()}`
      : 'Forwarding is working correctly'
  } 
  // Configured / Awaiting Test (Yellow) - Phone setup completed, forwarding enabled, but not verified
  else {
    forwardingStatus = 'warning'
    forwardingTitle = 'Forwarding Configured'
    forwardingDescription = 'Awaiting first successful missed-call test'
    forwardingDetails = 'Forwarding becomes verified after your first successful missed-call test'
  }

  healthItems.push({
    title: forwardingTitle,
    description: forwardingDescription,
    status: forwardingStatus,
    details: forwardingDetails
  })

  // 2. Subscription active
  const subscriptionValid = hasValidSubscription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
  const hasInvalidTrial = hasInvalidTrialState(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
  const isTrialing = business.subscription_status === SUBSCRIPTION_STATES.TRIALING
  const isActive = business.subscription_status === SUBSCRIPTION_STATES.ACTIVE
  
  healthItems.push({
    title: subscriptionValid ? 'Subscription Status' : 'Subscription Required',
    description: getSubscriptionStatusDescription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id),
    status: subscriptionValid ? 'healthy' : 'error',
    details: subscriptionValid 
      ? (isTrialing ? 'Free trial active' : 'Subscription active')
      : 'Start your 14-day free trial to activate ReplyFlow'
  })

  // Add trust note for inactive users
  if (!subscriptionValid) {
    const trustNote = getSubscriptionTrustNote(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
    if (trustNote) {
      healthItems.push({
        title: 'Trial Information',
        description: trustNote,
        status: 'healthy',
        details: 'No charge today. Cancel anytime.'
      })
    }
  }

  // 3. Twilio active
  const twilioActive = !!business.twilio_phone_number
  healthItems.push({
    title: 'Twilio Active',
    description: 'ReplyFlow number is assigned and ready',
    status: twilioActive ? 'healthy' : 'warning',
    details: twilioActive 
      ? `Number: ${formatForDisplay(business.twilio_phone_number!)}` 
      : 'No Twilio number assigned'
  })

  // 4. SMS working (simplified - would need to check recent message logs in real implementation)
  const smsWorking = business.twilio_phone_number && subscriptionValid
  healthItems.push({
    title: 'SMS Working',
    description: 'Auto-reply messages are being sent',
    status: smsWorking ? 'healthy' : 'warning',
    details: smsWorking 
      ? 'SMS service is configured' 
      : 'Not tested yet'
  })

  // Calculate overall status
  const overallStatus = healthItems.some(item => item.status === 'error') ? 'error' :
                        healthItems.some(item => item.status === 'warning') ? 'warning' :
                        healthItems.every(item => item.status === 'healthy') ? 'healthy' : 'unknown'

  const getStatusIcon = (status: HealthItem['status']) => {
    switch (status) {
      case 'healthy':
        return (
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )
    }
  }

  const getStatusColor = (status: HealthItem['status']) => {
    switch (status) {
      case 'healthy': return 'text-green-600 dark:text-green-400'
      case 'warning': return 'text-yellow-600 dark:text-yellow-400'
      case 'error': return 'text-red-600 dark:text-red-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
      case 'warning': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
      case 'error': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-400'
    }
  }

  const handleViewInstructions = () => {
    router.push('/onboarding/phone-setup')
  }

  const handleTestCall = () => {
    setIsTestModalOpen(true)
  }

  const handleTestCompleted = () => {
    setTestCompleted(true)
  }

  const handleCloseModal = () => {
    setIsTestModalOpen(false)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
      {/* Header - Clickable to toggle collapse */}
      <button
        onClick={handleHeaderClick}
        className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-t-xl"
        aria-expanded={!isCollapsed}
        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} Setup Health details`}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Setup Health</h2>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getOverallStatusColor(overallStatus)}`}>
            {overallStatus === 'healthy' ? 'Healthy' :
             overallStatus === 'warning' ? 'Warning' :
             overallStatus === 'error' ? 'Error' : 'Unknown'}
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
            isCollapsed ? 'transform rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="px-6 pb-6">
          <div className="space-y-3 mb-6">
            {healthItems.map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(item.status)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-200">{item.title}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      item.status === 'healthy' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' :
                      item.status === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' :
                      item.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' :
                      'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-400'
                    }`}>
                      {item.status === 'healthy' ? 'Healthy' :
                       item.status === 'warning' ? 'Warning' :
                       item.status === 'error' ? 'Error' : 'Unknown'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{item.description}</p>
                  {item.details && (
                    <p className={`text-xs mt-1 ${getStatusColor(item.status)}`}>{item.details}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 pb-6">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-300 mb-3">Quick Actions</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Primary action: Complete Phone Setup if forwarding is not complete */}
              {!business?.business_phone_number || !business?.phone_setup_completed_at || !business?.call_forwarding_enabled ? (
                <button
                  onClick={handleViewInstructions}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Complete Phone Setup
                </button>
              ) : (
                /* Secondary action: Test Setup if forwarding is configured */
                <button
                  onClick={handleTestCall}
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Test Setup
                </button>
              )}
              
              {/* Always show instructions button as secondary action */}
              {business?.business_phone_number && business?.phone_setup_completed_at && business?.call_forwarding_enabled && (
                <button
                  onClick={handleViewInstructions}
                  className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  View Instructions
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Test Call Flow Modal */}
      <TestCallFlowModal
        isOpen={isTestModalOpen}
        onClose={handleCloseModal}
        business={business}
        onTestCompleted={handleTestCompleted}
      />
    </div>
  )
}
