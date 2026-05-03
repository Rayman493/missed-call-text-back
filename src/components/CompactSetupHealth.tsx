'use client'

import React, { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { getReplyFlowPhoneNumberDisplay } from '@/lib/utils'
import { 
  getSubscriptionStatusText, 
  getSubscriptionStatusDescription,
  getSubscriptionActionButton,
  getSubscriptionTrustNote,
  hasValidSubscription,
  hasInvalidTrialState,
  SUBSCRIPTION_STATES 
} from '@/lib/subscription'
import TestSetupModal from './TestSetupModal'

interface HealthItem {
  title: string
  description: string
  status: 'healthy' | 'warning' | 'error'
  details?: string
}

interface CompactSetupHealthProps {
  isExpanded?: boolean
  onToggle?: () => void
}

// Local storage key for collapse preference
const COLLAPSE_PREFERENCE_KEY = 'setupHealthCollapsed'

export default function CompactSetupHealth({ isExpanded: propExpanded, onToggle }: CompactSetupHealthProps) {
  const { business, refreshBusiness } = useBusiness()
  const [isExpanded, setIsExpanded] = useState(propExpanded || false)
  const [showTestModal, setShowTestModal] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  // Calculate health status
  const isFullyHealthy = () => {
    if (!business) return false
    
    const forwardingHealthy = business.business_phone_number && 
                           business.phone_setup_completed_at && 
                           business.call_forwarding_enabled &&
                           business.forwarding_verified
    
    const subscriptionValid = hasValidSubscription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
    const twilioHealthy = !!business.twilio_phone_number
    const smsWorking = twilioHealthy && subscriptionValid
    
    return forwardingHealthy && subscriptionValid && twilioHealthy && smsWorking
  }

  // Load collapse preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPreference = localStorage.getItem(COLLAPSE_PREFERENCE_KEY)
      if (savedPreference !== null) {
        setIsExpanded(savedPreference === 'false') // false means expanded
      }
    }
  }, [])

  // Save collapse preference to localStorage
  const saveCollapsePreference = (collapsed: boolean) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(COLLAPSE_PREFERENCE_KEY, collapsed.toString())
    }
  }

  // Auto-collapse logic
  useEffect(() => {
    const healthy = isFullyHealthy()
    const hasIssues = !healthy
    
    // Force expand if there are issues, regardless of user preference
    if (hasIssues) {
      setIsExpanded(true)
      return
    }
    
    // Auto-collapse if healthy and no user preference exists
    if (healthy && typeof window !== 'undefined') {
      const savedPreference = localStorage.getItem(COLLAPSE_PREFERENCE_KEY)
      if (savedPreference === null) {
        // No user preference, auto-collapse when healthy
        setIsExpanded(false)
        saveCollapsePreference(true) // Save collapsed preference
      }
    }
  }, [business]) // Re-run when business data changes

  const getOnboardingItems = (): HealthItem[] => {
    if (!business) return []

    const items: HealthItem[] = []

    // 1. Free trial status
    const subscriptionValid = hasValidSubscription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
    const isTrialing = business.subscription_status === SUBSCRIPTION_STATES.TRIALING
    
    if (subscriptionValid) {
      items.push({
        title: 'Free trial active',
        description: 'Your ReplyFlow trial is ready to use',
        status: 'healthy',
        details: isTrialing ? '7 days remaining in trial' : 'Subscription active'
      })
    } else {
      items.push({
        title: 'Activate subscription',
        description: 'Choose a plan to continue using ReplyFlow',
        status: 'error',
        details: 'Free trial expired - upgrade required'
      })
    }

    // 2. Phone setup status
    const phoneSetupComplete = business.business_phone_number && business.phone_setup_completed_at && business.call_forwarding_enabled
    
    if (!phoneSetupComplete) {
      items.push({
        title: 'Complete call forwarding setup',
        description: 'Forward missed calls from your business phone to capture leads automatically',
        status: 'error',
        details: 'This step is required to start receiving missed calls'
      })
    } else if (business.forwarding_verified) {
      items.push({
        title: 'ReplyFlow is ready',
        description: 'Call forwarding is working and you can start receiving missed calls',
        status: 'healthy',
        details: 'Setup complete - you\'re all set!'
      })
    } else {
      items.push({
        title: 'Test your call forwarding',
        description: 'Call your business number from another phone to verify setup works',
        status: 'warning',
        details: 'One test call needed to complete setup'
      })
    }

    return items
  }

  const onboardingItems = getOnboardingItems()

  // Initialize expanded state based on onboarding status if not controlled by props
  useEffect(() => {
    const hasIssues = onboardingItems.some((item: HealthItem) => item.status === 'error')
    const hasWarnings = onboardingItems.some((item: HealthItem) => item.status === 'warning')
    if (propExpanded === undefined && (hasIssues || hasWarnings)) {
      setIsExpanded(true)
    }
  }, [onboardingItems, propExpanded])

  const getStatusIcon = (status: 'healthy' | 'warning' | 'error') => {
    switch (status) {
      case 'healthy':
        return (
          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
      default:
        return null
    }
  }

  // Get contextual action based on health status
  const getPrimaryAction = () => {
    if (!business) return null
    
    // Check forwarding status
    const forwardingNotConfigured = !business.business_phone_number || !business.phone_setup_completed_at || !business.call_forwarding_enabled
    
    // Check subscription status
    const subscriptionValid = hasValidSubscription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
    const hasInvalidTrial = hasInvalidTrialState(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
    const subscriptionInactive = !subscriptionValid
    
    // Check SMS status
    const smsNotConfigured = !business.twilio_phone_number
    
    // Return most critical action first
    if (forwardingNotConfigured) {
      return {
        text: 'Complete Phone Setup',
        href: '/onboarding/phone-setup',
        type: 'primary' as const
      }
    }
    
    if (subscriptionInactive) {
      return {
        text: 'Manage Subscription',
        onClick: () => {/* TODO: Handle subscription management */},
        type: 'primary' as const
      }
    }
    
    if (smsNotConfigured) {
      return {
        text: 'Fix SMS Setup',
        href: '/dashboard/settings',
        type: 'primary' as const
      }
    }
    
    return null // No primary action needed
  }

  const primaryAction = getPrimaryAction()

  const handleToggle = () => {
    setIsAnimating(true)
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    saveCollapsePreference(!newExpanded) // Save the new collapsed state
    if (onToggle) onToggle()
    
    // Reset animation state after transition completes
    setTimeout(() => setIsAnimating(false), 300)
  }

  const healthy = isFullyHealthy()
  const hasIssues = onboardingItems.some((item: HealthItem) => item.status === 'error')
  const hasWarnings = onboardingItems.some((item: HealthItem) => item.status === 'warning')

  // Compact healthy collapsed state
  if (healthy && !isExpanded) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-green-800 dark:text-green-200 font-medium text-sm">
              Getting Started — All Set ✓
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTestModal(true)}
              className="px-2 py-1 bg-green-100 hover:bg-green-200 dark:bg-green-600 dark:hover:bg-green-700 text-green-900 dark:text-white text-xs font-medium rounded transition-colors"
            >
              Test
            </button>
            <button
              type="button"
              onClick={handleToggle}
              aria-expanded={false}
              aria-label="Expand getting started details"
              className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 transition-colors"
            >
              <svg
                className="w-4 h-4 transition-transform duration-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Full expanded state (for issues/warnings or when manually expanded)
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-all duration-300 mb-8 ${healthy ? 'border-green-200 dark:border-green-800' : ''}`}>
      <div className={`${healthy ? 'p-3' : 'p-4'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {hasIssues ? (
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              ) : hasWarnings ? (
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
              <span className={`font-medium ${healthy ? 'text-sm text-green-800 dark:text-green-200' : 'text-gray-900 dark:text-gray-100'}`}>
                Getting Started
              </span>
            </div>
            {hasIssues && (
              <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 px-2 py-1 rounded-full">
                Issues Found
              </span>
            )}
            {hasWarnings && !hasIssues && (
              <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 px-2 py-1 rounded-full">
                Attention Needed
              </span>
            )}
            {healthy && (
              <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded-full">
                All Systems Operational
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={isExpanded}
            aria-label="Toggle getting started details"
            className={`text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors ${healthy ? 'text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300' : ''}`}
          >
            <svg
              className={`w-5 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      
      <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className={`border-t border-gray-200 dark:border-gray-700 ${healthy ? 'p-3' : 'p-4'}`}>
          <div className="space-y-3">
            {onboardingItems.map((item: HealthItem, index: number) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(item.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`font-medium ${healthy ? 'text-sm text-gray-900 dark:text-gray-100' : 'text-sm text-gray-900 dark:text-gray-100'} break-words`}>{item.title}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                      item.status === 'healthy' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      item.status === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      item.status === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {item.status === 'healthy' ? 'Operational' :
                       item.status === 'warning' ? 'Configured' :
                       item.status === 'error' ? 'Action needed' : 'Unknown'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 break-words overflow-wrap-anywhere">{item.description}</p>
                  {item.details && (
                    <p className={`text-xs mt-1 break-words overflow-wrap-anywhere ${
                      item.status === 'healthy' ? 'text-green-700 dark:text-green-400' :
                      item.status === 'warning' ? 'text-yellow-700 dark:text-yellow-400' :
                      item.status === 'error' ? 'text-red-700 dark:text-red-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>{item.details}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Primary Action Button */}
          {primaryAction && (
            <div className="pt-4 pb-2">
              {primaryAction.href ? (
                <a
                  href={primaryAction.href}
                  className="block w-full text-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {primaryAction.text}
                </a>
              ) : (
                <button
                  onClick={primaryAction.onClick}
                  className="block w-full text-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {primaryAction.text}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      
      <TestSetupModal 
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
        onTestCompleted={refreshBusiness}
      />
    </div>
  )
}
