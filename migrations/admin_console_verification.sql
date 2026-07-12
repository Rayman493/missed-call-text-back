-- Admin Console Data Verification Queries
-- Run these in Supabase SQL Editor to verify the admin console is correctly wired to production data

-- 1. Total businesses (should match Active Businesses metric)
SELECT COUNT(*) as total_businesses
FROM businesses
WHERE deleted_at IS NULL;

-- 2. Newest businesses (should match Recent Businesses list)
SELECT 
  id,
  business_name,
  business_phone,
  twilio_phone_number,
  subscription_status,
  onboarding_status,
  created_at
FROM businesses
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20;

-- 3. Subscription status distribution
SELECT 
  subscription_status,
  COUNT(*) as count
FROM businesses
WHERE deleted_at IS NULL
GROUP BY subscription_status
ORDER BY count DESC;

-- 4. Forwarding verification distribution
SELECT 
  forwarding_verified,
  COUNT(*) as count
FROM businesses
WHERE deleted_at IS NULL
GROUP BY forwarding_verified;

-- 5. Provisioning status distribution
SELECT 
  provisioning_status,
  COUNT(*) as count
FROM businesses
WHERE deleted_at IS NULL
GROUP BY provisioning_status
ORDER BY count DESC;

-- 6. Assigned Twilio numbers
SELECT 
  id,
  business_name,
  twilio_phone_number,
  twilio_phone_number_sid,
  messaging_service_sid,
  a2p_status
FROM businesses
WHERE deleted_at IS NULL
  AND twilio_phone_number IS NOT NULL
ORDER BY created_at DESC;

-- 7. Businesses with owner/user references
SELECT 
  b.id,
  b.business_name,
  b.user_id,
  u.email as owner_email
FROM businesses b
LEFT JOIN auth.users u ON b.user_id = u.id
WHERE b.deleted_at IS NULL
ORDER BY b.created_at DESC
LIMIT 20;

-- 8. Recent AI calls (last 24 hours)
SELECT 
  id,
  phone_number,
  ai_call_status,
  ai_call_sid,
  created_at
FROM leads
WHERE deleted_at IS NULL
  AND ai_call_status IS NOT NULL
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 9. Recent AI call failures (last 24 hours)
SELECT 
  COUNT(*) as ai_failure_count
FROM leads
WHERE deleted_at IS NULL
  AND ai_call_status NOT IN ('completed', 'pending')
  AND created_at >= NOW() - INTERVAL '24 hours';

-- 10. Recent SMS failures (last 24 hours)
SELECT 
  COUNT(*) as sms_failure_count
FROM messages
WHERE deleted_at IS NULL
  AND status IN ('failed', 'undelivered')
  AND created_at >= NOW() - INTERVAL '24 hours';

-- 11. Recent personal voicemails (last 24 hours)
SELECT 
  id,
  recording_sid,
  transcription_status,
  processing_error,
  created_at
FROM personal_voicemails
WHERE deleted_at IS NULL
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 12. Voicemail processing failures (stuck > 24 hours)
SELECT 
  COUNT(*) as voicemail_failure_count
FROM personal_voicemails
WHERE deleted_at IS NULL
  AND transcription_text IS NULL
  AND processing_error IS NULL
  AND created_at < NOW() - INTERVAL '24 hours';

-- 13. Trials expiring in 7 days
SELECT 
  id,
  business_name,
  trial_end_date,
  subscription_status
FROM businesses
WHERE deleted_at IS NULL
  AND subscription_status = 'trialing'
  AND trial_end_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY trial_end_date ASC;

-- 14. Onboarding incomplete (> 24 hours old)
SELECT 
  id,
  business_name,
  onboarding_status,
  created_at
FROM businesses
WHERE deleted_at IS NULL
  AND onboarding_status NOT IN ('completed', 'forwarding_verified')
  AND created_at < NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- 15. Provisioning failures
SELECT 
  id,
  business_name,
  provisioning_status,
  created_at
FROM businesses
WHERE deleted_at IS NULL
  AND provisioning_status = 'failed'
ORDER BY created_at DESC;

-- 16. Billing issues (past_due or trial expiring soon)
SELECT 
  id,
  business_name,
  subscription_status,
  trial_end_date,
  current_period_end
FROM businesses
WHERE deleted_at IS NULL
  AND (
    subscription_status = 'past_due'
    OR (subscription_status = 'trialing' AND trial_end_date < NOW() + INTERVAL '3 days')
  )
ORDER BY created_at DESC;

-- 17. Search by business name (Testing)
SELECT *
FROM businesses
WHERE deleted_at IS NULL
  AND business_name ILIKE '%Testing%';

-- 18. Search by business name (ReplyFlowHQ Admin)
SELECT *
FROM businesses
WHERE deleted_at IS NULL
  AND business_name ILIKE '%ReplyFlowHQ%';

-- 19. Search by business phone (replace with actual phone number)
SELECT *
FROM businesses
WHERE deleted_at IS NULL
  AND business_phone ILIKE '%YOUR_PHONE%';

-- 20. Search by Twilio phone number (replace with actual Twilio number)
SELECT *
FROM businesses
WHERE deleted_at IS NULL
  AND twilio_phone_number ILIKE '%YOUR_TWILIO_NUMBER%';
