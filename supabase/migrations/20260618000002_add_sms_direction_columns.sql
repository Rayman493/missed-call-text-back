-- Add direction, from_phone, to_phone columns to messages table
-- Migration: 20260618000002_add_sms_direction_columns.sql
-- Purpose: Add missing columns for SMS message direction tracking
-- These columns are required for outbound SMS messages (AI summary, follow-ups, manual SMS)

-- Add direction column to messages table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'direction'
    ) THEN
        ALTER TABLE messages ADD COLUMN direction text CHECK (direction IN ('inbound', 'outbound'));
        RAISE NOTICE 'Added direction column to messages table';
    ELSE
        RAISE NOTICE 'direction column already exists in messages table';
    END IF;
END $$;

-- Add from_phone column to messages table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'from_phone'
    ) THEN
        ALTER TABLE messages ADD COLUMN from_phone text;
        RAISE NOTICE 'Added from_phone column to messages table';
    ELSE
        RAISE NOTICE 'from_phone column already exists in messages table';
    END IF;
END $$;

-- Add to_phone column to messages table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'to_phone'
    ) THEN
        ALTER TABLE messages ADD COLUMN to_phone text;
        RAISE NOTICE 'Added to_phone column to messages table';
    ELSE
        RAISE NOTICE 'to_phone column already exists in messages table';
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN messages.direction IS 'Message direction: inbound (from customer) or outbound (from business)';
COMMENT ON COLUMN messages.from_phone IS 'Phone number that sent the message (E.164 format)';
COMMENT ON COLUMN messages.to_phone IS 'Phone number that received the message (E.164 format)';

-- Verification query
SELECT 'messages.direction' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'direction') as exists
UNION ALL
SELECT 'messages.from_phone' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'from_phone') as exists
UNION ALL
SELECT 'messages.to_phone' as column_name, 
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'to_phone') as exists;
