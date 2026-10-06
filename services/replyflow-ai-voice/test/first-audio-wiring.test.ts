/**
 * First-audio wiring assertions — prove the monolith is wired to the
 * byte-verified watchdog in the order the design requires, and that the
 * decoupling, cleanup, and health gate are actually present in source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const indexSrc = readFileSync(join(__dirname, '../src/index.ts'), 'utf8');
const healthSrc = readFileSync(join(__dirname, '../src/health.ts'), 'utf8');

describe('first-audio wiring — index.ts', () => {
  it('authorizes the greeting at twilio start BEFORE opening the OpenAI socket', () => {
    const authIdx = indexSrc.indexOf('authorizeInitialGreeting();');
    const openAiIdx = indexSrc.indexOf('const openAiUrl = createOpenAIRealtimeUrl();');
    expect(authIdx).toBeGreaterThan(-1);
    expect(openAiIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(openAiIdx);
  });

  it('arms the watchdog before authorizing the greeting', () => {
    const armIdx = indexSrc.indexOf('armFirstAudioWatchdog();');
    const authIdx = indexSrc.indexOf('authorizeInitialGreeting();');
    expect(armIdx).toBeGreaterThan(-1);
    expect(armIdx).toBeLessThan(authIdx);
  });

  it('sendPrompt remains the single greeting delivery path (retry reuses it)', () => {
    // recovery retry calls sendPrompt with initial_prompt source + reprompt attempt
    expect(indexSrc).toContain("sendPrompt(state.currentStage, undefined, 'initial_prompt', state.currentTurnId, repromptAttempt ?? attempt)");
  });

  it('byte evidence is recorded inside the media loop for the tracked identity', () => {
    expect(indexSrc).toContain('state.firstAudio.deliveryIdentity === deliveryIdentity');
    expect(indexSrc).toContain('noteOutboundBytes(rawChunk.length)');
  });

  it('watchdog + tracker are cleared on websocket close', () => {
    const closeIdx = indexSrc.indexOf("ws.on('close', async () => {");
    const clearIdx = indexSrc.indexOf('state.firstAudioWatchdog.clear()');
    expect(closeIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(closeIdx);
    expect(indexSrc).toContain('state.firstAudio.resolved = true');
  });

  it('emergency fallback uses Twilio REST TwiML — independent of OpenAI/cache/ws', () => {
    expect(indexSrc).toContain('calls(state.callSid).update({ twiml: emergencyTwiml })');
    expect(indexSrc).toContain('<Say voice="alice">Thanks for calling.');
    expect(indexSrc).toContain('/api/twilio/voicemail');
  });

  it('emergency fallback fails closed — lead preserved + socket terminated', () => {
    expect(indexSrc).toContain('first_audio_emergency_fallback:');
    expect(indexSrc).toMatch(/createFallbackLead\(\s*state\.callSid,\s*state\.businessId/);
    expect(indexSrc).toContain("ws.close(1008, 'First audio emergency fallback')");
  });

  it('maybeSendInitialPrompt cannot dispatch after the tracker is terminal', () => {
    expect(indexSrc).toContain('!state.firstAudio?.resolved');
  });

  it('greeting stage silence is re-synced on session.updated (VAD parity)', () => {
    expect(indexSrc).toContain('stageSilenceSyncedForStage');
    expect(indexSrc).toContain('getStageSilenceMs(state.currentStage)');
    expect(indexSrc).toContain('first-audio resync');
  });

  it('intake state machine untouched — recovery never resets stage/turn', () => {
    // The recovery block must not assign currentStage/currentTurnId backwards
    const recoveryStart = indexSrc.indexOf('FIRST AUDIO (SEV-1): never leave');
    const recoveryEnd = indexSrc.indexOf('Only send the first prompt after both');
    const block = indexSrc.slice(recoveryStart, recoveryEnd);
    expect(block).not.toContain('state.currentStage =');
    expect(block).not.toContain('state.currentTurnId =');
    expect(block).not.toContain('pendingAnswerStage =');
  });
});

describe('first-audio preroll wiring — index.ts', () => {
  it('pre-roll runs INSIDE sendPrompt before the payload loop, first greeting only', () => {
    const prerollIdx = indexSrc.indexOf('await sendInitialGreetingPreroll()');
    const loopIdx = indexSrc.indexOf('for (let i = 0; i < audioBuffer.length; i += chunkSize)');
    expect(prerollIdx).toBeGreaterThan(-1);
    expect(prerollIdx).toBeLessThan(loopIdx);
    // gated strictly on the initial greeting source — later stages bypass it
    const gate = indexSrc.slice(prerollIdx - 400, prerollIdx);
    expect(gate).toContain("source === 'initial_prompt'");
  });

  it('pre-roll uses a dedicated μ-law silence buffer — never slices the cached asset', () => {
    const fnStart = indexSrc.indexOf('const INITIAL_GREETING_PREROLL_MS');
    const fnEnd = indexSrc.indexOf('Emergency audible fallback', fnStart);
    const block = indexSrc.slice(fnStart, fnEnd);
    expect(block).toContain('Buffer.alloc(chunkSize, PCMU_SILENCE_BYTE)');
    expect(block).toContain('PCMU_SILENCE_BYTE = 0xff');
    expect(block).not.toContain('audioBuffer'); // cannot touch greeting bytes
    expect(block).toContain("event: 'media'");
    expect(block).toContain('streamSid: state.streamSid');
  });

  it('~500ms pre-roll = 4000 bytes = 25×160B chunks at 20ms cadence', () => {
    expect(indexSrc).toContain('INITIAL_GREETING_PREROLL_MS = 500');
    expect(indexSrc).toContain('(8000 * INITIAL_GREETING_PREROLL_MS) / 1000'); // → 4000
    expect(indexSrc).toContain('setTimeout(resolve, 20)');
  });

  it('silence chunks are recorded via notePreRollChunk — not as payload bytes', () => {
    const fnStart = indexSrc.indexOf('async function sendInitialGreetingPreroll');
    const fnEnd = indexSrc.indexOf('Emergency audible fallback', fnStart);
    const block = indexSrc.slice(fnStart, fnEnd);
    expect(block).toContain('notePreRollChunk(chunkSize)');
    expect(block).not.toContain('noteOutboundBytes');
  });

  it('the cached asset still loops from byte 0 to its full length — nothing trimmed', () => {
    expect(indexSrc).toContain('const audioBuffer = Buffer.from(cachedAudio, \'base64\');');
    expect(indexSrc).toContain('for (let i = 0; i < audioBuffer.length; i += chunkSize)');
    expect(indexSrc).toContain('const rawChunk = audioBuffer.slice(i, i + chunkSize);');
  });

  it('completed PREROLL block is emitted when the first greeting payload byte lands', () => {
    expect(indexSrc).toContain('isFirstGreetingPayloadByte');
    expect(indexSrc).toContain('emitFirstAudioPreroll(state.firstAudio)');
    expect(indexSrc).toContain('msFromTwilioStartToGreetingPayload');
  });

  it('pre-roll aborts on socket loss / call close / interrupt — then returns false to the watchdog', () => {
    const fnStart = indexSrc.indexOf('const INITIAL_GREETING_PREROLL_MS');
    const fnEnd = indexSrc.indexOf('Emergency audible fallback', fnStart);
    const block = indexSrc.slice(fnStart, fnEnd);
    expect(block).toContain('ws.readyState !== WebSocket.OPEN');
    expect(block).toContain('t.resolved');
    expect(block).toContain('state.cachedPlaybackInterrupted');
    expect(block).toContain('t.preRollAborted = true');
    expect(indexSrc).toContain('preroll_aborted_returning_false');
  });
});

describe('first-audio wiring — health.ts', () => {
  it('health payload gates on critical first-audio readiness', () => {
    expect(healthSrc).toContain('validateCriticalAudio');
    expect(healthSrc).toContain("status: criticalAudio.ok ? 'healthy' : 'unhealthy'");
    expect(healthSrc).toContain('criticalAudioReady');
  });
});
