/**
 * Pure Twilio error normalization helpers.
 *
 * Twilio REST errors carry a NUMERIC `code` (e.g. 21705) and non-Error
 * shapes can surface with `code`/`message` fields of any type. Classifier
 * code must never assume these fields are strings — calling
 * `.toLowerCase()` on a numeric code throws a TypeError that escapes the
 * error handler and misclassifies the original failure.
 */

/** Safely normalize an arbitrary error field to a lowercase string. */
export function normalizeErrorField(value: unknown): string {
  if (value == null) return '';
  return (typeof value === 'string' ? value : String(value)).toLowerCase();
}

/**
 * Check if an error is transient and should be retried.
 * Safe against any thrown value — never throws itself.
 */
export function isTransientError(error: any): boolean {
  if (!error) return false;

  const errorMessage = normalizeErrorField(error.message);
  const errorCode = normalizeErrorField(error.code);

  // Network-related transient errors
  if (errorMessage.includes('fetch failed')) return true;
  if (errorMessage.includes('und_err_socket')) return true;
  if (errorMessage.includes('econnreset')) return true;
  if (errorMessage.includes('connection reset')) return true;
  if (errorMessage.includes('connection closed')) return true;
  if (errorMessage.includes('timeout')) return true;
  if (errorMessage.includes('etimedout')) return true;
  if (errorMessage.includes('enotfound')) return true;
  if (errorMessage.includes('econnrefused')) return true;
  if (errorMessage.includes('network')) return true;

  // Specific error codes — 5xx server errors only. Twilio REST codes are
  // 5-digit numerics (e.g. 21705); a bare digit check would false-positive.
  if (errorCode === '5xx') return true;
  if (/^5\d{2}$/.test(errorCode)) return true; // 500–599, incl. 502/503/504

  return false;
}
