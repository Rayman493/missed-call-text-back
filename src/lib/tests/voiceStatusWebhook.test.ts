import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory store to simulate DB durability across callbacks
const store = {
  messages: [] as Array<{ id: string; conversation_id: string; business_id: string; twilio_message_sid: string; status: string; is_manual: boolean }>,
  ai_call_records: new Map<string, any>(),
  businesses: new Map<string, any>(),
  leads: new Map<string, any>(),
  call_events: new Map<string, any>(),
}

// Test-only tracing counters
const trace = {
  twilioCreateCalls: [] as any[],
  supabaseInsertCalls: [] as any[],
  supabaseSelectCalls: [] as any[],
  sendSmsReturns: [] as any[]
}

// Mock Supabase client used in route.ts and lib/twilio.ts
vi.mock('@supabase/supabase-js', () => {
  function builder(table: string) {
    const api: any = {}
    api._table = table
    api._filters = [] as any[]
    api.select = vi.fn(() => {
      trace.supabaseSelectCalls.push({ table, filters: api._filters })
      return api
    })
    api.update = vi.fn(() => api)
    api.insert = vi.fn((payload: any) => {
      if (table === 'messages') {
        trace.supabaseInsertCalls.push({ table, payload })
        const rec = {
          id: `msg_${store.messages.length + 1}`,
          conversation_id: payload.conversation_id || 'UNKNOWN',
          business_id: payload.business_id || 'biz_1',
          twilio_message_sid: payload.twilio_message_sid || null,
          status: payload.status || 'sent',
          is_manual: payload.is_manual ?? false,
        }
        store.messages.push(rec)
        return { select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: rec.id }, error: null })) })) }
      }
      return { select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'rec' }, error: null })) })) }
    })
    api.in = vi.fn(() => api)
    api.eq = vi.fn((col: string, val: any) => { api._filters.push({ type: 'eq', col, val }); return api })
    api.gte = vi.fn(() => api)
    api.not = vi.fn(() => api)
    api.order = vi.fn(() => api)
    api.limit = vi.fn(() => api)
    api.maybeSingle = vi.fn(async () => {
      switch (table) {
        case 'call_events':
          // Return null to force creation path; subsequent updates ignored
          return { data: null, error: null }
        case 'ai_call_records': {
          const f = api._filters.find((f: any) => f.col === 'call_sid')
          const rec = f ? store.ai_call_records.get(f.val) : null
          return { data: rec || null, error: null }
        }
        case 'leads': {
          const f = api._filters.find((f: any) => f.col === 'id')
          if (f) {
            const lead = store.leads.get(f.val)
            return { data: lead ? { id: lead.id, status: lead.status ?? 'new', raw_metadata: lead.raw_metadata ?? {} } : null, error: null }
          }
          // phone-based lookup
          return { data: null, error: { code: 'PGRST116' } as any }
        }
        case 'businesses': {
          // Lookup by phone; we only have a single business seeded
          const biz = Array.from(store.businesses.values())[0]
          return { data: biz, error: null }
        }
        case 'messages': {
          // Durable idempotency check: return an existing non-sim Twilio message for this conversation if present
          const conversationIdFilter = api._filters.find((f: any) => f.col === 'conversation_id')
          const bizFilter = api._filters.find((f: any) => f.col === 'business_id')
          const existing = store.messages.find(m => m.conversation_id === conversationIdFilter?.val && m.business_id === bizFilter?.val && m.twilio_message_sid && !m.twilio_message_sid.startsWith('SIM_'))
          return { data: existing || null, error: null }
        }
        default:
          return { data: null, error: null }
      }
    })
    api.single = vi.fn(async () => {
      switch (table) {
        case 'businesses': {
          const biz = Array.from(store.businesses.values())[0]
          return { data: biz, error: null }
        }
        default:
          return { data: { id: 'rec' }, error: null }
      }
    })
    return api
  }
  return {
    createClient: vi.fn(() => ({ from: (t: string) => builder(t) }))
  }
})

// Mock admin DB used by dispatcher and route helpers
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const api: any = { _table: table, _filters: [] }
      api.select = vi.fn(() => api)
      api.eq = vi.fn((col: string, val: any) => { api._filters.push({ type: 'eq', col, val }); return api })
      api.not = vi.fn(() => api)
      api.gte = vi.fn(() => api)
      api.order = vi.fn(() => api)
      api.limit = vi.fn(() => api)
      api.maybeSingle = vi.fn(async () => {
        if (table === 'ai_call_records') {
          const fLead = api._filters.find((f: any) => f.col === 'lead_id')
          const fSid = api._filters.find((f: any) => f.col === 'call_sid')
          const rec = fSid ? store.ai_call_records.get(fSid.val) : null
          // Only return if both match
          if (rec && rec.lead_id === fLead?.val) return { data: rec, error: null }
          return { data: null, error: null }
        }
        if (table === 'leads') {
          const f = api._filters.find((f: any) => f.col === 'id')
          const lead = f ? store.leads.get(f.val) : null
          return { data: lead ? { raw_metadata: lead.raw_metadata ?? {} } : null, error: null }
        }
        if (table === 'messages') {
          const fConv = api._filters.find((f: any) => f.col === 'conversation_id')
          const fBiz = api._filters.find((f: any) => f.col === 'business_id')
          const existing = store.messages.find(m => m.conversation_id === fConv?.val && m.business_id === fBiz?.val && m.twilio_message_sid && !m.twilio_message_sid.startsWith('SIM_'))
          return { data: existing || null, error: null }
        }
        return { data: null, error: null }
      })
      api.single = vi.fn(async () => ({ data: { id: 'rec' }, error: null }))
      api.update = vi.fn(() => ({ eq: vi.fn(() => ({ then: (cb: any) => cb({ error: null }) })) }))
      api.insert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'rec' }, error: null })) })) }))
      return api
    })
  },
  db: {
    getOrCreateConversation: vi.fn(async (leadId: string, businessId: string) => ({ conversationId: 'conv_1', isNew: false })),
    updateConversation: vi.fn(async () => ({})),
    createCallEventWithConversation: vi.fn(async () => ({ id: 'call_event_1' })),
  },
  normalizePhoneNumberForStorage: (p: string) => p,
}))

// Mock Twilio env and provisioning so sendSms runs in live mode without real API
vi.mock('@/lib/twilio/env', () => ({
  validateTwilioForSms: vi.fn(() => ({ isValid: true, method: 'live' })),
  logTwilioEnvStatus: vi.fn(() => ({})),
}))

vi.mock('@/lib/twilio-provisioning-service', () => ({
  isNumberReadyForUse: vi.fn(async () => true)
}))

vi.mock('@/lib/forwarding-verification', () => ({
  markForwardingVerified: vi.fn(async () => ({}))
}))

// Additional alias mocks used by twilio helpers
vi.mock('@/lib/out-of-office', () => ({
  isBusinessOutOfOffice: vi.fn(async () => false)
}))

// Webhook signature validator is imported but not used in direct function tests
vi.mock('@/lib/twilio/webhook', () => ({
  requireTwilioAuth: vi.fn(() => true)
}))

vi.mock('@/lib/ai-field-mapping', () => ({
  normalizeExtractedInfo: (info: any) => info
}))

vi.mock('@/lib/ai-intake-completion', () => ({
  isCompleteAIIntake: () => false
}))

vi.mock('@/lib/sms-decision', () => ({
  hasAiSummaryBeenSent: vi.fn(async () => false)
}))

vi.mock('@/lib/sms-processing', () => ({
  generateSummaryFromExtractedInfo: vi.fn(() => 'Test summary')
}))

// Create a Twilio client mock where "messages" is both callable and has a create method
vi.mock('twilio', () => {
  const fetchMock = vi.fn(async () => ({ sid: 'SM_test_live', status: 'sent', errorCode: null, errorMessage: null, direction: 'outbound', price: null, priceUnit: null }))
  const callable: any = ((sid?: string) => ({ fetch: fetchMock }))
  callable.create = vi.fn(async (args: any) => {
    trace.twilioCreateCalls.push({ args })
    return { sid: 'SM_test_live', status: 'sent' }
  })
  const client = { messages: callable }
  return { default: vi.fn(() => client) }
})

// Map the Vite alias '@/lib/twilio' to the real module so imports in route/dispatcher resolve
vi.mock('@/lib/twilio/env', () => ({
  validateTwilioForSms: vi.fn(() => ({ isValid: true, method: 'simulated', error: null }))
}))

// Map the Vite alias '@/lib/twilio' to the real module so imports in route/dispatcher resolve
vi.mock('@/lib/twilio', async () => {
  const real = await import('../../lib/twilio')
  return { ...real }
})

// Map the Vite alias '@/lib/auto-sms-dispatcher' to the real module
vi.mock('@/lib/auto-sms-dispatcher', async () => {
  const real = await import('../../lib/auto-sms-dispatcher')
  return { ...real }
})

// Lightweight mocks for unrelated dependencies
vi.mock('@/lib/rate-limit', () => ({ checkVoiceStatusRateLimit: vi.fn(async () => ({ success: true })) }))
vi.mock('@/lib/call-pipeline-classification', () => ({ isPersonalVoicemailCall: vi.fn(async () => false), isUpdateVoicemailCall: vi.fn(async () => false) }))
vi.mock('@/lib/ignored-contacts', () => ({ isIgnoredContact: vi.fn(async () => false) }))
vi.mock('@/lib/notifications-server', () => ({ notificationServiceServer: { notifyAiIntakeCompleted: vi.fn(async () => ({})) } }))
vi.mock('@/lib/follow-ups', () => ({ createFollowUpJobs: vi.fn(async () => ([])) }))

import { processVoiceStatusCallback } from '../../app/api/twilio/voice-status/route'

describe('voice-status webhook processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Set Twilio environment variables to bypass validation
    process.env.TWILIO_ACCOUNT_SID = 'AC_test'
    process.env.TWILIO_AUTH_TOKEN = 'test_token'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_key'
    // Reset tracing counters
    trace.twilioCreateCalls = []
    trace.supabaseInsertCalls = []
    trace.supabaseSelectCalls = []
    trace.sendSmsReturns = []
    // Seed business, lead, and ai_call_record (completed) to exercise real dispatcher path
    store.businesses.set('biz_1', { id: 'biz_1', name: 'Biz', twilio_phone_number: '+15550001111', twilio_phone_number_sid: 'PNxx', provisioning_status: 'attached', automation_settings: {} })
    store.leads.set('lead_1', { id: 'lead_1', status: 'new' })
    store.ai_call_records.set('CA_TERM', { id: 'ai_1', lead_id: 'lead_1', conversation_id: 'conv_1', business_id: 'biz_1', call_sid: 'CA_TERM', outcome: 'completed', extracted_info: { callerName: 'Ryan', reasonForCalling: 'grass cut' }, summary: 'summary', transcript: 't' })
    store.ai_call_records.set('CA_DUP', { id: 'ai_2', lead_id: 'lead_1', conversation_id: 'conv_1', business_id: 'biz_1', call_sid: 'CA_DUP', outcome: 'completed', extracted_info: { callerName: 'Alex' }, summary: 's', transcript: 't' })
    store.messages.length = 0
  })

  it('ignores StreamEvent-only callbacks', async () => {
    const res = await processVoiceStatusCallback({ CallSid: 'CA_X', StreamEvent: 'start' }, 'POST', 'https://example.com')
    expect(res).toEqual({ success: true, reason: 'stream_event_ignored' })
    expect(store.messages.length).toBe(0)
  })

  it('ignores non-final statuses', async () => {
    const res = await processVoiceStatusCallback({ CallSid: 'CA_X', CallStatus: 'ringing' }, 'POST', 'https://example.com')
    expect(res).toEqual({ success: true, reason: 'non_final_call_status_ignored' })
    expect(store.messages.length).toBe(0)
  })

  it('on terminal status, finds persisted record and dispatches SMS exactly once', async () => {
    const params = { CallSid: 'CA_TERM', From: '+15551234567', To: '+15550001111', CallStatus: 'failed', Duration: '12' }
    const p = processVoiceStatusCallback(params, 'POST', 'https://example.com')
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.success).toBe(true)
    expect(res.autoReplySent).toBe(true)

    // Prove Twilio send was called exactly once
    expect(trace.twilioCreateCalls.length).toBe(1)

    // Prove messages insert was called exactly once
    expect(trace.supabaseInsertCalls.length).toBe(1)
    const insertCall = trace.supabaseInsertCalls.find(c => c.table === 'messages')
    expect(!!insertCall).toBe(true)
    expect(insertCall?.payload.call_sid).toBe('CA_TERM')
    expect(insertCall?.payload.twilio_message_sid).toBe('SM_test_live')
    expect(insertCall?.payload.business_id).toBe('biz_1')
    expect(insertCall?.payload.lead_id).toBe('lead_1')
    expect(insertCall?.payload.conversation_id).toBe('conv_1')

    // Prove persisted row exists with correct data
    const recorded = store.messages.find(m => m.twilio_message_sid === 'SM_test_live')
    expect(!!recorded).toBe(true)
    expect(recorded?.conversation_id).toBe('conv_1')
    expect(recorded?.business_id).toBe('biz_1')
  }, 15000)

  it('suppresses duplicate terminal callbacks via durable idempotency', async () => {
    const params = { CallSid: 'CA_DUP', From: '+15551238000', To: '+15550001111', CallStatus: 'no-answer', Duration: '7' }
    const p1 = processVoiceStatusCallback(params, 'POST', 'https://example.com')
    await vi.runAllTimersAsync()
    const res1 = await p1
    expect(res1.success).toBe(true)
    expect(res1.autoReplySent).toBe(true)

    // First callback should have sent once
    expect(trace.twilioCreateCalls.length).toBe(1)
    expect(trace.supabaseInsertCalls.length).toBe(1)
    const firstInsert = trace.supabaseInsertCalls.find(c => c.table === 'messages')
    expect(firstInsert?.payload.call_sid).toBe('CA_DUP')

    // Reset tracing before second callback
    trace.twilioCreateCalls = []
    trace.supabaseInsertCalls = []

    // Second callback should find the real persisted row by business_id + call_sid
    const p2 = processVoiceStatusCallback(params, 'POST', 'https://example.com')
    await vi.runAllTimersAsync()
    const res2 = await p2
    expect(res2.success).toBe(true)

    // Twilio call count should remain exactly one (no second send)
    expect(trace.twilioCreateCalls.length).toBe(0)

    // Messages insert count should remain exactly one (no second insert)
    expect(trace.supabaseInsertCalls.length).toBe(0)

    // Only one durable Twilio SID should exist in store
    const count = store.messages.filter(m => m.twilio_message_sid === 'SM_test_live').length
    expect(count).toBe(1)
  }, 15000)

  it('incomplete simple-mode call (partial outcome) should send a partial/intake SMS once and persist message, then suppress duplicates', async () => {
    // Seed an incomplete AI call record with partial extracted info
    store.ai_call_records.set('CA_INC', {
      id: 'ai_inc',
      lead_id: 'lead_1',
      conversation_id: 'conv_1',
      business_id: 'biz_1',
      call_sid: 'CA_INC',
      outcome: 'incomplete',
      extracted_info: { callerName: 'Ryan' },
      summary: '',
      transcript: ''
    })

    const params = { CallSid: 'CA_INC', From: '+15551239999', To: '+15550001111', CallStatus: 'failed', Duration: '9' }
    const p = processVoiceStatusCallback(params, 'POST', 'https://example.com')
    await vi.runAllTimersAsync()
    const res1 = await p

    // EXPECTED PRODUCT BEHAVIOR: partial/incomplete should be SMS-eligible with a structured summary
    expect(res1.success).toBe(true)
    expect(res1.autoReplySent).toBe(true)

    // Prove Twilio send was called exactly once
    expect(trace.twilioCreateCalls.length).toBe(1)
    const twilioArgs = trace.twilioCreateCalls[0].args
    expect(twilioArgs.body).toContain('We captured part of your request')

    // Prove messages insert was called exactly once
    expect(trace.supabaseInsertCalls.length).toBe(1)
    const insertCall = trace.supabaseInsertCalls.find(c => c.table === 'messages')
    expect(!!insertCall).toBe(true)
    expect(insertCall?.payload.call_sid).toBe('CA_INC')
    expect(insertCall?.payload.twilio_message_sid).toBe('SM_test_live')
    expect(insertCall?.payload.business_id).toBe('biz_1')
    expect(insertCall?.payload.lead_id).toBe('lead_1')
    expect(insertCall?.payload.conversation_id).toBe('conv_1')
    expect(insertCall?.payload.body).toContain('We captured part of your request')

    // Prove persisted row exists with correct data
    const persisted1 = store.messages.find(m => m.twilio_message_sid === 'SM_test_live')
    expect(!!persisted1).toBe(true)
    expect(persisted1?.conversation_id).toBe('conv_1')
    expect(persisted1?.business_id).toBe('biz_1')

    // Duplicate terminal callback should be durably suppressed
    trace.twilioCreateCalls = []
    trace.supabaseInsertCalls = []
    const p2 = processVoiceStatusCallback(params, 'POST', 'https://example.com')
    await vi.runAllTimersAsync()
    const res2 = await p2
    expect(res2.success).toBe(true)

    // Twilio call count should remain exactly one (no second send)
    expect(trace.twilioCreateCalls.length).toBe(0)

    // Messages insert count should remain exactly one (no second insert)
    expect(trace.supabaseInsertCalls.length).toBe(0)

    // Only one durable Twilio SID should exist in store
    const count2 = store.messages.filter(m => m.twilio_message_sid === 'SM_test_live').length
    expect(count2).toBe(1)
  }, 15000)

  it('incomplete outcome with no meaningful captured fields should not send SMS', async () => {
    store.ai_call_records.set('CA_EMPTY', {
      id: 'ai_empty',
      lead_id: 'lead_1',
      conversation_id: 'conv_1',
      business_id: 'biz_1',
      call_sid: 'CA_EMPTY',
      outcome: 'incomplete',
      extracted_info: { },
    })
    const p = processVoiceStatusCallback({ CallSid: 'CA_EMPTY', From: '+15551231111', To: '+15550001111', CallStatus: 'failed', Duration: '6' }, 'POST', 'https://example.com')
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.success).toBe(true)
    expect(res.autoReplySent).toBe(false)

    // Prove no Twilio call was made
    expect(trace.twilioCreateCalls.length).toBe(0)

    // Prove no messages insert was made
    expect(trace.supabaseInsertCalls.length).toBe(0)

    // Prove no persisted row with Twilio SID exists
    const sent = store.messages.find(m => m.twilio_message_sid === 'SM_test_live')
    expect(!!sent).toBe(false)
  }, 15000)

  it('incomplete outcome with only whitespace values should not send SMS', async () => {
    store.ai_call_records.set('CA_WS', {
      id: 'ai_ws',
      lead_id: 'lead_1',
      conversation_id: 'conv_1',
      business_id: 'biz_1',
      call_sid: 'CA_WS',
      outcome: 'incomplete',
      extracted_info: { callerName: '   ', reasonForCalling: '   ' },
    })
    const p = processVoiceStatusCallback({ CallSid: 'CA_WS', From: '+15551232222', To: '+15550001111', CallStatus: 'failed', Duration: '6' }, 'POST', 'https://example.com')
    await vi.runAllTimersAsync()
    const res = await p
    expect(res.success).toBe(true)
    expect(res.autoReplySent).toBe(false)

    // Prove no Twilio call was made
    expect(trace.twilioCreateCalls.length).toBe(0)

    // Prove no messages insert was made
    expect(trace.supabaseInsertCalls.length).toBe(0)

    // Prove no persisted row with Twilio SID exists
    const sent = store.messages.find(m => m.twilio_message_sid === 'SM_test_live')
    expect(!!sent).toBe(false)
  }, 15000)
})
