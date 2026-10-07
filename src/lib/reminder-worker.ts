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
  action_url?: string
}

export interface PushDeliveryOutcome {
  attempted: number
  successful: number
  failed: number
  // True when every failed token failed permanently (e.g. payload/config
  // bugs). Informational — the schedule is kept either way so a corrected
  // deploy can still deliver on a later run.
  terminalFailure?: boolean
  // Set when delivery could not be evaluated (infra failure, thrown error).
  error?: string
}

export interface WorkerDependencies {
  fetchEligibleTasks: () => Promise<Task[]>
  clearStaleSchedules: () => Promise<number>
  reReadTask: (taskId: string) => Promise<Task | null>
  insertNotification: (notification: Notification) => Promise<{ id: string } | { error: any }>
  // Must return the REAL push delivery outcome. A reminder counts as `sent`
  // only when at least one eligible device push succeeded — or when zero
  // eligible devices existed (in-app notification is still delivered and
  // there is nothing retryable). Anything else keeps the schedule so a later
  // cron run can safely retry delivery.
  sendPush: (notification: any) => Promise<PushDeliveryOutcome>
  // Finds the existing notification row for a schedule idempotency key —
  // needed on rerun after a push failure, when the insert hits 23505.
  findNotificationByIdempotencyKey: (key: string) => Promise<any | null>
  // True when a previous run recorded at least one successful device send
  // for this notification — prevents duplicate pushes on rerun.
  hasSuccessfulPushDelivery: (notificationId: string) => Promise<boolean>
  clearSchedule: (taskId: string, originalNotifyAt: string) => Promise<void>
}

export interface WorkerResult {
  processed: number
  sent: number
  failed: number
  stale_cleared: number
}

// Deep link for reminder notifications. Tapping the notification opens the
// calendar page where reminders are displayed.
const REMINDER_ACTION_URL = '/dashboard/calendar'

/**
 * Attempt push delivery and report whether the reminder can be considered
 * delivered. Sent = ≥1 device push succeeded, or zero eligible devices existed
 * (nothing to deliver; the in-app notification still exists). A thrown error
 * or a zero-success result means NOT delivered — the schedule is kept so the
 * next run can retry through the idempotent duplicate path.
 */
async function deliverReminderPush(
  deps: WorkerDependencies,
  pushPayload: any,
  ctx: { taskId: string; notificationId: string }
): Promise<boolean> {
  let outcome: PushDeliveryOutcome
  try {
    const result = await deps.sendPush(pushPayload)
    outcome = result && typeof result.successful === 'number'
      ? result
      : { attempted: 0, successful: 0, failed: 0, error: 'push_returned_no_result' }
  } catch (pushError) {
    console.error('[REMINDER_PUSH_FAILED]', {
      taskId: ctx.taskId,
      notificationId: ctx.notificationId,
      error: pushError instanceof Error ? pushError.message : String(pushError)
    })
    outcome = {
      attempted: 0, successful: 0, failed: 0,
      error: pushError instanceof Error ? pushError.message : String(pushError)
    }
  }

  if (outcome.error || (outcome.attempted > 0 && outcome.successful === 0)) {
    console.error('[REMINDER_PUSH_NOT_DELIVERED]', {
      taskId: ctx.taskId,
      notificationId: ctx.notificationId,
      attempted: outcome.attempted,
      successful: outcome.successful,
      failed: outcome.failed,
      terminalFailure: outcome.terminalFailure ?? false,
      error: outcome.error ?? null,
    })
    return false
  }

  if (outcome.attempted === 0) {
    console.log('[REMINDER_PUSH_NO_DEVICES]', {
      taskId: ctx.taskId,
      notificationId: ctx.notificationId,
    })
  }
  return true
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

      console.log('[REMINDER_DUE]', { taskId: task.id })

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
        created_at: now,
        action_url: REMINDER_ACTION_URL,
      })

      if ('error' in insertResult) {
        // Check if it's a duplicate (idempotency constraint violation)
        if (insertResult.error.code === '23505') {
          // The notification row already exists — but that does NOT prove a
          // push was ever delivered (a previous run may have created the row
          // and then failed delivery). Verify delivery before counting sent.
          const existing = await deps.findNotificationByIdempotencyKey(idempotencyKey)

          if (!existing) {
            result.failed++
            console.error('[REMINDER_PROCESS_ERROR]', {
              taskId: task.id,
              error: 'notification_duplicate_but_row_not_found'
            })
          } else if (await deps.hasSuccessfulPushDelivery(existing.id)) {
            // Previously delivered — idempotent success, no resend.
            await deps.clearSchedule(task.id, currentTask.reminder_notify_at!)
            result.sent++
          } else {
            // Row exists but no device was ever reached — retry push now.
            const delivered = await deliverReminderPush(deps, {
              id: existing.id,
              business_id: existing.business_id,
              type: existing.type,
              title: existing.title,
              message: existing.message,
              action_url: existing.action_url,
              data: existing.data,
            }, { taskId: task.id, notificationId: existing.id })

            if (delivered) {
              await deps.clearSchedule(task.id, currentTask.reminder_notify_at!)
              result.sent++
            } else {
              result.failed++
            }
          }
        } else {
          result.failed++
        }
      } else {
        // Notification row created — `sent` is decided by push outcome below.
        console.log('[REMINDER_NOTIFICATION_CREATED]', {
          taskId: task.id,
          notificationId: insertResult.id
        })

        const delivered = await deliverReminderPush(deps, {
          id: insertResult.id,
          business_id: currentTask.business_id,
          type: 'reminder',
          title: 'Reminder',
          message: currentTask.title,
          action_url: REMINDER_ACTION_URL,
          data: { taskId: task.id }
        }, { taskId: task.id, notificationId: insertResult.id })

        if (delivered) {
          // Clear schedule with compare-and-set only once actually delivered
          await deps.clearSchedule(task.id, currentTask.reminder_notify_at!)
          result.sent++
        } else {
          result.failed++
        }
      }
    } catch (error) {
      result.failed++
      console.error('[REMINDER_PROCESS_ERROR]', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return result
}
