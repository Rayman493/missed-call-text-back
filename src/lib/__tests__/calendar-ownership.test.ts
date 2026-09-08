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

  it('returns true when ReplyFlow private metadata is present', () => {
    const event = {
      id: 'evt-3',
      extendedProperties: { private: { replyflow_lead_id: 'lead-1' } }
    }
    expect(isReplyFlowOwnedEvent(event)).toBe(true)
  })

  it('returns false for an external event with no local evidence or metadata', () => {
    const event = { id: 'evt-4', summary: 'External Dentist' }
    expect(isReplyFlowOwnedEvent(event)).toBe(false)
  })

  it('returns false when the linked job belongs to a different event id', () => {
    const event = { id: 'evt-5' }
    const linkedJob = { id: 'job-2', google_calendar_event_id: 'other-evt' }
    expect(isReplyFlowOwnedEvent(event, { linkedJob })).toBe(false)
  })
})
