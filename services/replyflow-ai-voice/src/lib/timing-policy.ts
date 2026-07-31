/**
 * Centralized conversational turn timing policy.
 *
 * This file is the single source of truth for:
 * - server_vad silence_duration_ms per intake stage
 * - post-acceptance settle window duration per stage
 * - which stages use an intrinsic settle window
 *
 * Rationale for the current values:
 *
 * ask_name:
 *   - silence: 700ms  (name answers are short; 1800ms made the
 *                      assistant feel slow to respond)
 *   - settle: 300ms   (just enough for a natural beat; prevents
 *                      rushing while still allowing continuation)
 *
 * ask_request:
 *   - silence: 1400ms (unchanged; allows natural multi-sentence
 *                      service descriptions without false finalization)
 *   - settle: 700ms   (shorter than the previous 1500ms; callers
 *                      usually provide the request in one turn)
 *
 * ask_name_reason:
 *   - silence: 900ms  (combined prompt, but still short)
 *   - settle: 1200ms  (callers may pause between name and reason)
 *
 * ask_location / ask_timing / ask_completion_time / ask_callback_time:
 *   - silence: 1800ms (unchanged; these answers are longer or more
 *                      naturally paused)
 *   - settle: 1000ms  (continuation only; modest pause tolerance)
 *
 * complete:
 *   - silence: 1800ms
 *   - settle: 0ms     (no continuation expected after closing)
 */

export const STAGE_SILENCE_MS: Record<string, number> = {
  ask_name: 700,
  ask_request: 1400,
  ask_name_reason: 900,
  ask_name_reason_service_only: 900,
  ask_name_reason_name_only: 900,
  ask_location: 1800,
  ask_location_or_context: 1800,
  ask_timing: 1800,
  ask_completion_time: 1800,
  ask_callback_time: 1800,
  complete: 1800,
};

export const STAGE_SETTLE_MS: Record<string, number> = {
  ask_name: 300,
  ask_request: 700,
  ask_name_reason: 1200,
  ask_name_reason_service_only: 900,
  ask_name_reason_name_only: 900,
  ask_location: 1000,
  ask_location_or_context: 1000,
  ask_timing: 1000,
  ask_completion_time: 1000,
  ask_callback_time: 1000,
  complete: 0,
};

export const STAGES_WITH_INTRINSIC_SETTLE_WINDOW: string[] = [
  'ask_name',
  'ask_request',
  'ask_name_reason',
  'ask_name_reason_service_only',
  'ask_name_reason_name_only',
];

export function getStageSilenceMs(stage: string): number {
  return STAGE_SILENCE_MS[stage] ?? 1800;
}

export function getSettleWindowMs(stage: string): number {
  return STAGE_SETTLE_MS[stage] ?? 700;
}

export function requiresSettleWindow(stage: string): boolean {
  return STAGES_WITH_INTRINSIC_SETTLE_WINDOW.includes(stage);
}
