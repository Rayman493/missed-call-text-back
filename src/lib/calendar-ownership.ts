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

  const hasLocalJob = !!linkedJob && linkedJob.google_calendar_event_id === event.id
  const hasLocalMeeting = !!linkedMeeting && linkedMeeting.google_calendar_event_id === event.id
  const hasPrivateMetadata = !!(
    event.extendedProperties?.private?.replyflow_created ||
    event.extendedProperties?.private?.replyflow_lead_id ||
    event.extendedProperties?.private?.replyflow_meeting_url
  )

  return hasLocalJob || hasLocalMeeting || hasPrivateMetadata
}
