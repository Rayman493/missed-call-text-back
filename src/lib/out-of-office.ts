/**
 * Out of Office Mode Helper Functions
 *
 * Functions for checking and managing Out of Office Mode status
 */

import { toZonedTime } from 'date-fns-tz/toZonedTime'
import { Business } from './types'

/**
 * Canonical default Business Hours timezone
 */
export const DEFAULT_BUSINESS_HOURS_TIMEZONE = 'America/New_York'

/**
 * Canonical default Business Hours start time (24-hour format)
 */
export const DEFAULT_BUSINESS_HOURS_START = '09:00'

/**
 * Canonical default Business Hours end time (24-hour format)
 */
export const DEFAULT_BUSINESS_HOURS_END = '18:00'

/**
 * Get a Business Hours field value with canonical default
 * Treats null, undefined, and empty string as missing
 *
 * @param value - The current value (may be null, undefined, or empty string)
 * @param defaultValue - The canonical default value
 * @returns The value if present, otherwise the default
 */
export function getBusinessHoursFieldWithDefault<T extends string>(value: T | null | undefined | '', defaultValue: T): T {
  if (value === null || value === undefined || value === '') {
    return defaultValue
  }
  return value
}

/**
 * Get the canonical default Out of Office message template
 *
 * @returns The default template with placeholders
 */
export function getDefaultOutOfOfficeTemplate(): string {
  return "Thanks for contacting {{business_name}}. We are currently out of office and responses may be delayed. We'll be back on {{return_date}}. Please provide details about what you need and we will get back to you as soon as possible."
}

/**
 * Get the canonical default After Hours message template
 * 
 * @returns The default template with placeholders
 */
export function getDefaultAfterHoursTemplate(): string {
  return "Thanks for reaching out to {{business_name}}. We're currently outside our normal business hours, but we've received your message and will get back to you as soon as possible."
}

/**
 * Format the return date in a friendly format
 * 
 * @param date - The return date
 * @returns Formatted date string (e.g., "July 15" or "July 15, 2026")
 */
export function formatReturnDate(date: Date): string {
  const currentYear = new Date().getFullYear()
  const returnYear = date.getFullYear()
  
  if (returnYear === currentYear) {
    // Same year: "July 15"
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  } else {
    // Different year: "July 15, 2026"
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
}

/**
 * Check if a business is currently in Out of Office Mode
 * Returns true when:
 * - out_of_office_enabled = true
 * - current timestamp >= start date
 * - current timestamp <= end date
 * 
 * @param business - The business object to check
 * @returns true if business is currently out of office, false otherwise
 */
export function isBusinessOutOfOffice(
  business: Business | null | undefined | { name?: string; business_hours_timezone?: string | null; out_of_office_enabled?: boolean | null; out_of_office_start?: string | null; out_of_office_end?: string | null }
): boolean {
  return getOutOfOfficeState(business) === 'active'
}

/**
 * Get the Out of Office message for a business
 * Replaces {{business_name}} and {{return_date}} placeholders with actual values
 * 
 * @param business - The business object
 * @returns The formatted out of office message, or null if not active
 */
export function getOutOfOfficeMessage(business: Business | null | undefined): string | null {
  if (!business || !isBusinessOutOfOffice(business)) return null
  
  const returnDate = formatReturnDate(new Date(business.out_of_office_end!))
  const defaultMessage = getDefaultOutOfOfficeTemplate()
  
  let message = business.out_of_office_message || defaultMessage
  
  // Replace placeholders
  message = message.replace(/\{\{business_name\}\}/gi, business.name)
  message = message.replace(/\{\{return_date\}\}/gi, returnDate)
  
  return message
}

/**
 * Get Out of Office status information for display
 *
 * Derives status from the canonical getOutOfOfficeState so the UI, dashboard
 * banner, and runtime logic share the same timezone-aware decision.
 *
 * @param business - The business object
 * @returns Status object with status type and relevant dates
 */
export function getOutOfOfficeStatus(business: Business | null | undefined): {
  status: 'inactive' | 'scheduled' | 'active' | 'expired'
  startDate?: Date
  endDate?: Date
  daysRemaining?: number
} {
  const state = getOutOfOfficeState(business)

  const startDate = business?.out_of_office_start ? new Date(business.out_of_office_start) : undefined
  const endDate = business?.out_of_office_end ? new Date(business.out_of_office_end) : undefined

  if (state === 'scheduled') {
    return { status: 'scheduled', startDate, endDate }
  }

  if (state === 'active') {
    const now = new Date()
    const daysRemaining = endDate
      ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : undefined
    return { status: 'active', startDate, endDate, daysRemaining }
  }

  if (state === 'ended') {
    return { status: 'expired', startDate, endDate }
  }

  return { status: 'inactive', startDate, endDate }
}

/**
 * Canonical Out of Office state.
 *
 * Returns one of four states:
 * - 'off': disabled, missing dates, invalid dates, or inverted window
 * - 'scheduled': enabled and start is in the future
 * - 'active': enabled and now is within the half-open window [start, end)
 * - 'ended': enabled but the window has passed (now >= end)
 *
 * Boundaries are evaluated in the business timezone. The end boundary is
 * half-open so that an exact end time means the OOO period has ended.
 */
export function getOutOfOfficeState(
  business: Business | null | undefined | { name?: string; business_hours_timezone?: string | null; out_of_office_enabled?: boolean | null; out_of_office_start?: string | null; out_of_office_end?: string | null }
): 'off' | 'scheduled' | 'active' | 'ended' {
  if (!business || !business.out_of_office_enabled) {
    return 'off'
  }

  if (!business.out_of_office_start || !business.out_of_office_end) {
    return 'off'
  }

  const timezone = business.business_hours_timezone || DEFAULT_BUSINESS_HOURS_TIMEZONE

  const startDate = new Date(business.out_of_office_start)
  const endDate = new Date(business.out_of_office_end)

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return 'off'
  }

  // Inverted or zero-length windows are invalid
  if (endDate.getTime() <= startDate.getTime()) {
    return 'off'
  }

  const nowZoned = toZonedTime(new Date(), timezone)
  const startZoned = toZonedTime(startDate, timezone)
  const endZoned = toZonedTime(endDate, timezone)

  if (nowZoned < startZoned) {
    return 'scheduled'
  }

  if (nowZoned >= endZoned) {
    return 'ended'
  }

  return 'active'
}

/**
 * Get the Out of Office notice for SMS messages
 * Returns a formatted notice to append to customer-facing SMS messages
 *
 * @param business - The business object (can be partial)
 * @returns The formatted out of office notice, or null if not active
 */
export function getOutOfOfficeNotice(business: Business | null | undefined | { name?: string; business_hours_timezone?: string | null; out_of_office_enabled?: boolean; out_of_office_start?: string; out_of_office_end?: string; out_of_office_message?: string }): string | null {
  // Reuse the canonical active check so expired windows (including exact end) never reply
  if (!business || !isBusinessOutOfOffice(business)) return null

  const end = new Date(business.out_of_office_end!)
  const businessName = business.name || 'the business'
  const returnDate = formatReturnDate(end)

  // Use the canonical template
  const defaultMessage = getDefaultOutOfOfficeTemplate()
  let message = business.out_of_office_message || defaultMessage

  // Replace placeholders
  message = message.replace(/\{\{business_name\}\}/gi, businessName)
  message = message.replace(/\{\{return_date\}\}/gi, returnDate)

  // Add SMS-specific formatting
  const notice = `\n\nOut of Office Notice:\n${message}`

  return notice
}
