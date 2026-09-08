import { describe, it, expect } from 'vitest'
import { toGoogleCalendarEventId } from './calendar-event-id'

describe('toGoogleCalendarEventId', () => {
  it('converts the physical UUID by removing hyphens and lowercasing', () => {
    const requestId = 'fe63e6ed-9d0c-46c3-adec-1e1f50ea3980'
    const googleEventId = toGoogleCalendarEventId(requestId)

    expect(googleEventId).toBe('fe63e6ed9d0c46c3adec1e1f50ea3980')
    expect(googleEventId).not.toContain('-')
    expect(googleEventId).toMatch(/^[0-9a-v]+$/)
    expect(googleEventId.length).toBeGreaterThanOrEqual(5)
    expect(googleEventId.length).toBeLessThanOrEqual(1024)
  })

  it('is deterministic: the same request id maps to the same Google event id', () => {
    const requestId = 'fe63e6ed-9d0c-46c3-adec-1e1f50ea3980'
    expect(toGoogleCalendarEventId(requestId)).toBe(toGoogleCalendarEventId(requestId))
  })

  it('produces different Google event ids for different request ids', () => {
    const a = toGoogleCalendarEventId('fe63e6ed-9d0c-46c3-adec-1e1f50ea3980')
    const b = toGoogleCalendarEventId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    expect(a).not.toBe(b)
  })

  it('does not mutate the original request id', () => {
    const requestId = 'FE63E6ED-9D0C-46C3-ADEC-1E1F50EA3980'
    const original = requestId
    toGoogleCalendarEventId(requestId)
    expect(requestId).toBe(original)
  })

  it('throws for a missing request id', () => {
    expect(() => toGoogleCalendarEventId('')).toThrow('requestId is required')
    expect(() => toGoogleCalendarEventId(undefined as any)).toThrow('requestId is required')
  })

  it('rejects a derived id that is too short', () => {
    expect(() => toGoogleCalendarEventId('abcd')).toThrow('outside the allowed 5-1024 range')
  })
})
