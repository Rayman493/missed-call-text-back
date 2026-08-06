-- Test queries to verify new Twilio number provisioning flow
-- Run these after completing Stripe checkout with a new test user

-- 1. Check if business was created with new fields
SELECT 
  id,
  name,
  assigned_twilio_number_id,
  twilio_phone_number,
  twilio_phone_number_sid,
  subscription_status,
  created_at
FROM businesses 
ORDER BY created_at DESC 
LIMIT 5;

-- 2. Check if twilio_numbers row was created
SELECT 
  id,
  business_id,
  phone_number,
  twilio_sid,
  status,
  sms_status,
  assigned_at,
  created_at
FROM twilio_numbers 
ORDER BY created_at DESC 
LIMIT 5;

-- 3. Verify the relationship between businesses and twilio_numbers
SELECT 
  b.id as business_id,
  b.name as business_name,
  b.assigned_twilio_number_id,
  b.twilio_phone_number,
  tn.id as twilio_number_id,
  tn.phone_number as tn_phone_number,
  tn.twilio_sid,
  tn.status as tn_status
FROM businesses b
LEFT JOIN twilio_numbers tn ON b.assigned_twilio_number_id = tn.id
WHERE b.created_at >= NOW() - INTERVAL '1 hour'
ORDER BY b.created_at DESC;

-- 4. Check for any provisioning errors
SELECT 
  business_id,
  phone_number,
  status,
  last_error,
  created_at
FROM twilio_numbers 
WHERE last_error IS NOT NULL
ORDER BY created_at DESC;
