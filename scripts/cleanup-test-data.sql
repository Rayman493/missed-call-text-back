-- ===================================================================
-- ReplyFlow Test Data Cleanup Script
-- ===================================================================
-- PURPOSE: Safely delete test data while preserving production accounts
-- PRESERVE: 
--   1. Admin account/business
--   2. Test account for dragonmaster0102@gmail.com
-- 
-- WARNING: This script uses transactions and preview queries to prevent
-- accidental data loss. Review all outputs before executing the cleanup.
-- 
-- IMPORTANT: Deleting twilio_numbers DB rows does NOT release actual 
-- Twilio numbers from Twilio. You must separately release numbers from 
-- Twilio console if needed.
-- ===================================================================

-- ===================================================================
-- STEP 1: Identify Accounts to Preserve
-- ===================================================================

-- Identify the auth user id for dragonmaster0102@gmail.com
SELECT 
  id as auth_user_id,
  email,
  created_at
FROM auth.users 
WHERE email = 'dragonmaster0102@gmail.com';

-- Identify business for dragonmaster0102@gmail.com
SELECT 
  b.id as business_id,
  b.name as business_name,
  b.owner_id,
  u.email as owner_email
FROM businesses b
JOIN auth.users u ON b.owner_id = u.id
WHERE u.email = 'dragonmaster0102@gmail.com';

-- Identify admin business (usually first business or specific admin account)
-- Adjust the WHERE clause based on your admin identification criteria
SELECT 
  b.id as business_id,
  b.name as business_name,
  b.owner_id,
  u.email as owner_email,
  b.is_admin
FROM businesses b
JOIN auth.users u ON b.owner_id = u.id
WHERE b.is_admin = true
   OR u.email LIKE '%admin%'
   OR b.name LIKE '%admin%'
ORDER BY b.created_at ASC
LIMIT 1;

-- ===================================================================
-- STEP 2: Setup Temp Table for Preserve List
-- ===================================================================

-- CREATE TEMP TABLE preserve_businesses (id uuid PRIMARY KEY);
-- 
-- INSERT INTO preserve_businesses (id) VALUES 
--   ('<business_id_1>'),
--   ('<business_id_2>');
-- 
-- RAISE NOTICE 'Preserving business IDs: %', (SELECT id FROM preserve_businesses);

-- ===================================================================
-- STEP 3: Preview - Businesses to Delete
-- ===================================================================

-- Preview all businesses
SELECT 
  b.id as business_id,
  b.name as business_name,
  b.owner_id,
  u.email as owner_email,
  b.created_at,
  b.is_admin,
  CASE 
    WHEN b.id IN (SELECT id FROM preserve_businesses) THEN 'PRESERVE'
    ELSE 'DELETE'
  END as action
FROM businesses b
JOIN auth.users u ON b.owner_id = u.id
ORDER BY action DESC, b.created_at DESC;

-- Count businesses to delete
SELECT 
  COUNT(*) FILTER (WHERE id NOT IN (SELECT id FROM preserve_businesses)) as businesses_to_delete,
  COUNT(*) FILTER (WHERE id IN (SELECT id FROM preserve_businesses)) as businesses_to_preserve
FROM businesses;

-- ===================================================================
-- STEP 4: Preview - Dependent Data Counts
-- ===================================================================

-- Count dependent data for businesses to delete
SELECT 
  (SELECT COUNT(*) FROM conversations c WHERE c.business_id NOT IN (SELECT id FROM preserve_businesses)) as conversations,
  (SELECT COUNT(*) FROM messages m WHERE m.business_id NOT IN (SELECT id FROM preserve_businesses)) as messages,
  (SELECT COUNT(*) FROM message_media mm WHERE mm.message_id IN (SELECT m.id FROM messages m WHERE m.business_id NOT IN (SELECT id FROM preserve_businesses))) as message_media,
  (SELECT COUNT(*) FROM leads l WHERE l.business_id NOT IN (SELECT id FROM preserve_businesses)) as leads,
  (SELECT COUNT(*) FROM follow_up_jobs f WHERE f.business_id NOT IN (SELECT id FROM preserve_businesses)) as follow_up_jobs,
  (SELECT COUNT(*) FROM ai_call_records a WHERE a.business_id NOT IN (SELECT id FROM preserve_businesses)) as ai_call_records,
  (SELECT COUNT(*) FROM ai_call_sessions s WHERE s.business_id NOT IN (SELECT id FROM preserve_businesses)) as ai_call_sessions,
  (SELECT COUNT(*) FROM call_events e WHERE e.business_id NOT IN (SELECT id FROM preserve_businesses)) as call_events,
  (SELECT COUNT(*) FROM notifications n WHERE n.business_id NOT IN (SELECT id FROM preserve_businesses)) as notifications,
  (SELECT COUNT(*) FROM twilio_numbers t WHERE t.business_id NOT IN (SELECT id FROM preserve_businesses)) as twilio_numbers,
  (SELECT COUNT(*) FROM ignored_contacts i WHERE i.business_id NOT IN (SELECT id FROM preserve_businesses)) as ignored_contacts,
  (SELECT COUNT(*) FROM smart_filters sf WHERE sf.business_id NOT IN (SELECT id FROM preserve_businesses)) as smart_filters,
  (SELECT COUNT(*) FROM event_timeline et WHERE et.business_id NOT IN (SELECT id FROM preserve_businesses)) as event_timeline;

-- ===================================================================
-- STEP 5: Transaction-Based Cleanup Script
-- ===================================================================

-- BEGIN TRANSACTION;
-- SET LOCAL client_min_messages = 'WARNING';

-- Create temp table for preserve list
CREATE TEMP TABLE IF NOT EXISTS preserve_businesses (id uuid PRIMARY KEY);

-- Insert business IDs to preserve (REPLACE WITH ACTUAL IDs)
INSERT INTO preserve_businesses (id) VALUES 
  ('<business_id_1>'),
  ('<business_id_2>');

RAISE NOTICE 'Preserving business IDs: %', (SELECT id FROM preserve_businesses);

-- Delete dependent data in correct order (foreign key dependencies)

-- 1. Delete message media
DELETE FROM message_media 
WHERE message_id IN (
  SELECT m.id FROM messages m
  WHERE m.business_id NOT IN (SELECT id FROM preserve_businesses)
);

-- 2. Delete messages
DELETE FROM messages 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 3. Delete conversations
DELETE FROM conversations 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 4. Delete follow_up_jobs
DELETE FROM follow_up_jobs 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 5. Delete AI call records
DELETE FROM ai_call_records 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 6. Delete AI call sessions
DELETE FROM ai_call_sessions 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 7. Delete call events
DELETE FROM call_events 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 8. Delete notifications
DELETE FROM notifications 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 9. Delete smart filters
DELETE FROM smart_filters 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 10. Delete event timeline
DELETE FROM event_timeline 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 11. Delete ignored contacts
DELETE FROM ignored_contacts 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 12. Delete Twilio numbers
-- WARNING: This does NOT release actual Twilio numbers from Twilio
DELETE FROM twilio_numbers 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 13. Delete leads
DELETE FROM leads 
WHERE business_id NOT IN (SELECT id FROM preserve_businesses);

-- 14. Delete businesses
DELETE FROM businesses 
WHERE id NOT IN (SELECT id FROM preserve_businesses);

-- ===================================================================
-- STEP 6: Verification Queries (Before COMMIT)
-- ===================================================================

-- Verify only preserved businesses remain
SELECT 
  b.id as business_id,
  b.name as business_name,
  b.owner_id,
  u.email as owner_email,
  b.created_at
FROM businesses b
JOIN auth.users u ON b.owner_id = u.id
ORDER BY b.created_at DESC;

-- Verify dependent data counts
SELECT 
  (SELECT COUNT(*) FROM conversations) as conversations,
  (SELECT COUNT(*) FROM messages) as messages,
  (SELECT COUNT(*) FROM message_media) as message_media,
  (SELECT COUNT(*) FROM leads) as leads,
  (SELECT COUNT(*) FROM follow_up_jobs) as follow_up_jobs,
  (SELECT COUNT(*) FROM ai_call_records) as ai_call_records,
  (SELECT COUNT(*) FROM ai_call_sessions) as ai_call_sessions,
  (SELECT COUNT(*) FROM call_events) as call_events,
  (SELECT COUNT(*) FROM notifications) as notifications,
  (SELECT COUNT(*) FROM twilio_numbers) as twilio_numbers,
  (SELECT COUNT(*) FROM ignored_contacts) as ignored_contacts,
  (SELECT COUNT(*) FROM smart_filters) as smart_filters,
  (SELECT COUNT(*) FROM event_timeline) as event_timeline;

-- Verify auth users (should not be deleted)
SELECT 
  id,
  email,
  created_at
FROM auth.users
ORDER BY created_at DESC;

-- ===================================================================
-- STEP 7: Final Choice - COMMIT or ROLLBACK
-- ===================================================================

-- Review verification results above before committing.
-- If everything looks correct:
-- COMMIT;
-- RAISE NOTICE 'Cleanup completed successfully';

-- If anything looks wrong or you want to undo:
-- ROLLBACK;
-- RAISE NOTICE 'Cleanup rolled back - no changes were made';

-- ===================================================================
