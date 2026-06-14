-- Migration to repair stripe_customer_id values stored as JSON objects
-- Some businesses have stripe_customer_id stored as full Stripe Customer object JSON
-- This migration extracts just the customer ID string from those JSON objects

-- Update businesses where stripe_customer_id is a JSON object (starts with '{')
-- Extract the 'id' field from the JSON and use it as the customer ID
UPDATE businesses
SET stripe_customer_id = stripe_customer_id::json->>'id'
WHERE stripe_customer_id IS NOT NULL
  AND stripe_customer_id::text LIKE '{%'
  AND stripe_customer_id::json->>'id' IS NOT NULL
  AND stripe_customer_id::json->>'id' LIKE 'cus_%';

-- Log the repair
DO $$
DECLARE
  repaired_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO repaired_count
  FROM businesses
  WHERE stripe_customer_id IS NOT NULL
    AND stripe_customer_id::text LIKE '{%'
    AND stripe_customer_id::json->>'id' IS NOT NULL
    AND stripe_customer_id::json->>'id' LIKE 'cus_%';
  
  RAISE NOTICE 'Repaired % stripe_customer_id values from JSON objects to ID strings', repaired_count;
END $$;
