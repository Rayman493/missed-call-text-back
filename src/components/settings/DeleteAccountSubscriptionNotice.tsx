'use client'

import { CreditCard } from 'lucide-react'
import { getDeletionSubscriptionNotice } from '@/lib/subscription-utils'
import type { Business } from '@/lib/types'

export interface DeleteAccountSubscriptionNoticeProps {
  business: Business | null
  onManageBilling: () => void
}

/**
 * Delete Account modal subscription warning.
 *
 * Renders truthful copy based on the current billing provider evidence:
 * - Google Play → warn that deletion does NOT cancel the Play subscription.
 * - Stripe with a concrete subscription id → confirm automatic cancellation.
 * - Unknown/ambiguous → never promise cancellation.
 * - No active subscription → no cancellation warning.
 */
export default function DeleteAccountSubscriptionNotice({
  business,
  onManageBilling,
}: DeleteAccountSubscriptionNoticeProps) {
  const notice = getDeletionSubscriptionNotice(business)

  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-5 h-5 bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center mt-0.5">
        <CreditCard className="w-3 h-3 text-slate-600 dark:text-slate-400" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-foreground">
          Subscription
        </p>
        {notice === 'none' && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            You don't have an active subscription to cancel.
          </p>
        )}
        {notice === 'google_play' && (
          <div className="mt-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Deleting your ReplyFlow account will not automatically cancel your Google Play subscription.
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
              To avoid future charges, cancel it separately through Google Play before deleting your account. Uninstalling the app does not cancel it.
            </p>
            <button
              type="button"
              onClick={onManageBilling}
              className="mt-2 text-sm font-medium text-amber-900 dark:text-amber-100 underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
            >
              Manage subscription in Google Play
            </button>
          </div>
        )}
        {notice === 'stripe' && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your active ReplyFlow subscription will be canceled automatically.
          </p>
        )}
        {notice === 'unknown' && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            If your subscription is managed through an app store or another billing provider, deleting your ReplyFlow account may not cancel it. Cancel any active subscription separately before deleting your account.
          </p>
        )}
      </div>
    </div>
  )
}
