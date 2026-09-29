import { eventMatchesGoogleId } from '@/lib/google/calendar-event-id'

/**
 * Calendar ownership helpers.
 *
 * Ownership of a Google Calendar event is determined from durable ReplyFlow
 * evidence, not from brittle title/description heuristics or the fact that it
 * arrived through the Google API.
 */

export interface CalendarOwnershipContext {
  /** A local job record linked to this Google Calendar event id. */
  linkedJob?: { id?: string; google_calendar_event_id?: string | null } | null
  /** A local meeting/appointment record linked to this Google Calendar event id. */
  linkedMeeting?: { id?: string; google_calendar_event_id?: string | null } | null
}

export interface CalendarEventLike {
  id: string
  extendedProperties?: {
    private?: {
      replyflow_lead_id?: string | null
      replyflow_meeting_url?: string | null
      replyflow_created?: string | null
      [key: string]: any
    } | null
  } | null
  [key: string]: any
}

/**
 * Returns true when the event is ReplyFlow-owned based on local evidence.
 *
 * Evidence order (any is sufficient):
 * 1. A local job record with the same google_calendar_event_id
 * 2. A local meeting record with the same google_calendar_event_id
 * 3. ReplyFlow private metadata embedded in the event by Google Calendar:
 *    - replyflow_created (always set by ReplyFlow create-event route)
 *    - replyflow_lead_id (set when appointment is linked to a customer/lead)
 *    - replyflow_meeting_url (set when a custom meeting URL is provided)
 *
 * The replyflow_created flag is critical: it distinguishes ReplyFlow-created
 * events (which may have Google Meet hangoutLinks but no lead_id) from
 * external Google Calendar events that happen to have hangoutLinks (e.g.,
 * sports subscriptions, other apps' video calls). Without this flag, an
 * external event with a hangoutLink would be indistinguishable from a
 * ReplyFlow-created Google Meet appointment without customer linkage.
 */
export function isReplyFlowOwnedEvent(
  event: CalendarEventLike | null | undefined,
  context?: CalendarOwnershipContext | null
): boolean {
  if (!event) return false

  const linkedJob = context?.linkedJob
  const linkedMeeting = context?.linkedMeeting

  const hasLocalJob = !!linkedJob && !!event.id && eventMatchesGoogleId(event.id, linkedJob.google_calendar_event_id)
  const hasLocalMeeting = !!linkedMeeting && linkedMeeting.google_calendar_event_id === event.id
  const hasPrivateMetadata = !!(
    event.extendedProperties?.private?.replyflow_created ||
    event.extendedProperties?.private?.replyflow_lead_id ||
    event.extendedProperties?.private?.replyflow_meeting_url
  )

  return hasLocalJob || hasLocalMeeting || hasPrivateMetadata
}

// ---------------------------------------------------------------------------
// Job ↔ Google event linkage (recurrence-aware)
// ---------------------------------------------------------------------------

/** Local day key (YYYY-MM-DD) of a Google event's own wall-clock start. */
export function calendarEventDayKey(
  event: { start?: { dateTime?: string | null; date?: string | null } | null } | null | undefined,
): string | null {
  const raw = event?.start?.dateTime || event?.start?.date
  return raw ? String(raw).slice(0, 10) : null
}

/**
 * Find the job linked to a Google calendar event.
 *
 * Handles recurring masters: Google-expanded instance ids end in
 * `_YYYYMMDDTHHMMSSZ`, so a bare `===` never matches the stored master id.
 * The match is occurrence-precise when possible — a job whose own
 * occurrence/scheduled date equals the event's local day wins — so a
 * recurring instance links to THAT occurrence (virtual or materialized),
 * falling back to the real anchor row.
 */
export function findJobForCalendarEvent<
  T extends {
    google_calendar_event_id?: string | null
    scheduled_date?: string | null
    occurrence_date?: string | null
    virtual?: boolean
  },
>(jobs: T[], event: { id?: string | null; start?: { dateTime?: string | null; date?: string | null } | null } | null | undefined): T | null {
  if (!event?.id) return null
  const dayKey = calendarEventDayKey(event)
  const matches = jobs.filter(j => eventMatchesGoogleId(event.id!, j.google_calendar_event_id))
  return (
    matches.find(j => (j.occurrence_date || j.scheduled_date) === dayKey) ??
    matches.find(j => !j.virtual) ??
    matches[0] ??
    null
  )
}
