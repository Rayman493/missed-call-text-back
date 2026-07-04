/**
 * Out of Office Mode Helper Functions
 * 
 * Functions for checking and managing Out of Office Mode status
 */

import { Business } from './types'

/**
 * Get the canonical default Out of Office message template
 * 
 * @returns The default template with placeholders
 */
export function getDefaultOutOfOfficeTemplate(): string {
  return "Thanks for contacting {{business_name}}. We are currently out of office and responses may be delayed. We'll be back on {{return_date}}. Please provide details about what you need and we will get back to you as soon as possible."
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
export function isBusinessOutOfOffice(business: Business | null | undefined): boolean {
  if (!business) return false
  
  // Check if Out of Office Mode is enabled
  if (!business.out_of_office_enabled) return false
  
  // Check if start and end dates are set
  if (!business.out_of_office_start || !business.out_of_office_end) return false
  
  const now = new Date()
  const start = new Date(business.out_of_office_start)
  const end = new Date(business.out_of_office_end)
  
  // Check if current time is within the active range
  return now >= start && now <= end
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
 * @param business - The business object
 * @returns Status object with status type and relevant dates
 */
export function getOutOfOfficeStatus(business: Business | null | undefined): {
  status: 'inactive' | 'scheduled' | 'active' | 'expired'
  startDate?: Date
  endDate?: Date
  daysRemaining?: number
} {
  if (!business || !business.out_of_office_enabled) {
    return { status: 'inactive' }
  }

  const now = new Date()
  const start = business.out_of_office_start ? new Date(business.out_of_office_start) : null
  const end = business.out_of_office_end ? new Date(business.out_of_office_end) : null

  if (!start || !end) {
    return { status: 'inactive' }
  }

  if (now < start) {
    return {
      status: 'scheduled',
      startDate: start,
      endDate: end
    }
  }

  if (now > end) {
    return {
      status: 'expired',
      startDate: start,
      endDate: end
    }
  }

  // Currently active
  const daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  return {
    status: 'active',
    startDate: start,
    endDate: end,
    daysRemaining
  }
}

/**
 * Get the Out of Office notice for SMS messages
 * Returns a formatted notice to append to customer-facing SMS messages
 *
 * @param business - The business object (can be partial)
 * @returns The formatted out of office notice, or null if not active
 */
export function getOutOfOfficeNotice(business: Business | null | undefined | { name?: string; out_of_office_enabled?: boolean; out_of_office_start?: string; out_of_office_end?: string; out_of_office_message?: string }): string | null {
  if (!business) return null

  // Check if Out of Office Mode is enabled
  if (!business.out_of_office_enabled) return null

  // Check if start and end dates are set
  if (!business.out_of_office_start || !business.out_of_office_end) return null

  const now = new Date()
  const start = new Date(business.out_of_office_start)
  const end = new Date(business.out_of_office_end)

  // Check if current time is within the active range
  if (now < start || now > end) return null

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
