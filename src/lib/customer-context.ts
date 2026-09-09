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
 *   - Manual corrections and AI intake are compared by recency, not by a
 *     static "manual always wins" or "AI always wins" rule.
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

function parseTimestamp(value: unknown): number | null {
  if (!value || typeof value !== 'string') return null
  const ms = new Date(value).getTime()
  return isNaN(ms) ? null : ms
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

interface NameSource {
  value: string
  timestamp: number | null
}

function getManualCustomerNameSource(lead: any): NameSource | null {
  const raw = lead?.raw_metadata || {}
  const corrected = raw.corrected_fields || {}
  const correctedTimestamps = raw.corrected_fields_updated_at || {}

  const value = firstClean(
    lead?.contact_name,
    lead?.name,
    corrected.name,
    corrected.callerName,
    corrected.customerName,
    corrected.caller_name,
    corrected.customer_name
  )
  if (!value) return null

  const timestamp =
    parseTimestamp(correctedTimestamps.callerName) ??
    parseTimestamp(correctedTimestamps.name) ??
    parseTimestamp(correctedTimestamps.customerName) ??
    parseTimestamp(raw.last_correction_at) ??
    null

  return { value, timestamp }
}

function isNameRefusalLike(value: string): boolean {
  const lower = value.toLowerCase()
  return /\b(?:rather not|prefer not to|don't want to|do not want to|won't|will not|can't|cannot|stay anonymous|remain anonymous|keep this anonymous)\b/.test(lower) &&
    /\b(?:my name|give|say|tell|address)\b/.test(lower)
}

function getAICustomerNameSource(lead: any): NameSource | null {
  const raw = lead?.raw_metadata || {}
  const candidates: NameSource[] = []

  const records = [...(lead?.aiCallRecords || lead?.ai_call_records || [])]
    .filter((r: any) => r && (r.created_at || r.completed_at))
    .sort((a: any, b: any) => {
      const aTime = parseTimestamp(a?.completed_at || a?.created_at) || 0
      const bTime = parseTimestamp(b?.completed_at || b?.created_at) || 0
      return bTime - aTime
    })

  if (records.length > 0) {
    for (const record of records) {
      const extracted = record.extracted_info || {}
      // A name-refused intake must not contribute a customer name candidate.
      if (extracted.nameRefused === true) continue
      const value = firstClean(
        extracted.callerName,
        extracted.customerName,
        extracted.caller_name,
        extracted.customer_name,
        extracted.name
      )
      if (value && !isNameRefusalLike(value)) {
        candidates.push({
          value,
          timestamp: parseTimestamp(record.completed_at || record.created_at)
        })
      }
    }
  }

  const extracted = raw.extracted_info || {}
  // A name-refused lead metadata must not contribute a customer name candidate.
  if (extracted.nameRefused !== true) {
    const fallbackValue = firstClean(
      extracted.callerName,
      extracted.customerName,
      extracted.caller_name,
      extracted.customer_name,
      extracted.name
    )
    if (fallbackValue && !isNameRefusalLike(fallbackValue)) {
      const fallbackTimestamp =
        parseTimestamp(raw.voicemail_extraction?.extractedAt) ??
        parseTimestamp(raw.sms_extraction?.extractedAt) ??
        parseTimestamp(raw.extractedAt) ??
        null
      candidates.push({ value: fallbackValue, timestamp: fallbackTimestamp })
    }
  }

  if (candidates.length === 0) return null

  // Prefer the candidate with the newest authoritative timestamp.
  // If no timestamps are available, use the most recent ai_call_record
  // (already sorted first) for deterministic behavior.
  const sorted = candidates.sort((a, b) => {
    if (a.timestamp != null && b.timestamp != null) return b.timestamp - a.timestamp
    if (a.timestamp != null) return -1
    if (b.timestamp != null) return 1
    return 0
  })
  return sorted[0]
}

function resolveCurrentCustomerName(lead: any): string {
  const manual = getManualCustomerNameSource(lead)
  const ai = getAICustomerNameSource(lead)

  if (manual && ai) {
    if (manual.timestamp != null && ai.timestamp != null) {
      return manual.timestamp >= ai.timestamp ? manual.value : ai.value
    }
    if (manual.timestamp != null) return manual.value
    if (ai.timestamp != null) return ai.value
    // Both lack authoritative timestamps. Prefer the AI-captured value because
    // a manual correction made without a timestamp cannot be proven newer.
    return ai.value
  }

  if (manual) return manual.value
  if (ai) return ai.value
  return ''
}

export function getCurrentCustomerContext(lead: any): CustomerContext {
  const intake = getLeadAIIntake(lead || {})
  const raw = lead?.raw_metadata || {}
  const extracted = raw.extracted_info || {}
  const corrected = raw.corrected_fields || {}

  return {
    customerName: resolveCurrentCustomerName(lead),
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
