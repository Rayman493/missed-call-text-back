// Centralized pricing configuration for ReplyFlow

export const PRICING_CONFIG = {
  // Plan configuration
  PLAN_NAME: "ReplyFlow",
  MONTHLY_PRICE: "$49",
  TRIAL_DAYS: 14,
  
  // Stripe configuration
  STRIPE_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID || "price_1TRgO3M0bWUzmEVNCde4Rvr",
  
  // Display text
  PLAN_DISPLAY_NAME: "ReplyFlow",
  PRICE_DISPLAY: "$49/month",
  TRIAL_DISPLAY: "14-day free trial",
  FULL_PRICING_DISPLAY: "14-day free trial, then $49/month",
  
  // URLs
  CHECKOUT_SUCCESS_URL: "https://replyflowhq.com/dashboard?checkout=success",
  CHECKOUT_CANCEL_URL: "https://replyflowhq.com/dashboard?checkout=cancelled",
  PORTAL_RETURN_URL: "https://replyflowhq.com/dashboard",
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
