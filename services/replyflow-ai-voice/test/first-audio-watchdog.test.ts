/**
 * First-audio watchdog — deterministic coverage of the SEV-1 silent-answer
 * matrix. Fake clocks + injected callbacks make every timer and every byte
 * verdict reproducible; no real sockets, no real time.
 *
 * Invariant under test: a greeting is delivered only when outbound media
 * BYTES were written — never because a send function was invoked.
 */
import { describe, it, expect } from 'vitest';
import {
  FirstAudioWatchdog,
  createFirstAudioTracker,
  emitFirstAudioSuccess,
  emitFirstAudioFailure,
  emitFirstAudioTrace,
  validateCriticalAudio,
  CRITICAL_FIRST_AUDIO_KEYS,
} from '../src/first-audio-watchdog';

// ---------------------------------------------------------------------
// Fake scheduler — records armed timers, fires them explicitly.
// ---------------------------------------------------------------------
interface FakeTimer { fn: () => void; ms: number; cancelled: boolean; fired: boolean }

function makeScheduler() {
  const timers: FakeTimer[] = [];
  const schedule = (fn: () => void, ms: number) => {
    const t: FakeTimer = { fn, ms, cancelled: false, fired: false };
    timers.push(t);
    return t;
  };
  const cancel = (h: unknown) => { (h as FakeTimer).cancelled = true; };
  // Fire every timer armed so far, exactly once each — timers re-armed during
  // a pass are picked up by the NEXT fireAll (mirrors real event-loop ticks).
  const fireAll = () => {
    for (const t of [...timers]) {
      if (!t.cancelled && !t.fired) {
        t.fired = true;
        t.fn();
      }
    }
  };
  const pending = () => timers.filter(t => !t.cancelled && !t.fired).length;
  return { timers, schedule, cancel, fireAll, pending };
}

function makeWatchdog(overrides: Partial<Parameters<typeof FirstAudioWatchdog.prototype.constructor>[0]> = {}) {
  const sched = makeScheduler();
  const calls = { retry: [] as number[], emergency: [] as string[], success: 0, failure: [] as string[] };
  let now = 1000;
  const wd = new FirstAudioWatchdog({
    now: () => now,
    schedule: sched.schedule,
    cancel: sched.cancel,
    getWebsocketState: () => 1,
    onRetry: (a) => calls.retry.push(a),
    onEmergencyFallback: (r) => calls.emergency.push(r),
    onSuccess: () => calls.success++,
    onFailure: (_t, ctx) => calls.failure.push(ctx.recoveryAction),
    ...overrides,
  });
  return { wd, sched, calls, setNow: (v: number) => { now = v; }, tracker: wd.tracker };
}

describe('FirstAudioWatchdog — delivery verified by bytes, not invocation', () => {
  it('1. normal call: bytes before watchdog → success, no retry, no fallback', () => {
    const { wd, sched, calls, tracker } = makeWatchdog();
    tracker.twilioStartReceivedAt = 900;
    wd.arm();
    wd.noteOutboundBytes(160);
    sched.fireAll();
    expect(tracker.firstOutboundMediaAt).not.toBeNull();
    expect(tracker.timeFromTwilioStartToFirstAudioMs).toBe(100);
    expect(tracker.resolved).toBe(true);
    expect(calls.retry).toHaveLength(0);
    expect(calls.emergency).toHaveLength(0);
    expect(calls.success).toBe(1);
  });

  it('2. send invoked but zero bytes → watchdog fires → single retry', () => {
    const { wd, sched, calls } = makeWatchdog();
    wd.arm();
    sched.fireAll();
    expect(calls.retry).toEqual([1]);
    expect(calls.emergency).toHaveLength(0);
    // retry re-arms the verification window
    expect(sched.pending()).toBe(1);
  });

  it('3+4. cached audio missing or zero-byte → retry exhausted → emergency fallback', () => {
    const { wd, sched, calls, tracker } = makeWatchdog();
    tracker.cachedAudioFound = false;
    tracker.cachedAudioByteLength = 0;
    wd.arm();
    sched.fireAll();          // → retry 1
    sched.fireAll();          // retry produced no bytes → emergency
    expect(calls.retry).toEqual([1]);
    expect(calls.emergency).toHaveLength(1);
    expect(tracker.fallbackTriggered).toBe(true);
    expect(tracker.resolved).toBe(true);
    expect(sched.pending()).toBe(0);
  });

  it('5. ws not OPEN at send → no bytes → recovery still bounded (retry→fallback)', () => {
    // ws state is opaque to the watchdog — only byte evidence matters.
    const { wd, sched, calls } = makeWatchdog({ getWebsocketState: () => 0 /* CONNECTING */ });
    wd.arm();
    sched.fireAll();
    sched.fireAll();
    expect(calls.retry).toHaveLength(1);
    expect(calls.emergency).toHaveLength(1);
  });

  it('7. greeting delayed but first byte lands before watchdog → no duplicate', () => {
    const { wd, sched, calls } = makeWatchdog();
    wd.arm();
    wd.noteDeliveryStarted();
    // byte arrives inside the watchdog window while send is in flight
    wd.noteOutboundBytes(160);
    wd.noteDeliveryFinished();
    sched.fireAll();
    expect(calls.retry).toHaveLength(0);
    expect(calls.emergency).toHaveLength(0);
  });

  it('8. retry succeeds → exactly one effective greeting (success resolves, no fallback)', () => {
    const { wd, sched, calls } = makeWatchdog();
    wd.arm();
    sched.fireAll();                       // → retry 1
    expect(calls.retry).toEqual([1]);
    wd.noteOutboundBytes(160);             // retry's first byte
    sched.fireAll();
    expect(calls.emergency).toHaveLength(0);
    expect(calls.retry).toHaveLength(1);   // no further retries
    expect(calls.success).toBe(1);
  });

  it('9. original/retry race — first byte from EITHER delivery wins, no second retry', () => {
    const { wd, sched, calls } = makeWatchdog();
    wd.arm();
    sched.fireAll();                       // retry authorized
    wd.noteOutboundBytes(160);             // original's delayed byte arrives
    sched.fireAll();
    expect(calls.retry).toHaveLength(1);
    expect(calls.emergency).toHaveLength(0);
  });

  it('10. mark never arrives but bytes were sent → no replay', () => {
    const { wd, sched, calls } = makeWatchdog();
    wd.arm();
    wd.noteOutboundBytes(160);
    wd.noteMarkSent();
    sched.fireAll();
    sched.fireAll();
    expect(calls.retry).toHaveLength(0);
    expect(calls.emergency).toHaveLength(0);
  });

  it('11. no bytes after retry → emergency fallback fires exactly once', () => {
    const { wd, sched, calls } = makeWatchdog();
    wd.arm();
    sched.fireAll(); // retry
    sched.fireAll(); // emergency
    sched.fireAll(); // nothing more may fire
    expect(calls.emergency).toHaveLength(1);
    expect(sched.pending()).toBe(0);
  });

  it('12. retry is strictly bounded — maxRetryAttempts caps recovery', () => {
    const { wd, sched, calls } = makeWatchdog({ maxRetryAttempts: 1 });
    wd.arm();
    for (let i = 0; i < 6; i++) sched.fireAll();
    expect(calls.retry).toHaveLength(1);
    expect(calls.emergency).toHaveLength(1);
  });

  it('13. call A cleared watchdog cannot affect call B', () => {
    const a = makeWatchdog();
    const b = makeWatchdog();
    a.wd.arm();
    b.wd.arm();
    a.wd.clear();              // call A closes
    a.sched.fireAll();
    b.sched.fireAll();
    expect(a.calls.retry).toHaveLength(0);     // A never recovers
    expect(a.calls.emergency).toHaveLength(0);
    expect(b.calls.retry).toEqual([1]);        // B proceeds independently
  });

  it('14. call closes before watchdog → timer cleared, no later action', () => {
    const { wd, sched, calls } = makeWatchdog();
    wd.arm();
    wd.clear();
    sched.fireAll();
    expect(sched.pending()).toBe(0);
    expect(calls.retry).toHaveLength(0);
    expect(calls.emergency).toHaveLength(0);
    expect(calls.success).toBe(0);
  });

  it('in-flight send defers verdict (bounded) instead of double-writing', () => {
    const { wd, sched, calls } = makeWatchdog();
    wd.arm();
    wd.noteDeliveryStarted();
    sched.fireAll();                          // deferral 1, not retry
    expect(calls.retry).toHaveLength(0);
    sched.fireAll();                          // deferral 2
    expect(calls.retry).toHaveLength(0);
    sched.fireAll();                          // deferrals exhausted → retry
    expect(calls.retry).toEqual([1]);
    // send finished with bytes — late success still resolves cleanly
    wd.noteDeliveryFinished();
    wd.noteOutboundBytes(160);
    sched.fireAll();
    expect(calls.emergency).toHaveLength(0);
  });

  it('mark receive + chunk/byte accounting recorded', () => {
    const { wd, tracker } = makeWatchdog();
    wd.noteOutboundBytes(160);
    wd.noteOutboundBytes(160);
    wd.noteOutboundBytes(120);
    wd.noteMarkSent();
    wd.noteMarkReceived();
    expect(tracker.outboundChunkCount).toBe(3);
    expect(tracker.outboundByteCount).toBe(440);
    expect(tracker.firstOutboundMediaBytes).toBe(160);
    expect(tracker.greetingMarkSentAt).not.toBeNull();
    expect(tracker.greetingMarkReceivedAt).not.toBeNull();
  });
});

describe('structured log markers', () => {
  it('[AI FIRST AUDIO SUCCESS] carries time-to-first-audio', () => {
    const lines: string[] = [];
    const t = createFirstAudioTracker();
    t.callSid = 'CA1'; t.streamSid = 'MZ1';
    t.timeFromTwilioStartToFirstAudioMs = 120;
    t.outboundChunkCount = 5; t.outboundByteCount = 800;
    emitFirstAudioSuccess(t, l => lines.push(l));
    const blob = lines.join('\n');
    expect(blob).toContain('[AI FIRST AUDIO SUCCESS] callSid: CA1');
    expect(blob).toContain('timeFromTwilioStartToFirstAudioMs: 120');
  });

  it('[AI FIRST AUDIO FAILURE] carries the full diagnostic set', () => {
    const lines: string[] = [];
    const t = createFirstAudioTracker();
    t.callSid = 'CA2'; t.streamSid = 'MZ2';
    t.cachedAudioFound = true; t.cachedAudioByteLength = 101000;
    emitFirstAudioFailure(t, {
      reason: 'no_outbound_greeting_bytes_within_watchdog',
      elapsedMs: 2000, websocketState: 1,
      retryAttempt: 1, recoveryAction: 'emergency_audible_fallback',
    }, l => lines.push(l));
    const blob = lines.join('\n');
    for (const k of ['callSid: CA2', 'streamSid: MZ2', 'reason: no_outbound',
      'elapsedMs: 2000', 'cachedAudioFound: true', 'cachedAudioBytes: 101000',
      'websocketState: 1', 'retryAttempt: 1', 'recoveryAction: emergency_audible_fallback']) {
      expect(blob).toContain(k);
    }
  });

  it('[AI FIRST AUDIO] trace emits every required field', () => {
    const lines: string[] = [];
    emitFirstAudioTrace(createFirstAudioTracker(), l => lines.push(l));
    const blob = lines.join('\n');
    for (const f of ['callSid', 'streamSid', 'websocketReadyAt', 'twilioStartReceivedAt',
      'greetingAuthorizedAt', 'cachedAudioFound', 'cachedAudioByteLength',
      'firstOutboundMediaAt', 'firstOutboundMediaBytes', 'outboundChunkCount',
      'greetingMarkSentAt', 'greetingMarkReceivedAt',
      'timeFromTwilioStartToFirstAudioMs', 'fallbackTriggered', 'fallbackReason']) {
      expect(blob).toContain(`[AI FIRST AUDIO] ${f}:`);
    }
  });
});

describe('critical audio readiness (health gate)', () => {
  it('ok when the initial greeting asset is present and non-empty', () => {
    const r = validateCriticalAudio({ ask_name: Buffer.from('x'.repeat(200)).toString('base64') });
    expect(r.ok).toBe(true);
    expect(CRITICAL_FIRST_AUDIO_KEYS).toContain('ask_name');
  });

  it('fails on missing asset', () => {
    const r = validateCriticalAudio({} as any);
    expect(r.ok).toBe(false);
    expect(r.missingKeys).toEqual(['ask_name']);
  });

  it('fails on zero-byte asset', () => {
    const r = validateCriticalAudio({ ask_name: '' });
    expect(r.ok).toBe(false);
    expect(r.missingKeys).toEqual(['ask_name']); // '' is falsy → missing
  });

  it('fails on checksum mismatch (corrupt asset)', () => {
    const b64 = Buffer.from('hello-audio').toString('base64');
    const r = validateCriticalAudio(
      { ask_name: b64 },
      { ask_name: 'expected-sha' },
      () => 'actual-sha'
    );
    expect(r.ok).toBe(false);
    expect(r.mismatchedChecksumKeys).toEqual(['ask_name']);
  });
});
