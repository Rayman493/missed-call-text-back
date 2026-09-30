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
 * - Returns the LAST non-blocked capture from a request stage so an explicit
 *   caller correction ("actually it's the shower") always wins over the
 *   original wording — latest accepted value is canonical.
 */
export function extractRawRequestTranscriptFromStageCaptures(stageCaptures: Array<any>): string | null {
  if (!stageCaptures || stageCaptures.length === 0) {
    return null;
  }

  // Stages that capture request/details information
  const requestStages = ['ask_name_reason', 'ask_name_reason_service_only', 'ask_request'];

  // The latest non-blocked request capture is canonical (latest-wins).
  for (let i = stageCaptures.length - 1; i >= 0; i--) {
    const capture = stageCaptures[i];
    if (capture.blocked) {
      continue;
    }
    if (requestStages.includes(capture.stage)) {
      return capture.rawTranscript || null;
    }
  }

  return null;
}