import { describe, it, expect } from 'vitest'
import { getMonotonicMessageStatus } from '@/lib/twilio/status-monotonic'

describe('getMonotonicMessageStatus — transition-aware state machine', () => {
  describe('forward progression (allowed)', () => {
    it('accepted → queued', () => {
      expect(getMonotonicMessageStatus('accepted', 'queued')).toBe('queued')
    })
    it('queued → sending', () => {
      expect(getMonotonicMessageStatus('queued', 'sending')).toBe('sending')
    })
    it('sending → sent', () => {
      expect(getMonotonicMessageStatus('sending', 'sent')).toBe('sent')
    })
    it('queued → sent (missing intermediate callbacks)', () => {
      expect(getMonotonicMessageStatus('queued', 'sent')).toBe('sent')
    })
    it('accepted → sent (missing intermediate callbacks)', () => {
      expect(getMonotonicMessageStatus('accepted', 'sent')).toBe('sent')
    })
    it('sent → delivered', () => {
      expect(getMonotonicMessageStatus('sent', 'delivered')).toBe('delivered')
    })
    it('sent → undelivered', () => {
      expect(getMonotonicMessageStatus('sent', 'undelivered')).toBe('undelivered')
    })
    it('pending → sending', () => {
      expect(getMonotonicMessageStatus('pending', 'sending')).toBe('sending')
    })
    it('pending → accepted', () => {
      expect(getMonotonicMessageStatus('pending', 'accepted')).toBe('accepted')
    })
  })

  describe('valid progress → failed (allowed)', () => {
    it('accepted → failed', () => {
      expect(getMonotonicMessageStatus('accepted', 'failed')).toBe('failed')
    })
    it('queued → failed', () => {
      expect(getMonotonicMessageStatus('queued', 'failed')).toBe('failed')
    })
    it('sending → failed', () => {
      expect(getMonotonicMessageStatus('sending', 'failed')).toBe('failed')
    })
    it('sent → failed', () => {
      expect(getMonotonicMessageStatus('sent', 'failed')).toBe('failed')
    })
    it('accepted → undelivered', () => {
      expect(getMonotonicMessageStatus('accepted', 'undelivered')).toBe('undelivered')
    })
    it('queued → undelivered', () => {
      expect(getMonotonicMessageStatus('queued', 'undelivered')).toBe('undelivered')
    })
  })

  describe('terminal states never regress', () => {
    it('delivered → late failed ignored', () => {
      expect(getMonotonicMessageStatus('delivered', 'failed')).toBe('delivered')
    })
    it('delivered → late undelivered ignored', () => {
      expect(getMonotonicMessageStatus('delivered', 'undelivered')).toBe('delivered')
    })
    it('delivered → late queued ignored', () => {
      expect(getMonotonicMessageStatus('delivered', 'queued')).toBe('delivered')
    })
    it('delivered → late sent ignored', () => {
      expect(getMonotonicMessageStatus('delivered', 'sent')).toBe('delivered')
    })
    it('delivered → late accepted ignored', () => {
      expect(getMonotonicMessageStatus('delivered', 'accepted')).toBe('delivered')
    })
    it('delivered → not_sent ignored (internal cannot overwrite Twilio result)', () => {
      expect(getMonotonicMessageStatus('delivered', 'not_sent')).toBe('delivered')
    })
    it('failed → late sent ignored', () => {
      expect(getMonotonicMessageStatus('failed', 'sent')).toBe('failed')
    })
    it('failed → late delivered ignored', () => {
      expect(getMonotonicMessageStatus('failed', 'delivered')).toBe('failed')
    })
    it('failed → late queued ignored', () => {
      expect(getMonotonicMessageStatus('failed', 'queued')).toBe('failed')
    })
    it('undelivered → late delivered ignored', () => {
      expect(getMonotonicMessageStatus('undelivered', 'delivered')).toBe('undelivered')
    })
    it('undelivered → late sent ignored', () => {
      expect(getMonotonicMessageStatus('undelivered', 'sent')).toBe('undelivered')
    })
  })

  describe('not_sent (internal config failure)', () => {
    it('not_sent cannot overwrite delivered', () => {
      expect(getMonotonicMessageStatus('delivered', 'not_sent')).toBe('delivered')
    })
    it('not_sent cannot overwrite failed', () => {
      expect(getMonotonicMessageStatus('failed', 'not_sent')).toBe('failed')
    })
    it('not_sent cannot overwrite undelivered', () => {
      expect(getMonotonicMessageStatus('undelivered', 'not_sent')).toBe('undelivered')
    })
    it('not_sent → delivered allowed (Twilio result replaces internal failure)', () => {
      expect(getMonotonicMessageStatus('not_sent', 'delivered')).toBe('delivered')
    })
    it('not_sent → failed allowed (Twilio result replaces internal failure)', () => {
      expect(getMonotonicMessageStatus('not_sent', 'failed')).toBe('failed')
    })
    it('not_sent → sent allowed (Twilio result replaces internal failure)', () => {
      expect(getMonotonicMessageStatus('not_sent', 'sent')).toBe('sent')
    })
  })

  describe('backward transitions rejected', () => {
    it('sent → queued rejected', () => {
      expect(getMonotonicMessageStatus('sent', 'queued')).toBe('sent')
    })
    it('sent → accepted rejected', () => {
      expect(getMonotonicMessageStatus('sent', 'accepted')).toBe('sent')
    })
    it('queued → accepted rejected', () => {
      expect(getMonotonicMessageStatus('queued', 'accepted')).toBe('queued')
    })
    it('sending → accepted rejected', () => {
      expect(getMonotonicMessageStatus('sending', 'accepted')).toBe('sending')
    })
    it('delivered → sending rejected', () => {
      expect(getMonotonicMessageStatus('delivered', 'sending')).toBe('delivered')
    })
  })

  describe('idempotent same-status callbacks', () => {
    it('sent → sent is idempotent', () => {
      expect(getMonotonicMessageStatus('sent', 'sent')).toBe('sent')
    })
    it('delivered → delivered is idempotent', () => {
      expect(getMonotonicMessageStatus('delivered', 'delivered')).toBe('delivered')
    })
    it('failed → failed is idempotent', () => {
      expect(getMonotonicMessageStatus('failed', 'failed')).toBe('failed')
    })
    it('undelivered → undelivered is idempotent', () => {
      expect(getMonotonicMessageStatus('undelivered', 'undelivered')).toBe('undelivered')
    })
    it('accepted → accepted is idempotent', () => {
      expect(getMonotonicMessageStatus('accepted', 'accepted')).toBe('accepted')
    })
    it('queued → queued is idempotent', () => {
      expect(getMonotonicMessageStatus('queued', 'queued')).toBe('queued')
    })
  })

  describe('case-insensitive', () => {
    it('DELIVERED → FAILED preserves delivered', () => {
      expect(getMonotonicMessageStatus('DELIVERED', 'FAILED')).toBe('delivered')
    })
    it('Sent → DELIVERED upgrades to delivered', () => {
      expect(getMonotonicMessageStatus('Sent', 'DELIVERED')).toBe('delivered')
    })
    it('ACCEPTED → QUEUED upgrades to queued', () => {
      expect(getMonotonicMessageStatus('ACCEPTED', 'QUEUED')).toBe('queued')
    })
  })

  describe('unknown incoming statuses', () => {
    it('unknown incoming does not regress sent', () => {
      expect(getMonotonicMessageStatus('sent', 'unknown_carrier_event')).toBe('sent')
    })
    it('unknown incoming does not regress delivered', () => {
      expect(getMonotonicMessageStatus('delivered', 'unknown_carrier_event')).toBe('delivered')
    })
    it('unknown incoming does not regress failed', () => {
      expect(getMonotonicMessageStatus('failed', 'unknown_carrier_event')).toBe('failed')
    })
  })

  describe('null / undefined handling', () => {
    it('null current defaults to pending and accepts incoming', () => {
      expect(getMonotonicMessageStatus(null, 'accepted')).toBe('accepted')
    })
    it('undefined current defaults to pending and accepts incoming', () => {
      expect(getMonotonicMessageStatus(undefined, 'queued')).toBe('queued')
    })
    it('null incoming preserves current', () => {
      expect(getMonotonicMessageStatus('delivered', null)).toBe('delivered')
    })
  })
})
