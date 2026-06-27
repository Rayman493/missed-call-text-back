-- Create payment_requests table for Stripe Connect payment requests
-- Migration: 20260627000000_create_payment_requests.sql
-- Purpose: Store payment requests created through Stripe Connect

CREATE TABLE IF NOT EXISTS payment_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Payment details
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL DEFAULT 'usd',
    description TEXT,
    
    -- Status tracking
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'paid', 'failed', 'cancelled', 'expired')),
    
    -- Stripe integration
    stripe_checkout_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    stripe_connect_account_id TEXT,
    checkout_url TEXT,
    
    -- Metadata
    requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    requested_at timestamptz DEFAULT now() NOT NULL,
    paid_at timestamptz,
    failed_at timestamptz,
    cancelled_at timestamptz,
    expires_at timestamptz,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_requests_business_id ON payment_requests(business_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_lead_id ON payment_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_conversation_id ON payment_requests(conversation_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_stripe_checkout_session_id ON payment_requests(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_requested_at ON payment_requests(requested_at);

-- RLS (Row Level Security) Policies
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payment requests for their businesses"
    ON payment_requests
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "Users can create payment requests for their businesses"
    ON payment_requests
    FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "System can update payment requests"
    ON payment_requests
    FOR UPDATE
    WITH CHECK (true);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_payment_requests_updated_at
    BEFORE UPDATE ON payment_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comment for documentation
COMMENT ON TABLE payment_requests IS 'Payment requests created through Stripe Connect';
