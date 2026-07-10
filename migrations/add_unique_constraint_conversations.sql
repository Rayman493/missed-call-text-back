-- Add unique constraint to prevent duplicate conversations per (business_id, lead_id)
-- This ensures one conversation per lead invariant at the database level

-- Step 1: First, clean up any existing duplicates using the cleanup script
-- Run cleanup_duplicate_conversations.sql first

-- Step 2: Add unique index on (business_id, lead_id)
-- This will prevent future duplicate conversation creation
CREATE UNIQUE INDEX IF NOT EXISTS conversations_business_lead_unique 
ON conversations (business_id, lead_id);

-- Step 3: Verify the constraint was created
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'conversations' 
  AND indexname = 'conversations_business_lead_unique';

-- Note: If you get an error about duplicate values, you must first run
-- the cleanup_duplicate_conversations.sql script to remove existing duplicates
