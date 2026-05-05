-- SQL Query to identify orphaned Twilio numbers
-- These are numbers in twilio_numbers table that are not assigned to any business

SELECT 
    tn.id,
    tn.phone_number,
    tn.phone_number_sid,
    tn.status,
    tn.created_at,
    tn.business_id,
    b.name as business_name,
    b.user_id
FROM twilio_numbers tn
LEFT JOIN businesses b ON tn.business_id = b.id
WHERE tn.business_id IS NULL
  AND tn.status = 'active'
ORDER BY tn.created_at DESC;

-- Count of orphaned numbers
SELECT COUNT(*) as orphaned_count
FROM twilio_numbers tn
WHERE tn.business_id IS NULL
  AND tn.status = 'active';

-- SQL to safely release orphaned numbers (use with caution)
-- First update status to 'releasing' to prevent new assignments
UPDATE twilio_numbers 
SET status = 'releasing', 
    released_at = NOW()
WHERE business_id IS NULL 
  AND status = 'active'
  AND id IN (
    -- Add specific IDs here after running the SELECT query above
    -- Example: 1, 2, 3
  );

-- Then you can safely release them via Twilio API
-- Make sure to verify they're released in Twilio before deleting from database
