-- Update reminder offset whitelist to match API and UI presets
-- Migration: 20260916000000_update_reminder_offset_constraint.sql
-- Purpose: Expand tasks.reminder_offset_minutes CHECK constraint to support all approved Reminder presets

-- Drop existing constraint if present
ALTER TABLE tasks
DROP CONSTRAINT IF EXISTS tasks_reminder_offset_minutes_check;

-- Add updated CHECK constraint for approved reminder offset values
-- null = no notification, 0 = at time, positive values = minutes before due time
ALTER TABLE tasks
ADD CONSTRAINT tasks_reminder_offset_minutes_check
CHECK (reminder_offset_minutes IS NULL OR reminder_offset_minutes IN (0, 5, 15, 30, 60, 120, 1440, 2880, 10080));

-- Update column comment to document valid values
COMMENT ON COLUMN tasks.reminder_offset_minutes IS 'Minutes before due time to send notification (null = no notification). Valid values: null, 0 (at time), 5, 15, 30, 60, 120, 1440 (1 day), 2880 (2 days), 10080 (1 week)';
