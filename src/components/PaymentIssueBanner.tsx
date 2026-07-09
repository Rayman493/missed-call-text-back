'use client'

import React, { useState, useEffect } from 'react'
import { AlertTriangle, X, CreditCard } from 'lucide-react'
import { handleBillingAction } from '@/lib/billing'
import { useAuth } from '@/contexts/AuthContext'

interface PaymentIssueBannerProps {
  businessId?: string
  subscriptionStatus?: string | null
}

export default function PaymentIssueBanner({ businessId, subscriptionStatus }: PaymentIssueBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false)
  const [isOpeningBilling, setIsOpeningBilling] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const { user } = useAuth()

  // Check if banner should be shown
  const shouldShow = subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid'

  // Reset dismissed state when subscription status changes
  useEffect(() => {
    if (shouldShow) {
      setIsDismissed(false)
    }
  }, [subscriptionStatus, shouldShow])

  if (!shouldShow || isDismissed) {
    return null
  }

  const handleDismiss = () => {
    setIsDismissed(true)
  }

  const handleUpdateBilling = async () => {
    if (!user) return
    
    setIsOpeningBilling(true)
    setBillingError(null)
    
    try {
      const result = await handleBillingAction()
      
      if (result.success && result.url) {
        window.location.href = result.url
      } else {
        setBillingError(result.error || 'Failed to open billing portal')
      }
    } catch (error: any) {
      setBillingError(error.message || 'Failed to open billing portal')
    } finally {
      setIsOpeningBilling(false)
    }
  }

  return (
    <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-100 mb-1">Payment issue detected</h3>
          <p className="text-xs text-amber-300 mb-3">
            We couldn't process your latest payment. Please update your payment method to keep ReplyFlow active.
          </p>
          
          {billingError && (
            <div className="bg-red-900/30 border border-red-800/30 rounded px-3 py-2 mb-3">
              <p className="text-xs text-red-200">{billingError}</p>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleUpdateBilling}
              disabled={isOpeningBilling}
              className="inline-flex items-center justify-center px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isOpeningBilling ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Opening...
                </>
              ) : (
                <>
                  <CreditCard className="w-3 h-3 mr-1.5" />
                  Update Billing
                </>
              )}
            </button>
            <button
              onClick={handleDismiss}
              className="inline-flex items-center justify-center px-3 py-1.5 bg-transparent hover:bg-amber-900/30 text-amber-300 hover:text-amber-200 text-xs font-medium rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-amber-400 hover:text-amber-300 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
