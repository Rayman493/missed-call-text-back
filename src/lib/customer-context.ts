import { getLeadAIIntake } from './ai-field-mapping'
import { isPlaceholderValue } from '@/components/payments/customer-search-helpers'
import { formatForDisplay } from '@/utils/phone-formatting'

/**
 * Canonical current customer context for ReplyFlow Customer Detail surfaces.
 *
 * This resolver is the single source of truth for the CURRENT customer/intake
 * truth shown in:
 *   - Customer header
 *   - Customer Context
 *   - Edit Customer
 *   - Current customer selectors/dropdowns
 *   - Create Job / New Reminder / Schedule Appointment / Request Payment
 *
 * Rules:
 *   - Manual/current lead values beat stale historical AI intake.
 *   - Placeholder/"Not collected" values are normalized to empty strings.
 *   - Historical ai_call_records are NOT consulted here.
 */

function clean(value: unknown): string {
  if (value == null) return ''
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (isPlaceholderValue(trimmed)) return ''
  return trimmed
}

function firstClean(...values: unknown[]): string {
  for (const v of values) {
    const c = clean(v)
    if (c) return c
  }
  return ''
}

export interface CustomerContext {
  customerName: string
  reasonForCalling: string
  details: string
  location: string
  desiredCompletionTime: string
  preferredCallbackTime: string
  phoneNumber: string
  email: string
}

export function getCurrentCustomerContext(lead: any): CustomerContext {
  const intake = getLeadAIIntake(lead || {})
  const raw = lead?.raw_metadata || {}
  const extracted = raw.extracted_info || {}
  const corrected = raw.corrected_fields || {}

  return {
    customerName: firstClean(
      lead?.name,
      lead?.contact_name,
      corrected.name,
      corrected.callerName,
      corrected.customerName,
      corrected.caller_name,
      corrected.customer_name,
      intake.customerName
    ),
    reasonForCalling: clean(intake.serviceRequested),
    details: clean(intake.additionalDetails),
    location: clean(intake.serviceAddress),
    desiredCompletionTime: clean(intake.desiredCompletion),
    preferredCallbackTime: clean(intake.callbackTime),
    phoneNumber: (lead?.caller_phone || intake.customerPhone || '').trim(),
    email: firstClean(corrected.email, extracted.email, lead?.email)
  }
}

/**
 * Canonical display name for the CURRENT customer.
 * Falls back to a formatted phone number only when no meaningful name exists.
 */
export function getCanonicalCustomerDisplayName(lead: any): string {
  const context = getCurrentCustomerContext(lead)
  if (context.customerName) return context.customerName
  const formatted = formatForDisplay(context.phoneNumber)
  if (formatted) return formatted
  return ''
}

/**
 * Historical snapshot context for a single ai_call_record (Previous Job Request).
 * Isolates the record from the current lead identity so the captured-at-call
 * values remain immutable and are not overwritten by later edits.
 */
export function getHistoricalJobRequestContext(record: any): CustomerContext {
  return getCurrentCustomerContext({
    aiCallRecords: [record],
    raw_metadata: {},
    name: null,
    contact_name: null,
    caller_phone: record?.caller_phone || null
  })
}
