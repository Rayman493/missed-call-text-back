# AI Intake Reliability Audit

## PART 1 - Current Production Simple Mode Stage Sequence

### Exact Stage Flow (from index.ts lines 6982-6999)

```
ask_name
  ↓
ask_request
  ↓ (branch on serviceLocationType)
  ├─ onsite → ask_location → ask_completion_time → ask_callback_time → complete
  └─ remote → ask_completion_time → ask_callback_time → complete
```

### Stage Details

| Stage | Purpose | Accepted Field | Transition Condition | Silence Behavior | Retry Behavior | Max Retry | Multi-Field | Persistence |
|-------|---------|----------------|---------------------|-----------------|---------------|-----------|-------------|-------------|
| ask_name | Get caller name | customerName | Any non-empty name | Reprompt once (ask_name) | 1 reprompt then finalize | 2 | Yes (can capture request early) | stageCaptures + intakeData.customerName |
| ask_request | Get service needed | request/serviceRequested | Any non-empty service request | Reprompt once (ask_request) | 1 reprompt then finalize | 2 | Yes (can capture name early) | stageCaptures + intakeData.request |
| ask_location | Get service address | serviceAddress | Any non-empty address | Reprompt once (ask_location) | 1 reprompt then finalize | 2 | Yes | stageCaptures + intakeData.serviceAddress |
| ask_completion_time | Get desired timing | desiredCompletionTime | Any timing info | Reprompt once (ask_completion_time) | 1 reprompt then finalize | 2 | Yes | stageCaptures + intakeData.desiredCompletionTime |
| ask_callback_time | Get callback preference | callbackTime | Any callback timing | Reprompt once (ask_callback_time) | 1 reprompt then finalize | 2 | Yes | stageCaptures + intakeData.callbackTime |
| complete | Closing message | N/A | N/A | N/A | N/A | N/A | N/A | Final persistence |

### Service Location Type Branching

- **onsite**: Includes ask_location stage
- **customer_comes_to_business**: Skips ask_location (remote)
- **remote**: Skips ask_location (remote)

Resolution happens via `loadServiceLocationTypeForBusiness()` before stage transitions after ask_request.

## PART 2 - Stage Ownership Model

### State Ownership (from state object, lines 6815-6865)

| State Field | Purpose | Owner | Scope |
|-------------|---------|-------|-------|
| currentStage | Current active question | Main state machine | Per call |
| pendingAnswerStage | Stage awaiting answer (during settle window) | Settle window logic | Per turn |
| pendingAnswerTurnId | Turn ID for pending answer | Settle window logic | Per turn |
| settleGeneration | Generation counter for stale callback protection | Settle window lifecycle | Per call |
| currentTurnId | Monotonically increasing turn counter | Turn lifecycle | Per call |
| intakeData | Extracted field values | Extraction logic | Per call (persistent) |
| stageCaptures | Turn-by-turn transcript | Capture logic | Per call (persistent) |
| silenceRetryCountByStage | Per-stage retry counter | Timeout logic | Per call |
| silentTimeout | Silence timer reference | Timeout logic | Per call |
| stageTimeout | Stage timeout reference | Timeout logic | Per call |
| settleWindowTimeout | Settle window timer reference | Settle window logic | Per turn |
| callSid | Twilio call identifier | Session | Per call |
| sessionId | Unique session identifier | Session | Per call |

### Stale Callback Protection

**isSettleCallbackAuthorized** (lines 129-162):
- Checks `capturedGeneration === state.settleGeneration` (generation guard)
- Checks `state.pendingAnswerStage === originatingStage` (stage guard)
- Checks `state.pendingAnswerTurnId === originatingTurnId` (turn guard)
- Returns `{ authorized: true | false, reason: string }`
- Logs all authorization failures for debugging

**Turn Increment**:
- `state.currentTurnId++` occurs on settle finalization (line 454)
- Invalidates all older callbacks automatically

### Asynchronous Callbacks Audited

1. **Settle window timeout callback** (finalizeSimpleModeSettledAnswer):
   - Guarded by isSettleCallbackAuthorized
   - Checks generation, stage, and turn ID
   - ✅ SAFE

2. **Stage timeout callback** (handleStageTimeout):
   - No turn/stage guard (uses currentStage directly)
   - ⚠️ POTENTIAL: Could fire after stage changes if not cleared
   - Cleared by clearStageTimeout() on transitions

3. **Silence timeout callback** (legacy, disabled):
   - Has settle window guard (line 10047)
   - Currently disabled (commented out)
   - ⚠️ DISABLED

4. **OpenAI response callbacks**:
   - Handled via OpenAIRealtimeClient
   - Uses responseId for correlation
   - ⚠️ NEEDS AUDIT

## PART 3 - Silence Recovery Audit

### Current Silence Behavior (handleStageTimeout, lines 8564-8683)

**First Silence (retryCount === 0):**
- Increments `state.silenceRetryCountByStage[stage]` to 1
- Logs reprompt authorized
- Dispatches reprompt for CURRENT stage
- Uses field-aware prompt selection (ask_name_reason variants)
- ✅ CORRECT: Reprompts current stage

**Second Silence (retryCount >= 1):**
- Logs finalization with partial info
- Clears stageTimeout and silentTimeout
- Sets `state.currentStage = 'complete'`
- Sends 'complete' prompt
- Calls processSimpleModeCompletion()
- ✅ CORRECT: Finalizes gracefully

### Historical Issue Analysis

**Potential historical cause of fallback to earlier prompt:**
- If `state.currentStage` was not properly updated on transition
- If stage timeout fired after stage change
- If reprompt used wrong prompt key

**Current mitigations:**
- Stage transitions update state.currentStage before dispatch
- clearStageTimeout() called before stage changes
- Field-aware prompt selection uses current state.intakeData
- ✅ ISSUE APPEARS MITIGATED in current code

### Test Scenarios Needed

1. ✅ Silence on ask_name → should reprompt ask_name
2. ✅ Silence twice → should finalize with partial info
3. ⚠️ Silence during settle window → should be blocked (has guard)
4. ⚠️ Silence after stage change but before timeout cleared → NEEDS TEST
5. ⚠️ Silence on ask_name_reason with partial data → should use targeted reprompt

## PART 4 - Dead-Air Invariant

### Current State Machine Flow

**After valid caller turn:**
1. Transcript received → extraction occurs
2. If extraction successful → settle window starts
3. After settle window → stage transition + prompt dispatch
4. If extraction failed → reprompt or clarification

**Potential dead-air paths:**
1. ❓ Transcript received but extraction fails silently
2. ❓ Settle window completes but prompt dispatch fails
3. ❓ Stage advances but no prompt queued
4. ❓ OpenAI response generation fails silently

### Current Protections

- **Settle window timeout**: Triggers finalization if no response
- **Stage timeout**: Triggers reprompt or finalization
- **Prompt dispatch success tracking**: Logs and handles failures
- **Completion repair**: Handles missing fields

### Missing Invariant Check

No explicit invariant check exists that ensures system is always in one of:
A. generating next response
B. awaiting deliberate clarification
C. completed
D. gracefully ending

**RECOMMENDATION:** Add invariant assertion in critical points (stage transitions, settle finalization)

## PART 5 - Multi-Field / Early Information

### Current Implementation

**handleImmediateAdvanceIfMultiFieldCaptured** (lines 167-207):
- Triggered after transcript acceptance
- Checks if both customerName and request are present
- If yes on ask_name stage, skips ask_request
- Dispatches next stage prompt
- ✅ IMPLEMENTED

### Test Coverage

**Existing test:** immediateAdvanceSimpleMode.test.ts
- Tests multi-field capture on ask_name
- ✅ COVERED

**Missing tests:**
- ⚠️ Multi-field on ask_request (early location/time)
- ⚠️ Multi-field across all stages
- ⚠️ Early field preservation through later stages
- ⚠️ Later prompt doesn't overwrite earlier valid data

## PART 6 - Corrections

### Current Behavior

**Correction mechanism:**
- Caller says "Actually, it's [new value]"
- Extraction updates field in state.intakeData
- Stage transitions based on updated state
- ⚠️ NO SPECIFIC CORRECTION HANDLING

**Potential issues:**
- ⚠️ No explicit "correction" detection
- ⚠️ May treat correction as new answer
- ⚠️ Could overwrite with blank if extraction fails
- ⚠️ No audit trail for corrections

### Test Scenarios Needed

1. ⚠️ Name correction: "Actually it's Jon without the h"
2. ⚠️ Timing correction: "Actually Saturday would be better"
3. ⚠️ Address correction: "Sorry, 100 Main Street"
4. ⚠️ Correction preserves unrelated fields
5. ⚠️ Transcript reflects final value
6. ⚠️ Summary reflects final value

## PART 7 - Natural Caller Variations

### Test Coverage Status

| Variation | Test Status | Test File |
|-----------|-------------|-----------|
| Normal concise caller | ✅ Covered | Various tests |
| Very fast caller | ⚠️ Partial | speechContinuationRegression.test.ts |
| Hesitant caller | ⚠️ Partial | askNameReasonRegression.test.ts |
| Long detailed caller | ⚠️ Partial | Various tests |
| Caller answers multiple at once | ✅ Covered | immediateAdvanceSimpleMode.test.ts |
| Irrelevant/filler response | ⚠️ Not tested | - |
| Caller interrupts AI | ⚠️ Partial | speechContinuationRegression.test.ts |
| Caller corrects AI | ❌ Not tested | - |
| Caller asks AI to repeat | ❌ Not tested | - |
| Caller says "I don't know" | ⚠️ Partial | Various tests |
| Ambiguous timing | ⚠️ Partial | Various tests |
| Ambiguous callback time | ⚠️ Partial | Various tests |
| Unusual name | ✅ Covered | parseNameAndService.test.ts |
| Business name instead of personal | ⚠️ Partial | parseNameAndService.test.ts |
| Address with unit/apartment | ❌ Not tested | - |
| No service location needed | ✅ Covered | serviceLocationRouting.test.ts |
| Caller hangs up halfway | ✅ Covered | wsCloseFinalizationSimple.test.ts |
| Caller hangs up after giving all data | ✅ Covered | wsCloseFinalizationSimple.test.ts |
| Repeated call from same number | ❌ Not tested | - |
| Back-to-back calls different numbers | ❌ Not tested | - |

## PART 8 - Field Persistence / Output Consistency

### Current Persistence Points

1. **During intake:** state.intakeData updated on extraction
2. **Stage captures:** state.stageCaptures stores Q&A pairs
3. **Completion:** processSimpleModeCompletion() persists to DB
4. **Partial disconnect:** finalizeIncompleteOnWebsocketCloseSimple()

### Data Flow

```
Caller Speech
  ↓
OpenAI Transcript
  ↓
Extraction (intakeData)
  ↓
Stage Capture (stageCaptures)
  ↓
Completion → ai_call_records (extracted_info)
  ↓
Webhook → Customer/Lead update
  ↓
SMS notification
```

### Consistency Checks

**Current:**
- ✅ stageCaptures stores raw transcript
- ✅ intakeData stores extracted fields
- ✅ ai_call_records stores extracted_info JSON
- ⚠️ No cross-validation between sources
- ⚠️ No assertion that transcript, extracted field, and summary agree

**RECOMMENDATION:** Add consistency assertions in completion logic

## PART 9 - Partial Calls

### Current Implementation

**finalizeIncompleteOnWebsocketCloseSimple** (lines 285-428):
- Checks if stageCaptures or intakeData have data
- Builds transcript from stageCaptures
- Calls finalizeIncompleteIntake()
- Persists partial data
- ✅ IMPLEMENTED

**Test coverage:** wsCloseFinalizationSimple.test.ts
- ✅ COVERED

### Hangup at Every Stage

| Stage | Test Status |
|-------|-------------|
| ask_name | ✅ Covered |
| ask_request | ✅ Covered |
| ask_location | ⚠️ Not explicitly tested |
| ask_completion_time | ⚠️ Not explicitly tested |
| ask_callback_time | ⚠️ Not explicitly tested |
| complete | ✅ Covered |

## PART 10 - Repeated Call State Isolation

### State Scope

All state is per-session (per WebSocket connection):
- ✅ state object created per call
- ✅ No global mutable state
- ✅ No shared references between calls

### Potential Leakage Points

1. ⚠️ Supabase connection (singleton)
2. ⚠️ OpenAI API key (environment variable, read-only)
3. ⚠️ Cached audio (read-only)
4. ⚠️ Test fallbacks (global flag, but tests only)

**ASSESSMENT:** ✅ LOW RISK - No obvious shared mutable state

### Test Coverage

**Existing:** conversationRaceRegression.test.ts
- Tests concurrent session handling
- ✅ COVERED

**Missing:**
- ⚠️ Back-to-back calls from same number
- ⚠️ Back-to-back calls from different numbers
- ⚠️ State cleanup between calls

## PART 11 - Timeout / Timer Ownership

### Timer Types

| Timer | Purpose | Cancellation | Owner | Scope |
|-------|---------|--------------|-------|-------|
| stageTimeout | Stage-level timeout | clearStageTimeout() | Stage timeout logic | Per call |
| silentTimeout | Silence detection | clearSilentTimeout() | Silence logic | Per call |
| settleWindowTimeout | Settle window timer | Cleared on finalization | Settle window logic | Per turn |
| sessionReadyTimeout | OpenAI handshake | Cleared on success | OpenAI client | Per call |
| markWatchdogTimeout | Response generation watchdog | Unclear | Watchdog logic | Per call |
| transcriptionWatchdogTimeout | Transcription watchdog | Unclear | Watchdog logic | Per call |

### Cancellation Points

**Stage transitions:**
- ✅ clearStageTimeout() called before transition
- ✅ clearSilentTimeout() called on settle finalization
- ⚠️ settleWindowTimeout cleared in finalizeSimpleModeSettledAnswer

**Call completion:**
- ✅ All timeouts cleared on disconnect

**Missing:**
- ⚠️ Watchdog timeout cancellation not audited
- ⚠️ No explicit timer cleanup on stage regression

### Test Coverage

**Existing:** timing-policy.test.ts
- ✅ Tests silence timing per stage
- ✅ Tests settle window requirements

**Missing:**
- ⚠️ Stale timeout cannot fire after stage change
- ⚠️ Timer cleanup on all exit paths
- ⚠️ Watchdog timeout behavior

## PART 12 - Instrumentation

### Current Logging

**Prefixes:**
- [STAGE TRANSITION]
- [LOGICAL TURN LIFECYCLE]
- [ANSWER FINALIZATION]
- [FINALIZATION]
- [PARTIAL FIELDS AT DISCONNECT]
- [SIMPLE MODE]

**Logged:**
- ✅ callSid
- ✅ stage transitions
- ✅ turn IDs
- ✅ generation IDs
- ✅ transition reasons
- ✅ timeout events
- ✅ extraction results (field names)
- ✅ completion/termination reasons

**NOT logged (for privacy):**
- ✅ Secrets (API keys)
- ✅ Full customer content in some cases

### Missing Instrumentation

- ⚠️ No unified [AI_INTAKE_HARDEN] prefix
- ⚠️ Some logging inconsistent
- ⚠️ No correlation ID for all events in a call

**RECOMMENDATION:** Add unified prefix for easier filtering

## PART 13 - Summary of Findings

### Proven Defects

**None found in code audit.** Code appears to have:
- ✅ Stale callback protection (isSettleCallbackAuthorized)
- ✅ Turn lifecycle tracking (currentTurnId, settleGeneration)
- ✅ Multi-field handling (handleImmediateAdvanceIfMultiFieldCaptured)
- ✅ Partial call persistence (finalizeIncompleteOnWebsocketCloseSimple)
- ✅ Stage timeout with reprompt logic
- ✅ Per-session state (no shared mutable state)

### Potential Areas of Concern

1. **Stage timeout stale callback:** No turn/stage guard like settle window
   - Mitigated by clearStageTimeout() before transitions
   - ⚠️ NEEDS TEST to prove stale callback cannot fire

2. **No dead-air invariant:** No explicit check for valid state
   - ⚠️ SHOULD ADD invariant assertion

3. **Correction handling:** No explicit correction detection/handling
   - Current behavior may work but untested
   - ⚠️ NEEDS TESTS

4. **Field consistency:** No cross-validation between transcript/extracted/summary
   - ⚠️ SHOULD ADD consistency assertions

5. **Watchdog timers:** Not fully audited for cancellation
   - ⚠️ NEEDS AUDIT

### Test Gaps

1. ❌ Silence after stage change (timeout race)
2. ❌ Corrections (name, timing, address)
3. ❌ Multi-field across all stages
4. ❌ Field preservation through later stages
5. ❌ Ambiguous timing variations
6. ❌ "I don't know" responses
7. ❌ Back-to-back calls
8. ❌ Address with unit/apartment
9. ❌ Caller asks to repeat
10. ❌ Field consistency validation

## PART 14 - Recommended Actions

### Do NOT Change Yet

The code audit found no obvious defects. The system has:
- Stale callback protection
- Turn lifecycle tracking
- Multi-field handling
- Partial call persistence
- Per-session state

### Recommended Next Steps

1. **Add targeted tests** for the 10 test gaps above
2. **Add invariant assertion** for dead-air protection
3. **Add field consistency checks** in completion logic
4. **Run physical calls** from test matrix (PART 16)
5. **Only fix proven defects** found through testing

### No Code Changes Recommended at This Time

The audit did not find clear code defects. Any changes should be evidence-driven from test failures or physical call issues.