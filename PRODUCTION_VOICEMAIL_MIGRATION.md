# Production Voicemail Migration

## Issue
Production Supabase is missing the `voicemail_recordings` table, causing:
```
ERROR: 42P01
relation "voicemail_recordings" does not exist
```

## Solution
Run the following SQL in Supabase Production SQL Editor:

```sql
-- Create voicemail_recordings table for V1 voicemail capture
-- Migration: 20250526000000_create_voicemail_recordings.sql
-- Safe for production deployment

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create voicemail_recordings table
CREATE TABLE IF NOT EXISTS voicemail_recordings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
    call_sid TEXT NOT NULL,
    recording_sid TEXT NOT NULL,
    recording_url TEXT NOT NULL,
    recording_duration INTEGER,
    recording_status TEXT NOT NULL,
    transcription_text TEXT,
    transcription_status TEXT,
    caller_phone TEXT NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_business_id ON voicemail_recordings(business_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_lead_id ON voicemail_recordings(lead_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_conversation_id ON voicemail_recordings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_call_sid ON voicemail_recordings(call_sid);
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_recording_sid ON voicemail_recordings(recording_sid);
CREATE INDEX IF NOT EXISTS idx_voicemail_recordings_created_at ON voicemail_recordings(created_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE voicemail_recordings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view voicemail recordings for their businesses" ON voicemail_recordings;
DROP POLICY IF EXISTS "System can insert voicemail recordings" ON voicemail_recordings;
DROP POLICY IF EXISTS "System can update voicemail recordings" ON voicemail_recordings;
DROP POLICY IF EXISTS "Users can update voicemail recordings for their businesses" ON voicemail_recordings;
DROP POLICY IF EXISTS "Users can delete voicemail recordings for their businesses" ON voicemail_recordings;

-- Policy: Users can view voicemail recordings for their own businesses
CREATE POLICY "Users can view voicemail recordings for their businesses"
    ON voicemail_recordings
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses 
            WHERE owner_id = auth.uid()
        )
    );

-- Policy: System can insert voicemail recordings (for Twilio webhooks)
CREATE POLICY "System can insert voicemail recordings"
    ON voicemail_recordings
    FOR INSERT
    WITH CHECK (true);

-- Policy: System can update voicemail recordings (for status callbacks)
CREATE POLICY "System can update voicemail recordings"
    ON voicemail_recordings
    FOR UPDATE
    WITH CHECK (true);

-- Policy: Users can update voicemail recordings for their own businesses
CREATE POLICY "Users can update voicemail recordings for their businesses"
    ON voicemail_recordings
    FOR UPDATE
    USING (
        business_id IN (
            SELECT id FROM businesses 
            WHERE owner_id = auth.uid()
        )
    );

-- Policy: Users can delete voicemail recordings for their own businesses
CREATE POLICY "Users can delete voicemail recordings for their businesses"
    ON voicemail_recordings
    FOR DELETE
    USING (
        business_id IN (
            SELECT id FROM businesses 
            WHERE owner_id = auth.uid()
        )
    );

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS update_voicemail_recordings_updated_at ON voicemail_recordings;

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_voicemail_recordings_updated_at
    BEFORE UPDATE ON voicemail_recordings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## Verification Queries

Run these after the migration to verify success:

```sql
-- Verify table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'voicemail_recordings';

-- Verify table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'voicemail_recordings'
ORDER BY ordinal_position;

-- Verify indexes
SELECT indexname, tablename 
FROM pg_indexes 
WHERE tablename = 'voicemail_recordings';

-- Verify RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'voicemail_recordings';

-- Test empty table (should return 0 rows initially)
SELECT COUNT(*) as total_recordings
FROM voicemail_recordings;
```

## Safety Features

- ✅ `CREATE TABLE IF NOT EXISTS` - Safe re-running
- ✅ `CREATE INDEX IF NOT EXISTS` - No index conflicts
- ✅ `DROP POLICY IF EXISTS` - Policy management
- ✅ `DROP TRIGGER IF EXISTS` - Trigger safety
- ✅ `CREATE OR REPLACE FUNCTION` - Function safety

## Expected Outcome

After running this migration:
1. ✅ Table created - `voicemail_recordings` exists
2. ✅ Twilio integration - Voicemail callbacks can save recordings
3. ✅ App compatibility - All app code references work
4. ✅ Security - RLS policies protect user data
5. ✅ Performance - Indexes optimize queries

## App Code References Verified

- ✅ `src/app/api/twilio/voicemail/route.ts` - Inserts recordings
- ✅ `src/app/api/twilio/recording-status/route.ts` - Updates recordings
- ✅ `src/app/api/lead-details/route.ts` - Fetches recordings
- ✅ `src/components/RecentLeadsSection.tsx` - Displays indicators
- ✅ `src/components/VoicemailMessage.tsx` - Renders voicemails

## Migration Source

Based on: `supabase/migrations/20250526000000_create_voicemail_recordings.sql`
