# AI Intake Confirmation SMS Polish - Canonical Path Analysis

**Date:** 2025-01-09
**Goal:** Polish AI intake confirmation SMS to be concise and professional
**Status:** Analysis Complete

---

## Part 1 — Canonical SMS Path Tracing

### Exact Current Runtime Path

1. **External AI Voice Service** → `/api/ai-confirmation-sms/route.ts` (POST)
2. Route validates INTERNAL_API_SECRET and business ownership
3. Route fetches latest `ai_call_record` from database (includes customer corrections)
4. Route normalizes extractedInfo using `normalizeExtractedInfo` (ai-field-mapping.ts)
5. Route calls `dispatchAutomaticCustomerSms` (auto-sms-dispatcher.ts)
6. `dispatchAutomaticCustomerSms` calls `generateSummaryFromExtractedInfo` (sms-processing.ts)
7. `generateSummaryFromExtractedInfo` calls `formatAdaptiveIntakeSms` (ai-intake-formatter.ts)
8. `formatAdaptiveIntakeSms` constructs and returns the SMS body
9. SMS body is sent to Twilio via `sendSms` (twilio.ts)
10. Message row persisted to database with exact outbound body

### Call Sites

**Primary Production Path:**
- `/api/ai-confirmation-sms/route.ts` → `dispatchAutomaticCustomerSms` → `generateSummaryFromExtractedInfo` → `formatAdaptiveIntakeSms`

**Secondary Paths (Legacy/Alternative):**
- `formatAiIntakeSummary` (used by dashboard UI, NOT SMS)
- `formatAiIntakeSummaryWithMode` (used by dashboard UI, NOT SMS)

**Finalization Paths:**
- All paths converge on `formatAdaptiveIntakeSms` via `generateSummaryFromExtractedInfo`
- No alternative SMS formatters found

### Field Selection

**Current Field Used:**
- `serviceRequested` (canonical) → falls back to `reasonForCalling` (Simple Mode alias)

**Normalization Applied:**
- `normalizeServiceReason` (ai-intake-formatter.ts lines 135-193)
  - Removes conversational prefixes: "I'd like to", "I want to", "I need to", "I'm calling because", etc.
  - Removes leading filler: "And", "So", "Well", "Um", "Uh", "Yeah"
  - Applies `safeTrimAndCapitalize` for basic cleanup
  - Applies `sanitizeServiceRequested` for content sanitization

**What normalizeServiceReason Does NOT Do:**
- ❌ Remove conversational filler like "I was looking to get", "I need someone to"
- ❌ Remove duplicate words like "the the"
- ❌ Remove referral commentary ("recommended by a friend")
- ❌ Remove "you guys", "come do it for my house"
- ❌ Convert verbose speech into concise summaries
- ❌ Generate professional job titles

**Existing Summarizer Available:**
- `generateCanonicalRequestTitle` (ai-intake-formatter.ts lines 269-468)
  - Removes all conversational prefixes and filler
  - Removes pronouns and personal references
  - Removes scheduling and timing information
  - Removes property size and descriptions
  - Removes common filler words
  - Maps to industry-specific service titles (Lawn Mowing, AC Repair, etc.)
  - Falls back to noun extraction for unknown services
  - **NOT CURRENTLY USED IN SMS PATH**

### Business and Customer Name Interpolation

**Location:**
- `formatAdaptiveIntakeSms` lines 950-951, 972-976, 1000-1001, 1025-1026, 1075-1076

**Current Implementation:**
```typescript
const displayName = businessName && businessName.trim() ? businessName : null;
const businessPart = displayName ? ` Thanks for reaching out to ${displayName}.` : ' Thanks for reaching out.';
```

**Problem:**
- No whitespace trimming on businessName before interpolation
- Can produce: "Thanks for reaching out to Production ." (space before period)
- Customer name uses `normalizeCustomerName` which rejects phone numbers but doesn't reject placeholders

### SMS Persistence

**Timing:**
- SMS body generated BEFORE Twilio delivery
- Exact body persisted in database messages table
- Twilio Message SID persisted after delivery

**Idempotency:**
- Check 1: `ai_summary_sms_call_sid` in lead.raw_metadata (callSid-based)
- Check 2: Fallback to `ai_confirmation_sms_call_sid` (legacy)
- Check 3: Fallback to messages table query (conversationId + time window)
- Retry logic re-checks idempotency before retry
- Same body regenerated on retry (no body persistence before send)

### Root Cause of Raw Transcript-Style Message

**Exact Root Cause:**
The production SMS path uses `formatAdaptiveIntakeSms` which applies `normalizeServiceReason` to the service requested field. `normalizeServiceReason` only removes leading conversational prefixes but preserves the remaining conversational text, including:
- Conversational filler ("I was looking to get", "I need someone to")
- Duplicate words ("the the")
- Referral commentary ("recommended by a friend")
- Informal language ("you guys", "come do it for my house")
- Full sentence structure instead of concise summary

**Why This Happens:**
ReplyFlow has a sophisticated summarizer (`generateCanonicalRequestTitle`) that produces concise professional titles, but it's only used in `formatAiIntakeSummary` for the dashboard UI. The SMS path uses `formatAdaptiveIntakeSms` which was designed for partial intake acknowledgment and does not apply the same summarization logic.

---

## Part 2 — SMS Design Requirements

### Target Output for Demonstrated Intake

```text
Hi Ryan! Thanks for reaching out to Production.

Here's what we captured:

• Service: Plumbing installation for a new-construction home

• Address: 1632 South Pine Drive

• Preferred timing: Within the next month

• Best callback time: Afternoon

We've shared this with the team, and they'll follow up soon. Reply here if anything changes.
```

### Required Formatting Rules

1. One blank line after the greeting
2. One blank line after "Here's what we captured:"
3. One blank line between every included field
4. One blank line before the closing paragraph
5. No duplicate blank lines when optional fields are absent
6. No leading or trailing whitespace
7. Consistent line endings (LF)
8. Concise, human-readable field labels
9. Preserve customer-friendly tone
10. Trim business name before interpolation
11. Never produce space before punctuation
12. Use normalized customer first name when available
13. Natural generic greeting when name unavailable

### Canonical Field Order

1. Service
2. Address (when relevant and captured)
3. Preferred timing (when captured)
4. Best callback time (when captured)

---

## Part 3 — Service-Request Cleanup Strategy

### Existing Formatter to Reuse

**Function:** `generateCanonicalRequestTitle` (ai-intake-formatter.ts lines 269-468)

**Capabilities:**
- ✅ Removes conversational prefixes ("I was looking to", "I need someone to")
- ✅ Removes leading filler ("And", "So", "Well", "Um", "Uh", "Yeah")
- ✅ Removes pronouns and personal references
- ✅ Removes scheduling and timing information
- ✅ Removes property size and descriptions
- ✅ Removes common filler words
- ✅ Maps to industry-specific service titles (Lawn Mowing, AC Repair, Plumbing Repair, etc.)
- ✅ Falls back to noun extraction for unknown services
- ✅ Always returns non-empty (fallback to "General Service")

**For Demonstrated Input:**
```text
I was looking to get some new pipes installed in my new house. It's getting built right now, and I'm trying to get the the piping all set up. And I was recommended to you guys by a friend. So I'd like you guys to come do it for my house
```

**Current Output of generateCanonicalRequestTitle:**
- Would likely map to "Plumbing Installation" or "Plumbing Service" based on "pipes" noun
- Removes conversational framing
- Removes referral commentary
- Removes duplicate "the the"

**Gap to Address:**
- Does not capture "new-construction home" context from the transcript
- May need enhancement to preserve meaningful context when available

### Implementation Strategy

1. **Modify formatAdaptiveIntakeSms** to use `generateCanonicalRequestTitle` for the Service field
2. **Keep original raw serviceRequested** preserved in:
   - Database (ai_call_records.extracted_info)
   - Lead raw_metadata
   - Transcript
   - Internal AI intake details
3. **Add fallback** to cleaned version if summarization fails
4. **No new AI calls** - reuse existing deterministic logic

---

## Part 4 — Timing and Callback Normalization

### Current Implementation
- `normalizeTiming` (lines 731-764) removes timing-specific prefixes only
- Does not polish conversational wrappers

### Required Enhancements
- "Sometime in the next month, if that's possible" → "Within the next month"
- "Sometime in the afternoon" → "Afternoon"
- "As soon as you guys can get here" → "As soon as possible"
- Preserve meaningful dates/time windows
- Keep 12-hour AM/PM format for exact times
- Remove seconds
- Do not fabricate exact dates
- Do not convert vague timing into firm appointments

---

## Part 5 — Address Handling

### Current Implementation
- `normalizeAddress` (lines 496-545) with spoken number conversion
- `normalizeAddressForDisplay` (lines 486-492) removes trailing periods
- Service location type check in `formatAdaptiveIntakeSms` (lines 953-956)

### Requirements
- Preserve unit/apartment information
- Preserve city/state/postal when captured
- Do not invent missing components
- Respect service-location modes (onsite, customer_comes_to_business, remote)
- Do not replace customer address with business address
- Do not change Schedule Map geocoding

---

## Part 6 — Business and Customer Name Safety

### Current Problems
1. Business name not trimmed before interpolation → "Production ."
2. Customer name does not reject placeholders
3. Can produce "Hi Unknown!" or "Hi undefined!"

### Required Normalization
- Trim leading/trailing whitespace from business name
- Collapse internal whitespace (safe cases only)
- Reject placeholders: Unknown, Not Provided, Not Collected, N/A, Caller, Customer
- Never produce space before punctuation
- Natural generic greeting when name unavailable

---

## Part 7 — Partial-Intake Behavior

### Current Implementation
`formatAdaptiveIntakeSms` has 4 levels:
- Level A (minimal): No useful info → simple reply prompt
- Level B (service only): Personalized acknowledgment
- Level C (partial): Service + some context
- Level D (complete): Sufficient information

### Required Changes
- Level D should use complete-intake closing: "We've shared this with the team..."
- Levels A-C should use partial-intake closing: "We've shared these details with the team..."
- Include only valid captured fields
- One blank line between included fields
- No duplicate blank lines
- No dangling labels

---

## Part 8 — SMS Length and Encoding Audit

### Current Old Message (Demonstrated)
Character count: ~320 characters (estimated)
Segments: ~2 segments (GSM-7)

### New Message (Target)
Character count: ~280 characters (estimated)
Segments: ~2 segments (GSM-7)

### Encoding Considerations
- Bullet character (•) triggers UCS-2 encoding
- Curly apostrophe (') triggers UCS-2 encoding
- Current system already uses these characters
- GSM-safe alternatives would reduce segment count but would change design

### Trade-off
- Bullet points improve readability significantly
- UCS-2 encoding cost is acceptable for customer-facing quality
- Do not remove agreed spacing merely to reduce segments

---

## Part 9 — Idempotency and Persistence

### Current Guarantees (Must Preserve)
- ✅ CallSid-based idempotency check in lead.raw_metadata
- ✅ Fallback to messages table query
- ✅ Retry logic re-checks idempotency
- ✅ Same body regenerated on retry (acceptable)
- ✅ Exact outbound body persisted in database
- ✅ Delivery status updates apply to same message row

### Verification Needed
- ✅ Twilio-close and OpenAI-close paths both use `formatAdaptiveIntakeSms`
- ✅ No alternative SMS formatters in production path
- ✅ No changes to conversation or tenant scoping

---

## Implementation Plan

### Files to Modify
1. `src/lib/ai-intake-formatter.ts` - Main SMS formatter
2. `src/lib/ai-intake-formatter.test.ts` - Add regression tests

### Changes Required
1. **Service field:** Use `generateCanonicalRequestTitle` in `formatAdaptiveIntakeSms`
2. **Business name:** Trim before interpolation, reject placeholders
3. **Customer name:** Reject placeholders, natural generic greeting
4. **Timing:** Add conversational wrapper cleanup
5. **Partial vs complete closings:** Differentiate based on field count
6. **Spacing:** Ensure exactly one blank line between fields
7. **Whitespace:** No leading/trailing whitespace, no space before punctuation

### Files NOT to Change
- Voice prompts
- Simple Mode stage order
- OpenAI Realtime configuration
- VAD or settle timing
- Field extraction
- Customer creation
- Transcript persistence
- Raw `serviceRequested` persistence
- Lead status
- Twilio number provisioning
- Messaging Service configuration
- SMS delivery/status webhooks
- Retry semantics
- Notification creation
- Stripe or Tap to Pay code
- Schedule Map code
- Payment confirmation SMS
- Database schema

---

## Next Steps

1. Implement SMS formatter changes
2. Add comprehensive regression tests
3. Run existing AI intake formatter tests
4. Run existing Simple Mode/finalization tests
5. Run existing SMS persistence/deduplication tests
6. Run production build with TypeScript validation
7. Run `git diff --check`
8. Create final report
9. Do NOT commit or push until reviewed

---

**Analysis Complete** - Ready for implementation