/**
 * Outbound Message Status Reconciliation — Behavioral Tests
 *
 * Physical bug: a successfully sent SMS stayed on "Sending • Just now".
 *
 * Root cause: the optimistic bubble uses 'sending' as a LOCAL pseudo-status
 * (API call in flight), but the shared transition-map state machine models
 * 'sending' as the Twilio lifecycle status (accepted → queued → sending →
 * sent → delivered). The canonical server snapshot persisted by
 * /api/send-sms is 'queued' (or 'accepted'), and the transition map rejects
 * 'sending' → 'queued' as a regression — so the API-response reconcile, the
 * realtime INSERT, every refetch, and even the stuck-message watchdog
 * refresh were all permanently unable to clear the optimistic bubble.
 *
 * Fix (page-client.tsx, mergeMessageWithMonotonicity): an OPTIMISTIC
 * 'sending' message is compared as 'pending' so any canonical server status
 * wins. Persisted Twilio 'sending' rows keep strict monotonicity.
 *
 * These tests exercise the REAL state machine (getMonotonicMessageStatus)
 * through a faithful replica of the production merge, plus source-contract
 * assertions on page-client.tsx so the replica cannot drift.
 */

import { describe, it, expect } from 'vitest'
import { getMonotonicMessageStatus } from '@/lib/twilio/status-monotonic'
import * as fs from 'fs'
import * as path from 'path'

function readSrc(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')
}

// ---------------------------------------------------------------------------
// Faithful replica of mergeMessageWithMonotonicity from
// src/app/dashboard/leads/[id]/page-client.tsx — kept in lockstep with the
// production implementation (verified by Part E source-contract assertions).
// ---------------------------------------------------------------------------
function getMonotonicStatus(currentStatus: string, newStatus: string): string {
  return getMonotonicMessageStatus(currentStatus, newStatus)
}

function mergeMessageWithMonotonicity(existingMessages: any[], incomingMessage: any, source: string = 'unknown'): any[] {
  if (!incomingMessage) return existingMessages
  const messageMap = new Map<string, any>()

  existingMessages.forEach(msg => {
    messageMap.set(msg.id, msg)
  })

  let existingMessage: any = null
  let matchKey: string = ''

  const incomingClientMessageId = incomingMessage.clientMessageId || incomingMessage.client_message_id
  const incomingTwilioSid = incomingMessage.twilio_message_sid

  if (incomingMessage.id && messageMap.has(incomingMessage.id)) {
    existingMessage = messageMap.get(incomingMessage.id)
    matchKey = 'id'
  } else if (incomingClientMessageId) {
    for (const [id, msg] of Array.from(messageMap.entries())) {
      const msgClientMessageId = msg.clientMessageId || msg.client_message_id
      if (msgClientMessageId === incomingClientMessageId) {
        existingMessage = msg
        matchKey = 'clientMessageId'
        break
      }
    }
  } else if (incomingTwilioSid) {
    for (const [id, msg] of Array.from(messageMap.entries())) {
      if (msg.twilio_message_sid === incomingTwilioSid) {
        existingMessage = msg
        matchKey = 'twilio_message_sid'
        break
      }
    }
  }

  if (existingMessage) {
    const effectiveExistingStatus =
      existingMessage.isOptimistic && existingMessage.status === 'sending'
        ? 'pending'
        : existingMessage.status

    const mergedMessage = {
      ...existingMessage,
      ...incomingMessage,
      clientMessageId: existingMessage.clientMessageId || incomingMessage.clientMessageId || incomingMessage.client_message_id,
      isOptimistic: false,
      status: getMonotonicStatus(effectiveExistingStatus, incomingMessage.status)
    }

    if (matchKey === 'clientMessageId' && incomingMessage.id && incomingMessage.id !== existingMessage.id) {
      messageMap.delete(existingMessage.id)
      messageMap.set(incomingMessage.id, mergedMessage)
    } else {
      messageMap.set(existingMessage.id, mergedMessage)
    }
  } else {
    messageMap.set(incomingMessage.id, incomingMessage)
  }

  const merged = Array.from(messageMap.values())
  return merged.sort((a: any, b: any) => {
    const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (timeDiff !== 0) return timeDiff
    if (a.direction === 'inbound' && b.direction === 'outbound') return -1
    if (a.direction === 'outbound' && b.direction === 'inbound') return 1
    return a.id.localeCompare(b.id)
  })
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const CLIENT_ID = 'client-uuid-abc'
const SERVER_ID = 'server-uuid-456'
const TS = '2026-01-15T10:00:00Z'

function optimisticOutbound(overrides: any = {}) {
  return {
    id: CLIENT_ID,
    clientMessageId: CLIENT_ID,
    direction: 'outbound',
    body: 'Hello customer',
    status: 'sending',
    created_at: TS,
    isOptimistic: true,
    media: [],
    media_count: 0,
    ...overrides,
  }
}

function persistedRow(status: string, overrides: any = {}) {
  // Shape returned by /api/send-sms `result.message` and by realtime INSERT
  return {
    id: SERVER_ID,
    lead_id: 'lead-1',
    conversation_id: 'conv-1',
    direction: 'outbound',
    body: 'Hello customer',
    twilio_message_sid: 'SM_test_123',
    status,
    client_message_id: CLIENT_ID,
    sent_at: TS,
    status_updated_at: TS,
    created_at: TS,
    is_manual: true,
    media_count: 0,
    ...overrides,
  }
}

// ===========================================================================
// PART A — OPTIMISTIC → CANONICAL RECONCILIATION
// ===========================================================================
describe('A. Optimistic send → canonical reconcile', () => {
  it('1. optimistic send creates exactly one bubble in sending state', () => {
    const merged = mergeMessageWithMonotonicity([], optimisticOutbound(), 'optimistic-create')
    expect(merged).toHaveLength(1)
    expect(merged[0].status).toBe('sending')
    expect(merged[0].isOptimistic).toBe(true)
  })

  it('2. API-returned persisted message replaces the SAME bubble (queued exits sending)', () => {
    const withOptimistic = mergeMessageWithMonotonicity([], optimisticOutbound(), 'optimistic-create')
    const merged = mergeMessageWithMonotonicity(withOptimistic, persistedRow('queued'), 'send-response-reconcile')

    expect(merged).toHaveLength(1) // no duplicate bubble
    expect(merged[0].id).toBe(SERVER_ID) // canonical DB id wins
    expect(merged[0].isOptimistic).toBe(false)
    expect(merged[0].status).toBe('queued') // exits local 'sending'
    expect(merged[0].twilio_message_sid).toBe('SM_test_123')
    expect(merged[0].clientMessageId).toBe(CLIENT_ID) // correlation preserved
  })

  it('3. realtime INSERT for the canonical row produces no duplicate', () => {
    const withOptimistic = mergeMessageWithMonotonicity([], optimisticOutbound(), 'optimistic-create')
    const merged = mergeMessageWithMonotonicity(withOptimistic, persistedRow('queued'), 'realtime-insert')

    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(SERVER_ID)
    expect(merged[0].status).toBe('queued')
  })

  it('4. realtime UPDATE queued → sent updates the same bubble', () => {
    let messages = mergeMessageWithMonotonicity([], optimisticOutbound(), 'optimistic-create')
    messages = mergeMessageWithMonotonicity(messages, persistedRow('queued'), 'send-response-reconcile')
    messages = mergeMessageWithMonotonicity(messages, persistedRow('sent'), 'realtime-update')

    expect(messages).toHaveLength(1)
    expect(messages[0].status).toBe('sent')
  })

  it('5. realtime UPDATE sent → delivered updates the same bubble', () => {
    let messages = mergeMessageWithMonotonicity([], optimisticOutbound(), 'optimistic-create')
    messages = mergeMessageWithMonotonicity(messages, persistedRow('queued'), 'send-response-reconcile')
    messages = mergeMessageWithMonotonicity(messages, persistedRow('delivered'), 'realtime-update')

    expect(messages).toHaveLength(1)
    expect(messages[0].status).toBe('delivered')
  })
})

// ===========================================================================
// PART B — STALE EVENTS MUST NOT DOWNGRADE
// ===========================================================================
describe('B. Monotonic precedence — no downgrades', () => {
  it('6. stale optimistic snapshot cannot downgrade a sent message to sending', () => {
    let messages = mergeMessageWithMonotonicity([], optimisticOutbound(), 'optimistic-create')
    messages = mergeMessageWithMonotonicity(messages, persistedRow('sent'), 'send-response-reconcile')
    expect(messages[0].status).toBe('sent')

    // A delayed stale merge carrying 'sending' must not regress the bubble
    const staleSending = { ...persistedRow('sending'), status: 'sending' }
    messages = mergeMessageWithMonotonicity(messages, staleSending, 'realtime-update')
    expect(messages[0].status).toBe('sent')
  })

  it('7. stale sent update cannot downgrade a delivered message', () => {
    let messages = mergeMessageWithMonotonicity([], persistedRow('delivered'), 'realtime-insert')
    messages = mergeMessageWithMonotonicity(messages, persistedRow('sent'), 'realtime-update')
    expect(messages[0].status).toBe('delivered')
  })

  it('a persisted (non-optimistic) sending row rejects a stale queued update', () => {
    // The optimistic-pending rule must NOT weaken real Twilio monotonicity.
    const persisted = persistedRow('sending', { isOptimistic: false })
    const merged = mergeMessageWithMonotonicity([persisted], persistedRow('queued'), 'realtime-update')
    expect(merged[0].status).toBe('sending')
  })
})

// ===========================================================================
// PART C — FAILURE + DELAYED WEBHOOK + RESUME
// ===========================================================================
describe('C. Failure, delayed webhook, and resume recovery', () => {
  it('8. API failure marks the SAME bubble as failed', () => {
    const withOptimistic = mergeMessageWithMonotonicity([], optimisticOutbound(), 'optimistic-create')

    // Mirrors the 'optimistic-failed' merge in handleSendMessage
    const failedMessage = {
      id: CLIENT_ID,
      clientMessageId: CLIENT_ID,
      direction: 'outbound',
      body: 'Hello customer',
      status: 'failed',
      error_message: "We couldn't send this message",
      created_at: TS,
      isOptimistic: true,
    }

    const merged = mergeMessageWithMonotonicity(withOptimistic, failedMessage, 'optimistic-failed')
    expect(merged).toHaveLength(1)
    expect(merged[0].status).toBe('failed')
  })

  it('9. delayed webhook: successful API persistence never leaves indefinite sending', () => {
    // The API response alone (status 'queued') must exit 'sending' even if no
    // Twilio status webhook has arrived yet.
    const withOptimistic = mergeMessageWithMonotonicity([], optimisticOutbound(), 'optimistic-create')
    const merged = mergeMessageWithMonotonicity(withOptimistic, persistedRow('queued'), 'send-response-reconcile')
    expect(merged[0].status).not.toBe('sending')

    // Same for 'accepted' (alternate Twilio acceptance status)
    const mergedAccepted = mergeMessageWithMonotonicity(withOptimistic, persistedRow('accepted'), 'send-response-reconcile')
    expect(mergedAccepted[0].status).not.toBe('sending')
  })

  it('10. background/resume refetch reconciles canonical state', () => {
    // App backgrounded after send; realtime missed. Resume refetch merges the
    // persisted row through the same monotonic merge (mergeMessagesById).
    const withOptimistic = mergeMessageWithMonotonicity([], optimisticOutbound(), 'optimistic-create')
    const refetched = mergeMessageWithMonotonicity(withOptimistic, persistedRow('sent'), 'mergeMessagesById[0]')

    expect(refetched).toHaveLength(1)
    expect(refetched[0].status).toBe('sent')
    expect(refetched[0].isOptimistic).toBe(false)
  })

  it('10b. resume refetch of a queued row also exits sending (watchdog path)', () => {
    const withOptimistic = mergeMessageWithMonotonicity([], optimisticOutbound(), 'optimistic-create')
    const refetched = mergeMessageWithMonotonicity(withOptimistic, persistedRow('queued'), 'initial-fetch')
    expect(refetched[0].status).toBe('queued')
  })
})

// ===========================================================================
// PART D — MMS / SENT-IMAGE RECONCILIATION
// ===========================================================================
describe('D. MMS optimistic reconcile preserves local previews', () => {
  it('sent-image bubble reconciles by clientMessageId and keeps local preview media', () => {
    const optimisticMms = optimisticOutbound({
      media: [{ id: `${CLIENT_ID}-media-0`, media_url: 'blob:local', mime_type: 'image/jpeg', isLocalPreview: true }],
      media_count: 1,
      body: '',
    })

    const withOptimistic = mergeMessageWithMonotonicity([], optimisticMms, 'optimistic-create')

    // Mirrors page-client: persisted message keeps local previews until
    // server media records arrive.
    const persisted = persistedRow('queued', { media_count: 1 })
    persisted.media = optimisticMms.media // localPreviewUrls preserved
    persisted.hasLocalPreview = true

    const merged = mergeMessageWithMonotonicity(withOptimistic, persisted, 'send-response-reconcile')
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(SERVER_ID)
    expect(merged[0].status).toBe('queued')
    expect(merged[0].media[0].isLocalPreview).toBe(true)
  })
})

// ===========================================================================
// PART E — SOURCE CONTRACTS (prevent replica drift)
// ===========================================================================
describe('E. page-client.tsx source contracts', () => {
  const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

  it('merge treats optimistic sending as pending for the monotonic comparison', () => {
    expect(source).toContain("existingMessage.isOptimistic && existingMessage.status === 'sending'")
    expect(source).toContain("? 'pending'")
    expect(source).toContain('effectiveExistingStatus')
    expect(source).toContain('status: getMonotonicStatus(effectiveExistingStatus, incomingMessage.status)')
  })

  it('send API response reconciles via clientMessageId + persisted message', () => {
    expect(source).toContain('result.clientMessageId === clientMessageId && result.message')
    expect(source).toContain("mergeMessageWithMonotonicity(currentMsgs, persistedMessageWithClientId, 'send-response-reconcile')")
  })

  it('realtime INSERT and UPDATE both route through the canonical merge', () => {
    expect(source).toContain("mergeMessageWithMonotonicity(currentMessages, newMessage, 'realtime-insert')")
    expect(source).toContain("mergeMessageWithMonotonicity(currentMessages, updatedMessage, 'realtime-update')")
  })

  it('API failure merges a failed state into the same bubble', () => {
    expect(source).toContain("mergeMessageWithMonotonicity(currentMessages, failedMessage, 'optimistic-failed')")
    expect(source).toContain("mergeMessageWithMonotonicity(currentMsgs, failedMessage, 'network-error-failed')")
  })

  it('does not fake sent/delivered via timeout', () => {
    // No setTimeout may assign a message status — statuses come only from the
    // API response, realtime payloads, or fetch merges.
    expect(source).not.toMatch(/setTimeout\([\s\S]{0,200}status:\s*'(sent|delivered)'/)
  })

  it('send API returns the canonical persisted message with clientMessageId', () => {
    const route = readSrc('src/app/api/send-sms/route.ts')
    expect(route).toContain('clientMessageId: clientMessageId')
    expect(route).toContain('client_message_id: clientMessageId')
    expect(route).toContain('twilio_message_sid: messageSid')
  })
})
