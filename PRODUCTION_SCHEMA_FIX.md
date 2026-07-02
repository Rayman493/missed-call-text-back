# Production Schema Fix for Offboarding

## Issue
Production logs show missing tables:
- `public.offboarding_tracking`
- `public.system_sms`

## Root Cause
The following migrations exist locally but have not been applied to production:
- `20260702000001_create_offboarding_tracking.sql`
- `20260618000000_create_system_sms.sql`

## Required Migrations

### 1. offboarding_tracking Table
**Migration:** `supabase/migrations/20260702000001_create_offboarding_tracking.sql`

**Purpose:** Tracks offboarding confirmation tokens and reminder counts for deleted businesses.

**Required for:** Account deletion flow, confirmation links, reminder cron job.

**SQL to run in production:**
```sql
-- Create offboarding_tracking table
CREATE TABLE IF NOT EXISTS offboarding_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    business_phone_number TEXT NOT NULL,
    business_email TEXT NOT NULL,
    confirmation_token TEXT UNIQUE NOT NULL,
    forwarding_confirmed BOOLEAN DEFAULT false,
    confirmed_at timestamptz,
    reminder_count INTEGER DEFAULT 0,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offboarding_tracking_business_id ON offboarding_tracking(business_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_tracking_confirmation_token ON offboarding_tracking(confirmation_token);
CREATE INDEX IF NOT EXISTS idx_offboarding_tracking_forwarding_confirmed ON offboarding_tracking(forwarding_confirmed);
CREATE INDEX IF NOT EXISTS idx_offboarding_tracking_created_at ON offboarding_tracking(created_at);

-- RLS Policies
ALTER TABLE offboarding_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can insert offboarding_tracking"
    ON offboarding_tracking
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "System can update offboarding_tracking"
    ON offboarding_tracking
    FOR UPDATE
    WITH CHECK (true);

CREATE POLICY "System can select offboarding_tracking"
    ON offboarding_tracking
    FOR SELECT
    USING (true);

CREATE POLICY "System can delete offboarding_tracking"
    ON offboarding_tracking
    FOR DELETE
    USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_offboarding_tracking_updated_at
    BEFORE UPDATE ON offboarding_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 2. system_sms Table
**Migration:** `supabase/migrations/20260618000000_create_system_sms.sql`

**Purpose:** Optional logging for system-level SMS messages (offboarding, admin notifications) not associated with leads or conversations.

**Required for:** Optional logging only (not required for V1 core functionality).

**Status:** Code has been guarded with try-catch to handle missing table gracefully in production. This table can be applied later if needed for auditing.

**SQL to run in production (optional):**
```sql
-- Create system_sms table for account-level SMS messages
CREATE TABLE IF NOT EXISTS system_sms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    to_phone TEXT NOT NULL,
    from_phone TEXT NOT NULL,
    body TEXT NOT NULL,
    twilio_message_sid TEXT UNIQUE,
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'undelivered')),
    sent_at timestamptz,
    delivered_at timestamptz,
    status_updated_at timestamptz,
    error_code TEXT,
    error_message TEXT,
    message_type TEXT NOT NULL CHECK (message_type IN ('offboarding', 'admin_notification', 'other')),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_system_sms_business_id ON system_sms(business_id);
CREATE INDEX IF NOT EXISTS idx_system_sms_twilio_message_sid ON system_sms(twilio_message_sid);
CREATE INDEX IF NOT EXISTS idx_system_sms_status ON system_sms(status);
CREATE INDEX IF NOT EXISTS idx_system_sms_message_type ON system_sms(message_type);
CREATE INDEX IF NOT EXISTS idx_system_sms_created_at ON system_sms(created_at);

-- RLS Policies
ALTER TABLE system_sms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can insert system_sms"
    ON system_sms
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "System can update system_sms"
    ON system_sms
    FOR UPDATE
    WITH CHECK (true);

CREATE POLICY "System can select system_sms"
    ON system_sms
    FOR SELECT
    USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_system_sms_updated_at
    BEFORE UPDATE ON system_sms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## How to Apply Migrations

### Option 1: Via Supabase Dashboard (Recommended)
1. Go to Supabase Dashboard → Database → SQL Editor
2. Run the `offboarding_tracking` SQL above
3. Verify the table was created successfully
4. Optionally run the `system_sms` SQL (for auditing)

### Option 2: Via Supabase CLI
```bash
# Apply specific migration
supabase db push --include 20260702000001_create_offboarding_tracking.sql

# Apply system_sms migration (optional)
supabase db push --include 20260618000000_create_system_sms.sql
```

## Code Changes Made
- Guarded `system_sms` insert in `src/lib/twilio.ts` with try-catch to handle missing table gracefully
- Production will no longer fail with "table does not exist" errors for optional logging

## Verification After Fix
After applying the `offboarding_tracking` migration:
- Account deletion should create offboarding_tracking record successfully
- confirmation_token should be stored
- Forwarding email should include confirmation button/link
- Forwarding SMS should include confirmation link
- Confirmation page should work
- Reminder cron should have a record to process
- No missing table errors in logs

## Priority
- **HIGH:** Apply `offboarding_tracking` migration (required for offboarding flow)
- **LOW:** Apply `system_sms` migration (optional logging only, code already guarded)
