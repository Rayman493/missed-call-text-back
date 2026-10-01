import { describe, it, expect } from 'vitest'
import { getCurrentCustomerContext } from '../customer-context'
import { getLeadAIIntake } from '../ai-field-mapping'

/**
 * Regression coverage for the repeat-caller Customer Context defect:
 * after a second completed AI Intake call, the canonical readers must surface
 * the SECOND call's intake — both when ai_call_records are present (primary
 * path) and when only the merged raw_metadata snapshot is available.
 */

const SECOND_CALL = {
  customerName: 'Mike Thompson',
  serviceRequested: 'calling because I need my gutters cleaned',
  serviceAddress: '425 Oak Street in Pittsburgh',
  desiredCompletionTime: 'sometime this weekend',
  callbackTime: 'after 4 pm',
}

function leadWithSecondCall() {
  return {
    id: 'lead-1',
    caller_phone: '+14122533598',
    name: 'Mike Thompson',
    contact_name: 'Mike Thompson',
    raw_metadata: {
      // merged snapshot as written by mergeAiIntakeIntoRawMetadata
      ...SECOND_CALL,
      desiredCompletion: SECOND_CALL.desiredCompletionTime,
      extracted_info: { ...SECOND_CALL, desiredCompletion: SECOND_CALL.desiredCompletionTime },
      ai_intake_completed: true,
      ai_intake_latest_call_sid: 'CA_call2',
      attribution: { source: 'google_ads' },
    },
    aiCallRecords: [
      {
        id: 'rec-2',
        call_sid: 'CA_call2',
        created_at: '2026-10-01T04:30:00Z',
        outcome: 'completed',
        extracted_info: { ...SECOND_CALL },
      },
      {
        id: 'rec-1',
        call_sid: 'CA_call1',
        created_at: '2026-09-20T10:00:00Z',
        outcome: 'completed',
        extracted_info: {
          customerName: 'Ryan',
          serviceRequested: 'tree removal in the backyard',
          serviceAddress: '1632 South Pine Drive',
          desiredCompletionTime: 'this week',
          callbackTime: 'ASAP',
        },
      },
    ],
  }
}

describe('customer context — latest completed call wins', () => {
  it('shows the second call values when the newest ai_call_record is present', () => {
    const ctx = getCurrentCustomerContext(leadWithSecondCall())
    expect(ctx.customerName).toBe('Mike Thompson')
    expect(ctx.reasonForCalling).toBe('Calling because I need my gutters cleaned')
    expect(ctx.location).toBe('425 Oak Street in Pittsburgh')
    expect(ctx.desiredCompletionTime).toBe('Sometime this weekend')
    expect(ctx.preferredCallbackTime).toBe('After 4 pm')
  })

  it('shows the second call values from merged raw_metadata when no call records exist', () => {
    const lead = leadWithSecondCall()
    delete (lead as any).aiCallRecords
    const ctx = getCurrentCustomerContext(lead)
    expect(ctx.reasonForCalling).toBe('Calling because I need my gutters cleaned')
    expect(ctx.location).toBe('425 Oak Street in Pittsburgh')
    expect(ctx.desiredCompletionTime).toBe('Sometime this weekend')
    expect(ctx.preferredCallbackTime).toBe('After 4 pm')
  })

  it('stale legacy alias keys in raw_metadata cannot shadow the current call', () => {
    const lead = leadWithSecondCall()
    // Post-merge invariant: any pre-existing alias carries the CURRENT value.
    lead.raw_metadata.reasonForCalling = SECOND_CALL.serviceRequested
    lead.raw_metadata.addressOrLocation = SECOND_CALL.serviceAddress
    delete (lead as any).aiCallRecords
    const ctx = getCurrentCustomerContext(lead)
    expect(ctx.reasonForCalling).toBe('Calling because I need my gutters cleaned')
    expect(ctx.location).toBe('425 Oak Street in Pittsburgh')
  })

  it('getLeadAIIntake resolves all five fields from the newest record', () => {
    const intake = getLeadAIIntake(leadWithSecondCall())
    expect(intake.customerName).toBe('Mike Thompson')
    expect(intake.serviceRequested).toBe('Calling because I need my gutters cleaned')
    expect(intake.serviceAddress).toBe('425 Oak Street in Pittsburgh')
    expect(intake.desiredCompletion).toBe('Sometime this weekend')
    expect(intake.callbackTime).toBe('After 4 pm')
  })
})
