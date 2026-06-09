-- Fix Twilio number status consistency
-- This script finds and fixes rows where business_id is set but status is not 'assigned' or 'active'

-- Find all inconsistent rows (business_id IS NOT NULL but status is not assigned/active)
SELECT phone_number, business_id, status
FROM twilio_numbers
WHERE business_id IS NOT NULL
  AND status NOT IN ('assigned', 'active');

-- Fix the specific test number +18177830134
-- This number has business_id set but status='available', which is inconsistent
UPDATE twilio_numbers
SET status = 'active'
WHERE phone_number = '+18177830134'
  AND business_id = '6f768f7c-62e2-444d-82f6-8aa112288276';

-- Verification query to confirm the fix
SELECT phone_number, business_id, status
FROM twilio_numbers
WHERE phone_number = '+18177830134';

-- For future reference: If a number should be truly released (no business), use:
-- UPDATE twilio_numbers
-- SET business_id = NULL, status = 'available', assigned_at = NULL
-- WHERE phone_number = '+18177830134';
