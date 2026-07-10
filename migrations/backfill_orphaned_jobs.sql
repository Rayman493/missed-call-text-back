-- Backfill lead_id for orphaned jobs
-- This script safely backfills lead_id for jobs that have lead_id IS NULL
-- Matching is done by normalized phone number within the same business

-- IMPORTANT: Run identify_orphaned_jobs.sql first to review the data
-- This migration should be run in a transaction and reviewed before execution

BEGIN;

-- Step 1: Create a temporary table to store the proposed matches
CREATE TEMPORARY TABLE job_lead_matches AS
SELECT 
  j.id as job_id,
  l.id as proposed_lead_id,
  j.business_id,
  j.customer_phone as job_phone,
  l.phone as lead_phone,
  -- Use a simple match score: 1 for exact phone match
  1 as match_score,
  NOW() as matched_at
FROM jobs j
INNER JOIN leads l ON 
  j.business_id = l.business_id AND
  REGEXP_REPLACE(j.customer_phone, '[^0-9]', '') = REGEXP_REPLACE(l.phone, '[^0-9]', '')
WHERE j.lead_id IS NULL
  AND l.deleted_at IS NULL
  -- Only match if there's exactly one lead with this phone (avoid ambiguity)
  AND l.id IN (
    SELECT l2.id
    FROM leads l2
    WHERE l2.business_id = j.business_id
      AND REGEXP_REPLACE(j.customer_phone, '[^0-9]', '') = REGEXP_REPLACE(l2.phone, '[^0-9]', '')
      AND l2.deleted_at IS NULL
    GROUP BY REGEXP_REPLACE(l2.phone, '[^0-9]', '')
    HAVING COUNT(*) = 1
  );

-- Step 2: Review the matches before applying
SELECT * FROM job_lead_matches ORDER BY job_id LIMIT 100;

-- Step 3: Apply the backfill for unambiguous matches
UPDATE jobs
SET lead_id = job_lead_matches.proposed_lead_id,
    updated_at = NOW()
FROM job_lead_matches
WHERE jobs.id = job_lead_matches.job_id;

-- Step 4: Verify the backfill
SELECT COUNT(*) as backfilled_count
FROM jobs
WHERE lead_id IS NOT NULL
  AND id IN (SELECT job_id FROM job_lead_matches);

-- Step 5: Create manual leads for unmatched orphaned jobs
-- This creates a new lead for each orphaned job that couldn't be matched
INSERT INTO leads (
  business_id,
  customer_name,
  phone,
  status,
  source,
  created_at,
  updated_at
)
SELECT 
  j.business_id,
  COALESCE(j.customer_name, 'Unknown Customer') as customer_name,
  j.customer_phone as phone,
  'manual' as status,
  'manual_backfill' as source,
  j.created_at,
  NOW()
FROM jobs j
WHERE j.lead_id IS NULL
  AND j.customer_phone IS NOT NULL
  AND j.customer_phone != ''
  AND j.id NOT IN (SELECT job_id FROM job_lead_matches)
ON CONFLICT (business_id, phone) DO NOTHING;

-- Step 6: Link the newly created leads to the orphaned jobs
UPDATE jobs
SET lead_id = l.id,
    updated_at = NOW()
FROM jobs j
INNER JOIN leads l ON
  j.business_id = l.business_id AND
  REGEXP_REPLACE(j.customer_phone, '[^0-9]', '') = REGEXP_REPLACE(l.phone, '[^0-9]', '')
WHERE j.lead_id IS NULL
  AND j.customer_phone IS NOT NULL
  AND j.customer_phone != ''
  AND l.source = 'manual_backfill'
  AND j.id NOT IN (SELECT job_id FROM job_lead_matches);

-- Step 7: Create conversations for the newly created leads
-- This ensures each lead has a canonical conversation
INSERT INTO conversations (
  business_id,
  lead_id,
  phone_number,
  direction,
  status,
  created_at,
  updated_at
)
SELECT 
  l.business_id,
  l.id,
  l.phone,
  'inbound',
  'active',
  l.created_at,
  NOW()
FROM leads l
WHERE l.source = 'manual_backfill'
  AND NOT EXISTS (
    SELECT 1 FROM conversations c 
    WHERE c.lead_id = l.id
  );

-- Step 8: Final verification - count remaining orphaned jobs
SELECT 
  COUNT(*) as remaining_orphaned_jobs,
  COUNT(CASE WHEN customer_phone IS NULL OR customer_phone = '' THEN 1 END) as jobs_without_phone
FROM jobs
WHERE lead_id IS NULL;

-- Step 9: Show sample of any remaining orphaned jobs
SELECT 
  id,
  business_id,
  title,
  customer_name,
  customer_phone,
  scheduled_date,
  status,
  created_at
FROM jobs
WHERE lead_id IS NULL
ORDER BY created_at DESC
LIMIT 20;

-- Clean up temporary table
DROP TABLE IF EXISTS job_lead_matches;

COMMIT;

-- After successful migration, consider adding NOT NULL constraint:
-- ALTER TABLE jobs ALTER COLUMN lead_id SET NOT NULL;
-- ALTER TABLE jobs ADD CONSTRAINT jobs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
