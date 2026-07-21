import { describe, it, expect } from 'vitest'
import { hasMeetScope } from '../src/lib/google/capability'

describe('Google Meet capability scope parsing', () => {
  it('calendar-only scope -> no meet capability', () => {
    expect(hasMeetScope('https://www.googleapis.com/auth/calendar.events')).toBe(false)
  })

  it('calendar + meetings.space.readonly (space delimited) -> has meet capability', () => {
    const scope = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/meetings.space.readonly'
    expect(hasMeetScope(scope)).toBe(true)
  })

  it('ignores extra whitespace and duplicates', () => {
    const scope = '  https://www.googleapis.com/auth/calendar.events   https://www.googleapis.com/auth/meetings.space.readonly  https://www.googleapis.com/auth/meetings.space.readonly  '
    expect(hasMeetScope(scope)).toBe(true)
  })

  it('null/empty scope -> no meet capability', () => {
    expect(hasMeetScope(null)).toBe(false)
    expect(hasMeetScope('')).toBe(false)
  })
})
