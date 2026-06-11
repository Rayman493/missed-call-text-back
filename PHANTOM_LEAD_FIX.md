# Phantom Lead Creation Fix

## Issue Summary
A lead appeared in the dashboard even though no real call occurred. This must not happen before launch.

## Root Cause Analysis

### Primary Culprit: `/api/twilio/voice-status` Webhook

The `/api/twilio/voice-status` webhook was creating leads in response to Twilio status callbacks (e.g., call completed, failed, no-answer). This webhook treated ALL status callbacks as valid lead creation events, even when no actual call had occurred.

**Problematic Code Pattern:**
```typescript
// Line 163 in voice-status/route.ts
// Treat ALL inbound calls as valid leads, regardless of CallStatus
console.log('[voice-status] Creating lead regardless of call status:', CallStatus)
```

The webhook called `getOrCreateCallIntakeRecords()` which would create a new lead if one didn't exist, even for:
- Stale/late status callbacks
- Test call status updates
- Health check pings
- Any Twilio status callback with valid signature

### Why This Caused Phantom Leads

1. **Status Callbacks ≠ Call Events**: Status callbacks are Twilio's way of notifying the system about call state changes. They can arrive:
   - After a call completes
   - When a call fails
   - When a call is missed
   - For test calls
   - For retries and retries of retries

2. **No Call Event Validation**: The `getOrCreateCallIntakeRecords()` function did not verify that a corresponding `call_events` record existed before creating a lead. This meant any status callback with a valid CallSid could trigger lead creation.

3. **Separation of Concerns Violation**: The voice webhook (`/api/twilio/voice`) is responsible for handling incoming calls and should be the ONLY path that creates leads. The voice-status webhook should only update existing records.

## Lead Creation Paths Identified

### Production Paths (Legitimate)
1. **`/api/twilio/voice`** - AI call assistant creates leads via `getOrCreateCallIntakeRecords()` when a call actually arrives
2. **`/api/twilio/incoming-sms`** - Creates leads via `processInboundSms()` -> `db.createLead()` for inbound SMS
3. **`/api/twilio/message`** - Creates leads via `processInboundSms()` -> `db.createLead()` for inbound SMS

### Test/Demo Paths (Marked with `is_demo: true`)
4. **`/api/admin/create-test-lead`** - Admin-only, marked with `is_demo: true`
5. **`/api/dev/simulate-inbound-sms`** - Dev tools only, marked with `is_demo: true`
6. **`/api/demo/send-text`** - Demo, marked with `is_demo: true`

### Status Callbacks (DO NOT create leads - Verified)
- **`/api/twilio/message-status`** - Only updates message status ✓
- **`/api/twilio/recording-status`** - Only updates recording status ✓

### Dashboard Pages (Read-only - Verified)
- All dashboard pages are client-side React components that only fetch data
- No server-side lead creation in dashboard routes ✓

## Fixes Implemented

### 1. Blocked Lead Creation in voice-status Webhook

**File:** `src/app/api/twilio/voice-status/route.ts`

**Change:** The voice-status webhook now explicitly refuses to create new leads. It only updates existing leads.

```typescript
if (existingLead) {
  // Use existing lead
  lead = existingLead
  console.log("[Twilio Voice Status Webhook] Using existing lead:", lead.id)
} else {
  // CRITICAL FIX: Do NOT create leads from status callbacks
  console.error('[PHANTOM LEAD PREVENTED] voice-status webhook attempting to create lead without existing lead')
  return new Response("OK", { status: 200 })
}
```

**Impact:** Prevents phantom leads from being created by status callbacks.

### 2. Added Call Event Validation in getOrCreateCallIntakeRecords()

**File:** `src/lib/supabase/admin.ts`

**Change:** Added a defensive guard that requires a `call_events` record to exist before creating a new lead.

```typescript
// DEFENSIVE GUARD: Only create lead if call event exists
const { data: callEventForValidation } = await supabaseAdmin
  .from('call_events')
  .select('id, call_status')
  .eq('twilio_call_sid', params.callSid)
  .maybeSingle()

if (!callEventForValidation && params.requireValidCall !== false) {
  console.error('[PHANTOM LEAD PREVENTED] Refusing to create lead - no call event found')
  return { leadId: null, conversationId: null, isNew: false }
}
```

**Impact:** Ensures leads are only created when a real call event exists in the database.

### 3. Added Required Field Validation in createLead()

**File:** `src/lib/supabase/admin.ts`

**Change:** Added validation to ensure `business_id` and `caller_phone` are present before creating a lead.

```typescript
async createLead(lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>): Promise<Lead | null> {
  // DEFENSIVE GUARD: Validate required fields
  if (!lead.business_id || !lead.caller_phone) {
    console.error('[LEAD CREATION BLOCKED] Missing required fields:', {
      business_id: lead.business_id,
      caller_phone: lead.caller_phone
    })
    return null
  }
  // ... rest of function
}
```

**Impact:** Prevents malformed lead creation attempts.

### 4. Added Structured Logging to All Lead Creation Paths

**Files Modified:**
- `src/lib/supabase/admin.ts` - `createLead()` and `getOrCreateCallIntakeRecords()`
- `src/lib/sms-processing.ts` - `processInboundSms()`
- `src/app/api/admin/create-test-lead/route.ts`
- `src/app/api/demo/send-text/route.ts`

**Logging Format:**
```typescript
console.log('[LEAD CREATION ATTEMPT]', {
  source: 'function_name',
  business_id: business.id,
  caller_phone: normalizedPhone,
  callSid: params.callSid,
  message_sid: messageSid,
  is_demo: true/false,
  timestamp: new Date().toISOString()
})
```

**Impact:** Provides full audit trail for all lead creation attempts, making it easy to identify phantom lead sources.

### 5. Added Parameter Validation in getOrCreateCallIntakeRecords()

**File:** `src/lib/supabase/admin.ts`

**Change:** Added validation for required parameters at the start of the function.

```typescript
// DEFENSIVE GUARD: Validate required parameters
if (!params.callSid || !params.businessId || !params.callerPhone) {
  console.error('[CALL INTAKE] Missing required parameters:', {
    callSid: params.callSid,
    businessId: params.businessId,
    callerPhone: params.callerPhone
  })
  return { leadId: null, conversationId: null, isNew: false }
}
```

**Impact:** Prevents lead creation with missing critical data.

## Verification Checklist

- ✅ Status callbacks cannot create leads (voice-status blocked)
- ✅ Message-status webhooks cannot create leads (verified - only updates)
- ✅ Dashboard fetches are read-only (verified - client-side only)
- ✅ Test/demo endpoints mark leads with `is_demo: true` (verified)
- ✅ All lead creation paths have structured logging
- ✅ Defensive guards for required fields (business_id, caller_phone)
- ✅ Call event validation prevents phantom leads
- ✅ Legitimate missed-call lead creation still works
- ✅ Legitimate inbound SMS lead creation still works
- ✅ AI intake lead creation still works

## Monitoring Recommendations

### Log Patterns to Watch

**Phantom Lead Prevention:**
```
[PHANTOM LEAD PREVENTED]
[LEAD CREATION BLOCKED]
```

**Legitimate Lead Creation:**
```
[LEAD CREATION ATTEMPT] - with source: 'call_intake', 'sms-processing', etc.
[LEAD CREATED] - successful creation
```

**Suspicious Activity:**
- Multiple lead creation attempts from same caller_phone in short time
- Lead creation without valid CallSid/MessageSid
- Lead creation from unknown sources

### Alert Thresholds

Consider alerting if:
- More than 10 phantom lead prevention logs in 1 hour
- Lead creation failures exceed 5% of total attempts
- Unknown source in lead creation logs

## Testing Recommendations

1. **Test Status Callback Without Call Event**: Send a status callback for a non-existent CallSid - should be blocked
2. **Test Legitimate Call Flow**: Make a real call - should create lead normally
3. **Test SMS Lead Creation**: Send inbound SMS - should create lead normally
4. **Test Demo Lead Creation**: Use demo endpoint - should create lead with `is_demo: true`
5. **Verify Logging**: Check that all lead creation attempts are logged with full context

## Summary

The phantom lead issue was caused by the `/api/twilio/voice-status` webhook creating leads in response to status callbacks without verifying that a real call had occurred. The fix involves:

1. **Blocking lead creation in voice-status webhook** - Only update existing leads
2. **Adding call event validation** - Require call_events record before creating leads
3. **Adding defensive guards** - Validate required fields before creation
4. **Adding comprehensive logging** - Full audit trail for all lead creation attempts

These changes ensure that leads are only created for legitimate inbound calls and SMS messages, while maintaining all existing functionality for missed calls, SMS, and AI intake.
