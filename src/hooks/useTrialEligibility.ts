'use client'

import { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { useAuth } from '@/contexts/AuthContext'
import { createBrowserClient } from '@/lib/supabase/browser'

export interface TrialEligibilityResult {
  eligible: boolean
  hasUsedTrial: boolean
  cooldownActive: boolean
  cooldownEndDate?: string
  reasons?: string[]
  failureType?: 'previous_subscription' | 'previous_trial' | 'phone_used' | 'cooldown' | 'domain_abuse' | 'generic'
  failureTitle?: string
  failureMessage?: string
  failureDetails?: string
}

export interface UseTrialEligibilityReturn {
  checkoutMode: 'trial' | 'paid'
  isLoading: boolean
  eligibility: TrialEligibilityResult | null
  error: string | null
}

export function useTrialEligibility(): UseTrialEligibilityReturn {
  const [checkoutMode, setCheckoutMode] = useState<'trial' | 'paid' | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [eligibility, setEligibility] = useState<TrialEligibilityResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const { business } = useBusiness()
  const { user } = useAuth()
  const supabase = createBrowserClient()

  useEffect(() => {
    const checkTrialEligibility = async () => {
      // Guard: Don't check eligibility if user already has active subscription
      if (business?.subscription_status === 'trialing' || business?.subscription_status === 'active') {
        console.log('[Trial Eligibility] User already has active subscription, skipping eligibility check', {
          subscription_status: business.subscription_status,
          stripe_subscription_id: business.stripe_subscription_id
        })
        setCheckoutMode('trial')
        setIsLoading(false)
        return
      }

      // Guard: Don't check eligibility if user already has stripe_subscription_id
      if (business?.stripe_subscription_id) {
        console.log('[Trial Eligibility] User already has Stripe subscription, skipping eligibility check', {
          stripe_subscription_id: business.stripe_subscription_id
        })
        setCheckoutMode('paid')
        setIsLoading(false)
        return
      }

      if (!business?.business_phone_number || !user?.email) {
        console.log('[Trial Eligibility] Missing required data for eligibility check')
        setCheckoutMode('paid')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch('/api/trial/check-eligibility', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            business_phone_number: business.business_phone_number,
            business_email: user.email,
          }),
        })

        if (!response.ok) {
          // Handle 429 rate limit gracefully
          if (response.status === 429) {
            console.warn('[Trial Eligibility] Rate limited by Stripe, defaulting to paid mode')
            setCheckoutMode('paid')
            setIsLoading(false)
            return
          }
          throw new Error('Failed to check trial eligibility')
        }

        const data = await response.json()
        
        // API returns: { ok: true, eligible: boolean, checks: {...}, message: string, reasons?: string[], support_email?: string }
        const hasUsedTrial = !data.eligible && data.checks?.phone_number_eligible === false
        const cooldownActive = !!data.checks?.cooldown_end_date
        
        const mode: 'trial' | 'paid' = data.eligible ? 'trial' : 'paid'
        
        // Determine failure type and user-friendly messages
        let failureType: 'previous_subscription' | 'previous_trial' | 'phone_used' | 'cooldown' | 'domain_abuse' | 'generic' = 'generic'
        let failureTitle = 'Free Trial Not Available'
        let failureMessage = 'You are not eligible for a free trial at this time.'
        let failureDetails = ''
        
        if (!data.eligible) {
          const reasons = data.reasons || []
          
          if (data.checks?.stripe_eligible === false) {
            failureType = 'previous_subscription'
            failureTitle = 'Free Trial Already Used'
            failureMessage = 'This email has already been associated with a previous ReplyFlow trial or subscription.'
            failureDetails = 'To prevent abuse, free trials are limited to one per customer. You can continue by subscribing directly.'
          } else if (data.checks?.phone_number_eligible === false) {
            if (data.checks?.cooldown_end_date) {
              failureType = 'cooldown'
              failureTitle = 'Trial Cooldown Period'
              failureMessage = 'This business phone number is within the trial cooldown period.'
              const cooldownDate = new Date(data.checks.cooldown_end_date)
              failureDetails = `You can start another free trial after ${cooldownDate.toLocaleDateString()}.`
            } else {
              failureType = 'phone_used'
              failureTitle = 'Phone Number Already Used'
              failureMessage = 'This business phone number is already associated with an active account.'
              failureDetails = 'Each phone number can only be used for one free trial. You can continue by subscribing directly.'
            }
          } else if (data.checks?.email_domain_eligible === false) {
            failureType = 'domain_abuse'
            failureTitle = 'Free Trial Limit Reached'
            failureMessage = 'This domain has been associated with multiple trial accounts.'
            failureDetails = 'To prevent abuse, free trials are limited per domain. You can continue by subscribing directly.'
          } else if (reasons.length > 0) {
            failureDetails = reasons.join(' ')
          }
        }
        
        setCheckoutMode(mode)
        setEligibility({
          eligible: data.eligible,
          hasUsedTrial,
          cooldownActive,
          cooldownEndDate: data.checks?.cooldown_end_date,
          reasons: data.reasons || [],
          failureType: data.eligible ? undefined : failureType,
          failureTitle: data.eligible ? undefined : failureTitle,
          failureMessage: data.eligible ? undefined : failureMessage,
          failureDetails: data.eligible ? undefined : failureDetails
        })

        console.log('[Trial Eligibility] Determined checkout mode', {
          hasUsedTrial,
          cooldownActive,
          checkoutMode: mode,
          businessId: business.id,
          eligible: data.eligible,
          cooldownEndDate: data.checks?.cooldown_end_date
        })
      } catch (err) {
        console.error('[Trial Eligibility] Error checking eligibility:', err)
        setError(err instanceof Error ? err.message : 'Failed to check eligibility')
        // Default to paid mode if we can't check eligibility
        setCheckoutMode('paid')
      } finally {
        setIsLoading(false)
      }
    }

    // Only check eligibility if we have the required data AND user doesn't already have active subscription
    if (business?.id && user?.email && business?.business_phone_number && 
        business.subscription_status !== 'trialing' && 
        business.subscription_status !== 'active' && 
        !business.stripe_subscription_id) {
      checkTrialEligibility()
    } else {
      // If we don't have required data or user already has subscription, set loading to false and mode to paid
      setIsLoading(false)
      setCheckoutMode(business?.subscription_status === 'trialing' ? 'trial' : 'paid')
    }
  }, [business?.id, user?.email, business?.business_phone_number, business?.subscription_status, business?.stripe_subscription_id])

  return {
    checkoutMode: checkoutMode || 'paid', // Default to paid if null
    isLoading,
    eligibility,
    error
  }
}
