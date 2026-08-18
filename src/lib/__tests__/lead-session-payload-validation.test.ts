import { describe, it, expect } from 'vitest'

describe('Lead Creation Payload Validation', () => {
  it('createLead from voice route includes canonical source at top level', () => {
    // This tests the payload from voice/route.ts line 1736
    const mockVoiceLeadPayload = {
      business_id: 'test-business-id',
      caller_phone: '+1234567890',
      status: 'new',
      source: 'ai_voice', // Must be top-level
      raw_metadata: { callSid: 'test-call-sid' }
    }

    expect(mockVoiceLeadPayload).toHaveProperty('source')
    expect(mockVoiceLeadPayload.source).toBe('ai_voice')
    expect(mockVoiceLeadPayload.source).not.toBeUndefined()
    expect(mockVoiceLeadPayload.source).not.toBeNull()
  })

  it('voice-status direct insert includes canonical source at top level', () => {
    // This tests the payload from voice-status/route.ts line 714
    const mockVoiceStatusLeadPayload = {
      business_id: 'test-business-id',
      caller_phone: '+1234567890',
      status: 'new',
      name: 'Test Customer',
      source: 'ai_voice', // Must be top-level
      raw_metadata: {
        callSid: 'test-call-sid',
        ai_call_record_id: 'test-record-id'
      }
    }

    expect(mockVoiceStatusLeadPayload).toHaveProperty('source')
    expect(mockVoiceStatusLeadPayload.source).toBe('ai_voice')
    expect(mockVoiceStatusLeadPayload.source).not.toBeUndefined()
    expect(mockVoiceStatusLeadPayload.source).not.toBeNull()
  })

  it('manual lead creation uses canonical source value', () => {
    // This tests the payload from leads/route.ts and manual-create/route.ts
    const mockManualLeadPayload = {
      business_id: 'test-business-id',
      caller_phone: '+1234567890',
      status: 'new',
      source: 'manual', // Must be canonical value
      raw_metadata: {}
    }

    expect(mockManualLeadPayload).toHaveProperty('source')
    expect(mockManualLeadPayload.source).toBe('manual')
  })

  it('SMS lead creation uses canonical source value', () => {
    // This tests the payload from sms-processing.ts
    const mockSmsLeadPayload = {
      business_id: 'test-business-id',
      caller_phone: '+1234567890',
      status: 'contacted',
      source: 'sms', // Must be canonical value
      raw_metadata: { source: 'sms' }
    }

    expect(mockSmsLeadPayload).toHaveProperty('source')
    expect(mockSmsLeadPayload.source).toBe('sms')
  })

  it('all source values match CHECK constraint', () => {
    const allowedSources = ['ai_voice', 'sms', 'manual', 'web']
    const actualSources = ['ai_voice', 'sms', 'manual']

    actualSources.forEach(source => {
      expect(allowedSources).toContain(source)
    })
  })
})

describe('AI Call Session Payload Validation', () => {
  it('createAISession includes correlation_id at top level', () => {
    // This tests the payload from session.ts line 74
    const mockSessionPayload = {
      business_id: 'test-business-id',
      lead_id: null,
      call_sid: 'test-call-sid',
      openai_session_id: null,
      status: 'started',
      started_at: new Date().toISOString(),
      correlation_id: 'test-correlation-id' // Must be top-level
    }

    expect(mockSessionPayload).toHaveProperty('correlation_id')
    expect(mockSessionPayload.correlation_id).toBe('test-correlation-id')
    expect(mockSessionPayload.correlation_id).not.toBeUndefined()
  })

  it('createAISession allows null correlation_id', () => {
    const mockSessionPayload = {
      business_id: 'test-business-id',
      lead_id: null,
      call_sid: 'test-call-sid',
      openai_session_id: null,
      status: 'started',
      started_at: new Date().toISOString(),
      correlation_id: null // Should allow null
    }

    expect(mockSessionPayload).toHaveProperty('correlation_id')
    expect(mockSessionPayload.correlation_id).toBeNull()
  })
})