-- Enforce jobs.lead_id NOT NULL constraint and add proper foreign key
-- This script MUST be run after 03_backfill_orphaned_jobs.sql
-- It will ABORT if any orphaned jobs still exist
-- VERIFIED PRODUCTION SCHEMA
-- Uses schema-qualified information_schema filtering to avoid cross-schema conflicts

-- VERIFIED SCHEMA REFERENCES:
-- jobs: id (uuid), business_id (uuid), title (text), customer_name (text), customer_phone (text),
--      service_address (text), notes (text), scheduled_date (date), scheduled_time (time),
--      status (job_status enum), lead_id (uuid), conversation_id (uuid), source (text),
--      payment_status (text), created_at (timestamptz), updated_at (timestamptz)
-- leads: id (uuid), business_id (uuid), phone (text), name (text), email (text),
--       source (text), status (text), lead_status (text), raw_metadata (jsonb),
--       created_at (timestamptz), updated_at (timestamptz), last_message_at (timestamptz)
-- conversations: id (uuid), lead_id (uuid), business_id (uuid), call_sid (text),
--               ai_call_session_id (uuid), status (text), created_at (timestamptz), updated_at (timestamptz)
-- UNIQUE constraint: conversations_business_lead_unique on (business_id, lead_id)

BEGIN;

-- Step 1: Verify zero orphaned jobs exist (ABORT if count > 0)
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM jobs WHERE lead_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce NOT NULL constraint: % orphaned jobs still exist. Run 03_backfill_orphaned_jobs.sql first.', orphan_count;
  END IF;
  RAISE NOTICE 'Verified: 0 orphaned jobs found. Proceeding with constraint enforcement.';
END $$;

-- Step 2: Inspect existing foreign keys on jobs.lead_id (schema-qualified)
SELECT 
  'EXISTING FOREIGN KEYS ON jobs.lead_id' as inspection,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_schema = current_schema()
  AND tc.table_name = 'jobs'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'lead_id';

-- Step 3: Drop existing foreign key if it exists (schema-qualified)
-- The original constraint from create_jobs_table.sql uses ON DELETE SET NULL
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_schema = current_schema()
    AND tc.table_name = 'jobs'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'lead_id';
  
  IF fk_name IS NOT NULL THEN
    RAISE NOTICE 'Dropping existing foreign key: %', fk_name;
    EXECUTE format('ALTER TABLE jobs DROP CONSTRAINT %I', fk_name);
  ELSE
    RAISE NOTICE 'No existing foreign key found on jobs.lead_id';
  END IF;
END $$;

-- Step 4: Add NOT NULL constraint to lead_id
ALTER TABLE jobs 
ALTER COLUMN lead_id SET NOT NULL;

-- Verify NOT NULL constraint (schema-qualified)
SELECT 
  'NOT NULL CONSTRAINT ADDED' as verification,
  column_name, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = 'jobs' 
  AND column_name = 'lead_id';

-- Step 5: Add foreign key with ON DELETE RESTRICT
-- This prevents accidental deletion of leads that have jobs
ALTER TABLE jobs 
ADD CONSTRAINT jobs_lead_id_fkey 
FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE RESTRICT;

-- Verify foreign key constraint (schema-qualified)
SELECT 
  'FOREIGN KEY CONSTRAINT ADDED' as verification,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_schema = current_schema()
  AND tc.table_name = 'jobs'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'lead_id';

-- Step 6: Final verification - confirm all jobs have lead_id
SELECT 
  'FINAL VERIFICATION' as verification,
  'Total jobs' as metric,
  COUNT(*) as value
FROM jobs

UNION ALL

SELECT 
  'FINAL VERIFICATION' as verification,
  'Jobs with lead_id' as metric,
  COUNT(*) as value
FROM jobs
WHERE lead_id IS NOT NULL

UNION ALL

SELECT 
  'FINAL VERIFICATION' as verification,
  'Jobs without lead_id (should be 0)' as metric,
  COUNT(*) as value
FROM jobs
WHERE lead_id IS NULL;

-- Step 7: Verify foreign key behavior (test that it prevents deletion)
-- This is a read-only test - it doesn't actually delete anything
SELECT 
  'FOREIGN KEY BEHAVIOR TEST' as test,
  'ON DELETE RESTRICT prevents lead deletion when jobs exist' as description,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = current_schema()
        AND tc.table_name = 'jobs'
        AND kcu.column_name = 'lead_id'
        AND rc.delete_rule = 'RESTRICT'
    ) THEN 'PASS: RESTRICT rule is in place'
    ELSE 'FAIL: RESTRICT rule not found'
  END as result
FROM information_schema.key_column_usage kcu
WHERE kcu.table_schema = current_schema()
  AND kcu.table_name = 'jobs' 
  AND kcu.column_name = 'lead_id'
LIMIT 1;

-- Step 8: Verify no duplicate equivalent foreign keys exist
SELECT 
  'DUPLICATE FOREIGN KEY CHECK' as check_type,
  COUNT(*) as foreign_key_count
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
JOIN information_schema.referential_constraints rc 
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_schema = current_schema()
  AND tc.table_name = 'jobs'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'lead_id'
  AND ccu.table_name = 'leads'
  AND ccu.column_name = 'id';

COMMIT;
