-- Add reminder notification fields to tasks table
-- Migration: 20260915000000_add_reminder_notification_fields.sql
-- Purpose: Add optional scheduled notification support for Reminders

-- Add reminder offset minutes (null = no notification)
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS reminder_offset_minutes integer;

-- Add reminder notification timestamp (null = no notification scheduled)
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS reminder_notify_at timestamptz;

-- Add CHECK constraint to restrict offset to valid values
ALTER TABLE tasks
DROP CONSTRAINT IF EXISTS tasks_reminder_offset_minutes_check;

ALTER TABLE tasks
ADD CONSTRAINT tasks_reminder_offset_minutes_check
CHECK (reminder_offset_minutes IS NULL OR reminder_offset_minutes IN (0, 15, 30, 60, 1440));

-- Add partial index for efficient cron querying
CREATE INDEX IF NOT EXISTS idx_tasks_reminder_notify_at
ON tasks(reminder_notify_at)
WHERE reminder_notify_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN tasks.reminder_offset_minutes IS 'Minutes before due time to send notification (null = no notification). Valid values: null, 0 (at time), 15, 30, 60, 1440 (1 day)';
COMMENT ON COLUMN tasks.reminder_notify_at IS 'UTC timestamp when reminder notification should be sent (null = no notification)';
COMMENT ON INDEX idx_tasks_reminder_notify_at IS 'Partial index for efficient querying of reminders due for notification';