-- Add voicemail_greeting_url column to businesses table
-- This allows businesses to use custom pre-recorded voicemail greetings

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS voicemail_greeting_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN businesses.voicemail_greeting_url IS 'URL to custom pre-recorded voicemail greeting audio file. If null, uses default TTS greeting.';
