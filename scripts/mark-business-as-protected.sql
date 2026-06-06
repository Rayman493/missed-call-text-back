-- Script to mark a business as protected
-- This prevents the business from being deleted by clean-slate operations

-- ========================================
-- CONFIGURATION
-- ========================================

-- Set the business ID or name to protect
-- Option 1: Protect by ID (recommended)
DO $$
DECLARE
  target_business_id UUID := NULL;  -- Set to your business ID, e.g., '12345678-1234-1234-1234-123456789abc'
  target_business_name TEXT := NULL;  -- Set to your business name if you prefer to use name
  protected_reason TEXT := 'admin_account';
BEGIN
  IF target_business_id IS NOT NULL THEN
    UPDATE businesses 
    SET is_protected_account = true, 
        protected_reason = protected_reason
    WHERE id = target_business_id;
    
    IF FOUND THEN
      RAISE NOTICE 'Business with ID % is now protected', target_business_id;
    ELSE
      RAISE EXCEPTION 'Business with ID % not found', target_business_id;
    END IF;
  ELSIF target_business_name IS NOT NULL THEN
    UPDATE businesses 
    SET is_protected_account = true, 
        protected_reason = protected_reason
    WHERE name = target_business_name;
    
    IF FOUND THEN
      RAISE NOTICE 'Business named % is now protected', target_business_name;
    ELSE
      RAISE EXCEPTION 'Business named % not found', target_business_name;
    END IF;
  ELSE
    RAISE EXCEPTION 'Please set either target_business_id or target_business_name in the script';
  END IF;
END $$;

-- ========================================
-- VERIFICATION
-- ========================================

-- Show all protected businesses
SELECT 
  id,
  name,
  is_protected_account,
  protected_reason,
  created_at
FROM businesses 
WHERE is_protected_account = true
ORDER BY created_at;

-- ========================================
-- INSTRUCTIONS
-- ========================================

-- To use this script:
-- 1. Set target_business_id to your admin business UUID (recommended)
--    OR set target_business_name to your business name
-- 2. Set protected_reason to one of: 'admin_account', 'production_customer', 'important_test', 'demo_account', 'other'
-- 3. Run the script
-- 4. Verify the business appears in the protected list

-- To find your business ID:
-- SELECT id, name, user_id FROM businesses ORDER BY created_at DESC LIMIT 10;
