/**
 * ============================================================
 * DEVELOPER-ONLY FALLBACK TEST SWITCHES (AI Voice Service)
 * ============================================================
 *
 * These switches exist SOLELY for QA testing of the fallback chain.
 * ALL SWITCHES DEFAULT TO false.
 *
 * RULES:
 *   - DO NOT commit with any switch set to true.
 *   - DO NOT use on customer calls.
 *   - RESET ALL TO false immediately after testing and redeploy Fly.io.
 *   - Every activation emits a loud [TEST FALLBACK] log.
 *
 * SWITCH DESCRIPTIONS:
 *   forceAiFailure        — Immediately trigger voicemail fallback on every call.
 *   forceVoicemailFailure — (Read by Next.js routes, not this service directly.)
 *   forceFinalSmsFallback — (Read by Next.js routes, not this service directly.)
 *
 * ⚠️  If you see [TEST FALLBACK] in Fly.io logs unexpectedly, reset and redeploy immediately.
 * ============================================================
 */

export const testFallbacks = {
  forceAiFailure: false,
  forceVoicemailFailure: false,
  forceFinalSmsFallback: false,
} as const;

export function warnIfTestFallbacksActive(): void {
  const active = Object.entries(testFallbacks).filter(([, v]) => v);
  if (active.length > 0) {
    const names = active.map(([k]) => k).join(', ');
    console.warn('[TEST FALLBACK] ⚠️  WARNING: TEST FALLBACK SWITCHES ACTIVE — NOT FOR PRODUCTION USE');
    console.warn('[TEST FALLBACK] Active switches:', names);
    console.warn('[TEST FALLBACK] Reset all switches to false in services/replyflow-ai-voice/src/test-fallbacks.ts and redeploy Fly.io.');
  }
}
