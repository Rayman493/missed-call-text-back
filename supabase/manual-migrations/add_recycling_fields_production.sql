-- Manual migration script for production
-- Run this in the Supabase SQL Editor to add recycling fields if they don't exist
-- This script is idempotent and safe to run multiple times

-- Add detached_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'twilio_numbers' 
        AND column_name = 'detached_at'
    ) THEN
        ALTER TABLE twilio_numbers 
        ADD COLUMN detached_at TIMESTAMPTZ;
        
        COMMENT ON COLUMN twilio_numbers.detached_at IS 'Timestamp when number was detached from a business (for recycling)';
        
        RAISE NOTICE 'Added detached_at column to twilio_numbers';
    ELSE
        RAISE NOTICE 'detached_at column already exists in twilio_numbers';
    END IF;
END $$;

-- Add detached_reason column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'twilio_numbers' 
        AND column_name = 'detached_reason'
    ) THEN
        ALTER TABLE twilio_numbers 
        ADD COLUMN detached_reason TEXT;
        
        COMMENT ON COLUMN twilio_numbers.detached_reason IS 'Reason for detachment (e.g., account_deletion, manual_release)';
        
        RAISE NOTICE 'Added detached_reason column to twilio_numbers';
    ELSE
        RAISE NOTICE 'detached_reason column already exists in twilio_numbers';
    END IF;
END $$;

-- Verify columns exist
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'twilio_numbers' 
AND column_name IN ('detached_at', 'detached_reason')
ORDER BY column_name;
