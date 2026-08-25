import { describe, it, expect } from 'vitest'
import { getNextAction } from '../lead-next-action'

describe('getNextAction', () => {
  it('returns "Reply now" with high urgency for new status', () => {
    const lead = { status: 'new' }
    expect(getNextAction(lead)).toEqual({ text: 'Reply now', urgency: 'high' })
  })

  it('returns "Reply now" with high urgency for needs_reply status', () => {
    const lead = { status: 'needs_reply' }
    expect(getNextAction(lead)).toEqual({ text: 'Reply now', urgency: 'high' })
  })

  it('returns "Upcoming job" with low urgency for scheduled status', () => {
    const lead = { status: 'scheduled' }
    expect(getNextAction(lead)).toEqual({ text: 'Upcoming job', urgency: 'low' })
  })

  it('returns "Awaiting payment" with medium urgency for payment_requested status', () => {
    const lead = { status: 'payment_requested' }
    expect(getNextAction(lead)).toEqual({ text: 'Awaiting payment', urgency: 'medium' })
  })

  it('returns "Request review" with low urgency for completed status', () => {
    const lead = { status: 'completed' }
    expect(getNextAction(lead)).toEqual({ text: 'Request review', urgency: 'low' })
  })

  it('returns null for active status (not in V1 scope)', () => {
    const lead = { status: 'active' }
    expect(getNextAction(lead)).toBeNull()
  })

  it('returns null for paid status (not in V1 scope)', () => {
    const lead = { status: 'paid' }
    expect(getNextAction(lead)).toBeNull()
  })

  it('returns null for cancelled status (not in V1 scope)', () => {
    const lead = { status: 'cancelled' }
    expect(getNextAction(lead)).toBeNull()
  })

  it('returns null for ignored status (not in V1 scope)', () => {
    const lead = { status: 'ignored' }
    expect(getNextAction(lead)).toBeNull()
  })

  it('returns null for lost status (not in V1 scope)', () => {
    const lead = { status: 'lost' }
    expect(getNextAction(lead)).toBeNull()
  })

  it('handles legacy lead_status field', () => {
    const lead = { lead_status: 'new' }
    expect(getNextAction(lead)).toEqual({ text: 'Reply now', urgency: 'high' })
  })

  it('returns null when status is missing', () => {
    const lead = {}
    expect(getNextAction(lead)).toBeNull()
  })

  it('returns null for null lead', () => {
    expect(getNextAction(null)).toBeNull()
  })

  it('returns null for undefined lead', () => {
    expect(getNextAction(undefined)).toBeNull()
  })

  it('returns null for active status (valid but not in V1 scope)', () => {
    const lead = { status: 'active' }
    expect(getNextAction(lead)).toBeNull()
  })

  it('handles malformed lead object gracefully', () => {
    const lead = { invalid_field: 'value' }
    expect(getNextAction(lead)).toBeNull()
  })
})