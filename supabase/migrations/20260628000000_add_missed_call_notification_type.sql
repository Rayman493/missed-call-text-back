-- Add 'missed_call' to the notifications type check constraint
ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('new_lead', 'customer_reply', 'followup_completed', 'followup_sent', 'forwarding_disconnected', 'sms_failed', 'trial_ending', 'subscription_issue', 'voicemail_received', 'missed_call'));
