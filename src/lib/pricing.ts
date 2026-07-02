// Centralized pricing configuration for ReplyFlow

import { getAppBaseUrl, getDashboardUrl } from './urls'

export const PRICING_CONFIG = {
  // Plan configuration
  PLAN_NAME: "ReplyFlow",
  MONTHLY_PRICE: "$59",
  TRIAL_DAYS: 14,

  // Stripe configuration
  STRIPE_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,

  // Display text
  PLAN_DISPLAY_NAME: "ReplyFlow",
  PRICE_DISPLAY: "$59/month",
  TRIAL_DISPLAY: "14-day free trial",
  FULL_PRICING_DISPLAY: "14-day free trial, then $59/month",

  // URLs - use dynamic URL resolution for proper environment handling
  CHECKOUT_SUCCESS_URL: `${getAppBaseUrl()}/dashboard?checkout=success`,
  CHECKOUT_CANCEL_URL: `${getAppBaseUrl()}/dashboard?checkout=cancelled`,
  PORTAL_RETURN_URL: getDashboardUrl(),
} as const

// Helper functions for pricing display
export function getPricingDisplay() {
  return PRICING_CONFIG.PRICE_DISPLAY
}

export function getTrialDisplay() {
  return PRICING_CONFIG.TRIAL_DISPLAY
}

export function getFullPricingDisplay() {
  return PRICING_CONFIG.FULL_PRICING_DISPLAY
}

export function getPlanName() {
  return PRICING_CONFIG.PLAN_NAME
}

export function getStripePriceId() {
  return PRICING_CONFIG.STRIPE_PRICE_ID
}
