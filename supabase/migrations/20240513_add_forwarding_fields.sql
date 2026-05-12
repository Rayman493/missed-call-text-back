-- Migration: Add forwarding fields to businesses table
-- Purpose: Ensure all forwarding-related fields exist for proper modal state management

-- Add forwarding_enabled field if it doesn't exist
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS forwarding_enabled BOOLEAN DEFAULT FALSE;

-- Add forwarding_enabled_at field if it doesn't exist  
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS forwarding_enabled_at TIMESTAMPTZ;

-- Add setup_completed field if it doesn't exist
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT FALSE;

-- Add setup_completed_at field if it doesn't exist
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

-- Create index for faster queries on forwarding status
CREATE INDEX IF NOT EXISTS idx_businesses_forwarding_enabled ON businesses(forwarding_enabled);
CREATE INDEX IF NOT EXISTS idx_businesses_onboarding_status ON businesses(onboarding_status);

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 20240513_add_forwarding_fields completed successfully';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Migration 20240513_add_forwarding_fields completed with warnings: %', SQLERRM;
END $$;
$$;
