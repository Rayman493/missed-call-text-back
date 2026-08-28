-- Fix notification type CHECK constraint to include all actively produced notification types
-- Historical drift: 20260604000000 added ai_intake_completed, but 20260628000000 reverted to missed_call-only behavior
-- Current application produces additional types: ai_intake_completed, payment_requested, payment_created, payment_completed, calendar_connected, calendar_disconnected, appointment_created, appointment_deleted, personal_voicemail
-- Legacy types (followup_sent, missed_call) retained for backward compatibility with historical rows
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN (
  'new_lead',
  'customer_reply',
  'followup_completed',
  'followup_sent',
  'forwarding_disconnected',
  'sms_failed',
  'trial_ending',
  'subscription_issue',
  'voicemail_received',
  'missed_call',
  'ai_intake_completed',
  'payment_requested',
  'payment_created',
  'payment_completed',
  'calendar_connected',
  'calendar_disconnected',
  'appointment_created',
  'appointment_deleted',
  'personal_voicemail'
));