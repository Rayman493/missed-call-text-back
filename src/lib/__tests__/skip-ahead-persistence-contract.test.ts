import { describe, it, expect } from 'vitest'
import { getCurrentCustomerContext } from '../customer-context'
import { formatAiIntakeSummaryWithMode } from '../ai-intake-formatter'
import { isCompleteAIIntake } from '../ai-intake-completion'

describe('Skip-ahead intake persistence contract (Christopher Miller)', () => {
  // This is the exact shape buildCanonicalExtractedInfo now emits when
  // enrichIntakeFromTranscript has populated the live intakeData.
  const voiceExtractedInfo = {
    customerName: 'Christopher Miller',
    callerName: 'Christopher Miller',
    serviceRequested: 'a new water heater installed',
    reasonForCalling: 'a new water heater installed',
    importantDetails: '',
    additionalDetails: '',
    serviceAddress: '85 Liberty Avenue',
    addressOrLocation: '85 Liberty Avenue',
    desiredCompletionTime: 'next Friday',
    desiredCompletion: 'next Friday',
    callbackTime: 'anytime after 4 pm',
    preferredCallbackTime: 'anytime after 4 pm',
    serviceLocationType: 'onsite',
  }

  const mockLead = {
    id: 'lead-test-1',
    caller_phone: '+15551234567',
    ai_call_records: [
      {
        id: 'call-1',
        created_at: '2026-09-09T00:00:00.000Z',
        extracted_info: voiceExtractedInfo,
      },
    ],
  }

  it('produces a complete durable extracted_info object for UI/SMS consumers', () => {
    expect(voiceExtractedInfo.customerName).toBe('Christopher Miller')
    expect(voiceExtractedInfo.serviceRequested.toLowerCase()).toContain('new water heater installed')
    expect(voiceExtractedInfo.serviceAddress).toBe('85 Liberty Avenue')
    expect(voiceExtractedInfo.desiredCompletionTime).toBe('next Friday')
    expect(voiceExtractedInfo.callbackTime).toBe('anytime after 4 pm')

    const isComplete = isCompleteAIIntake(voiceExtractedInfo, 'onsite')
    expect(isComplete).toBe(true)
  })

  it('customer context resolver does not report any captured canonical field as missing', () => {
    const context = getCurrentCustomerContext(mockLead)

    expect(context.customerName).toBe('Christopher Miller')
    expect(context.location).toBe('85 Liberty Avenue')
    expect(context.desiredCompletionTime).toBeTruthy()
    expect(context.desiredCompletionTime.toLowerCase()).toContain('next friday')
    expect(context.preferredCallbackTime).toBeTruthy()
    expect(context.preferredCallbackTime.toLowerCase()).toContain('anytime after 4 pm')
    expect(context.reasonForCalling).toBeTruthy()
    expect(context.reasonForCalling.toLowerCase()).toContain('new water heater')

    expect(context.reasonForCalling).not.toBe('No information yet')
    expect(context.location).not.toBe('No information yet')
    expect(context.desiredCompletionTime).not.toBe('No information yet')
    expect(context.preferredCallbackTime).not.toBe('No information yet')
  })

  it('follow-up SMS does not list any captured field as still needed', () => {
    const sms = formatAiIntakeSummaryWithMode(
      voiceExtractedInfo,
      '+15551234567',
      'ReplyFlow Plumbing'
    )

    expect(sms).toContain('Hi Christopher Miller')
    expect(sms).toContain('85 Liberty Avenue')
    expect(sms).not.toContain('Still needed:')
    expect(sms).not.toContain('Service address')
    expect(sms).not.toContain('When you\'d like it completed')
    expect(sms).not.toContain('Best time to call you')
  })
})
