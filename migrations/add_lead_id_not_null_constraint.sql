-- Add NOT NULL constraint to jobs.lead_id
-- This migration should be run AFTER the backfill_orphaned_jobs migration
-- to ensure all existing jobs have a lead_id

BEGIN;

-- Step 1: Verify no orphaned jobs exist
SELECT COUNT(*) as orphaned_jobs_count
FROM jobs
WHERE lead_id IS NULL;

-- If the count is 0, proceed with adding the constraint
-- If the count is > 0, run backfill_orphaned_jobs.sql first

-- Step 2: Add NOT NULL constraint to lead_id
ALTER TABLE jobs 
ALTER COLUMN lead_id SET NOT NULL;

-- Step 3: Add foreign key constraint (if not already present)
-- This ensures referential integrity between jobs and leads
ALTER TABLE jobs 
ADD CONSTRAINT jobs_lead_id_fkey 
FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

-- Step 4: Verify the constraint was added
SELECT 
  column_name, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_name = 'jobs' 
  AND column_name = 'lead_id';

-- Step 5: Verify foreign key constraint was added
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'jobs'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'lead_id';

COMMIT;

-- Rollback script (if needed):
-- BEGIN;
-- ALTER TABLE jobs DROP CONSTRAINT jobs_lead_id_fkey;
-- ALTER TABLE jobs ALTER COLUMN lead_id DROP NOT NULL;
-- COMMIT;
