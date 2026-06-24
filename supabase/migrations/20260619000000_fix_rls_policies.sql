-- Fix critical RLS policy security issues
-- Migration: 20260619000000_fix_rls_policies.sql
-- Purpose: Fix column name inconsistency and overly permissive INSERT/UPDATE policies

-- Issue 1: Fix column name inconsistency (owner_id -> user_id)
-- The businesses table uses user_id, but some RLS policies reference owner_id

-- Drop incorrect policies on leads table that reference owner_id
DROP POLICY IF EXISTS "Users can view leads for their businesses" ON leads;
DROP POLICY IF EXISTS "System can insert leads" ON leads;
DROP POLICY IF EXISTS "System can update leads" ON leads;

-- Create correct policies on leads table
CREATE POLICY "Users can view leads for their businesses"
    ON leads
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert leads for their businesses"
    ON leads
    FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update leads for their businesses"
    ON leads
    FOR UPDATE
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

-- Drop incorrect policies on conversations table that reference owner_id
DROP POLICY IF EXISTS "Users can view conversations for their businesses" ON conversations;
DROP POLICY IF EXISTS "System can insert conversations" ON conversations;
DROP POLICY IF EXISTS "System can update conversations" ON conversations;

-- Create correct policies on conversations table
CREATE POLICY "Users can view conversations for their businesses"
    ON conversations
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert conversations for their businesses"
    ON conversations
    FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update conversations for their businesses"
    ON conversations
    FOR UPDATE
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

-- Drop incorrect policies on messages table that reference owner_id
DROP POLICY IF EXISTS "Users can view messages for their businesses" ON messages;
DROP POLICY IF EXISTS "System can insert messages" ON messages;
DROP POLICY IF EXISTS "System can update messages" ON messages;

-- Create correct policies on messages table
CREATE POLICY "Users can view messages for their businesses"
    ON messages
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages for their businesses"
    ON messages
    FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update messages for their businesses"
    ON messages
    FOR UPDATE
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

-- Issue 2: Fix overly permissive INSERT policy on notifications table
DROP POLICY IF EXISTS "System can create notifications" ON notifications;

CREATE POLICY "Users can create notifications for their businesses"
    ON notifications
    FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

-- Issue 3: Fix overly permissive policies on ai_call_records table
DROP POLICY IF EXISTS "Users can view AI call records for their businesses" ON ai_call_records;
DROP POLICY IF EXISTS "System can insert AI call records" ON ai_call_records;
DROP POLICY IF EXISTS "System can update AI call records" ON ai_call_records;
DROP POLICY IF EXISTS "System can delete AI call records" ON ai_call_records;

CREATE POLICY "Users can view AI call records for their businesses"
    ON ai_call_records
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert AI call records for their businesses"
    ON ai_call_records
    FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update AI call records for their businesses"
    ON ai_call_records
    FOR UPDATE
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete AI call records for their businesses"
    ON ai_call_records
    FOR DELETE
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

-- Issue 4: Fix overly permissive policies on ai_call_sessions table
DROP POLICY IF EXISTS "Users can view AI sessions for their businesses" ON ai_call_sessions;
DROP POLICY IF EXISTS "System can insert AI sessions" ON ai_call_sessions;
DROP POLICY IF EXISTS "System can update AI sessions" ON ai_call_sessions;
DROP POLICY IF EXISTS "System can delete AI sessions" ON ai_call_sessions;

CREATE POLICY "Users can view AI sessions for their businesses"
    ON ai_call_sessions
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert AI sessions for their businesses"
    ON ai_call_sessions
    FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update AI sessions for their businesses"
    ON ai_call_sessions
    FOR UPDATE
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete AI sessions for their businesses"
    ON ai_call_sessions
    FOR DELETE
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

-- Issue 5: Fix overly permissive policies on voicemail_recordings table
DROP POLICY IF EXISTS "Users can view voicemail recordings for their businesses" ON voicemail_recordings;
DROP POLICY IF EXISTS "System can insert voicemail recordings" ON voicemail_recordings;
DROP POLICY IF EXISTS "System can update voicemail recordings" ON voicemail_recordings;
DROP POLICY IF EXISTS "Users can update voicemail recordings for their businesses" ON voicemail_recordings;
DROP POLICY IF EXISTS "Users can delete voicemail recordings for their businesses" ON voicemail_recordings;

CREATE POLICY "Users can view voicemail recordings for their businesses"
    ON voicemail_recordings
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert voicemail recordings for their businesses"
    ON voicemail_recordings
    FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update voicemail recordings for their businesses"
    ON voicemail_recordings
    FOR UPDATE
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete voicemail recordings for their businesses"
    ON voicemail_recordings
    FOR DELETE
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE user_id = auth.uid()
        )
    );

-- Issue 6: Fix overly permissive policy on message_media table (add INSERT/UPDATE policies)
CREATE POLICY "Users can insert media for their business messages"
    ON message_media
    FOR INSERT
    WITH CHECK (
        EXISTS (
          SELECT 1 FROM messages
          WHERE messages.id = message_media.message_id
          AND EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = messages.lead_id
            AND leads.business_id = (
              SELECT id FROM businesses
              WHERE user_id = auth.uid()
              LIMIT 1
            )
          )
        )
    );

CREATE POLICY "Users can update media for their business messages"
    ON message_media
    FOR UPDATE
    USING (
        EXISTS (
          SELECT 1 FROM messages
          WHERE messages.id = message_media.message_id
          AND EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = messages.lead_id
            AND leads.business_id = (
              SELECT id FROM businesses
              WHERE user_id = auth.uid()
              LIMIT 1
            )
          )
        )
    )
    WITH CHECK (
        EXISTS (
          SELECT 1 FROM messages
          WHERE messages.id = message_media.message_id
          AND EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = messages.lead_id
            AND leads.business_id = (
              SELECT id FROM businesses
              WHERE user_id = auth.uid()
              LIMIT 1
            )
          )
        )
    );

-- Comment for documentation
COMMENT ON TABLE businesses IS 'Businesses table - user_id column references auth.users(id)';
