# Cached Audio Regeneration Procedure

## Overview

The AI voice service uses pre-generated cached audio for Simple Mode prompts to ensure consistent, high-quality audio playback without real-time synthesis latency. This document describes how to regenerate cached audio when prompt text changes.

## When to Regenerate

Regenerate cached audio when:
- Prompt text is modified in `scripts/generate-realtime-cached-audio.ts`
- Voice model or voice selection changes
- Output format requirements change
- Audio quality issues are reported
- Validation script reports stale prompts or hash mismatches

## Prerequisites

- Node.js >= 20.0.0
- OpenAI API key with access to Realtime API (gpt-realtime-2.1)
- Voice service dependencies installed (`npm install`)

## Regeneration Steps

### 1. Set Environment Variable

Set the OPENAI_API_KEY environment variable:

```bash
# Linux/Mac
export OPENAI_API_KEY=your_key_here

# Windows PowerShell
$env:OPENAI_API_KEY="your_key_here"

# Windows Command Prompt
set OPENAI_API_KEY=your_key_here
```

**Important:** Never commit the API key to version control. Use environment variables or secrets management.

### 2. Navigate to Voice Service Directory

```bash
cd services/replyflow-ai-voice
```

### 3. Run Generation Script

```bash
npm run generate:cached-audio
```

Or directly:

```bash
npx ts-node scripts/generate-realtime-cached-audio.ts
```

### 4. Verify Output

The script will:
- Generate audio for all canonical prompts
- Validate audio duration (1-30 seconds)
- Calculate SHA-256 checksums
- Update `src/cached-audio.ts` with new base64-encoded audio
- Create diagnostic WAV files in `scripts/realtime-diagnostics/`
- Print generation summary

Expected output:
```
========================================
OpenAI Realtime Cached Audio Generation
========================================
Model: gpt-realtime-2.1
Voice: marin
Output Format: audio/pcmu
Generation Version: realtime-pcmu-marin-canonical
========================================

--- Generating ask_name_reason ---
Prompt: "Hi, I'm the assistant for the business. I just have a few quick questions so I can pass everything along. First, can you please let me know your name and your reason for calling?"

✓ Generated ask_name_reason: 79200 bytes
  Duration: 9.9s
  Checksum: 807262f222a4c509...
  Transcript: "Hi, I'm the assistant for the business..."
  Diagnostic WAV: scripts/realtime-diagnostics/ask_name_reason-marin.wav

[... other prompts ...]

✓ Wrote to src/cached-audio.ts
✓ Added version tracking, checksums, and metadata
```

### 5. Validate Generated Audio

Run validation script to ensure cache is valid:

```bash
npm run validate:audio-cache
```

Expected output:
```
========================================
Cached Audio Validation
========================================

Generation Version: realtime-pcmu-marin-canonical
Generated At: [current timestamp]

Model: gpt-realtime-2.1
Voice: marin
Output Format: audio/pcmu

========================================

[... validation passes ...]

✅ Cache is VALID
========================================
```

### 6. Review Diagnostic WAV Files

Listen to diagnostic WAV files in `scripts/realtime-diagnostics/` to verify audio quality:
- Natural pacing
- Clear pronunciation
- No unwanted pauses or artifacts
- Matches intended tone (professional receptionist)

### 7. Commit Changes

Commit the updated `src/cached-audio.ts` file:

```bash
git add src/cached-audio.ts
git commit -m "Regenerate cached audio with updated prompt text

- Updated canonical prompts to use neutral transitions
- Removed stale praise words (Great, Perfect, etc.)
- Regenerated all cached audio assets with OpenAI Realtime API
- Updated generation timestamp and checksums
- Model: gpt-realtime-2.1, Voice: marin, Format: audio/pcmu"
```

### 8. Deploy to Fly.io

Deploy the updated voice service:

```bash
fly deploy
```

Monitor deployment logs for any errors related to missing assets or manifest errors.

## Canonical Prompt Source

The canonical prompt definitions are in `scripts/generate-realtime-cached-audio.ts` (lines 34-41). These are the exact keys used by the runtime state machine.

Current canonical prompts:
- `ask_name_reason`: Initial greeting and name/reason request
- `ask_details`: Request for important details
- `ask_location`: Request for location
- `ask_completion_time`: Request for completion time
- `ask_callback_time`: Request for callback time
- `complete`: Closing message

**Important:** Never modify prompts in `src/cached-audio.ts` directly. Always update the generation script and regenerate.

## Validation Script

The validation script (`scripts/validate-cached-audio.ts`) checks for:
- Missing assets
- Stale words in canonical prompts (Great, Perfect, Thanks, Excellent, Sounds good, Got it)
- Hash mismatches between stored and calculated checksums
- Metadata consistency (byte length, duration)
- Orphaned cached assets
- Cache age (warns if older than 7 days)

Run validation:
```bash
npm run validate:audio-cache
```

The script exits with non-zero status if cache is invalid.

## Runtime Fallback Behavior

If cached audio is missing or invalid:
- The service falls back to live synthesis using OpenAI Realtime API
- This may increase latency but ensures calls continue
- Errors are logged without sensitive caller information
- Calls do not crash or result in silence

## Cached Prompt Interruption

Cached prompts remain interruptible:
- Caller speech detection stops cached playback immediately
- No stale audio continues after interruption
- Same question is not played twice
- Prompt interruption is supported by the audio streaming system

## Stale Word Detection

The validation script detects and reports these stale words:
- Great
- Perfect
- Thanks
- Excellent
- Sounds good
- Got it
- Awesome
- Fantastic

Use neutral transitions instead:
- "Okay"
- "All right"
- "Thank you for calling"
- "Have a good day"

## Troubleshooting

### OPENAI_API_KEY not found

Ensure the environment variable is set before running the generation script. Check that you're using the correct shell and the variable is exported.

### WebSocket connection errors

Verify:
- API key is valid and has Realtime API access
- Network connectivity to api.openai.com
- Model name (gpt-realtime-2.1) is available in your account

### Audio duration issues

If duration is outside 1-30 seconds:
- Check prompt length (longer prompts = longer audio)
- Verify system instruction is not being added to output
- Review OpenAI Realtime API response

### Checksum mismatches

If validation reports checksum mismatches:
- Ensure `src/cached-audio.ts` was not manually edited
- Regenerate audio using the generation script
- Check file encoding (should be UTF-8)

## Current Status

- **Canonical Prompts**: Updated to use neutral transitions (no stale words)
- **Cached Audio**: Generated on 2026-07-11T22:56:04.280Z (may be stale)
- **OPENAI_API_KEY**: Not available in environment (manual step required)
- **Validation**: Passes canonical prompt check, but audio may be out of sync

## Next Steps

1. Set OPENAI_API_KEY environment variable
2. Run `npm run generate:cached-audio`
3. Run `npm run validate:audio-cache` to verify
4. Review diagnostic WAV files
5. Commit and deploy changes
