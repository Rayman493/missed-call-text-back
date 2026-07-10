-- Backfill orphaned jobs with lead_id
-- This script modifies data - run 01_identify_orphaned_jobs.sql and 02_preview_orphaned_job_backfill.sql first
-- VERIFIED PRODUCTION SCHEMA
-- DETERMINISTIC MAPPING: Uses writable CTE with INSERT ... RETURNING to capture exact newly created lead IDs

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

WITH 
-- Step 1: Identify all orphaned jobs with normalized phone and validity
orphaned_jobs AS (
  SELECT 
    id,
    business_id,
    title,
    customer_name,
    customer_phone,
    service_address,
    notes,
    scheduled_date,
    scheduled_time,
    status,
    conversation_id,
    source,
    payment_status,
    created_at,
    updated_at,
    REGEXP_REPLACE(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') as normalized_phone,
    CASE 
      WHEN LENGTH(REGEXP_REPLACE(COALESCE(customer_phone, ''), '[^0-9]', '', 'g')) >= 10
        AND LOWER(TRIM(COALESCE(customer_phone, ''))) NOT IN ('', 'n/a', 'unknown')
      THEN true
      ELSE false
    END as has_valid_phone
  FROM jobs
  WHERE lead_id IS NULL
),

-- Step 2: Identify active leads with normalized phone
-- Note: leads table uses 'phone' column, not 'caller_phone'
-- Note: leads table does NOT have deleted_at column (soft delete not implemented)
active_leads AS (
  SELECT 
    id,
    business_id,
    phone,
    name,
    email,
    source,
    status,
    lead_status,
    raw_metadata,
    created_at,
    updated_at,
    last_message_at,
    REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') as normalized_phone
  FROM leads
),

-- Step 3: Group leads by business_id + normalized_phone
lead_phone_groups AS (
  SELECT 
    business_id,
    normalized_phone,
    COUNT(*) as matching_lead_count,
    ARRAY_AGG(id ORDER BY created_at) as matching_lead_ids,
    CASE 
      WHEN COUNT(*) = 1 THEN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
          FROM active_leads al2
          WHERE al2.business_id = active_leads.business_id
            AND al2.normalized_phone = active_leads.normalized_phone
        ) ranked
        WHERE rn = 1
      )
      ELSE NULL
    END as sole_lead_id
  FROM active_leads
  GROUP BY business_id, normalized_phone
),

-- Step 4: Classify each orphaned job
classified_jobs AS (
  SELECT 
    oj.id,
    oj.business_id,
    oj.title,
    oj.customer_name,
    oj.customer_phone,
    oj.normalized_phone,
    oj.has_valid_phone,
    oj.created_at,
    CASE 
      WHEN NOT oj.has_valid_phone THEN 'invalid_phone'
      WHEN NOT EXISTS (
        SELECT 1 FROM lead_phone_groups lpg
        WHERE lpg.business_id = oj.business_id
          AND lpg.normalized_phone = oj.normalized_phone
      ) THEN 'no_match'
      WHEN EXISTS (
        SELECT 1 FROM lead_phone_groups lpg
        WHERE lpg.business_id = oj.business_id
          AND lpg.normalized_phone = oj.normalized_phone
          AND lpg.matching_lead_count = 1
      ) THEN 'unique_match'
      ELSE 'ambiguous_match'
    END as match_class,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM lead_phone_groups lpg
        WHERE lpg.business_id = oj.business_id
          AND lpg.normalized_phone = oj.normalized_phone
          AND lpg.matching_lead_count = 1
      ) THEN (
        SELECT lpg.sole_lead_id FROM lead_phone_groups lpg
        WHERE lpg.business_id = oj.business_id
          AND lpg.normalized_phone = oj.normalized_phone
          AND lpg.matching_lead_count = 1
      )
      ELSE NULL
    END as proposed_lead_id,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM lead_phone_groups lpg
        WHERE lpg.business_id = oj.business_id
          AND lpg.normalized_phone = oj.normalized_phone
      ) THEN (
        SELECT lpg.matching_lead_count FROM lead_phone_groups lpg
        WHERE lpg.business_id = oj.business_id
          AND lpg.normalized_phone = oj.normalized_phone
      )
      ELSE 0
    END as matching_lead_count
  FROM orphaned_jobs oj
),

-- Step 5: Reconciliation guard - abort if classification fails
reconciliation_check AS (
  SELECT 
    (SELECT COUNT(*) FROM orphaned_jobs) as total_orphans,
    (SELECT COUNT(*) FROM classified_jobs) as classified_total,
    (SELECT COUNT(*) FROM orphaned_jobs) - (SELECT COUNT(*) FROM classified_jobs) as difference
)

-- Step 6: Verify reconciliation before proceeding
SELECT 
  'RECONCILIATION CHECK' as report_type,
  'total_orphans' as metric,
  total_orphans as value
FROM reconciliation_check

UNION ALL

SELECT 
  'RECONCILIATION CHECK' as report_type,
  'classified_total' as metric,
  classified_total as value
FROM reconciliation_check

UNION ALL

SELECT 
  'RECONCILIATION CHECK' as report_type,
  'difference' as metric,
  difference as value
FROM reconciliation_check;

-- Abort if reconciliation fails
DO $$
DECLARE
  rec_check RECORD;
BEGIN
  SELECT * INTO rec_check FROM reconciliation_check;
  IF rec_check.difference != 0 THEN
    RAISE EXCEPTION 'Classification reconciliation failed: difference = %. Aborting migration.', rec_check.difference;
  END IF;
  RAISE NOTICE 'Reconciliation check passed: % orphans classified.', rec_check.classified_total;
END $$;

-- Step 7: Create temporary table for new leads to create (deterministic representative values)
CREATE TEMPORARY TABLE new_leads_to_create AS
SELECT 
  business_id,
  normalized_phone,
  (SELECT customer_name FROM classified_jobs cj2 
   WHERE cj2.business_id = cj.business_id 
     AND cj2.normalized_phone = cj.normalized_phone 
   ORDER BY cj2.created_at ASC 
   LIMIT 1) as representative_customer_name,
  (SELECT customer_phone FROM classified_jobs cj2 
   WHERE cj2.business_id = cj.business_id 
     AND cj2.normalized_phone = cj.normalized_phone 
   ORDER BY cj2.created_at ASC 
   LIMIT 1) as representative_original_phone,
  COUNT(*) as job_count,
  ARRAY_AGG(id ORDER BY created_at) as job_ids
FROM classified_jobs cj
WHERE match_class = 'no_match'
GROUP BY business_id, normalized_phone;

-- Step 8: Link jobs to existing leads (unique matches)
UPDATE jobs AS j
SET lead_id = cj.proposed_lead_id,
    updated_at = NOW()
FROM classified_jobs cj
WHERE j.id = cj.id
  AND cj.match_class = 'unique_match';

-- Verify unique match backfill
SELECT 
  'BACKFILL: JOBS LINKED TO EXISTING LEADS' as report_type,
  COUNT(*) as count
FROM jobs
WHERE lead_id IS NOT NULL
  AND id IN (SELECT id FROM classified_jobs WHERE match_class = 'unique_match');

-- Step 9: Create new leads using writable CTE with RETURNING
WITH inserted_leads AS (
  INSERT INTO leads (
    business_id,
    phone,
    name,
    source,
    status,
    lead_status,
    raw_metadata,
    created_at,
    updated_at
  )
  SELECT 
    business_id,
    representative_original_phone as phone,
    representative_customer_name as name,
    'manual' as source,
    'new' as status,
    'new' as lead_status,
    jsonb_build_object(
      'source', 'manual_backfill',
      'extracted_info', jsonb_build_object(
        'callerName', representative_customer_name,
        'reasonForCalling', NULL,
        'addressOrLocation', NULL,
        'desiredCompletionTime', NULL,
        'preferredCallbackTime', NULL,
        'importantDetails', 'Backfilled from orphaned job'
      )
    ) as raw_metadata,
    NOW() as created_at,
    NOW() as updated_at
  FROM new_leads_to_create
  RETURNING id, business_id, phone
)
-- Step 10: Capture inserted lead IDs into temp table with deterministic mapping
CREATE TEMPORARY TABLE newly_created_leads AS
SELECT 
  nl.business_id,
  nl.normalized_phone,
  il.id as new_lead_id
FROM new_leads_to_create nl
INNER JOIN inserted_leads il 
  ON nl.business_id = il.business_id 
  AND nl.normalized_phone = REGEXP_REPLACE(COALESCE(il.phone, ''), '[^0-9]', '', 'g');

-- Verify new lead creation
SELECT 
  'BACKFILL: NEW LEADS CREATED' as report_type,
  COUNT(*) as count
FROM newly_created_leads;

-- Step 11: Link jobs to newly created leads using deterministic mapping
UPDATE jobs AS j
SET lead_id = ncl.new_lead_id,
    updated_at = NOW()
FROM new_leads_to_create nl
INNER JOIN newly_created_leads ncl 
  ON nl.business_id = ncl.business_id 
  AND nl.normalized_phone = ncl.normalized_phone
WHERE j.id = ANY(nl.job_ids);

-- Verify new lead backfill
SELECT 
  'BACKFILL: JOBS LINKED TO NEW LEADS' as report_type,
  COUNT(*) as count
FROM jobs
WHERE lead_id IS NOT NULL
  AND id IN (SELECT unnest(job_ids) FROM new_leads_to_create);

-- Step 12: Create canonical conversations for newly created leads
INSERT INTO conversations (
  lead_id,
  business_id,
  status,
  created_at,
  updated_at
)
SELECT 
  ncl.new_lead_id as lead_id,
  ncl.business_id,
  'active' as status,
  NOW() as created_at,
  NOW() as updated_at
FROM newly_created_leads ncl
WHERE NOT EXISTS (
  SELECT 1 FROM conversations c 
  WHERE c.lead_id = ncl.new_lead_id
)
ON CONFLICT (business_id, lead_id) DO NOTHING;

-- Step 13: Update leads that now have conversations (for tracking purposes)
-- Note: leads table does not have conversation_id column, so we skip this step

-- Step 14: Create canonical conversations for existing leads that lack them
-- (for jobs linked to existing leads in unique_match)
INSERT INTO conversations (
  lead_id,
  business_id,
  status,
  created_at,
  updated_at
)
SELECT 
  cj.proposed_lead_id as lead_id,
  cj.business_id,
  'active' as status,
  al.created_at as created_at,
  al.updated_at as updated_at
FROM classified_jobs cj
INNER JOIN active_leads al ON al.id = cj.proposed_lead_id
WHERE cj.match_class = 'unique_match'
  AND NOT EXISTS (
    SELECT 1 FROM conversations c 
    WHERE c.lead_id = cj.proposed_lead_id
  )
ON CONFLICT (business_id, lead_id) DO NOTHING;

-- Step 15: Update jobs.conversation_id for all backfilled jobs
UPDATE jobs AS j
SET conversation_id = c.id
FROM leads l
INNER JOIN conversations c ON c.lead_id = l.id
WHERE j.lead_id = l.id
  AND c.lead_id = l.id
  AND j.conversation_id IS NULL;

-- Verify conversation updates
SELECT 
  'BACKFILL: CONVERSATIONS CREATED/UPDATED' as report_type,
  COUNT(*) as count
FROM conversations c
WHERE c.lead_id IN (
  SELECT new_lead_id FROM newly_created_leads
  UNION
  SELECT proposed_lead_id FROM classified_jobs WHERE match_class = 'unique_match'
);

-- Step 16: Count remaining orphaned jobs (should be ambiguous + invalid-phone only)
SELECT 
  'REMAINING ORPHANED JOBS (MANUAL REVIEW)' as report_type,
  COUNT(*) as count
FROM jobs
WHERE lead_id IS NULL;

-- Step 17: Show remaining orphaned jobs by classification
SELECT 
  'REMAINING ORPHANED JOBS BY CLASS' as report_type,
  'invalid_phone' as class,
  COUNT(*) as count
FROM jobs
WHERE lead_id IS NULL
  AND id IN (SELECT id FROM classified_jobs WHERE match_class = 'invalid_phone')

UNION ALL

SELECT 
  'REMAINING ORPHANED JOBS BY CLASS' as report_type,
  'ambiguous_match' as class,
  COUNT(*) as count
FROM jobs
WHERE lead_id IS NULL
  AND id IN (SELECT id FROM classified_jobs WHERE match_class = 'ambiguous_match');

-- Step 18: Show remaining orphaned jobs for manual review
SELECT 
  'REMAINING ORPHANED JOBS DETAILS' as report_type,
  id,
  business_id,
  title,
  customer_name,
  customer_phone,
  normalized_phone,
  CASE 
    WHEN id IN (SELECT id FROM classified_jobs WHERE match_class = 'invalid_phone')
    THEN 'invalid_phone'
    WHEN id IN (SELECT id FROM classified_jobs WHERE match_class = 'ambiguous_match')
    THEN 'ambiguous_match'
    ELSE 'unknown'
  END as reason,
  created_at
FROM jobs
WHERE lead_id IS NULL
ORDER BY created_at DESC;

-- Step 19: Show ambiguous matches specifically
SELECT 
  'AMBIGUOUS MATCH DETAILS' as report_type,
  cj.id as job_id,
  cj.business_id,
  cj.customer_name,
  cj.customer_phone,
  cj.normalized_phone,
  cj.matching_lead_count,
  lpg.matching_lead_ids
FROM classified_jobs cj
INNER JOIN lead_phone_groups lpg 
  ON lpg.business_id = cj.business_id 
  AND lpg.normalized_phone = cj.normalized_phone
WHERE cj.match_class = 'ambiguous_match'
  AND cj.id IN (SELECT id FROM jobs WHERE lead_id IS NULL)
ORDER BY cj.matching_lead_count DESC, cj.created_at DESC;

-- Clean up temporary tables
DROP TABLE IF EXISTS new_leads_to_create;
DROP TABLE IF EXISTS newly_created_leads;

-- Final verification
SELECT 
  'FINAL VERIFICATION' as report_type,
  'Total orphaned jobs remaining' as metric,
  COUNT(*) as value
FROM jobs
WHERE lead_id IS NULL;

-- Commit the transaction
-- Note: Ambiguous and invalid-phone jobs remain for manual review
COMMIT;
