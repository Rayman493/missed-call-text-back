-- SQL script to normalize all businesses to use the shared Twilio number
-- This should be run when USE_SHARED_TWILIO_NUMBER=true is enforced

-- Update ALL businesses to use the shared number
UPDATE businesses 
SET twilio_phone_number = '+18336584303',
    twilio_phone_number_sid = NULL,
    updated_at = NOW()
WHERE twilio_phone_number != '+18336584303';

-- Verify the update
SELECT 
    id,
    name,
    twilio_phone_number,
    twilio_phone_number_sid,
    updated_at
FROM businesses 
ORDER BY updated_at DESC;

-- Count how many businesses were updated
SELECT 
    COUNT(*) as total_businesses,
    COUNT(CASE WHEN twilio_phone_number = '+18336584303' THEN 1 END) as using_shared_number,
    COUNT(CASE WHEN twilio_phone_number != '+18336584303' THEN 1 END) as using_other_numbers
FROM businesses;

-- Log the normalization
SELECT 'Twilio number normalization completed' as status,
       NOW() as completed_at;
