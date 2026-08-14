-- Add email index for customer search performance
-- Migration: 20260109000000_add_leads_email_index.sql
-- Purpose: Enable efficient email-based customer search

-- Add index on email column for efficient email search
CREATE INDEX IF NOT EXISTS idx_leads_email 
ON leads(email) 
WHERE email IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX idx_leads_email IS 'Index for efficient email-based customer search';