-- Add protected account fields for clean-slate safety
-- This allows marking businesses as protected from cleanup/reset operations

-- Add protected account flag and reason to businesses table
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS is_protected_account boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS protected_reason text;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_businesses_is_protected_account ON businesses(is_protected_account);

-- Add comments for documentation
COMMENT ON COLUMN businesses.is_protected_account IS 'Protected flag - if true, business and all related data are preserved during cleanup/reset operations';
COMMENT ON COLUMN businesses.protected_reason IS 'Reason for protection (e.g., admin account, production customer, test data needed)';

-- Verification query
SELECT column_name, 
       data_type,
       column_default,
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = column_name) as exists
FROM (VALUES 
  ('is_protected_account'),
  ('protected_reason')
) AS t(column_name);
