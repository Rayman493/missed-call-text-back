// Subscription state constants and utilities for ReplyFlow billing

import { PRICING_CONFIG } from './pricing'

export const SUBSCRIPTION_STATES = {
  NO_SUBSCRIPTION: 'no_subscription',
  TRIALING: 'trialing',
  ACTIVE: 'active',
  CANCELED: 'canceled',
  PAST_DUE: 'past_due',
  UNPAID: 'unpaid',
  CANCELING: 'canceling',
  BETA: 'beta',        // Manual beta access for test customers
  COMPED: 'comped'      // Manual complimentary access
} as const

export type SubscriptionState = typeof SUBSCRIPTION_STATES[keyof typeof SUBSCRIPTION_STATES]

export function getSubscriptionStatusText(subscriptionStatus: string | null | undefined): string {
  switch (subscriptionStatus) {
    case SUBSCRIPTION_STATES.TRIALING:
      return 'Trial Active'
    case SUBSCRIPTION_STATES.ACTIVE:
      return 'Active'
    case SUBSCRIPTION_STATES.BETA:
      return 'Beta Access'
    case SUBSCRIPTION_STATES.COMPED:
      return 'Comped Access'
    case SUBSCRIPTION_STATES.PAST_DUE:
      return 'Payment Due'
    case SUBSCRIPTION_STATES.CANCELED:
      return 'Canceled'
    case SUBSCRIPTION_STATES.UNPAID:
      return 'Unpaid'
    case SUBSCRIPTION_STATES.CANCELING:
      return 'Canceling'
    default:
      return 'Inactive'
  }
}

export function isInTrialPeriod(subscriptionStatus: string | null | undefined): boolean {
  return subscriptionStatus === SUBSCRIPTION_STATES.TRIALING
}

export function isActiveSubscription(subscriptionStatus: string | null | undefined): boolean {
  // A subscription is only active if:
  // 1. subscription_status is 'active' or 'trialing' AND
  // 2. This would be checked with stripe_subscription_id in the business context
  // For now, just check the status - the stripe_subscription_id check should be done at the component level
  return subscriptionStatus === SUBSCRIPTION_STATES.ACTIVE || subscriptionStatus === SUBSCRIPTION_STATES.TRIALING
}

export function isScheduledToCancel(cancelAt: string | null | undefined, cancelAtPeriodEnd: boolean | null | undefined): boolean {
  // A subscription is scheduled to cancel if:
  // 1. cancel_at is set (has a cancellation timestamp) OR
  // 2. cancel_at_period_end is true
  return Boolean(cancelAt) || cancelAtPeriodEnd === true
}

export function hasValidSubscription(subscriptionStatus: string | null | undefined, stripeCustomerId?: string | null, stripeSubscriptionId?: string | null): boolean {
  // A business has a valid subscription only if:
  // 1. subscription_status is 'active' or 'trialing' AND
  // 2. stripe_customer_id exists (meaning they've completed checkout) AND
  // 3. stripe_subscription_id exists (meaning they have an active subscription)
  const statusValid = subscriptionStatus === SUBSCRIPTION_STATES.ACTIVE || subscriptionStatus === SUBSCRIPTION_STATES.TRIALING
  const hasCustomerId = !!stripeCustomerId
  const hasSubscriptionId = !!stripeSubscriptionId
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[Subscription] hasValidSubscription check:', {
      subscriptionStatus,
      hasCustomerId,
      hasSubscriptionId,
      result: statusValid && hasCustomerId && hasSubscriptionId
    })
  }

  return statusValid && hasCustomerId && hasSubscriptionId
}

export function hasInvalidTrialState(subscriptionStatus: string | null | undefined, stripeCustomerId?: string | null, stripeSubscriptionId?: string | null): boolean {
  // Returns true if subscription_status is 'trialing' but Stripe IDs are missing (invalid state)
  return subscriptionStatus === SUBSCRIPTION_STATES.TRIALING && (!stripeCustomerId || !stripeSubscriptionId)
}

export function needsUpgrade(subscriptionStatus: string | null | undefined): boolean {
  return !subscriptionStatus || 
         subscriptionStatus === SUBSCRIPTION_STATES.NO_SUBSCRIPTION ||
         subscriptionStatus === SUBSCRIPTION_STATES.CANCELED ||
         subscriptionStatus === SUBSCRIPTION_STATES.PAST_DUE ||
         subscriptionStatus === SUBSCRIPTION_STATES.UNPAID
}

export function getSubscriptionStatusColor(subscriptionStatus: string | null | undefined): string {
  switch (subscriptionStatus) {
    case SUBSCRIPTION_STATES.TRIALING:
      return 'text-blue-600 dark:text-blue-400'
    case SUBSCRIPTION_STATES.ACTIVE:
      return 'text-green-600 dark:text-green-400'
    case SUBSCRIPTION_STATES.PAST_DUE:
    case SUBSCRIPTION_STATES.UNPAID:
      return 'text-red-600 dark:text-red-400'
    case SUBSCRIPTION_STATES.CANCELED:
      return 'text-gray-600 dark:text-gray-400'
    case SUBSCRIPTION_STATES.CANCELING:
      return 'text-yellow-600 dark:text-yellow-400'
    default:
      return 'text-gray-500 dark:text-gray-400'
  }
}

export function getSubscriptionStatusDescription(subscriptionStatus: string | null | undefined, stripeCustomerId?: string | null, stripeSubscriptionId?: string | null): string {
  // Check for invalid trial state first
  if (hasInvalidTrialState(subscriptionStatus, stripeCustomerId, stripeSubscriptionId)) {
    return 'Start your free trial to activate ReplyFlow. No charge today.'
  }
  
  switch (subscriptionStatus) {
    case SUBSCRIPTION_STATES.TRIALING:
      return 'Your 14-day free trial is active. Billing starts at $49/month after trial unless canceled.'
    case SUBSCRIPTION_STATES.ACTIVE:
      return 'Your ReplyFlow subscription is active at $49/month.'
    case SUBSCRIPTION_STATES.BETA:
      return 'This account has complimentary beta access.'
    case SUBSCRIPTION_STATES.COMPED:
      return 'This account has complimentary access.'
    case SUBSCRIPTION_STATES.PAST_DUE:
      return 'Payment required - update your billing information'
    case SUBSCRIPTION_STATES.CANCELED:
      return 'Subscription inactive. Start or resume your free trial to activate ReplyFlow.'
    case SUBSCRIPTION_STATES.UNPAID:
      return 'Payment required - update your billing information'
    case SUBSCRIPTION_STATES.CANCELING:
      return 'Your subscription is being canceled'
    default:
      return 'Start your 14-day free trial to activate ReplyFlow. No charge today.'
  }
}

export function getSubscriptionActionButton(subscriptionStatus: string | null | undefined, stripeCustomerId?: string | null, stripeSubscriptionId?: string | null): { text: string; href: string } {
  // Check for invalid trial state first
  if (hasInvalidTrialState(subscriptionStatus, stripeCustomerId, stripeSubscriptionId)) {
    return { text: 'Start 14-Day Free Trial', href: '/dashboard' }
  }
  
  switch (subscriptionStatus) {
    case SUBSCRIPTION_STATES.TRIALING:
    case SUBSCRIPTION_STATES.ACTIVE:
      return { text: 'Manage Billing', href: '/dashboard/settings' }
    case SUBSCRIPTION_STATES.BETA:
    case SUBSCRIPTION_STATES.COMPED:
      // BETA/COMPED: No billing button needed - these users don't use Stripe
      return { text: 'Billing Not Required', href: '/dashboard/settings' }
    case SUBSCRIPTION_STATES.PAST_DUE:
    case SUBSCRIPTION_STATES.UNPAID:
      return { text: 'Update Payment', href: '/dashboard/settings' }
    case SUBSCRIPTION_STATES.CANCELED:
      return { text: 'Start Free Trial', href: '/dashboard' }
    default:
      return { text: 'Start 14-Day Free Trial', href: '/dashboard' }
  }
}

export function getSubscriptionTrustNote(subscriptionStatus: string | null | undefined, stripeCustomerId?: string | null, stripeSubscriptionId?: string | null): string | null {
  // Show trust note for users who haven't completed checkout
  if (!hasValidSubscription(subscriptionStatus, stripeCustomerId, stripeSubscriptionId)) {
    return 'No charge today. Cancel anytime before your trial ends.'
  }
  return null
}

export function getPricingDisplay(): string {
  return PRICING_CONFIG.PRICE_DISPLAY
}

export function getTrialDisplay(): string {
  return PRICING_CONFIG.TRIAL_DISPLAY
}
