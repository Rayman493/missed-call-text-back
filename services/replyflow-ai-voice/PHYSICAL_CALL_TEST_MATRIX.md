# AI Intake Physical Call Test Matrix

## Test Execution Instructions

1. Use a real phone number that forwards to ReplyFlow
2. Record callSid for each call for post-call inspection
3. Inspect: ai_call_records, leads, conversations, SMS, in-app notifications
4. Document any deviations from expected behavior

---

## Call 1: Happy Path - Normal Concise Caller

**Caller Script:**
> "Hi, I'm Amanda. I need a plumber tomorrow morning around 9 AM. My address is 123 Main Street. You can call me back anytime after 10 AM."

**Expected Stage Progression:**
- ask_name → ask_request → ask_location → ask_completion_time → ask_callback_time → complete

**Expected Captured Fields:**
- customerName: Amanda
- request: plumber
- serviceAddress: 123 Main Street
- desiredCompletionTime: tomorrow morning around 9 AM
- callbackTime: anytime after 10 AM

**Expected Final Result:**
- Status: complete
- SMS sent with summary
- Lead created with all fields
- Transcript matches speech

**Evidence to Inspect:**
- ai_call_records.outcome = 'complete'
- ai_call_records.extracted_info contains all fields
- leads table has customer phone and name
- conversations table has transcript
- SMS notification sent
- No errors in logs

---

## Call 2: Silence Once - Reprompt Current Stage

**Caller Script:**
> "Hi, I'm John."
> [silence for 8 seconds]

**Expected Stage Progression:**
- ask_name → (silence) → reprompt ask_name → ask_request → ...

**Expected Behavior:**
- AI reprompts for name (not for request or goes back to beginning)
- Stage remains ask_name
- Retry count increments to 1

**Expected Captured Fields:**
- customerName: John (from first answer)

**Evidence to Inspect:**
- Logs show "reprompt_triggered" for ask_name
- silenceRetryCountByStage.ask_name = 1
- Transcript shows two ask_name prompts
- Stage did not regress to earlier stage

---

## Call 3: Silence Twice - Graceful Finalization

**Caller Script:**
> "Hi, I'm Sarah."
> [silence for 8 seconds]
> [silence for another 8 seconds]

**Expected Stage Progression:**
- ask_name → (silence) → reprompt ask_name → (silence) → complete

**Expected Behavior:**
- AI reprompts once
- On second silence, finalizes with partial info
- Plays complete message
- Hangs up

**Expected Captured Fields:**
- customerName: Sarah
- Other fields: null/missing

**Expected Final Result:**
- Status: incomplete
- SMS sent with partial summary
- Lead created with name only
- Transcript shows partial intake

**Evidence to Inspect:**
- ai_call_records.outcome = 'incomplete'
- ai_call_records.extracted_info has customerName only
- Silence retry count = 2
- Finalization reason = stage_timeout
- SMS mentions partial information

---

## Call 4: Interruption - Caller Speaks Over AI

**Caller Script:**
> "Hi, I'm Mike. I need a fence—"
> [interrupts while AI is speaking]
> "—replaced. Next week. 456 Oak Street. Call me back in the afternoon."

**Expected Stage Progression:**
- ask_name → ask_request → ask_location → ask_completion_time → ask_callback_time → complete

**Expected Behavior:**
- AI handles interruption gracefully
- Extraction captures all fields despite interruption
- Stage advances normally

**Expected Captured Fields:**
- customerName: Mike
- request: fence replaced
- serviceAddress: 456 Oak Street
- desiredCompletionTime: next week
- callbackTime: afternoon

**Evidence to Inspect:**
- Transcript shows interruption
- All fields captured correctly
- No stage regression
- No errors in logs

---

## Call 5: Correction - Name Correction

**Caller Script:**
> "My name is John."
> ...
> "Actually, it's Jon without the h."

**Expected Stage Progression:**
- ask_name → ask_request → ... → (correction) → continue

**Expected Behavior:**
- Extraction updates customerName to "Jon"
- Old value "John" is replaced
- Unrelated fields preserved

**Expected Captured Fields:**
- customerName: Jon (final value)
- Other fields: preserved

**Evidence to Inspect:**
- Transcript shows both "John" and "Jon"
- Final extracted_info.customerName = "Jon"
- Summary reflects "Jon" not "John"
- Other fields unchanged

---

## Call 6: Early Multi-Field Answer

**Caller Script:**
> "My name is Amanda and I need a plumber tomorrow morning."

**Expected Stage Progression:**
- ask_name → (multi-field detected) → skip ask_request → ask_location (if onsite) or ask_completion_time (if remote)

**Expected Behavior:**
- Both name and request captured on ask_name
- ask_request stage skipped
- Advances to next relevant stage

**Expected Captured Fields:**
- customerName: Amanda
- request: plumber
- desiredCompletionTime: tomorrow morning

**Evidence to Inspect:**
- Logs show "multi_field_skip"
- state.needsServiceReprompt = false
- ask_request not in transcript
- Stage went from ask_name to ask_location/completion_time

---

## Call 7: Vague Response - Minimal Information

**Caller Script:**
> "I need help."

**Expected Stage Progression:**
- ask_name → ask_request → (vague) → reprompt ask_request → ...

**Expected Behavior:**
- AI accepts name but reprompts for more details on request
- Does not advance to next stage until sufficient detail
- May use targeted reprompt if name already known

**Expected Captured Fields:**
- customerName: [from ask_name]
- request: "I need help" (may trigger reprompt for more detail)

**Evidence to Inspect:**
- Transcript shows reprompt for more details
- Stage remains ask_request or advances only after clarification
- needsServiceReprompt flag behavior
- Final request field has sufficient detail

---

## Call 8: Long Detailed Response - Information Overload

**Caller Script:**
> "Hi, I'm Robert Johnson. I've got a leak in my bathroom sink that's been dripping for about three days now. It's actually getting worse and there's water pooling under the cabinet. I'm at 789 Pine Avenue, Apartment 4B. I'm hoping you can send someone over this Friday if possible, maybe in the morning would be best. I work from home so I'm available most of the day but mornings are preferred."

**Expected Stage Progression:**
- ask_name → ask_request → ask_location → ask_completion_time → ask_callback_time → complete

**Expected Behavior:**
- Extraction handles long response
- Captures all relevant details
- May advance faster if multiple fields present

**Expected Captured Fields:**
- customerName: Robert Johnson
- request: leak in bathroom sink
- serviceAddress: 789 Pine Avenue, Apartment 4B
- desiredCompletionTime: Friday morning
- callbackTime: most of the day, mornings preferred

**Evidence to Inspect:**
- All fields extracted correctly
- Transcript preserves full speech
- No field loss due to length
- Stage advances appropriately

---

## Call 9: Partial Hangup - After Name Only

**Caller Script:**
> "Hi, I'm Lisa."
> [hangs up]

**Expected Stage Progression:**
- ask_name → (disconnect) → finalize incomplete

**Expected Behavior:**
- WebSocket close triggers incomplete finalization
- Partial data persisted
- SMS sent with what was captured

**Expected Captured Fields:**
- customerName: Lisa
- Other fields: null/missing

**Expected Final Result:**
- Status: incomplete
- SMS sent with name only
- Lead created with name
- Transcript shows partial intake

**Evidence to Inspect:**
- ai_call_records.outcome = 'incomplete'
- ai_call_records.extracted_info has customerName only
- WebSocket close logged
- Finalization reason = websocket_closed
- SMS mentions name only

---

## Call 10: Partial Hangup - After Giving All Data

**Caller Script:**
> "My name is Tom. I need an electrician. 321 Elm Street. Tomorrow afternoon. Call me back in the evening."
> [hangs up before complete message]

**Expected Stage Progression:**
- ask_name → ask_request → ask_location → ask_completion_time → ask_callback_time → (disconnect during complete) → finalize incomplete

**Expected Behavior:**
- All fields captured before hangup
- Incomplete finalization preserves all data
- SMS sent with full summary

**Expected Captured Fields:**
- customerName: Tom
- request: electrician
- serviceAddress: 321 Elm Street
- desiredCompletionTime: tomorrow afternoon
- callbackTime: evening

**Expected Final Result:**
- Status: incomplete (due to hangup)
- SMS sent with all fields
- Lead created with all fields
- Transcript shows full intake

**Evidence to Inspect:**
- ai_call_records.outcome = 'incomplete'
- ai_call_records.extracted_info has all fields
- SMS contains full summary
- All fields persisted to lead
- No data loss

---

## Call 11: Back-to-Back Call - Same Number

**Call 11a Script:**
> "Hi, I'm Kevin. I need a roof inspection."
> [hangup]

**Wait 30 seconds**

**Call 11b Script:**
> "Hi, I'm Kevin again. Can you make it next Tuesday?"

**Expected Stage Progression:**
- Call 11a: ask_name → ask_request → (hangup)
- Call 11b: ask_name → ask_request → ...

**Expected Behavior:**
- Each call has separate session
- No state leakage between calls
- Second call starts fresh (doesn't auto-fill from first)
- Both calls persisted separately

**Expected Captured Fields:**
- Call 11a: customerName: Kevin, request: roof inspection
- Call 11b: customerName: Kevin, request: [new info]

**Evidence to Inspect:**
- Two separate ai_call_records entries
- Different callSid for each
- No shared state between sessions
- Second call doesn't have first call's data auto-filled
- Both calls in leads/conversations correctly associated

---

## Call 12: Back-to-Back Call - Different Numbers

**Call 12a from Number A:**
> "Hi, I'm Rachel. I need landscaping."

**Wait 30 seconds**

**Call 12b from Number B:**
> "Hi, I'm Mark. I need HVAC repair."

**Expected Stage Progression:**
- Call 12a: ask_name → ask_request → ...
- Call 12b: ask_name → ask_request → ...

**Expected Behavior:**
- Complete isolation between calls
- No cross-contamination
- Each call to correct lead

**Expected Captured Fields:**
- Call 12a: customerName: Rachel, request: landscaping
- Call 12b: customerName: Mark, request: HVAC repair

**Evidence to Inspect:**
- Two separate ai_call_records
- Two separate leads
- No field mixing
- Rachel's data not in Mark's record
- Mark's data not in Rachel's record

---

## Call 13: Ambiguous Timing - "Sometime Next Week"

**Caller Script:**
> "My name is Nancy. I need a plumber. Sometime next week would be fine."

**Expected Stage Progression:**
- ask_name → ask_request → ask_completion_time → ask_callback_time → complete

**Expected Behavior:**
- Extraction captures "sometime next week"
- AI may ask for clarification or accept
- Callback time may be requested for specificity

**Expected Captured Fields:**
- customerName: Nancy
- request: plumber
- desiredCompletionTime: sometime next week
- callbackTime: [specific time if requested]

**Evidence to Inspect:**
- Timing field captures ambiguity
- Transcript preserves exact speech
- Summary reflects "sometime next week"
- No fabricated specific time

---

## Call 14: Ambiguous Callback Time - "Whenever"

**Caller Script:**
> "My name is David. I need a carpenter. Tomorrow morning. You can call me back whenever."

**Expected Stage Progression:**
- ask_name → ask_request → ask_completion_time → ask_callback_time → complete

**Expected Behavior:**
- Extraction captures "whenever"
- AI may accept or ask for clarification
- Final summary reflects flexibility

**Expected Captured Fields:**
- customerName: David
- request: carpenter
- desiredCompletionTime: tomorrow morning
- callbackTime: whenever

**Evidence to Inspect:**
- Callback field captures "whenever"
- Transcript preserves exact speech
- No specific time fabricated
- Summary reflects "whenever" or similar

---

## Call 15: Address with Unit/Apartment

**Caller Script:**
> "My name is Emily. I need appliance repair. 555 Maple Street, Apartment 12B."

**Expected Stage Progression:**
- ask_name → ask_request → ask_location → ask_completion_time → ask_callback_time → complete

**Expected Behavior:**
- Extraction captures full address including unit
- Address preserved accurately
- No truncation of unit number

**Expected Captured Fields:**
- customerName: Emily
- request: appliance repair
- serviceAddress: 555 Maple Street, Apartment 12B

**Evidence to Inspect:**
- serviceAddress includes "Apartment 12B"
- Transcript preserves full address
- No address truncation
- Lead address complete

---

## Call 16: "I Don't Know" Response

**Caller Script:**
> "My name is Frank."
> "I need some help with my AC."
> "I don't know when it needs to be done."

**Expected Stage Progression:**
- ask_name → ask_request → ask_completion_time → (I don't know) → ask_callback_time → complete

**Expected Behavior:**
- AI accepts "I don't know" as valid response
- May skip to next stage or ask for callback time
- Does not fabricate timing

**Expected Captured Fields:**
- customerName: Frank
- request: AC help
- desiredCompletionTime: I don't know (or null)
- callbackTime: [requested]

**Evidence to Inspect:**
- Timing field may be null or "I don't know"
- Transcript preserves exact speech
- No fabricated timing
- Stage advances appropriately

---

## Call 17: Service Location Type - Remote Service

**Caller Script:**
> "My name is Grace. I need tax preparation. I'll come to your office."

**Expected Stage Progression:**
- ask_name → ask_request → (remote detected) → ask_completion_time → ask_callback_time → complete
- NOTE: ask_location SKIPPED

**Expected Behavior:**
- Service location type detected as remote
- ask_location stage skipped
- Goes directly to timing

**Expected Captured Fields:**
- customerName: Grace
- request: tax preparation
- serviceAddress: null (not applicable for remote)
- desiredCompletionTime: [provided]
- callbackTime: [provided]

**Evidence to Inspect:**
- serviceLocationType = 'remote'
- ask_location not in transcript
- Stage skipped ask_location
- serviceAddress is null/empty

---

## Call 18: Correction - Timing Correction

**Caller Script:**
> "My name is Henry. I need electrical work. Friday afternoon."
> "Actually Saturday would be better."

**Expected Stage Progression:**
- ask_name → ask_request → ask_completion_time → (correction) → continue

**Expected Behavior:**
- Extraction updates desiredCompletionTime to "Saturday"
- Old value "Friday afternoon" replaced
- Unrelated fields preserved

**Expected Captured Fields:**
- customerName: Henry
- request: electrical work
- desiredCompletionTime: Saturday (final value)

**Evidence to Inspect:**
- Transcript shows both "Friday" and "Saturday"
- Final timing = "Saturday"
- Summary reflects "Saturday"
- Other fields unchanged

---

## Call 19: Correction - Address Correction

**Caller Script:**
> "My name is Irene. I need plumbing. 111 First Street."
> "Sorry, 100 First Street."

**Expected Stage Progression:**
- ask_name → ask_request → ask_location → (correction) → continue

**Expected Behavior:**
- Extraction updates serviceAddress to "100 First Street"
- Old value "111 First Street" replaced
- Unrelated fields preserved

**Expected Captured Fields:**
- customerName: Irene
- request: plumbing
- serviceAddress: 100 First Street (final value)

**Evidence to Inspect:**
- Transcript shows both addresses
- Final address = "100 First Street"
- Summary reflects correct address
- Other fields unchanged

---

## Call 20: Edge Case - Very Fast Caller

**Caller Script:**
> "HiI'mJamesIneedpaintingtomorrow123OakStcallmemorning."

**Expected Stage Progression:**
- ask_name → (multi-field detected) → skip ask_request → ask_location → ask_completion_time → ask_callback_time → complete

**Expected Behavior:**
- Transcription handles fast speech
- Extraction parses correctly
- Multi-field captured
- Stage advances appropriately

**Expected Captured Fields:**
- customerName: James
- request: painting
- desiredCompletionTime: tomorrow
- serviceAddress: 123 Oak St
- callbackTime: morning

**Evidence to Inspect:**
- Transcript captures fast speech (may have some errors)
- Extraction corrects obvious parsing
- All fields captured
- No stage deadlock

---

## Post-Call Inspection Checklist

For each call, verify:

### ai_call_records Table
- [ ] callSid matches
- [ ] outcome is 'complete' or 'incomplete'
- [ ] extracted_info has expected fields
- [ ] extracted_info values match transcript
- [ ] No unexpected fields
- [ ] No null values where data should exist

### leads Table
- [ ] lead created or updated
- [ ] customer_name matches
- [ ] phone_number matches caller
- [ ] business_id correct
- [ ] raw_metadata contains extracted_info

### conversations Table
- [ ] transcript preserved
- [ ] transcript matches call audio
- [ ] No transcript truncation
- [ ] No transcript mixing

### SMS Notification
- [ ] SMS sent (if eligible)
- [ ] SMS content matches summary
- [ ] SMS mentions all captured fields
- [ ] No SMS sent for incomplete/no data calls (unless configured)
- [ ] SMS tone appropriate

### In-App Notification
- [ ] Notification created
- [ ] Notification links to correct lead
- [ ] Notification shows correct summary

### Logs
- [ ] No uncaught exceptions
- [ ] No timeout errors (unless expected)
- [ ] Stage transitions logged correctly
- [ ] Turn IDs increment properly
- [ ] No stale callback warnings
- [ ] No state corruption

### Consistency Check
- [ ] Transcript field values match extracted_info
- [ ] extracted_info matches lead fields
- [ ] Summary matches all sources
- [ ] No silent data divergence