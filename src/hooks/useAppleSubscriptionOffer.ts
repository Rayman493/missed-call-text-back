/**
 * Fetch the Apple subscription offer for paywall copy decisions.
 *
 * iOS billing claims (free trial, price, provider) must reflect the real
 * StoreKit product — Apple's intro-offer eligibility is per-Apple-ID and
 * cannot be assumed. On non-iOS platforms the hook is inert: Stripe/Google
 * Play surfaces keep their existing copy untouched.
 *
 * 'failed'/'loading' states must render neutral copy — never a trial or
 * price claim backed by nothing.
 */

import { useEffect, useState } from 'react'
import { isNativeIOS, getSubscriptionOffer, type AppleSubscriptionOffer } from '@/lib/apple-billing'

export type AppleOfferState =
  | { status: 'not-ios' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; offer: AppleSubscriptionOffer }

export function useAppleSubscriptionOffer(): AppleOfferState {
  const [state, setState] = useState<AppleOfferState>(
    () => (isNativeIOS() ? { status: 'loading' } : { status: 'not-ios' })
  )

  useEffect(() => {
    if (!isNativeIOS()) return
    let cancelled = false
    getSubscriptionOffer()
      .then(offer => { if (!cancelled) setState({ status: 'loaded', offer }) })
      .catch(() => { if (!cancelled) setState({ status: 'failed' }) })
    return () => { cancelled = true }
  }, [])

  return state
}
