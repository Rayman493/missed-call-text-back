/**
 * Request-stage raw transcript selection
 * Extracts the accepted raw request/details transcript from stageCaptures for semantic extraction
 */

/**
 * Extract the raw transcript for the request/details turn from stageCaptures
 * This preserves the full caller utterance for semantic extraction of additional details
 *
 * Selection rules:
 * - Only considers captures from request stages: ask_name_reason, ask_name_reason_service_only, ask_request
 * - Skips blocked captures (blocked captures are stale/overwritten)
 * - Returns the first non-blocked capture from a request stage
 *
 * Note: This assumes that the first non-blocked request capture represents the canonical accepted answer.
 * If request field corrections can overwrite the canonical value later, this may need adjustment.
 */
export function extractRawRequestTranscriptFromStageCaptures(stageCaptures: Array<any>): string | null {
  if (!stageCaptures || stageCaptures.length === 0) {
    return null;
  }

  // Stages that capture request/details information
  const requestStages = ['ask_name_reason', 'ask_name_reason_service_only', 'ask_request'];

  // Find the first non-blocked capture from a request stage
  for (const capture of stageCaptures) {
    if (capture.blocked) {
      continue;
    }
    if (requestStages.includes(capture.stage)) {
      // Return the raw transcript for this stage
      return capture.rawTranscript || null;
    }
  }

  return null;
}