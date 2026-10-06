import { describe, it, expect, vi } from 'vitest'
import { processReminderNotifications } from '../reminder-worker'

const PUSH_DELIVERED = { attempted: 1, successful: 1, failed: 0 }
const stubDeps = {
  findNotificationByIdempotencyKey: vi.fn().mockResolvedValue(null),
  hasSuccessfulPushDelivery: vi.fn().mockResolvedValue(false),
}

describe('Reminder Worker', () => {
  describe('A. DUE REMINDER', () => {
    it('creates notification and clears schedule', async () => {
      const mockInsertNotification = vi.fn().mockResolvedValue({ id: 'notif-123' })
      const mockSendPush = vi.fn().mockResolvedValue(PUSH_DELIVERED)
      const mockClearSchedule = vi.fn().mockResolvedValue(undefined)

      const result = await processReminderNotifications({
        fetchEligibleTasks: async () => [
          {
            id: 'task-1',
            title: 'Test Reminder',
            business_id: 'biz-1',
            completed: false,
            reminder_notify_at: '2026-09-04T18:30:00.000Z'
          }
        ],
        clearStaleSchedules: async () => 0,
        reReadTask: async (id) => ({
          id: 'task-1',
          title: 'Test Reminder',
          business_id: 'biz-1',
          completed: false,
          reminder_notify_at: '2026-09-04T18:30:00.000Z'
        }),
        insertNotification: mockInsertNotification,
        sendPush: mockSendPush,
        ...stubDeps,
        clearSchedule: mockClearSchedule
      })

      expect(result.processed).toBe(1)
      expect(result.sent).toBe(1)
      expect(result.failed).toBe(0)

      expect(mockInsertNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'reminder',
          title: 'Reminder',
          message: 'Test Reminder',
          idempotency_key: 'reminder:task-1:2026-09-04T18:30:00.000Z',
          action_url: '/dashboard/calendar'
        })
      )

      expect(mockSendPush).toHaveBeenCalled()
      expect(mockClearSchedule).toHaveBeenCalledWith('task-1', '2026-09-04T18:30:00.000Z')
    })
  })

  describe('B. COMPLETED REMINDER', () => {
    it('skips completed tasks', async () => {
      const mockInsertNotification = vi.fn()
      const mockClearSchedule = vi.fn()

      const result = await processReminderNotifications({
        fetchEligibleTasks: async () => [
          {
            id: 'task-1',
            title: 'Test Reminder',
            business_id: 'biz-1',
            completed: false,
            reminder_notify_at: '2026-09-04T18:30:00.000Z'
          }
        ],
        clearStaleSchedules: async () => 0,
        reReadTask: async (id) => ({
          id: 'task-1',
          title: 'Test Reminder',
          business_id: 'biz-1',
          completed: true, // Now completed
          reminder_notify_at: '2026-09-04T18:30:00.000Z'
        }),
        insertNotification: mockInsertNotification,
        sendPush: vi.fn(),
        ...stubDeps,
        clearSchedule: mockClearSchedule
      })

      expect(result.processed).toBe(1)
      expect(result.sent).toBe(0)
      expect(result.failed).toBe(0)

      expect(mockInsertNotification).not.toHaveBeenCalled()
    })
  })

  describe('C. STALE REMINDER', () => {
    it('clears stale schedules without creating notifications', async () => {
      const mockInsertNotification = vi.fn()
      const mockClearSchedule = vi.fn()

      const result = await processReminderNotifications({
        fetchEligibleTasks: async () => [], // No eligible tasks
        clearStaleSchedules: async () => 5, // 5 stale schedules cleared
        reReadTask: async () => null,
        insertNotification: mockInsertNotification,
        sendPush: vi.fn(),
        ...stubDeps,
        clearSchedule: mockClearSchedule
      })

      expect(result.stale_cleared).toBe(5)
      expect(result.sent).toBe(0)

      expect(mockInsertNotification).not.toHaveBeenCalled()
    })
  })

  describe('D. DUPLICATE EXECUTION', () => {
    it('treats duplicate notification as idempotent success only when delivery is proven', async () => {
      const mockInsertNotification = vi.fn().mockResolvedValue({
        error: { code: '23505' } // Unique constraint violation
      })
      const mockSendPush = vi.fn()
      const mockClearSchedule = vi.fn()

      const result = await processReminderNotifications({
        fetchEligibleTasks: async () => [
          {
            id: 'task-1',
            title: 'Test Reminder',
            business_id: 'biz-1',
            completed: false,
            reminder_notify_at: '2026-09-04T18:30:00.000Z'
          }
        ],
        clearStaleSchedules: async () => 0,
        reReadTask: async (id) => ({
          id: 'task-1',
          title: 'Test Reminder',
          business_id: 'biz-1',
          completed: false,
          reminder_notify_at: '2026-09-04T18:30:00.000Z'
        }),
        insertNotification: mockInsertNotification,
        sendPush: mockSendPush,
        findNotificationByIdempotencyKey: vi.fn().mockResolvedValue({
          id: 'notif-123',
          business_id: 'biz-1',
          type: 'reminder',
          title: 'Reminder',
          message: 'Test Reminder',
          action_url: '/dashboard/calendar',
          data: { taskId: 'task-1' },
        }),
        hasSuccessfulPushDelivery: vi.fn().mockResolvedValue(true),
        clearSchedule: mockClearSchedule
      })

      expect(result.sent).toBe(1) // Previously delivered — idempotent success
      expect(result.failed).toBe(0)

      // No duplicate push on rerun
      expect(mockSendPush).not.toHaveBeenCalled()
      expect(mockClearSchedule).toHaveBeenCalledWith('task-1', '2026-09-04T18:30:00.000Z')
    })
  })

  describe('E. NOTIFICATION INSERT FAILURE', () => {
    it('does not clear schedule on non-duplicate failure', async () => {
      const mockInsertNotification = vi.fn().mockResolvedValue({
        error: { code: '500' } // Non-duplicate error
      })
      const mockClearSchedule = vi.fn()

      const result = await processReminderNotifications({
        fetchEligibleTasks: async () => [
          {
            id: 'task-1',
            title: 'Test Reminder',
            business_id: 'biz-1',
            completed: false,
            reminder_notify_at: '2026-09-04T18:30:00.000Z'
          }
        ],
        clearStaleSchedules: async () => 0,
        reReadTask: async (id) => ({
          id: 'task-1',
          title: 'Test Reminder',
          business_id: 'biz-1',
          completed: false,
          reminder_notify_at: '2026-09-04T18:30:00.000Z'
        }),
        insertNotification: mockInsertNotification,
        sendPush: vi.fn(),
        ...stubDeps,
        clearSchedule: mockClearSchedule
      })

      expect(result.failed).toBe(1)
      expect(result.sent).toBe(0)

      expect(mockClearSchedule).not.toHaveBeenCalled()
    })
  })

  describe('F. EDIT RACE', () => {
    it('skips old schedule when task edited between fetch and re-read', async () => {
      const mockInsertNotification = vi.fn()
      const mockClearSchedule = vi.fn()

      const result = await processReminderNotifications({
        fetchEligibleTasks: async () => [
          {
            id: 'task-1',
            title: 'Test Reminder',
            business_id: 'biz-1',
            completed: false,
            reminder_notify_at: '2026-09-04T14:30:00.000Z' // Old schedule
          }
        ],
        clearStaleSchedules: async () => 0,
        reReadTask: async (id) => ({
          id: 'task-1',
          title: 'Test Reminder',
          business_id: 'biz-1',
          completed: false,
          reminder_notify_at: '2026-09-04T16:30:00.000Z' // New schedule
        }),
        insertNotification: mockInsertNotification,
        sendPush: vi.fn(),
        ...stubDeps,
        clearSchedule: mockClearSchedule
      })

      expect(result.sent).toBe(0)

      expect(mockInsertNotification).not.toHaveBeenCalled()
      expect(mockClearSchedule).not.toHaveBeenCalled()
    })
  })

  describe('G. CLEAR RACE', () => {
    it('clearSchedule uses compare-and-set (tested via mock)', async () => {
      const mockClearSchedule = vi.fn().mockResolvedValue(undefined)

      await processReminderNotifications({
        fetchEligibleTasks: async () => [
          {
            id: 'task-1',
            title: 'Test Reminder',
            business_id: 'biz-1',
            completed: false,
            reminder_notify_at: '2026-09-04T18:30:00.000Z'
          }
        ],
        clearStaleSchedules: async () => 0,
        reReadTask: async (id) => ({
          id: 'task-1',
          title: 'Test Reminder',
          business_id: 'biz-1',
          completed: false,
          reminder_notify_at: '2026-09-04T18:30:00.000Z'
        }),
        insertNotification: async () => ({ id: 'notif-123' }),
        sendPush: vi.fn().mockResolvedValue(PUSH_DELIVERED),
        ...stubDeps,
        clearSchedule: mockClearSchedule
      })

      // Verify clearSchedule is called with both task ID and original schedule
      expect(mockClearSchedule).toHaveBeenCalledWith(
        'task-1',
        '2026-09-04T18:30:00.000Z'
      )
    })
  })

  describe('H. DELETED TASK', () => {
    it('handles deleted task gracefully', async () => {
      const mockInsertNotification = vi.fn()
      const mockClearSchedule = vi.fn()

      const result = await processReminderNotifications({
        fetchEligibleTasks: async () => [
          {
            id: 'task-1',
            title: 'Test Reminder',
            business_id: 'biz-1',
            completed: false,
            reminder_notify_at: '2026-09-04T18:30:00.000Z'
          }
        ],
        clearStaleSchedules: async () => 0,
        reReadTask: async () => null, // Task deleted
        insertNotification: mockInsertNotification,
        sendPush: vi.fn(),
        ...stubDeps,
        clearSchedule: mockClearSchedule
      })

      expect(result.processed).toBe(1)
      expect(result.sent).toBe(0)
      expect(result.failed).toBe(0)

      expect(mockInsertNotification).not.toHaveBeenCalled()
    })
  })

  describe('I. PUSH FAILURE', () => {
    it('failed push is never counted as sent and keeps the schedule for retry', async () => {
      const mockInsertNotification = vi.fn().mockResolvedValue({ id: 'notif-123' })
      const mockSendPush = vi.fn().mockRejectedValue(new Error('Push failed'))
      const mockClearSchedule = vi.fn()

      const result = await processReminderNotifications({
        fetchEligibleTasks: async () => [
          {
            id: 'task-1',
            title: 'Test Reminder',
            business_id: 'biz-1',
            completed: false,
            reminder_notify_at: '2026-09-04T18:30:00.000Z'
          }
        ],
        clearStaleSchedules: async () => 0,
        reReadTask: async (id) => ({
          id: 'task-1',
          title: 'Test Reminder',
          business_id: 'biz-1',
          completed: false,
          reminder_notify_at: '2026-09-04T18:30:00.000Z'
        }),
        insertNotification: mockInsertNotification,
        sendPush: mockSendPush,
        ...stubDeps,
        clearSchedule: mockClearSchedule
      })

      // A thrown push error means delivery was never proven — the reminder is
      // failed, not sent, and the schedule is kept so a later run can retry
      // through the idempotent duplicate path.
      expect(result.sent).toBe(0)
      expect(result.failed).toBe(1)
      expect(mockClearSchedule).not.toHaveBeenCalled()
    })
  })
})