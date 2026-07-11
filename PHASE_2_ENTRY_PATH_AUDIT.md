# Phase 2: Entry Path Records Audit

## Overview
This document audits what records and relationships result from each current lead entry path in ReplyFlow.

## Entry Paths

### 1. Twilio Voice Call
**File:** `src/app/api/twilio/voice/route.ts` → `getOrCreateCallIntakeRecords()`

**Records Created:**
- **Lead:** Created via `LeadService.findOrCreateLead()` with status 'new', source 'call_intake'
- **Conversation:** Created via `getOrCreateConversation()` with status 'active'
- **Call Event:** Created early in webhook (before lead/conversation) with call_sid, call_status 'ringing'
- **Timeline Event:** `timelineEvents.callReceived()` logged
- **Source Metadata:** `raw_metadata.source = 'call_intake'`, includes callSid

**Records Resolved:**
- Checks `call_events` for existing conversation_id
- Checks `ai_call_sessions` for existing lead_id/conversation_id
- Uses canonical conversation selection (prefers conversation with messages)

**Conditional Records:**
- **AI Call Record:** Created if AI routing is enabled and guards pass
- **Voicemail Record:** Created if call goes to voicemail fallback
- **Follow-up Jobs:** Created if smart filtering allows and conditions met
- **Auto-reply SMS:** Created if smart filtering allows and conditions met

**Always Created:**
- Lead (if not existing and recent)
- Conversation (if not existing)
- Call Event (idempotent on call_sid)

---

### 2. Twilio Inbound SMS
**File:** `src/app/api/twilio/incoming-sms/route.ts` → `processInboundSms()`

**Records Created:**
- **Lead:** Created via `LeadService.createLead()` with status 'contacted', source 'sms'
- **Conversation:** Created via `getOpenConversationForLead()` or `createConversation()`
- **Message:** Created with direction 'inbound', status 'received', includes body and media
- **Timeline Event:** Not explicitly created (handled by message creation)
- **Source Metadata:** `raw_metadata.source = 'sms'`

**Records Resolved:**
- Uses `findLeadByPhoneAcrossBusinesses()` to find existing lead across businesses
- Uses `getOpenConversationForLead()` to find existing conversation
- Cancels pending follow-up jobs on customer reply

**Conditional Records:**
- **Follow-up Jobs:** Cancelled on customer reply
- **Opt-out Status:** Updated if STOP/START keywords detected

**Always Created:**
- Lead (if not existing)
- Conversation (if not existing)
- Message (always)

---

### 3. Voicemail Callback
**File:** `src/app/api/twilio/voicemail/route.ts`

**Records Created:**
- **Lead:** Created via `getOrCreateCallIntakeRecords()` with status 'new', source 'call_intake'
- **Conversation:** Created via `getOrCreateCallIntakeRecords()` with status 'active'
- **Voicemail Record:** Created with recording_url, transcription, duration
- **Timeline Event:** Logged for voicemail received
- **Source Metadata:** `raw_metadata.source = 'call_intake'`, includes voicemail data

**Records Resolved:**
- Uses `getLeadByPhone()` to find existing lead
- Uses `getOrCreateCallIntakeRecords()` to get/create lead and conversation
- Checks ignored contacts before creating records

**Conditional Records:**
- **AI Intake Summary:** Generated from voicemail transcription
- **Follow-up Jobs:** Created if conditions met

**Always Created:**
- Lead (if not existing)
- Conversation (if not existing)
- Voicemail Record (always)

---

### 4. Manual Lead Creation API
**File:** `src/app/api/leads/manual-create/route.ts`

**Records Created:**
- **Lead:** Created via `LeadService.createLead()` with status 'new', source 'manual_entry'
- **Conversation:** Created via `getOrCreateConversation()` with status 'active'
- **Timeline Event:** `timelineEvents.leadCreated()` logged
- **Source Metadata:** `raw_metadata.source = 'manual_entry'`, includes extracted_info (callerName, reasonForCalling, address, etc.)

**Records Resolved:**
- Uses `LeadService.findLead()` to find existing lead
- Reuses existing lead if not completed/ignored
- Updates existing lead with new manual intake data

**Conditional Records:**
- **Follow-up Jobs:** Created via `createFollowUpJobs()` if conditions met
- **Notification:** Sent via `notificationServiceServer`

**Always Created:**
- Lead (if not existing or existing is completed/ignored)
- Conversation (if not existing)

**Never Created:**
- Call Event
- Message
- AI Call Record
- Voicemail Record

---

### 5. Generic Leads API
**File:** `src/app/api/leads/route.ts`

**Records Created:**
- **Lead:** Created via `LeadService.createLead()` with status 'new', source 'manual_payment_request'
- **Conversation:** Created via `getOrCreateConversation()` with status 'active'
- **Source Metadata:** `raw_metadata.source = 'manual_payment_request'`, includes customerName if provided

**Records Resolved:**
- Uses `LeadService.findLead()` to find existing lead
- Reuses existing lead if found

**Conditional Records:**
- None (used for payment request initialization)

**Always Created:**
- Lead (if not existing)
- Conversation (if not existing)

**Never Created:**
- Call Event
- Message
- AI Call Record
- Voicemail Record
- Timeline Event

---

### 6. Admin Test Lead API
**File:** `src/app/api/admin/create-test-lead/route.ts`

**Records Created:**
- **Lead:** Created via `LeadService.createLead()` with status 'new', source 'admin_test'
- **Message:** Created with direction 'inbound', body 'This is a test message created for UI testing.'
- **Call Event:** Created with call_sid `test_call_${Date.now()}`, call_status 'completed', call_duration 30
- **Source Metadata:** `raw_metadata.source = 'admin_test'`, includes extracted_info (callerName)

**Records Resolved:**
- None (always creates new test lead with random phone number)

**Conditional Records:**
- None (all test records always created)

**Always Created:**
- Lead
- Message
- Call Event

**Never Created:**
- Conversation (not created, but message references lead_id directly)
- AI Call Record
- Voicemail Record
- Timeline Event

---

### 7. AI Call Assistant Start
**File:** `src/app/api/twilio/ai-assistant/start/route.ts`

**Records Created:**
- **AI Session:** Created via `createAISession()` with lead_id (if existing) or null
- **Call Event:** Created in voice webhook before AI routing

**Records Resolved:**
- Uses `getLeadByPhone()` to find existing lead
- Passes existing lead_id to AI session if found

**Conditional Records:**
- **AI Call Record:** Created in voice webhook if AI routing succeeds
- **Lead/Conversation:** Created in voice webhook via `getOrCreateCallIntakeRecords()` (not in this route)

**Always Created:**
- AI Session

**Never Created:**
- Lead (only lookup)
- Conversation (only lookup in voice webhook)
- Message
- Voicemail Record

---

## Summary Table

| Path | Lead | Conversation | Message | Call Event | AI Call Record | Voicemail | Timeline | Follow-up | Source |
|------|------|-------------|---------|------------|---------------|-----------|----------|-----------|--------|
| Voice Call | ✓ | ✓ | - | ✓ | Conditional | Conditional | ✓ | Conditional | call_intake |
| Inbound SMS | ✓ | ✓ | ✓ | - | - | - | - | Cancelled | sms |
| Voicemail | ✓ | ✓ | - | - | - | ✓ | ✓ | Conditional | call_intake |
| Manual Create | ✓ | ✓ | - | - | - | - | ✓ | Conditional | manual_entry |
| Generic API | ✓ | ✓ | - | - | - | - | - | - | manual_payment_request |
| Admin Test | ✓ | - | ✓ | ✓ | - | - | - | - | admin_test |
| AI Assistant | Lookup | Lookup | - | ✓ | Conditional | - | - | - | - |

## Key Findings

### Inconsistencies Found:

1. **Admin Test Lead API** creates message and call_event but **does not create conversation** - this is a potential issue for message display
2. **Conversation Status Inconsistency:** Some paths use 'active', some use 'open' (need to verify in code)
3. **Source Metadata Values:** Different source values across paths (call_intake, sms, manual_entry, manual_payment_request, admin_test)
4. **Timeline Events:** Not consistently created across all paths
5. **Conversation Creation Timing:** Some paths create conversation eagerly, some lazily

### Records That Should Always Exist vs Conditional:

**Always Created (Canonical Foundation):**
- Lead (with normalized phone, business_id, status, source metadata)
- Conversation (when messaging occurs or lead is manually created)

**Conditional (Event-Specific):**
- Message (only when actual messaging occurs)
- Call Event (only for Twilio calls)
- AI Call Record (only for AI-assisted calls)
- Voicemail Record (only for voicemails)
- Follow-up Jobs (only when conditions met)
- Timeline Events (only for specific events)

### Manual Lead Parity Issues:

1. **Admin Test Lead** lacks conversation - messages reference lead_id directly, may break conversation-based features
2. **Generic API** does not create timeline event - may affect activity tracking
3. **Manual Create** creates conversation eagerly - may create empty conversations for leads that never message

### Conversation Status Semantics:

Need to audit actual status values used in code - both 'active' and 'open' appear in conversation lookups.
