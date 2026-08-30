-- Add 'reminder' notification type for scheduled Reminder notifications
-- Migration: 20260916000000_add_reminder_notification_type.sql
-- This migration adds the 'reminder' type to the existing notification type constraint
-- All existing notification types are preserved

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
  'personal_voicemail',
  'reminder'
));