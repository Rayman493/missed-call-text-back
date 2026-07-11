# Lead and Customer API Analysis Report

**Date:** July 11, 2026  
**Project:** ReplyFlow - Next.js + Supabase  
**Scope:** Lead lifecycle, customer management, phone normalization, database schema, concurrency, and idempotency

---

## Executive Summary

This comprehensive audit analyzed the lead and customer management system across 12 dimensions. The system demonstrates strong architectural patterns with multiple lead creation paths, robust phone normalization, comprehensive idempotency guards, and well-structured database schema. Key findings include:

- **8 distinct lead creation paths** identified across webhooks, UI, and API routes
- **3 phone normalization utilities** with consistent E.164 formatting
- **Strong idempotency guards** using Call SID, idempotency keys, and duplicate detection
- **Canonical conversation selection** logic handles historical duplicates
- **Comprehensive database schema** with proper foreign keys and RLS policies
- **Orphan detection queries** available for jobs and conversations

---

## Part 1: Domain Terminology Map

### Core Entities
- **Lead**: Customer record created from calls, SMS, or manual entry. Contains phone, name, email, status, and metadata.
- **Conversation**: Thread of communication with a lead. Multiple conversations can exist per lead (historical duplicates).
- **Message**: Individual SMS or note within a conversation. Has direction (inbound/outbound).
- **Call Event**: Record of a phone call with Twilio metadata, status, and SMS tracking.
- **Follow-up Job**: Scheduled automated SMS to follow up with leads after missed calls.
- **Payment Request**: Request for payment via Stripe, Venmo, or PayPal linked to leads.

### Lead Status Lifecycle
- **new**: Recently received lead
- **active**: Conversation in progress
- **scheduled**: Appointment scheduled
- **payment_requested**: Payment request sent
- **paid**: Payment received
- **completed**: Handled and resolved
- **lost**: Lead lost
- **archived**: Soft-deleted lead

### Phone Normalization
- **E.164 format**: +1XXXXXXXXXX (international standard)
- **Digit-only format**: XXXXXXXXXX (for comparison)
- **Storage format**: E.164 in database, normalized via `normalizePhoneNumberForStorage()`

### Integration Points
- **Twilio**: Voice webhooks, SMS webhooks, voicemail callbacks
- **Stripe Connect**: Payment processing and checkout sessions
- **Google Calendar**: Job scheduling integration
- **AI Call Assistant**: Phase 0 prototype (feature-flagged)

---

## Part 2: Lead Creation Paths

### 1. Twilio Voice Webhook (`/api/twilio/voice/route.ts`)
**Entry Point:** Incoming call to Twilio number  
**Helper:** `db.getOrCreateCallIntakeRecords()`  
**Idempotency:** Call SID guard, requires valid call event  
**Flow:**
1. Validate Twilio signature
2. Lookup business by Twilio number
3. Check ignored contacts
4. Normalize caller phone
5. Get/create canonical lead and conversation
6. Create call event
7. Schedule follow-up jobs

### 2. Twilio SMS Webhook (`/api/twilio/incoming-sms/route.ts`)
**Entry Point:** Incoming SMS to Twilio number  
**Helper:** `processInboundSMS()` in `sms-processing.ts`  
**Idempotency:** Message idempotency constraint  
**Flow:**
1. Validate Twilio signature
2. Extract media and content
3. Handle opt-in/opt-out keywords
4. Lookup or create lead
5. Get/create conversation
6. Insert message
7. Process media downloads
8. AI enrichment
9. Cancel follow-ups if AI intake complete

### 3. Twilio Voicemail Callback (`/api/twilio/voicemail/route.ts`)
**Entry Point:** Voicemail recording callback  
**Helper:** `db.getOrCreateCallIntakeRecords()` with `requireValidCall: false`  
**Idempotency:** Call SID guard, trusted path  
**Flow:**
1. Validate Twilio signature
2. Lookup business by Twilio number
3. Check ignored contacts
4. Normalize caller phone
5. Get/create canonical lead and conversation (trusted path)
6. Insert voicemail recording
7. Create notification
8. SMS deferred to recording-status callback

### 4. Manual Lead Creation UI (`AddCustomerModal.tsx`)
**Entry Point:** User clicks "Add Customer" button  
**API:** `/api/leads/manual-create/route.ts`  
**Idempotency:** Phone uniqueness constraint  
**Flow:**
1. User enters phone and optional details
2. Client-side phone validation
3. POST to manual-create API
4. Merge manual intake data
5. Create or reuse lead
6. Create conversation
7. Trigger timeline events
8. Schedule follow-up jobs

### 5. Manual Lead Creation API (`/api/leads/manual-create/route.ts`)
**Entry Point:** API endpoint for manual lead creation  
**Helper:** `db.createLead()` with merge logic  
**Idempotency:** Phone uniqueness constraint  
**Flow:**
1. Validate authentication and business ownership
2. Normalize phone number
3. Check for existing lead
4. Merge manual intake data
5. Create or update lead
6. Create conversation
7. Trigger timeline events
8. Schedule follow-up jobs
9. Send notification

### 6. Generic Leads API (`/api/leads/route.ts`)
**Entry Point:** Generic POST for lead creation  
**Helper:** Direct database operations  
**Idempotency:** Phone uniqueness constraint  
**Flow:**
1. Validate authentication
2. Normalize phone to E.164
3. Check for existing lead
4. Create or reuse lead
5. Get/create conversation
6. Return lead and conversation

### 7. Admin Test Lead API (`/api/admin/create-test-lead/route.ts`)
**Entry Point:** Admin-only test lead creation  
**Helper:** Direct database operations  
**Idempotency:** Random phone generation  
**Flow:**
1. Validate admin authorization
2. Generate random phone number
3. Create test lead
4. Create test message
5. Create test call event
6. Log creation

### 8. AI Call Assistant Start (`/api/twilio/ai-assistant/start/route.ts`)
**Entry Point:** AI call session initialization  
**Helper:** `createAISession()`  
**Idempotency:** Call SID guard  
**Flow:**
1. Validate Twilio signature
2. Lookup business
3. Check feature flags
4. Check for existing lead
5. Create AI session
6. Phase 0: Fall back to voicemail (WebSocket limitation)

---

## Part 3: Canonical Helper Analysis

### Primary Canonical Helper: `db.getOrCreateCallIntakeRecords()`

**Location:** `src/lib/supabase/admin.ts` (lines 1227-1433)  
**Purpose:** Get or create canonical lead and conversation for a CallSid  
**Usage:** Voice webhook, voicemail callback, AI assistant

**Logic Flow:**
1. **Lead Lookup:** Search for existing lead by phone within 24 hours
2. **Lead Reuse Policy:** Reuse if recent (≤24h), create new if older
3. **Lead Creation:** Create with Call SID idempotency guard
4. **Conversation Resolution:** Use `getOrCreateConversation()` helper
5. **Call Event Update:** Link conversation to call event

**Key Features:**
- **Call SID Idempotency:** Prevents duplicate leads from same call
- **Recent Caller Reuse:** Prevents duplicate leads within 24 hours
- **Phantom Lead Prevention:** Requires valid call event (unless trusted path)
- **Retry Logic:** Bounded retry for transient database errors

### Secondary Canonical Helper: `db.getOrCreateConversation()`

**Location:** `src/lib/supabase/admin.ts` (lines 1535-1588)  
**Purpose:** Get or create canonical conversation for a lead  
**Usage:** All lead creation paths

**Canonical Selection Order:**
1. **Prefer conversation with messages** (real customer conversation)
2. **Otherwise use oldest conversation** for the lead
3. **If none exists, create new conversation**

**Key Features:**
- **Message-based selection:** Prefers conversations with actual messages
- **Historical duplicate handling:** Selects canonical from multiple conversations
- **Idempotency guard:** Checks for existing active/open conversations

### Conversation Creation Helper: `db.createConversation()`

**Location:** `src/lib/supabase/admin.ts` (lines 1590-1636)  
**Purpose:** Direct conversation creation with idempotency  
**Usage:** Voicemail callback, manual creation

**Idempotency Logic:**
- Checks for existing conversation with same lead_id + business_id
- Only creates if no active/open conversation exists
- Returns existing conversation if found

---

## Part 4: Phone Normalization Audit

### Normalization Utilities

#### 1. `normalizePhoneNumberForStorage()` (admin.ts)
**Location:** `src/lib/supabase/admin.ts`  
**Purpose:** Normalize phone for database storage  
**Format:** E.164 (+1XXXXXXXXXX)  
**Usage:** Lead creation, call event recording

**Logic:**
- Strip non-digit characters
- Add +1 for 10-digit US numbers
- Preserve existing + prefix
- Handle various input formats

#### 2. `normalizeUSPhoneNumber()` (phone-normalization.ts)
**Location:** `src/lib/phone-normalization.ts`  
**Purpose:** Normalize US phone to E.164 format  
**Format:** E.164 (+1XXXXXXXXXX)  
**Usage:** Display formatting, validation

**Features:**
- Handles 10-digit, 11-digit, and E.164 inputs
- Validates US phone format
- Provides display formatting
- Includes test cases

#### 3. `normalizePhoneNumber()` (twilio.ts)
**Location:** `src/lib/twilio.ts`  
**Purpose:** Normalize phone for Twilio operations  
**Format:** E.164 (+1XXXXXXXXXX)  
**Usage:** SMS sending, Twilio webhooks

**Logic:**
- Strip non-digit characters
- Add +1 for 10-digit numbers
- Handle country codes
- Used consistently in Twilio operations

#### 4. Digit-only Normalization (phone-utils.ts)
**Location:** `src/lib/phone-utils.ts`  
**Purpose:** Normalize to digit-only for comparison  
**Format:** XXXXXXXXXX  
**Usage:** Phone matching, search

**Features:**
- Strip all non-digit characters
- Phone comparison logic
- Country code handling

### Consistency Analysis

**Strengths:**
- All utilities converge on E.164 for storage
- Digit-only used for comparison
- Consistent handling of US numbers
- Comprehensive test coverage

**Gaps:**
- Multiple utilities with similar purposes
- No single source of truth for normalization
- Potential for inconsistency if utilities diverge

**Recommendation:**
- Consolidate to single normalization utility
- Add comprehensive test suite
- Document normalization rules

---

## Part 5: Database Schema Audit

### Core Tables

#### leads Table
**Migration:** `20260527000000_create_leads_and_conversations.sql`  
**Updates:** Multiple migrations for status, soft delete, timestamps, payment

**Key Columns:**
- `id` (UUID, PK)
- `business_id` (UUID, FK to businesses, ON DELETE CASCADE)
- `phone` (TEXT, NOT NULL)
- `name` (TEXT)
- `email` (TEXT)
- `source` (TEXT, CHECK: ai_voice, sms, manual, web)
- `status` (TEXT, CHECK: new, active, scheduled, payment_requested, paid, completed, lost, archived)
- `payment_status` (TEXT, CHECK: none, pending, paid, failed, cancelled)
- `raw_metadata` (JSONB)
- `deleted_at` (TIMESTAMPTZ, soft delete)
- `deleted_by` (UUID, FK to auth.users)
- `restored_at` (TIMESTAMPTZ)
- `deletion_reason` (TEXT)
- `first_contact_at` (TIMESTAMPTZ)
- `last_message_at` (TIMESTAMPTZ)
- `last_activity_at` (TIMESTAMPTZ)
- `conversation_id` (UUID, FK to conversations)
- `last_payment_request_id` (UUID, FK to payment_requests)
- `last_payment_amount_cents` (INTEGER)
- `last_payment_requested_at` (TIMESTAMPTZ)
- `last_payment_paid_at` (TIMESTAMPTZ)

**Constraints:**
- UNIQUE(business_id, phone)
- Indexes on business_id, phone, status, source, created_at, payment_status, timestamps, conversation_id

**RLS Policies:**
- Users can view leads for their businesses
- System can insert/update leads

#### conversations Table
**Migration:** `20260527000000_create_leads_and_conversations.sql`

**Key Columns:**
- `id` (UUID, PK)
- `lead_id` (UUID, FK to leads, ON DELETE CASCADE)
- `business_id` (UUID, FK to businesses, ON DELETE CASCADE)
- `call_sid` (TEXT)
- `ai_call_session_id` (UUID, FK to ai_call_sessions)
- `status` (TEXT, CHECK: active, closed, archived)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Constraints:**
- Indexes on lead_id, business_id, call_sid, status, created_at

**RLS Policies:**
- Users can view conversations for their businesses
- System can insert/update conversations

#### messages Table
**Migration:** `20260527000000_create_leads_and_conversations.sql`

**Key Columns:**
- `id` (UUID, PK)
- `conversation_id` (UUID, FK to conversations, ON DELETE CASCADE)
- `lead_id` (UUID, FK to leads, ON DELETE CASCADE)
- `business_id` (UUID, FK to businesses, ON DELETE CASCADE)
- `direction` (TEXT, CHECK: inbound, outbound)
- `body` (TEXT, NOT NULL)
- `from_phone` (TEXT)
- `to_phone` (TEXT)
- `twilio_message_sid` (TEXT, UNIQUE)
- `status` (TEXT)
- `sent_at` (TIMESTAMPTZ)
- `status_updated_at` (TIMESTAMPTZ)
- `error_code` (TEXT)
- `error_message` (TEXT)
- `is_manual` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

**Constraints:**
- UNIQUE constraint on twilio_message_sid
- Indexes on conversation_id, lead_id, business_id, direction, created_at

**RLS Policies:**
- Users can view messages for their businesses
- System can insert messages

#### call_events Table
**Migration:** Not found in migrations (inferred from usage)

**Key Columns (inferred):**
- `id` (UUID, PK)
- `business_id` (UUID, FK to businesses)
- `lead_id` (UUID, FK to leads)
- `conversation_id` (UUID, FK to conversations)
- `twilio_call_sid` (TEXT, UNIQUE)
- `phone` (TEXT)
- `call_status` (TEXT)
- `sms_pending` (BOOLEAN)
- `sms_scheduled_at` (TIMESTAMPTZ)
- `sms_sent_at` (TIMESTAMPTZ)
- `sms_message_sid` (TEXT)
- `created_at` (TIMESTAMPTZ)

**Constraints:**
- UNIQUE on twilio_call_sid
- Indexes on sms_pending, twilio_call_sid

#### follow_up_jobs Table
**Migration:** `add_step_to_follow_up_jobs.sql`, `add_conversation_id_to_follow_up_jobs.sql`

**Key Columns:**
- `id` (UUID, PK)
- `lead_id` (UUID, FK to leads)
- `business_id` (UUID, FK to businesses)
- `conversation_id` (UUID, FK to conversations)
- `message_body` (TEXT)
- `status` (TEXT)
- `scheduled_for` (TIMESTAMPTZ)
- `step` (INTEGER, NOT NULL DEFAULT 1)
- `idempotency_key` (TEXT, UNIQUE)
- `paused_at` (TIMESTAMPTZ)
- `paused_by` (TEXT)
- `cancellation_reason` (TEXT)
- `created_at` (TIMESTAMPTZ)

**Constraints:**
- UNIQUE on idempotency_key
- Indexes on step, conversation_id

#### payment_requests Table
**Migration:** `20260627000000_create_payment_requests.sql`

**Key Columns:**
- `id` (UUID, PK)
- `business_id` (UUID, FK to businesses)
- `lead_id` (UUID, FK to leads)
- `conversation_id` (UUID, FK to conversations)
- `amount_cents` (INTEGER)
- `currency` (TEXT)
- `status` (TEXT)
- `provider` (TEXT)
- `stripe_checkout_session_id` (TEXT)
- `stripe_payment_intent_id` (TEXT)
- `venmo_handle` (TEXT)
- `paypal_link` (TEXT)
- `raw_metadata` (JSONB)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Constraints:**
- Indexes on business_id, lead_id, conversation_id, status

**RLS Policies:**
- Users can view payment requests for their businesses
- System can insert/update payment requests

#### ai_call_records Table
**Migration:** `20260529000000_create_ai_call_records.sql`

**Key Columns:**
- `id` (UUID, PK)
- `business_id` (UUID, FK to businesses)
- `lead_id` (UUID, FK to leads, ON DELETE SET NULL)
- `conversation_id` (UUID, FK to conversations, ON DELETE SET NULL)
- `caller_phone` (TEXT, NOT NULL)
- `forwarded_from` (TEXT)
- `call_sid` (TEXT, UNIQUE)
- `ai_session_id` (TEXT, UNIQUE)
- `outcome` (TEXT, CHECK: completed, caller_hung_up, ai_failed, voicemail_fallback)
- `transcript` (JSONB)
- `extracted_info` (JSONB)
- `summary` (TEXT)
- `extraction_failed` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Constraints:**
- UNIQUE on call_sid, ai_session_id
- Indexes on business_id, lead_id, conversation_id, call_sid, outcome, caller_phone

**RLS Policies:**
- Users can view AI call records for their businesses
- System can insert/update/delete AI call records

#### voicemail_recordings Table
**Migration:** `20250526000000_create_voicemail_recordings.sql`

**Key Columns:**
- `id` (UUID, PK)
- `business_id` (UUID, FK to businesses)
- `lead_id` (UUID, FK to leads)
- `conversation_id` (UUID, FK to conversations)
- `call_sid` (TEXT, NOT NULL)
- `recording_sid` (TEXT, NOT NULL)
- `recording_url` (TEXT, NOT NULL)
- `recording_duration` (INTEGER)
- `recording_status` (TEXT, NOT NULL)
- `transcription_text` (TEXT)
- `transcription_status` (TEXT)
- `caller_phone` (TEXT, NOT NULL)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Constraints:**
- Indexes on business_id, lead_id, conversation_id, call_sid, recording_sid

**RLS Policies:**
- Users can view voicemail recordings for their businesses
- System can insert/update voicemail recordings

### Schema Strengths
- Comprehensive foreign key relationships
- Proper CASCADE and SET NULL actions
- Row Level Security (RLS) on all tables
- Unique constraints for idempotency
- Extensive indexing for performance
- Soft delete support on leads
- Payment tracking integration

### Schema Gaps
- call_events table migration not found (inferred from usage)
- Potential missing indexes on frequently queried columns
- No database-level triggers for timestamp updates (rely on app-level)

---

## Part 6: Foreign Key/Orphan Audit

### Foreign Key Relationships

**leads → businesses:**
- ON DELETE CASCADE
- Prevents orphaned leads when business deleted

**conversations → leads:**
- ON DELETE CASCADE
- Prevents orphaned conversations when lead deleted

**conversations → businesses:**
- ON DELETE CASCADE
- Prevents orphaned conversations when business deleted

**messages → conversations:**
- ON DELETE CASCADE
- Prevents orphaned messages when conversation deleted

**messages → leads:**
- ON DELETE CASCADE
- Prevents orphaned messages when lead deleted

**messages → businesses:**
- ON DELETE CASCADE
- Prevents orphaned messages when business deleted

**ai_call_records → leads:**
- ON DELETE SET NULL
- Allows AI records to persist when lead deleted

**ai_call_records → conversations:**
- ON DELETE SET NULL
- Allows AI records to persist when conversation deleted

**payment_requests → leads:**
- ON DELETE SET NULL
- Allows payment requests to persist when lead deleted

**payment_requests → conversations:**
- ON DELETE SET NULL
- Allows payment requests to persist when conversation deleted

### Orphan Detection

**Jobs Orphan Detection:**
**Script:** `migrations/01_identify_orphaned_jobs.sql`  
**Purpose:** Identify jobs without lead_id  
**Classification:**
- `invalid_phone`: Phone doesn't meet validity criteria
- `no_match`: No lead with matching phone
- `unique_match`: Exactly one lead with matching phone
- `ambiguous_match`: Multiple leads with matching phone

**Conversations Duplicate Detection:**
**Script:** `migrations/identify_duplicate_conversations.sql`  
**Purpose:** Find leads with multiple conversations  
**Metrics:**
- Businesses with duplicates
- Leads with duplicates
- Total duplicate conversations
- Excess conversations

### Orphan Prevention

**Application-Level Guards:**
- Lead creation requires valid business_id
- Conversation creation requires valid lead_id
- Message creation requires valid conversation_id
- Payment request creation requires valid lead_id

**Database-Level Guards:**
- Foreign key constraints enforce referential integrity
- CASCADE actions prevent orphaned records
- SET NULL actions preserve audit trail

### Recommendations

**Immediate:**
- Run orphan detection scripts on production
- Backfill orphaned jobs with lead_id where possible
- Review and merge duplicate conversations

**Long-term:**
- Add database triggers for orphan detection
- Implement periodic orphan cleanup jobs
- Add monitoring for orphan record creation

---

## Part 7: Conversation Resolution Audit

### Canonical Selection Logic

**Primary Helper:** `db.getOrCreateConversation()`  
**Location:** `src/lib/supabase/admin.ts` (lines 1535-1588)

**Selection Algorithm:**
1. Fetch all conversations for lead_id + business_id
2. Sort by created_at (oldest first)
3. **Prefer conversation with messages** (real customer conversation)
4. **Fallback to oldest conversation** if no messages
5. **Create new conversation** if none exists

**Rationale:**
- Conversations with messages represent real customer interactions
- Oldest conversation represents first contact
- Prevents creating duplicate conversations for same lead

### Historical Duplicate Handling

**Problem:** Multiple conversations can exist for same lead  
**Solution:** Canonical selection prefers conversations with messages

**Example:**
- Conversation A (created: 2024-01-01, messages: 0)
- Conversation B (created: 2024-01-02, messages: 5)
- **Selected:** Conversation B (has messages)

### Conversation Creation Idempotency

**Helper:** `db.createConversation()`  
**Location:** `src/lib/supabase/admin.ts` (lines 1590-1636)

**Idempotency Logic:**
- Check for existing conversation with same lead_id + business_id
- Only create if no active/open conversation exists
- Return existing conversation if found

**Status Check:**
- Checks for status IN ('active', 'open')
- Prevents duplicate active conversations

### Conversation Status Values

**Current Values:**
- `active`: Active conversation
- `open`: Open conversation
- `closed`: Closed conversation
- `archived`: Archived conversation

**Note:** Both 'active' and 'open' are used for active conversations

### Recommendations

**Immediate:**
- Standardize on single active status value
- Add database constraint to prevent duplicate active conversations
- Run duplicate conversation detection script

**Long-term:**
- Implement conversation merging logic
- Add conversation archival process
- Monitor for duplicate conversation creation

---

## Part 8: UI Creation Flow Audit

### Manual Lead Creation UI

**Component:** `AddCustomerModal.tsx`  
**Location:** `src/components/AddCustomerModal.tsx`

**Flow:**
1. User clicks "Add Customer" button
2. Modal opens with phone input field
3. User enters phone number (client-side validation)
4. User optionally enters name and notes
5. User clicks "Add Customer"
6. POST to `/api/leads/manual-create`
7. Success: Modal closes, notification shown
8. Error: Error message displayed

**Validation:**
- Phone number required
- Phone format validation (client-side)
- Business ownership validation (server-side)

**Features:**
- Phone formatting display
- Error handling
- Success callback
- Loading state

### Lead Status Management UI

**Component:** `LeadStatusDropdown.tsx`  
**Location:** `src/components/LeadStatusDropdown.tsx`

**Features:**
- Dropdown for status selection
- Status icons and descriptions
- Loading state during update
- Portal-based dropdown positioning

**Status Values:**
- new, active, scheduled, payment_requested, paid, completed, lost

### Lead Display UI

**Component:** `RecentLeads.tsx`  
**Location:** `src/components/RecentLeads.tsx`

**Features:**
- Displays recent leads with messages
- Lead status indicators
- Follow-up status display
- Quick action buttons
- Phone formatting

**Lead Status Logic:**
- Awaiting response: No inbound messages
- Conversation active: Latest inbound message has reply
- Needs response: Latest inbound message has no reply

### Lead List UI

**Page:** `/dashboard/leads/page.tsx`  
**Location:** `src/app/dashboard/leads/page.tsx`

**Features:**
- Paginated lead list
- Search and filter
- Status filtering
- Lead status dropdown
- Add customer modal
- Real-time updates

**Data Fetching:**
- Fetches leads with messages
- Uses Supabase realtime for updates
- Implements optimistic UI updates

### Lead Engagement Metrics UI

**Component:** `LeadEngagementCard.tsx`  
**Location:** `src/components/LeadEngagementCard.tsx`

**Metrics:**
- Total leads (30 days)
- Customer responses
- Engagement rate
- Recent replies (7 days)

**Logic:**
- Filters leads by business_id
- Counts inbound messages to business phone
- Calculates engagement percentage

### UI Strengths
- Comprehensive lead management UI
- Real-time updates
- Proper error handling
- Client-side validation
- Responsive design

### UI Gaps
- No bulk lead operations
- Limited lead export functionality
- No lead merge UI for duplicates
- Manual lead creation requires phone (can't create from call event)

---

## Part 9: Duplicate and Data Quality Audit

### Duplicate Detection Queries

**Jobs Orphan Detection:**
**Script:** `migrations/01_identify_orphaned_jobs.sql`

**Classification:**
- `invalid_phone`: Phone < 10 digits or in blacklist
- `no_match`: No lead with matching normalized phone
- `unique_match`: Exactly one lead with matching phone
- `ambiguous_match`: Multiple leads with matching phone

**Metrics:**
- Total orphans
- Invalid phone count
- Unique match count
- Ambiguous match count
- No match count

**Conversations Duplicate Detection:**
**Script:** `migrations/identify_duplicate_conversations.sql`

**Metrics:**
- Businesses with duplicates
- Leads with duplicates
- Total duplicate conversations
- Excess conversations

**Canonical Selection:**
- Conversations with message counts
- Prefer conversation with messages
- Fallback to oldest conversation

### Data Quality Issues

**Phone Number Inconsistencies:**
- Multiple normalization formats
- Incomplete phone numbers
- Invalid phone formats
- Missing country codes

**Lead Duplicates:**
- Multiple leads for same phone
- Historical duplicates from before canonical logic
- Manual creation bypassing uniqueness checks

**Conversation Duplicates:**
- Multiple conversations per lead
- Historical duplicates from before canonical selection
- Race conditions in conversation creation

**Message Duplicates:**
- Duplicate SMS from webhook retries
- Failed message retries creating duplicates
- Idempotency gaps in message creation

### Data Quality Recommendations

**Immediate:**
- Run duplicate detection scripts
- Backfill orphaned jobs
- Merge duplicate leads
- Consolidate duplicate conversations

**Long-term:**
- Implement database-level deduplication
- Add data quality monitoring
- Implement periodic cleanup jobs
- Add data validation constraints

---

## Part 10: Concurrency and Idempotency Audit

### Idempotency Guards

#### Lead Creation Idempotency

**Call SID Guard:**
**Location:** `db.createLead()` in `admin.ts`  
**Mechanism:** Check for existing lead with same Call SID in raw_metadata  
**Usage:** Voice webhook, voicemail callback, AI assistant

```typescript
if (callSid) {
  const existingLead = await this.getLeadByCallSid(callSid)
  if (existingLead) {
    return existingLead
  }
}
```

**Phone Uniqueness Constraint:**
**Location:** Database schema  
**Mechanism:** UNIQUE(business_id, phone)  
**Usage:** All lead creation paths

**Retry Logic:**
**Location:** `db.createLead()` in `admin.ts`  
**Mechanism:** Bounded retry with transient error detection  
**Retry Delays:** 1s, 3s, 10s  
**Max Retries:** 3

```typescript
const retryDelays = [1000, 3000, 10000]
for (let attempt = 0; attempt <= maxRetries; attempt++) {
  // Attempt insert
  if (error && isTransient) {
    await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]))
  }
}
```

#### Conversation Creation Idempotency

**Status Check:**
**Location:** `db.createConversation()` in `admin.ts`  
**Mechanism:** Check for existing active/open conversation  
**Usage:** All conversation creation paths

```typescript
const { data: existingConversation } = await supabaseAdmin
  .from('conversations')
  .select('*')
  .eq('lead_id', conversation.lead_id)
  .eq('business_id', conversation.business_id)
  .in('status', ['active', 'open'])
  .maybeSingle()
```

#### Message Creation Idempotency

**Twilio Message SID Constraint:**
**Location:** Database schema  
**Mechanism:** UNIQUE(twilio_message_sid)  
**Usage:** SMS webhook, SMS sending

**Time-based Duplicate Prevention:**
**Location:** `sendSms()` in `twilio.ts`  
**Mechanism:** Check for duplicate message within 5 minutes  
**Usage:** Automated SMS sending

```typescript
const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
const { data: existingMessage } = await supabase
  .from('messages')
  .select('id, created_at, body, twilio_message_sid, status, error_code')
  .eq('lead_id', options.lead_id)
  .eq('body', message)
  .gte('created_at', fiveMinutesAgo)
  .maybeSingle()
```

**Failed Message Retry Logic:**
**Mechanism:** Allow retry if previous message failed  
**Check:** Only block if twilio_message_sid exists and no error

#### Follow-up Job Idempotency

**Idempotency Key:**
**Location:** `createFollowUpJobs()` in `follow-ups.ts`  
**Mechanism:** UNIQUE(idempotency_key) with format `${leadId}-${step}`  
**Usage:** Follow-up job creation

```typescript
const idempotencyKey = `${leadId}-${followUp.step}`
const existingJob = await db.getFollowUpJobByIdempotencyKey(idempotencyKey)
if (existingJob) {
  continue
}
```

#### Call Event Idempotency

**Twilio Call SID Check:**
**Location:** `db.createCallEvent()` in `admin.ts`  
**Mechanism:** Check for existing call event with same twilio_call_sid  
**Usage:** Voice webhook

```typescript
if (callEvent.twilio_call_sid) {
  const { data: existing } = await supabaseAdmin
    .from('call_events')
    .select('id')
    .eq('twilio_call_sid', callEvent.twilio_call_sid)
    .maybeSingle()
  if (existing) {
    return null
  }
}
```

### Concurrency Handling

**Lead Creation Race Conditions:**
- Phone uniqueness constraint prevents duplicates
- Retry logic handles transient errors
- Call SID guard prevents duplicate leads from same call

**Conversation Creation Race Conditions:**
- Canonical selection handles historical duplicates
- Status check prevents duplicate active conversations
- Retry logic handles transient errors

**Message Creation Race Conditions:**
- Twilio message SID constraint prevents duplicates
- Time-based duplicate prevention for automated messages
- Failed message retry logic

**Follow-up Job Race Conditions:**
- Idempotency key constraint prevents duplicates
- Step-based scheduling prevents overlap

### Transient Error Handling

**Transient Error Codes:**
- `PGRST116`: Not found
- `23505`: Unique violation
- `40001`: Serialization failure
- `40P01`: Deadlock

**Transient Error Detection:**
```typescript
isTransientDatabaseError(error: any): boolean {
  const transientCodes = ['PGRST116', '23505', '40001', '40P01']
  return transientCodes.includes(error.code) || 
         error.message?.includes('timeout') ||
         error.message?.includes('connection') ||
         error.message?.includes('network')
}
```

### Idempotency Strengths
- Comprehensive idempotency guards across all operations
- Database-level constraints for critical operations
- Application-level duplicate detection
- Retry logic for transient errors
- Time-based duplicate prevention

### Idempotency Gaps
- No database-level idempotency for lead creation (relies on app logic)
- No idempotency for payment request creation
- No idempotency for voicemail recording creation
- Potential race conditions in conversation creation

### Recommendations

**Immediate:**
- Add database-level idempotency for lead creation
- Add idempotency for payment request creation
- Add idempotency for voicemail recording creation
- Implement database-level conversation deduplication

**Long-term:**
- Implement distributed locking for critical operations
- Add idempotency keys for all write operations
- Implement event sourcing for audit trail
- Add comprehensive monitoring for idempotency violations

---

## Part 11: Target Architecture Gap Analysis

### Current Architecture Strengths

**Lead Lifecycle Management:**
- Clear status lifecycle with transitions
- Comprehensive lead metadata
- Payment status tracking
- Soft delete support

**Canonical Record Management:**
- Canonical lead selection logic
- Canonical conversation selection logic
- Historical duplicate handling
- Idempotency guards

**Integration Points:**
- Twilio voice and SMS webhooks
- Stripe Connect integration
- Google Calendar integration
- AI call assistant (Phase 0)

**Data Quality:**
- Phone normalization utilities
- Foreign key constraints
- RLS policies
- Comprehensive indexing

**Concurrency Control:**
- Idempotency guards
- Retry logic
- Transient error handling
- Database constraints

### Architecture Gaps

**Lead Creation:**
- No single source of truth for lead creation
- Multiple lead creation paths with inconsistent logic
- No database-level idempotency for lead creation
- No lead merge functionality

**Conversation Management:**
- No conversation archival process
- No conversation merge functionality
- Inconsistent status values (active vs open)
- No conversation lifecycle management

**Phone Normalization:**
- Multiple normalization utilities
- No single source of truth
- Potential for inconsistency
- No international phone support

**Data Quality:**
- No automated data quality monitoring
- No periodic cleanup jobs
- No duplicate prevention at database level
- No data validation constraints

**Concurrency Control:**
- No distributed locking
- No event sourcing
- No comprehensive monitoring
- No deadlock detection

**Payment Management:**
- No payment reconciliation
- No payment dispute handling
- No payment refund logic
- No payment analytics

**Follow-up Management:**
- No follow-up optimization
- No follow-up A/B testing
- No follow-up analytics
- No follow-up customization

### Target Architecture Recommendations

**Lead Management:**
1. Implement single lead creation service
2. Add database-level idempotency
3. Implement lead merge functionality
4. Add lead lifecycle triggers

**Conversation Management:**
1. Standardize on single active status
2. Implement conversation archival
3. Add conversation merge functionality
4. Implement conversation lifecycle triggers

**Phone Normalization:**
1. Consolidate to single utility
2. Add international phone support
3. Implement phone validation service
4. Add phone normalization tests

**Data Quality:**
1. Implement data quality monitoring
2. Add periodic cleanup jobs
3. Add database-level duplicate prevention
4. Implement data validation constraints

**Concurrency Control:**
1. Implement distributed locking
2. Add event sourcing
3. Implement comprehensive monitoring
4. Add deadlock detection

**Payment Management:**
1. Implement payment reconciliation
2. Add payment dispute handling
3. Implement payment refund logic
4. Add payment analytics

**Follow-up Management:**
1. Implement follow-up optimization
2. Add follow-up A/B testing
3. Implement follow-up analytics
4. Add follow-up customization

---

## Part 12: Recommendations and Next Steps

### Immediate Actions (Priority: High)

1. **Run Orphan Detection Scripts**
   - Execute `01_identify_orphaned_jobs.sql` on production
   - Execute `identify_duplicate_conversations.sql` on production
   - Review and categorize results
   - Plan backfill strategy

2. **Consolidate Phone Normalization**
   - Choose single normalization utility as source of truth
   - Update all usages to use canonical utility
   - Add comprehensive test suite
   - Document normalization rules

3. **Standardize Conversation Status**
   - Choose single active status value (recommend 'active')
   - Update database constraint
   - Update all UI and API usages
   - Add migration script

4. **Add Database-Level Idempotency**
   - Add idempotency key to leads table
   - Add idempotency key to payment_requests table
   - Add idempotency key to voicemail_recordings table
   - Update creation logic

### Short-term Actions (Priority: Medium)

1. **Implement Lead Merge Functionality**
   - Add API endpoint for lead merge
   - Implement merge logic (canonical selection)
   - Add UI for lead merge
   - Add audit trail

2. **Implement Conversation Archival**
   - Add archival status to conversations
   - Implement archival logic
   - Add archival job
   - Add UI for archival

3. **Add Data Quality Monitoring**
   - Implement data quality metrics
   - Add monitoring dashboard
   - Set up alerts for data quality issues
   - Implement periodic data quality checks

4. **Add Comprehensive Testing**
   - Add integration tests for lead creation
   - Add integration tests for conversation creation
   - Add integration tests for idempotency
   - Add load testing for concurrent operations

### Long-term Actions (Priority: Low)

1. **Implement Event Sourcing**
   - Design event schema
   - Implement event store
   - Add event replay functionality
   - Migrate to event-driven architecture

2. **Implement Distributed Locking**
   - Choose distributed locking solution
   - Implement locking service
   - Add locking to critical operations
   - Add deadlock detection

3. **Implement Advanced Analytics**
   - Add lead lifecycle analytics
   - Add conversation analytics
   - Add payment analytics
   - Add follow-up analytics

4. **Implement Advanced Follow-up Features**
   - Add follow-up optimization
   - Add follow-up A/B testing
   - Add follow-up customization
   - Add follow-up analytics

---

## Conclusion

The lead and customer management system demonstrates strong architectural patterns with comprehensive idempotency guards, robust phone normalization, and well-structured database schema. The system handles multiple lead creation paths effectively and provides canonical selection logic for handling historical duplicates.

Key strengths include:
- Comprehensive idempotency guards across all operations
- Well-structured database schema with proper foreign keys
- Canonical selection logic for lead and conversation resolution
- Robust phone normalization utilities
- Comprehensive integration with Twilio, Stripe, and Google Calendar

Key areas for improvement include:
- Consolidation of phone normalization utilities
- Standardization of conversation status values
- Addition of database-level idempotency
- Implementation of lead merge functionality
- Addition of data quality monitoring

The system is well-positioned for scaling and can be enhanced with the recommended improvements to further strengthen data quality, concurrency control, and operational efficiency.

---

**Report Generated:** July 11, 2026  
**Auditor:** Cascade AI Assistant  
**Version:** 1.0
