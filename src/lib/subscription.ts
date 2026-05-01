// Subscription state constants and utilities for ReplyFlow billing

import { PRICING_CONFIG } from './pricing'

export const SUBSCRIPTION_STATES = {
  NO_SUBSCRIPTION: 'no_subscription',
  TRIALING: 'trialing',
  ACTIVE: 'active',
  CANCELED: 'canceled',
  PAST_DUE: 'past_due',
  UNPAID: 'unpaid',
  CANCELING: 'canceling'
} as const

export type SubscriptionState = typeof SUBSCRIPTION_STATES[keyof typeof SUBSCRIPTION_STATES]

export function getSubscriptionStatusText(subscriptionStatus: string | null | undefined): string {
  switch (subscriptionStatus) {
    case SUBSCRIPTION_STATES.TRIALING:
      return 'Trialing'
    case SUBSCRIPTION_STATES.ACTIVE:
      return 'Active'
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
  return subscriptionStatus === SUBSCRIPTION_STATES.ACTIVE || subscriptionStatus === SUBSCRIPTION_STATES.TRIALING
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

export function getPricingDisplay(): string {
  return PRICING_CONFIG.PRICE_DISPLAY
}

export function getTrialDisplay(): string {
  return PRICING_CONFIG.TRIAL_DISPLAY
}
