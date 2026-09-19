/**
 * Canonical message merge tests
 *
 * Covers the reconciliation contract used by the customer conversation page
 * for realtime INSERT/UPDATE events, optimistic outbound messages, and
 * silent-refresh merges — with focus on inbound SMS rows persisted by the
 * Twilio webhook (status='received', client_message_id=null, Twilio SID set).
 */

import { describe, it, expect } from 'vitest'
import { mergeMessageWithMonotonicity } from '@/lib/message-merge'

const LEAD_ID = 'lead-1'

function inboundMessage(overrides: Record<string, any> = {}) {
  return {
    id: 'msg-inbound-1',
    lead_id: LEAD_ID,
    business_id: 'biz-1',
    conversation_id: 'conv-1',
    direction: 'inbound',
    body: 'customer reply',
    status: 'received',
    message_type: 'text',
    media_count: 0,
    client_message_id: null,
    twilio_message_sid: 'SM-inbound-1',
    created_at: '2026-01-01T12:00:00.000Z',
    ...overrides,
  }
}

function outboundPersisted(overrides: Record<string, any> = {}) {
  return {
    id: 'msg-outbound-1',
    lead_id: LEAD_ID,
    business_id: 'biz-1',
    conversation_id: 'conv-1',
    direction: 'outbound',
    body: 'business message',
    status: 'queued',
    message_type: 'text',
    media_count: 0,
    client_message_id: 'cm-1',
    twilio_message_sid: 'SM-outbound-1',
    created_at: '2026-01-01T12:01:00.000Z',
    ...overrides,
  }
}

describe('mergeMessageWithMonotonicity — inbound realtime reconciliation', () => {
  it('adds an inbound message INSERT as a new message', () => {
    const merged = mergeMessageWithMonotonicity([], inboundMessage(), 'test')
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('msg-inbound-1')
    expect(merged[0].direction).toBe('inbound')
    expect(merged[0].status).toBe('received')
  })

  it('accepts inbound messages with client_message_id = null', () => {
    // clientMessageId correlation must not be required — inbound rows never
    // carry one (it is an outbound optimistic-message field).
    const incoming = inboundMessage({ client_message_id: null, clientMessageId: undefined })
    const merged = mergeMessageWithMonotonicity([], incoming, 'test')
    expect(merged).toHaveLength(1)
    expect(merged[0].twilio_message_sid).toBe('SM-inbound-1')
  })

  it('does not duplicate a repeated INSERT for the same database id', () => {
    const incoming = inboundMessage()
    let merged = mergeMessageWithMonotonicity([], incoming, 'test')
    merged = mergeMessageWithMonotonicity(merged, { ...incoming }, 'test')
    expect(merged).toHaveLength(1)
  })

  it('deduplicates an INSERT whose Twilio SID matches an existing row', () => {
    const existing = [inboundMessage()]
    const repeated = inboundMessage({ id: 'msg-different-id' })
    const merged = mergeMessageWithMonotonicity(existing, repeated, 'test')
    expect(merged).toHaveLength(1)
  })

  it('returns existing messages unchanged for a null incoming payload', () => {
    const existing = [inboundMessage()]
    expect(mergeMessageWithMonotonicity(existing, null, 'test')).toBe(existing)
    expect(mergeMessageWithMonotonicity(existing, undefined, 'test')).toBe(existing)
  })

  it('sorts inbound and outbound messages chronologically', () => {
    const inbound = inboundMessage({ created_at: '2026-01-01T12:00:00.000Z' })
    const outbound = outboundPersisted({ created_at: '2026-01-01T12:01:00.000Z' })
    const merged = mergeMessageWithMonotonicity(
      mergeMessageWithMonotonicity([], outbound, 'test'),
      inbound,
      'test'
    )
    expect(merged.map((m: any) => m.direction)).toEqual(['inbound', 'outbound'])
  })
})

describe('mergeMessageWithMonotonicity — outbound optimistic behavior', () => {
  const optimistic = {
    id: 'opt-1',
    lead_id: LEAD_ID,
    direction: 'outbound',
    body: 'business message',
    status: 'sending',
    clientMessageId: 'cm-1',
    isOptimistic: true,
    created_at: '2026-01-01T12:01:00.000Z',
  }

  it('reconciles a persisted outbound row against the optimistic message', () => {
    const persisted = outboundPersisted({ id: 'msg-real-1', status: 'queued' })
    const merged = mergeMessageWithMonotonicity([optimistic], persisted, 'test')
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('msg-real-1')
    expect(merged[0].isOptimistic).toBe(false)
    expect(merged[0].clientMessageId).toBe('cm-1')
    expect(merged[0].status).toBe('queued')
  })

  it('a real server status wins over the optimistic "sending" pseudo-status', () => {
    const persisted = outboundPersisted({ status: 'sent' })
    const merged = mergeMessageWithMonotonicity([optimistic], persisted, 'test')
    expect(merged[0].status).toBe('sent')
    expect(merged[0].isOptimistic).toBe(false)
  })
})

describe('mergeMessageWithMonotonicity — status monotonicity', () => {
  it('does not regress a terminal delivered status', () => {
    const delivered = outboundPersisted({ status: 'delivered' })
    const queuedUpdate = outboundPersisted({ status: 'queued' })
    const merged = mergeMessageWithMonotonicity([delivered], queuedUpdate, 'test')
    expect(merged).toHaveLength(1)
    expect(merged[0].status).toBe('delivered')
  })

  it('accepts forward progress queued → sent', () => {
    const queued = outboundPersisted({ status: 'queued' })
    const sent = outboundPersisted({ status: 'sent' })
    const merged = mergeMessageWithMonotonicity([queued], sent, 'test')
    expect(merged[0].status).toBe('sent')
  })
})
