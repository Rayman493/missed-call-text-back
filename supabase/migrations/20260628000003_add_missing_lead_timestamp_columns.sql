-- Add missing timestamp columns to leads table
-- These columns are expected by the Leads page but missing from the schema

-- Add first_contact_at column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'first_contact_at'
    ) THEN
        ALTER TABLE leads ADD COLUMN first_contact_at timestamptz;
        RAISE NOTICE 'Added first_contact_at column to leads table';
    ELSE
        RAISE NOTICE 'first_contact_at column already exists in leads table';
    END IF;
END $$;

-- Add last_message_at column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'last_message_at'
    ) THEN
        ALTER TABLE leads ADD COLUMN last_message_at timestamptz;
        RAISE NOTICE 'Added last_message_at column to leads table';
    ELSE
        RAISE NOTICE 'last_message_at column already exists in leads table';
    END IF;
END $$;

-- Add last_activity_at column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'last_activity_at'
    ) THEN
        ALTER TABLE leads ADD COLUMN last_activity_at timestamptz;
        RAISE NOTICE 'Added last_activity_at column to leads table';
    ELSE
        RAISE NOTICE 'last_activity_at column already exists in leads table';
    END IF;
END $$;

-- Add conversation_id column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'conversation_id'
    ) THEN
        ALTER TABLE leads ADD COLUMN conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added conversation_id column to leads table';
    ELSE
        RAISE NOTICE 'conversation_id column already exists in leads table';
    END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_first_contact_at ON leads(first_contact_at);
CREATE INDEX IF NOT EXISTS idx_leads_last_message_at ON leads(last_message_at);
CREATE INDEX IF NOT EXISTS idx_leads_last_activity_at ON leads(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_leads_conversation_id ON leads(conversation_id);

-- Add comments for documentation
COMMENT ON COLUMN leads.first_contact_at IS 'Timestamp of first contact with lead';
COMMENT ON COLUMN leads.last_message_at IS 'Timestamp of last message (inbound or outbound)';
COMMENT ON COLUMN leads.last_activity_at IS 'Timestamp of last activity on lead';
COMMENT ON COLUMN leads.conversation_id IS 'Reference to the conversation associated with this lead';
