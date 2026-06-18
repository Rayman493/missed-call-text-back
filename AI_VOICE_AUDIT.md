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

## AssistantSpeaking and ActiveResponseId Audit

### assistantSpeaking Set Points
1. **Set to TRUE** (line 6627-6630)
   - Trigger: response.output_audio.delta
   - Sets callSessionState.assistantSpeaking and individual assistantSpeaking variable
   - Syncs to twilioHandler
   - Starts 30-second timeout protection
   - Location: services/replyflow-ai-voice/src/index.ts

### assistantSpeaking Clear Points
1. **Cleared on response.audio.done** (line 6730-6749)
   - Resets assistantSpeaking to false
   - Clears timeout protection
   - Logs state change
   - Location: services/replyflow-ai-voice/src/index.ts

2. **Cleared on response.done** (line 6830-6847)
   - Resets assistantSpeaking to false
   - Clears timeout protection
   - Logs state change
   - Location: services/replyflow-ai-voice/src/index.ts

3. **Cleared by timeout** (line 6644-6654)
   - 30-second timeout resets assistantSpeaking if stuck
   - Logs force reset
   - Location: services/replyflow-ai-voice/src/index.ts

### activeResponseId Set/Clear Points
1. **Set** (line 7000-7008)
   - Trigger: response.created during final closing
   - Sets authorizedFinalResponseId
   - Location: services/replyflow-ai-voice/src/index.ts

2. **Cleared** (line 6823-6828)
   - Trigger: response.done
   - Clears activeResponseId when response completes
   - Location: services/replyflow-ai-voice/src/index.ts

### Audio Blocking Logic Findings
- assistantSpeaking has proper timeout protection (30 seconds)
- assistantSpeaking clears on both response.audio.done and response.done
- activeResponseId clears on response.done
- No missing clear points found
- Audio blocking logic appears sound

## Speech Paths Found in AI Voice Code

### Current Speech Paths
1. **sendControlledAssistantText** (line 890-975)
   - Main function that sends response.create
   - Has forbidden phrase detection
   - Uses strict instruction: "SAY EXACTLY THIS TEXT AND NOTHING ELSE"
   - Location: services/replyflow-ai-voice/src/index.ts

2. **sendStagePrompt** (line 977-1099)
   - Calls sendControlledAssistantText with STAGE_PROMPTS
   - Has duplicate prompt prevention
   - Has max attempt limit (2 attempts per stage)
   - Location: services/replyflow-ai-voice/src/index.ts

3. **STAGE_PROMPTS** (line 1105-1112)
   - Contains approved prompts for each stage
   - Current prompts:
     - ask_name_reason: "Hi, I'm the assistant for the business. Can you please let me know your name and your reason for calling?"
     - ask_details: "Got it. Can you share any important details the business should know?"
     - ask_location: "Thanks. Where will the service take place?"
     - ask_completion_time: "Thanks. When would you like this service completed?"
     - ask_callback_time: "What's the best time for the business to call you back?"
     - complete: "Thanks for the information. Have a great day!"
   - Location: services/replyflow-ai-voice/src/index.ts

4. **Greeting** (line 6901-6902)
   - Hardcoded text: "Hi, I'm the assistant for the business. Can you please let me know your name and your reason for calling?"
   - Uses sendControlledAssistantText
   - Triggered by session.updated event
   - Location: services/replyflow-ai-voice/src/index.ts

5. **sendStagePrompt calls**
   - Line 6212: sendStagePrompt(intakeData!.stage, openAiWs, ...) in completion time path
   - Line 6372: sendStagePrompt(intakeData!.stage, openAiWs, ...) in general intake path
   - Location: services/replyflow-ai-voice/src/index.ts

### Session Instructions (line 5682-5727)
- Already says: "You will receive exact text to speak via response.create instructions. Speak ONLY that exact text and nothing else."
- Already says: "Do not ask any questions on your own initiative."
- Already says: "SPEAK ONLY the exact text provided by the app via response.create instructions."
- Has create_response: false in turn_detection to prevent auto-responses
- Location: services/replyflow-ai-voice/src/index.ts

### Speech Path Summary
- Total speech paths: 5 (sendControlledAssistantText, sendStagePrompt, STAGE_PROMPTS, Greeting, sendStagePrompt calls)
- All speech currently goes through sendControlledAssistantText
- No direct response.create calls outside of sendControlledAssistantText found
- Session instructions already prohibit AI-generated responses

## Speech Path Refactoring - Code Changes Made

### 1. Implemented sendApprovedPrompt Function (lines 890-964)
- Created centralized function for all approved assistant speech
- Maps stage names to exact approved text in APPROVED_PROMPTS constant
- Adds [VOICE OUTBOUND] logging with stage name and text
- Blocks unknown stages with [VOICE SCOPE VIOLATION BLOCKED] log
- Returns boolean to indicate if prompt was sent or blocked
- Location: services/replyflow-ai-voice/src/index.ts

### 2. APPROVED_PROMPTS Constant (lines 894-901)
- Contains exact approved prompts for each stage:
  - ask_name_reason: "Hi, I'm the assistant for the business. Can you please let me know your name and your reason for calling?"
  - ask_details: "Got it. Can you share any important details the business should know?"
  - ask_location: "Thanks. Where will the service take place?"
  - ask_completion_time: "Thanks. When would you like this service completed?"
  - ask_callback_time: "What's the best time for the business to call you back?"
  - final_goodbye: "Perfect. I have everything I need. The team will follow up with you soon."
- Location: services/replyflow-ai-voice/src/index.ts

### 3. Refactored Greeting (line 6978)
- Changed from hardcoded text to sendApprovedPrompt('ask_name_reason', openAiWs)
- Now uses centralized approved prompt function
- Location: services/replyflow-ai-voice/src/index.ts

### 4. Refactored sendStagePrompt (line 1173)
- Changed from sendControlledAssistantText to sendApprovedPrompt(stage, openAiWs)
- Now uses centralized approved prompt function
- Location: services/replyflow-ai-voice/src/index.ts

### 5. Updated STAGE_PROMPTS (line 1189)
- Changed 'complete' prompt text to match final_goodbye text
- Updated comment to note mapping to APPROVED_PROMPTS
- Location: services/replyflow-ai-voice/src/index.ts

### 6. Enhanced Session Instructions (lines 5789-5810)
- Added explicit instruction: "Do not generate assistant responses"
- Added explicit instruction: "Do not ask questions"
- Added explicit instruction: "Only convert provided approved assistant text into speech"
- Added explicit instruction: "Generate any assistant responses on your own" to DO NOT list
- Location: services/replyflow-ai-voice/src/index.ts

### 7. Added Scope Guard to response.created (lines 7084-7106)
- Checks if response was created by sendApprovedPrompt via expectedPrompt
- Blocks responses without expectedPrompt (indicates AI-generated response)
- Logs [VOICE SCOPE VIOLATION BLOCKED] and cancels unauthorized responses
- Allows final close responses (isFinalClose exception)
- Location: services/replyflow-ai-voice/src/index.ts

## Remaining Issues to Address

### High Priority
1. **Test call shows exactly 6 [VOICE OUTBOUND] logs with no other speech**: Need to verify implementation works correctly

### Medium Priority
1. **Greeting uses hardcoded text**: Should use STAGE_PROMPTS constant
2. **Multiple response.create paths**: Need to ensure all use approved prompts
3. **Session instructions may not be sufficient**: AI might still generate responses

## Success Criteria
- [x] Summary SMS sent exactly once from live intakeData
- [x] Idempotent finalization prevents duplicate SMS
- [x] Old field names removed from GPT extraction
- [x] COMPLETE PATH logs added
- [x] AssistantSpeaking timeout prevents audio blocking
- [x] All assistant speech goes through approved prompts only via sendApprovedPrompt
- [x] Scope guard blocks unauthorized speech with [VOICE SCOPE VIOLATION BLOCKED]
- [x] VOICE OUTBOUND logging on all speech with stage names
- [x] Session instructions explicitly say do not generate assistant responses
- [x] Greeting uses sendApprovedPrompt(ask_name_reason)
- [x] sendStagePrompt calls sendApprovedPrompt
- [ ] Test call shows exactly 6 [VOICE OUTBOUND] logs with no other speech

## Next Steps
1. Test completed call shows correct log sequence and customer receives SMS
2. Verify test call shows exactly 6 [VOICE OUTBOUND] logs with no other speech
