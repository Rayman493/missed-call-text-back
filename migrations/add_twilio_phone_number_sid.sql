-- Add twilio_phone_number_sid to businesses table
-- This stores the Twilio SID for the purchased phone number
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS twilio_phone_number_sid TEXT;
