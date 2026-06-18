-- Create system_sms table for account-level SMS messages (offboarding, admin notifications)
-- Migration: 20260618000000_create_system_sms.sql
-- Purpose: Store system-level SMS messages that are not associated with leads or conversations

CREATE TABLE IF NOT EXISTS system_sms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- SMS details
    to_phone TEXT NOT NULL,
    from_phone TEXT NOT NULL,
    body TEXT NOT NULL,
    twilio_message_sid TEXT UNIQUE,
    
    -- Status tracking
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'undelivered')),
    sent_at timestamptz,
    delivered_at timestamptz,
    status_updated_at timestamptz,
    
    -- Error tracking
    error_code TEXT,
    error_message TEXT,
    
    -- System message type
    message_type TEXT NOT NULL CHECK (message_type IN ('offboarding', 'admin_notification', 'other')),
    
    -- Timestamps
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_system_sms_business_id ON system_sms(business_id);
CREATE INDEX IF NOT EXISTS idx_system_sms_twilio_message_sid ON system_sms(twilio_message_sid);
CREATE INDEX IF NOT EXISTS idx_system_sms_status ON system_sms(status);
CREATE INDEX IF NOT EXISTS idx_system_sms_message_type ON system_sms(message_type);
CREATE INDEX IF NOT EXISTS idx_system_sms_created_at ON system_sms(created_at);

-- RLS (Row Level Security) Policies
ALTER TABLE system_sms ENABLE ROW LEVEL SECURITY;

-- Policy: System can insert system SMS
CREATE POLICY "System can insert system_sms"
    ON system_sms
    FOR INSERT
    WITH CHECK (true);

-- Policy: System can update system_sms
CREATE POLICY "System can update system_sms"
    ON system_sms
    FOR UPDATE
    WITH CHECK (true);

-- Policy: System can select system_sms
CREATE POLICY "System can select system_sms"
    ON system_sms
    FOR SELECT
    USING (true);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_system_sms_updated_at
    BEFORE UPDATE ON system_sms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comment for documentation
COMMENT ON TABLE system_sms IS 'System-level SMS messages (offboarding, admin notifications) not associated with leads or conversations';
