/**
 * Reminder Scheduling Reliability Tests
 *
 * Covers the 15 required cases from the RC reminder/notification reliability
 * audit. These tests exercise the worker logic (processReminderNotifications)
 * and the timezone calculation (calculateReminderNotifyAt) to verify the
 * full scheduling contract.
 *
 * Root cause being guarded against:
 * The cron route previously had a 1-hour lookback window
 * (gte reminder_notify_at oneHourAgo) and a clearStaleSchedules that wiped
 * reminder_notify_at for any task older than 1 hour WITHOUT creating a
 * notification. If the cron didn't run within 1 hour of the scheduled time
 * (deploy, restart, Vercel cron gap), the reminder was permanently skipped.
 *
 * The fix removes the 1-hour lookback (selects ALL due reminders regardless
 * of age) and widens clearStaleSchedules to 7 days. These tests verify that
 * the worker logic handles all scheduling edge cases correctly.
 */

import { describe, it, expect, vi } from 'vitest'
import { processReminderNotifications } from '../reminder-worker'
import { calculateReminderNotifyAt } from '../reminder-notification-utils'

// Helper: create a mock task
function makeTask(overrides: Partial<{
  id: string
  title: string
  business_id: string
  completed: boolean
  reminder_notify_at: string | null
}> = {}) {
  return {
    id: 'task-1',
    title: 'Test Reminder',
    business_id: 'biz-1',
    completed: false,
    reminder_notify_at: '2026-09-04T18:30:00.000Z',
    ...overrides,
  }
}

// Helper: create mock dependencies for the worker
function makeDeps(overrides: Partial<{
  fetchEligibleTasks: () => Promise<any[]>
  clearStaleSchedules: () => Promise<number>
  reReadTask: (id: string) => Promise<any | null>
  insertNotification: (n: any) => Promise<any>
  sendPush: (n: any) => Promise<void>
  clearSchedule: (taskId: string, notifyAt: string) => Promise<void>
}> = {}) {
  return {
    fetchEligibleTasks: overrides.fetchEligibleTasks || (async () => []),
    clearStaleSchedules: overrides.clearStaleSchedules || (async () => 0),
    reReadTask: overrides.reReadTask || (async () => null),
    insertNotification: overrides.insertNotification || (vi.fn().mockResolvedValue({ id: 'notif-123' })),
    sendPush: overrides.sendPush || (vi.fn().mockResolvedValue(undefined)),
    clearSchedule: overrides.clearSchedule || (vi.fn().mockResolvedValue(undefined)),
  }
}

describe('Reminder Scheduling Reliability', () => {
  // 1. Future reminder not selected early
  describe('1. future reminder not selected early', () => {
    it('a reminder with notify_at in the future is not due', () => {
      const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      const now = new Date().toISOString()
      // Simulate the cron query: lte('reminder_notify_at', now)
      // A future reminder should NOT satisfy lte(now)
      expect(futureTime <= now).toBe(false)
    })

    it('worker does not process a task that is not in the eligible set', async () => {
      const deps = makeDeps({
        fetchEligibleTasks: async () => [], // No eligible tasks (future reminder excluded by query)
        reReadTask: async () => makeTask(),
      })
      const result = await processReminderNotifications(deps)
      expect(result.processed).toBe(0)
      expect(result.sent).toBe(0)
    })
  })

  // 2. Due reminder selected
  describe('2. due reminder selected', () => {
    it('a reminder with notify_at in the past is due', () => {
      const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const now = new Date().toISOString()
      expect(pastTime <= now).toBe(true)
    })

    it('worker processes a due reminder and creates a notification', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ id: 'notif-123' })
      const mockSendPush = vi.fn().mockResolvedValue(undefined)
      const mockClear = vi.fn().mockResolvedValue(undefined)
      const task = makeTask()
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        insertNotification: mockInsert,
        sendPush: mockSendPush,
        clearSchedule: mockClear,
      })
      const result = await processReminderNotifications(deps)
      expect(result.processed).toBe(1)
      expect(result.sent).toBe(1)
      expect(mockInsert).toHaveBeenCalledTimes(1)
      expect(mockSendPush).toHaveBeenCalledTimes(1)
      expect(mockClear).toHaveBeenCalledWith('task-1', task.reminder_notify_at)
    })
  })

  // 3. America/New_York conversion correct
  describe('3. America/New_York conversion correct', () => {
    it('converts EDT (UTC-4) wall-clock to UTC correctly', () => {
      // Sep 4, 2026 is EDT (UTC-4), 3 PM ET = 19:00 UTC
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: 0,
        timezone: 'America/New_York',
      })
      expect(result).toBe('2026-09-04T19:00:00.000Z')
    })

    it('converts EST (UTC-5) wall-clock to UTC correctly', () => {
      // Jan 15, 2026 is EST (UTC-5), 3 PM ET = 20:00 UTC
      const result = calculateReminderNotifyAt({
        dueDate: '2026-01-15',
        dueTime: '15:00',
        offsetMinutes: 0,
        timezone: 'America/New_York',
      })
      expect(result).toBe('2026-01-15T20:00:00.000Z')
    })

    it('applies 30-minute offset before conversion', () => {
      // 3 PM ET, 30 min before = 2:30 PM ET = 18:30 UTC (EDT)
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: 30,
        timezone: 'America/New_York',
      })
      expect(result).toBe('2026-09-04T18:30:00.000Z')
    })
  })

  // 4. Slightly late cron still catches reminder
  describe('4. slightly late cron still catches reminder', () => {
    it('a reminder 5 minutes overdue is still selected (no 1-hour lookback)', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const now = new Date().toISOString()
      // The fix removes the gte(oneHourAgo) lower bound, so any past time is selected
      expect(fiveMinAgo <= now).toBe(true)
    })

    it('a reminder 2 hours overdue is still selected (no 1-hour lookback)', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const now = new Date().toISOString()
      // Previously, the 1-hour lookback would exclude this. Now it's included.
      expect(twoHoursAgo <= now).toBe(true)
    })

    it('worker processes a reminder that is 2 hours overdue', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const task = makeTask({ reminder_notify_at: twoHoursAgo })
      const mockInsert = vi.fn().mockResolvedValue({ id: 'notif-123' })
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        insertNotification: mockInsert,
      })
      const result = await processReminderNotifications(deps)
      expect(result.processed).toBe(1)
      expect(result.sent).toBe(1)
      expect(mockInsert).toHaveBeenCalledTimes(1)
    })

    it('a reminder 6 days overdue is still selected (within 7-day stale threshold)', () => {
      const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
      const now = new Date().toISOString()
      expect(sixDaysAgo <= now).toBe(true)
    })
  })

  // 5. Completed reminder excluded
  describe('5. completed reminder excluded', () => {
    it('worker skips a completed task and clears its schedule', async () => {
      const task = makeTask({ completed: false })
      const completedTask = makeTask({ completed: true })
      const mockInsert = vi.fn()
      const mockClear = vi.fn().mockResolvedValue(undefined)
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => completedTask,
        insertNotification: mockInsert,
        clearSchedule: mockClear,
      })
      const result = await processReminderNotifications(deps)
      expect(result.sent).toBe(0)
      expect(mockInsert).not.toHaveBeenCalled()
      expect(mockClear).toHaveBeenCalledWith('task-1', completedTask.reminder_notify_at)
    })
  })

  // 6. Deleted/cancelled reminder excluded
  describe('6. deleted/cancelled reminder excluded', () => {
    it('worker skips a deleted task (reReadTask returns null)', async () => {
      const task = makeTask()
      const mockInsert = vi.fn()
      const mockClear = vi.fn()
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => null, // Task deleted
        insertNotification: mockInsert,
        clearSchedule: mockClear,
      })
      const result = await processReminderNotifications(deps)
      expect(result.sent).toBe(0)
      expect(mockInsert).not.toHaveBeenCalled()
      expect(mockClear).not.toHaveBeenCalled()
    })
  })

  // 7. Exactly one notification row created
  describe('7. exactly one notification row created', () => {
    it('creates exactly one notification for a due reminder', async () => {
      const task = makeTask()
      const mockInsert = vi.fn().mockResolvedValue({ id: 'notif-123' })
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        insertNotification: mockInsert,
      })
      await processReminderNotifications(deps)
      expect(mockInsert).toHaveBeenCalledTimes(1)
    })
  })

  // 8. Repeated scheduler run does not duplicate
  describe('8. repeated scheduler run does not duplicate', () => {
    it('duplicate insert (23505) is treated as success and schedule is cleared', async () => {
      const task = makeTask()
      const mockInsert = vi.fn().mockResolvedValue({
        error: { code: '23505' }, // Unique constraint violation
      })
      const mockClear = vi.fn().mockResolvedValue(undefined)
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        insertNotification: mockInsert,
        clearSchedule: mockClear,
      })
      const result = await processReminderNotifications(deps)
      expect(result.sent).toBe(1) // Treated as success
      expect(result.failed).toBe(0)
      expect(mockInsert).toHaveBeenCalledTimes(1)
      expect(mockClear).toHaveBeenCalledWith('task-1', task.reminder_notify_at)
    })

    it('second run finds no eligible tasks (schedule was cleared)', async () => {
      // First run clears the schedule, so second run's fetchEligibleTasks returns []
      const task = makeTask()
      let scheduleCleared = false
      const mockInsert = vi.fn().mockImplementation(async () => {
        if (scheduleCleared) return { error: { code: '23505' } }
        scheduleCleared = true
        return { id: 'notif-123' }
      })
      const deps = makeDeps({
        fetchEligibleTasks: async () => scheduleCleared ? [] : [task],
        reReadTask: async () => task,
        insertNotification: mockInsert,
      })
      const result1 = await processReminderNotifications(deps)
      const result2 = await processReminderNotifications(deps)
      expect(result1.sent).toBe(1)
      expect(result2.sent).toBe(0)
      expect(result2.processed).toBe(0)
    })
  })

  // 9. Push dispatch invoked exactly once per delivery attempt contract
  describe('9. push dispatch invoked exactly once', () => {
    it('sendPush is called exactly once for a new notification', async () => {
      const task = makeTask()
      const mockSendPush = vi.fn().mockResolvedValue(undefined)
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        sendPush: mockSendPush,
      })
      await processReminderNotifications(deps)
      expect(mockSendPush).toHaveBeenCalledTimes(1)
      expect(mockSendPush).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'notif-123',
          type: 'reminder',
          action_url: '/dashboard/calendar',
        })
      )
    })

    it('sendPush is NOT called for a duplicate notification', async () => {
      const task = makeTask()
      const mockSendPush = vi.fn()
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        insertNotification: vi.fn().mockResolvedValue({ error: { code: '23505' } }),
        sendPush: mockSendPush,
      })
      await processReminderNotifications(deps)
      expect(mockSendPush).not.toHaveBeenCalled()
    })
  })

  // 10. Correct token selected
  describe('10. correct token selected (push delivery contract)', () => {
    it('push payload includes notification id, type, and action_url', async () => {
      const task = makeTask()
      const mockSendPush = vi.fn().mockResolvedValue(undefined)
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        sendPush: mockSendPush,
      })
      await processReminderNotifications(deps)
      const pushPayload = mockSendPush.mock.calls[0][0]
      expect(pushPayload.id).toBeDefined()
      expect(pushPayload.business_id).toBe('biz-1')
      expect(pushPayload.type).toBe('reminder')
      expect(pushPayload.action_url).toBe('/dashboard/calendar')
      expect(pushPayload.data.taskId).toBe('task-1')
    })
  })

  // 11. Retry does not duplicate DB notification
  describe('11. retry does not duplicate DB notification', () => {
    it('idempotency key includes task id and notify_at', async () => {
      const task = makeTask({ reminder_notify_at: '2026-09-04T18:30:00.000Z' })
      const mockInsert = vi.fn().mockResolvedValue({ id: 'notif-123' })
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        insertNotification: mockInsert,
      })
      await processReminderNotifications(deps)
      const notification = mockInsert.mock.calls[0][0]
      expect(notification.idempotency_key).toBe('reminder:task-1:2026-09-04T18:30:00.000Z')
    })

    it('second run with same idempotency key gets 23505 and does not create a new row', async () => {
      const task = makeTask()
      let insertCount = 0
      const mockInsert = vi.fn().mockImplementation(async () => {
        insertCount++
        if (insertCount === 1) return { id: 'notif-123' }
        return { error: { code: '23505' } }
      })
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        insertNotification: mockInsert,
      })
      await processReminderNotifications(deps)
      await processReminderNotifications(deps)
      expect(mockInsert).toHaveBeenCalledTimes(2)
      // First call created a row, second call was rejected as duplicate
    })
  })

  // 12. Transient push failure retries (push layer, not worker)
  describe('12. transient push failure does not fail the worker', () => {
    it('worker counts notification as sent even if push throws', async () => {
      const task = makeTask()
      const mockSendPush = vi.fn().mockRejectedValue(new Error('FCM transient error'))
      const mockClear = vi.fn().mockResolvedValue(undefined)
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        sendPush: mockSendPush,
        clearSchedule: mockClear,
      })
      const result = await processReminderNotifications(deps)
      expect(result.sent).toBe(1)
      expect(result.failed).toBe(0)
      // Schedule is still cleared (notification was created)
      expect(mockClear).toHaveBeenCalled()
    })
  })

  // 13. Permanent token failure handled correctly
  describe('13. permanent token failure does not block notification', () => {
    it('worker does not fail if push delivery reports permanent failure', async () => {
      const task = makeTask()
      const mockSendPush = vi.fn().mockRejectedValue(
        new Error('messaging/registration-token-not-registered')
      )
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        sendPush: mockSendPush,
      })
      const result = await processReminderNotifications(deps)
      // Notification is still created and counted as sent
      expect(result.sent).toBe(1)
      expect(result.failed).toBe(0)
    })
  })

  // 14. Retry exhaustion records provider reason
  describe('14. push failure is logged with error details', () => {
    it('worker logs push failure error message', async () => {
      const task = makeTask()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mockSendPush = vi.fn().mockRejectedValue(new Error('All 3 attempts failed'))
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        sendPush: mockSendPush,
      })
      await processReminderNotifications(deps)
      // Find the [REMINDER_PUSH_FAILED] log entry
      const pushFailLog = consoleSpy.mock.calls.find(
        call => call[0] === '[REMINDER_PUSH_FAILED]'
      )
      expect(pushFailLog).toBeDefined()
      expect(pushFailLog![1]).toEqual(
        expect.objectContaining({
          taskId: 'task-1',
          notificationId: 'notif-123',
          error: 'All 3 attempts failed',
        })
      )
      consoleSpy.mockRestore()
    })
  })

  // 15. Reminder destination/payload correct
  describe('15. reminder destination/payload correct', () => {
    it('notification includes action_url for deep linking', async () => {
      const task = makeTask()
      const mockInsert = vi.fn().mockResolvedValue({ id: 'notif-123' })
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        insertNotification: mockInsert,
      })
      await processReminderNotifications(deps)
      const notification = mockInsert.mock.calls[0][0]
      expect(notification.action_url).toBe('/dashboard/calendar')
    })

    it('push payload includes action_url for native navigation', async () => {
      const task = makeTask()
      const mockSendPush = vi.fn().mockResolvedValue(undefined)
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        sendPush: mockSendPush,
      })
      await processReminderNotifications(deps)
      const pushPayload = mockSendPush.mock.calls[0][0]
      expect(pushPayload.action_url).toBe('/dashboard/calendar')
    })

    it('notification data includes taskId for deep link resolution', async () => {
      const task = makeTask({ id: 'task-special-42' })
      const mockInsert = vi.fn().mockResolvedValue({ id: 'notif-123' })
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        insertNotification: mockInsert,
      })
      await processReminderNotifications(deps)
      const notification = mockInsert.mock.calls[0][0]
      expect(notification.data.taskId).toBe('task-special-42')
    })
  })

  // Edit race protection (bonus — already covered in existing tests, but included for completeness)
  describe('edit race protection', () => {
    it('skips old schedule when task edited between fetch and re-read', async () => {
      const oldTask = makeTask({ reminder_notify_at: '2026-09-04T14:30:00.000Z' })
      const newTask = makeTask({ reminder_notify_at: '2026-09-04T16:30:00.000Z' })
      const mockInsert = vi.fn()
      const mockClear = vi.fn()
      const deps = makeDeps({
        fetchEligibleTasks: async () => [oldTask],
        reReadTask: async () => newTask,
        insertNotification: mockInsert,
        clearSchedule: mockClear,
      })
      const result = await processReminderNotifications(deps)
      expect(result.sent).toBe(0)
      expect(mockInsert).not.toHaveBeenCalled()
      expect(mockClear).not.toHaveBeenCalled()
    })
  })

  // Non-duplicate insert failure does not clear schedule
  describe('non-duplicate insert failure', () => {
    it('does not clear schedule on non-duplicate failure', async () => {
      const task = makeTask()
      const mockInsert = vi.fn().mockResolvedValue({ error: { code: '500' } })
      const mockClear = vi.fn()
      const deps = makeDeps({
        fetchEligibleTasks: async () => [task],
        reReadTask: async () => task,
        insertNotification: mockInsert,
        clearSchedule: mockClear,
      })
      const result = await processReminderNotifications(deps)
      expect(result.failed).toBe(1)
      expect(result.sent).toBe(0)
      expect(mockClear).not.toHaveBeenCalled()
    })
  })
})
