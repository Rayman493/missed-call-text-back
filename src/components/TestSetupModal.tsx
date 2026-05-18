'use client'

import { useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber, getReplyFlowPhoneNumberDisplay } from '@/lib/utils'
import { 
  hasValidSubscription,
  getSubscriptionStatusText,
  getSubscriptionStatusDescription
} from '@/lib/subscription'

interface TestSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onTestCompleted?: () => void
}

interface SetupChecklistItem {
  label: string
  status: 'healthy' | 'warning' | 'error'
  details: string
}

export default function TestSetupModal({ isOpen, onClose, onTestCompleted }: TestSetupModalProps) {
  const { business, refreshBusiness } = useBusiness()
  const [isCompleting, setIsCompleting] = useState(false)

  if (!isOpen) return null

  const getSetupChecklist = (): SetupChecklistItem[] => {
    if (!business) return []

    const items: SetupChecklistItem[] = []

    // ReplyFlow Number Active
    items.push({
      label: 'ReplyFlow Number Active',
      status: business.twilio_phone_number ? 'healthy' : 'error',
      details: business.twilio_phone_number 
        ? `Number: ${business.twilio_phone_number}` 
        : 'No ReplyFlow number assigned'
    })

    // SMS Working
    const smsWorking = business.twilio_phone_number && hasValidSubscription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
    items.push({
      label: 'SMS Working',
      status: smsWorking ? 'healthy' : 'error',
      details: smsWorking 
        ? 'SMS service is ready' 
        : 'Not configured yet'
    })

    // Subscription Active
    const subscriptionActive = hasValidSubscription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
    items.push({
      label: 'Subscription Active',
      status: subscriptionActive ? 'healthy' : 'error',
      details: subscriptionActive 
        ? getSubscriptionStatusDescription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
        : 'Start your 14-day free trial to activate ReplyFlow'
    })

    // Forwarding Verified
    items.push({
      label: 'Forwarding Verified',
      status: business.forwarding_verified ? 'healthy' : 'warning',
      details: business.forwarding_verified 
        ? `Verified at ${business.forwarding_verified_at ? new Date(business.forwarding_verified_at).toLocaleDateString() : 'Recently'}` 
        : 'Forwarding becomes verified after your first successful missed-call test'
    })

    return items
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 4-6 6 2 12-2l4 4-6m6 6 16m-6-6a2 2 0 00-2 2v12a2 2 0 002 2m0 0h2a2 2 0 00-2 2v12a2 2 0 01.684.949V19a2 2 0 01-2 2z" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v-1m.586-.414A2 2 0 01-.414 0L9 9m0l6 6a2 2 0 112.828 0l6 6a2 2 0 112.828 0L21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 00-2 2v12a2 2 0 00-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6" />
          </svg>
        )
    }
  }

  const handleTestCompleted = async () => {
    setIsCompleting(true)
    
    try {
      // Refresh business data to get latest verification status
      await refreshBusiness()
      
      // Call the completion callback
      if (onTestCompleted) {
        onTestCompleted()
      }
      
      // Close the modal
      onClose()
    } catch (error) {
      console.error('Error refreshing business data:', error)
    } finally {
      setIsCompleting(false)
    }
  }

  const formatPhone = (phone: string | null | undefined) => {
    if (!phone) return 'Not set'
    return formatPhoneNumber(phone)
  }

  const checklistItems = getSetupChecklist()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-bold text-foreground">Test Your ReplyFlow Setup</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            {/* Business Details */}
            <div className="bg-muted rounded-lg p-4">
              <h3 className="text-lg font-semibold text-foreground mb-3">Your Business Details</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Business Phone:</span>
                  <span className="text-foreground font-mono">{formatPhoneNumber(business?.business_phone_number)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">ReplyFlow Number:</span>
                  <span className="text-foreground font-mono">{getReplyFlowPhoneNumberDisplay(business)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Setup Status:</span>
                  <span className={`font-medium ${
                    business?.forwarding_verified ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {business?.forwarding_verified ? 'Verified' : 'Awaiting Test'}
                  </span>
                </div>
              </div>
            </div>

            {/* Setup Checklist */}
            <div className="bg-muted rounded-lg p-4">
              <h3 className="text-lg font-semibold text-foreground mb-3">Setup Checklist</h3>
              <div className="space-y-3">
                {checklistItems.map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getStatusIcon(item.status)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-foreground">{item.label}</h4>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          item.status === 'healthy' ? 'bg-green-900/30 text-green-400' :
                          item.status === 'warning' ? 'bg-yellow-900/30 text-yellow-400' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {item.status === 'healthy' ? 'Done' :
                           item.status === 'warning' ? 'Pending' : 'Skipped'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{item.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Test Instructions */}
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-3">Test Instructions</h3>
              <ol className="space-y-3 text-muted-foreground">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
                  <span>Have someone call your business phone number.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
                  <span>Do not answer the call.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
                  <span>Wait for it to forward to ReplyFlow.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">4</span>
                  <span>Confirm the caller hears the missed-call message.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">5</span>
                  <span>Confirm the caller receives the automated SMS.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">6</span>
                  <span>Refresh the dashboard and confirm the lead appears.</span>
                </li>
              </ol>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-border">
              <button
                onClick={handleTestCompleted}
                disabled={isCompleting}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCompleting ? 'Refreshing...' : 'I Completed the Test'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
