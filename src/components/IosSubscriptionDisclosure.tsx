'use client'

/**
 * iOS-only subscription disclosure block — App Review 3.1.2(c).
 *
 * Renders the plan benefits, the real localized StoreKit price and billing
 * period, the trial offer only when Apple's own eligibility check confirms
 * it, the auto-renewal/cancellation disclosure, Terms of Use + Privacy
 * Policy links, and a working Restore Purchases control.
 *
 * Non-iOS platforms render nothing — web/Android copy is untouched.
 */

import { useState } from 'react'
import Link from 'next/link'
import { isNativeIOS } from '@/lib/apple-billing'
import { useAppleSubscriptionOffer } from '@/hooks/useAppleSubscriptionOffer'
import { iosDisclosureCopy, IOS_SUBSCRIPTION_BENEFITS } from '@/lib/ios-disclosure'

interface Props {
  /** 'dark' for slate screens; 'brand' for blue-gradient surfaces (SetupStatusCard). */
  tone?: 'dark' | 'brand'
}

export default function IosSubscriptionDisclosure({ tone = 'dark' }: Props) {
  const onIOS = typeof window !== 'undefined' && isNativeIOS()
  const offer = useAppleSubscriptionOffer()
  const [restoring, setRestoring] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null)

  if (!onIOS) return null

  const copy = iosDisclosureCopy(offer.status === 'loaded' ? offer.offer : null)
  const text = tone === 'brand' ? 'text-blue-100' : 'text-slate-400'
  const strong = tone === 'brand' ? 'text-white' : 'text-slate-300'
  const link = tone === 'brand' ? 'text-white underline' : 'text-blue-400 underline'
  const check = tone === 'brand' ? 'text-blue-100' : 'text-green-500'

  const handleRestore = async () => {
    if (restoring) return
    setRestoring(true)
    setRestoreMsg(null)
    try {
      const { restoreApplePurchases } = await import('@/lib/apple-billing')
      const { entitled } = await restoreApplePurchases()
      setRestoreMsg(
        entitled
          ? 'Purchases restored — your subscription is active.'
          : 'No active subscription was found for this Apple ID. If you recently subscribed, try again in a few minutes.',
      )
    } catch {
      setRestoreMsg("Couldn't reach the App Store to restore purchases. Check your connection and try again.")
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className={`text-left text-xs ${text} space-y-3`}>
      <div>
        <p className={`font-semibold ${strong} mb-1`}>{copy.priceLine}</p>
        <ul className="space-y-1">
          {IOS_SUBSCRIPTION_BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-1.5">
              <svg className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${check}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {copy.trialLine && <p>{copy.trialLine}</p>}
      <p>{copy.billingLine}</p>
      <p>{copy.renewalLine} {copy.cancelLine}</p>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href="/terms" className={link}>Terms of Use</Link>
        <Link href="/privacy" className={link}>Privacy Policy</Link>
        <button
          type="button"
          onClick={handleRestore}
          disabled={restoring}
          className={`${link} disabled:opacity-50`}
        >
          {restoring ? 'Restoring purchases…' : 'Restore Purchases'}
        </button>
      </p>

      {restoreMsg && <p role="status" aria-live="polite">{restoreMsg}</p>}
    </div>
  )
}
