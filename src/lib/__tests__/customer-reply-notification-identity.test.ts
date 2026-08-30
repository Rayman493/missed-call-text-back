/**
 * Customer Reply Notification Identity Regression Test
 *
 * Proves that customer_reply notifications use the canonical customer display name
 * from lead.name, not from raw_metadata.caller_name or incorrect fallbacks.
 *
 * This test directly exercises getLeadDisplayName which is now used by sms-processing.ts
 * for customer reply notification identity.
 */

import { describe, it, expect } from 'vitest'
import { getLeadDisplayName } from '../utils'

describe('Customer Reply Notification Identity', () => {
  it('should use canonical lead.name when available', () => {
    const lead = {
      id: 'lead-1',
      name: 'Ryan',
      caller_phone: '555-1234'
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Ryan')
  })

  it('should fall back to phone when lead.name is absent', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      caller_phone: '555-1234'
    }
    const displayName = getLeadDisplayName(lead)
    // Phone formatting is handled by formatPhoneNumber, actual value may vary
    expect(displayName).not.toBe('Unknown Caller')
    expect(displayName).toContain('1234')
  })

  it('should fall back to phone when lead.name is "Not collected"', () => {
    const lead = {
      id: 'lead-1',
      name: 'Not collected',
      caller_phone: '555-1234'
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).not.toBe('Not collected')
    expect(displayName).toContain('1234')
  })

  it('should return "Unknown Caller" when no usable identity exists', () => {
    const lead = {
      id: 'lead-1',
      name: null
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Unknown Caller')
  })

  it('should never return undefined', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      caller_phone: null
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBeDefined()
    expect(displayName).not.toBe('')
  })

  it('should never return null', () => {
    const lead = {
      id: 'lead-1',
      name: null,
      caller_phone: null
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).not.toBeNull()
  })

  it('should use lead.name when AI intake name is "Not collected"', () => {
    const lead = {
      id: 'lead-1',
      name: 'Ryan',
      caller_phone: '555-1234',
      raw_metadata: {
        extracted_info: {
          customerName: 'Not collected'
        }
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Ryan')
  })
})