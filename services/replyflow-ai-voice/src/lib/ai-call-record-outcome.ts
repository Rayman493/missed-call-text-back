/**
 * Canonical allowed values for ai_call_records.outcome.
 * This must stay in sync with the database check constraint
 * ai_call_records_outcome_check.
 *
 * The application domain (outcome-classifier, AICallRecord UI types)
 * uses completed_intake, partial_intake, early_hangup, no_speech,
 * and ai_connection_failed in addition to the legacy completed,
 * caller_hung_up, ai_failed, voicemail_fallback, and incomplete values.
 */

export const ALLOWED_AI_CALL_RECORD_OUTCOMES = [
  'completed',
  'completed_intake',
  'caller_hung_up',
  'ai_failed',
  'voicemail_fallback',
  'incomplete',
  'partial_intake',
  'early_hangup',
  'no_speech',
  'ai_connection_failed',
] as const;

export type AiCallRecordOutcome = typeof ALLOWED_AI_CALL_RECORD_OUTCOMES[number];

export function isValidAiCallRecordOutcome(value: unknown): value is AiCallRecordOutcome {
  return typeof value === 'string' && (ALLOWED_AI_CALL_RECORD_OUTCOMES as readonly string[]).includes(value);
}
