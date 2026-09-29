/**
 * Post-deletion billing message builder.
 *
 * Pure helper that turns the pre-deletion billing classification
 * (getDeletionSubscriptionNotice) plus the Stripe cancellation outcome into
 * the provider-specific billing copy for the account-deletion confirmation
 * email. It is computed BEFORE destructive deletion so the email never has to
 * guess billing state from data that no longer exists.
 *
 * Provider rules mirror the Settings Delete Account warning:
 * - 'stripe'      → subscription was canceled server-side; may include a
 *                   durable Stripe-hosted portal login link when available.
 * - 'google_play' → deletion does NOT cancel Google Play; always includes the
 *                   Play subscription-management destination; never a
 *                   Stripe link.
 * - 'unknown'     → ambiguous provider; never promise cancellation; no
 *                   provider-specific link without reliable evidence.
 * - 'none'        → no billing copy.
 */

import type { DeletionSubscriptionNotice } from './subscription-utils'

export interface DeletionBillingMessage {
  /** Truthful billing sentence(s) for the confirmation email. */
  text: string
  /** Optional provider-hosted management destination (durable link only). */
  actionUrl?: string
  actionLabel?: string
}

export interface DeletionBillingContext {
  notice: DeletionSubscriptionNotice
  /** True only when a Stripe subscription cancellation was attempted and confirmed. */
  stripeCancellationSucceeded?: boolean
  /**
   * Durable Stripe-hosted management link (portal configuration login_page.url
   * — the shareable hosted login page). Portal *session* URLs are short-lived
   * and single-use, so they must never be used here.
   */
  stripeManageUrl?: string | null
}

const GOOGLE_PLAY_PACKAGE_NAME = 'com.replyflowhq.app'

/**
 * Google Play subscription-management destination. Mirrors
 * getPlaySubscriptionManageUrl() in google-play-billing.ts, which cannot be
 * imported server-side (it registers the Capacitor billing plugin).
 */
export function getDeletionPlayManageUrl(): string {
  const productId = process.env.NEXT_PUBLIC_GOOGLE_PLAY_PRODUCT_ID || 'replyflow_monthly'
  return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}`
}

export function getDeletionBillingMessage(ctx: DeletionBillingContext): DeletionBillingMessage | null {
  switch (ctx.notice) {
    case 'stripe': {
      if (ctx.stripeCancellationSucceeded) {
        const base = 'Your ReplyFlow subscription was canceled automatically, so no further subscription charges will be billed.'
        return {
          text: ctx.stripeManageUrl
            ? base
            : `${base} To review your Stripe billing history, check your Stripe receipt emails or contact support@replyflowhq.com.`,
          actionUrl: ctx.stripeManageUrl || undefined,
          actionLabel: 'Review your billing with Stripe',
        }
      }
      return {
        text: 'Your ReplyFlow account has been deleted, but we could not confirm that your subscription was canceled. To avoid future charges, verify and cancel it directly through Stripe.',
        actionUrl: ctx.stripeManageUrl || undefined,
        actionLabel: 'Manage billing with Stripe',
      }
    }
    case 'google_play':
      return {
        text: 'Deleting your ReplyFlow account does not automatically cancel your Google Play subscription. To avoid future charges, manage or cancel it through Google Play.',
        actionUrl: getDeletionPlayManageUrl(),
        actionLabel: 'Manage subscription in Google Play',
      }
    case 'unknown':
      return {
        text: 'If you still have an active subscription through Stripe, Google Play, or another billing provider, verify and cancel it directly with that provider to avoid future charges.',
      }
    case 'none':
    default:
      return null
  }
}
