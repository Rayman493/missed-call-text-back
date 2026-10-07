/**
 * Reminder Push Payload + Error Classification Tests
 *
 * Production defect: reminder pushes failed with messaging/invalid-payload
 * because the shared payload builder emitted `leadId: undefined` into the
 * FCM `data` map. The Admin SDK validates that map client-side
 * (validateStringMap) and rejects the whole message — retrying the identical
 * payload is pointless, and the failure must not disable a healthy token.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  // fcm-sender reads FIREBASE_* env vars at module evaluation time — set them
  // before any import of the module under test runs.
  process.env.FIREBASE_PROJECT_ID = 'test-project'
  process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com'
  process.env.FIREBASE_PRIVATE_KEY = 'fake-key'

  const send = vi.fn()
  const updateCalls: { table: string }[] = []
  const from = vi.fn((table: string) => {
    const chain: any = {}
    for (const m of ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'lt', 'gte', 'gt', 'insert', 'delete', 'single', 'maybeSingle', 'limit', 'order', 'head']) {
      chain[m] = vi.fn(() => chain)
    }
    chain.update = vi.fn(() => {
      updateCalls.push({ table })
      return chain
    })
    chain.then = (resolve: any, reject?: any) => Promise.resolve({ data: null, error: null }).then(resolve, reject)
    return chain
  })
  return { send, from, updateCalls }
})

vi.mock('firebase-admin/app', () => ({
  getApps: vi.fn(() => [{ name: 'test' }]),
  initializeApp: vi.fn(() => ({ name: 'test' })),
  cert: vi.fn(() => ({})),
}))
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({ send: mocks.send })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from },
}))

import { sendToFcmTokens, normalizeFcmData, classifyFcmSendError } from '../fcm-sender'

const invalidPayloadError = Object.assign(new Error('data must only contain string values'), {
  code: 'messaging/invalid-payload',
})

describe('normalizeFcmData', () => {
  it('passes string values through unchanged', () => {
    const { data, omittedFields } = normalizeFcmData({ type: 'reminder', actionUrl: '/dashboard/calendar' })
    expect(data).toEqual({ type: 'reminder', actionUrl: '/dashboard/calendar' })
    expect(omittedFields).toEqual([])
  })

  it('omits null and undefined values instead of passing them to FCM', () => {
    const { data, omittedFields } = normalizeFcmData({
      notificationId: 'n-1',
      leadId: undefined,
      taskId: null,
    })
    expect('leadId' in data).toBe(false)
    expect('taskId' in data).toBe(false)
    expect(data).toEqual({ notificationId: 'n-1' })
    expect(omittedFields).toEqual(expect.arrayContaining(['leadId', 'taskId']))
  })

  it('stringifies number and boolean metadata', () => {
    const { data } = normalizeFcmData({ amountCents: 5000, urgent: true, id: 'x' })
    expect(data).toEqual({ amountCents: '5000', urgent: 'true', id: 'x' })
  })

  it('drops objects, arrays and dates so they cannot invalidate the payload', () => {
    const { data, omittedFields } = normalizeFcmData({
      notificationId: 'n-1',
      meta: { nested: true },
      tags: ['a'],
      when: new Date('2026-01-01T00:00:00Z'),
    })
    expect(data).toEqual({ notificationId: 'n-1' })
    expect(omittedFields).toEqual(expect.arrayContaining(['meta', 'tags', 'when']))
  })

  it('every surviving value is a string (the FCM invariant)', () => {
    const { data } = normalizeFcmData({
      a: 'x', b: undefined, c: null, d: 5, e: false, f: { g: 1 }, h: [1],
    })
    expect(Object.values(data).every(v => typeof v === 'string')).toBe(true)
  })
})

describe('classifyFcmSendError', () => {
  it('classifies messaging/invalid-payload as non-transient payload error', () => {
    const c = classifyFcmSendError('messaging/invalid-payload')
    expect(c.kind).toBe('payload')
    expect(c.retryable).toBe(false)
    expect(c.disableToken).toBe(false)
  })

  it('still disables unregistered tokens', () => {
    const c = classifyFcmSendError('messaging/registration-token-not-registered')
    expect(c.kind).toBe('token')
    expect(c.retryable).toBe(false)
    expect(c.disableToken).toBe(true)
  })

  it('keeps provider config errors non-retryable without disabling tokens', () => {
    const c = classifyFcmSendError('messaging/mismatched-credential')
    expect(c.kind).toBe('config')
    expect(c.retryable).toBe(false)
    expect(c.disableToken).toBe(false)
  })

  it('keeps unknown errors transient', () => {
    const c = classifyFcmSendError('messaging/internal-error')
    expect(c.kind).toBe('transient')
    expect(c.retryable).toBe(true)
  })
})

describe('sendToFcmTokens payload construction', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.from.mockClear()
    mocks.updateCalls.length = 0
  })

  it('sends a reminder payload with only string data values and no undefined leadId', async () => {
    mocks.send.mockResolvedValue('msg-1')
    const result = await sendToFcmTokens(['token-a'], {
      title: 'Reminder',
      body: 'Test Reminder',
      payload: {
        notificationId: 'notif-1',
        type: 'reminder',
        actionUrl: '/dashboard/calendar',
        leadId: undefined, // reminder notifications carry no leadId
      },
    })

    expect(result.successful).toBe(1)
    expect(mocks.send).toHaveBeenCalledTimes(1)

    const message = mocks.send.mock.calls[0][0]
    expect('leadId' in message.data).toBe(false)
    expect(Object.values(message.data).every(v => typeof v === 'string')).toBe(true)
    expect(message.data.notificationId).toBe('notif-1')
    expect(message.data.type).toBe('reminder')
    expect(message.data.actionUrl).toBe('/dashboard/calendar')
    expect(message.notification.title).toBe('Reminder')
    expect(message.android.notification.channelId).toBe('replyflow-high')
  })

  it('preserves leadId for lead-bearing notification types (regression)', async () => {
    mocks.send.mockResolvedValue('msg-2')
    await sendToFcmTokens(['token-a'], {
      title: 'AI Intake',
      body: 'New intake',
      payload: {
        notificationId: 'notif-2',
        type: 'ai_intake_completed',
        actionUrl: '/dashboard/leads/lead-1',
        leadId: 'lead-1',
      },
    })

    const message = mocks.send.mock.calls[0][0]
    expect(message.data.leadId).toBe('lead-1')
  })

  it('marks invalid-payload failures permanent so the retry loop stops after one send', async () => {
    mocks.send.mockRejectedValue(invalidPayloadError)
    const result = await sendToFcmTokens(['token-a'], {
      title: 'Reminder',
      body: 'Test',
      payload: { notificationId: 'n', type: 'reminder', actionUrl: '/dashboard/calendar' },
    })

    expect(result.failed).toBe(1)
    expect(result.results[0].permanentFailure).toBe(true)
    expect(result.results[0].errorKind).toBe('payload')
    // One send per token — no internal re-attempt of the malformed payload
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it('does NOT disable the token when the payload is invalid', async () => {
    mocks.send.mockRejectedValue(invalidPayloadError)
    await sendToFcmTokens(['token-a'], {
      title: 'Reminder',
      body: 'Test',
      payload: { notificationId: 'n', type: 'reminder', actionUrl: '/x' },
    })

    expect(mocks.updateCalls.filter(c => c.table === 'push_devices')).toHaveLength(0)
  })

  it('still disables the token on registration-token-not-registered', async () => {
    mocks.send.mockRejectedValue(
      Object.assign(new Error('not registered'), { code: 'messaging/registration-token-not-registered' })
    )
    const result = await sendToFcmTokens(['token-a'], {
      title: 'T', body: 'B',
      payload: { notificationId: 'n', type: 'reminder', actionUrl: '/x' },
    })

    expect(result.results[0].errorKind).toBe('token')
    expect(mocks.updateCalls.filter(c => c.table === 'push_devices')).toHaveLength(1)
  })
})
