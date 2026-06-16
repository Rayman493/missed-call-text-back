# Hangup Investigation Findings

## Problem
Call does not hang up after final goodbye audio despite multiple timers:
- mark-based hangup
- fallback mark sender
- direct hangup fallback
- hard-stop timer

## Root Cause Indicator
Logs show:
```
[CALL STATE BLOCKED] Cannot set callState to closing - terminalClosingResponseStarted is false
```
while final audio is actively streaming.

This indicates `terminalClosingResponseStarted` is not being set when the final response path executes.

## Investigation Results

### 1. Message Listener Attachments

**Finding:** The "[OPENAI AUDIT] message listener attached" log is misleading.

**Locations:**
- Line 3414: Inside message handler callback
- Line 4528: Inside message handler callback

**Analysis:** The log appears INSIDE the message handler callback, meaning it logs every time a message is received, not every time a listener is attached. Listeners are NOT being attached repeatedly.

**Conclusion:** This is a logging artifact, not a duplicate listener problem.

### 2. STREAM CLONED Logs

**Locations:**
- Lines 3079-3179: WebSocket creation sequence
- Line 3402: OPEN event
- Line 3413: MESSAGE event
- Line 4532: ERROR event

**Analysis:** These logs appear to be part of the stream cloning logic and event tracking, not indicating multiple listener attachments.

### 3. WebSocket Message Handlers

**Locations where `ws.on('message')` is used:**
- Line 1483: debugWs.on('message') - debug WebSocket
- Line 1568: testWs.on('message') - test WebSocket
- Line 3412: openAiWs.on('message') - main OpenAI WebSocket handler

**Finding:** Only ONE message listener is attached to the OpenAI WebSocket (line 3412), which is correct.

### 4. State Variable Assignments

#### terminalClosingResponseStarted assignments:
- Line 1658: Set in `startAuthoritativeFinalClose()` function
- Line 1863: Initialized to `false` at function scope
- Line 3686: Updated from twilioHandler after function call (first call site)
- Line 4255: Updated from twilioHandler after function call (second call site)

#### finalClosingStarted assignments:
- Line 1662: Set in `startAuthoritativeFinalClose()` function
- Line 1862: Initialized to `false` at function scope
- Line 3685: Updated from twilioHandler after function call (first call site)
- Line 4254: Updated from twilioHandler after function call (second call site)

#### callState assignments:
- Multiple locations for state transitions

### 5. startAuthoritativeFinalClose Function

**Function signature (lines 1627-1633):**
```typescript
function startAuthoritativeFinalClose(
  callStateRef: { value: string },
  finalClosingStartedRef: { value: boolean },
  terminalClosingResponseStartedRef: { value: boolean },
  confirmationStateRef: { value: string },
  hardStopExecutedRef: { value: boolean },
  twilioHandler: any
)
```

**Call sites:**
1. Line 3669: Inside `response.output_audio.delta` handler (first call)
2. Line 4238: Inside `response.done` handler (second call)

**Critical Finding:** The function takes references to local variables, updates the references, and then the caller updates local variables from the handler. This creates a potential synchronization issue.

### 6. Potential Root Cause

**Hypothesis:** The two call sites to `startAuthoritativeFinalClose` are in different event handlers:
1. Line 3669: In `response.output_audio.delta` handler
2. Line 4238: In `response.done` handler

If the `response.output_audio.delta` path executes but the function fails or is not called, `terminalClosingResponseStarted` remains `false`. Then when `callState` tries to transition to 'closing', it gets blocked.

**Key Question:** Which path is actually executing? The logs show "final audio is actively streaming" but `terminalClosingResponseStarted` is false, suggesting the `response.output_audio.delta` path is NOT calling `startAuthoritativeFinalClose` or it's failing silently.

### 7. Missing Instrumentation

**Current logs do NOT show:**
- When `terminalClosingResponseStarted` is set to true
- When `terminalClosingResponseStarted` is set to false
- When `finalClosingStarted` is set to true
- When `finalClosingStarted` is set to false
- Stack traces/source labels for these changes
- State transition timeline

## Next Steps

1. Add detailed logging for every state variable assignment with stack labels
2. Add listener counts to verify no duplicate listeners
3. Build state transition table from logs
4. Determine which code path is actually executing
5. Verify if `terminalClosingResponseStarted` is being reset to false after being set
