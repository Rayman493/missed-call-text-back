-- Add ai_assistant_enabled column to businesses table
-- This allows businesses to enable/disable AI assistant at the business level
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS ai_assistant_enabled boolean DEFAULT false;

-- Add comment to explain the purpose
COMMENT ON COLUMN businesses.ai_assistant_enabled IS 'Controls whether AI assistant is enabled for this business. Must be true along with global flags for AI routing to activate.';
