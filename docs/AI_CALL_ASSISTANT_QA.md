# AI Call Assistant - Phase 0 QA Test Plan

## Overview

Phase 0 is a QA-only prototype that proves the technical loop for the AI Call Assistant. It does NOT affect production customers and is fully feature-flagged.

**IMPORTANT**: This is Phase 0 only. Full AI functionality requires dedicated WebSocket server infrastructure (documented below).

---

## Required Environment Variables

Add these to your `.env.local` file:

```bash
# Global enable flags (MUST be false by default for safety)
AI_CALL_ASSISTANT_ENABLED=false
NEXT_PUBLIC_AI_CALL_ASSISTANT_ENABLED=false

# OpenAI API key (required for AI functionality)
OPENAI_API_KEY=sk-...

# Comma-separated list of business IDs allowed to use AI (for QA testing)
# Example: AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=uuid-1,uuid-2,uuid-3
# Empty string = no businesses allowed (default, safe)
AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=
```

**Safety Note**: If `AI_CALL_ASSISTANT_ENABLED` is `false` or `AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS` is empty, NO business will use AI. All calls will use the existing voicemail/SMS flow.

---

## How to Enable for One Test Business

1. **Get the Business ID**:
   - Go to Supabase dashboard
   - Open `businesses` table
   - Find your test business
   - Copy the `id` column (UUID)

2. **Set Environment Variables**:
   ```bash
   AI_CALL_ASSISTANT_ENABLED=true
   NEXT_PUBLIC_AI_CALL_ASSISTANT_ENABLED=true
   AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=your-business-uuid-here
   OPENAI_API_KEY=your-openai-key
   ```

3. **Restart your development server**:
   ```bash
   npm run dev
   ```

4. **Verify guards are passing**:
   - Check logs for `[AI CALL ASSISTANT] All guards passed`
   - If you see `[AI CALL ASSISTANT] Guard failed`, check the reason

---

## How to Place a Test Call

1. **Use Twilio Console**:
   - Go to Twilio console
   - Phone Numbers → Your Twilio number
   - Click on your test number
   - Find "Voice & Fax" section
   - Note the webhook URL (should point to your dev server)

2. **Place a call**:
   - Call your Twilio test number from your phone
   - The call will hit your `/api/twilio/voice` endpoint
   - If guards pass, it redirects to `/api/twilio/ai-assistant/start`

3. **Observe behavior**:
   - Phase 0: Call will fall back to voicemail (WebSocket not yet deployed)
   - This is expected and documented in the code

---

## Expected Twilio Logs

When you place a test call with AI enabled, you should see:

**If AI is enabled and business is allowlisted**:
```
[A CALL ASSISTANT] Checking if AI should handle this call
[A CALL ASSISTANT] Guard passed: Globally enabled
[A CALL ASSISTANT] Guard passed: Business allowed
[A CALL ASSISTANT] Guard passed: OpenAI configured
[A CALL ASSISTANT] All guards passed - routing to AI assistant
```

**If AI is disabled or business not allowlisted**:
```
[A CALL ASSISTANT] Checking if AI should handle this call
[A CALL ASSISTANT] Guard failed: Not globally enabled
[OR]
[A CALL ASSISTANT] Guard failed: Business not in allowlist
[OR]
[A CALL ASSISTANT] Guard failed: OpenAI API key not configured
[A CALL ASSISTANT] Guards failed - continuing with existing voicemail flow
```

---

## Expected Vercel/Dev Server Logs

When AI start route is hit:

```
[AI CALL ASSISTANT] Start route hit
[AI CALL ASSISTANT] Business found { business_id: '...', business_name: '...' }
[AI CALL ASSISTANT] All guards passed - routing to AI assistant
[AI CALL ASSISTANT] Creating session { business_id: '...', call_sid: '...' }
[AI CALL ASSISTANT] Session created { session_id: '...', call_sid: '...' }
[AI CALL ASSISTANT] PHASE 0 LIMITATION: Vercel WebSocket support required for Media Streams
[AI CALL ASSISTANT] Falling back to voicemail - WebSocket infrastructure not yet deployed
```

---

## Expected Supabase Rows

After a test call, you should see:

**In `ai_call_sessions` table**:
- 1 row created with:
  - `call_sid`: Twilio call SID
  - `business_id`: Your test business ID
  - `status`: `fallback_voicemail`
  - `fallback_stage`: `websocket_connect`
  - `error_message`: `PHASE 0: WebSocket infrastructure not deployed`
  - `started_at`: Timestamp when call started
  - `ended_at`: Timestamp when fallback occurred

**Duplicate Call Handling**:
- If the same call SID comes in again, it will UPDATE the existing row (idempotent)
- No duplicate sessions will be created

---

## How to Disable Immediately

### Method 1: Environment Variables (Fastest)
```bash
# Set flags to false
AI_CALL_ASSISTANT_ENABLED=false
NEXT_PUBLIC_AI_CALL_ASSISTANT_ENABLED=false
```
Restart server. All calls immediately use voicemail.

### Method 2: Clear Allowlist
```bash
# Empty the allowlist
AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=
```
Restart server. No businesses can use AI.

### Method 3: Remove OpenAI Key
```bash
# Remove or comment out
# OPENAI_API_KEY=sk-...
```
Restart server. Guard will fail, uses voicemail.

---

## Fallback Test Cases

### Test 1: Global Flag Disabled
**Setup**:
```bash
AI_CALL_ASSISTANT_ENABLED=false
AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=your-business-id
OPENAI_API_KEY=sk-...
```

**Expected**: Call uses existing voicemail flow
**Log**: `[AI CALL ASSISTANT] Guard failed: Not globally enabled`

### Test 2: Business Not Allowlisted
**Setup**:
```bash
AI_CALL_ASSISTANT_ENABLED=true
AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=other-business-id
OPENAI_API_KEY=sk-...
```

**Expected**: Call uses existing voicemail flow
**Log**: `[AI CALL ASSISTANT] Guard failed: Business not in allowlist`

### Test 3: OpenAI Key Missing
**Setup**:
```bash
AI_CALL_ASSISTANT_ENABLED=true
AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=your-business-id
# OPENAI_API_KEY= (missing)
```

**Expected**: Call uses existing voicemail flow
**Log**: `[AI CALL ASSISTANT] Guard failed: OpenAI API key not configured`

### Test 4: All Guards Pass (Phase 0)
**Setup**:
```bash
AI_CALL_ASSISTANT_ENABLED=true
AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=your-business-id
OPENAI_API_KEY=sk-...
```

**Expected**: 
- Session created in database
- Call falls back to voicemail (Phase 0 limitation)
- Log: `PHASE 0 LIMITATION: Vercel WebSocket support required`

### Test 5: Duplicate Call SID
**Setup**: Same call hits webhook twice

**Expected**:
- 1 session row (not 2)
- Existing row is updated
- No duplicate entries

---

## Phase 0 Limitations

### WebSocket Infrastructure

**Issue**: Vercel serverless functions do not support persistent WebSocket connections required for Twilio Media Streams + OpenAI Realtime API.

**Current Behavior**:
- Guards work correctly
- Session is created
- System falls back to voicemail immediately
- This is safe and expected for Phase 0

**Required for Full Implementation**:
- Dedicated WebSocket server (Node.js, Go, or similar)
- Persistent connection support
- Separate infrastructure from Vercel
- Example: Digital Ocean Droplet, AWS EC2, or similar

**Files That Need WebSocket Server**:
- `/api/twilio/ai-assistant/stream` (not yet created)
- OpenAI Realtime WebSocket integration
- Audio bridging logic

---

## Acceptance Criteria Checklist

Phase 0 is complete when:

- [ ] AI Assistant is disabled by default (env vars false)
- [ ] Existing missed-call flow still works when disabled
- [ ] Feature only runs for allowlisted QA business
- [ ] One AI call creates or updates one `ai_call_sessions` row
- [ ] Duplicate callbacks do not create duplicate sessions
- [ ] Session status is saved correctly
- [ ] Fallback stage is documented
- [ ] Error messages are saved when applicable
- [ ] All guard failures fall back to voicemail
- [ ] Build passes
- [ ] TypeScript passes
- [ ] No production customer behavior changes

---

## Troubleshooting

### Issue: Guards passing but no session created

**Check**:
- Verify database migration ran: `20260526000000_phase0_create_ai_call_sessions.sql`
- Check Supabase logs for database errors
- Verify `supabaseAdmin` client is configured correctly

### Issue: Call always goes to voicemail

**Check**:
- Verify all three env vars are set correctly
- Check business ID matches allowlist exactly
- Verify no typos in environment variables
- Restart dev server after changing env vars

### Issue: TypeScript errors

**Check**:
- Run `npm run typecheck`
- Verify all imports are correct
- Check for missing type definitions

### Issue: Build fails

**Check**:
- Run `npm run build`
- Check for missing dependencies
- Verify all new files are included in build

---

## Next Steps (Phase 1)

To move beyond Phase 0 and implement full AI functionality:

1. **Deploy WebSocket Server**:
   - Set up dedicated server (Node.js, Go, etc.)
   - Configure persistent WebSocket support
   - Deploy to infrastructure (not Vercel)

2. **Create Stream Route**:
   - `/api/twilio/ai-assistant/stream` on WebSocket server
   - Implement Twilio Media Streams handler
   - Implement OpenAI Realtime WebSocket client

3. **Remove Phase 0 Fallback**:
   - Update `/api/twilio/ai-assistant/start` to return Media Streams TwiML
   - Remove fallback to voicemail
   - Implement full conversation flow

4. **Test End-to-End**:
   - Place real calls
   - Verify AI conversation works
   - Verify transcript and extraction works
   - Verify lead creation works

---

## Safety Reminders

- **Never enable AI for production customers without full testing**
- **Always keep feature flags disabled by default**
- **Clear allowlist when not testing**
- **Monitor logs for any unexpected behavior**
- **Have rollback plan ready (set env vars to false)**
- **Document all changes and test results**
