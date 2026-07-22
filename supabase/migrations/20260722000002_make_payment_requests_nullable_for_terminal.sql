-- Make payment_requests fields nullable for Terminal Tap to Pay
-- Migration: 20260722000002_make_payment_requests_nullable_for_terminal.sql
-- Purpose: Terminal payments don't require lead_id or conversation_id
-- This migration consolidates the terminal payment fields and makes lead_id/conversation_id nullable

-- First, ensure the terminal payment fields exist (from 20260722000000_add_terminal_payment_fields.sql)
-- This is idempotent - will skip if already applied
DO $$
BEGIN
    -- Add payment_method_type if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_requests' AND column_name = 'payment_method_type'
    ) THEN
        ALTER TABLE payment_requests
        ADD COLUMN payment_method_type TEXT DEFAULT 'card' CHECK (payment_method_type IN ('card', 'card_present'));
    END IF;

    -- Add job_id if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_requests' AND column_name = 'job_id'
    ) THEN
        ALTER TABLE payment_requests
        ADD COLUMN job_id uuid REFERENCES jobs(id) ON DELETE SET NULL;
        
        CREATE INDEX IF NOT EXISTS idx_payment_requests_job_id ON payment_requests(job_id);
    END IF;

    -- Add payment_intent_client_secret if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_requests' AND column_name = 'payment_intent_client_secret'
    ) THEN
        ALTER TABLE payment_requests
        ADD COLUMN payment_intent_client_secret TEXT;
    END IF;
END $$;

-- Make lead_id and conversation_id nullable for Terminal payments
-- Terminal payments can exist without a lead or conversation
ALTER TABLE payment_requests
ALTER COLUMN lead_id DROP NOT NULL,
ALTER COLUMN conversation_id DROP NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN payment_requests.lead_id IS 'Optional lead reference - required for online payments, optional for Terminal';
COMMENT ON COLUMN payment_requests.conversation_id IS 'Optional conversation reference - required for online payments, optional for Terminal';
COMMENT ON COLUMN payment_requests.payment_method_type IS 'Payment method type: card for online Checkout, card_present for Terminal Tap to Pay';
COMMENT ON COLUMN payment_requests.job_id IS 'Optional job reference for job-based payments';
COMMENT ON COLUMN payment_requests.payment_intent_client_secret IS 'Client secret for Terminal PaymentIntent (not stored for Checkout Sessions)';
