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
            businessId: business.id,
            email: user.email,
            phoneNumber: business.business_phone_number,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to check trial eligibility')
        }

        const data = await response.json()
        
        const hasUsedTrial = !!data.has_used_trial
        const cooldownActive = !!data.cooldown_end_date
        
        const mode: 'trial' | 'paid' = hasUsedTrial || cooldownActive ? 'paid' : 'trial'
        
        setCheckoutMode(mode)
        setEligibility({
          eligible: data.eligible,
          hasUsedTrial,
          cooldownActive,
          cooldownEndDate: data.cooldown_end_date,
          reasons: data.reasons || []
        })

        console.log('[Trial Eligibility] Determined checkout mode', {
          hasUsedTrial,
          cooldownActive,
          checkoutMode: mode,
          businessId: business.id,
          eligible: data.eligible,
          cooldownEndDate: data.cooldown_end_date
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

    // Only check eligibility if we have the required data
    if (business?.id && user?.email && business?.business_phone_number) {
      checkTrialEligibility()
    } else {
      // If we don't have required data, set loading to false and mode to paid
      setIsLoading(false)
      setCheckoutMode('paid')
    }
  }, [business?.id, user?.email, business?.business_phone_number])

  return {
    checkoutMode: checkoutMode || 'paid', // Default to paid if null
    isLoading,
    eligibility,
    error
  }
}
