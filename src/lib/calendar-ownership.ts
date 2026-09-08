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
 * 3. ReplyFlow private metadata embedded in the event by Google Calendar
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
    event.extendedProperties?.private?.replyflow_lead_id ||
    event.extendedProperties?.private?.replyflow_meeting_url
  )

  return hasLocalJob || hasLocalMeeting || hasPrivateMetadata
}
