-- Add 'cancelled' as a canonical customer status
-- Migration: 20260902000000_add_cancelled_customer_status.sql
-- Purpose: Add 'cancelled' status to leads.status check constraint to support cancelled engagements

-- Drop existing check constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add new check constraint with cancelled status included
ALTER TABLE leads
ADD CONSTRAINT leads_status_check
CHECK (status IN ('new', 'needs_reply', 'active', 'scheduled', 'payment_requested', 'paid', 'completed', 'cancelled', 'ignored', 'lost'));

-- Comment for documentation
COMMENT ON COLUMN leads.status IS 'Lead status: new, needs_reply, active, scheduled, payment_requested, paid, completed, cancelled, ignored, lost';