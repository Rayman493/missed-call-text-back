-- Identify orphaned jobs (jobs without lead_id)
-- This script finds all jobs that have lead_id IS NULL

-- Count orphaned jobs by business
SELECT 
  business_id,
  COUNT(*) as orphaned_job_count
FROM jobs
WHERE lead_id IS NULL
GROUP BY business_id
ORDER BY orphaned_job_count DESC;

-- Show sample orphaned jobs
SELECT 
  id,
  business_id,
  title,
  customer_name,
  customer_phone,
  service_address,
  scheduled_date,
  scheduled_time,
  status,
  source,
  created_at
FROM jobs
WHERE lead_id IS NULL
ORDER BY created_at DESC
LIMIT 50;

-- Check if any orphaned jobs can be matched to leads by phone number
-- This matches jobs to leads where normalized phone numbers match
SELECT 
  j.id as job_id,
  j.business_id,
  j.customer_name as job_customer_name,
  j.customer_phone as job_customer_phone,
  l.id as potential_lead_id,
  l.customer_name as lead_customer_name,
  l.phone as lead_phone,
  l.status as lead_status,
  l.source as lead_source
FROM jobs j
LEFT JOIN leads l ON 
  j.business_id = l.business_id AND
  REGEXP_REPLACE(j.customer_phone, '[^0-9]', '') = REGEXP_REPLACE(l.phone, '[^0-9]', '')
WHERE j.lead_id IS NULL
  AND l.id IS NOT NULL
  AND l.deleted_at IS NULL
ORDER BY j.created_at DESC
LIMIT 50;

-- Count potential matches
SELECT 
  COUNT(*) as jobs_with_potential_matches
FROM jobs j
LEFT JOIN leads l ON 
  j.business_id = l.business_id AND
  REGEXP_REPLACE(j.customer_phone, '[^0-9]', '') = REGEXP_REPLACE(l.phone, '[^0-9]', '')
WHERE j.lead_id IS NULL
  AND l.id IS NOT NULL
  AND l.deleted_at IS NULL;

-- Count jobs with no potential matches (will need manual lead creation)
SELECT 
  COUNT(*) as jobs_without_potential_matches
FROM jobs j
LEFT JOIN leads l ON 
  j.business_id = l.business_id AND
  REGEXP_REPLACE(j.customer_phone, '[^0-9]', '') = REGEXP_REPLACE(l.phone, '[^0-9]', '')
WHERE j.lead_id IS NULL
  AND l.id IS NULL;

-- Check for ambiguous matches (multiple leads with same phone number)
SELECT 
  j.id as job_id,
  j.customer_phone,
  COUNT(DISTINCT l.id) as matching_lead_count
FROM jobs j
LEFT JOIN leads l ON 
  j.business_id = l.business_id AND
  REGEXP_REPLACE(j.customer_phone, '[^0-9]', '') = REGEXP_REPLACE(l.phone, '[^0-9]', '')
WHERE j.lead_id IS NULL
  AND l.id IS NOT NULL
  AND l.deleted_at IS NULL
GROUP BY j.id, j.customer_phone
HAVING COUNT(DISTINCT l.id) > 1
ORDER BY matching_lead_count DESC;
