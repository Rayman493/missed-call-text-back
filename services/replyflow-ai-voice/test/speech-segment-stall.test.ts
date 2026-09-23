/**
 * Speech Segment Stall Watchdog Regression Tests
 *
 * Production issue (callSid CA48ff4a463575241253319ea962186624):
 * The ask_request stage timeout was cancelled on input_audio_buffer.speech_started
 * (reason: caller_answer_in_progress), but speech_stopped and transcription.completed
 * never arrived — inbound Twilio media stopped being logged ~1s after speech start
 * while the socket stayed open ~43s. Because the transcription watchdog only arms
 * on speech_stopped, no recovery path existed and the intake deadlocked until the
 * caller hung up.
 *
 * Fix: speech_started arms a bounded stall watchdog on the open speech segment.
 * If inbound audio is still flowing at fire time it re-arms (never interrupt a
 * legitimately long answer); otherwise it reprompts the current stage.
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');

// --- Deterministic simulation of the watchdog semantics ---------------------

const STALL_MS = 40;
const MAX_OPEN_MS = 120;
const RECENT_AUDIO_MS = 25;

interface MockState {
  currentStage: string;
  currentTurnId: number;
  speechGeneration: number;
  inSpeechSegment: boolean;
  lastInboundAudioAt: number | null;
  answerAcceptedForStage: string | null;
  assistantSpeaking: boolean;
  settleWindowTimeout: NodeJS.Timeout | null;
  pendingAnswerStage: string | null;
  transcriptionWatchdogTimeout: NodeJS.Timeout | null;
  stageTimeout: NodeJS.Timeout | null;
}

function makeState(): MockState {
  return {
    currentStage: 'ask_request',
    currentTurnId: 1,
    speechGeneration: 0,
    inSpeechSegment: false,
    lastInboundAudioAt: null,
    answerAcceptedForStage: null,
    assistantSpeaking: false,
    settleWindowTimeout: null,
    pendingAnswerStage: null,
    transcriptionWatchdogTimeout: null,
    stageTimeout: null,
  };
}

// Mirror of the index.ts speech_started + stall watchdog logic
function onSpeechStarted(
  state: MockState,
  reprompt: (stage: string, turnId: number, source: string) => void,
  stallMs = STALL_MS,
  maxOpenMs = MAX_OPEN_MS,
) {
  state.speechGeneration++;
  state.inSpeechSegment = true;
  if (state.stageTimeout) {
    clearTimeout(state.stageTimeout);
    state.stageTimeout = null; // timeout_cancelled_on_speech_start
  }
  if (state.transcriptionWatchdogTimeout) {
    clearTimeout(state.transcriptionWatchdogTimeout);
    state.transcriptionWatchdogTimeout = null;
  }
  const stallGeneration = state.speechGeneration;
  const stallStage = state.currentStage;
  const stallTurnId = state.currentTurnId;
  const stallDeadlineAt = Date.now() + maxOpenMs;
  const armStallWatchdog = () => {
    state.transcriptionWatchdogTimeout = setTimeout(() => {
      state.transcriptionWatchdogTimeout = null;
      if (!state.inSpeechSegment ||
          state.speechGeneration !== stallGeneration ||
          state.currentStage !== stallStage ||
          state.currentTurnId !== stallTurnId) return;
      const segmentOpenTooLong = Date.now() >= stallDeadlineAt;
      const audioStillArriving = !!state.lastInboundAudioAt &&
        (Date.now() - state.lastInboundAudioAt) < RECENT_AUDIO_MS;
      if (audioStillArriving && !segmentOpenTooLong) { armStallWatchdog(); return; }
      if (state.answerAcceptedForStage === stallStage ||
          state.assistantSpeaking ||
          (state.settleWindowTimeout && state.pendingAnswerStage)) return;
      state.inSpeechSegment = false;
      reprompt(stallStage, stallTurnId, 'speech_stall_watchdog');
    }, stallMs);
  };
  armStallWatchdog();
}

// Mirror of the speech_stopped branch: clears stall watchdog, arms post-speech one
function onSpeechStopped(
  state: MockState,
  reprompt: (stage: string, turnId: number, source: string) => void,
) {
  state.inSpeechSegment = false;
  state.lastInboundAudioAt = null;
  if (state.transcriptionWatchdogTimeout) clearTimeout(state.transcriptionWatchdogTimeout);
  const gen = state.speechGeneration;
  const stage = state.currentStage;
  const turn = state.currentTurnId;
  state.transcriptionWatchdogTimeout = setTimeout(() => {
    if (state.inSpeechSegment || state.speechGeneration !== gen ||
        state.currentStage !== stage || state.currentTurnId !== turn) return;
    reprompt(stage, turn, 'transcription_watchdog');
  }, STALL_MS);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('speech segment stall watchdog', () => {
  it('source: speech_started arms a bounded stall watchdog', () => {
    const startIdx = src.indexOf("message.type === 'input_audio_buffer.speech_started'");
    const stopIdx = src.indexOf("message.type === 'input_audio_buffer.speech_stopped'");
    expect(startIdx).to.be.greaterThan(-1);
    expect(stopIdx).to.be.greaterThan(startIdx);
    const segment = src.slice(startIdx, stopIdx);
    expect(segment).to.contain('stall_watchdog_started');
    expect(segment).to.contain('trigger: speech_started');
    expect(segment).to.contain('SPEECH_SEGMENT_STALL_MS');
    expect(segment).to.contain('SPEECH_SEGMENT_MAX_OPEN_MS = 60000');
    expect(segment).to.contain('SPEECH_SEGMENT_STALL_MS = 15000');
    expect(segment).to.contain('stallDeadlineAt');
    expect(segment).to.contain('caller_audio_still_flowing');
    expect(segment).to.contain('speech_segment_max_open_exceeded');
    expect(segment).to.contain("'speech_stall_watchdog'");
  });

  it('source: speech_stopped still re-arms the post-speech transcription watchdog', () => {
    const stopIdx = src.indexOf("message.type === 'input_audio_buffer.speech_stopped'");
    const committedIdx = src.indexOf("message.type === 'input_audio_buffer.committed'", stopIdx);
    const segment = src.slice(stopIdx, committedIdx);
    expect(segment).to.contain('clearTimeout(state.transcriptionWatchdogTimeout)');
    expect(segment).to.contain('trigger: speech_stopped');
  });

  it('reprompts when speech_started is never followed by speech_stopped and media is stalled', async () => {
    const state = makeState();
    const reprompts: string[] = [];
    state.stageTimeout = setTimeout(() => reprompts.push('stage_timeout'), 25);
    state.lastInboundAudioAt = Date.now() - 60000; // media stalled long ago

    onSpeechStarted(state, (stage, _turn, source) => reprompts.push(`${source}:${stage}`));
    expect(state.stageTimeout).to.be.null; // stage timeout cancelled on speech start
    expect(state.transcriptionWatchdogTimeout).to.not.be.null; // stall watchdog armed

    await wait(STALL_MS + 30);
    expect(reprompts).to.deep.equal(['speech_stall_watchdog:ask_request']);
    expect(state.inSpeechSegment).to.equal(false);
  });

  it('does not interrupt a caller whose audio is still flowing (re-arms instead)', async () => {
    const state = makeState();
    const reprompts: string[] = [];
    state.lastInboundAudioAt = Date.now();

    onSpeechStarted(state, (stage) => reprompts.push(stage));
    await wait(STALL_MS - 10);
    state.lastInboundAudioAt = Date.now(); // audio still arriving at fire time
    await wait(30);
    expect(reprompts).to.be.empty; // rearmed, not fired
    expect(state.transcriptionWatchdogTimeout).to.not.be.null;

    // Caller media stalls; next fire reprompts
    state.lastInboundAudioAt = Date.now() - 60000;
    await wait(STALL_MS + 30);
    expect(reprompts).to.deep.equal(['ask_request']);
  });

  it('is superseded by a normal speech_stopped -> transcription path', async () => {
    const state = makeState();
    const reprompts: string[] = [];
    onSpeechStarted(state, (stage, _turn, source) => reprompts.push(`${source}:${stage}`));
    await wait(10);
    onSpeechStopped(state, (stage, _turn, source) => reprompts.push(`${source}:${stage}`));
    // Transcription arrives promptly: watchdog cleared by caller
    clearTimeout(state.transcriptionWatchdogTimeout!);
    state.transcriptionWatchdogTimeout = null;
    state.answerAcceptedForStage = 'ask_request';
    await wait(STALL_MS * 2 + 30);
    expect(reprompts).to.be.empty;
  });

  it('is superseded when a newer speech generation starts', async () => {
    const state = makeState();
    const reprompts: string[] = [];
    onSpeechStarted(state, (stage) => reprompts.push(stage));
    await wait(10);
    // New speech segment bumps generation and re-arms its own watchdog
    state.lastInboundAudioAt = Date.now() - 60000;
    onSpeechStarted(state, (stage) => reprompts.push(`gen2:${stage}`));
    await wait(STALL_MS + 30);
    // Only the newest generation may fire
    expect(reprompts.every((r) => r.startsWith('gen2:'))).to.equal(true);
    expect(reprompts.length).to.equal(1);
  });

  it('bounded: continuous inbound media without speech_stopped cannot re-arm forever', async () => {
    const state = makeState();
    const reprompts: string[] = [];
    onSpeechStarted(state, (stage) => reprompts.push(stage));

    // Media keeps arriving for longer than MAX_OPEN_MS — simulating a lost
    // speech_stopped with a healthy Twilio stream (silence packets count).
    const end = Date.now() + MAX_OPEN_MS + STALL_MS * 2;
    while (Date.now() < end) {
      state.lastInboundAudioAt = Date.now();
      await wait(15);
    }
    expect(reprompts).to.deep.equal(['ask_request']);
    expect(state.inSpeechSegment).to.equal(false);
    expect(state.transcriptionWatchdogTimeout).to.be.null;
  });

  it('does not reprompt while the assistant is already speaking', async () => {
    const state = makeState();
    const reprompts: string[] = [];
    state.lastInboundAudioAt = Date.now() - 60000;
    onSpeechStarted(state, (stage) => reprompts.push(stage));
    state.assistantSpeaking = true;
    await wait(STALL_MS + 30);
    expect(reprompts).to.be.empty;
  });
});
