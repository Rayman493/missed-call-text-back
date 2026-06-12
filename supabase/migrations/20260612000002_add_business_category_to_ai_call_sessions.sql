-- Add business_category and custom_business_type columns to ai_call_sessions table
-- These columns store business type context for AI calls

ALTER TABLE ai_call_sessions 
ADD COLUMN IF NOT EXISTS business_category TEXT,
ADD COLUMN IF NOT EXISTS custom_business_type TEXT;

-- Add index for efficient querying by business category
CREATE INDEX IF NOT EXISTS idx_ai_call_sessions_business_category ON ai_call_sessions(business_category);

-- Add comments for documentation
COMMENT ON COLUMN ai_call_sessions.business_category IS 'Business category for AI context (e.g., plumbing_hvac, pet_grooming, general_service)';
COMMENT ON COLUMN ai_call_sessions.custom_business_type IS 'Custom business type description when business_type is "Other" (e.g., Pool Service, Wedding Photographer)';
