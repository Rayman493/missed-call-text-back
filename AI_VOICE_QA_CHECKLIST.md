# AI Voice Live-Call QA Checklist

**Pre-requisites:**
- Phone with test number
- Access to Twilio console
- Access to Supabase SQL editor
- Access to Vercel logs
- Access to Fly.io logs
- Dashboard access

---

## Test 1: Complete Call

**What to do:**
1. Call your Twilio number
2. Answer AI greeting
3. Provide: "My name is John, I need help with lawn mowing"
4. Provide details: "I have a small front yard that needs weekly mowing"
5. Provide location: "123 Main Street"
6. Provide completion time: "Within the next week"
7. Provide callback time: "Anytime after 2pm"
8. Confirm when AI asks "Does everything look correct?"

**What to expect to hear:**
- Greeting: "Hi, thanks for calling. I can get your request over to the team. How can I help you today?"
- Questions only about: name/reason, details, location, timing, callback
- Confirmation: "Thanks! Here's what I have: [summary]"
- Closing: "Thank you. I've shared this information with the team and someone will contact you shortly. Goodbye."

**What SMS should be sent:**
- Summary SMS with all collected info
- Start: "Here's a summary of your request:"
- Includes: Name, reason, details, location, callback time

**Dashboard check:**
- Lead created with status `contacted`
- Conversation created
- Message with summary SMS visible
- AI call details show `completed_intake` outcome

**What should NOT happen:**
- No follow-up jobs created
- No duplicate messages
- No extra questions beyond script

**Pass/fail:**
✅ Pass if: All info collected, closing plays fully, summary SMS received, no follow-ups
❌ Fail if: Closing cut off, missing SMS, follow-ups created, duplicate lead

---

## Test 2: Incomplete Call

**What to do:**
1. Call your Twilio number
2. Provide: "My name is Jane, I need dog grooming"
3. Provide details: "I have a golden retriever that needs a bath and trim"
4. HANG UP immediately after providing details

**What to expect to hear:**
- Greeting
- Name/reason question
- Details question
- Call ends abruptly when you hang up

**What SMS should be sent:**
- Partial summary SMS with name, reason, details
- Note: "Partial information captured"

**Dashboard check:**
- Lead created with status `contacted`
- AI call details show `partial_intake` outcome
- Follow-up job created (if follow-ups enabled)

**What should NOT happen:**
- No full summary SMS
- No complete intake outcome
- No confirmation asked

**Pass/fail:**
✅ Pass if: Partial info saved, partial SMS sent, outcome is partial, follow-up created
❌ Fail if: Marked as complete, full summary sent, no follow-up created

---

## Test 3: Correction Reply

**What to do:**
1. Complete Test 1 first
2. After receiving summary SMS, reply: "My name is actually John Smith, not John"

**What to expect (SMS):**
- Acknowledgement SMS: "Thanks! I've updated your information."

**Dashboard check:**
- Lead name updated to "John Smith"
- AI call record `extracted_info` updated
- Lead metadata shows `customer_corrected_info: true`
- Follow-up jobs cancelled (if any)

**What should NOT happen:**
- No duplicate summary SMS
- No new lead created

**Pass/fail:**
✅ Pass if: Name updated, correction noted in metadata, follow-ups cancelled
❌ Fail if: Name not updated, duplicate SMS, new lead created

---

## Test 4: Ignored Contact Call

**What to do:**
1. Add your phone number to ignored contacts in dashboard
2. Call your Twilio number

**What to expect to hear:**
- Short message: "Thanks - we received your message."
- Immediate hangup

**What SMS should be sent:**
- None

**Dashboard check:**
- No lead created
- No conversation created
- No messages
- No AI call record

**What should NOT happen:**
- No AI greeting
- No questions asked
- No voicemail recording

**Pass/fail:**
✅ Pass if: Short message only, no lead/SMS/AI
❌ Fail if: AI engaged, lead created, SMS sent

---

## Test 5: Business Type Templates

**Test Lawn Care:**
1. Set business type to "Landscaping"
2. Call and provide lawn care request
3. Verify questions are landscaping-appropriate

**Test Dog Grooming:**
1. Set business type to "Pet Grooming"
2. Call and provide grooming request
3. Verify questions are grooming-appropriate

**Test Tutoring:**
1. Set business type to "Lessons/Tutoring"
2. Call and provide tutoring request
3. Verify questions are tutoring-appropriate

**What to expect:**
- Same 5 required fields collected for all
- Wording tailored to business type
- No extra questions added

**Pass/fail:**
✅ Pass if: Appropriate wording, same required fields, no extra questions
❌ Fail if: Extra questions, wrong wording, missing required fields

---

## Test 6: After-Hours / OOO

**What to do:**
1. Set business hours to "closed" or enable OOO
2. Call your Twilio number

**What to expect:**
- AI still answers (AI is 24/7)
- Summary SMS sent
- OOO notice in SMS if configured

**What should NOT happen:**
- No contradictory behavior
- No conflicting messages

**Pass/fail:**
✅ Pass if: AI answers, summary sent, behavior consistent
❌ Fail if: Contradictory messages, AI doesn't answer

---

## Test 7: Follow-up Cancellation

**What to do:**
1. Complete Test 2 (incomplete call) to create follow-up
2. Reply to summary SMS with any correction
3. Check follow-up status

**What to expect:**
- Correction applied
- Follow-up jobs marked as cancelled
- Lead status remains `contacted`

**Pass/fail:**
✅ Pass if: Follow-ups cancelled on reply
❌ Fail if: Follow-ups remain active

---

## Log Validation

### Vercel Logs
```bash
# Filter by call
vercel logs --filter "CallSid: YOUR_CALL_SID"

# Filter by voice webhook
vercel logs --filter "[MAIN TWIML GENERATED]"

# Filter by AI routing
vercel logs --filter "[AI CALL ASSISTANT]"
```

### Fly.io Logs
```bash
# Access Fly.io dashboard or CLI
fly logs --app replyflow-ai-voice

# Filter by session ID
fly logs --app replyflow-ai-voice | grep "sessionId"
```

### Twilio Console
- Navigate to: https://console.twilio.com/us1/monitor/logs/calls
- Search by CallSid
- Check: Call status, duration, recording (if any)
- Verify: Media Stream connected to Fly.io URL

### Key Log Markers to Look For
- `[MAIN TWIML GENERATED]` - Voice webhook returned TwiML
- `[AI POC FINAL TWIML]` - POC path executed
- `[VOICE PATH] AI` - AI routing successful
- `[VOICE PATH] VOICEMAIL` - Fallback to voicemail
- `[AI CORRECTION PERSIST SUCCESS]` - Correction saved
- `[AI SUMMARY SMS SKIPPED DUPLICATE]` - Idempotency working

---

## Database Validation SQL Queries

### Check Lead
```sql
SELECT id, name, phone, status, raw_metadata, created_at
FROM leads
ORDER BY created_at DESC
LIMIT 5;
```

### Check Conversation
```sql
SELECT id, lead_id, business_id, created_at
FROM conversations
ORDER BY created_at DESC
LIMIT 5;
```

### Check Messages
```sql
SELECT id, conversation_id, direction, body, created_at
FROM messages
ORDER BY created_at DESC
LIMIT 10;
```

### Check AI Call Records
```sql
SELECT id, lead_id, conversation_id, call_sid, outcome, 
       extracted_info, created_at
FROM ai_call_records
ORDER BY created_at DESC
LIMIT 5;
```

### Check Follow-up Jobs
```sql
SELECT id, lead_id, conversation_id, status, scheduled_at, 
       cancelled_at, created_at
FROM follow_up_jobs
ORDER BY created_at DESC
LIMIT 5;
```

### Check Call Events
```sql
SELECT id, business_id, caller_phone, call_status, 
       twilio_call_sid, conversation_id, created_at
FROM call_events
ORDER BY created_at DESC
LIMIT 5;
```

### Check for Duplicate Summary SMS
```sql
SELECT conversation_id, COUNT(*)
FROM messages
WHERE body LIKE 'Here''s a summary of your request%'
GROUP BY conversation_id
HAVING COUNT(*) > 1;
```

---

## Quick Reference: Expected Outcomes

| Scenario | Lead | Conversation | Messages | AI Record | Outcome | Follow-ups |
|----------|------|--------------|----------|-----------|---------|-----------|
| Complete | ✅ | ✅ | ✅ (1) | ✅ | completed_intake | ❌ |
| Incomplete | ✅ | ✅ | ✅ (1) | ✅ | partial_intake | ✅ |
| Ignored | ❌ | ❌ | ❌ | ❌ | N/A | ❌ |
| Correction | ✅ (update) | ✅ | ✅ (+1) | ✅ (update) | unchanged | ❌ (cancel) |

---

## Final Confidence Level

After completing all tests, assign confidence level:

- **High (90-100%):** All tests pass, no issues found
- **Medium (70-89%):** Minor issues, non-blocking
- **Low (<70%):** Blocking issues found, needs fixes

**Notes:**
_______________________________________________________

_______________________________________________________

_______________________________________________________
