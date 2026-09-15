# ReplyFlow — AI Intake Final Pre-Launch Hardening + Physical Test Matrix

**Scope:** `services/replyflow-ai-voice/src/index.ts` and helpers, `services/replyflow-ai-voice/src/intake-validation.ts`, `src/lib/ai-intake-formatter.ts`, `src/lib/ai-field-mapping.ts`.

**Goal:** Audit current production Simple Mode AI intake from source, fix only proven defects, and produce a 20+ call physical test campaign.

**Final recommendation:** `READY FOR PHYSICAL AI CAMPAIGN` — with the proven refusal/non-answer defect patched and the matrix below to validate everything else.

---

## 1. Exact Current Production Stage Sequence

Simple Mode starts at `ask_name` and is field-aware, not purely linear. The canonical prompt keys are:

- `ask_name`
- `ask_request`
- `ask_name_reason` / `ask_name_reason_service_only` / `ask_name_reason_name_only`
- `ask_location`
- `ask_completion_time`
- `ask_callback_time`
- `complete`

Runtime progression (`resolveNextSimpleModeStage` in `intake-validation.ts`):

1. `ask_name_reason` (or `ask_name`) — captures `customerName` and/or `serviceRequested`.
2. If `serviceRequested` missing, prompt for request (`ask_request` / `ask_name_reason_service_only`).
3. If onsite and `serviceAddress` missing, prompt `ask_location`.
4. If `desiredCompletionTime` missing, prompt `ask_completion_time`.
5. If `callbackTime` missing, prompt `ask_callback_time`.
6. `complete` when all required fields are satisfied.

Skip-ahead: any stage whose field is already populated is skipped by the resolver.

---

## 2. State-Machine Findings

- `currentStage` is the active question.
- `pendingAnswerStage` / `pendingAnswerTurnId` track the turn awaiting the settle window.
- `settleGeneration` is incremented on every new settle window; stale callbacks are rejected by `isSettleCallbackAuthorized`.
- `currentTurnId` increments on accepted capture and settle finalization; `sendPrompt` blocks prompts whose `turnId` is older.
- `stageTimeoutGeneration` guards the 15-second stage timeout.
- `answerAcceptedForStage` / `answerAcceptedTurnId` block late overwrites.
- State is created per WebSocket connection; `callSid` keys finalization locks. No shared mutable state between calls.

No stale-callback mutation path was found; the generation + stage + turn triple guard is in place.

---

## 3. Silence Behavior

- `lib/timing-policy.ts` is the single source of truth.
- OpenAI Realtime VAD `silence_duration_ms` is set per prompt.
- A 15-second `stageTimeout` runs while awaiting an answer.
- First silence for a stage: reprompt the current stage (using targeted variants for `ask_name_reason`).
- Second silence for the same stage: set `currentStage = 'complete'`, play `complete` prompt, and call `processSimpleModeCompletion` with partial data.
- No indefinite deadlock; `processSimpleModeCompletion` runs on timeout or disconnect.

---

## 4. Multi-Field / Skip-Ahead Behavior

- `parseNameAndService` (inside `storeStageCapture`) can pull name + service from one utterance.
- `extractFieldsFromTranscript` opportunistically extracts `serviceAddress`, `desiredCompletionTime`, `callbackTime`, and `issueDescription` from the same `ask_name_reason` transcript.
- `resolveNextSimpleModeStage` skips any stage whose field is already satisfied.
- `EARLY_COMPLETION_PATTERNS` / `EARLY_CALLBACK_PATTERNS` capture vague but real timing phrases (`whenever`, `asap`, `anytime`).

Risk: `extractFieldsFromTranscript` is regex-driven, so an `at` phrase like “look at a leaking faucet” can be mis-attributed unless `isConfidentEarlyServiceAddress` stops it.

---

## 5. Correction Behavior

- `mergeExtractedField` is **field-locking by default**: once a field is populated, valid later candidates are rejected.
- The only correction path today is manual `corrected.*` overrides in `getLeadAIIntake`.
- Latest-explicit-correction-wins is **not** implemented for live caller utterances.

This is a known, documented limitation that must be verified on real calls before launch.

---

## 6. Refusal / Unknown Behavior

`isRefusal` and `isNonAnswer` exist and are used for `customerName`, `serviceAddress`, and `issueDescription`.

**Proven defect found:** `isValidServiceRequest`, `isValidCompletionTime`, and `isValidCallbackTime` did **not** call `isRefusal`, and `validateStageAnswer` did not validate `ask_request`/`ask_location`/`ask_completion_time`/`ask_callback_time` answers with those validators. This allowed phrases like “I'd rather not say” or “I don't know” to be stored as real request/timing/callback values.

**Fix applied:**
- `isValidServiceRequest`, `isValidCompletionTime`, `isValidCallbackTime` now reject refusals.
- `validateStageAnswer` now calls the matching validator for each of those stages before accepting the answer.

"Anytime", "whenever", "as soon as possible", and vague-but-real preferences remain accepted.

---

## 7. Wrong-Question Behavior

- `extractFieldsFromTranscript` only writes to a field if it is empty, so a location given when asked for a reason can be captured only if `serviceAddress` is still empty.
- If the target field is already populated, the new value is logged and ignored (field lock protection).
- The current stage does not regress; the resolver advances forward.

Risk: an address mentioned during a reason prompt can still end up in `serviceRequested` if the address regexes do not fire. This is a regex-accuracy issue best validated on real calls.

---

## 8. Interruption / Barge-In

- `input_audio_buffer.speech_started` cancels the active stage timeout and increments the settle generation.
- Twilio `media` packets are gated on `!assistantSpeaking`.
- Prompt completion is mark-based; `assistantSpeaking` is cleared on the Twilio `mark` event (with a 10-second watchdog).
- Transcription processing uses the `originatingStage`/`speechGeneration` to avoid attributing a late transcription to the wrong turn.
- Settle finalization is blocked if newer speech exists or the generation has moved on.

No obvious stale-response path was found, but the `400ms` VAD grace is only applied to `ask_request`.

---

## 9. Partial-Hangup Behavior

- `ws.on('close')` clears all timers and awaits `finalizeIncompleteOnWebsocketCloseSimple`.
- It only finalizes if `!completionPersistenceStarted` and at least one `stageCapture` or `intakeData` field exists.
- `finalizeIncompleteIntake` uses `finalizationInProgressByCallSid` / `incompleteFinalizedCallSids` to prevent duplicate finalization.
- Partial records create/update `leads`, `conversations`, and `ai_call_records` with `outcome: 'incomplete'`.

---

## 10. Session Isolation

- Each WebSocket gets a fresh `state` object inside `handleSimpleModeConnection`.
- `callSid`-keyed `Map`s prevent cross-call finalization races.
- `transcriptionFailureCount` is declared per handler (per connection) and keyed by stage; it does not leak between calls.
- No global mutable state was identified that could contaminate sequential calls.

---

## 11. Persistence Chain

1. Twilio media → OpenAI Realtime `input_audio_buffer.append`.
2. `conversation.item.input_audio_transcription.completed` → transcript.
3. `storeStageCapture` → `stageCaptures[]` and `intakeData`.
4. `persistPartialIntake` → `leads` + `conversations` + `ai_call_records` after every capture.
5. `processSimpleModeCompletion` → canonical `extracted_info`, final lead update, `ai_call_records` with `outcome: 'completed'`, conversation messages, notification `ai_intake_completed`.
6. Customer summary SMS is **owned by the Next.js `voice-status` webhook**, not the AI voice service.

No missing handoff was found, but the end-of-call OpenAI extraction (`buildCanonicalExtractedInfo`) does not apply display normalizers, so `extracted_info` may contain raw refusal strings. The fix above prevents those from being accepted in the first place.

---

## 12. Proven Defects Fixed

| Defect | Evidence | Fix |
|--------|----------|-----|
| Refusal/unknown answers stored as real service request | `validateStageAnswer('ask_request', "I'd rather not say")` would accept | `validateStageAnswer` now calls `isValidServiceRequest` |
| Refusal/unknown answers stored as real timing | `validateStageAnswer('ask_completion_time', "I don't know")` would accept | `validateStageAnswer` now calls `isValidCompletionTime` |
| Refusal/unknown answers stored as real callback | `validateStageAnswer('ask_callback_time', "I'd rather not")` would accept | `validateStageAnswer` now calls `isValidCallbackTime` |
| Refusal/unknown answers stored as real address | `validateStageAnswer('ask_location', "I don't know")` would accept | `validateStageAnswer` now calls `isValidServiceAddress` |

Files changed:
- `services/replyflow-ai-voice/src/index.ts`
- `services/replyflow-ai-voice/src/intake-validation.ts`
- `services/replyflow-ai-voice/test/refusal-validation.test.ts`

Commit: `08655b2a harden AI intake before launch`

---

## 13. Areas Requiring Physical Verification

- Live caller corrections (latest-explicit-correction-wins is not implemented).
- Regex accuracy of `extractFieldsFromTranscript` for early location/callback extraction.
- Dead-air invariant under real network/VAD stalls.
- Final hangup timing (`terminalClosingResponseStarted`, post-mark hangup).
- Back-to-back calls from the same number.
- Non-English or accented caller names and the `sanitizeEnglishIntakeField` "Not Provided" behavior.
- `isConfidentEarlyServiceAddress` false positives (e.g. "look at my sink").

---

## 14. Tests

- `npm test` in `services/replyflow-ai-voice`: 16/17 passed. The single failure is a pre-existing audio checksum mismatch for `ask_name` (`Expected: e0e45f... Actual: 96fa4d...`), unrelated to logic.
- `npx mocha test/refusal-validation.test.ts --require ts-node/register`: 8/8 passed.

---

## 15. Build

- `npm run build` (root Next.js app): **success**.
- `npm run typecheck` in `services/replyflow-ai-voice`: **success**.

---

## 16. TypeScript

- `npx tsc --noEmit` (root): failed with pre-existing errors only — all in `__tests__` files or unrelated test-only code (`TS2367`, missing `@jest/globals`, `DeletionContext`, `fail`, `NODE_ENV` read-only, terminal test mocks, etc.). No new production-code TypeScript errors were introduced.

---

## 17. `git diff --check`

Passed. Only a standard LF/CRLF warning for `intake-validation.ts` was emitted.

---

## 18. Files Changed

- `services/replyflow-ai-voice/src/index.ts`
- `services/replyflow-ai-voice/src/intake-validation.ts`
- `services/replyflow-ai-voice/test/refusal-validation.test.ts`

---

## 19. Commit SHA

`08655b2a harden AI intake before launch`

---

## 20. 25-Call Physical Campaign

For every call, record `callSid`, then inspect `ai_call_records`, `leads`, `conversations`, SMS (Next.js webhook), and in-app notification.

### Call 1 — Normal happy path (onsite)
**Persona:** Amanda  
**Script:** “Hi, I'm Amanda. I need a plumber. My address is 123 Main Street. Can you come tomorrow morning around 9? You can call me back anytime after 10.”  
**Expected stages:** ask_name_reason → ask_location → ask_completion_time → ask_callback_time → complete  
**Expected fields:**
- `customerName`: Amanda
- `serviceRequested`: plumber
- `serviceAddress`: 123 Main Street
- `desiredCompletionTime`: tomorrow morning around 9
- `callbackTime`: anytime after 10  
**PASS:** all fields captured, SMS contains all, outcome `completed`.

### Call 2 — Terse caller
**Persona:** Ben  
**Script:** “Ben. Leaky sink. 456 Oak Street. Tomorrow. Morning.”  
**Expected stages:** ask_name_reason (captures name + request) → ask_location → ask_completion_time → ask_callback_time → complete  
**Expected fields:** Ben / leaky sink / 456 Oak Street / tomorrow / morning  
**PASS:** terse but accurate capture, no hang-up.

### Call 3 — Rambling caller
**Persona:** Robert Johnson  
**Script:** “Hi, I'm Robert Johnson. I've got a leak in my bathroom sink that's been dripping for about three days now. It's actually getting worse and there's water pooling under the cabinet. I'm at 789 Pine Avenue, Apartment 4B. I'm hoping you can send someone over this Friday if possible, maybe in the morning would be best. I work from home so I'm available most of the day but mornings are preferred.”  
**Expected fields:** Robert Johnson / leak in bathroom sink / 789 Pine Avenue, Apartment 4B / Friday morning / most of the day, mornings preferred  
**PASS:** all fields present and summary faithful, no truncation.

### Call 4 — All information early
**Persona:** Claire  
**Script:** “My name is Claire, I need my gutters cleaned at 321 Elm Street, sometime next week, and you can call me back in the afternoon.”  
**Expected stages:** ask_name_reason → ask_completion_time (location and callback captured early) → ask_callback_time → complete  
**Expected fields:** Claire / gutters cleaned / 321 Elm Street / sometime next week / afternoon  
**PASS:** no repeated questions; skipped satisfied stages.

### Call 5 — Address correction
**Persona:** David  
**Script:** “David. I need a fence repair. 111 First Street. … Actually sorry, 100 First Street. … Tomorrow afternoon is fine. Call me in the evening.”  
**Expected `serviceAddress`:** 100 First Street  
**PASS/FAIL:** correction must replace address; if old address persists, classify **FIX BEFORE SUBMIT**. If correction ignored, log as known limitation.

### Call 6 — Timing correction
**Persona:** Henry  
**Script:** “Henry. Electrical work. Friday afternoon. … Actually Saturday would be better. … Call me in the morning.”  
**Expected `desiredCompletionTime`:** Saturday  
**PASS/FAIL:** if `Friday` remains, **FIX BEFORE SUBMIT** (corrections not implemented).

### Call 7 — Name correction
**Persona:** John → Jon  
**Script:** “My name is John. … Actually it's Jon without the h.”  
**Expected `customerName`:** Jon  
**PASS/FAIL:** if John persists, **FIX BEFORE SUBMIT**.

### Call 8 — Refusal to give name
**Persona:** Pat  
**Script:** “I'd rather not give my name. I need a plumber at 55 Maple Street tomorrow.”  
**Expected:** name not stored as real data; `customerName` null/empty; flow stays on or returns to name stage; partial finalization when call ends.  
**PASS/FAIL:** if "I'd rather not" becomes `customerName`, **BLOCKER**.

### Call 9 — Unknown timing
**Persona:** Nancy  
**Script:** “Nancy. Plumber. I don't know when it needs to be done. Call me back whenever.”  
**Expected:** `desiredCompletionTime` null/empty (not “I don't know”); `callbackTime`: whenever  
**PASS/FAIL:** if “I don't know” stored as timing value, **BLOCKER**.

### Call 10 — “Anytime” callback
**Persona:** David  
**Script:** “David. Carpenter. Tomorrow morning. You can call me back whenever.”  
**Expected `callbackTime`:** whenever (or anytime)  
**PASS:** no fabricated specific time; summary reflects flexibility.

### Call 11 — One silence
**Persona:** John  
**Script:** “Hi, I'm John.” [8 seconds silence]  
**Expected:** reprompt for name (current stage), then continue.  
**PASS:** no stage regression; transcript shows same-stage reprompt.

### Call 12 — Two silences
**Persona:** Sarah  
**Script:** “Hi, I'm Sarah.” [8s silence] [8s silence]  
**Expected:** one reprompt, then graceful `complete` with `customerName` only, outcome `incomplete`.  
**PASS:** no deadlock; SMS sent with partial summary.

### Call 13 — Valid response followed by dead air
**Persona:** Mike  
**Script:** “Mike. Roof repair. 99 Cedar Lane. Tomorrow.” [hang up]  
**Expected:** partial finalization with all captured fields before hangup, outcome `incomplete`, no empty record.  
**PASS:** all fields persisted.

### Call 14 — Interruption / barge-in
**Persona:** Mike  
**Script:** “Hi, I'm Mike. I need a fence—” [interrupt AI] “—replaced. Next week. 456 Oak Street. Call me back in the afternoon.”  
**Expected:** all fields captured despite interruption.  
**PASS:** no stage regression, no duplicate capture.

### Call 15 — Wrong-question answer
**Persona:** Lisa  
**Script:** (asked for name) “It's at 77 Birch Street. I need appliance repair.”  
**Expected:** address captured from name stage? Address and request both captured; next stage jumps to timing.  
**PASS/FAIL:** if address ends up in `serviceRequested` and is never corrected, **FIX BEFORE SUBMIT**.

### Call 16 — Uncommon name
**Persona:** Siobhan O'Connor  
**Script:** “My name is Siobhan O'Connor. I need a window repaired.”  
**Expected `customerName`:** Siobhan O'Connor (or closest valid)  
**PASS/FAIL:** if truncated to first word or rejected, **FIX BEFORE SUBMIT**.

### Call 17 — Spoken apartment/unit/address numbers
**Persona:** Emily  
**Script:** “Emily. Appliance repair. 555 Maple Street, Apartment 12B.”  
**Expected `serviceAddress`:** 555 Maple Street, Apartment 12B  
**PASS/FAIL:** if unit truncated, **FIX BEFORE SUBMIT**.

### Call 18 — Partial hangup after name
**Persona:** Lisa  
**Script:** “Hi, I'm Lisa.” [hang up]  
**Expected:** `customerName`: Lisa; other fields null; outcome `incomplete`; SMS with name only.  
**PASS:** no data loss, no duplicate finalization.

### Call 19 — Very fast caller
**Persona:** James  
**Script:** “HiI'mJamesIneedpaintingtomorrow123OakStcallmemorning.”  
**Expected:** James / painting / tomorrow / 123 Oak St / morning  
**PASS/FAIL:** if transcription mangles and fields missing, **FIX BEFORE SUBMIT**.

### Call 20 — Very slow caller
**Persona:** Margaret  
**Script:** “My … name … is … Margaret. I … need … plumbing … help. 222 … Pine … Street. Tomorrow.”  
**Expected:** Margaret / plumbing help / 222 Pine Street / tomorrow  
**PASS:** no premature timeout; multi-segment answers merged.

### Call 21 — Filler / meta-comments
**Persona:** Tom  
**Script:** “Uh, yeah, so my name is Tom. I, um, need a locksmith. The address is, like, 88 First Ave. Anytime is fine. Just call me in the morning.”  
**Expected:** Tom / locksmith / 88 First Ave / anytime / morning  
**PASS:** filler stripped; real values captured.

### Call 22 — Back-to-back calls
**Persona A:** Kevin — “Kevin. Roof inspection.” [hang up]  
**Persona B (same phone):** Kevin — “Can you make it next Tuesday?”  
**Expected:** two separate `ai_call_records`; second call starts fresh, no auto-fill from first.  
**PASS/FAIL:** if data mixed, **BLOCKER**.

### Call 23 — Job/request changed later
**Persona:** Alex  
**Script:** “Alex. I need my lawn mowed. … Actually, on second thought, I need hedge trimming.”  
**Expected `serviceRequested`:** hedge trimming  
**PASS/FAIL:** if `lawn mowed` persists, **FIX BEFORE SUBMIT** (known correction limitation).

### Call 24 — Vague request
**Persona:** Greg  
**Script:** “Greg. I just need some help.”  
**Expected:** `serviceRequested` accepted but possibly reprompted for details; flow stays on request until sufficient detail.  
**PASS:** no infinite loop; final request meaningful.

### Call 25 — Multiple future fields answered early
**Persona:** Sarah  
**Script:** “I'm Sarah, I need my lawn mowed at 123 Main St, sometime next week, and call me in the morning.”  
**Expected:** all five fields captured on first turn; stages skipped.  
**PASS:** all fields captured; no repeated questions.

---

## 21. Severity Classification Reminder

- **BLOCKER:** lost call/data, wrong customer, wrong core request, deadlock, repeated wrong stages, material hallucination, cross-call contamination.
- **FIX BEFORE SUBMIT:** correction not applied, redundant questioning despite clearly captured field, refusal stored as real data, important field formatting corruption.
- **POST-LAUNCH:** minor filler remains, wording smoothness, summary style preference, non-material punctuation.

---

## 22. Final Recommendation

`READY FOR PHYSICAL AI CAMPAIGN`

The only proven source defect (refusal/unknown answers being stored as real structured values) has been patched with deterministic validators and a focused regression test. The state machine, stale-callback guards, session isolation, silence handling, partial hangup persistence, and persistence chain are implemented and code-audited. The remaining uncertainties (live corrections, regex accuracy, dead-air edge cases, final hangup timing, back-to-back calls) must be validated with the 25-call matrix above before claiming launch readiness.
