import { describe, it, expect } from 'vitest'
import { getOutOfOfficeState, isBusinessOutOfOffice } from '@/lib/out-of-office'

function businessFor(start: string, end: string, enabled = true, timezone = 'America/New_York') {
  return {
    name: 'Test Business',
    business_hours_timezone: timezone,
    out_of_office_enabled: enabled,
    out_of_office_start: start,
    out_of_office_end: end
  }
}

describe('getOutOfOfficeState', () => {
  it('returns off when disabled', () => {
    const state = getOutOfOfficeState(businessFor('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', false))
    expect(state).toBe('off')
  })

  it('returns scheduled before the start', () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const end = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    expect(getOutOfOfficeState(businessFor(start, end))).toBe('scheduled')
  })

  it('returns active inside the window', () => {
    const start = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const end = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(getOutOfOfficeState(businessFor(start, end))).toBe('active')
  })

  it('returns ended after the end', () => {
    const start = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const end = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(getOutOfOfficeState(businessFor(start, end))).toBe('ended')
  })

  it('returns off for invalid dates', () => {
    expect(getOutOfOfficeState(businessFor('not-a-date', '2026-01-02T00:00:00Z'))).toBe('off')
  })

  it('returns off for an inverted window', () => {
    const now = Date.now()
    const start = new Date(now + 60 * 60 * 1000).toISOString()
    const end = new Date(now - 60 * 60 * 1000).toISOString()
    expect(getOutOfOfficeState(businessFor(start, end))).toBe('off')
  })
})

describe('isBusinessOutOfOffice', () => {
  it('is true only when state is active', () => {
    const activeStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const activeEnd = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isBusinessOutOfOffice(businessFor(activeStart, activeEnd))).toBe(true)

    const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const futureEnd = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    expect(isBusinessOutOfOffice(businessFor(futureStart, futureEnd))).toBe(false)

    const pastStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const pastEnd = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    expect(isBusinessOutOfOffice(businessFor(pastStart, pastEnd))).toBe(false)
  })
})
