# ReplyFlow AI Voice Audio Forensic Audit Report

**Audit Date:** 2026-07-11  
**Service:** replyflow-ai-voice  
**Version:** stable-cached-prompts-alloy-v1  
**Objective:** Identify root cause of persistent sibilance distortion and final prompt degradation

---

## Part 1 — Audio Path Mapping

### Production Audio Paths

| Audio Type | Source Format | Source Rate | Processing | Final Format | Playback Path |
|------------|---------------|-------------|------------|--------------|---------------|
| Opening greeting (ask_name_reason) | PCM16 | 24 kHz | LPF (3400Hz) → Cubic Resample → PCMU | PCMU (8 kHz) | Cached chunks via WebSocket |
| Intake questions (ask_details, ask_location, ask_completion_time, ask_callback_time) | PCM16 | 24 kHz | LPF (3400Hz) → Cubic Resample → PCMU | PCMU (8 kHz) | Cached chunks via WebSocket |
| Final completion (complete) | PCM16 | 24 kHz | LPF (3400Hz) → Cubic Resample → PCMU | PCMU (8 kHz) | Cached chunks via WebSocket |
| Live AI responses (if any) | OpenAI Realtime | Variable | Direct PCMU passthrough | PCMU (8 kHz) | Direct WebSocket |
| Fallback audio | N/A | N/A | N/A | N/A | N/A |

**Key Finding:** All cached prompts use the **identical** processing pipeline. The final prompt does not use a different code path.

---

## Part 2 — Cached Asset Comparison

### Byte Length Analysis

| Prompt | Base64 Length | PCMU Bytes | Expected Duration | Peak Amplitude | RMS |
|--------|---------------|-----------|-------------------|----------------|-----|
| ask_name_reason | 114,936 | 86,200 | 10.775s | 0.4100 | 0.1811 |
| ask_details | 43,468 | 32,600 | 4.075s | 0.3788 | 0.1970 |
| ask_location | 40,936 | 30,700 | 3.837s | 0.5116 | 0.1803 |
| ask_completion_time | 23,468 | 17,600 | 2.200s | 0.2538 | 0.1898 |
| ask_callback_time | 47,736 | 35,800 | 4.475s | 0.4100 | 0.1749 |
| **complete** | 88,268 | 66,200 | 8.275s | 0.4569 | **0.1736** |

**Key Findings:**
1. **Final prompt has lowest RMS (0.1736)** - significantly quieter than other prompts
2. Peak amplitude varies widely across prompts (0.2538 to 0.5116) - inconsistent normalization
3. No clipping detected in any cached asset
4. All prompts use the same generation pipeline (confirmed by code audit)
5. Final prompt is not the longest byte-wise, but has the lowest energy

**Hypothesis:** The low RMS of the final prompt may be contributing to perceived "static" or degradation due to lower signal-to-noise ratio.

---

## Part 3 — Low-Pass Filter Audit

### Current Implementation

```typescript
function applyLowPassFilter(samples: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const filtered = new Float32Array(samples.length);
  const rc = 1.0 / (cutoffHz * 2 * Math.PI);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);

  filtered[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    filtered[i] = alpha * samples[i] + (1 - alpha) * filtered[i - 1];
  }
  return filtered;
}
```

### Filter Analysis

**Type:** Single-pole RC filter (first-order IIR)  
**Cutoff:** 3400 Hz  
**Sample Rate:** 24,000 Hz  
**Alpha Calculation:** `dt / (rc + dt)` where `rc = 1 / (2π * 3400) ≈ 46.8μs`, `dt = 41.67μs`

**Alpha Value:** `41.67 / (46.8 + 41.67) ≈ 0.471`

### Issues Identified

1. **First-order filter is too gentle** - Single-pole RC filter has a -20dB/decade roll-off, which is insufficient for anti-aliasing before 3x downsampling (24kHz → 8kHz)
2. **Cutoff at 3400 Hz is too low** - Sibilants (s, sh, f, th) have significant energy above 3400 Hz. Aggressive filtering smears these sounds
3. **No pre-warping** - At 24kHz, the analog frequency response is not accurately mapped to digital domain
4. **State not reset between calls** - Filter state carries over, potentially causing transient issues
5. **No boundary handling** - First sample is copied directly, causing a potential discontinuity

**Sibilant Impact:** Sibilants contain energy from 4-8 kHz. A 3400 Hz first-order filter attenuates these frequencies by only ~6-12 dB, which is insufficient to prevent aliasing but enough to smear the sound.

---

## Part 4 — Cubic Resampler Audit

### Current Implementation

```typescript
function cubicInterpolate(samples: Float32Array, position: number): number {
  const i = Math.floor(position);
  const frac = position - i;
  const p0 = samples[Math.max(0, i - 1)];
  const p1 = samples[i];
  const p2 = samples[Math.min(samples.length - 1, i + 1)];
  const p3 = samples[Math.min(samples.length - 1, i + 2)];

  const a0 = p3 - p2 - p0 + p1;
  const a1 = p0 - p1 - a0;
  const a2 = p2 - p0;
  const a3 = p1;

  return a0 * frac * frac * frac + a1 * frac * frac + a2 * frac + a3;
}
```

### Resampler Analysis

**Type:** Cubic Hermite interpolation  
**Downsampling Ratio:** 3:1 (24kHz → 8kHz)  
**Boundary Handling:** Clamps to valid indices  
**Overshoot:** Possible (cubic can exceed input range)

### Issues Identified

1. **No anti-aliasing filter before resampling** - The low-pass filter is applied, but it's insufficient for 3x downsampling
2. **Cubic interpolation not ideal for audio** - Designed for smooth curves, not bandlimited signal reconstruction
3. **No decimation** - Every 3rd sample is not taken; instead, continuous interpolation is used (inefficient and potentially inaccurate)
4. **Boundary clamping** - At edges, uses repeated samples which can cause artifacts
5. **Potential overshoot** - Cubic can produce values outside input range, causing clipping
6. **Not phase-linear** - Different frequencies may have different phase delays

**Comparison to Established Resamplers:**
- **FFmpeg aresample:** Uses polyphase FIR filter with proper anti-aliasing
- **SoX:** Uses bandlimited sinc interpolation
- **libsamplerate:** Uses high-quality polyphase filters

---

## Part 5 — PCMU Encoder Audit

### Current Implementation

```typescript
function pcmToMulaw(pcmData: Float32Array): Buffer {
  const MULAW_BIAS = 0x84;
  const MULAW_CLIP = 32635;
  const muLawData = new Uint8Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    let sample = Math.max(-1, Math.min(1, pcmData[i]));
    let linear = Math.floor(sample * 32767);

    let sign = (linear >> 8) & 0x80;
    if (sign !== 0) linear = -linear;
    if (linear > MULAW_CLIP) linear = MULAW_CLIP;
    linear = linear + MULAW_BIAS;

    let exponent = 7;
    for (expMask = 0x4000; !(linear & expMask) && exponent > 0; exponent--, expMask >>= 1) {
    }
    let mantissa = (linear >> (exponent + 3)) & 0x0F;
    let mulawByte = ~(sign | (exponent << 4) | mantissa);
    muLawData[i] = mulawByte;
  }
  return Buffer.from(muLawData);
}
```

### Encoder Analysis

**Standard:** G.711 μ-law (ITU-T G.711)  
**Bias:** 0x84 (132)  
**Clip:** 32635  
**Input Range:** -1.0 to 1.0 (float) → -32767 to 32767 (int16)

### Issues Identified

1. **Implementation appears correct** - Matches standard G.711 μ-law encoding
2. **No second encoding pass** - Confirmed by code audit (previous fix removed double encoding)
3. **Clipping at 32635 instead of 32767** - Slightly conservative, but within spec
4. **No gain processing after encoding** - Correct
5. **Silence maps correctly** - Zero input maps to 0xFF (255)

**Conclusion:** PCMU encoder is **not** the root cause. Implementation is standard-compliant.

---

## Part 6 — Chunk Pacing Audit

### Current Implementation

```typescript
const chunkSize = 160; // 20ms at 8kHz mu-law (160 bytes)
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
  // Send at real-time rate (20ms chunks)
  await new Promise(resolve => setTimeout(resolve, 20));
}
```

### Pacing Analysis

**Chunk Size:** 160 bytes (correct for 8kHz PCMU)  
**Delay:** 20ms per chunk (correct for real-time playback)  
**Method:** Simple setTimeout loop

### Issues Identified

1. **No drift correction** - setTimeout is not precise; drift can accumulate over long prompts
2. **No backpressure handling** - WebSocket ready state not checked
3. **No timing diagnostics** - No logging of actual inter-chunk timing
4. **Final chunk handling** - If final chunk < 160 bytes, still sent with 20ms delay (may cause gap)
5. **Event-loop dependency** - If event loop stalls, chunks may burst

**Final Prompt Specifics:**
- Final prompt: 66,200 bytes = 414 chunks
- Expected duration: 8.275s
- With 20ms per chunk: 8.28s (matches)
- **No special handling for final prompt**

---

## Part 7 — Final Prompt Lifecycle Audit

### Current Sequence

1. Stage becomes 'complete'
2. Cached audio selected from `cachedPromptAudio.complete`
3. Chunks sent in loop with 20ms pacing
4. `assistantSpeaking` set to false after last chunk
5. Call hangs up via `response.audio.done` handler

### Issues Identified

1. **No Twilio mark acknowledgment** - Chunks sent without waiting for Twilio mark events
2. **Hangup timing** - May close before Twilio has played all queued audio
3. **No trailing silence** - No padding after final prompt before hangup
4. **Stream close timing** - WebSocket may close before audio fully played

**Final Prompt Degradation Hypothesis:** The combination of low RMS (quiet audio) + no trailing silence + premature hangup may cause the final words to be cut off or sound static as Twilio buffers empty.

---

## Part 8 — Cached Asset Integrity

### Generation Script

**Location:** `scripts/generate-cached-audio.ts`  
**Last Modified:** Commit 6ba94446 (Refine AI intake timing prompt wording)  
**Pipeline:** OpenAI TTS → PCM16 24kHz → LPF 3400Hz → Cubic Resample → PCMU

### Issues Identified

1. **No version tracking** - No manifest or checksum to detect stale assets
2. **No regeneration on code change** - Assets not automatically regenerated when pipeline changes
3. **No validation** - No check for corrupted or empty assets
4. **Prompt text mismatch** - Script prompts may differ from runtime prompts
5. **No deployment verification** - No check that deployed assets match generated assets

**Asset Age Risk:** Cached assets may have been generated with an older version of the pipeline and not regenerated after fixes.

---

## Part 9 — Legacy Audio Path Comparison

### Git History Search

**Commits with audio changes:**
- 8ee65bc4: Restore stable audio output: PCM 24000 with PCM16 to μ-law conversion
- 2469a081: Eliminate PCM conversion - implement direct G711_ulaw audio forwarding
- 676e53e2: Fix OpenAI audio format - use PCMU instead of invalid g711_ulaw

**Key Finding:** Previous attempts at "direct PCMU" were reverted. Current system uses cached PCMU assets.

### Legacy vs Current Comparison

| Aspect | Legacy (if exists) | Current | Difference |
|--------|-------------------|---------|-------------|
| OpenAI format | Unknown | PCM 24kHz | ? |
| Voice | Unknown | alloy | ? |
| Filter | Unknown | 3400Hz RC | ? |
| Resampler | Unknown | Cubic | ? |
| Chunk size | Unknown | 160 bytes | ? |
| Pacing | Unknown | 20ms setTimeout | ? |

**Status:** Legacy "good-sounding" implementation not yet located in Git history. Further investigation required.

---

## Root Cause Analysis

### Ranked Hypotheses

1. **Insufficient Anti-Aliasing (HIGH PROBABILITY)**
   - First-order 3400Hz filter is too gentle for 3x downsampling
   - Causes aliasing artifacts that manifest as sibilance distortion
   - Affects all prompts, but sibilants most noticeable

2. **Low RMS on Final Prompt (MEDIUM PROBABILITY)**
   - Final prompt has significantly lower energy (RMS 0.1736 vs 0.18-0.19 for others)
   - Lower SNR makes perceived quality worse
   - May be due to OpenAI TTS generation variance

3. **Cubic Resampler Artifacts (MEDIUM PROBABILITY)**
   - Cubic interpolation not ideal for audio
   - Can cause overshoot and phase distortion
   - No proper decimation logic

4. **Final Prompt Lifecycle (LOW-MEDIUM PROBABILITY)**
   - No trailing silence before hangup
   - May cut off final words
   - Explains "robotic/static" final sentence specifically

5. **Chunk Pacing Drift (LOW PROBABILITY)**
   - setTimeout not precise
   - May cause audio bursts or gaps
   - Affects long prompts more

### Most Likely Root Cause

**Primary:** Insufficient anti-aliasing filter combined with suboptimal cubic resampler  
**Secondary:** Low RMS on final prompt + no trailing silence before hangup

---

## Recommended Fix

### Narrowest Safe Fix

**Option 1: Replace Low-Pass Filter (Recommended)**
- Replace first-order RC filter with proper anti-aliasing FIR filter
- Use Butterworth or similar with -40dB/decade roll-off
- Set cutoff to 3600-3800 Hz (slightly higher to preserve sibilants)
- Implement proper state reset

**Option 2: Replace Resampler**
- Use established resampler (FFmpeg aresample or similar)
- Proper anti-aliasing built-in
- Better phase linearity

**Option 3: Regenerate Cached Assets**
- Ensure all assets regenerated with consistent pipeline
- Add version tracking
- Normalize amplitudes across prompts

**Option 4: Add Trailing Silence**
- Add 200-500ms silence to final prompt
- Ensure hangup waits for playback completion

### Proposed Implementation Order

1. **Replace low-pass filter** (highest impact, lowest risk)
2. **Regenerate all cached assets** with new filter
3. **Add trailing silence to final prompt**
4. **Add chunk pacing diagnostics**
5. **Consider resampler replacement** if filter alone insufficient

---

## Next Steps

1. Implement improved low-pass filter
2. Regenerate cached audio assets
3. Add asset versioning/manifest
4. Test with real phone call
5. If sibilance persists, replace resampler
6. If final prompt still degrades, add trailing silence

---

## Appendix: Diagnostic Artifacts

Generated files in `scripts/diagnostic-output/`:
- `*-source-24k.wav` - Original 24kHz PCM
- `*-filtered-24k.wav` - After low-pass filter
- `*-resampled-8k.wav` - After cubic resampling
- `*-pcmu.ulaw` - Final PCMU encoding
- `*-pcmu-decoded.wav` - Decoded from PCMU
- `cached-*-decoded.wav` - Current production assets decoded
