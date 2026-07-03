/**
 * ============================================================
 * DEVELOPER-ONLY FALLBACK TEST SWITCHES
 * ============================================================
 *
 * These switches exist SOLELY for QA testing of the fallback chain:
 *   1. AI intake
 *   2. Voicemail fallback
 *   3. Final structured SMS fallback
 *
 * ALL SWITCHES DEFAULT TO false.
 *
 * RULES:
 *   - DO NOT commit these with any switch set to true.
 *   - DO NOT expose these in the UI, database, or environment variables.
 *   - DO NOT use these on customer calls.
 *   - RESET ALL SWITCHES TO false immediately after testing.
 *   - Every activation is logged with a loud [TEST FALLBACK] prefix
 *     so it is obvious in production logs if someone forgets to reset.
 *
 * HOW TO USE:
 *   1. Set the desired switch to true in this file.
 *   2. Deploy to your test environment (or Fly.io if that is your only env).
 *   3. Make a test call.
 *   4. Observe logs for [TEST FALLBACK] markers.
 *   5. IMMEDIATELY set the switch back to false and redeploy.
 *
 * SWITCH DESCRIPTIONS:
 *   forceAiFailure        — Skip/fail AI intake and fall through to voicemail.
 *   forceVoicemailFailure — Skip/fail voicemail transcription and fall through to final SMS.
 *   forceFinalSmsFallback — Directly validate the final structured SMS fallback layer.
 *
 * ⚠️  WARNING: If any switch is true, every activated code path will emit a
 *     loud [TEST FALLBACK] log line. If you see these in production unexpectedly,
 *     reset this file immediately and redeploy.
 * ============================================================
 */

export const testFallbacks = {
  /**
   * When true: AI intake is immediately failed/skipped on every incoming call.
   * The call falls through to voicemail as if the AI service was unreachable.
   * Reset to false after testing.
   */
  forceAiFailure: false,

  /**
   * When true: Voicemail transcription/extraction is skipped entirely.
   * The recording-status callback will behave as if no usable transcript was produced,
   * triggering the final structured SMS fallback.
   * Reset to false after testing.
   */
  forceVoicemailFailure: false,

  /**
   * When true: The final structured SMS fallback fires directly without waiting
   * for AI or voicemail paths to fail naturally.
   * Useful for verifying the SMS body, Out-of-Office notice placement, and STOP wording.
   * Reset to false after testing.
   */
  forceFinalSmsFallback: false,
} as const;

/**
 * Log a loud warning if any test switch is active.
 * Call this at startup or at the start of request handlers.
 */
export function warnIfTestFallbacksActive(): void {
  const active = Object.entries(testFallbacks).filter(([, v]) => v);
  if (active.length > 0) {
    const names = active.map(([k]) => k).join(', ');
    console.warn('[TEST FALLBACK] ⚠️  WARNING: TEST FALLBACK SWITCHES ACTIVE — NOT FOR PRODUCTION USE');
    console.warn('[TEST FALLBACK] Active switches:', names);
    console.warn('[TEST FALLBACK] Reset all switches to false in src/lib/testing/test-fallbacks.ts after testing.');
  }
}
