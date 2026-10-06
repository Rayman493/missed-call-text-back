/**
 * Spoken street-number normalization — deterministic and conservative.
 *
 * Speech transcription renders spoken digit sequences inconsistently:
 * "sixty-five ten Johnson Road" arrives as "65 1-0 Johnson Road" or
 * "65 1 0 Johnson Road" and persists verbatim into serviceAddress, which then
 * surfaces in Customer Context, the final SMS, and ai_call_records.
 *
 * Rule: collapse a leading street-number run ONLY when every continuation
 * token is a single digit (optionally hyphen-joined single digits like "1-0")
 * AND the following text contains a recognizable street suffix. Anything
 * ambiguous — legitimately hyphenated numbers ("65-10 Queens Blvd"), multi-digit
 * continuation tokens, units, ZIPs, no street suffix — is preserved verbatim.
 */

const STREET_SUFFIXES = new Set([
  'street', 'st', 'road', 'rd', 'avenue', 'ave', 'av', 'boulevard', 'blvd',
  'drive', 'dr', 'lane', 'ln', 'court', 'ct', 'place', 'pl', 'way',
  'circle', 'cir', 'terrace', 'ter', 'highway', 'hwy', 'parkway', 'pkwy',
  'trail', 'trl', 'run', 'crossing', 'xing', 'pike', 'square', 'sq',
  'alley', 'aly', 'loop', 'path', 'row', 'walk', 'point', 'pt', 'plaza',
  'plz', 'center', 'ctr', 'commons', 'heights', 'hts', 'manor', 'estate',
  'estates', 'est', 'ridge', 'rdg', 'view', 'vw', 'hill', 'hollow', 'holw',
  'cove', 'cv', 'bay', 'bend', 'creek', 'crk', 'fork', 'frk', 'grove', 'grv',
  'dale', 'glen', 'landing', 'lndg', 'oaks', 'orchard', 'orch', 'pass',
  'plains', 'pln', 'port', 'prt', 'shore', 'spring', 'spg', 'station', 'sta',
  'summit', 'smt', 'valley', 'vly', 'vista', 'vis', 'wood', 'woods', 'circle',
]);

export interface AddressNormalizationResult {
  value: string;
  normalized: boolean;
  reason: string;
}

export function normalizeSpokenStreetNumber(input: string | null | undefined): AddressNormalizationResult {
  const original = (input ?? '').trim();
  const unchanged = (reason: string): AddressNormalizationResult => ({ value: original, normalized: false, reason });
  if (!original) return unchanged('empty');

  // First token must be plain digits — a leading hyphenated token like
  // "65-10" is a legitimately formatted street number and stays as-is.
  // Continuation tokens must each be single digits, optionally hyphen-joined
  // ("1-0" → "10"); a multi-digit continuation ("65 10") is ambiguous and is
  // intentionally NOT collapsed.
  // The separator before the remainder is mandatory — "500 5th Avenue" must
  // not consume the "5" out of "5th" (ordinal street names stay untouched).
  const match = original.match(/^(\d+)((?:\s+\d(?:-\d)*)+)[\s,]+([A-Za-z][\s\S]*)$/i);
  if (!match) return unchanged('no_spaced_digit_run');

  const [, firstDigits, continuationRaw, remainder] = match;
  const continuationDigits = continuationRaw.replace(/[\s-]/g, '');
  const collapsed = firstDigits + continuationDigits;

  // Confidence gate: the text after the digit run must contain a recognizable
  // street suffix — otherwise the leading digits may not be a street number.
  const remainderTokens = remainder.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const hasSuffix = remainderTokens.some(tok => STREET_SUFFIXES.has(tok.replace(/[^a-z]/g, '')));
  if (!hasSuffix) return unchanged('no_street_suffix_ambiguous');

  // US street numbers are at most 6 digits; a longer collapsed run is suspect.
  if (collapsed.length > 6) return unchanged('collapsed_number_too_long');

  return { value: `${collapsed} ${remainder}`, normalized: true, reason: 'collapsed_spoken_digit_run' };
}

/** Single concise diagnostic — emitted only when normalization actually changed the value. */
export function emitAddressNormalizationLog(
  raw: string,
  result: AddressNormalizationResult,
  callSid?: string | null
): void {
  if (!result.normalized) return;
  console.log('[ADDRESS NORMALIZATION] =========================================');
  console.log('[ADDRESS NORMALIZATION] raw:', raw);
  console.log('[ADDRESS NORMALIZATION] normalized:', result.value);
  console.log('[ADDRESS NORMALIZATION] reason:', result.reason);
  console.log('[ADDRESS NORMALIZATION] callSid:', callSid || 'none');
  console.log('[ADDRESS NORMALIZATION] =========================================');
}
