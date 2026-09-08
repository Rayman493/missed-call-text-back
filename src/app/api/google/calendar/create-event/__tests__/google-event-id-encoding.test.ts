import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Google Calendar create-event idempotency id encoding', () => {
  const routeContent = readFileSync('src/app/api/google/calendar/create-event/route.ts', 'utf8')
  const helperContent = readFileSync('src/lib/google/calendar-event-id.ts', 'utf8')

  it('imports the canonical event id helper', () => {
    expect(routeContent).toContain("import { toGoogleCalendarEventId } from '@/lib/google/calendar-event-id'")
  })

  it('derives a separate googleEventId from the requestId', () => {
    expect(routeContent).toContain('const googleEventId = toGoogleCalendarEventId(requestId)')
  })

  it('sets eventBody.id to the googleEventId, not the raw requestId', () => {
    expect(routeContent).toContain('id: googleEventId')
    expect(routeContent).not.toMatch(/id:\s*requestId\s*,/)
  })

  it('keeps the original requestId for logs and idempotency correlation', () => {
    expect(routeContent).toContain('requestId, googleEventId, isClientProvided')
    expect(routeContent).toContain('request_id')
  })

  it('fetches the existing event by googleEventId on 409 recovery', () => {
    expect(routeContent).toContain(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}?conferenceDataVersion=1'
    )
  })

  it('leaves Google Meet conference request id separate from the event resource id', () => {
    expect(routeContent).toContain('conferenceRequestId')
    expect(routeContent).toContain('conferenceData: {')
    expect(routeContent).toContain("requestId: conferenceRequestId")
  })

  it('preserves the existing timed-event timezone payload format', () => {
    expect(routeContent).toContain("dateTime: startDateTimeStr,")
    expect(routeContent).toContain("timeZone: businessTimezone")
    expect(routeContent).toContain("dateTime: endDateTimeStr,")
  })

  it('describes the Google base32hex id requirements in the helper', () => {
    expect(helperContent).toContain('base32hex')
    expect(helperContent).toContain('0-9a-v')
    expect(helperContent).toContain('5-1024')
  })

  it('helper lowercases and removes forbidden characters', () => {
    expect(helperContent).toContain('.toLowerCase()')
    expect(helperContent).toContain('.replace(/[^0-9a-v]/g,')
  })
})
