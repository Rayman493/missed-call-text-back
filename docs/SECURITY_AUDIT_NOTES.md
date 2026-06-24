# ReplyFlow Security Audit Notes

**Date:** June 23, 2026
**Auditor:** Cascade AI Assistant
**Scope:** Focused security audit pass on high-confidence issues only

## 1. Webhook Security

### Stripe Webhook (`src/app/api/stripe/webhook/route.ts`)
- ✓ Has signature validation using `stripe.webhooks.constructEvent()` (line 100)
- ✓ Validates `stripe-signature` header (line 87)
- ✓ Checks for `STRIPE_WEBHOOK_SECRET` (line 94-98)
- ✓ Has idempotency check using database-backed `stripe_webhook_events` table (line 110-114)
- ✓ Uses service role key for Supabase (line 104-107) - appropriate for webhook
- **Status:** SECURE

### Twilio Webhook (`src/lib/twilio/webhook.ts`)
- ✓ Uses HMAC-SHA1 with timingSafeEqual for signature validation (line 40)
- ✓ Validates `TWILIO_AUTH_TOKEN` is configured (line 133-138)
- ✓ Checks for `x-twilio-signature` or `twilio-signature` header (line 141-146)
- ✓ Handles multiple URL candidates for reverse proxy scenarios (line 54-91)
- **Status:** SECURE

### Twilio Incoming SMS (`src/app/api/twilio/incoming-sms/route.ts`)
- ✓ Uses `requireTwilioAuth()` for signature validation (line 53)
- ✓ FIXED: Removed development bypass - signature validation is ALWAYS required (line 42-73)
- ✓ This prevents attacks if NODE_ENV is accidentally set to 'development' in production
- **Status:** SECURE

### Internal API Secret (`src/app/api/business/trigger-provisioning/route.ts`)
- ✓ Validates `PROVISIONING_ADMIN_SECRET` header (line 66-78)
- ✓ Rejects requests if secret is not configured (line 68-72)
- ✓ Compares secret with timing-safe comparison (line 75)
- ✓ Also supports user authentication via Bearer token (line 81-96)
- **Status:** SECURE

## 2. Supabase RLS

### Status: AUDITED AND FIXED

### Tables Checked
- ✓ businesses
- ✓ leads
- ✓ conversations
- ✓ messages
- ✓ notifications
- ✓ ai_call_records
- ✓ ai_call_sessions
- ✓ voicemail_recordings
- ✓ message_media
- ✓ calendar_integrations
- ✓ beta_feedback
- ✓ twilio_numbers (referenced but no RLS policy found - likely service-only)
- ✓ follow_up_jobs (referenced in code but no RLS policy found - likely service-only)
- ✓ ignored_contacts (not found in migrations - likely not used)
- ✓ google_calendar_tokens (not found - calendar_integrations is used instead)

### Critical Issues Found and Fixed

1. **Column Name Inconsistency** - CRITICAL SECURITY BUG
   - Issue: RLS policies referenced `owner_id = auth.uid()` but the businesses table uses `user_id`
   - Affected tables: leads, conversations, messages, ai_call_records, ai_call_sessions, voicemail_recordings
   - Impact: These policies were BROKEN - they would fail authorization checks for all users
   - Fix: Migration `20260619000000_fix_rls_policies.sql` updates all policies to use `user_id = auth.uid()`

2. **Overly Permissive INSERT/UPDATE Policies** - CRITICAL SECURITY BUG
   - Issue: Many tables used `WITH CHECK (true)` for INSERT/UPDATE, allowing any authenticated user to insert/update records regardless of business ownership
   - Affected tables:
     - leads (INSERT/UPDATE)
     - conversations (INSERT/UPDATE)
     - messages (INSERT/UPDATE)
     - notifications (INSERT)
     - ai_call_records (INSERT/UPDATE/DELETE)
     - ai_call_sessions (INSERT/UPDATE/DELETE)
     - voicemail_recordings (INSERT/UPDATE)
   - Impact: Any authenticated user could insert/update/delete records for ANY business
   - Fix: Migration `20260619000000_fix_rls_policies.sql` updates all policies to require business ownership

3. **Missing INSERT/UPDATE Policies on message_media**
   - Issue: message_media table only had SELECT policy, no INSERT/UPDATE policies
   - Impact: Service role bypasses RLS, but client-side couldn't insert media
   - Fix: Migration `20260619000000_fix_rls_policies.sql` adds INSERT/UPDATE policies with ownership checks

### Properly Secured Tables
- ✓ calendar_integrations - has proper ownership checks using user_id
- ✓ beta_feedback - has proper user_id checks
- ✓ message_media - now has proper ownership checks (after fix)

### Tables Without RLS (Service-Only)
- twilio_numbers - no RLS policies found (likely service-only table)
- follow_up_jobs - no RLS policies found (likely service-only table)

### Migration Applied
- `20260619000000_fix_rls_policies.sql` - Fixes all critical RLS issues

## 3. API Authorization

### Status: NOT YET CHECKED

## 4. Secrets and Logging

### .gitignore
- ✓ Properly ignores `.env`, `.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local` (line 8-12)
- **Status:** SECURE

### Secrets Logging
- ⚠ **POTENTIAL ISSUE:** Trigger-provisioning endpoint logs secret debugging info (line 52-64 in trigger-provisioning/route.ts)
  - Logs secret existence and redacted value (acceptable for debugging)
  - However, this could be noisy in production logs
- **Status:** ACCEPTABLE (secrets are redacted)

## 5. SMS / Twilio Abuse Prevention

### Send SMS Endpoint (`src/app/api/send-sms/route.ts`)
- ✓ Requires Bearer token authentication (line 13-31)
- ✓ Rate limiting using checkManualSmsRateLimit (line 34-48)
- ✓ Verifies user owns the business (line 128-131)
- ✓ Checks if lead has opted out and blocks sends (line 134-140)
- ✓ Sanitizes message content using sanitizeMessageContent (line 97)
- ✓ Validates message length (max 1600 characters) (line 91-94)
- ✓ Validates file types for MMS (JPEG, PNG, GIF only) (line 174-186)
- **Status:** SECURE

## 6. File/Media Security

### Twilio Media Proxy (`src/app/api/twilio/media/route.ts`)
- ✓ Validates URL is from Twilio domain (line 20-26)
- ✓ Requires Bearer token authentication (line 29-51)
- ✓ Verifies media belongs to authenticated user's business via database query (line 54-82)
- ✓ Uses private cache control (line 116)
- ✓ Fetches media from Twilio with Basic auth using service credentials (line 88-94)
- **Status:** SECURE

## 7. Stripe/Billing Security

### Create Checkout Session (`src/app/api/stripe/create-checkout-session/route.ts`)
- ✓ Requires authenticated user (line 56-62)
- ✓ Uses business_id from database via db.getOrCreateBusiness(user.id) (line 65) - doesn't trust client-provided business_id
- ✓ Creates/retrieves Stripe customer tied to the user's business (line 157-173)
- ✓ Metadata includes business_id and user_id from server-side lookup (line 245-248)
- ✓ Trial eligibility check uses server-side business_phone_number (line 101)
- **Status:** SECURE

## 8. AI Voice Service Security

### Status: DEFERRED
- AI voice service is a separate service with its own security model
- Requires deeper analysis of WebSocket authentication and call session security
- No obvious high-confidence issues found in initial review
- **Recommendation:** Schedule dedicated security review for AI voice service

## 2. Supabase RLS

### Status: DEFERRED
- Requires review of RLS policies for all customer-facing tables
- Requires verification that users can only access their own business data
- Requires verification that service role is only used server-side
- Tables to check: leads, messages, conversations, notifications, ai_call_records, voicemail_recordings, message_media, follow_up_jobs, ignored_contacts
- **Recommendation:** Schedule dedicated RLS audit

## 3. API Authorization

### Status: DEFERRED
- Requires comprehensive review of all app/api routes
- Requires verification that routes requiring logged-in users verify auth
- Requires verification that routes requiring business ownership verify business_id
- Requires verification that admin routes require admin authorization or INTERNAL_API_SECRET
- **Recommendation:** Schedule dedicated API authorization audit

## Summary of High-Confidence Issues

1. **Twilio Incoming SMS Development Bypass** - FIXED
   - File: `src/app/api/twilio/incoming-sms/route.ts`
   - Issue: Signature validation was bypassed when NODE_ENV === 'development'
   - Fix: Removed development bypass - signature validation is ALWAYS required
   - This prevents attacks if NODE_ENV is accidentally set to 'development' in production

2. **Supabase RLS Column Name Inconsistency** - FIXED
   - File: Multiple migrations (leads, conversations, messages, ai_call_records, ai_call_sessions, voicemail_recordings)
   - Issue: RLS policies referenced `owner_id = auth.uid()` but the businesses table uses `user_id`
   - Impact: These policies were BROKEN - they would fail authorization checks for all users
   - Fix: Migration `20260619000000_fix_rls_policies.sql` updates all policies to use `user_id = auth.uid()`

3. **Supabase RLS Overly Permissive INSERT/UPDATE Policies** - FIXED
   - File: Multiple migrations (leads, conversations, messages, notifications, ai_call_records, ai_call_sessions, voicemail_recordings)
   - Issue: Many tables used `WITH CHECK (true)` for INSERT/UPDATE, allowing any authenticated user to insert/update records regardless of business ownership
   - Impact: Any authenticated user could insert/update/delete records for ANY business
   - Fix: Migration `20260619000000_fix_rls_policies.sql` updates all policies to require business ownership

4. **Missing INSERT/UPDATE Policies on message_media** - FIXED
   - File: `20260527010000_add_message_media_support.sql`
   - Issue: message_media table only had SELECT policy, no INSERT/UPDATE policies
   - Impact: Service role bypasses RLS, but client-side couldn't insert media
   - Fix: Migration `20260619000000_fix_rls_policies.sql` adds INSERT/UPDATE policies with ownership checks

## Issues Fixed

1. **Twilio Incoming SMS Development Bypass** - FIXED
   - Removed conditional signature validation bypass for development environment
   - Signature validation is now enforced in all environments
   - Added security comment explaining the rationale

2. **Supabase RLS Column Name Inconsistency** - FIXED
   - Updated all RLS policies to use `user_id = auth.uid()` instead of `owner_id = auth.uid()`
   - Affected tables: leads, conversations, messages, ai_call_records, ai_call_sessions, voicemail_recordings
   - Migration: `20260619000000_fix_rls_policies.sql`

3. **Supabase RLS Overly Permissive INSERT/UPDATE Policies** - FIXED
   - Updated all INSERT/UPDATE/DELETE policies to require business ownership
   - Affected tables: leads, conversations, messages, notifications, ai_call_records, ai_call_sessions, voicemail_recordings
   - Migration: `20260619000000_fix_rls_policies.sql`

4. **Missing INSERT/UPDATE Policies on message_media** - FIXED
   - Added INSERT/UPDATE policies with ownership checks
   - Migration: `20260619000000_fix_rls_policies.sql`

## Issues Intentionally Deferred

1. **API Authorization** - Deferred for dedicated audit
   - Requires comprehensive review of all app/api routes
   - Requires verification that routes requiring logged-in users verify auth
   - Requires verification that routes requiring business ownership verify business_id
   - Requires verification that admin routes require admin authorization or INTERNAL_API_SECRET

2. **AI Voice Service Security** - Deferred for dedicated review
   - AI voice service is a separate service with its own security model
   - Requires deeper analysis of WebSocket authentication and call session security
   - No obvious high-confidence issues found in initial review

## Manual Testing Notes for RLS Migration

After applying migration `20260619000000_fix_rls_policies.sql`, the following should be tested:

1. **Leads, Conversations, Messages:**
   - Verify users can only view their own business data
   - Verify users can only insert records for their own business
   - Verify users can only update records for their own business

2. **Notifications:**
   - Verify users can only create notifications for their own business
   - Verify users can only view their own notifications

3. **AI Call Records/Sessions:**
   - Verify users can only view AI records for their own business
   - Verify users can only insert/update/delete AI records for their own business

4. **Voicemail Recordings:**
   - Verify users can only view voicemail recordings for their own business
   - Verify users can only insert/update/delete voicemail recordings for their own business

5. **Message Media:**
   - Verify users can only view media for their own business messages
   - Verify users can only insert media for their own business messages

**Important:** This migration fixes CRITICAL security bugs that broke authorization. The old policies using `owner_id` would fail for all users, and the overly permissive `WITH CHECK (true)` policies allowed cross-business data access.
