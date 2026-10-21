/**
 * iOS subscription disclosure copy — App Review 3.1.2(c).
 *
 * Pure model builder: every string derives from the real StoreKit
 * AppleSubscriptionOffer (localized displayPrice, intro-offer eligibility),
 * never from hardcoded claims. Loading/failed offer states return neutral
 * copy that makes no price or trial claim it cannot back.
 */

import { appleIntroTrialEligible, type AppleSubscriptionOffer } from './apple-billing'

export const IOS_PLAN_NAME = 'ReplyFlow Monthly'

/**
 * What the monthly subscription includes — verified product capabilities
 * only (matches the public pricing page; no invented benefits).
 */
export const IOS_SUBSCRIPTION_BENEFITS: readonly string[] = [
  'Automatic missed-call answering and instant text-back',
  'Customer intake, history, and management',
  'Scheduling, jobs, quotes, and invoices',
  'Card payments and payouts',
]

export interface IosDisclosureCopy {
  planName: string
  /** Plan + localized price, or neutral wording when the offer is unavailable. */
  priceLine: string
  /** Trial claim — present ONLY when the real offer confirms eligibility. */
  trialLine: string | null
  /** When billing begins (after trial vs immediately). */
  billingLine: string
  /** Auto-renewal + charge-to-Apple-ID disclosure. */
  renewalLine: string
  /** How to cancel. */
  cancelLine: string
}

export function iosDisclosureCopy(
  offer: AppleSubscriptionOffer | null | undefined,
): IosDisclosureCopy {
  const eligible = appleIntroTrialEligible(offer)
  const price = offer?.displayPrice ?? null
  const trialPeriod = eligible ? offer?.introOffer?.period ?? null : null

  const priceLine = price
    ? `${IOS_PLAN_NAME} — ${price}/month`
    : `${IOS_PLAN_NAME} — monthly subscription billed through the App Store`

  const trialLine = trialPeriod
    ? `${trialPeriod} free — you won't be charged until the trial ends.`
    : null

  const billingLine = trialPeriod
    ? `After the trial, billing begins automatically at ${price ?? 'the shown price'}/month unless you cancel at least 24 hours before the trial ends.`
    : price
      ? 'Your subscription begins immediately after purchase.'
      : 'Your subscription begins immediately after purchase.'

  const renewalLine = price
    ? `Renews automatically each month at ${price} until canceled. Payment is charged to your Apple ID.`
    : 'Renews automatically each month until canceled. Payment is charged to your Apple ID.'

  const cancelLine =
    'Cancel anytime in your Apple ID subscription settings (Settings › your name › Subscriptions).'

  return { planName: IOS_PLAN_NAME, priceLine, trialLine, billingLine, renewalLine, cancelLine }
}
