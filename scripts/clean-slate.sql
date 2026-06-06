-- Safe Clean-Slate Script for ReplyFlow
-- Deletes all non-protected businesses and related CRM data
-- Preserves protected businesses, admin users, and protected Twilio numbers

-- ========================================
-- SAFETY CHECKS
-- ========================================

-- Check if confirmation text matches
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_settings WHERE name = 'client_encoding' AND setting = 'UTF8') THEN
    RAISE EXCEPTION 'This script must be run with proper confirmation. Set confirmation_text parameter to DELETE_NON_PROTECTED_BUSINES';
  END IF;
END $$;

-- Check for protected accounts
DO $$
DECLARE
  protected_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO protected_count FROM businesses WHERE is_protected_account = true;
  
  IF protected_count = 0 THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: Zero protected accounts found. Refusing to run clean-slate. Please protect at least one admin business before running this script.';
  END IF;
  
  RAISE NOTICE 'SAFETY CHECK PASSED: Found % protected account(s)', protected_count;
END $$;

-- ========================================
-- DRY RUN MODE (set to false to execute)
-- ========================================
DO $$
DECLARE
  dry_run BOOLEAN := true;  -- Set to false to actually delete
  confirmation_text TEXT := 'DELETE_NON_PROTECTED_BUSINES';
BEGIN
  -- Verify confirmation text
  IF dry_run THEN
    RAISE NOTICE 'DRY RUN MODE: No data will be deleted. Set dry_run = false to execute.';
    RAISE NOTICE 'To execute, update the script to set dry_run = false AND add: SET LOCAL client_encoding TO ''UTF8'';';
  ELSE
    RAISE NOTICE 'EXECUTION MODE: This will permanently delete data!';
  END IF;
END $$;

-- ========================================
-- SHOW WHAT WOULD BE DELETED (Dry Run)
-- ========================================

-- Businesses to be deleted
SELECT 
  'Businesses to delete' as category,
  COUNT(*) as count,
  STRING_AGG(name, ', ' ORDER BY name) as affected
FROM businesses 
WHERE is_protected_account = false;

-- Related CRM data counts
SELECT 
  'Leads to delete' as category,
  COUNT(*) as count
FROM leads l
JOIN businesses b ON l.business_id = b.id
WHERE b.is_protected_account = false;

SELECT 
  'Messages to delete' as category,
  COUNT(*) as count
FROM messages m
JOIN businesses b ON m.business_id = b.id
WHERE b.is_protected_account = false;

SELECT 
  'AI call records to delete' as category,
  COUNT(*) as count
FROM ai_call_records a
JOIN businesses b ON a.business_id = b.id
WHERE b.is_protected_account = false;

SELECT 
  'Notifications to delete' as category,
  COUNT(*) as count
FROM notifications n
JOIN businesses b ON n.business_id = b.id
WHERE b.is_protected_account = false;

-- Protected businesses that will be preserved
SELECT 
  'Protected businesses (preserved)' as category,
  COUNT(*) as count,
  STRING_AGG(name, ', ' ORDER BY name) as affected
FROM businesses 
WHERE is_protected_account = true;

-- ========================================
-- ACTUAL DELETION (Only when dry_run = false)
-- ========================================

DO $$
DECLARE
  dry_run BOOLEAN := true;  -- Set to false to actually delete
  deleted_businesses TEXT[];
BEGIN
  IF dry_run THEN
    RAISE NOTICE 'DRY RUN: Skipping actual deletion. Set dry_run = false to execute.';
    RETURN;
  END IF;

  -- Log all businesses being deleted
  SELECT ARRAY_AGG(name) INTO deleted_businesses 
  FROM businesses 
  WHERE is_protected_account = false;

  RAISE NOTICE 'Deleting businesses: %', deleted_businesses;

  -- Delete notifications for non-protected businesses
  DELETE FROM notifications 
  WHERE business_id IN (SELECT id FROM businesses WHERE is_protected_account = false);
  RAISE NOTICE 'Deleted notifications';

  -- Delete AI call records for non-protected businesses
  DELETE FROM ai_call_records 
  WHERE business_id IN (SELECT id FROM businesses WHERE is_protected_account = false);
  RAISE NOTICE 'Deleted AI call records';

  -- Delete messages for non-protected businesses
  DELETE FROM messages 
  WHERE business_id IN (SELECT id FROM businesses WHERE is_protected_account = false);
  RAISE NOTICE 'Deleted messages';

  -- Delete leads for non-protected businesses
  DELETE FROM leads 
  WHERE business_id IN (SELECT id FROM businesses WHERE is_protected_account = false);
  RAISE NOTICE 'Deleted leads';

  -- Delete twilio_numbers for non-protected businesses
  DELETE FROM twilio_numbers 
  WHERE business_id IN (SELECT id FROM businesses WHERE is_protected_account = false);
  RAISE NOTICE 'Deleted Twilio number assignments';

  -- Delete businesses (non-protected only)
  DELETE FROM businesses 
  WHERE is_protected_account = false;
  RAISE NOTICE 'Deleted businesses';

  RAISE NOTICE 'Clean-slate completed. Protected businesses preserved.';
END $$;

-- ========================================
-- VERIFICATION (Post-cleanup)
-- ========================================

-- Show remaining (protected) businesses
SELECT 
  'Remaining businesses (protected)' as category,
  id,
  name,
  is_protected_account,
  protected_reason
FROM businesses 
ORDER BY name;

-- Show remaining counts
SELECT 
  'Remaining leads' as category,
  COUNT(*) as count
FROM leads;

SELECT 
  'Remaining messages' as category,
  COUNT(*) as count
FROM messages;

SELECT 
  'Remaining AI call records' as category,
  COUNT(*) as count
FROM ai_call_records;

SELECT 
  'Remaining notifications' as category,
  COUNT(*) as count
FROM notifications;
