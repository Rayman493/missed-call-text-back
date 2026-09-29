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

// ---------------------------------------------------------------------------
// Recurring-instance ids
// ---------------------------------------------------------------------------

/**
 * Google expands a recurring master event into instance ids of the form
 * `<masterId>_<YYYYMMDD>T<HHMMSS>Z` (the instance's original UTC start).
 * Stripping that suffix yields the master event id; non-instance ids pass
 * through unchanged.
 */
const INSTANCE_SUFFIX_RE = /_\d{8}T\d{6}Z$/

export function googleEventMasterId(eventId: string): string {
  return eventId.replace(INSTANCE_SUFFIX_RE, '')
}

/**
 * True when a Google event id refers to the same logical event as a stored
 * google_calendar_event_id — either the exact (standalone/exception) id or
 * any expanded instance of the same recurring master.
 */
export function eventMatchesGoogleId(
  eventId: string,
  storedId: string | null | undefined,
): boolean {
  if (!storedId) return false
  return eventId === storedId || googleEventMasterId(eventId) === storedId
}
