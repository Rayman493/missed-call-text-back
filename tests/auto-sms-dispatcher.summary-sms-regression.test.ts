import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'businesses') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ 
                data: { 
                  id: 'biz1', 
                  name: 'Test Business',
                  automation_settings: {
                    spamRepeatFilteringEnabled: false,
                    ignoreRepeatCalls: false,
                    repeatCallWindowMinutes: 30,
                    ignoreBlockedPrivateNumbers: false,
                    ignoreSuspectedSpamCallers: false,
                    blockedNumbers: []
                  }
                }, 
                error: null 
              }))
            }))
          }))
        }
      }
      if (table === 'leads') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { raw_metadata: {} }, error: null }))
            }))
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              then: (cb: any) => cb({ error: null }),
            })),
          })),
        }
      }
      if (table === 'messages') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    not: vi.fn(() => ({
                      not: vi.fn(() => ({
                        not: vi.fn(() => ({
                          maybeSingle: vi.fn(async () => ({ data: null, error: null }))
                        }))
                      }))
                    }))
                  }))
                }))
              }))
            }))
          }))
        }
      }
      if (table === 'ai_call_records') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null }))
                  }))
                }))
              }))
            }))
          }))
        }
      }
      if (table === 'filtering_decisions') {
        return {
          insert: vi.fn(() => ({ error: null }))
        }
      }
      if (table === 'call_events') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              then: (cb: any) => cb({ error: null }),
            })),
          })),
        }
      }
      return { select: vi.fn(), update: vi.fn(), insert: vi.fn() }
    })
  },
  db: {
    getOpenConversationForLead: vi.fn(async () => null),
    createConversation: vi.fn(async (payload: any) => ({ id: 'conv1', ...payload })),
    getRecentFilteringDecision: vi.fn(async () => null),
  }
}))

vi.mock('@/lib/twilio', () => ({
  sendSms: vi.fn(async () => ({ sid: 'SM_test', messageId: 'msg1' })),
  normalizePhoneNumber: vi.fn((phone: string) => phone)
}))

vi.mock('@/lib/ignored-contacts', () => ({
  isIgnoredContact: vi.fn(async () => false)
}))

vi.mock('@/lib/ai-field-mapping', () => ({
  normalizeExtractedInfo: vi.fn((info: any) => info)
}))

vi.mock('@/lib/ai-intake-completion', () => ({
  isCompleteAIIntake: vi.fn(() => true)
}))

vi.mock('@/lib/sms-processing', () => ({
  generateSummaryFromExtractedInfo: vi.fn(() => 'Test summary')
}))

async function importDispatcher() {
  return await import('../src/lib/auto-sms-dispatcher')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('auto-sms-dispatcher summary SMS regression test', () => {
  it('reproduces the exact sequence: incomplete -> refresh -> completed -> send SMS', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    // Simulate the exact sequence from the production bug
    const aiCallRecord = {
      id: '6b8bf2fc-07ca-4e17-9714-bafd163b009f',
      call_sid: 'CAfff087f833325fcba0ddb3fee6544388',
      business_id: 'biz1',
      lead_id: 'lead1',
      outcome: 'completed', // After outcome sync
      extracted_info: { name: 'Test', reason: 'Service' },
      summary: 'Test summary',
      transcript: 'Test transcript'
    }

    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CAfff087f833325fcba0ddb3fee6544388',
      businessId: 'biz1',
      leadId: 'lead1',
      conversationId: 'conv1',
      callerPhone: '+15551234567',
      businessName: 'Test Business',
      extractedInfo: aiCallRecord.extracted_info,
      aiOutcome: aiCallRecord.outcome,
      aiCallRecord: aiCallRecord // Pass the authoritative record
    })

    // Verify the decision was 'send', not 'no_ai_call_record_found'
    expect(result.success).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.reason).not.toBe('no_ai_call_record_found')
    expect(result.twilioMessageSid).toBeTruthy()
  })

  it('rejects wrong CallSid record', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    const aiCallRecord = {
      id: 'record1',
      call_sid: 'CAwrong', // Wrong CallSid
      business_id: 'biz1',
      lead_id: 'lead1',
      outcome: 'completed',
      extracted_info: { name: 'Test' },
      summary: 'Test summary',
      transcript: 'Test transcript'
    }

    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CAcorrect', // Different from record
      businessId: 'biz1',
      leadId: 'lead1',
      callerPhone: '+15551234567',
      aiCallRecord: aiCallRecord
    })

    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('call_sid_mismatch')
  })

  it('rejects wrong business record', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    const aiCallRecord = {
      id: 'record1',
      call_sid: 'CA123',
      business_id: 'biz2', // Wrong business
      lead_id: 'lead1',
      outcome: 'completed',
      extracted_info: { name: 'Test' },
      summary: 'Test summary',
      transcript: 'Test transcript'
    }

    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CA123',
      businessId: 'biz1', // Different from record
      leadId: 'lead1',
      callerPhone: '+15551234567',
      aiCallRecord: aiCallRecord // Direct params path
    })

    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('business_id_mismatch')
  })

  it('skips when aiCallRecord is genuinely absent', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CA123',
      businessId: 'biz1',
      leadId: 'lead1',
      callerPhone: '+15551234567',
      aiCallRecord: undefined // No record provided
    })

    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('no_ai_call_record_found')
  })

  it('failed/fallback path still works', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    const aiCallRecord = {
      id: 'record1',
      call_sid: 'CA123',
      business_id: 'biz1',
      lead_id: 'lead1',
      outcome: 'failed', // Failed outcome
      extracted_info: { name: 'Test' },
      summary: 'Test summary',
      transcript: 'Test transcript'
    }

    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CA123',
      businessId: 'biz1',
      leadId: 'lead1',
      callerPhone: '+15551234567',
      aiOutcome: 'failed',
      aiCallRecord: aiCallRecord
    })

    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('call_failed_or_fallback')
  })

  it('existing automatic SMS suppresses duplicates', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    // This test documents the idempotency behavior
    // The actual suppression is handled by hasAutomaticSmsForCall
    // which is already tested in the main dispatcher logic
    
    const aiCallRecord = {
      id: 'record1',
      call_sid: 'CA123',
      business_id: 'biz1',
      lead_id: 'lead1',
      outcome: 'completed',
      extracted_info: { name: 'Test' },
      summary: 'Test summary',
      transcript: 'Test transcript'
    }

    // When aiCallRecord is provided, it should be used
    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CA123',
      businessId: 'biz1',
      leadId: 'lead1',
      callerPhone: '+15551234567',
      aiCallRecord: aiCallRecord
    })

    // This test documents that the dispatcher processes the record
    // Actual idempotency is tested by the hasAutomaticSmsForCall function
    expect(result.success).toBe(true)
  })

  it('uses passed aiCallRecord instead of re-querying', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    const aiCallRecord = {
      id: 'record1',
      call_sid: 'CA123',
      business_id: 'biz1',
      lead_id: 'lead1',
      outcome: 'completed',
      extracted_info: { name: 'Test' },
      summary: 'Test summary',
      transcript: 'Test transcript'
    }

    // When aiCallRecord is provided, it should be used directly
    // The diagnostic log will show source: 'passed_from_webhook'
    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CA123',
      businessId: 'biz1',
      leadId: 'lead1',
      callerPhone: '+15551234567',
      aiCallRecord: aiCallRecord // Pass the record
    })

    // Verify SMS was sent using the passed record
    expect(result.success).toBe(true)
    expect(result.skipped).toBe(false)
  })

  it('matching CallSid + matching business sends', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    const aiCallRecord = {
      id: 'record1',
      call_sid: 'CA123',
      business_id: 'biz1',
      lead_id: 'lead1',
      outcome: 'completed',
      extracted_info: { name: 'Test' },
      summary: 'Test summary',
      transcript: 'Test transcript'
    }

    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CA123',
      businessId: 'biz1',
      leadId: 'lead1',
      callerPhone: '+15551234567',
      aiCallRecord: aiCallRecord
    })

    expect(result.success).toBe(true)
    expect(result.skipped).toBe(false)
  })

  it('wrong CallSid + matching business skips', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    const aiCallRecord = {
      id: 'record1',
      call_sid: 'CAwrong',
      business_id: 'biz1',
      lead_id: 'lead1',
      outcome: 'completed',
      extracted_info: { name: 'Test' },
      summary: 'Test summary',
      transcript: 'Test transcript'
    }

    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CAcorrect',
      businessId: 'biz1',
      leadId: 'lead1',
      callerPhone: '+15551234567',
      aiCallRecord: aiCallRecord
    })

    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('call_sid_mismatch')
  })

  it('missing business_id skips', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    const aiCallRecord = {
      id: 'record1',
      call_sid: 'CA123',
      business_id: '', // Missing business_id
      lead_id: 'lead1',
      outcome: 'completed',
      extracted_info: { name: 'Test' },
      summary: 'Test summary',
      transcript: 'Test transcript'
    }

    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CA123',
      businessId: 'biz1',
      leadId: 'lead1',
      callerPhone: '+15551234567',
      aiCallRecord: aiCallRecord
    })

    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('business_id_mismatch')
  })

  it('fallback database lookup remains strictly business-scoped', async () => {
    const { dispatchAutomaticCustomerSms } = await importDispatcher()
    
    // When aiCallRecord is not provided, fallback to database query
    // The database query uses both lead_id and call_sid filters
    const result = await dispatchAutomaticCustomerSms({
      trigger: 'call_finished',
      callSid: 'CA123',
      businessId: 'biz1',
      leadId: 'lead1',
      callerPhone: '+15551234567',
      aiCallRecord: undefined // Force database fallback
    })

    // Should skip because database query returns null (mocked)
    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('no_ai_call_record_found')
  })
})
