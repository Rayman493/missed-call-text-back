import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import ReplyflowStripeTerminal from '@/lib/terminal'
import { Business } from '@/lib/types'
import tapToPayCapabilityStore, { TapToPaySupportStatus } from '@/lib/tap-to-pay/tap-to-pay-capability-store'

interface TapToPayAwarenessState {
  isEligible: boolean
  isLoading: boolean
  error: string | null
  business: Business | null
  tapToPaySupportStatus: TapToPaySupportStatus | null
}

interface UseTapToPayAwarenessReturn {
  state: TapToPayAwarenessState
  acknowledgeAwareness: () => Promise<void>
  isAcknowledged: boolean
  checkCapability: () => Promise<void>
}

export function useTapToPayAwareness(business: Business | null): UseTapToPayAwarenessReturn {
  const [state, setState] = useState<TapToPayAwarenessState>({
    isEligible: false,
    isLoading: true,
    error: null,
    business: null,
    tapToPaySupportStatus: null,
  })
  const [isAcknowledged, setIsAcknowledged] = useState(false)
  const hasAcknowledgedRef = useRef(false)

  // Subscribe to shared capability store
  useEffect(() => {
    const unsubscribe = tapToPayCapabilityStore.subscribe((storeState) => {
      setState(prev => ({
        ...prev,
        tapToPaySupportStatus: storeState.status,
        isLoading: storeState.isLoading,
        error: storeState.error,
      }))
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    // Check if already acknowledged in this session
    if (hasAcknowledgedRef.current) {
      setState(prev => ({ ...prev, isLoading: false, isEligible: false, business }))
      return
    }

    // Update business in state
    setState(prev => ({ ...prev, business }))

    // Check eligibility
    const checkEligibility = async () => {
      try {
        // 1. Check platform - must be native iOS
        const isNative = Capacitor.isNativePlatform()
        const platform = Capacitor.getPlatform()
        const isIOS = platform === 'ios'
        
        if (!isNative || !isIOS) {
          setState(prev => ({ ...prev, isLoading: false, isEligible: false }))
          return
        }

        // 2. Check business exists
        if (!business) {
          setState(prev => ({ ...prev, isLoading: false, isEligible: false }))
          return
        }

        // 3. Check if already acknowledged
        const businessAny = business as any
        if (businessAny.tap_to_pay_awareness_acknowledged_at) {
          setIsAcknowledged(true)
          setState(prev => ({ ...prev, isLoading: false, isEligible: false }))
          return
        }

        // 4. Check Stripe Connect is connected
        const isStripeConnected = business.stripe_connect_status === 'connected'
        if (!isStripeConnected) {
          setState(prev => ({ ...prev, isLoading: false, isEligible: false }))
          return
        }

        // 5. Check charges are enabled
        const areChargesEnabled = business.stripe_charges_enabled === true
        if (!areChargesEnabled) {
          setState(prev => ({ ...prev, isLoading: false, isEligible: false }))
          return
        }

        // 6. Check Tap to Pay capability via shared store
        const supportStatus = await tapToPayCapabilityStore.checkCapability()

        // 7. Check if device supports Tap to Pay
        if (!supportStatus || !supportStatus.supported) {
          setState(prev => ({
            ...prev,
            isEligible: false,
          }))
          return
        }

        // All checks passed - eligible
        setState(prev => ({
          ...prev,
          isEligible: true,
        }))

      } catch (error) {
        console.error('[useTapToPayAwareness] Error checking eligibility:', error)
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to check eligibility',
        }))
      }
    }

    checkEligibility()
  }, [business])

  const acknowledgeAwareness = async () => {
    try {
      const response = await fetch('/api/business/tap-to-pay-awareness', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to acknowledge awareness')
      }

      const result = await response.json()
      
      // Update local state
      setIsAcknowledged(true)
      hasAcknowledgedRef.current = true
      setState(prev => ({ ...prev, isEligible: false, business: result.business }))

    } catch (error) {
      console.error('[useTapToPayAwareness] Error acknowledging:', error)
      throw error
    }
  }

  const checkCapability = async () => {
    await tapToPayCapabilityStore.checkCapability({ forceRefresh: true })
    
    // Recalculate eligibility after refresh
    const businessAny = business as any
    if (business?.stripe_charges_enabled && !businessAny?.tap_to_pay_awareness_acknowledged_at) {
      const storeState = tapToPayCapabilityStore.getState()
      const isEligible = !!storeState.status?.supported
      setState(prev => ({ ...prev, isEligible }))
    }
  }

  return {
    state,
    acknowledgeAwareness,
    isAcknowledged,
    checkCapability,
  }
}
