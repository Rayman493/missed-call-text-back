/**
 * SMS Templates and Helpers
 *
 * Centralized location for SMS message templates to ensure consistency
 * across onboarding, Settings, demo routes, and test routes.
 */

/**
 * Get the default auto-reply message for a business
 * @param businessName - The business name to interpolate
 * @returns The formatted auto-reply message with opt-out
 */
export function getDefaultAutoReplyMessage(businessName: string): string {
  return `Hi, this is ${businessName}. Sorry we missed your call—how can we help? Reply STOP to opt out.`
}

/**
 * Get the default auto-reply message with a fallback business name
 * @param businessName - The business name (optional)
 * @returns The formatted auto-reply message with opt-out
 */
export function getDefaultAutoReplyMessageWithFallback(businessName?: string): string {
  return getDefaultAutoReplyMessage(businessName || 'Your Business')
}