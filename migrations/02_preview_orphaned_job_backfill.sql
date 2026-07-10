-- Preview orphaned job backfill - shows exact changes without modifying data
-- This script performs NO modifications - only preview
-- Run after 01_identify_orphaned_jobs.sql
-- VERIFIED PRODUCTION SCHEMA
-- Uses ROLLBACK to ensure no persistent modifications

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
)

-- Step 5: Reconciliation summary
SELECT 
  'PREVIEW RECONCILIATION' as report_type,
  'total_orphans' as metric,
  (SELECT COUNT(*) FROM orphaned_jobs) as value

UNION ALL

SELECT 
  'PREVIEW RECONCILIATION' as report_type,
  'invalid_phone' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'invalid_phone') as value

UNION ALL

SELECT 
  'PREVIEW RECONCILIATION' as report_type,
  'unique_match' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'unique_match') as value

UNION ALL

SELECT 
  'PREVIEW RECONCILIATION' as report_type,
  'ambiguous_match' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'ambiguous_match') as value

UNION ALL

SELECT 
  'PREVIEW RECONCILIATION' as report_type,
  'no_match' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'no_match') as value

UNION ALL

SELECT 
  'PREVIEW RECONCILIATION' as report_type,
  'classified_total' as metric,
  (SELECT COUNT(*) FROM classified_jobs) as value

UNION ALL

SELECT 
  'PREVIEW RECONCILIATION' as report_type,
  'difference' as metric,
  (SELECT COUNT(*) FROM orphaned_jobs) - (SELECT COUNT(*) FROM classified_jobs) as value;

-- Step 6: Preview jobs to link to existing leads (unique matches)
SELECT 
  'PREVIEW: JOBS TO LINK TO EXISTING LEADS' as report_type,
  COUNT(*) as count
FROM classified_jobs
WHERE match_class = 'unique_match';

SELECT 
  'PREVIEW: SAMPLE JOBS TO LINK' as report_type,
  id as job_id,
  business_id,
  customer_name,
  customer_phone,
  normalized_phone,
  proposed_lead_id,
  created_at
FROM classified_jobs
WHERE match_class = 'unique_match'
ORDER BY created_at DESC
LIMIT 50;

-- Step 7: Preview new leads to create (grouped by business_id + normalized_phone)
SELECT 
  'PREVIEW: NEW LEADS TO CREATE' as report_type,
  COUNT(*) as count
FROM (
  SELECT DISTINCT business_id, normalized_phone
  FROM classified_jobs
  WHERE match_class = 'no_match'
) grouped;

SELECT 
  'PREVIEW: SAMPLE NEW LEADS' as report_type,
  business_id,
  normalized_phone,
  COUNT(*) as job_count,
  ARRAY_AGG(id ORDER BY created_at) as job_ids,
  (SELECT customer_name FROM classified_jobs cj2 
   WHERE cj2.business_id = cj.business_id 
     AND cj2.normalized_phone = cj.normalized_phone 
   ORDER BY cj2.created_at ASC 
   LIMIT 1) as representative_customer_name,
  (SELECT customer_phone FROM classified_jobs cj2 
   WHERE cj2.business_id = cj.business_id 
     AND cj2.normalized_phone = cj.normalized_phone 
   ORDER BY cj2.created_at ASC 
   LIMIT 1) as representative_original_phone
FROM classified_jobs cj
WHERE match_class = 'no_match'
GROUP BY business_id, normalized_phone
ORDER BY job_count DESC
LIMIT 50;

-- Step 8: Preview jobs that will attach to each new lead
SELECT 
  'PREVIEW: JOBS ATTACHING TO NEW LEADS' as report_type,
  business_id,
  normalized_phone,
  COUNT(*) as job_count,
  ARRAY_AGG(id ORDER BY created_at) as job_ids
FROM classified_jobs
WHERE match_class = 'no_match'
GROUP BY business_id, normalized_phone
ORDER BY job_count DESC
LIMIT 50;

-- Step 9: Preview ambiguous matches (manual review)
SELECT 
  'PREVIEW: JOBS WITH AMBIGUOUS MATCHES (MANUAL REVIEW)' as report_type,
  COUNT(*) as count
FROM classified_jobs
WHERE match_class = 'ambiguous_match';

SELECT 
  'PREVIEW: SAMPLE AMBIGUOUS JOBS' as report_type,
  id as job_id,
  business_id,
  customer_name,
  customer_phone,
  normalized_phone,
  matching_lead_count,
  created_at
FROM classified_jobs
WHERE match_class = 'ambiguous_match'
ORDER BY matching_lead_count DESC, created_at DESC
LIMIT 50;

SELECT 
  'PREVIEW: AMBIGUOUS MATCH DETAILS' as report_type,
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
ORDER BY cj.matching_lead_count DESC, cj.created_at DESC
LIMIT 50;

-- Step 10: Preview invalid phone jobs (manual review)
SELECT 
  'PREVIEW: JOBS WITHOUT VALID PHONE (MANUAL REVIEW)' as report_type,
  COUNT(*) as count
FROM classified_jobs
WHERE match_class = 'invalid_phone';

SELECT 
  'PREVIEW: SAMPLE INVALID-PHONE JOBS' as report_type,
  id as job_id,
  business_id,
  title,
  customer_name,
  customer_phone,
  normalized_phone,
  created_at
FROM classified_jobs
WHERE match_class = 'invalid_phone'
ORDER BY created_at DESC
LIMIT 50;

-- Step 11: Summary of all actions
SELECT 
  'PREVIEW SUMMARY' as report_type,
  'Jobs to link to existing leads' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'unique_match') as value

UNION ALL

SELECT 
  'PREVIEW SUMMARY' as report_type,
  'New leads to create' as metric,
  (SELECT COUNT(DISTINCT business_id || '|' || normalized_phone) FROM classified_jobs WHERE match_class = 'no_match') as value

UNION ALL

SELECT 
  'PREVIEW SUMMARY' as report_type,
  'Jobs to be linked to new leads' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'no_match') as value

UNION ALL

SELECT 
  'PREVIEW SUMMARY' as report_type,
  'Jobs with ambiguous matches (manual review)' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'ambiguous_match') as value

UNION ALL

SELECT 
  'PREVIEW SUMMARY' as report_type,
  'Jobs without valid phone (manual review)' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'invalid_phone') as value

UNION ALL

SELECT 
  'PREVIEW SUMMARY' as report_type,
  'Total orphaned jobs' as metric,
  (SELECT COUNT(*) FROM classified_jobs) as value

UNION ALL

SELECT 
  'PREVIEW SUMMARY' as report_type,
  'Jobs resolved by backfill' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class IN ('unique_match', 'no_match')) as value;

ROLLBACK;
