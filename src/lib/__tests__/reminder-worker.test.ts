import { describe, it, expect, vi } from 'vitest'
import { processReminderNotifications } from '../reminder-worker'

describe('Reminder Worker', () => {
  describe('A. DUE REMINDER', () => {
    it('creates notification and clears schedule', async () => {
      const mockInsertNotification = vi.fn().mockResolvedValue({ id: 'notif-123' })
      const mockSendPush = vi.fn().mockResolvedValue(undefined)
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
          idempotency_key: 'reminder:task-1:2026-09-04T18:30:00.000Z'
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
        clearSchedule: mockClearSchedule
      })

      expect(result.stale_cleared).toBe(5)
      expect(result.sent).toBe(0)

      expect(mockInsertNotification).not.toHaveBeenCalled()
    })
  })

  describe('D. DUPLICATE EXECUTION', () => {
    it('treats duplicate notification as idempotent success', async () => {
      const mockInsertNotification = vi.fn().mockResolvedValue({
        error: { code: '23505' } // Unique constraint violation
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
        clearSchedule: mockClearSchedule
      })

      expect(result.sent).toBe(1) // Treated as success
      expect(result.failed).toBe(0)

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
        sendPush: vi.fn(),
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
        clearSchedule: mockClearSchedule
      })

      expect(result.processed).toBe(1)
      expect(result.sent).toBe(0)
      expect(result.failed).toBe(0)

      expect(mockInsertNotification).not.toHaveBeenCalled()
    })
  })

  describe('I. PUSH FAILURE', () => {
    it('continues processing after push failure', async () => {
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
        clearSchedule: mockClearSchedule
      })

      expect(result.sent).toBe(1) // Still counted as sent
      expect(result.failed).toBe(0)

      // Schedule still cleared even though push failed
      expect(mockClearSchedule).toHaveBeenCalledWith('task-1', '2026-09-04T18:30:00.000Z')
    })
  })
})