'use client'

import { useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'

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

export default function CompactSetupHealth({ isExpanded: propExpanded, onToggle }: CompactSetupHealthProps) {
  const { business } = useBusiness()
  const [isExpanded, setIsExpanded] = useState(propExpanded || false)

  // Calculate health status
  const isFullyHealthy = () => {
    if (!business) return false
    
    const forwardingHealthy = business.business_phone_number && 
                           business.phone_setup_completed_at && 
                           business.call_forwarding_enabled &&
                           business.forwarding_verified
    
    const subscriptionHealthy = business.subscription_status === 'active' || business.subscription_status === 'trialing'
    const twilioHealthy = !!business.twilio_phone_number
    const smsWorking = twilioHealthy && subscriptionHealthy
    
    return forwardingHealthy && subscriptionHealthy && twilioHealthy && smsWorking
  }

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

  const getHealthItems = (): HealthItem[] => {
    if (!business) return []

    const items: HealthItem[] = []

    // 1. Forwarding status
    let forwardingStatus: HealthItem['status']
    let forwardingTitle: string
    let forwardingDescription: string
    let forwardingDetails: string

    if (!business.business_phone_number || !business.phone_setup_completed_at || !business.call_forwarding_enabled) {
      forwardingStatus = 'error'
      forwardingTitle = 'Forwarding Not Configured'
      forwardingDescription = 'Call forwarding setup not completed'
      forwardingDetails = 'Complete phone setup to enable call forwarding'
    } else if (business.forwarding_verified) {
      forwardingStatus = 'healthy'
      forwardingTitle = 'Forwarding Verified'
      forwardingDescription = 'Missed-call forwarding is working correctly'
      forwardingDetails = business.forwarding_verified_at 
        ? `Verified at ${new Date(business.forwarding_verified_at).toLocaleDateString()}`
        : 'Forwarding is working correctly'
    } else {
      forwardingStatus = 'warning'
      forwardingTitle = 'Forwarding Configured'
      forwardingDescription = 'Awaiting first successful missed-call test'
      forwardingDetails = 'Forwarding becomes verified after your first successful missed-call test'
    }

    items.push({
      title: forwardingTitle,
      description: forwardingDescription,
      status: forwardingStatus,
      details: forwardingDetails
    })

    // 2. Subscription status
    const subscriptionActive = business.subscription_status === 'active' || business.subscription_status === 'trialing'
    items.push({
      title: 'Subscription Active',
      description: 'Your ReplyFlow subscription is active',
      status: subscriptionActive ? 'healthy' : 'error',
      details: subscriptionActive 
        ? `Subscription is ${business.subscription_status}` 
        : 'No active subscription found'
    })

    // 3. Twilio status
    const twilioActive = !!business.twilio_phone_number
    items.push({
      title: 'Twilio Active',
      description: 'ReplyFlow number is assigned and ready',
      status: twilioActive ? 'healthy' : 'warning',
      details: twilioActive 
        ? `Number: ${business.twilio_phone_number}` 
        : 'No Twilio number assigned'
    })

    // 4. SMS status
    const smsWorking = twilioActive && subscriptionActive
    items.push({
      title: 'SMS Working',
      description: 'Auto-reply messages are being sent',
      status: smsWorking ? 'healthy' : 'warning',
      details: smsWorking 
        ? 'SMS service is configured' 
        : 'Not tested yet'
    })

    return items
  }

  const healthItems = getHealthItems()
  const hasIssues = healthItems.some(item => item.status === 'error')
  const hasWarnings = healthItems.some(item => item.status === 'warning')

  const handleToggle = () => {
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    if (onToggle) onToggle()
  }

  // If fully healthy, show compact success state
  if (isFullyHealthy()) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-green-800 dark:text-green-200 font-medium">
              ReplyFlow is fully operational
            </span>
          </div>
          <button
            onClick={handleToggle}
            className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm"
          >
            {isExpanded ? 'Hide' : 'Details'}
          </button>
        </div>
        
        {isExpanded && (
          <div className="mt-4 space-y-2">
            {healthItems.map((item, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                {getStatusIcon(item.status)}
                <span className="text-green-700 dark:text-green-300">{item.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // If has issues or warnings, show expanded state by default
  const shouldExpand = hasIssues || hasWarnings || isExpanded

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-4">
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
              <span className="font-medium text-gray-900 dark:text-gray-100">
                Setup Health
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
          </div>
          <button
            onClick={handleToggle}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <svg
              className={`w-5 h-5 transition-transform ${shouldExpand ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      
      {shouldExpand && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="space-y-3">
            {healthItems.map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(item.status)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-200">{item.title}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      item.status === 'healthy' ? 'bg-green-900/30 text-green-400' :
                      item.status === 'warning' ? 'bg-yellow-900/30 text-yellow-400' :
                      item.status === 'error' ? 'bg-red-900/30 text-red-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {item.status === 'healthy' ? 'Healthy' :
                       item.status === 'warning' ? 'Warning' :
                       item.status === 'error' ? 'Error' : 'Unknown'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{item.description}</p>
                  {item.details && (
                    <p className={`text-xs mt-1 ${
                      item.status === 'healthy' ? 'text-green-400' :
                      item.status === 'warning' ? 'text-yellow-400' :
                      item.status === 'error' ? 'text-red-400' :
                      'text-gray-400'
                    }`}>{item.details}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <a
                href="/dashboard/settings"
                className="flex-1 text-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                View Settings
              </a>
              <button
                onClick={() => {/* TODO: Open test modal */}}
                className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Test Setup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
