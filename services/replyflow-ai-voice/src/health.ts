/**
 * Health endpoint payload. The commit identity is the authoritative
 * BUILD_COMMIT_SHA injected at Docker build time — never a stale hardcoded
 * literal. Missing metadata degrades to "unknown" without failing health.
 *
 * Readiness invariant: an instance that cannot play its initial greeting or
 * emergency fallback audio must never advertise healthy — a connected caller
 * would hear silence. The critical-asset check is re-evaluated per request.
 */
import { createHash } from 'crypto';
import { cachedPromptAudio, cachedAudioChecksums } from './cached-audio';
import { validateCriticalAudio } from './first-audio-watchdog';

export function buildHealthPayload() {
  const criticalAudio = validateCriticalAudio(
    cachedPromptAudio as unknown as Record<string, string>,
    cachedAudioChecksums as unknown as Record<string, string>,
    (buf) => createHash('sha256').update(buf).digest('hex')
  );

  return {
    status: criticalAudio.ok ? 'healthy' : 'unhealthy',
    service: 'ai-voice-poc',
    commit: process.env.BUILD_COMMIT_SHA || 'unknown',
    hangupRouter: 'v3',
    criticalAudioReady: criticalAudio.ok,
    ...(criticalAudio.ok ? {} : { criticalAudio }),
  };
}

/**
 * HTTP status for /health — Fly/edge checks only route to instances that can
 * actually answer a call audibly.
 */
export function healthHttpStatus(): number {
  return buildHealthPayload().criticalAudioReady ? 200 : 503;
}
