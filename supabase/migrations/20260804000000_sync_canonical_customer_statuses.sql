-- Synchronize database constraint with canonical CustomerStatus enum
-- Migration: 20260804000000_sync_canonical_customer_statuses.sql
-- Purpose: Update leads.status check constraint to match frontend canonical enum

-- Drop existing check constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Migrate existing archived records to completed
UPDATE leads SET status = 'completed' WHERE status = 'archived';

-- Add new check constraint with canonical status values matching frontend CustomerStatus enum
ALTER TABLE leads 
ADD CONSTRAINT leads_status_check 
CHECK (status IN ('new', 'needs_reply', 'active', 'scheduled', 'payment_requested', 'paid', 'completed', 'ignored', 'lost'));

-- Comment for documentation
COMMENT ON COLUMN leads.status IS 'Lead status: new, needs_reply, active, scheduled, payment_requested, paid, completed, ignored, lost';
