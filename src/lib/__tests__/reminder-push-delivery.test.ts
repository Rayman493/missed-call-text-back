/**
 * Reminder Push Delivery Accounting Tests
 *
 * Production defect: a reminder whose Android push failed on ALL attempts was
 * still reported as `sent: 1, failed: 0` and its schedule was cleared —
 * because `sent` was incremented on notification-row insert and the push
 * result was discarded.
 *
 * Contract under test:
 *   sent    = at least one eligible device push succeeded, OR zero eligible
 *             devices existed (nothing retryable; in-app notification exists)
 *   failed  = push attempted but zero devices reached, or delivery errored
 *   On failure the schedule is KEPT so a later run retries through the
 *   idempotent duplicate path — without ever re-pushing a delivered
 *   notification (hasSuccessfulPushDelivery guard).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processReminderNotifications } from '../reminder-worker'

const mocks = vi.hoisted(() => ({
  sendToFcmTokens: vi.fn(),
  sendApnsToTokens: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/fcm-sender', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return { ...actual, sendToFcmTokens: mocks.sendToFcmTokens }
})
vi.mock('@/lib/apns-sender', () => ({
  sendApnsToTokens: mocks.sendApnsToTokens,
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from },
}))

function makeChain(result: any) {
  const chain: any = {}
  for (const m of ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'lt', 'gte', 'gt', 'insert', 'update', 'delete', 'single', 'maybeSingle', 'limit', 'order', 'head']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function makeTask() {
  return {
    id: 'task-1',
    title: 'Test Reminder',
    business_id: 'biz-1',
    completed: false,
    reminder_notify_at: '2026-09-04T18:30:00.000Z',
  }
}

function makeWorkerDeps(overrides: Partial<{
  insertNotification: (n: any) => Promise<any>
  sendPush: (n: any) => Promise<any>
  findNotificationByIdempotencyKey: (key: string) => Promise<any | null>
  hasSuccessfulPushDelivery: (id: string) => Promise<boolean>
  clearSchedule: (taskId: string, notifyAt: string) => Promise<void>
}> = {}) {
  const task = makeTask()
  return {
    fetchEligibleTasks: async () => [task],
    clearStaleSchedules: async () => 0,
    reReadTask: async () => task,
    insertNotification: overrides.insertNotification || vi.fn().mockResolvedValue({ id: 'notif-123' }),
    sendPush: overrides.sendPush || vi.fn().mockResolvedValue({ attempted: 1, successful: 1, failed: 0 }),
    findNotificationByIdempotencyKey: overrides.findNotificationByIdempotencyKey ||
      vi.fn().mockResolvedValue({ id: 'notif-123', business_id: 'biz-1', type: 'reminder', title: 'Reminder', message: 'Test Reminder', action_url: '/dashboard/calendar', data: { taskId: 'task-1' } }),
    hasSuccessfulPushDelivery: overrides.hasSuccessfulPushDelivery || vi.fn().mockResolvedValue(false),
    clearSchedule: overrides.clearSchedule || vi.fn().mockResolvedValue(undefined),
  }
}

describe('Worker sent/failed accounting', () => {
  it('zero successful pushes → sent stays 0, failed increments, schedule kept', async () => {
    const clearSchedule = vi.fn().mockResolvedValue(undefined)
    const result = await processReminderNotifications(makeWorkerDeps({
      sendPush: vi.fn().mockResolvedValue({ attempted: 1, successful: 0, failed: 1, terminalFailure: true }),
      clearSchedule,
    }))

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
    expect(clearSchedule).not.toHaveBeenCalled()
  })

  it('one successful push → sent increments exactly once and schedule clears', async () => {
    const clearSchedule = vi.fn().mockResolvedValue(undefined)
    const sendPush = vi.fn().mockResolvedValue({ attempted: 2, successful: 1, failed: 1 })
    const result = await processReminderNotifications(makeWorkerDeps({ sendPush, clearSchedule }))

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(0)
    expect(sendPush).toHaveBeenCalledTimes(1)
    expect(clearSchedule).toHaveBeenCalledWith('task-1', '2026-09-04T18:30:00.000Z')
  })

  it('zero eligible devices → counted sent (nothing retryable) and schedule clears', async () => {
    const clearSchedule = vi.fn().mockResolvedValue(undefined)
    const result = await processReminderNotifications(makeWorkerDeps({
      sendPush: vi.fn().mockResolvedValue({ attempted: 0, successful: 0, failed: 0 }),
      clearSchedule,
    }))

    expect(result.sent).toBe(1)
    expect(clearSchedule).toHaveBeenCalled()
  })

  it('infra-level push error → failed, not sent', async () => {
    const result = await processReminderNotifications(makeWorkerDeps({
      sendPush: vi.fn().mockResolvedValue({ attempted: 0, successful: 0, failed: 0, error: 'push_devices_fetch_failed' }),
    }))
    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
  })

  it('a sendPush result of undefined is treated as failure (fail-closed)', async () => {
    const result = await processReminderNotifications(makeWorkerDeps({
      sendPush: vi.fn().mockResolvedValue(undefined),
    }))
    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
  })
})

describe('Cron rerun idempotency', () => {
  it('rerun after successful delivery does not duplicate the push', async () => {
    const sendPush = vi.fn().mockResolvedValue({ attempted: 1, successful: 1, failed: 0 })
    const deps = makeWorkerDeps({
      insertNotification: vi.fn().mockResolvedValue({ error: { code: '23505' } }),
      sendPush,
      hasSuccessfulPushDelivery: vi.fn().mockResolvedValue(true),
    })
    const result = await processReminderNotifications(deps)

    expect(result.sent).toBe(1)
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('rerun after failed delivery retries the push once the payload is corrected', async () => {
    const sendPush = vi.fn().mockResolvedValue({ attempted: 1, successful: 1, failed: 0 })
    const clearSchedule = vi.fn().mockResolvedValue(undefined)
    const deps = makeWorkerDeps({
      insertNotification: vi.fn().mockResolvedValue({ error: { code: '23505' } }),
      sendPush,
      hasSuccessfulPushDelivery: vi.fn().mockResolvedValue(false), // never delivered
      clearSchedule,
    })
    const result = await processReminderNotifications(deps)

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(0)
    expect(sendPush).toHaveBeenCalledTimes(1)
    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'notif-123', type: 'reminder', action_url: '/dashboard/calendar' })
    )
    expect(clearSchedule).toHaveBeenCalledWith('task-1', '2026-09-04T18:30:00.000Z')
  })

  it('rerun where retry also fails → still failed, schedule still kept', async () => {
    const sendPush = vi.fn().mockResolvedValue({ attempted: 1, successful: 0, failed: 1 })
    const clearSchedule = vi.fn().mockResolvedValue(undefined)
    const result = await processReminderNotifications(makeWorkerDeps({
      insertNotification: vi.fn().mockResolvedValue({ error: { code: '23505' } }),
      sendPush,
      hasSuccessfulPushDelivery: vi.fn().mockResolvedValue(false),
      clearSchedule,
    }))

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
    expect(clearSchedule).not.toHaveBeenCalled()
  })
})

describe('push-delivery retry loop', () => {
  beforeEach(() => {
    mocks.sendToFcmTokens.mockReset()
    mocks.sendApnsToTokens.mockReset()
    mocks.from.mockReset()
  })

  it('does not retry when every token failure is permanent (invalid-payload)', async () => {
    const { sendPushForNotification } = await import('../push-delivery')

    mocks.from.mockImplementation((table: string) => makeChain(
      table === 'businesses'
        ? { data: { user_id: 'u1' }, error: null }
        : table === 'push_devices'
          ? { data: [{ push_token: 'tok-1', platform: 'android' }], error: null }
          : { data: null, error: null }
    ))
    mocks.sendToFcmTokens.mockResolvedValue({
      attempted: 1, successful: 0, failed: 1,
      results: [{ token: 'tok-1', success: false, permanentFailure: true, platform: 'android', errorCode: 'messaging/invalid-payload', errorKind: 'payload' }],
    })
    mocks.sendApnsToTokens.mockResolvedValue({ attempted: 0, successful: 0, failed: 0, results: [] })

    const result = await sendPushForNotification({
      id: 'notif-1',
      business_id: 'biz-1',
      type: 'reminder',
      title: 'Reminder',
      message: 'Task title',
      action_url: '/dashboard/calendar',
      data: { taskId: 'task-1' },
    })

    // Permanent failure → exactly one send call, not 3 identical retries
    expect(mocks.sendToFcmTokens).toHaveBeenCalledTimes(1)
    expect(result.android.successful).toBe(0)
    expect(result.android.failed).toBe(1)
    expect(result.allFailuresPermanent).toBe(true)
  })

  it('retries transient failures', async () => {
    vi.useFakeTimers()
    try {
      const { sendPushForNotification } = await import('../push-delivery')

      mocks.from.mockImplementation((table: string) => makeChain(
        table === 'businesses'
          ? { data: { user_id: 'u1' }, error: null }
          : table === 'push_devices'
            ? { data: [{ push_token: 'tok-1', platform: 'android' }], error: null }
            : { data: null, error: null }
      ))
      mocks.sendToFcmTokens.mockResolvedValue({
        attempted: 1, successful: 0, failed: 1,
        results: [{ token: 'tok-1', success: false, permanentFailure: false, platform: 'android', errorCode: 'messaging/internal-error', errorKind: 'transient' }],
      })
      mocks.sendApnsToTokens.mockResolvedValue({ attempted: 0, successful: 0, failed: 0, results: [] })

      const promise = sendPushForNotification({
        id: 'notif-1',
        business_id: 'biz-1',
        type: 'reminder',
        title: 'Reminder',
        message: 'Task title',
        action_url: '/dashboard/calendar',
        data: { taskId: 'task-1' },
      })
      await vi.runAllTimersAsync()
      await promise

      expect(mocks.sendToFcmTokens).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})
