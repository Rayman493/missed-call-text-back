import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// Mocks
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (_token: string) => ({ data: { user: { id: 'user1' } }, error: null }))
    },
    from: vi.fn((table: string) => {
      return {
        select: vi.fn((_sel?: string) => ({
          eq: vi.fn((_col: string, _val: any) => ({
            single: vi.fn(async () => ({ data: null, error: { code: 'PGRST116' } })),
            maybeSingle: vi.fn(async () => ({ data: null, error: { code: 'PGRST116' } }))
          }))
        })),
        update: vi.fn((_payload: any) => ({
          eq: vi.fn((_col: string, _val: any) => ({
            then: (cb: any) => cb({ error: null }),
          })),
        })),
      }
    })
  }))
}))

const dbMock = {
  getLeadById: vi.fn(async (id: string) => ({ id, business_id: 'biz1', caller_phone: '+15551234567' })),
  getBusiness: vi.fn(async (id: string) => ({ id, user_id: 'user1', name: 'Biz', twilio_phone_number: '+15557654321', twilio_phone_number_sid: 'PNxxx', twilio_messaging_service_sid: null, provisioning_status: 'ready' })),
  createConversation: vi.fn(async (payload: any) => ({ id: 'conv1', ...payload })),
}

const supabaseAdminMock = {
  storage: {
    from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn() }))
  }
} as any

vi.mock('@/lib/supabase/admin', () => ({
  db: dbMock,
  supabaseAdmin: supabaseAdminMock,
}))

const twilioSendCtx: any = { lastOptions: null, calls: 0 }
vi.mock('@/lib/twilio', () => ({
  sendSms: vi.fn(async (_biz: any, _to: string, _msg: string, options?: any) => {
    twilioSendCtx.calls++
    twilioSendCtx.lastOptions = options
    // Default success; tests will override implementation when needed
    return { sid: 'SM_test', messageId: '11111111-1111-1111-1111-111111111111' }
  }),
  sendMms: vi.fn()
}))

vi.mock('@/lib/security', () => ({ sanitizeMessageContent: (m: string) => m }))
vi.mock('@/lib/rate-limit', () => ({ checkManualSmsRateLimit: vi.fn(async () => ({ success: true, reset: 0, limit: 100, remaining: 99 })) }))
vi.mock('@/lib/lead-lifecycle', () => ({ promoteLeadToActiveIfNew: vi.fn(async () => {}) }))

async function importRoute() {
  return await import('../src/app/api/send-sms/route')
}

beforeEach(() => {
  vi.clearAllMocks()
  twilioSendCtx.calls = 0
  twilioSendCtx.lastOptions = null
})

function makeRequest(body: any, headers: Record<string,string> = {}) {
  const reqHeaders = new Headers({ 'content-type': 'application/json', authorization: 'Bearer dummy', ...headers })
  return new Request('http://localhost/api/send-sms', { method: 'POST', headers: reqHeaders, body: JSON.stringify(body) })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('/api/send-sms route', () => {
  it('Appointment SMS uses a valid client identifier (UUID) in component payload', async () => {
    const file = path.join(__dirname, '../src/components/calendar/AppointmentSmsModal.tsx')
    const content = fs.readFileSync(file, 'utf8')
    expect(content).toMatch(/clientMessageId:\s*crypto\.randomUUID\(\)/)
  })

  it('Twilio success + DB insert success returns success with non-null persisted message ID and passes correct IDs', async () => {
    const { POST } = await importRoute()

    // Ensure sendSms returns success with a real UUID
    const { sendSms } = await import('@/lib/twilio') as any
    sendSms.mockResolvedValue({ sid: 'SM123', messageId: '22222222-2222-2222-2222-222222222222' })

    const body = { leadId: 'lead1', message: 'Hello', clientMessageId: '33333333-3333-4333-8333-333333333333' }
    const res = await POST(makeRequest(body))
    const json = await res.json()

    expect(res.ok).toBe(true)
    expect(json.success).toBe(true)
    expect(json.message.id).toBe('22222222-2222-2222-2222-222222222222')
    expect(json.message.lead_id).toBe('lead1')
    expect(json.message.conversation_id).toBe('conv1')

    // Verify sendSms was called with correct correlation IDs
    const twilio = await import('@/lib/twilio') as any
    expect(twilio.sendSms.mock.calls.length).toBe(1)
    const opts = twilio.sendSms.mock.calls[0][3]
    expect(opts.lead_id).toBe('lead1')
    expect(opts.conversation_id).toBe('conv1')
  })

  it('Twilio success + DB insert failure does not silently return normal success', async () => {
    const { POST } = await importRoute()

    // Force DB insert failure by returning null messageId
    const { sendSms } = await import('@/lib/twilio') as any
    sendSms.mockResolvedValue({ sid: 'SM999', messageId: null })

    const body = { leadId: 'lead1', message: 'Hello', clientMessageId: '44444444-4444-4444-9444-444444444444' }
    const res = await POST(makeRequest(body))
    const json = await res.json()

    expect(res.ok).toBe(false)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(json.error).toMatch(/failed to persist/i)
    expect(json.twilio_message_sid).toBe('SM999')
  })

  it('Normal conversation sending path echoes clientMessageId and persists correlation key', async () => {
    const { POST } = await importRoute()

    const { sendSms } = await import('@/lib/twilio') as any
    sendSms.mockResolvedValue({ sid: 'SM777', messageId: '55555555-5555-4555-9555-555555555555' })

    const clientMessageId = '66666666-6666-4666-8666-666666666666'
    const res = await POST(makeRequest({ leadId: 'lead2', message: 'Yo', clientMessageId }))
    const json = await res.json()

    expect(res.ok).toBe(true)
    expect(json.clientMessageId).toBe(clientMessageId)
    // The API returns message with client_message_id field
    expect(json.message.client_message_id).toBe(clientMessageId)
  })
})
