/**
 * Reminder Notification Worker Logic
 * Extracted for testability without HTTP/Supabase dependencies
 */

export interface Task {
  id: string
  title: string
  business_id: string
  completed: boolean
  reminder_notify_at: string | null
}

export interface Notification {
  business_id: string
  type: string
  title: string
  message: string
  data: any
  read: boolean
  idempotency_key: string
  created_at: string
}

export interface WorkerDependencies {
  fetchEligibleTasks: () => Promise<Task[]>
  clearStaleSchedules: () => Promise<number>
  reReadTask: (taskId: string) => Promise<Task | null>
  insertNotification: (notification: Notification) => Promise<{ id: string } | { error: any }>
  sendPush: (notification: any) => Promise<void>
  clearSchedule: (taskId: string, originalNotifyAt: string) => Promise<void>
}

export interface WorkerResult {
  processed: number
  sent: number
  failed: number
  stale_cleared: number
}

export async function processReminderNotifications(
  deps: WorkerDependencies
): Promise<WorkerResult> {
  const result: WorkerResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    stale_cleared: 0
  }

  const now = new Date().toISOString()

  // Clean up stale schedules
  result.stale_cleared = await deps.clearStaleSchedules()

  // Fetch eligible tasks
  const tasks = await deps.fetchEligibleTasks()

  if (!tasks || tasks.length === 0) {
    return result
  }

  // Process each task
  for (const task of tasks) {
    result.processed++

    try {
      // Re-read task to verify it still exists and hasn't been modified
      const currentTask = await deps.reReadTask(task.id)

      if (!currentTask) {
        // Task deleted, skip
        continue
      }

      // Verify task is still not completed
      if (currentTask.completed) {
        // Clear stale schedule
        await deps.clearSchedule(task.id, currentTask.reminder_notify_at!)
        continue
      }

      // Verify reminder_notify_at hasn't changed since fetch (edit-race protection)
      if (currentTask.reminder_notify_at !== task.reminder_notify_at) {
        // Schedule changed, skip old schedule
        continue
      }

      // Build schedule-specific idempotency key
      const idempotencyKey = `reminder:${task.id}:${currentTask.reminder_notify_at}`

      // Create notification idempotently
      const insertResult = await deps.insertNotification({
        business_id: currentTask.business_id,
        type: 'reminder',
        title: 'Reminder',
        message: currentTask.title,
        data: { taskId: task.id },
        read: false,
        idempotency_key: idempotencyKey,
        created_at: now
      })

      if ('error' in insertResult) {
        // Check if it's a duplicate (idempotency constraint violation)
        if (insertResult.error.code === '23505') {
          // Duplicate treated as success, clear schedule
          await deps.clearSchedule(task.id, currentTask.reminder_notify_at!)
          result.sent++
        } else {
          result.failed++
        }
      } else {
        // Notification created successfully
        result.sent++

        // Send push notification (failure is isolated)
        try {
          await deps.sendPush({
            id: insertResult.id,
            business_id: currentTask.business_id,
            type: 'reminder',
            title: 'Reminder',
            message: currentTask.title,
            data: { taskId: task.id }
          })
        } catch (pushError) {
          // Don't fail entire operation if push fails
        }

        // Clear schedule with compare-and-set
        await deps.clearSchedule(task.id, currentTask.reminder_notify_at!)
      }
    } catch (error) {
      result.failed++
    }
  }

  return result
}