-- Allow manual customers without phone numbers
-- Migration: 20260903000000_allow_null_phone_for_manual_customers.sql
-- Purpose: Enable CRM use case where customer phone is not yet known

-- Step 1: Drop existing unique constraint on business_id, caller_phone
-- This constraint currently applies to all rows including NULLs
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'leads' AND constraint_name = 'leads_business_id_caller_phone_key'
    ) THEN
        ALTER TABLE leads DROP CONSTRAINT leads_business_id_caller_phone_key;
        RAISE NOTICE 'Dropped existing unique constraint on business_id, caller_phone';
    ELSE
        RAISE NOTICE 'Unique constraint leads_business_id_caller_phone_key does not exist';
    END IF;
END $$;

-- Step 2: Add partial unique constraint that only applies when caller_phone is NOT NULL
-- This allows multiple phone-less customers per business while preventing duplicate phones
-- NULL values are treated as distinct in PostgreSQL unique constraints, but we make it explicit
CREATE UNIQUE INDEX leads_business_id_caller_phone_unique
ON leads(business_id, caller_phone)
WHERE caller_phone IS NOT NULL;

RAISE NOTICE 'Added partial unique index for business_id, caller_phone (non-null only)';

-- Step 3: Ensure caller_phone column is nullable (it should already be, but verify)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'caller_phone' AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE leads ALTER COLUMN caller_phone DROP NOT NULL;
        RAISE NOTICE 'Made caller_phone column nullable';
    ELSE
        RAISE NOTICE 'caller_phone column is already nullable';
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON INDEX leads_business_id_caller_phone_unique IS 'Ensures unique phone numbers per business, but allows multiple phone-less customers';