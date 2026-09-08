/**
 * Convert an internal ReplyFlow request id into a valid Google Calendar event
 * resource id.
 *
 * Google Calendar event ids must use base32hex characters (lowercase a-v and
 * digits 0-9) and be between 5 and 1024 characters long. See:
 * https://developers.google.com/calendar/api/v3/reference/events/insert
 *
 * ReplyFlow request ids are RFC 4122 UUIDs (hex digits and hyphens), so
 * lowercasing and removing the hyphen separators is sufficient for the common
 * case. Any other characters outside the base32hex alphabet are also removed
 * so the helper is defensive against unexpected request id shapes.
 *
 * The original requestId is never mutated.
 */
export function toGoogleCalendarEventId(requestId: string): string {
  if (!requestId || typeof requestId !== 'string') {
    throw new Error('requestId is required to derive a Google Calendar event id')
  }

  const sanitized = requestId.toLowerCase().replace(/[^0-9a-v]/g, '')

  if (sanitized.length < 5 || sanitized.length > 1024) {
    throw new Error(
      `Derived Google Calendar event id length ${sanitized.length} is outside the allowed 5-1024 range`
    )
  }

  return sanitized
}
