/**
 * Customer Source Canonical Helper Tests
 *
 * Tests for getCustomerSourceInfoCanonical which uses the full provenance precedence chain.
 * This is the canonical helper for LeadCard source indicators.
 */

import { describe, it, expect } from 'vitest'
import { getCustomerSourceInfoCanonical } from '@/lib/customer-source'

describe('Customer Source Canonical Helper', () => {
  describe('Manual customer source', () => {
    it('should show Manual provenance for leads.source = manual', () => {
      const lead = {
        source: 'manual'
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('manual')
      expect(result?.label).toBe('Manual')
      expect(result?.icon).toBe('UserPlus')
    })

    it('should show Manual provenance for raw_metadata.source = manual_entry', () => {
      const lead = {
        source: null,
        raw_metadata: {
          source: 'manual_entry'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('manual')
    })

    it('should show Manual provenance for raw_metadata.creation_source = manual', () => {
      const lead = {
        source: null,
        raw_metadata: {
          creation_source: 'manual'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('manual')
    })
  })

  describe('ReplyFlow/AI voice source', () => {
    it('should show ReplyFlow provenance for leads.source = ai_voice', () => {
      const lead = {
        source: 'ai_voice'
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('replyflow')
      expect(result?.label).toBe('ReplyFlow')
      expect(result?.icon).toBe('PhoneIncoming')
    })

    it('should show ReplyFlow provenance for raw_metadata.creation_source = voice', () => {
      const lead = {
        source: null,
        raw_metadata: {
          creation_source: 'voice'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('replyflow')
    })

    it('should show ReplyFlow provenance for raw_metadata.creation_source = ai_voice', () => {
      const lead = {
        source: null,
        raw_metadata: {
          creation_source: 'ai_voice'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('replyflow')
    })
  })

  describe('SMS source', () => {
    it('should show ReplyFlow provenance for leads.source = sms', () => {
      const lead = {
        source: 'sms'
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('replyflow')
    })

    it('should show ReplyFlow provenance for raw_metadata.creation_source = sms', () => {
      const lead = {
        source: null,
        raw_metadata: {
          creation_source: 'sms'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).not.toBeNull()
      expect(result?.type).toBe('replyflow')
    })
  })

  describe('Source precedence chain', () => {
    it('should prefer creation_source over raw_metadata.source', () => {
      const lead = {
        source: null,
        raw_metadata: {
          creation_source: 'manual',
          source: 'ai_voice'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result?.type).toBe('manual')
    })

    it('should prefer raw_metadata.source over leads.source', () => {
      const lead = {
        source: 'ai_voice',
        raw_metadata: {
          source: 'manual'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result?.type).toBe('manual')
    })

    it('should use leads.source as fallback when metadata absent', () => {
      const lead = {
        source: 'manual',
        raw_metadata: {}
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result?.type).toBe('manual')
    })
  })

  describe('Unknown/missing source', () => {
    it('should return null for unknown source value', () => {
      const lead = {
        source: 'unknown_value_not_supported'
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).toBeNull()
    })

    it('should return null for null source', () => {
      const lead = {
        source: null
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).toBeNull()
    })

    it('should return null for undefined source', () => {
      const lead = {}
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).toBeNull()
    })

    it('should return null for web source (unclassified)', () => {
      const lead = {
        source: 'web'
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).toBeNull()
    })

    it('should return null for admin_test source (excluded)', () => {
      const lead = {
        source: 'admin_test'
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).toBeNull()
    })
  })

  describe('Returning customer origin preservation', () => {
    it('should preserve original Manual source regardless of subsequent interactions', () => {
      const lead = {
        source: 'manual',
        raw_metadata: {
          creation_source: 'manual',
          // Subsequent interaction metadata
          ai_intake_latest_call_sid: 'CA123',
          last_customer_reply_at: '2024-01-15T10:00:00Z'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result?.type).toBe('manual')
    })

    it('should preserve original ReplyFlow source regardless of subsequent interactions', () => {
      const lead = {
        source: 'ai_voice',
        raw_metadata: {
          creation_source: 'voice',
          // Subsequent interaction metadata
          last_customer_reply_at: '2024-01-15T10:00:00Z'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result?.type).toBe('replyflow')
    })
  })

  describe('Legacy provenance evidence', () => {
    it('should classify as ReplyFlow when historical AI intake metadata exists', () => {
      const lead = {
        source: null,
        raw_metadata: {
          // Historical evidence without explicit source
          ai_intake_completed: true,
          ai_intake_latest_call_sid: 'CA123'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result?.type).toBe('replyflow')
    })

    it('should return null when no historical evidence exists', () => {
      const lead = {
        source: null,
        raw_metadata: {}
      }
      const result = getCustomerSourceInfoCanonical(lead)
      expect(result).toBeNull()
    })
  })

  describe('Conflicting fields', () => {
    it('should use creation_source as canonical source of truth', () => {
      const lead = {
        source: 'ai_voice',
        raw_metadata: {
          creation_source: 'manual',
          source: 'sms'
        }
      }
      const result = getCustomerSourceInfoCanonical(lead)
      // creation_source should win
      expect(result?.type).toBe('manual')
    })
  })
})