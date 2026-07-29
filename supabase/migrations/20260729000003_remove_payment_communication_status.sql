-- Remove communication_status field from payment_requests table
-- Migration: 20260729000003_remove_payment_communication_status.sql
-- Purpose: Remove communication_status field since desktop/mobile handoff is no longer needed

-- Drop the index
DROP INDEX IF EXISTS idx_payment_requests_communication_status;

-- Remove the column
ALTER TABLE payment_requests DROP COLUMN IF EXISTS communication_status;
