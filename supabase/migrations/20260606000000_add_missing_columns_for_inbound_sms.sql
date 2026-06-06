-- Add missing columns for inbound SMS/MMS processing
-- This migration adds columns that are expected by the code but missing from the database schema

-- Add raw_metadata column to leads table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'raw_metadata'
    ) THEN
        ALTER TABLE leads ADD COLUMN raw_metadata jsonb DEFAULT '{}'::jsonb;
        RAISE NOTICE 'Added raw_metadata column to leads table';
    ELSE
        RAISE NOTICE 'raw_metadata column already exists in leads table';
    END IF;
END $$;

-- Add media_count column to messages table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'media_count'
    ) THEN
        ALTER TABLE messages ADD COLUMN media_count integer DEFAULT 0;
        RAISE NOTICE 'Added media_count column to messages table';
    ELSE
        RAISE NOTICE 'media_count column already exists in messages table';
    END IF;
END $$;

-- Add caller_phone column to leads table (if it doesn't exist)
-- This is used for SMS processing and should be the normalized phone number
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'caller_phone'
    ) THEN
        ALTER TABLE leads ADD COLUMN caller_phone text;
        RAISE NOTICE 'Added caller_phone column to leads table';
        
        -- If phone column exists, copy its values to caller_phone
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'leads' AND column_name = 'phone'
        ) THEN
            UPDATE leads SET caller_phone = phone WHERE caller_phone IS NULL;
            RAISE NOTICE 'Copied phone values to caller_phone';
        END IF;
        
        -- Add unique constraint on business_id, caller_phone (if phone constraint exists)
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'leads' AND constraint_name = 'leads_business_id_phone_key'
        ) THEN
            ALTER TABLE leads DROP CONSTRAINT leads_business_id_phone_key;
            ALTER TABLE leads ADD CONSTRAINT leads_business_id_caller_phone_key UNIQUE (business_id, caller_phone);
            RAISE NOTICE 'Updated unique constraint from phone to caller_phone';
        END IF;
    ELSE
        RAISE NOTICE 'caller_phone column already exists in leads table';
    END IF;
END $$;

-- Add missing lead timestamp columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'last_reply_at'
    ) THEN
        ALTER TABLE leads ADD COLUMN last_reply_at timestamptz;
        RAISE NOTICE 'Added last_reply_at column to leads table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'opted_out'
    ) THEN
        ALTER TABLE leads ADD COLUMN opted_out boolean DEFAULT false;
        RAISE NOTICE 'Added opted_out column to leads table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'is_demo'
    ) THEN
        ALTER TABLE leads ADD COLUMN is_demo boolean DEFAULT false;
        RAISE NOTICE 'Added is_demo column to leads table';
    END IF;
END $$;

-- Add missing message columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'twilio_message_sid'
    ) THEN
        ALTER TABLE messages ADD COLUMN twilio_message_sid text;
        RAISE NOTICE 'Added twilio_message_sid column to messages table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'status'
    ) THEN
        ALTER TABLE messages ADD COLUMN status text DEFAULT 'sent';
        RAISE NOTICE 'Added status column to messages table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'message_type'
    ) THEN
        ALTER TABLE messages ADD COLUMN message_type text DEFAULT 'text';
        RAISE NOTICE 'Added message_type column to messages table';
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN leads.raw_metadata IS 'JSON metadata for lead, includes AI intake data, customer corrections, image metadata';
COMMENT ON COLUMN leads.caller_phone IS 'Normalized customer phone number (E.164 format)';
COMMENT ON COLUMN leads.last_reply_at IS 'Timestamp of last customer reply';
COMMENT ON COLUMN leads.opted_out IS 'Whether customer has opted out of SMS';
COMMENT ON COLUMN leads.is_demo IS 'Whether this is a demo/test lead';
COMMENT ON COLUMN messages.media_count IS 'Number of media attachments in message';
COMMENT ON COLUMN messages.twilio_message_sid IS 'Twilio message SID for tracking';
COMMENT ON COLUMN messages.status IS 'Message status (sent, delivered, failed, received)';
COMMENT ON COLUMN messages.message_type IS 'Message type (text, image, mixed, note, summary, transcript)';
