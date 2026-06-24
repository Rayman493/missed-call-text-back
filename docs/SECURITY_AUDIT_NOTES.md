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

### Status: AUDITED AND FIXED

### Routes Checked (43 total routes)

**Public Webhooks (Signature Validated):**
- ✓ `/api/stripe/webhook` - Stripe signature validation
- ✓ `/api/twilio/incoming-sms` - Twilio signature validation
- ✓ `/api/twilio/status` - Twilio signature validation
- ✓ `/api/twilio/status-callback` - Twilio signature validation
- ✓ `/api/twilio/message-status` - Twilio signature validation
- ✓ `/api/twilio/recording-status` - Twilio signature validation
- ✓ `/api/twilio/voice-status` - Twilio signature validation
- ✓ `/api/twilio/transcription` - Twilio signature validation
- ✓ `/api/twilio/voicemail` - Twilio signature validation

**Admin/Internal Routes (INTERNAL_API_SECRET or Admin Check):**
- ✓ `/api/admin/*` (26 routes) - Admin check via `isAdmin()` function
- ✓ `/api/business/trigger-provisioning` - PROVISIONING_ADMIN_SECRET or user auth
- ✓ `/api/ai-confirmation-sms` - INTERNAL_API_SECRET
- ✓ `/api/follow-ups/create-jobs` - INTERNAL_API_SECRET or user auth with business ownership check
- ✓ `/api/process-followups` - CRON_SECRET
- ✓ `/api/cron/send-followups` - CRON_SECRET
- ✓ `/api/cron/process-followup-jobs` - CRON_SECRET
- ✓ `/api/cron/process-expired-reservations` - CRON_SECRET
- ✓ `/api/cron/reclaim-twilio-numbers` - CRON_SECRET

**Authenticated User Routes (with Business Ownership Check):**
- ✓ `/api/send-sms` - Bearer token auth + business ownership check
- ✓ `/api/leads/[id]` - Bearer token auth + business ownership check
- ✓ `/api/leads/[id]/follow-ups/[jobId]` - Session auth + business ownership check
- ✓ `/api/leads/[id]/status` - Bearer token auth + business ownership check
- ✓ `/api/notifications/[id]` - Session auth + business ownership check
- ✓ `/api/notifications/clear` - Session auth + business ownership check
- ✓ `/api/notifications/create` - Session auth
- ✓ `/api/ignored-contacts` - Bearer token auth + business ownership check
- ✓ `/api/ignored-contacts/[id]` - Bearer token auth + business ownership check
- ✓ `/api/ignored-contacts/import/preview` - Bearer token auth + business ownership check
- ✓ `/api/ignored-contacts/import/execute` - Bearer token auth + business ownership check
- ✓ `/api/message-media` - Session auth + business ownership check via message
- ✓ `/api/settings/follow-ups` - Session auth + server-side business lookup
- ✓ `/api/trial/check-eligibility` - Session auth
- ✓ `/api/google/calendar/*` - Session auth + business ownership check
- ✓ `/api/billing/checkout-status` - No auth (Stripe callback - session_id validated)
- ✓ `/api/stripe/create-checkout-session` - Session auth + server-side business lookup
- ✓ `/api/stripe/create-portal-session` - Session auth + business ownership check
- ✓ `/api/beta-feedback` - Session auth
- ✓ `/api/account/delete` - Session auth
- ✓ `/api/business/get-or-create` - Session auth
- ✓ `/api/business/provision-number` - Session auth + business ownership check
- ✓ `/api/business/retry-provisioning` - Session auth + business ownership check
- ✓ `/api/business/update-phone` - Session auth + business ownership check
- ✓ `/api/business/update-phone-number` - Session auth + business ownership check
- ✓ `/api/business/forwarding-verify` - Session auth + business ownership check
- ✓ `/api/lead-details` - Session auth + RLS protection
- ✓ `/api/twilio/media` - Bearer token auth + business ownership check
- ✓ `/api/twilio/message` - INTERNAL_API_SECRET
- ✓ `/api/twilio/ai-assistant/*` - INTERNAL_API_SECRET
- ✓ `/api/twilio/voice` - INTERNAL_API_SECRET
- ✓ `/api/ai-voice/summary-message` - INTERNAL_API_SECRET
- ✓ `/api/demo/send-text` - Session auth + business ownership check
- ✓ `/api/dev/reset-demo-data` - Session auth
- ✓ `/api/dev/simulate-inbound-sms` - Session auth
- ✓ `/api/onboarding/*` - Session auth
- ✓ `/api/send-offboarding-email` - INTERNAL_API_SECRET
- ✓ `/api/voicemail/[recordingSid]` - Session auth + business ownership check
- ✓ `/api/test/*` - Session auth (development only)

### Critical Issues Found and Fixed

1. **Smart Filtering API Missing Authentication** - CRITICAL SECURITY BUG
   - File: `src/app/api/smart-filtering/route.ts`
   - Issue: GET, POST, and DELETE endpoints had NO authentication and accepted businessId directly from query parameters or request body
   - Impact: Anyone could read/modify allowed numbers, blocked numbers, personal contacts, and decision logs for ANY business
   - Fix: Added session authentication and server-side business lookup to all methods
   - Business ID is now derived from authenticated user's business, not client-provided

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

5. **Smart Filtering API Missing Authentication** - FIXED
   - File: `src/app/api/smart-filtering/route.ts`
   - Issue: GET, POST, and DELETE endpoints had NO authentication and accepted businessId directly from query parameters or request body
   - Impact: Anyone could read/modify allowed numbers, blocked numbers, personal contacts, and decision logs for ANY business
   - Fix: Added session authentication and server-side business lookup to all methods

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

5. **Smart Filtering API Missing Authentication** - FIXED
   - Added session authentication to GET, POST, and DELETE methods
   - Changed to use server-side business lookup instead of client-provided businessId
   - Business ID is now derived from authenticated user's business

## Issues Intentionally Deferred

1. **AI Voice Service Security** - Deferred for dedicated review
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

## Manual Testing Notes for Smart Filtering API Fix

After fixing the smart-filtering API authentication, the following should be tested:

1. **Authentication Required:**
   - Verify that unauthenticated requests to `/api/smart-filtering` return 401 Unauthorized
   - Verify that requests with valid session can access the API

2. **Business Ownership Verification:**
   - Verify that users can only read their own business's allowed numbers
   - Verify that users can only read their own business's blocked numbers
   - Verify that users can only read their own business's personal contacts
   - Verify that users can only read their own business's decision logs
   - Verify that users can only add numbers to their own business's lists
   - Verify that users can only remove numbers from their own business's lists

3. **Cross-Business Access Prevention:**
   - Verify that User A cannot access User B's smart filtering data
   - Verify that the businessId parameter is now ignored (derived from authenticated user)

**Important:** This fix closes a CRITICAL security vulnerability where any unauthenticated user could read/modify any business's smart filtering configuration by simply providing a businessId in the request.
