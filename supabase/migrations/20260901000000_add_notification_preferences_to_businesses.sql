-- Add notification_preferences column to businesses table
-- Stores user's notification preference settings as JSONB
-- Missing keys resolve to TRUE (notifications enabled by default)
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}'::jsonb;

-- Add comment
COMMENT ON COLUMN businesses.notification_preferences IS 'Notification preferences as JSONB. Keys: new_ai_intake, customer_reply, payment_requested, payment_completed, calendar_connected, appointment_created, personal_voicemail. Missing keys default to TRUE (enabled).';