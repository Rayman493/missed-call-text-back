-- Identify orphaned jobs (jobs without lead_id)
-- This script performs NO modifications - only analysis
-- Run this first to understand the data before backfill
-- VERIFIED PRODUCTION SCHEMA

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

-- Phone normalization expression (used consistently):
-- REGEXP_REPLACE(COALESCE(value, ''), '[^0-9]', '', 'g')

-- Phone validity rule:
-- LENGTH(normalized_phone) >= 10
-- AND LOWER(TRIM(COALESCE(phone, ''))) NOT IN ('', 'n/a', 'unknown')

-- Classification model:
-- orphaned_jobs: all jobs where lead_id IS NULL with normalized_phone and validity
-- active_leads: non-deleted leads with normalized phone
-- lead_phone_groups: grouped by business_id + normalized_phone with counts
-- classified_jobs: one row per orphaned job with match_class

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
  'RECONCILIATION' as report_type,
  'total_orphans' as metric,
  (SELECT COUNT(*) FROM orphaned_jobs) as value

UNION ALL

SELECT 
  'RECONCILIATION' as report_type,
  'invalid_phone' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'invalid_phone') as value

UNION ALL

SELECT 
  'RECONCILIATION' as report_type,
  'unique_match' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'unique_match') as value

UNION ALL

SELECT 
  'RECONCILIATION' as report_type,
  'ambiguous_match' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'ambiguous_match') as value

UNION ALL

SELECT 
  'RECONCILIATION' as report_type,
  'no_match' as metric,
  (SELECT COUNT(*) FROM classified_jobs WHERE match_class = 'no_match') as value

UNION ALL

SELECT 
  'RECONCILIATION' as report_type,
  'classified_total' as metric,
  (SELECT COUNT(*) FROM classified_jobs) as value

UNION ALL

SELECT 
  'RECONCILIATION' as report_type,
  'difference' as metric,
  (SELECT COUNT(*) FROM orphaned_jobs) - (SELECT COUNT(*) FROM classified_jobs) as value;

-- Step 6: Detailed reports by business
SELECT 
  'ORPHANED JOBS BY BUSINESS' as report_type,
  business_id,
  COUNT(*) as orphaned_job_count
FROM classified_jobs
GROUP BY business_id
ORDER BY orphaned_job_count DESC;

-- Step 7: Sample orphaned jobs by classification
SELECT 
  'SAMPLE ORPHANED JOBS (INVALID PHONE)' as report_type,
  id,
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

SELECT 
  'SAMPLE ORPHANED JOBS (UNIQUE MATCH)' as report_type,
  id,
  business_id,
  title,
  customer_name,
  customer_phone,
  normalized_phone,
  proposed_lead_id,
  created_at
FROM classified_jobs
WHERE match_class = 'unique_match'
ORDER BY created_at DESC
LIMIT 50;

SELECT 
  'SAMPLE ORPHANED JOBS (AMBIGUOUS MATCH)' as report_type,
  id,
  business_id,
  title,
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
  'SAMPLE ORPHANED JOBS (NO MATCH)' as report_type,
  id,
  business_id,
  title,
  customer_name,
  customer_phone,
  normalized_phone,
  created_at
FROM classified_jobs
WHERE match_class = 'no_match'
ORDER BY created_at DESC
LIMIT 50;

-- Step 8: Ambiguous match details (for manual review)
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
ORDER BY cj.matching_lead_count DESC, cj.created_at DESC
LIMIT 50;

-- Step 9: Proposed new leads (grouped by business_id + normalized_phone)
SELECT 
  'PROPOSED NEW LEADS (GROUPED BY PHONE)' as report_type,
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
ORDER BY job_count DESC;

-- Step 10: Unique match details with lead information
SELECT 
  'UNIQUE MATCH DETAILS' as report_type,
  cj.id as job_id,
  cj.business_id,
  cj.customer_name as job_customer_name,
  cj.customer_phone as job_customer_phone,
  cj.normalized_phone,
  cj.proposed_lead_id,
  al.phone as lead_phone,
  al.name as lead_name,
  al.status as lead_status,
  al.lead_status as lead_lifecycle_status,
  al.raw_metadata->>'source' as lead_source
FROM classified_jobs cj
INNER JOIN active_leads al ON al.id = cj.proposed_lead_id
WHERE cj.match_class = 'unique_match'
ORDER BY cj.created_at DESC
LIMIT 50;
