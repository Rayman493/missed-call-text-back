import { describe, it, expect } from 'vitest'
import { isReplyFlowOwnedEvent } from '@/lib/calendar-ownership'

describe('isReplyFlowOwnedEvent', () => {
  it('returns true when a local job is linked by google_calendar_event_id', () => {
    const event = { id: 'evt-1', summary: 'Job' }
    const linkedJob = { id: 'job-1', google_calendar_event_id: 'evt-1' }
    expect(isReplyFlowOwnedEvent(event, { linkedJob })).toBe(true)
  })

  it('returns true when a local meeting record is linked by google_calendar_event_id', () => {
    const event = { id: 'evt-2', summary: 'Appointment' }
    const linkedMeeting = { id: 'mr-1', google_calendar_event_id: 'evt-2' }
    expect(isReplyFlowOwnedEvent(event, { linkedMeeting })).toBe(true)
  })

  it('returns true when ReplyFlow private metadata is present (replyflow_lead_id)', () => {
    const event = {
      id: 'evt-3',
      extendedProperties: { private: { replyflow_lead_id: 'lead-1' } }
    }
    expect(isReplyFlowOwnedEvent(event)).toBe(true)
  })

  it('returns true when replyflow_created flag is set (no lead_id, no meeting_url)', () => {
    // This is the critical case: a ReplyFlow-created Google Meet appointment
    // without customer linkage. The replyflow_created flag is the only
    // durable evidence that ReplyFlow created this event.
    const event = {
      id: 'evt-rf-meet',
      extendedProperties: { private: { replyflow_created: 'true' } }
    }
    expect(isReplyFlowOwnedEvent(event)).toBe(true)
  })

  it('returns true when replyflow_created flag is set alongside lead_id', () => {
    const event = {
      id: 'evt-rf-lead',
      extendedProperties: { private: { replyflow_created: 'true', replyflow_lead_id: 'lead-1' } }
    }
    expect(isReplyFlowOwnedEvent(event)).toBe(true)
  })

  it('returns true when replyflow_meeting_url is set (custom meeting URL)', () => {
    const event = {
      id: 'evt-rf-custom',
      extendedProperties: { private: { replyflow_created: 'true', replyflow_meeting_url: 'https://zoom.us/j/123' } }
    }
    expect(isReplyFlowOwnedEvent(event)).toBe(true)
  })

  it('returns false for an external event with no local evidence or metadata', () => {
    const event = { id: 'evt-4', summary: 'External Dentist' }
    expect(isReplyFlowOwnedEvent(event)).toBe(false)
  })

  it('returns false for an external event with a hangoutLink but no ReplyFlow metadata', () => {
    // This is the "Steelers vs Falcons" case: an external Google Calendar
    // event (e.g., sports subscription) that has a hangoutLink (streaming
    // link) but NO replyflow_created flag. The meetingUrl is derived from
    // hangoutLink at listing time, but the event is NOT ReplyFlow-owned.
    const event = {
      id: 'evt-external-meet',
      summary: 'Steelers vs Falcons',
      hangoutLink: 'https://meet.google.com/abc-defg-hij',
      extendedProperties: null,
    }
    expect(isReplyFlowOwnedEvent(event)).toBe(false)
  })

  it('returns false for an external event with empty extendedProperties.private', () => {
    // Google may preserve an empty extendedProperties.private object from
    // other apps. Without replyflow_created, replyflow_lead_id, or
    // replyflow_meeting_url, this is NOT ReplyFlow-owned.
    const event = {
      id: 'evt-external-empty',
      extendedProperties: { private: {} },
    }
    expect(isReplyFlowOwnedEvent(event)).toBe(false)
  })

  it('returns false when the linked job belongs to a different event id', () => {
    const event = { id: 'evt-5' }
    const linkedJob = { id: 'job-2', google_calendar_event_id: 'other-evt' }
    expect(isReplyFlowOwnedEvent(event, { linkedJob })).toBe(false)
  })

  it('returns false for null/undefined event', () => {
    expect(isReplyFlowOwnedEvent(null)).toBe(false)
    expect(isReplyFlowOwnedEvent(undefined)).toBe(false)
  })
})
