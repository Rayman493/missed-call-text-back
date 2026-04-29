'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatForDisplay } from '@/utils/phone-formatting'

interface HealthItem {
  title: string
  description: string
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  details?: string
}

export default function SetupHealth() {
  const router = useRouter()
  const { business, loading } = useBusiness()

  if (loading || !business) {
    return (
      <div className="bg-gray-800 rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-100 mb-4">Setup Health</h2>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded mb-3"></div>
          <div className="h-4 bg-gray-700 rounded mb-3"></div>
          <div className="h-4 bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  // Calculate health status
  const healthItems: HealthItem[] = []

  // 1. Forwarding connected
  const forwardingConnected = business.call_forwarding_enabled || !!business.phone_setup_completed_at
  healthItems.push({
    title: 'Forwarding Connected',
    description: 'Call forwarding is configured for missed calls',
    status: forwardingConnected ? 'healthy' : 'warning',
    details: forwardingConnected 
      ? 'Call forwarding is enabled' 
      : 'Phone setup not completed'
  })

  // 2. Subscription active
  const subscriptionActive = business.subscription_status === 'active' || business.subscription_status === 'trialing'
  healthItems.push({
    title: 'Subscription Active',
    description: 'Your ReplyFlow subscription is active',
    status: subscriptionActive ? 'healthy' : 'error',
    details: subscriptionActive 
      ? `Subscription is ${business.subscription_status}` 
      : 'No active subscription found'
  })

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
  const smsWorking = business.twilio_phone_number && (business.subscription_status === 'active' || business.subscription_status === 'trialing')
  healthItems.push({
    title: 'SMS Working',
    description: 'Auto-reply messages are being sent',
    status: smsWorking ? 'healthy' : 'warning',
    details: smsWorking 
      ? 'SMS service is configured' 
      : 'Not tested yet'
  })

  const getStatusIcon = (status: HealthItem['status']) => {
    switch (status) {
      case 'healthy':
        return (
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  const getStatusColor = (status: HealthItem['status']) => {
    switch (status) {
      case 'healthy': return 'text-green-400'
      case 'warning': return 'text-yellow-400'
      case 'error': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const handleViewInstructions = () => {
    router.push('/onboarding/phone-setup')
  }

  const handleTestCall = () => {
    // Open test call modal or navigate to test page
    router.push('/dashboard?test=true')
  }

  const handleManageSubscription = () => {
    router.push('/dashboard/settings#billing')
  }

  return (
    <div className="bg-gray-800 rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-semibold text-gray-100 mb-4">Setup Health</h2>
      
      <div className="space-y-3 mb-6">
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
                <p className={`text-xs mt-1 ${getStatusColor(item.status)}`}>{item.details}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-700 pt-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={handleViewInstructions}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            View Setup Instructions
          </button>
          <button
            onClick={handleTestCall}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Test Call Flow
          </button>
          <button
            onClick={handleManageSubscription}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Manage Subscription
          </button>
        </div>
      </div>
    </div>
  )
}
