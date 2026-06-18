# AI Voice Intake Flow Audit

## Speech Creation Paths Found

### 1. sendControlledAssistantText (lines 880-903)
- Uses `response.create` with strict instructions
- Has forbidden phrase detection (lines 830-878)
- Sends strict instruction: "SAY EXACTLY THIS TEXT AND NOTHING ELSE"
- Location: services/replyflow-ai-voice/src/index.ts

### 2. sendStagePrompt (lines 906-1028)
- Calls sendControlledAssistantText with predefined prompts
- Uses STAGE_PROMPTS constant for approved text
- Has phone number prompt blocking (lines 931-941)
- Has duplicate prompt prevention (lines 943-990)
- Location: services/replyflow-ai-voice/src/index.ts

### 3. STAGE_PROMPTS Constant (lines 1034-1041)
```typescript
const STAGE_PROMPTS: Record<IntakeStage, string> = {
  ask_name_reason: "Hi, I'm the assistant for the business. Can you please let me know your name and your reason for calling?",
  ask_details: "Got it. Can you share any important details the business should know?",
  ask_location: "Thanks. Where will the service take place?",
  ask_completion_time: "Thanks. When would you like this service completed?",
  ask_callback_time: "What's the best time for the business to call you back?",
  complete: "Thanks for the information. Have a great day!"
};
```

### 4. Scope Violation Check (lines 7200-7210)
- Logs when AI speaks outside allowed prompt scope
- Checks actualTranscript against expectedPrompt
- Location: services/replyflow-ai-voice/src/index.ts

### 5. Model-Generated Legacy Confirmation Detection (lines 7220-7228)
- Detects if model generates "is that correct?" or "is this correct?"
- Logs when model generates confirmation instead of app
- Location: services/replyflow-ai-voice/src/index.ts

## Completion Logic Paths Found

### 1. areAllRequiredFieldsCollected (lines 421-456)
- Checks if all 6 required fields are present
- Logs [REQUIRED FIELDS CHECK] and [REQUIRED FIELDS MISSING]
- Location: services/replyflow-ai-voice/src/index.ts

### 2. SMS Sending in Completion Time Path (lines 6229-6286)
- Sends SMS immediately when areAllRequiredFieldsCollected returns true
- Uses live intakeData
- Location: services/replyflow-ai-voice/src/index.ts

### 3. SMS Sending in Callback Time Path (lines 6386-6443)
- Sends SMS immediately when areAllRequiredFieldsCollected returns true
- Uses live intakeData
- Location: services/replyflow-ai-voice/src/index.ts

### 4. enterTerminalClose (lines 487-695)
- Sets terminal flags
- Sends final sentence through OpenAI
- Starts hangup timers
- Location: services/replyflow-ai-voice/src/index.ts

### 5. ingestCallData (lines 4000-5138)
- Called when WebSocket closes
- Uses GPT-4 extraction to determine completion (line 4439)
- Creates lead, conversation, and AI call record
- Location: services/replyflow-ai-voice/src/index.ts

## Issues Identified

### Critical Issues
1. **Multiple completion paths**: SMS sent in both completion time and callback time paths (potential duplicate)
2. **No idempotent finalization lock**: No completeFinalizationStarted or completeFinalizationFinished flags
3. **ingestCallData uses GPT-4 extraction**: Not using live intakeData for completion decision
4. **No centralized sendApprovedPrompt function**: Multiple functions handle speech

### Potential Issues
1. **Scope violation check is passive**: Only logs, doesn't block
2. **Model-generated legacy confirmation detection**: Only logs, doesn't prevent
3. **No assistantSpeaking timeout**: Could block caller audio indefinitely
4. **Multiple assistantSpeaking/activeResponseId set/clear points**: Need to audit all locations

## Old Code Paths to Search
- urgency
- callbackNumber
- phone number
- best number
- anything else
- confirmation
- voicemail fallback completion
- GPT extracted fields completion

## Additional Findings

### Completion Logic Paths (Continued)
6. isAIIntakeComplete (line 4439 in ingestCallData)
   - Used in ingestCallData to determine completion based on GPT-4 extracted fields
   - NOT using live intakeData
   - Location: services/replyflow-ai-voice/src/index.ts

7. getMissingRequiredFields (lines 457-492)
   - Identifies missing required fields
   - Used in incomplete finalization path
   - Location: services/replyflow-ai-voice/src/index.ts

### Old Code Paths Found
1. **urgencyLevel** (line 7565, 7875)
   - Extracted in GPT-4 extraction prompt
   - Included in summary message
   - NOT in required fields list

2. **preferredCallbackTime** (line 7565, 7876)
   - Extracted in GPT-4 extraction prompt
   - Included in summary message
   - Old field name (should be callbackTime)

3. **callerName** (line 7565)
   - Extracted in GPT-4 extraction prompt
   - Old field name (should be customerName)

4. **reasonForCalling** (line 7565)
   - Extracted in GPT-4 extraction prompt
   - Old field name (should be serviceRequested)

5. **addressOrLocation** (line 7565)
   - Extracted in GPT-4 extraction prompt
   - Old field name (should be serviceAddress)

6. **importantDetails** (line 7565)
   - Extracted in GPT-4 extraction prompt
   - Old field name (should be issueDescription)

### Audio Blocking Logic
1. **Audio blocking in closing state** (lines 7308-7314)
   - Blocks outbound assistant audio when callState === 'closing'
   - Location: services/replyflow-ai-voice/src/index.ts

2. **Caller audio blocking in terminal mode** (lines 5177-5198)
   - Blocks caller audio when terminal state flags are set
   - Checks: intakeTerminalComplete, terminalClosingResponseStarted, finalClosingStarted, callState
   - Location: services/replyflow-ai-voice/src/index.ts

### Terminal Mode Triggers
1. **Final sentence detection in transcript** (lines 7084-7144)
   - Detects exact closing sentence or follow-up phrase
   - Sets terminal mode immediately
   - Location: services/replyflow-ai-voice/src/index.ts

### Session Instructions (OpenAI System Prompt)
1. **Session update instructions** (lines 5611-5656)
   - Sets "extraction-only AI assistant" mode
   - Explicitly instructs: "You MUST NOT generate any conversational responses on your own"
   - Explicitly instructs: "You MUST NOT ask questions, give advice, troubleshoot, diagnose, or provide guidance"
   - Explicitly instructs: "The app controls ALL spoken responses"
   - Explicitly instructs: "Speak ONLY that exact text and nothing else"
   - Location: services/replyflow-ai-voice/src/index.ts

### Greeting Path
1. **Initial greeting** (lines 6922-6936)
   - Sends greeting after session.updated
   - Hardcoded text: "Hi, I'm the assistant for the business. Can you please let me know your name and your reason for calling?"
   - Uses sendControlledAssistantText
   - Has greetingSent flag to prevent duplicate
   - Location: services/replyflow-ai-voice/src/index.ts

## Code Changes Made

### 1. Idempotent Finalization Lock (lines 85-87)
- Added `completeFinalizationStartedByCallSid` Set to prevent duplicate finalization
- Added `completeFinalizationFinishedByCallSid` Set to track completed finalization
- Location: services/replyflow-ai-voice/src/index.ts

### 2. finalizeCompleteIntakeOnce Function (lines 702-767)
- Implemented idempotent finalization function
- Checks locks before proceeding
- Sends summary SMS from live intakeData
- Adds COMPLETE PATH logs at each step
- Location: services/replyflow-ai-voice/src/index.ts

### 3. Consolidated SMS Sending (lines 6174-6192, 6286-6300)
- Removed inline SMS sending from completion time path
- Removed inline SMS sending from callback time path
- Both paths now call finalizeCompleteIntakeOnce
- Ensures SMS is sent exactly once
- Location: services/replyflow-ai-voice/src/index.ts

### 4. Updated GPT Extraction Prompt (lines 7538)
- Changed field names from old names to new names:
  - callerName → customerName
  - reasonForCalling → serviceRequested
  - importantDetails → issueDescription
  - addressOrLocation → serviceAddress
  - preferredCallbackTime → callbackTime
  - Removed urgencyLevel
- Location: services/replyflow-ai-voice/src/index.ts

### 5. Updated Fallback Extracted Fields (lines 7574-7582)
- Changed field names to match required fields
- Removed urgencyLevel
- Location: services/replyflow-ai-voice/src/index.ts

### 6. Updated Summary Message Generation (lines 7844-7850)
- Changed field names to match required fields
- Removed urgency field
- Location: services/replyflow-ai-voice/src/index.ts

## Remaining Issues to Address

### High Priority
1. **AssistantSpeaking/ActiveResponseId not audited**: Need to find all set/clear points
2. **No assistantSpeaking timeout**: Could block caller audio indefinitely
3. **Scope guard is passive**: Only logs violations, doesn't block
4. **No centralized sendApprovedPrompt function**: Multiple speech paths still exist
5. **No VOICE OUTBOUND logging**: Can't trace all assistant speech

### Medium Priority
1. **Greeting uses hardcoded text**: Should use STAGE_PROMPTS constant
2. **Multiple response.create paths**: Need to ensure all use approved prompts
3. **Session instructions may not be sufficient**: AI might still generate responses

## Success Criteria
- [x] Summary SMS sent exactly once from live intakeData
- [x] Idempotent finalization prevents duplicate SMS
- [x] Old field names removed from GPT extraction
- [x] COMPLETE PATH logs added
- [ ] All assistant speech goes through approved prompts only
- [ ] Scope guard blocks unauthorized speech
- [ ] AssistantSpeaking timeout prevents audio blocking
- [ ] VOICE OUTBOUND logging on all speech

## Next Steps
1. Search for all assistantSpeaking assignments
2. Search for all activeResponseId assignments
3. Implement centralized sendApprovedPrompt function
4. Add VOICE OUTBOUND logging before every assistant speech
5. Add scope guard that blocks instead of just logging
6. Add assistantSpeaking timeout with force reset
