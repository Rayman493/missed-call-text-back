# Legacy vs Current Audio Implementation Comparison

**Audit Date:** 2026-07-11  
**Objective:** Compare legacy "good-sounding" audio implementation with current production to identify proven improvements

---

## Part 1 — Legacy Audio Implementation History

### Key Commits Identified

**Commit 2469a081** - "Eliminate PCM conversion - implement direct G711_ulaw audio forwarding"
- Date: 2026-05-27
- Attempted to use direct g711_ulaw from OpenAI
- Removed all PCM16 → μ-law conversion
- Configured OpenAI for audio/g711_ulaw at 8000Hz input/output
- **Status:** Later reverted

**Commit 8ee65bc4** - "Restore stable audio output: PCM 24000 with PCM16 to μ-law conversion"
- Date: 2026-05-27
- Reverted direct g711_ulaw approach
- Restored PCM16 at 24000Hz → μ-law conversion
- **Status:** Current baseline

**Commit 48642383** - "Implement PCM16 to 8kHz μ-law conversion before sending to Twilio"
- Date: 2026-05-26
- Original implementation of PCM16 → μ-law conversion
- Simple decimation (take every 3rd sample)
- **Status:** Replaced by cached audio system

**Commit dfee6a2d** - "Implement deterministic OpenAI voice prompts with cached audio"
- Date: 2026-05-29
- Introduced cached prompt audio system
- Added LPF (3400Hz) and cubic resampling
- **Status:** Current production

---

## Part 2 — Side-by-Side Comparison

### Live Audio Path (OpenAI Realtime Responses)

| Component | Legacy (2469a081) | Current (8ee65bc4) | Difference | Impact |
|-----------|-------------------|-------------------|------------|--------|
| OpenAI model | gpt-4o-realtime-preview | gpt-4o-realtime-preview | Same | None |
| Voice | alloy | alloy | Same | None |
| Audio format requested | audio/g711_ulaw | audio/pcm | Different | Legacy uses direct PCMU from OpenAI |
| Sample rate | 8000 Hz | 24000 Hz | Different | Legacy gets 8kHz directly from OpenAI |
| Filtering | None (OpenAI handles) | None | Same | Neither has custom filter |
| Resampling | None (OpenAI handles) | Simple decimation (every 3rd sample) | Different | Current uses naive decimation |
| PCMU encoding | None (already PCMU) | PCM16 → μ-law conversion | Different | Current adds conversion step |
| Chunk size | Unknown | Variable (OpenAI delta) | Different | Legacy may have different chunking |
| Chunk pacing | Direct passthrough | Direct passthrough | Same | Both use real-time forwarding |
| Playback timing | Real-time | Real-time | Same | Both are real-time |
| Final prompt handling | N/A (live only) | N/A (live only) | Same | N/A |
| Hangup timing | N/A (live only) | N/A (live only) | Same | N/A |

**Key Finding:** The legacy approach attempted to get g711_ulaw directly from OpenAI at 8000Hz, avoiding any conversion. This was reverted, suggesting the direct approach had issues (possibly format support or quality).

### Cached Prompt Path (Scripted Intake)

| Component | Legacy (pre-dfee6a2d) | Current (dfee6a2d) | Difference | Impact |
|-----------|----------------------|-------------------|------------|--------|
| OpenAI model | tts-1 | tts-1 | Same | None |
| Voice | alloy | alloy | Same | None |
| Audio format requested | audio/pcm | audio/pcm | Same | None |
| Sample rate | 24000 Hz | 24000 Hz | Same | None |
| Filtering | None | RC filter at 3400Hz | Different | Current adds LPF |
| Resampling | Simple decimation | Cubic interpolation | Different | Current uses cubic instead of decimation |
| PCMU encoding | PCM16 → μ-law | PCM16 → μ-law | Same | Both use conversion |
| Chunk size | 160 bytes | 160 bytes | Same | Both use 20ms chunks |
| Chunk pacing | 20ms setTimeout | 20ms setTimeout | Same | Both use same pacing |
| Playback timing | Real-time | Real-time | Same | Both are real-time |
| Final prompt handling | Same as others | Same as others | Same | No special handling |
| Hangup timing | response.audio.done | response.audio.done | Same | Both use same lifecycle |

**Key Finding:** The current cached prompt system added a low-pass filter and cubic resampling that were not present in the original implementation. This may be the source of the sibilance distortion.

---

## Part 3 — Audio Quality Impact Analysis

### Legacy Direct g711_ulaw Approach (Commit 2469a081)

**Advantages:**
- No conversion artifacts (OpenAI handles encoding)
- No resampling artifacts (OpenAI handles downsampling)
- Potentially better quality if OpenAI's internal DSP is superior

**Disadvantages:**
- Reverted after implementation (suggests it didn't work well)
- May have had format compatibility issues
- Less control over audio pipeline
- OpenAI's g711_ulaw support may be experimental

**Why It Was Reverted:**
The commit 8ee65bc4 explicitly states "Restore stable audio output" suggesting the direct g711_ulaw approach was unstable or had quality issues.

### Current Cached Prompt System (Commit dfee6a2d)

**Advantages:**
- Deterministic audio (same every time)
- Can be optimized and regenerated
- No dependency on OpenAI real-time generation
- Consistent across all prompts

**Disadvantages:**
- Custom DSP pipeline (LPF + cubic resampling) may introduce artifacts
- First-order RC filter is insufficient for anti-aliasing
- Cubic interpolation not ideal for audio
- No version tracking for cached assets

**Quality Issues:**
- Sibilance distortion (likely from insufficient anti-aliasing)
- Final prompt degradation (likely from low RMS + no trailing silence)

---

## Part 4 — Final Prompt Lifecycle Audit

### Current Implementation

```typescript
// Chunk sending loop
for (let i = 0; i < audioBuffer.length; i += chunkSize) {
  const rawChunk = audioBuffer.slice(i, i + chunkSize);
  const base64Chunk = rawChunk.toString('base64');
  const mediaMessage = {
    event: 'media',
    streamSid: state.streamSid,
    media: { payload: base64Chunk }
  };
  ws.send(JSON.stringify(mediaMessage));
  totalChunks++;
  await new Promise(resolve => setTimeout(resolve, 20));
}

// After loop
state.assistantSpeaking = false;
state.ttsCompleteTime = state.promptAudioSentAt;
```

### Issues Identified

1. **No Twilio mark acknowledgment** - Chunks sent without waiting for Twilio mark events
2. **No trailing silence** - Final prompt ends immediately after last chunk
3. **Hangup timing** - Hangup occurs via response.audio.done, but no explicit wait for playback completion
4. **Final chunk handling** - If final chunk < 160 bytes, still sent with 20ms delay (may cause gap)

### Final Prompt Specifics

- Final prompt: 66,200 bytes = 414 chunks
- Expected duration: 8.275s
- Actual duration: 8.28s (with 20ms pacing)
- **No special handling** - treated identically to other prompts

**Hypothesis:** The final prompt's low RMS (0.1736) combined with no trailing silence and immediate hangup may cause the final words to be cut off or sound static as Twilio buffers empty.

---

## Part 5 — DSP Evaluation Against Legacy

### Legacy Approach (Direct g711_ulaw)

**Filtering:** None (OpenAI handles)  
**Resampling:** None (OpenAI handles)  
**Encoding:** None (already PCMU)

**Quality:** Unknown (reverted before production testing)

### Current Approach (Cached Prompts)

**Filtering:** First-order RC at 3400Hz  
**Resampling:** Cubic interpolation  
**Encoding:** PCM16 → μ-law

**Quality Issues:**
- First-order filter insufficient for 3x downsampling
- Cubic interpolation not ideal for audio
- Both contribute to sibilance distortion

### Comparison

The legacy approach relied on OpenAI's internal DSP, which may be higher quality than the custom implementation. However, since it was reverted, it's unclear if it actually sounded better or had other issues.

The current custom DSP pipeline has known issues:
- Insufficient anti-aliasing
- Suboptimal resampling
- No proven quality advantage

---

## Part 6 — Decision Matrix

### Option A: Leave DSP Unchanged, Fix Final Prompt Lifecycle Only

**Expected Improvement:** Moderate (fixes final prompt degradation only)  
**Implementation Risk:** Low  
**Maintenance Burden:** None  
**Compatibility:** Perfect

**Pros:**
- Minimal change
- Addresses specific final prompt issue
- No risk of breaking other prompts

**Cons:**
- Does not address sibilance distortion
- DSP issues remain

### Option B: Replace Anti-Alias Filter Only

**Expected Improvement:** High (reduces sibilance distortion)  
**Implementation Risk:** Medium  
**Maintenance Burden:** Low  
**Compatibility:** Good

**Pros:**
- Addresses root cause of sibilance
- Narrow change
- Proven DSP technique

**Cons:**
- Requires regenerating all cached prompts
- May not fully resolve if resampler also contributes

### Option C: Replace Resampler Only

**Expected Improvement:** Medium-High (reduces artifacts)  
**Implementation Risk:** Medium-High  
**Maintenance Burden:** Medium  
**Compatibility:** Good

**Pros:**
- Addresses resampling artifacts
- More professional audio pipeline

**Cons:**
- Requires external dependency (FFmpeg/SoX)
- More complex implementation
- Requires regenerating cached prompts

### Option D: Replace Entire Custom Pipeline

**Expected Improvement:** Highest (addresses all DSP issues)  
**Implementation Risk:** High  
**Maintenance Burden:** High  
**Compatibility:** Medium

**Pros:**
- Comprehensive fix
- Professional-grade audio
- Future-proof

**Cons:**
- Largest change
- Highest risk
- Requires external dependency
- Requires regenerating cached prompts

---

## Part 7 — Recommendation

### Recommended Option: **Option B (Replace Anti-Alias Filter Only)**

**Rationale:**
1. **Highest impact for lowest risk** - The forensic audit identified insufficient anti-aliasing as the primary cause of sibilance distortion
2. **Narrow change** - Only replaces the filter, not the entire pipeline
3. **Proven technique** - Proper anti-aliasing is well-understood DSP
4. **Preserves current architecture** - No dependency on external libraries
5. **Testable incrementally** - Can compare before/after with same cached prompts

### Secondary Recommendation: **Option A (Fix Final Prompt Lifecycle First)**

**Rationale:**
1. **Lowest risk** - Minimal code change
2. **Addresses specific user complaint** - Final prompt degradation is a distinct issue
3. **Quick win** - Can be implemented and tested immediately
4. **Independent of DSP** - Does not conflict with future DSP improvements

### Implementation Order

1. **Phase 1:** Fix final prompt lifecycle (Option A)
   - Add trailing silence (250-500ms)
   - Wait for playback completion before hangup
   - Test with real phone call

2. **Phase 2:** Replace anti-alias filter (Option B)
   - Implement proper FIR filter (Butterworth or similar)
   - Regenerate all cached prompts
   - Test with real phone call

3. **Phase 3:** Evaluate if further DSP changes needed
   - If sibilance persists, consider Option C (replace resampler)
   - If quality still insufficient, consider Option D (full pipeline replacement)

---

## Part 8 — Cached Asset Regeneration Requirements

If Option B is implemented:

**Required Actions:**
1. Update `scripts/generate-cached-audio.ts` with new filter
2. Add version tracking to cached assets
3. Regenerate all 6 cached prompts
4. Update `src/cached-audio.ts` with new assets
5. Deploy to Fly.io
6. Verify with real phone call

**Version Tracking:**
Add manifest to `src/cached-audio.ts`:
```typescript
export const cachedAudioVersion = 'v2-butterworth-filter';
export const cachedAudioGeneratedAt = '2026-07-11T00:00:00Z';
```

---

## Part 9 — Files to Change

### Option A (Final Prompt Lifecycle)

**Files:**
- `services/replyflow-ai-voice/src/index.ts` - Add trailing silence, wait for playback completion

### Option B (Anti-Alias Filter)

**Files:**
- `services/replyflow-ai-voice/scripts/generate-cached-audio.ts` - Replace LPF implementation
- `services/replyflow-ai-voice/src/index.ts` - Update LPF function (if used for live audio)
- `services/replyflow-ai-voice/src/cached-audio.ts` - Regenerate with new assets

---

## Conclusion

The legacy audio implementation attempted to use direct g711_ulaw from OpenAI but was reverted, likely due to stability or compatibility issues. The current custom DSP pipeline has known deficiencies in anti-aliasing and resampling.

**Recommended approach:**
1. Fix final prompt lifecycle first (lowest risk, addresses specific complaint)
2. Replace anti-alias filter second (addresses root cause of sibilance)
3. Evaluate further changes based on results

This incremental approach minimizes risk while addressing both reported issues (sibilance and final prompt degradation).
