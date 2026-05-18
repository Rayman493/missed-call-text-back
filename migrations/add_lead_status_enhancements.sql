-- Add enhanced lead status management for CRM pipeline
-- This migration ensures the status field is properly configured

-- Add status column if it doesn't exist (for backward compatibility)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'status'
    ) THEN
        ALTER TABLE leads ADD COLUMN status TEXT NOT NULL DEFAULT 'new';
    END IF;
END $$;

-- Add lead_status column for explicit lifecycle management
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'lead_status'
    ) THEN
        ALTER TABLE leads ADD COLUMN lead_status TEXT NOT NULL DEFAULT 'new';
    END IF;
END $$;

-- Create activity events table for operational visibility
CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'lead_captured',
        'customer_replied', 
        'follow_up_sent',
        'follow_up_failed',
        'lead_completed',
        'lead_ignored',
        'customer_opted_out'
    )),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_events_business_id ON activity_events(business_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_lead_id ON activity_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(event_type);

-- Add constraint for valid lead statuses
ALTER TABLE leads 
ADD CONSTRAINT IF NOT EXISTS valid_lead_status 
CHECK (status IN ('new', 'active', 'completed', 'ignored'));

-- Update any existing records that might have invalid status values
UPDATE leads 
SET status = 'new' 
WHERE status NOT IN ('new', 'active', 'completed', 'ignored');

-- Sync lead_status with status for existing records
UPDATE leads 
SET lead_status = status 
WHERE lead_status IS NULL OR lead_status != status;

-- Add RLS policies for activity events
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business users can view their own activity events" ON activity_events
    FOR SELECT USING (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

CREATE POLICY "Business users can insert their own activity events" ON activity_events
    FOR INSERT WITH CHECK (business_id IN (
        SELECT id FROM businesses WHERE user_id = auth.uid()
    ));

-- Create function to log activity events
CREATE OR REPLACE FUNCTION log_activity_event(
    p_business_id UUID,
    p_lead_id UUID DEFAULT NULL,
    p_event_type TEXT,
    p_message TEXT,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO activity_events (business_id, lead_id, event_type, message, metadata)
    VALUES (p_business_id, p_lead_id, p_event_type, p_message, p_metadata)
    RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION log_activity_event TO authenticated;
