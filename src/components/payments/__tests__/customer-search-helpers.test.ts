import { describe, it, expect } from 'vitest'
import {
  normalizePhoneDigits,
  getCustomerDisplayName,
  getCustomerSecondaryText,
  filterLeadsBySearchQuery,
  type Lead
} from '../customer-search-helpers'

describe('customer-search-helpers', () => {
  describe('normalizePhoneDigits', () => {
    it('removes formatting from phone numbers', () => {
      expect(normalizePhoneDigits('(412) 555-1212')).toBe('4125551212')
      expect(normalizePhoneDigits('412-555-1212')).toBe('4125551212')
      expect(normalizePhoneDigits('+1 412 555 1212')).toBe('14125551212')
      expect(normalizePhoneDigits('412.555.1212')).toBe('4125551212')
    })

    it('handles empty strings', () => {
      expect(normalizePhoneDigits('')).toBe('')
    })
  })

  describe('getCustomerDisplayName', () => {
    it('returns name when available and not "Not collected"', () => {
      const lead: Lead = { id: '1', name: 'John Doe', caller_phone: '4125551212' }
      expect(getCustomerDisplayName(lead)).toBe('John Doe')
    })

    it('falls back to formatted phone when name is "Not collected"', () => {
      const lead: Lead = { id: '1', name: 'Not collected', caller_phone: '4125551212' }
      expect(getCustomerDisplayName(lead)).toBe('(412) 555-1212')
    })

    it('falls back to formatted phone when name is null', () => {
      const lead: Lead = { id: '1', name: null, caller_phone: '4125551212' }
      expect(getCustomerDisplayName(lead)).toBe('(412) 555-1212')
    })

    it('returns empty string when both name and phone are missing', () => {
      const lead: Lead = { id: '1', name: null, caller_phone: null }
      expect(getCustomerDisplayName(lead)).toBe('')
    })

    it('defensively handles raw E.164 accidentally supplied as name', () => {
      // Defense-in-depth: even if malformed data arrives with raw E.164 as name,
      // the helper still shows it (API should prevent this, but defensive layer helps)
      const lead: Lead = { id: '1', name: '+14128553010', caller_phone: '+14128553010' }
      expect(getCustomerDisplayName(lead)).toBe('+14128553010') // Shows raw E.164 (malformed data)
    })
  })

  describe('getCustomerSecondaryText', () => {
    it('returns formatted phone when different from display name', () => {
      const lead: Lead = { id: '1', name: 'John Doe', caller_phone: '4125551212' }
      expect(getCustomerSecondaryText(lead)).toBe('(412) 555-1212')
    })

    it('returns null when phone is null', () => {
      const lead: Lead = { id: '1', name: 'John Doe', caller_phone: null }
      expect(getCustomerSecondaryText(lead)).toBeNull()
    })

    it('returns null when phone equals display name (name missing case)', () => {
      const lead: Lead = { id: '1', name: 'Not collected', caller_phone: '4125551212' }
      expect(getCustomerSecondaryText(lead)).toBeNull()
    })

    it('returns null when phone equals display name (null name case)', () => {
      // API fix scenario: name is null, helper falls back to formatted phone
      const lead: Lead = { id: '1', name: null, caller_phone: '4125551212' }
      expect(getCustomerDisplayName(lead)).toBe('(412) 555-1212')
      expect(getCustomerSecondaryText(lead)).toBeNull() // No duplicate
    })

    it('defensively handles raw E.164 accidentally supplied as name (no duplicate)', () => {
      // Defense-in-depth: even if malformed data arrives with raw E.164 as name,
      // recognize it's the same phone identity and don't duplicate
      const lead: Lead = { id: '1', name: '+14128553010', caller_phone: '+14128553010' }
      expect(getCustomerDisplayName(lead)).toBe('+14128553010') // Raw E.164 (malformed)
      expect(getCustomerSecondaryText(lead)).toBeNull() // No duplicate due to defensive normalization
    })
  })

  describe('filterLeadsBySearchQuery', () => {
    const leads: Lead[] = [
      { id: '1', name: 'John Doe', caller_phone: '4125551212' },
      { id: '2', name: 'Jane Smith', caller_phone: '(412) 555-3434' },
      { id: '3', name: 'Not collected', caller_phone: '+1 412 555-5678' },
      { id: '4', name: null, caller_phone: '412-555-9090' },
      { id: '5', name: 'Bob Johnson', caller_phone: null },
    ]

    it('returns all leads when query is empty', () => {
      const result = filterLeadsBySearchQuery(leads, '')
      expect(result).toHaveLength(5)
    })

    it('returns all leads when query is whitespace only', () => {
      const result = filterLeadsBySearchQuery(leads, '   ')
      expect(result).toHaveLength(5)
    })

    it('matches by name case-insensitively', () => {
      const result = filterLeadsBySearchQuery(leads, 'john')
      expect(result).toHaveLength(2)
      expect(result.map(l => l.id)).toContain('1')
      expect(result.map(l => l.id)).toContain('5')
    })

    it('matches partial name', () => {
      const result = filterLeadsBySearchQuery(leads, 'doe')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('1')
    })

    it('matches by phone ignoring formatting - partial "412"', () => {
      const result = filterLeadsBySearchQuery(leads, '412')
      expect(result).toHaveLength(4)
      expect(result.map(l => l.id)).toContain('1')
      expect(result.map(l => l.id)).toContain('2')
      expect(result.map(l => l.id)).toContain('3')
      expect(result.map(l => l.id)).toContain('4')
    })

    it('matches by phone ignoring formatting - partial "555"', () => {
      const result = filterLeadsBySearchQuery(leads, '555')
      expect(result).toHaveLength(4)
    })

    it('matches by phone with full local digits', () => {
      const result = filterLeadsBySearchQuery(leads, '4125551212')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('1')
    })

    it('matches by phone with country prefix', () => {
      const result = filterLeadsBySearchQuery(leads, '14125551212')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('1')
    })

    it('does not match non-matching phone', () => {
      const result = filterLeadsBySearchQuery(leads, '999')
      expect(result).toHaveLength(0)
    })

    it('does not falsely match unrelated long queries', () => {
      const result = filterLeadsBySearchQuery(leads, '12345678901234567890')
      expect(result).toHaveLength(0)
    })

    it('returns empty array when no matches', () => {
      const result = filterLeadsBySearchQuery(leads, 'xyz')
      expect(result).toHaveLength(0)
    })

    it('maintains stable ordering after filtering', () => {
      const result = filterLeadsBySearchQuery(leads, '412')
      expect(result.map(l => l.id)).toEqual(['1', '2', '3', '4'])
    })

    it('ignores "Not collected" names in search', () => {
      const result = filterLeadsBySearchQuery(leads, 'not')
      expect(result).toHaveLength(0)
    })
  })
})