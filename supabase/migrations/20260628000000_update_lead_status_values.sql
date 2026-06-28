-- Update lead status values to support business-controlled status management
-- Migration: 20260628000000_update_lead_status_values.sql
-- Purpose: Extend lead status values for manual business status management

-- Drop existing check constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add new check constraint with updated status values
ALTER TABLE leads 
ADD CONSTRAINT leads_status_check 
CHECK (status IN ('new', 'active', 'scheduled', 'payment_requested', 'paid', 'completed', 'lost', 'archived'));

-- Migrate existing status values to new schema
UPDATE leads SET status = 'active' WHERE status = 'needs_follow_up';
UPDATE leads SET status = 'active' WHERE status = 'in_progress';

-- Comment for documentation
COMMENT ON COLUMN leads.status IS 'Lead status: new, active, scheduled, payment_requested, paid, completed, lost, archived';
