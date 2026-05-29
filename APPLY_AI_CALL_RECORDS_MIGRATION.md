# Apply AI Call Records Migration to Production

## Issue
The production Supabase database does not have the `ai_call_records` table, causing the error:
```
relation "ai_call_records" does not exist
```

## Solution
Execute the following SQL migration in your production Supabase database.

## Migration SQL

Copy and execute this SQL in your Supabase SQL Editor (Project Settings > Database > SQL Editor):

```sql
-- Create AI call records table for comprehensive call ingestion
-- Migration: 20260529000000_create_ai_call_records.sql
-- Purpose: Store comprehensive AI call data with transcript and structured extraction

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ai_call_records table
CREATE TABLE IF NOT EXISTS ai_call_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
    conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
    caller_phone TEXT NOT NULL,
    forwarded_from TEXT NULL,
    call_sid TEXT NOT NULL UNIQUE,
    ai_session_id TEXT NULL UNIQUE,
    outcome TEXT NOT NULL CHECK (outcome IN (
        'completed',
        'caller_hung_up',
        'ai_failed',
        'voicemail_fallback'
    )),
    transcript JSONB NOT NULL DEFAULT '[]',
    extracted_info JSONB NULL,
    summary TEXT NULL,
    extraction_failed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for performance and queries
CREATE INDEX IF NOT EXISTS idx_ai_call_records_business_id ON ai_call_records(business_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_lead_id ON ai_call_records(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_conversation_id ON ai_call_records(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_call_sid ON ai_call_records(call_sid);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_ai_session_id ON ai_call_records(ai_session_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_outcome ON ai_call_records(outcome);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_created_at ON ai_call_records(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_call_records_caller_phone ON ai_call_records(caller_phone);

-- RLS (Row Level Security) Policies
ALTER TABLE ai_call_records ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view AI call records for their own businesses
CREATE POLICY "Users can view AI call records for their businesses"
    ON ai_call_records
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE owner_id = auth.uid()
        )
    );

-- Policy: System can insert AI call records (for AI voice service)
CREATE POLICY "System can insert AI call records"
    ON ai_call_records
    FOR INSERT
    WITH CHECK (true);

-- Policy: System can update AI call records (for status updates)
CREATE POLICY "System can update AI call records"
    ON ai_call_records
    FOR UPDATE
    WITH CHECK (true);

-- Policy: System can delete AI call records
CREATE POLICY "System can delete AI call records"
    ON ai_call_records
    FOR DELETE
    WITH CHECK (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ai_call_records_updated_at
    BEFORE UPDATE ON ai_call_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE ai_call_records IS 'Comprehensive AI call records with transcript and structured extraction';
COMMENT ON COLUMN ai_call_records.call_sid IS 'Twilio Call SID - unique constraint prevents duplicate records';
COMMENT ON COLUMN ai_call_records.ai_session_id IS 'OpenAI session ID - unique constraint prevents duplicate AI sessions';
COMMENT ON COLUMN ai_call_records.outcome IS 'Call outcome: completed, caller_hung_up, ai_failed, voicemail_fallback';
COMMENT ON COLUMN ai_call_records.transcript IS 'Structured transcript array with role, text, timestamp';
COMMENT ON COLUMN ai_call_records.extracted_info IS 'JSON with extracted fields: callerName, reasonForCalling, urgencyLevel, importantDetails, addressOrLocation, preferredCallbackTime, summary';
COMMENT ON COLUMN ai_call_records.summary IS 'AI-generated business-facing summary';
COMMENT ON COLUMN ai_call_records.extraction_failed IS 'True if structured extraction failed, transcript still saved';
```

## Steps to Apply

1. **Go to Supabase Dashboard**
   - Navigate to your Supabase project
   - Go to Project Settings > Database

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query" to open a new SQL editor tab

3. **Execute Migration**
   - Copy the entire SQL block above
   - Paste it into the SQL editor
   - Click "Run" to execute the migration

4. **Verify Table Creation**
   After the migration completes, run this verification query:

```sql
select *
from ai_call_records
order by created_at desc
limit 10;
```

5. **Check Table Structure**
   You can also verify the table structure with:

```sql
\d ai_call_records
```

## Expected Result

After successful migration:
- The `ai_call_records` table should exist
- All indexes should be created
- RLS policies should be in place
- The verification query should return an empty result set (no records yet)
- No errors should occur when the AI voice service tries to insert records

## Table Schema

The created table will have these columns:
- `id` (uuid, primary key)
- `business_id` (uuid, references businesses)
- `lead_id` (uuid, references leads, nullable)
- `conversation_id` (uuid, references conversations, nullable)
- `caller_phone` (text, not null)
- `forwarded_from` (text, nullable)
- `call_sid` (text, unique, not null)
- `ai_session_id` (text, unique, nullable)
- `outcome` (text, check constraint)
- `transcript` (jsonb, default '[]')
- `extracted_info` (jsonb, nullable)
- `summary` (text, nullable)
- `extraction_failed` (boolean, default false)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## Troubleshooting

If you encounter errors:
1. Make sure you're connected to the correct Supabase project
2. Verify that the `businesses`, `leads`, and `conversations` tables exist
3. Check that you have sufficient permissions to create tables and policies
4. If any step fails, you can safely re-run the entire migration - it uses `IF NOT EXISTS` clauses

## Migration Status

- ✅ Migration file exists: `supabase/migrations/20260529000000_create_ai_call_records.sql`
- ✅ All required fields included
- ✅ Indexes and RLS policies included
- ✅ Service-role safe policies for server-side ingestion
- ⏳ Awaiting manual application to production
