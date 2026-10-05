import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Voice-delivery reliability contract for the silent-call defect.
 *
 * Production evidence: calls where every log line looked successful —
 * 485 chunks "delivered", prompt-complete mark accepted ~35ms after the
 * last chunk — while the caller heard nothing. The mark proves Twilio
 * processed the outbound buffer, not that audio was audible.
 *
 * Concrete code-level defects proven:
 *   1. maybeSendInitialPrompt gated the greeting on OpenAI session events
 *      only — never on the Twilio `start` frame that produces streamSid.
 *      Media with an empty streamSid is silently dropped by Twilio.
 *   2. Media chunks were ws.send() fire-and-forget: no error callback, no
 *      readyState check, no bufferedAmount — "delivery_succeeded" was
 *      indistinguishable from bytes that never left the socket.
 *   3. A speech_started (caller's answering "hello?") during the greeting
 *      set cachedPlaybackInterrupted, truncating the prompt to a fragment
 *      followed by dead air — perceived as total silence.
 *   4. A missing Twilio `start` left no bounded path to voicemail —
 *      indefinite dead air.
 */
describe('prompt delivery reliability contract', () => {
  const indexPath = path.join(__dirname, '..', 'src', 'index.ts');
  const src = fs.readFileSync(indexPath, 'utf-8');

  describe('initial prompt requires the Twilio stream', () => {
    it('maybeSendInitialPrompt gates on streamSid, not only session events', () => {
      const fnMatch = src.match(
        /function maybeSendInitialPrompt\(\)[\s\S]{0,4000}?\n  \}/);
      expect(fnMatch, 'maybeSendInitialPrompt function not found').to.not.be.null;
      const body = fnMatch![0];
      // The streamSid gate must appear before initialPromptSent is set.
      const sidGateIdx = body.indexOf('!state.streamSid');
      const sentIdx = body.indexOf('state.initialPromptSent = true');
      expect(sidGateIdx, 'no explicit streamSid gate').to.be.greaterThan(-1);
      expect(sentIdx, 'initialPromptSent never set').to.be.greaterThan(-1);
      expect(sidGateIdx).to.be.lessThan(sentIdx);
    });

    it('deferred prompt is released when the Twilio start frame arrives', () => {
      expect(src).to.include('initial_prompt_deferred_no_streamSid');
      expect(src).to.include('twilio_start_released_deferred_prompt');
      // start handler re-invokes the readiness check
      expect(src).to.match(
        /initialPromptWaitingForStart[\s\S]{0,800}?maybeSendInitialPrompt\(\)/);
    });

    it('a missing start frame fails safely instead of dead-airing forever', () => {
      expect(src).to.include('twilio_start_never_received');
      const deferIdx = src.indexOf('initial_prompt_deferred_no_streamSid');
      const neverIdx = src.indexOf('twilio_start_never_received');
      const fallbackIdx = src.indexOf('triggerVoicemailFallback(', neverIdx);
      expect(deferIdx).to.be.greaterThan(-1);
      expect(neverIdx).to.be.greaterThan(deferIdx);
      expect(fallbackIdx).to.be.greaterThan(-1);
      expect(fallbackIdx - neverIdx).to.be.lessThan(2000);
    });
  });

  describe('media send path proves delivery attempts', () => {
    it('cached-audio send loop hard-fails on missing streamSid', () => {
      expect(src).to.include('twilio_stream_sid_missing');
      const guardIdx = src.indexOf('twilio_stream_sid_missing');
      const loopIdx = src.indexOf('for (let i = 0; i < audioBuffer.length');
      expect(loopIdx).to.be.greaterThan(-1);
      expect(guardIdx).to.be.lessThan(loopIdx);
    });

    it('every media ws.send carries an error callback or try/catch', () => {
      // Bare fire-and-forget media sends are forbidden — the regression that
      // made "delivered" chunks invisible when the socket was dying.
      const mediaSendPattern =
        /event: 'media',[\s\S]{0,300}?ws\.send\(JSON\.stringify\(mediaMessage\)\);/g;
      const bareSends = src.match(mediaSendPattern) || [];
      // The only remaining bare-send shape allowed is inside a try/catch with
      // a send callback; a literal `ws.send(JSON.stringify(mediaMessage));`
      // followed by neither `, (err` callback nor catch must not exist.
      expect(
        src.includes('ws.send(JSON.stringify(mediaMessage));'),
        'bare fire-and-forget media send found — send errors would be invisible'
      ).to.be.false;
      void bareSends;
      expect(src).to.include('recordSendError');
      expect(src).to.include('sendErrorCount');
    });

    it('send errors abort into the voicemail fallback, not a success log', () => {
      expect(src).to.include('throw firstSendError');
      const throwIdx = src.indexOf('throw firstSendError');
      const catchIdx = src.indexOf('cached_audio_send_error', throwIdx);
      expect(catchIdx).to.be.greaterThan(-1);
      // Fallback is invoked from that catch block
      const between = src.slice(catchIdx, catchIdx + 2500);
      expect(between).to.include('triggerVoicemailFallback(');
    });

    it('media_send_completed logs delivery observability fields', () => {
      const idx = src.indexOf('media_send_completed');
      const block = src.slice(idx, idx + 1200);
      expect(block).to.include('sendErrorCount');
      expect(block).to.include('wsBufferedAmount');
      expect(block).to.include('streamSid');
    });
  });

  describe('answer-noise cannot truncate the greeting', () => {
    it('initial prompt interruption is suppressed inside a short grace window', () => {
      expect(src).to.include('initial_prompt_interrupt_suppressed');
      expect(src).to.include('INITIAL_PROMPT_INTERRUPT_GRACE_MS');
      // Grace is keyed to a start stamp set only for the initial prompt
      expect(src).to.include('state.initialPromptStartedAt = Date.now()');
      expect(src).to.match(
        /source === 'initial_prompt'[\s\S]{0,200}?initialPromptStartedAt/);
    });

    it('the grace stamp is time-bounded, not a persistent flag', () => {
      // initialPromptStartedAt is compared against speechStartedAt with a
      // bounded window — it cannot suppress barge-in on later prompts.
      const graceIdx = src.indexOf('initial_prompt_interrupt_suppressed');
      const block = src.slice(graceIdx - 1200, graceIdx);
      expect(block).to.include('speechStartedAt - state.initialPromptStartedAt');
      expect(block).to.include('INITIAL_PROMPT_INTERRUPT_GRACE_MS');
    });
  });

  describe('mark semantics are not claimed as audibility proof', () => {
    it('mark watchdog still exists — mark is queue processing, not playback proof', () => {
      expect(src).to.include('[MARK WATCHDOG]');
      expect(src).to.include('mark_timeout');
    });

    it('marks returning implausibly fast are flagged instead of trusted', () => {
      // CA0950b02c673ae5f279bed57cf49d0778: every send succeeded yet the
      // caller heard nothing. A mark ~35ms after the last chunk proves only
      // queue processing — a mark far ahead of the audio duration means the
      // buffer was flushed/dropped and the caller could not have heard it.
      expect(src).to.include('implausible_mark_timing');
      expect(src).to.include('markLatencyMs');
      expect(src).to.include('lastPromptExpectedDurationMs');
      const idx = src.indexOf('implausible_mark_timing');
      const block = src.slice(Math.max(0, idx - 1500), idx);
      expect(block).to.include('promptAudioStartedAt');
    });

    it('the Twilio start payload is logged with real values, not just key names', () => {
      // tracks/mediaFormat values are the only way to prove the stream was
      // bidirectional PCMU 8k — key names alone cannot.
      expect(src).to.include('startTracks');
      expect(src).to.include('startMediaFormat');
    });
  });

  describe('silent-call recovery window', () => {
    it('the initial greeting answer-wait is shorter than the generic stage timeout', () => {
      expect(src).to.include('INITIAL_STAGE_ANSWER_WAIT_MS');
      const constIdx = src.indexOf('const INITIAL_STAGE_ANSWER_WAIT_MS');
      expect(constIdx).to.be.greaterThan(-1);
      const m = src.slice(constIdx, constIdx + 200).match(/INITIAL_STAGE_ANSWER_WAIT_MS\s*=\s*(\d+)/);
      expect(m, 'INITIAL_STAGE_ANSWER_WAIT_MS literal not found').to.not.be.null;
      expect(Number(m![1])).to.be.lessThan(15000);
      expect(Number(m![1])).to.be.greaterThanOrEqual(5000);
    });

    it('the shorter wait applies only to the initial prompt, not every stage', () => {
      expect(src).to.include("source === 'initial_prompt' ? INITIAL_STAGE_ANSWER_WAIT_MS : STAGE_TIMEOUT_MS");
      // startStageTimeout must accept the override — the call site passes it
      // through so re-prompts and later stages keep the normal window.
      expect(src).to.match(/startStageTimeout\s*=\s*\(timeoutMs/);
    });
  });
});
