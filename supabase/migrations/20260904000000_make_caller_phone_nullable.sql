-- Make caller_phone nullable to support manual customers without phone numbers
-- Migration: 20260904000000_make_caller_phone_nullable.sql
-- Purpose: Allow manual CRM customers to be created without a phone number

-- Step 1: Make caller_phone column nullable
-- This allows NULL phone values for manually created customers
DO $$
BEGIN
    -- Check if caller_phone column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'caller_phone'
    ) THEN
        -- Check if it's currently NOT NULL
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'leads' AND column_name = 'caller_phone' AND is_nullable = 'NO'
        ) THEN
            ALTER TABLE leads ALTER COLUMN caller_phone DROP NOT NULL;
            RAISE NOTICE 'Made caller_phone column nullable';
        ELSE
            RAISE NOTICE 'caller_phone column is already nullable';
        END IF;
    ELSE
        RAISE NOTICE 'caller_phone column does not exist';
    END IF;
END $$;

-- Step 2: Ensure phone column is also nullable (for backward compatibility)
-- Some code paths may still use the legacy phone column
DO $$
BEGIN
    -- Check if phone column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'phone'
    ) THEN
        -- Check if it's currently NOT NULL
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'leads' AND column_name = 'phone' AND is_nullable = 'NO'
        ) THEN
            ALTER TABLE leads ALTER COLUMN phone DROP NOT NULL;
            RAISE NOTICE 'Made phone column nullable';
        ELSE
            RAISE NOTICE 'phone column is already nullable';
        END IF;
    ELSE
        RAISE NOTICE 'phone column does not exist';
    END IF;
END $$;

-- Step 3: Ensure partial unique index exists for caller_phone
-- This allows multiple NULL phones while preventing duplicate non-null phones per business
DO $$
BEGIN
    -- Drop old unique constraint if it exists (applies to all rows including NULL)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'leads' AND constraint_name = 'leads_business_id_caller_phone_key'
    ) THEN
        ALTER TABLE leads DROP CONSTRAINT leads_business_id_caller_phone_key;
        RAISE NOTICE 'Dropped existing unique constraint on business_id, caller_phone';
    END IF;

    -- Drop old unique constraint on phone if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'leads' AND constraint_name = 'leads_business_id_phone_key'
    ) THEN
        ALTER TABLE leads DROP CONSTRAINT leads_business_id_phone_key;
        RAISE NOTICE 'Dropped existing unique constraint on business_id, phone';
    END IF;

    -- Create partial unique index that only applies when caller_phone is NOT NULL
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'leads' AND indexname = 'leads_business_id_caller_phone_unique'
    ) THEN
        CREATE UNIQUE INDEX leads_business_id_caller_phone_unique
        ON leads(business_id, caller_phone)
        WHERE caller_phone IS NOT NULL;
        RAISE NOTICE 'Added partial unique index for business_id, caller_phone (non-null only)';
    ELSE
        RAISE NOTICE 'Partial unique index leads_business_id_caller_phone_unique already exists';
    END IF;
END $$;

-- Step 4: Add comment for documentation
COMMENT ON INDEX leads_business_id_caller_phone_unique IS 'Ensures unique phone numbers per business, but allows multiple phone-less customers';
COMMENT ON COLUMN leads.caller_phone IS 'Customer phone number (normalized E.164 format), nullable for manual CRM customers';
COMMENT ON COLUMN leads.phone IS 'Legacy phone column, nullable for backward compatibility';

-- Verification query
SELECT 
    'caller_phone nullable' as check_name,
    is_nullable = 'YES' as passed
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'caller_phone'
UNION ALL
SELECT 
    'phone nullable' as check_name,
    is_nullable = 'YES' as passed
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'phone'
UNION ALL
SELECT 
    'partial unique index exists' as check_name,
    EXISTS(
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'leads' AND indexname = 'leads_business_id_caller_phone_unique'
    ) as passed;