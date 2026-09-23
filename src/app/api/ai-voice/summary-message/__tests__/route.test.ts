import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import { POST } from '../route'

const SECRET = 'test-internal-secret'

const baseBody = {
  businessId: 'biz-1',
  leadId: 'lead-1',
  conversationId: 'conv-1',
  smsBody: 'Summary of your request',
  fromPhone: '+15550001111',
  toPhone: '+15550002222',
  twilioMessageSid: 'SM123',
}

function makeRequest(body: any, token: string | null = SECRET) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers['authorization'] = `Bearer ${token}`
  return new NextRequest('http://localhost/api/ai-voice/summary-message', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function mockSupabase(opts: {
  conversation?: { business_id: string; lead_id: string } | null
  lead?: { business_id: string } | null
  convoError?: any
  leadError?: any
  existing?: { id: string; business_id?: string; lead_id?: string; conversation_id?: string } | null
  raced?: { id: string; business_id?: string; lead_id?: string; conversation_id?: string } | null
  dedupError?: any
  inserted?: { id: string } | null
  insertError?: any
}) {
  const calls: { table: string; insertPayload?: any }[] = []
  let messagesSelectCount = 0
  const client = {
    from: vi.fn((table: string) => {
      calls.push({ table })
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        insert: vi.fn((payload: any) => {
          calls[calls.length - 1].insertPayload = payload
          return chain
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'conversations') return { data: opts.conversation ?? null, error: opts.convoError ?? null }
          if (table === 'leads') return { data: opts.lead ?? null, error: opts.leadError ?? null }
          if (table === 'messages') {
            const selectNo = messagesSelectCount++
            // First messages select = dedup check; second = post-23505 raced lookup
            return selectNo === 0
              ? { data: opts.existing ?? null, error: opts.dedupError ?? null }
              : { data: opts.raced ?? null, error: null }
          }
          return { data: null, error: null }
        }),
        single: vi.fn(async () => {
          if (table === 'messages') {
            return { data: opts.inserted ?? null, error: opts.insertError ?? null }
          }
          return { data: null, error: null }
        }),
      }
      return chain
    }),
  }
  vi.mocked(createClient).mockReturnValue(client as any)
  return { client, calls }
}

describe('ai-voice/summary-message route', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      INTERNAL_API_SECRET: SECRET,
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('rejects unauthenticated requests without writing a message', async () => {
    const { calls } = mockSupabase({})
    const res = await POST(makeRequest(baseBody, 'wrong-secret'))
    expect(res.status).toBe(401)
    const noAuth = await POST(makeRequest(baseBody, null))
    expect(noAuth.status).toBe(401)
    expect(calls.some(c => c.insertPayload)).toBe(false)
  })

  it('inserts a correctly scoped message when ownership validates', async () => {
    const { calls } = mockSupabase({
      conversation: { business_id: 'biz-1', lead_id: 'lead-1' },
      lead: { business_id: 'biz-1' },
      existing: null,
      inserted: { id: 'msg-1' },
    })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(200)
    const insertCall = calls.find(c => c.table === 'messages' && c.insertPayload)
    expect(insertCall?.insertPayload.business_id).toBe('biz-1')
    expect(insertCall?.insertPayload.lead_id).toBe('lead-1')
    expect(insertCall?.insertPayload.conversation_id).toBe('conv-1')
    expect(insertCall?.insertPayload.message_type).toBe('summary')
  })

  it('rejects when ownership cannot be resolved (missing records)', async () => {
    const { calls } = mockSupabase({ conversation: null, lead: null })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
    expect(calls.some(c => c.insertPayload)).toBe(false)
  })

  it('rejects when lead and conversation belong to different businesses', async () => {
    const { calls } = mockSupabase({
      conversation: { business_id: 'biz-1', lead_id: 'lead-1' },
      lead: { business_id: 'biz-2' },
    })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
    expect(calls.some(c => c.insertPayload)).toBe(false)
  })

  it('rejects when supplied businessId does not match validated ownership', async () => {
    const { calls } = mockSupabase({
      conversation: { business_id: 'biz-1', lead_id: 'lead-1' },
      lead: { business_id: 'biz-1' },
    })
    const res = await POST(makeRequest({ ...baseBody, businessId: 'biz-2' }))
    expect(res.status).toBe(403)
    expect(calls.some(c => c.insertPayload)).toBe(false)
  })

  it('returns the existing message idempotently on retry (same twilio_message_sid)', async () => {
    const { calls } = mockSupabase({
      conversation: { business_id: 'biz-1', lead_id: 'lead-1' },
      lead: { business_id: 'biz-1' },
      existing: { id: 'msg-existing', business_id: 'biz-1', lead_id: 'lead-1', conversation_id: 'conv-1' },
    })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.idempotent).toBe(true)
    expect(data.messageId).toBe('msg-existing')
    expect(calls.some(c => c.insertPayload)).toBe(false)
  })

  it('treats a 23505 unique-violation race as idempotent success when the raced row exists', async () => {
    const { calls } = mockSupabase({
      conversation: { business_id: 'biz-1', lead_id: 'lead-1' },
      lead: { business_id: 'biz-1' },
      existing: null,
      raced: { id: 'msg-raced', business_id: 'biz-1', lead_id: 'lead-1', conversation_id: 'conv-1' },
      inserted: null,
      insertError: { code: '23505', message: 'duplicate key' },
    })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.idempotent).toBe(true)
    expect(data.messageId).toBe('msg-raced')
    expect(calls.some(c => c.insertPayload)).toBe(true)
  })

  it('rejects when the conversation belongs to a different lead in the same business', async () => {
    const { calls } = mockSupabase({
      conversation: { business_id: 'biz-1', lead_id: 'lead-2' },
      lead: { business_id: 'biz-1' },
    })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(403)
    expect(calls.some(c => c.insertPayload)).toBe(false)
  })

  it('returns 409 when an existing SID belongs to another business', async () => {
    const { calls } = mockSupabase({
      conversation: { business_id: 'biz-1', lead_id: 'lead-1' },
      lead: { business_id: 'biz-1' },
      existing: { id: 'msg-other', business_id: 'biz-2', lead_id: 'lead-9', conversation_id: 'conv-9' },
    })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(409)
    expect(calls.some(c => c.insertPayload)).toBe(false)
  })

  it('returns 409 when an existing SID belongs to another conversation in the same business', async () => {
    const { calls } = mockSupabase({
      conversation: { business_id: 'biz-1', lead_id: 'lead-1' },
      lead: { business_id: 'biz-1' },
      existing: { id: 'msg-other', business_id: 'biz-1', lead_id: 'lead-2', conversation_id: 'conv-2' },
    })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(409)
    expect(calls.some(c => c.insertPayload)).toBe(false)
  })

  it('returns 409 on a 23505 race when the raced row has conflicting ownership', async () => {
    const { calls } = mockSupabase({
      conversation: { business_id: 'biz-1', lead_id: 'lead-1' },
      lead: { business_id: 'biz-1' },
      existing: null,
      raced: { id: 'msg-other', business_id: 'biz-2', lead_id: 'lead-9', conversation_id: 'conv-9' },
      inserted: null,
      insertError: { code: '23505', message: 'duplicate key' },
    })
    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('Conflict')
    expect(data.messageId).toBeUndefined()
    expect(calls.some(c => c.insertPayload)).toBe(true)
  })
})
