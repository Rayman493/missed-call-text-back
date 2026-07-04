# AI Voice V1 Stabilization Audit

## Scope

This audit covers `services/replyflow-ai-voice` after Simple Mode became the supported V1 path.

Cached audio is intentionally left unchanged. Runtime prompts are correct; embedded cached audio remains stale until a local `OPENAI_API_KEY` is available for regeneration.

## Safe to Remove Later

These items appear clearly obsolete or duplicate, but should still be removed in small isolated commits.

- **Legacy speech path prompt mirrors**
  - `APPROVED_PROMPTS` and `STAGE_PROMPTS` in `src/index.ts` are not the Simple Mode runtime source after Simple Mode was changed to resolve prompts from `getIntakeStageTextSafe(...)`.
  - They may still support the non-Simple Mode path, so remove only after verifying that path is not used in production.

- **Old connection/debug trace banners**
  - Startup banners such as audio trace and opening-order trace markers were investigation-only.
  - A first cleanup removed the clearly temporary startup trace banners while keeping startup/version/deployment logs.

- **High-volume media trace logs**
  - Per-chunk Twilio send logs and full OpenAI raw event dumps are useful only during deep debugging.
  - A first cleanup gated them behind `DEBUG_AI_VOICE`.

- **Cached-audio generation duplication**
  - `scripts/generate-cached-audio.ts` contains a separate prompt map that must stay synchronized with `src/intake-templates.ts`.
  - After cached audio is regenerated, consider making the generator import the same prompt template source instead of duplicating strings.

## Potentially Used

These items should remain until production usage is verified.

- **Non-Simple Mode Realtime flow**
  - `OpenAIRealtimeClient`, `sendApprovedPrompt`, and related centralized speech-control code may be legacy relative to Simple Mode, but may still be used by non-simple endpoints or fallback paths.
  - Do not remove without confirming all production traffic uses Simple Mode.

- **Fallback and test fallback modules**
  - `test-fallbacks` and fallback warning hooks should remain until environment usage is validated.
  - They are low-risk but can hide assumptions about local/test behavior.

- **Dual prompt systems**
  - Simple Mode now uses `getIntakeStageTextSafe(...)`.
  - Legacy path still references `APPROVED_PROMPTS` / `STAGE_PROMPTS`.
  - This is maintainability risk, but removal requires traffic-path validation.

- **Duplicate normalization helpers**
  - Simple Mode contains local normalization/cleanup helpers for names, addresses, callback time, and summaries.
  - Similar canonical mapping exists in the dashboard app.
  - Consolidation may be useful later, but changing it now risks extraction/persistence behavior.

## Safety Critical

These should remain unless a reproducible bug requires a focused change.

- **Cached PCMU prompt playback path**
  - `cachedPromptAudio[stage]` is currently the production speech path for Simple Mode prompts.
  - It should stay unchanged until the cached audio is regenerated with the existing script and verified by real calls.

- **Prompt gating and answer gating**
  - `assistantSpeaking`, queued transcript handling, and session readiness gates protect stage progression from caller audio arriving while prompts are playing.
  - Do not simplify without reproducing the callback double-answer issue.

- **Final goodbye mark/fallback close**
  - Mark-based final close plus fallback timeout protects complete goodbye playback and call cleanup.
  - Keep as-is.

- **Persistence writes**
  - Lead, conversation, and AI call record persistence are production-critical.
  - Logging can be reduced later, but write order and payload shape should not change without a reproducible persistence bug.

- **OpenAI/Twilio audio settings**
  - PCMU formatting, output headroom, Realtime model, VAD, and voice settings should remain untouched.

## Reliability Review Findings

- **Prompt source is now correct but cached audio is stale**
  - Runtime prompt text is selected from `intake-templates.ts` through `getIntakeStageTextSafe(...)`.
  - Spoken audio still comes from embedded `cached-audio.ts` when present.
  - Regeneration remains blocked until `OPENAI_API_KEY` is available locally.

- **Callback double-answer issue is not yet reproducible**
  - Do not change answer gating or stage progression unless repeated calls reproduce the issue.
  - If reproduced, inspect `assistantSpeaking`, `queuedTranscript`, `ttsCompleteTime`, and `transcription_decision` logs for `ask_callback_time`.

- **Logging had become too noisy**
  - Full OpenAI raw event dumps, per-chunk Twilio audio logs, health-check request logs, and temporary startup trace banners were the highest-noise items.
  - The first cleanup keeps lifecycle/error logs and gates deep traces behind `DEBUG_AI_VOICE`.

- **Simple Mode has duplicated stage arrays**
  - Stage order appears in multiple local arrays/maps.
  - This is a maintainability risk, but should be consolidated only after V1 reliability validation because it touches stage progression.

- **Generator and runtime prompt strings can drift**
  - Cached audio generation source duplicates prompt text.
  - Future safe improvement: make the generator consume the same template source used at runtime.

## Recommended Next Steps

- **After key is available**
  - Regenerate `src/cached-audio.ts` with the existing generator.
  - Build, typecheck, commit, deploy, and validate one full call.

- **After multiple clean production calls**
  - Remove or consolidate legacy non-Simple Mode prompt maps if production traffic confirms they are unused.
  - Consider centralizing stage mapping to reduce duplication.

- **Only if callback issue reproduces**
  - Investigate queued transcript handling and prompt completion timing for `ask_callback_time`.
