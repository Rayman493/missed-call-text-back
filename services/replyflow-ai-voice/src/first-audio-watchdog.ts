/**
 * First-audio delivery verification — the "never a silent answer" invariant.
 *
 * A call is NOT considered to have delivered its greeting because a send
 * function was invoked. Success requires actual outbound media bytes to have
 * been written to the Twilio WebSocket for that call. This module owns:
 *
 *   - the per-call FIRST AUDIO fact tracker (structured observability)
 *   - the delivery-fact watchdog (fires on missing bytes, not on timers alone)
 *   - the bounded recovery orchestration (one retry, then an independent
 *     emergency audible path, then fail-closed termination)
 *
 * The class is transport-agnostic: index.ts injects the real send/retry /
 * emergency-fallback / terminate callbacks, which keeps every timer and every
 * decision deterministically testable.
 */

export interface FirstAudioTracker {
  callSid: string;
  streamSid: string;
  websocketReadyAt: number | null;
  twilioStartReceivedAt: number | null;
  greetingAuthorizedAt: number | null;
  cachedAudioFound: boolean | null;
  cachedAudioByteLength: number;
  firstOutboundMediaAt: number | null;
  firstOutboundMediaBytes: number;
  outboundChunkCount: number;
  outboundByteCount: number;
  greetingMarkSentAt: number | null;
  greetingMarkReceivedAt: number | null;
  timeFromTwilioStartToFirstAudioMs: number | null;
  fallbackTriggered: boolean;
  fallbackReason: string | null;
  /** Stage the greeting is authorized for — marks are matched against it. */
  stage: string;
  /** sendPrompt's delivery identity for the currently tracked greeting send. */
  deliveryIdentity: string | null;
  /** True while a tracked greeting send is inside sendPrompt (bytes may be 0). */
  deliveryInFlight: boolean;
  /**
   * Transport pre-roll facts. Silence bytes warm the Twilio playback path but
   * are NOT greeting evidence — they can never satisfy the success semantic.
   */
  preRollStartedAt: number | null;
  preRollCompletedAt: number | null;
  preRollBytes: number;
  preRollChunkCount: number;
  preRollAborted: boolean;
  /** Terminal flag — once true no watchdog/recovery action may run. */
  resolved: boolean;
}

export function createFirstAudioTracker(): FirstAudioTracker {
  return {
    callSid: '',
    streamSid: '',
    websocketReadyAt: null,
    twilioStartReceivedAt: null,
    greetingAuthorizedAt: null,
    cachedAudioFound: null,
    cachedAudioByteLength: 0,
    firstOutboundMediaAt: null,
    firstOutboundMediaBytes: 0,
    outboundChunkCount: 0,
    outboundByteCount: 0,
    greetingMarkSentAt: null,
    greetingMarkReceivedAt: null,
    timeFromTwilioStartToFirstAudioMs: null,
    fallbackTriggered: false,
    fallbackReason: null,
    stage: '',
    deliveryIdentity: null,
    deliveryInFlight: false,
    preRollStartedAt: null,
    preRollCompletedAt: null,
    preRollBytes: 0,
    preRollChunkCount: 0,
    preRollAborted: false,
    resolved: false,
  };
}

/** Structured per-call fact block — one field per line, Fly-greppable. */
export function emitFirstAudioTrace(t: FirstAudioTracker, log: (line: string) => void = console.log): void {
  log('[AI FIRST AUDIO] =========================================');
  log(`[AI FIRST AUDIO] callSid: ${t.callSid || 'none'}`);
  log(`[AI FIRST AUDIO] streamSid: ${t.streamSid || 'none'}`);
  log(`[AI FIRST AUDIO] websocketReadyAt: ${t.websocketReadyAt ?? 'none'}`);
  log(`[AI FIRST AUDIO] twilioStartReceivedAt: ${t.twilioStartReceivedAt ?? 'none'}`);
  log(`[AI FIRST AUDIO] greetingAuthorizedAt: ${t.greetingAuthorizedAt ?? 'none'}`);
  log(`[AI FIRST AUDIO] cachedAudioFound: ${t.cachedAudioFound ?? 'unknown'}`);
  log(`[AI FIRST AUDIO] cachedAudioByteLength: ${t.cachedAudioByteLength}`);
  log(`[AI FIRST AUDIO] firstOutboundMediaAt: ${t.firstOutboundMediaAt ?? 'none'}`);
  log(`[AI FIRST AUDIO] firstOutboundMediaBytes: ${t.firstOutboundMediaBytes}`);
  log(`[AI FIRST AUDIO] outboundChunkCount: ${t.outboundChunkCount}`);
  log(`[AI FIRST AUDIO] outboundByteCount: ${t.outboundByteCount}`);
  log(`[AI FIRST AUDIO] greetingMarkSentAt: ${t.greetingMarkSentAt ?? 'none'}`);
  log(`[AI FIRST AUDIO] greetingMarkReceivedAt: ${t.greetingMarkReceivedAt ?? 'none'}`);
  log(`[AI FIRST AUDIO] timeFromTwilioStartToFirstAudioMs: ${t.timeFromTwilioStartToFirstAudioMs ?? 'none'}`);
  log(`[AI FIRST AUDIO] fallbackTriggered: ${t.fallbackTriggered}`);
  log(`[AI FIRST AUDIO] fallbackReason: ${t.fallbackReason ?? 'none'}`);
  log(`[AI FIRST AUDIO] preRollStartedAt: ${t.preRollStartedAt ?? 'none'}`);
  log(`[AI FIRST AUDIO] preRollCompletedAt: ${t.preRollCompletedAt ?? 'none'}`);
  log(`[AI FIRST AUDIO] preRollBytes: ${t.preRollBytes}`);
  log(`[AI FIRST AUDIO] preRollChunkCount: ${t.preRollChunkCount}`);
  log(`[AI FIRST AUDIO] preRollAborted: ${t.preRollAborted}`);
  log('[AI FIRST AUDIO] =========================================');
}

/** Transport pre-roll diagnostics — silence warm-up is not greeting speech. */
export function emitFirstAudioPreroll(t: FirstAudioTracker, log: (line: string) => void = console.log): void {
  log('[AI FIRST AUDIO PREROLL] =========================================');
  log(`[AI FIRST AUDIO PREROLL] callSid: ${t.callSid || 'none'}`);
  log(`[AI FIRST AUDIO PREROLL] streamSid: ${t.streamSid || 'none'}`);
  log(`[AI FIRST AUDIO PREROLL] preRollDurationMs: ${
    t.preRollStartedAt !== null && t.preRollCompletedAt !== null
      ? t.preRollCompletedAt - t.preRollStartedAt
      : 'none'}`);
  log(`[AI FIRST AUDIO PREROLL] preRollBytes: ${t.preRollBytes}`);
  log(`[AI FIRST AUDIO PREROLL] preRollChunkCount: ${t.preRollChunkCount}`);
  log(`[AI FIRST AUDIO PREROLL] preRollStartedAt: ${t.preRollStartedAt ?? 'none'}`);
  log(`[AI FIRST AUDIO PREROLL] preRollCompletedAt: ${t.preRollCompletedAt ?? 'none'}`);
  log(`[AI FIRST AUDIO PREROLL] preRollAborted: ${t.preRollAborted}`);
  log(`[AI FIRST AUDIO PREROLL] greetingPayloadStartedAt: ${t.firstOutboundMediaAt ?? 'pending'}`);
  log(`[AI FIRST AUDIO PREROLL] msFromTwilioStartToGreetingPayload: ${t.timeFromTwilioStartToFirstAudioMs ?? 'pending'}`);
  log('[AI FIRST AUDIO PREROLL] =========================================');
}

export function emitFirstAudioSuccess(t: FirstAudioTracker, log: (line: string) => void = console.log): void {
  log('[AI FIRST AUDIO SUCCESS] =========================================');
  log(`[AI FIRST AUDIO SUCCESS] callSid: ${t.callSid || 'none'}`);
  log(`[AI FIRST AUDIO SUCCESS] streamSid: ${t.streamSid || 'none'}`);
  log(`[AI FIRST AUDIO SUCCESS] timeFromTwilioStartToFirstAudioMs: ${t.timeFromTwilioStartToFirstAudioMs ?? 'none'}`);
  log(`[AI FIRST AUDIO SUCCESS] outboundChunkCount: ${t.outboundChunkCount}`);
  log(`[AI FIRST AUDIO SUCCESS] outboundByteCount: ${t.outboundByteCount}`);
  log(`[AI FIRST AUDIO SUCCESS] Timestamp: ${new Date().toISOString()}`);
  log('[AI FIRST AUDIO SUCCESS] =========================================');
}

export interface FirstAudioFailureContext {
  reason: string;
  elapsedMs: number | null;
  websocketState: number | string;
  retryAttempt: number;
  recoveryAction: string;
}

export function emitFirstAudioFailure(
  t: FirstAudioTracker,
  ctx: FirstAudioFailureContext,
  log: (line: string) => void = console.log
): void {
  log('[AI FIRST AUDIO FAILURE] =========================================');
  log(`[AI FIRST AUDIO FAILURE] callSid: ${t.callSid || 'none'}`);
  log(`[AI FIRST AUDIO FAILURE] streamSid: ${t.streamSid || 'none'}`);
  log(`[AI FIRST AUDIO FAILURE] reason: ${ctx.reason}`);
  log(`[AI FIRST AUDIO FAILURE] elapsedMs: ${ctx.elapsedMs ?? 'none'}`);
  log(`[AI FIRST AUDIO FAILURE] cachedAudioFound: ${t.cachedAudioFound ?? 'unknown'}`);
  log(`[AI FIRST AUDIO FAILURE] cachedAudioBytes: ${t.cachedAudioByteLength}`);
  log(`[AI FIRST AUDIO FAILURE] outboundChunkCount: ${t.outboundChunkCount}`);
  log(`[AI FIRST AUDIO FAILURE] outboundByteCount: ${t.outboundByteCount}`);
  log(`[AI FIRST AUDIO FAILURE] websocketState: ${ctx.websocketState}`);
  log(`[AI FIRST AUDIO FAILURE] retryAttempt: ${ctx.retryAttempt}`);
  log(`[AI FIRST AUDIO FAILURE] recoveryAction: ${ctx.recoveryAction}`);
  log(`[AI FIRST AUDIO FAILURE] Timestamp: ${new Date().toISOString()}`);
  log('[AI FIRST AUDIO FAILURE] =========================================');
}

export interface FirstAudioWatchdogDeps {
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Injectable scheduler/cancel (tests substitute fake timers). */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  /** Facts consulted when the watchdog fires — supplied by the wiring layer. */
  getWebsocketState?: () => number | string;
  /** Recovery callbacks supplied by the wiring layer. */
  onRetry: (attempt: number) => void;
  onEmergencyFallback: (reason: string) => void;
  onSuccess?: (tracker: FirstAudioTracker) => void;
  onFailure?: (tracker: FirstAudioTracker, ctx: FirstAudioFailureContext) => void;
  /** Normal-operation budget from Twilio start to first outbound byte. */
  watchdogMs?: number;
  /** Short deferral when a send is in-flight but has produced no bytes yet. */
  inFlightRecheckMs?: number;
  /** Hard bound: number of same-greeting retries before emergency fallback. */
  maxRetryAttempts?: number;
  /** Hard bound: in-flight deferrals before the in-flight send is declared stalled. */
  maxInFlightDeferrals?: number;
}

export const FIRST_AUDIO_WATCHDOG_MS = 2000;
export const FIRST_AUDIO_INFLIGHT_RECHECK_MS = 500;
export const FIRST_AUDIO_MAX_RETRY_ATTEMPTS = 1;
export const FIRST_AUDIO_MAX_INFLIGHT_DEFERRALS = 2;

export class FirstAudioWatchdog {
  readonly tracker: FirstAudioTracker;
  private readonly deps: Required<Omit<FirstAudioWatchdogDeps, 'onSuccess' | 'onFailure'>> &
    Pick<FirstAudioWatchdogDeps, 'onSuccess' | 'onFailure'>;
  private handle: unknown = null;
  private inFlightDeferrals = 0;
  private retryAttempts = 0;
  private closed = false;
  private successEmitted = false;
  /**
   * Monotonic arming generation. Every arm/scheduled callback carries the
   * generation it was created under — a callback from a stale generation (an
   * old arm, an old call, a post-recovery arm) can never act.
   */
  private generation = 0;

  constructor(deps: FirstAudioWatchdogDeps, tracker?: FirstAudioTracker) {
    this.tracker = tracker ?? createFirstAudioTracker();
    this.deps = {
      now: deps.now ?? Date.now,
      schedule: deps.schedule ?? ((fn, ms) => setTimeout(fn, ms)),
      cancel: deps.cancel ?? ((h) => clearTimeout(h as NodeJS.Timeout)),
      getWebsocketState: deps.getWebsocketState ?? (() => 'unknown'),
      onRetry: deps.onRetry,
      onEmergencyFallback: deps.onEmergencyFallback,
      onSuccess: deps.onSuccess,
      onFailure: deps.onFailure,
      watchdogMs: deps.watchdogMs ?? FIRST_AUDIO_WATCHDOG_MS,
      inFlightRecheckMs: deps.inFlightRecheckMs ?? FIRST_AUDIO_INFLIGHT_RECHECK_MS,
      maxRetryAttempts: deps.maxRetryAttempts ?? FIRST_AUDIO_MAX_RETRY_ATTEMPTS,
      maxInFlightDeferrals: deps.maxInFlightDeferrals ?? FIRST_AUDIO_MAX_INFLIGHT_DEFERRALS,
    };
  }

  /** Arm (or re-arm) the watchdog. Safe to call repeatedly. */
  arm(): void {
    if (this.closed || this.tracker.resolved) return;
    this.cancelHandle();
    const gen = ++this.generation;
    this.handle = this.deps.schedule(() => this.fire(gen), this.deps.watchdogMs);
  }

  /**
   * Permanently disarm — call close, greeting resolved, or terminal recovery.
   * After clear() no callback can ever fire for this call.
   */
  clear(): void {
    this.closed = true;
    this.generation++;
    this.cancelHandle();
  }

  private cancelHandle(): void {
    if (this.handle !== null) {
      this.deps.cancel(this.handle);
      this.handle = null;
    }
  }

  /** Record actual outbound media bytes — the only true delivery signal. */
  noteOutboundBytes(byteCount: number): void {
    if (this.tracker.firstOutboundMediaAt === null) {
      this.tracker.firstOutboundMediaAt = this.deps.now();
      this.tracker.firstOutboundMediaBytes = byteCount;
      this.tracker.timeFromTwilioStartToFirstAudioMs = this.tracker.twilioStartReceivedAt !== null
        ? this.tracker.firstOutboundMediaAt - this.tracker.twilioStartReceivedAt
        : null;
      this.resolveSuccess();
    }
    this.tracker.outboundChunkCount++;
    this.tracker.outboundByteCount += byteCount;
  }

  /**
   * Record a transport pre-roll (silence) chunk. Deliberately CANNOT resolve
   * the watchdog — silence is warm-up, not speech. Only noteOutboundBytes
   * (actual greeting payload) satisfies the success semantic.
   */
  notePreRollChunk(byteCount: number): void {
    this.tracker.preRollChunkCount++;
    this.tracker.preRollBytes += byteCount;
  }

  noteDeliveryStarted(): void {
    this.tracker.deliveryInFlight = true;
  }

  noteDeliveryFinished(): void {
    this.tracker.deliveryInFlight = false;
  }

  noteMarkSent(): void {
    if (this.tracker.greetingMarkSentAt === null) {
      this.tracker.greetingMarkSentAt = this.deps.now();
    }
  }

  noteMarkReceived(): void {
    if (this.tracker.greetingMarkReceivedAt === null) {
      this.tracker.greetingMarkReceivedAt = this.deps.now();
    }
  }

  /** First byte observed — greeting proven delivered. Idempotent. */
  private resolveSuccess(): void {
    if (this.successEmitted) return;
    this.successEmitted = true;
    this.tracker.resolved = true;
    this.cancelHandle();
    this.deps.onSuccess?.(this.tracker);
  }

  /** The decision point. Inspects FACTS — never fires blind on a timer. */
  private fire(gen: number): void {
    if (gen !== this.generation || this.closed || this.tracker.resolved) return;

    // Fact 1: greeting audio has begun — nothing to recover.
    if (this.tracker.firstOutboundMediaAt !== null) {
      this.resolveSuccess();
      return;
    }

    // Fact 2: a greeting send is currently inside sendPrompt. It produces its
    // first byte on the first loop iteration, so an in-flight send that still
    // shows zero bytes is either about to deliver or stalled. Defer briefly a
    // bounded number of times rather than stacking a second writer on the
    // socket (which would garble/duplicate greeting audio).
    if (this.tracker.deliveryInFlight && this.inFlightDeferrals < this.deps.maxInFlightDeferrals) {
      this.inFlightDeferrals++;
      this.handle = this.deps.schedule(() => this.fire(this.generation), this.deps.inFlightRecheckMs);
      return;
    }

    const reason = this.tracker.deliveryInFlight
      ? 'greeting_send_in_flight_but_zero_bytes_after_deferrals'
      : 'no_outbound_greeting_bytes_within_watchdog';

    // Fact 3: bounded same-greeting retry — once.
    if (this.retryAttempts < this.deps.maxRetryAttempts) {
      this.retryAttempts++;
      const attempt = this.retryAttempts;
      this.emitFailure(reason, attempt, `cached_greeting_retry_${attempt}`);
      this.deps.onRetry(attempt);
      // Re-arm so the retry's own delivery is verified with byte evidence.
      this.handle = this.deps.schedule(() => this.fire(this.generation), this.deps.watchdogMs);
      return;
    }

    // Fact 4: bounded retries exhausted — independent emergency audible path.
    this.tracker.fallbackTriggered = true;
    this.tracker.fallbackReason = reason;
    this.tracker.resolved = true;
    this.cancelHandle();
    this.emitFailure(reason, this.retryAttempts, 'emergency_audible_fallback');
    this.deps.onEmergencyFallback(reason);
  }

  private emitFailure(reason: string, retryAttempt: number, recoveryAction: string): void {
    const ctx: FirstAudioFailureContext = {
      reason,
      elapsedMs: this.tracker.twilioStartReceivedAt !== null
        ? this.deps.now() - this.tracker.twilioStartReceivedAt
        : null,
      websocketState: this.deps.getWebsocketState(),
      retryAttempt,
      recoveryAction,
    };
    if (this.deps.onFailure) {
      this.deps.onFailure(this.tracker, ctx);
    } else {
      emitFirstAudioFailure(this.tracker, ctx);
    }
  }
}

/**
 * Critical-audio readiness gate for /health — the assets a call cannot be
 * answered without. Distinct from boot-time validation (which exits): this is
 * the *routability* signal, re-evaluated per health request so a degraded
 * instance can never quietly keep serving calls.
 */
export const CRITICAL_FIRST_AUDIO_KEYS = ['ask_name'] as const;

export interface CriticalAudioStatus {
  ok: boolean;
  missingKeys: string[];
  emptyKeys: string[];
  mismatchedChecksumKeys: string[];
}

export function validateCriticalAudio(
  audioMap: Record<string, string>,
  checksums?: Record<string, string>,
  sha256?: (buf: Buffer) => string
): CriticalAudioStatus {
  const missingKeys: string[] = [];
  const emptyKeys: string[] = [];
  const mismatchedChecksumKeys: string[] = [];
  for (const key of CRITICAL_FIRST_AUDIO_KEYS) {
    const b64 = audioMap[key];
    if (!b64) {
      missingKeys.push(key);
      continue;
    }
    const buf = Buffer.from(b64, 'base64');
    if (buf.length === 0) {
      emptyKeys.push(key);
      continue;
    }
    if (checksums && sha256 && checksums[key] && sha256(buf) !== checksums[key]) {
      mismatchedChecksumKeys.push(key);
    }
  }
  return { ok: missingKeys.length === 0 && emptyKeys.length === 0 && mismatchedChecksumKeys.length === 0, missingKeys, emptyKeys, mismatchedChecksumKeys };
}
