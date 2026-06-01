-- Fix phone number duplicates in leads table
-- This script normalizes existing phone numbers to E.164 format and removes duplicates

-- Step 1: Normalize existing phone numbers to E.164 format
UPDATE leads 
SET phone = 
  CASE 
    WHEN phone ~ '^\d{10}$' THEN '+1' || phone
    WHEN phone ~ '^\d{11}$' AND phone LIKE '1%' THEN '+' || phone
    WHEN phone ~ '^\d{11}$' AND phone NOT LIKE '1%' THEN '+' || phone
    WHEN phone ~ '^\d+$' AND LENGTH(phone) > 11 THEN '+' || phone
    WHEN phone ~ '^\+' THEN phone
    ELSE '+1' || REGEXP_REPLACE(phone, '\D', '', '')
  END
WHERE phone IS NOT NULL 
  AND phone NOT LIKE '+1%'
  AND phone ~ '^\d+$';

-- Step 2: Identify duplicates by business_id + normalized phone
WITH duplicates AS (
  SELECT 
    business_id,
    phone,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(id ORDER BY 
      CASE status WHEN 'active' THEN 1 WHEN 'contacted' THEN 2 ELSE 3 END,
      COALESCE(last_message_at, created_at) DESC
    ) as lead_ids
  FROM leads
  WHERE phone IS NOT NULL
  GROUP BY business_id, phone
  HAVING COUNT(*) > 1
)
SELECT * FROM duplicates;

-- Step 3: For each duplicate group, keep the canonical lead and merge related records
-- This will be done in the application layer due to complex merging logic

-- Step 4: Add unique constraint on business_id + phone (run after cleanup)
-- ALTER TABLE leads ADD CONSTRAINT unique_business_phone UNIQUE (business_id, phone);
