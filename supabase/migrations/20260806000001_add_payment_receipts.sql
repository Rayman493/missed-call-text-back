-- Create payment_receipts table for Tap to Pay digital receipts
-- Migration: 20260806000001_add_payment_receipts.sql
-- Purpose: Store digital receipts sent after Tap to Pay transactions

BEGIN;

CREATE TABLE IF NOT EXISTS payment_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    payment_request_id uuid REFERENCES payment_requests(id) ON DELETE CASCADE,
    payment_intent_id TEXT NOT NULL,
    
    -- Receipt details (canonical data from Stripe)
    payment_status TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    stripe_created_at timestamptz NOT NULL,
    card_brand TEXT,
    card_last4 TEXT,
    receipt_number TEXT,
    
    -- Delivery details
    delivery_method TEXT NOT NULL DEFAULT 'sms' CHECK (delivery_method IN ('sms', 'email')),
    destination TEXT NOT NULL, -- Phone number for SMS, email for email
    provider_message_id TEXT, -- Twilio message SID or email provider ID
    
    -- Metadata
    sent_at timestamptz DEFAULT now() NOT NULL,
    sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    idempotency_key TEXT UNIQUE,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Unique constraint to prevent duplicate receipts for the same payment_intent_id and destination
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_receipts_unique_send 
    ON payment_receipts(payment_intent_id, delivery_method, destination)
    WHERE sent_at IS NOT NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_receipts_business_id ON payment_receipts(business_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_payment_request_id ON payment_receipts(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_payment_intent_id ON payment_receipts(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_sent_at ON payment_receipts(sent_at);

-- RLS (Row Level Security) Policies
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view receipts for their businesses" ON payment_receipts;
CREATE POLICY "Users can view receipts for their businesses"
    ON payment_receipts
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can create receipts for their businesses" ON payment_receipts;
CREATE POLICY "Users can create receipts for their businesses"
    ON payment_receipts
    FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_payment_receipts_updated_at ON payment_receipts;
CREATE TRIGGER update_payment_receipts_updated_at
    BEFORE UPDATE ON payment_receipts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comment for documentation
COMMENT ON TABLE payment_receipts IS 'Digital receipts sent after Tap to Pay transactions';
COMMENT ON COLUMN payment_receipts.card_brand IS 'Card brand from Stripe (e.g., visa, mastercard)';
COMMENT ON COLUMN payment_receipts.card_last4 IS 'Last 4 digits of card from Stripe';
COMMENT ON COLUMN payment_receipts.receipt_number IS 'Stripe receipt/reference number';
COMMENT ON COLUMN payment_receipts.idempotency_key IS 'Idempotency key to prevent duplicate sends from repeated UI taps';

COMMIT;
