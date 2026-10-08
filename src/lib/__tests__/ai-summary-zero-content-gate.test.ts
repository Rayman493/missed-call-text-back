import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dispatchAutomaticCustomerSms } from '@/lib/auto-sms-dispatcher'
import { sendSms } from '@/lib/twilio'

// Real dispatch path; only IO boundaries are mocked.
vi.mock('@/lib/twilio', () => ({
  sendSms: vi.fn(),
  normalizePhoneNumber: (p: string) => p,
}))

vi.mock('@/lib/ignored-contacts', () => ({
  isIgnoredContact: vi.fn(async () => false),
}))

// Minimal chainable Supabase client mock.
// Queue terminal results per table; inserts/updates are recorded.
const tableQueues: Record<string, Array<{ data?: any; error?: any }>> = {}
const dbCalls: Array<{ table: string; method: string; payload?: any }> = []

function buildQuery(table: string) {
  const state: { method: string; payload?: any } = { method: 'select', payload: undefined }
  const builder: any = {}
  const chainMethods = [
    'select', 'eq', 'neq', 'not', 'lt', 'gt', 'lte', 'gte', 'in', 'is',
    'contains', 'containedBy', 'overlaps', 'order', 'limit', 'range',
    'or', 'filter', 'match', 'textSearch', 'insert', 'update', 'upsert', 'delete',
  ]
  for (const m of chainMethods) {
    builder[m] = (...args: any[]) => {
      if (m === 'insert' || m === 'update' || m === 'upsert' || m === 'delete') {
        state.method = m
        state.payload = args[0]
      }
      return builder
    }
  }
  const terminal = async () => {
    dbCalls.push({ table, method: state.method, payload: state.payload })
    const queue = tableQueues[table]
    return queue && queue.length ? queue.shift()! : { data: null, error: null }
  }
  builder.single = () => terminal()
  builder.maybeSingle = () => terminal()
  builder.then = (resolve: any, reject: any) => terminal().then(resolve, reject)
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => buildQuery(table),
  },
  db: {
    getRecentFilteringDecision: vi.fn(async () => null),
    getOpenConversationForLead: vi.fn(async () => ({ id: 'conv-1' })),
    createConversation: vi.fn(async () => ({ id: 'conv-1' })),
  },
}))

const sendSmsMock = vi.mocked(sendSms)

const CALL_SID = 'CAeab9e46860cee92a921711c82749993c'
const BUSINESS_ID = 'biz-1'
const LEAD_ID = 'lead-1'

const BUSINESS = {
  id: BUSINESS_ID,
  name: 'Test Biz',
  automation_settings: {
    spamRepeatFilteringEnabled: false,
    ignoreRepeatCalls: false,
    repeatCallWindowMinutes: 30,
    ignoreBlockedPrivateNumbers: false,
    ignoreSuspectedSpamCallers: false,
    blockedNumbers: [],
  },
  service_location_type: 'onsite',
}

function baseRecord(overrides: Partial<any> = {}) {
  return {
    id: 'air-1',
    call_sid: CALL_SID,
    business_id: BUSINESS_ID,
    lead_id: LEAD_ID,
    outcome: 'ai_failed',
    ...overrides,
  }
}

function dispatchParams(overrides: Partial<any> = {}) {
  return {
    trigger: 'call_finished' as const,
    callSid: CALL_SID,
    businessId: BUSINESS_ID,
    leadId: LEAD_ID,
    conversationId: 'conv-1',
    callerPhone: '+15551234567',
    aiOutcome: 'ai_failed',
    aiCallRecord: baseRecord(),
    ...overrides,
  }
}

const COMPLETE_INFO = {
  customerName: 'Jane',
  serviceRequested: 'Plumbing repair',
  serviceAddress: '123 Main St',
  desiredCompletionTime: 'Tomorrow',
  callbackTime: 'Morning',
}

beforeEach(() => {
  vi.clearAllMocks()
  dbCalls.length = 0
  for (const k of Object.keys(tableQueues)) delete tableQueues[k]

  // Happy-path defaults: business found, no prior SMS, no stale claim,
  // fresh claim succeeds.
  tableQueues['businesses'] = [{ data: BUSINESS }]
  tableQueues['messages'] = [{ data: null }, { data: null }] // two idempotency checks
  tableQueues['ai_summary_sms_claims'] = [
    { data: null },                 // reclaimStaleClaim → none
    { data: { id: 'claim-1' } },    // claimAiSummarySms insert → claimed
    { data: { id: 'claim-1' } },    // markClaimSent update
  ]
  tableQueues['leads'] = [{ data: { raw_metadata: {} } }, { data: null }]
  tableQueues['call_events'] = [{ data: null }]
  tableQueues['filtering_decisions'] = [{ data: null }]

  sendSmsMock.mockResolvedValue({ sid: 'SM_test_1', idempotentSkip: false } as any)
})

const claimInserts = () =>
  dbCalls.filter(c => c.table === 'ai_summary_sms_claims' && c.method === 'insert')
const messageInserts = () =>
  dbCalls.filter(c => c.table === 'messages' && c.method === 'insert')

describe('AI summary SMS — zero-captured-content gate', () => {
  it('skips ai_failed call with no transcript, extracted info, or summary (production repro CAeab9e4)', async () => {
    const result = await dispatchAutomaticCustomerSms(dispatchParams({
      aiCallRecord: baseRecord({
        extracted_info: {},
        summary: null,
        transcript: null,
        fields_collected_count: 0,
        had_user_speech: false,
      }),
    }))

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('no_captured_ai_content')
    expect(sendSmsMock).not.toHaveBeenCalled()
    expect(claimInserts()).toHaveLength(0)
    expect(messageInserts()).toHaveLength(0)
  })

  it('skips ai_failed call whose extracted_info contains only placeholders', async () => {
    const result = await dispatchAutomaticCustomerSms(dispatchParams({
      aiCallRecord: baseRecord({
        extracted_info: {
          customerName: 'Not collected',
          serviceRequested: 'Not collected',
          serviceAddress: 'Not collected',
        },
        transcript: '',
      }),
    }))

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('no_captured_ai_content')
    expect(sendSmsMock).not.toHaveBeenCalled()
    expect(claimInserts()).toHaveLength(0)
  })

  it('skips ai_failed call whose transcript is present but caller never spoke', async () => {
    const result = await dispatchAutomaticCustomerSms(dispatchParams({
      aiCallRecord: baseRecord({
        transcript: 'AI: Hello, thanks for calling.',
        had_user_speech: false,
      }),
    }))

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('no_captured_ai_content')
    expect(sendSmsMock).not.toHaveBeenCalled()
  })

  it('still sends for ai_failed call with a meaningful partial transcript', async () => {
    const result = await dispatchAutomaticCustomerSms(dispatchParams({
      aiCallRecord: baseRecord({
        transcript: 'Caller: Hi this is John, my sink is leaking.',
        had_user_speech: true,
      }),
    }))

    expect(result.skipped).toBeFalsy()
    expect(sendSmsMock).toHaveBeenCalledTimes(1)
  })

  it('still sends for ai_failed call with partial extracted fields', async () => {
    const result = await dispatchAutomaticCustomerSms(dispatchParams({
      extractedInfo: { customerName: 'John', serviceRequested: 'Plumbing repair' },
      aiCallRecord: baseRecord({
        extracted_info: { customerName: 'John', serviceRequested: 'Plumbing repair' },
        fields_collected_count: 2,
      }),
    }))

    expect(result.skipped).toBeFalsy()
    expect(sendSmsMock).toHaveBeenCalledTimes(1)
  })

  it('still sends normal summary for completed AI intake', async () => {
    const result = await dispatchAutomaticCustomerSms(dispatchParams({
      aiOutcome: 'completed',
      extractedInfo: COMPLETE_INFO,
      aiCallRecord: baseRecord({ outcome: 'completed', extracted_info: COMPLETE_INFO, fields_collected_count: 5 }),
    }))

    expect(result.skipped).toBeFalsy()
    expect(sendSmsMock).toHaveBeenCalledTimes(1)
  })

  it('idempotency still wins: already-sent call returns early regardless of content', async () => {
    tableQueues['messages'] = [{
      data: {
        id: 'm-prev',
        twilio_message_sid: 'SM_prev',
        status: 'sent',
        error_code: null,
      },
    }]

    const result = await dispatchAutomaticCustomerSms(dispatchParams())

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('automatic_sms_already_dispatched_for_call')
    expect(sendSmsMock).not.toHaveBeenCalled()
    expect(claimInserts()).toHaveLength(0)
  })

  it('voicemail trigger is exempt: voicemail_completed with zero AI intake still sends', async () => {
    const result = await dispatchAutomaticCustomerSms(dispatchParams({
      trigger: 'voicemail_completed',
      voicemailCompleted: true,
      aiCallRecord: baseRecord({ outcome: 'voicemail_fallback' }),
    }))

    expect(result.skipped).toBeFalsy()
    expect(sendSmsMock).toHaveBeenCalledTimes(1)
  })

  it('formatter cannot bypass the gate: empty fields at dispatch mean no message is ever built or sent', async () => {
    const result = await dispatchAutomaticCustomerSms(dispatchParams({
      extractedInfo: {},
      aiCallRecord: baseRecord({ extracted_info: {}, transcript: null, summary: null }),
    }))

    expect(result.reason).toBe('no_captured_ai_content')
    expect(sendSmsMock).not.toHaveBeenCalled()
    // No filtering decision 'allowed' insert beyond the claim/send path noise —
    // the gate returns before any send artifacts are created.
    expect(claimInserts()).toHaveLength(0)
    expect(messageInserts()).toHaveLength(0)
  })

  it('non-failure outcome with zero content still sends (gate is failure-scoped)', async () => {
    const result = await dispatchAutomaticCustomerSms(dispatchParams({
      aiOutcome: 'partial_intake',
      aiCallRecord: baseRecord({ outcome: 'partial_intake' }),
    }))

    expect(result.skipped).toBeFalsy()
    expect(sendSmsMock).toHaveBeenCalledTimes(1)
  })
})
