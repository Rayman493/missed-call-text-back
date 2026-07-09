-- Add confirmation SMS tracking columns to jobs table
-- This allows businesses to manually send appointment confirmation texts
-- and track whether they've been sent to prevent duplicate sends

ALTER TABLE jobs
ADD COLUMN confirmation_sms_sent_at TIMESTAMPTZ NULL,
ADD COLUMN confirmation_sms_message_sid TEXT NULL;

-- Add comment to document the purpose
COMMENT ON COLUMN jobs.confirmation_sms_sent_at IS 'Timestamp when the appointment confirmation SMS was sent manually by the business';
COMMENT ON COLUMN jobs.confirmation_sms_message_sid IS 'Twilio message SID for the appointment confirmation SMS, if available';
