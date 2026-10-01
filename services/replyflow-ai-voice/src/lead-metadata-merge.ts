/**
 * AI Intake → lead.raw_metadata merge
 *
 * The latest completed AI Intake call is authoritative for the AI-owned intake
 * fields mirrored onto leads.raw_metadata (top level and raw_metadata.extracted_info).
 * This merge replaces ONLY those fields with the current call's canonical values:
 *
 * - A non-empty current-call value overwrites the prior value AND any stale
 *   legacy alias of the same field already present in the target object
 *   (prevents old alias keys like `reasonForCalling` from shadowing the fresh
 *   canonical `serviceRequested` during alias-normalized reads).
 * - An empty/undefined current-call value never erases a prior value, so a
 *   partial call cannot wipe fields captured by an earlier call.
 * - Refusal flags and mode markers are written as emitted by the canonical
 *   builder (they describe the latest call).
 * - All unrelated metadata (corrected_fields, attribution, billing,
 *   attachments, voicemail/sms extraction, etc.) is preserved untouched.
 */

type AnyRecord = Record<string, any>

function isPlainObject(value: unknown): value is AnyRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasUsableValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string' && value.trim() === '') return false
  return true
}

/**
 * Canonical value extractor + the full alias key set each field owns.
 * Alias keys mirror the web app's FIELD_ALIASES table (src/lib/ai-field-mapping.ts)
 * so no stale alias can survive next to a fresh canonical value.
 */
const AI_FIELD_GROUPS: Array<{ pick: (info: AnyRecord) => any; keys: string[] }> = [
  {
    pick: i => i.customerName,
    keys: ['customerName', 'callerName', 'name', 'caller_name', 'customer_name', 'caller name'],
  },
  {
    pick: i => i.serviceRequested,
    keys: ['serviceRequested', 'reasonForCalling', 'request', 'reason', 'service_requested', 'reason_for_call', 'reason for calling'],
  },
  {
    pick: i => (hasUsableValue(i.importantDetails) ? i.importantDetails : i.additionalDetails),
    keys: ['importantDetails', 'additionalDetails', 'issueDescription', 'details', 'additional_details', 'issue_description', 'important details'],
  },
  {
    pick: i => i.serviceAddress,
    keys: ['serviceAddress', 'addressOrLocation', 'address', 'location', 'service_address', 'address or location', 'location/address'],
  },
  {
    pick: i => (hasUsableValue(i.desiredCompletionTime) ? i.desiredCompletionTime : i.desiredCompletion),
    keys: ['desiredCompletionTime', 'desiredCompletion', 'urgency', 'urgencyLevel', 'desired_completion', 'urgency level', 'desired completion time'],
  },
  {
    pick: i => i.callbackTime,
    keys: ['callbackTime', 'preferredCallbackTime', 'callback_time', 'preferred callback time'],
  },
  {
    pick: i => i.customerPhone,
    keys: ['customerPhone'],
  },
]

const AI_FLAG_GROUPS: Array<{ pick: (info: AnyRecord) => any; keys: string[] }> = [
  { pick: i => i.nameRefused, keys: ['nameRefused', 'name_refused'] },
  { pick: i => i.locationRefused, keys: ['locationRefused', 'location_refused'] },
  { pick: i => i.serviceLocationType, keys: ['serviceLocationType', 'service_location_type'] },
  { pick: i => i.intakeMode, keys: ['intakeMode', 'intake_mode'] },
]

function mergeGroupInto(target: AnyRecord, pick: (info: AnyRecord) => any, keys: string[], info: AnyRecord, flags: boolean) {
  const value = pick(info)
  if (!flags && !hasUsableValue(value)) return
  if (flags && value === undefined) return
  for (const key of keys) {
    // Canonical keys are always written when the call captured a value.
    // Legacy alias keys are only overwritten when they already exist — a stale
    // alias is corrected in place, but no new alias surface is invented.
    const isCanonicalKey = key === keys[0]
    if (isCanonicalKey || Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = value
    }
  }
}

function mergeIntoObject(target: AnyRecord, info: AnyRecord): AnyRecord {
  const merged: AnyRecord = { ...target }
  for (const group of AI_FIELD_GROUPS) {
    mergeGroupInto(merged, group.pick, group.keys, info, false)
  }
  for (const group of AI_FLAG_GROUPS) {
    mergeGroupInto(merged, group.pick, group.keys, info, true)
  }
  return merged
}

/**
 * Merge the current call's canonical extracted info into existing
 * leads.raw_metadata. Returns a NEW object; never mutates inputs.
 */
export function mergeAiIntakeIntoRawMetadata(existingRawMetadata: any, canonicalInfo: any): AnyRecord {
  const existing = isPlainObject(existingRawMetadata) ? existingRawMetadata : {}
  const info = isPlainObject(canonicalInfo) ? canonicalInfo : {}

  const merged = mergeIntoObject(existing, info)

  const existingExtracted = isPlainObject(existing.extracted_info) ? existing.extracted_info : {}
  merged.extracted_info = mergeIntoObject(existingExtracted, info)

  return merged
}
