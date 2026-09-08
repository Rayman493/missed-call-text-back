import { describe, it, expect } from 'vitest'
import { getMonotonicMessageStatus, STATUS_RANK } from '@/lib/twilio/status-monotonic'

describe('getMonotonicMessageStatus', () => {
  it('does not downgrade delivered', () => {
    expect(getMonotonicMessageStatus('delivered', 'failed')).toBe('delivered')
    expect(getMonotonicMessageStatus('delivered', 'undelivered')).toBe('delivered')
    expect(getMonotonicMessageStatus('delivered', 'queued')).toBe('delivered')
    expect(getMonotonicMessageStatus('delivered', 'sent')).toBe('delivered')
    expect(getMonotonicMessageStatus('delivered', 'not_sent')).toBe('delivered')
  })

  it('does not replace a terminal failure with delivered', () => {
    expect(getMonotonicMessageStatus('failed', 'delivered')).toBe('failed')
    expect(getMonotonicMessageStatus('undelivered', 'delivered')).toBe('undelivered')
    expect(getMonotonicMessageStatus('not_sent', 'delivered')).toBe('not_sent')
  })

  it('allows normal forward progression', () => {
    expect(getMonotonicMessageStatus('queued', 'sent')).toBe('sent')
    expect(getMonotonicMessageStatus('sent', 'delivered')).toBe('delivered')
    expect(getMonotonicMessageStatus('pending', 'sending')).toBe('sending')
    expect(getMonotonicMessageStatus('sending', 'queued')).toBe('queued')
  })

  it('does not let queued replace sent', () => {
    expect(getMonotonicMessageStatus('sent', 'queued')).toBe('sent')
  })

  it('is case-insensitive', () => {
    expect(getMonotonicMessageStatus('DELIVERED', 'FAILED')).toBe('delivered')
    expect(getMonotonicMessageStatus('Sent', 'DELIVERED')).toBe('delivered')
  })

  it('returns the incoming status when it matches the current status', () => {
    expect(getMonotonicMessageStatus('sent', 'sent')).toBe('sent')
    expect(getMonotonicMessageStatus('delivered', 'delivered')).toBe('delivered')
  })

  it('defaults unknown statuses to the current status', () => {
    expect(getMonotonicMessageStatus('sent', 'unknown_carrier_event')).toBe('sent')
    expect(getMonotonicMessageStatus('delivered', 'unknown_carrier_event')).toBe('delivered')
  })

  it('exposes a rank where delivered is less final than failure', () => {
    // This rank contract must match the terminal-state rules in getMonotonicMessageStatus
    expect(STATUS_RANK.delivered).toBeLessThan(STATUS_RANK.failed)
    expect(STATUS_RANK.delivered).toBeLessThan(STATUS_RANK.undelivered)
    expect(STATUS_RANK.sent).toBeLessThan(STATUS_RANK.delivered)
    expect(STATUS_RANK.queued).toBeLessThan(STATUS_RANK.sent)
  })
})
