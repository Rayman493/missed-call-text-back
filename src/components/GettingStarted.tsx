'use client'

import React, { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { getReplyFlowPhoneNumberDisplay } from '@/lib/utils'
import { 
  hasValidSubscription,
  SUBSCRIPTION_STATES 
} from '@/lib/subscription'
import Link from 'next/link'
import { Circle } from 'lucide-react'

interface ChecklistItem {
  id: string
  title: string
  description: string
  status: 'complete' | 'needs-action' | 'not-tested-yet'
  buttonText?: string
  buttonHref?: string
  details?: string
}

interface GettingStartedProps {
  isExpanded?: boolean
  onToggle?: () => void
}

// Local storage key for collapse preference
const COLLAPSE_PREFERENCE_KEY = 'gettingStartedCollapsed'

export default function GettingStarted({ isExpanded: propExpanded, onToggle }: GettingStartedProps) {
  const { business, refreshBusiness } = useBusiness()
  const [isExpanded, setIsExpanded] = useState(propExpanded || false)
  const [isAnimating, setIsAnimating] = useState(false)

  // Calculate if all steps are complete
  const isFullyComplete = () => {
    if (!business) return false
    
    const subscriptionActive = hasValidSubscription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
    const twilioReady = !!business.twilio_phone_number
    const forwardingComplete = business.business_phone_number && business.phone_setup_completed_at && business.call_forwarding_enabled
    const testComplete = business.forwarding_verified
    
    return subscriptionActive && twilioReady && forwardingComplete && testComplete
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
    const complete = isFullyComplete()
    
    // Auto-collapse if complete and no user preference exists
    if (complete && typeof window !== 'undefined') {
      const savedPreference = localStorage.getItem(COLLAPSE_PREFERENCE_KEY)
      if (savedPreference === null) {
        setIsExpanded(false)
        saveCollapsePreference(true) // Save collapsed preference
      }
    }
  }, [business])

  const getChecklistItems = (): ChecklistItem[] => {
    if (!business) return []

    const items: ChecklistItem[] = []

    // 1. Start your free trial
    const subscriptionActive = hasValidSubscription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
    const isTrialing = business.subscription_status === SUBSCRIPTION_STATES.TRIALING
    
    items.push({
      id: 'trial',
      title: 'Start your free trial',
      description: 'Activate ReplyFlow so your missed-call system can run.',
      status: subscriptionActive ? 'complete' : 'needs-action',
      details: subscriptionActive 
        ? (isTrialing ? '14-day free trial active' : 'Subscription active')
        : 'Start your 14-day free trial to begin',
      buttonText: subscriptionActive ? undefined : 'Start 14-Day Free Trial',
      buttonHref: '/auth/signup'
    })

    // 2. ReplyFlow number ready
    const twilioReady = !!business.twilio_phone_number
    
    items.push({
      id: 'number',
      title: 'ReplyFlow number ready',
      description: 'Your ReplyFlow forwarding number has been assigned.',
      status: twilioReady ? 'complete' : 'needs-action',
      details: twilioReady 
        ? `Number: ${getReplyFlowPhoneNumberDisplay(business)}`
        : 'Setting up your ReplyFlow number...'
    })

    // 3. Set up call forwarding
    const forwardingComplete = business.business_phone_number && business.phone_setup_completed_at && business.call_forwarding_enabled
    
    items.push({
      id: 'forwarding',
      title: 'Set up call forwarding',
      description: 'Forward missed calls from your business phone to ReplyFlow.',
      status: forwardingComplete ? 'complete' : 'needs-action',
      buttonText: forwardingComplete ? undefined : 'View Setup Instructions',
      buttonHref: '/onboarding/phone-setup'
    })

    // 4. Test your setup
    const testComplete = business.forwarding_verified
    
    items.push({
      id: 'test',
      title: 'Test your setup',
      description: 'Call your business number from another phone to confirm everything works.',
      status: testComplete ? 'complete' : forwardingComplete ? 'needs-action' : 'not-tested-yet',
      buttonText: testComplete ? undefined : 'View Test Instructions',
      buttonHref: '/demo'
    })

    return items
  }

  const checklistItems = getChecklistItems()

  const handleToggle = () => {
    setIsAnimating(true)
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    saveCollapsePreference(!newExpanded) // Save new collapsed state
    if (onToggle) onToggle()
    
    // Reset animation state after transition completes
    setTimeout(() => setIsAnimating(false), 300)
  }

  const complete = isFullyComplete()

  // Compact complete collapsed state
  if (complete && !isExpanded) {
    return (
      <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-green-800 dark:text-green-200">
                Getting Started
              </h2>
              <p className="text-sm text-green-700 dark:text-green-300">
                All setup steps complete!
              </p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 transition-colors"
          >
            <svg
              className="w-5 h-5 transition-transform duration-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // Full expanded state - Simple normal-flow layout
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 mb-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Getting Started
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Finish these steps to start capturing missed calls.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            className="text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <svg
              className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {checklistItems.map((item) => (
          <div key={item.id} className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex-shrink-0 mt-0.5">
              {item.status === 'complete' ? (
                <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              ) : item.status === 'needs-action' ? (
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                  <Circle className="w-4 h-4 text-white" />
                </div>
              ) : (
                <div className="w-6 h-6 bg-yellow-600 rounded-full flex items-center justify-center">
                  <Circle className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {item.title}
                </h3>
                <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                  item.status === 'complete' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                  item.status === 'needs-action' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}>
                  {item.status === 'complete' ? 'Complete' :
                   item.status === 'needs-action' ? 'Action needed' :
                   'Not tested yet'}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 break-words">
                {item.description}
              </p>
              {item.details && (
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-3 break-words">
                  {item.details}
                </p>
              )}
              {item.buttonText && item.buttonHref && (
                <Link
                  href={item.buttonHref}
                  className="inline-flex items-center justify-center px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {item.buttonText}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
