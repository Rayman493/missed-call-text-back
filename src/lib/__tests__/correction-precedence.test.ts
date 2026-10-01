import { describe, it, expect } from 'vitest'
import { getCurrentCustomerContext } from '../customer-context'
import { getLeadAIIntake } from '../ai-field-mapping'

/**
 * Regression coverage for the stale corrected_fields precedence defect:
 * a manual correction only outranks an AI Intake field when its correction
 * timestamp is NEWER than the authoritative (newest usable completed)
 * ai_call_record. Older corrections must not shadow newer calls forever.
 */

const NEW_CALL_TS = '2026-10-01T05:01:31.135136+00'
const OLD_CALL_TS = '2026-09-10T04:29:00.000000+00'

const NEW_CALL_INFO = {
  customerName: 'Jack Johnson',
  serviceRequested:
    "I have a new toilet that I bought from Lowe's, but I don't know how to install it, and I need you to help me",
  serviceAddress: '172 space bar drive',
  desiredCompletionTime: 'In the next couple days',
  callbackTime: 'In the afternoons',
}

const OLD_CALL_INFO = {
  customerName: 'Ryan',
  serviceRequested: 'tree removal',
  serviceAddress: '1632 South Pine Drive',
  desiredCompletionTime: 'this week',
  callbackTime: 'ASAP',
}

// Production corrected_fields shape — every alias key carries the old value,
// timestamps keyed by canonical field names only.
const PRODUCTION_CORRECTED = {
  email: 'dragonmaster0102@gmail.com',
  reason: 'Old tree removal reason',
  address: '1632 South Pine Drive',
  urgency: "This week, if that's possible for you",
  callbackTime: 'As soon as you can',
  callback_time: 'As soon as you can',
  serviceAddress: '1632 South Pine Drive',
  service_address: '1632 South Pine Drive',
  reasonForCalling: 'Old tree removal reason',
  serviceRequested: 'Old tree removal reason',
  addressOrLocation: '1632 South Pine Drive',
  desiredCompletion: "This week, if that's possible for you",
  service_requested: 'Old tree removal reason',
  desiredCompletionTime: "This week, if that's possible for you",
  preferredCallbackTime: 'As soon as you can',
  desired_completion_time: "This week, if that's possible for you",
}

const OLD_TIMESTAMPS = {
  email: '2026-09-21T07:57:10.411Z',
  reasonForCalling: '2026-09-16T21:26:10.658Z',
  addressOrLocation: '2026-09-16T21:26:10.658Z',
  desiredCompletionTime: '2026-09-21T07:56:41.763Z',
  preferredCallbackTime: '2026-09-16T21:26:10.658Z',
}

function productionLead(overrides: {
  correctedFields?: Record<string, string>
  correctedTimestamps?: Record<string, string>
  records?: any[]
} = {}) {
  return {
    id: 'fe282084-03d1-42d5-8f83-e8225ab204f1',
    caller_phone: '+14122533598',
    name: 'Jack Johnson',
    contact_name: 'Jack Johnson',
    raw_metadata: {
      ...NEW_CALL_INFO,
      extracted_info: { ...NEW_CALL_INFO },
      corrected_fields: overrides.correctedFields ?? { ...PRODUCTION_CORRECTED },
      corrected_fields_updated_at: overrides.correctedTimestamps ?? { ...OLD_TIMESTAMPS },
      ai_intake_completed: true,
      last_correction_at: '2026-09-21T07:57:10.411Z',
      attribution: { source: 'google_ads' },
    },
    ai_call_records: overrides.records ?? [
      { id: 'r-failed-3', call_sid: 'CA_f3', created_at: '2026-10-01T04:59:00Z', outcome: 'ai_failed', extracted_info: {} },
      { id: 'r-failed-2', call_sid: 'CA_f2', created_at: '2026-10-01T04:56:00Z', outcome: 'ai_failed', extracted_info: {} },
      { id: 'r-failed-1', call_sid: 'CA_f1', created_at: '2026-10-01T04:55:00Z', outcome: 'ai_failed', extracted_info: {} },
      { id: '4b4b4def', call_sid: 'CA94112c4ea96c33110b9cb0c4c104300a', created_at: NEW_CALL_TS, outcome: 'completed', extracted_info: { ...NEW_CALL_INFO } },
      { id: 'r-old', call_sid: 'CA_old', created_at: OLD_CALL_TS, outcome: 'completed', extracted_info: { ...OLD_CALL_INFO } },
    ],
  }
}

describe('Bug A — corrected_fields timestamp-aware precedence', () => {
  it('old corrections + newer completed AI call → AI values win for all five fields', () => {
    const ctx = getCurrentCustomerContext(productionLead())
    expect(ctx.reasonForCalling).toBe(
      "I have a new toilet that I bought from Lowe's, but I don't know how to install it, and I need you to help me"
    )
    expect(ctx.location).toBe('172 space bar drive')
    expect(ctx.desiredCompletionTime).toBe('In the next couple days')
    expect(ctx.preferredCallbackTime).toBe('In the afternoons')
    expect(ctx.customerName).toBe('Jack Johnson')
  })

  it('newer correction + older AI call → correction still wins', () => {
    const lead = productionLead({
      correctedTimestamps: { ...OLD_TIMESTAMPS, preferredCallbackTime: '2026-10-01T05:10:00Z' },
    })
    const ctx = getCurrentCustomerContext(lead)
    expect(ctx.preferredCallbackTime).toBe('As soon as you can')
    // Other fields still resolve to the newer AI call
    expect(ctx.reasonForCalling).toBe(NEW_CALL_INFO.serviceRequested)
    expect(ctx.location).toBe('172 space bar drive')
  })

  it('field-by-field: a newer reason correction affects reason only', () => {
    const lead = productionLead({
      correctedTimestamps: { ...OLD_TIMESTAMPS, reasonForCalling: '2026-10-01T06:00:00Z' },
    })
    const intake = getLeadAIIntake(lead)
    expect(intake.serviceRequested).toBe('Old tree removal reason')
    expect(intake.serviceAddress).toBe('172 space bar drive')
    expect(intake.desiredCompletion).toBe('In the next couple days')
    expect(intake.callbackTime).toBe('In the afternoons')
  })

  it('correction with no timestamp preserves historical precedence (unprovable staleness)', () => {
    const lead = productionLead({ correctedTimestamps: {} })
    delete (lead.raw_metadata as any).last_correction_at
    const ctx = getCurrentCustomerContext(lead)
    // No timestamps → cannot prove staleness → manual corrections keep winning
    expect(ctx.reasonForCalling).toBe('Old tree removal reason')
    expect(ctx.location).toBe('1632 South Pine Drive')
  })

  it('a newer partial/non-completed record with non-empty extracted_info never shadows the last completed call', () => {
    const lead = productionLead()
    lead.ai_call_records.unshift({
      id: 'r-partial',
      call_sid: 'CA_partial',
      created_at: '2026-10-01T05:11:00Z',
      outcome: 'partial_intake',
      extracted_info: {
        customerName: 'Partial Person',
        serviceRequested: 'something else entirely',
        serviceAddress: '999 Nowhere Lane',
        callbackTime: 'never',
      },
    })
    const ctx = getCurrentCustomerContext(lead)
    // 05:01 completed call remains authority — the 05:11 partial cannot shadow it
    expect(ctx.reasonForCalling).toBe(NEW_CALL_INFO.serviceRequested)
    expect(ctx.location).toBe('172 space bar drive')
    expect(ctx.preferredCallbackTime).toBe('In the afternoons')
    expect(ctx.customerName).toBe('Jack Johnson')
  })

  it('ai_failed records newer than the completed call never shadow it', () => {
    const lead = productionLead()
    const intake = getLeadAIIntake(lead)
    expect(intake.serviceRequested).toBe(NEW_CALL_INFO.serviceRequested)
    expect(intake.serviceAddress).toBe('172 space bar drive')
    expect(intake.callbackTime).toBe('In the afternoons')
  })

  it('multiple completed calls → newest usable call wins', () => {
    const lead = productionLead()
    // add an even newer completed call
    lead.ai_call_records.unshift({
      id: 'r-newest',
      call_sid: 'CA_newest',
      created_at: '2026-10-01T06:00:00Z',
      outcome: 'completed',
      extracted_info: { ...NEW_CALL_INFO, callbackTime: 'After 6 pm' },
    })
    const ctx = getCurrentCustomerContext(lead)
    expect(ctx.preferredCallbackTime).toBe('After 6 pm')
    // correction stamped 05:10 is now stale relative to the 06:00 call
    lead.raw_metadata.corrected_fields_updated_at = {
      ...OLD_TIMESTAMPS,
      preferredCallbackTime: '2026-10-01T05:10:00Z',
    }
    expect(getCurrentCustomerContext(lead).preferredCallbackTime).toBe('After 6 pm')
  })

  it('correction timestamp resolves through canonical key regardless of value alias', () => {
    // value stored ONLY under an alias, timestamp under the canonical key
    const lead = productionLead({
      correctedFields: { callback_time: 'Call me at noon' },
      correctedTimestamps: { preferredCallbackTime: '2026-10-01T05:10:00Z' },
    })
    expect(getCurrentCustomerContext(lead).preferredCallbackTime).toBe('Call me at noon')
    // stale timestamp under canonical key → AI wins even though alias value exists
    lead.raw_metadata.corrected_fields_updated_at = { preferredCallbackTime: '2026-09-16T00:00:00Z' }
    lead.raw_metadata.last_correction_at = '2026-09-16T00:00:00Z'
    expect(getCurrentCustomerContext(lead).preferredCallbackTime).toBe('In the afternoons')
  })

  it('email/non-AI profile corrections are unaffected by the precedence gate', () => {
    const ctx = getCurrentCustomerContext(productionLead())
    expect(ctx.email).toBe('dragonmaster0102@gmail.com')
  })

  it('unrelated raw_metadata and correction data are untouched by the reader', () => {
    const lead = productionLead()
    const correctedBefore = JSON.stringify(lead.raw_metadata.corrected_fields)
    getCurrentCustomerContext(lead)
    getLeadAIIntake(lead)
    expect(JSON.stringify(lead.raw_metadata.corrected_fields)).toBe(correctedBefore)
    expect(lead.raw_metadata.attribution).toEqual({ source: 'google_ads' })
  })

  it('a fresh manual name correction newer than the latest call wins', () => {
    const lead = productionLead()
    // The PATCH route writes contact_name and corrected_fields together
    lead.contact_name = 'John Jackson'
    lead.raw_metadata.corrected_fields.customerName = 'John Jackson'
    lead.raw_metadata.corrected_fields_updated_at.callerName = '2026-10-01T05:30:00Z'
    const ctx = getCurrentCustomerContext(lead)
    expect(ctx.customerName).toBe('John Jackson')
  })
})
