import { describe, it, expect } from 'vitest'
import { getLeadDisplayName } from '../utils'
import { getLeadAIIntake } from '../ai-field-mapping'

describe('Customer Name Fallback', () => {
  it('should use extracted customer name when available', () => {
    const lead = {
      id: 'lead-1',
      caller_phone: '555-1234',
      raw_metadata: {
        extracted_info: {
          customerName: 'John Doe'
        }
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('John Doe')
  })

  it('should use existing lead name when extracted name is missing', () => {
    const lead = {
      id: 'lead-1',
      caller_phone: '555-1234',
      name: 'Jane Smith',
      raw_metadata: {}
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Jane Smith')
  })

  it('should fall back to formatted phone number when both names are missing', () => {
    const lead = {
      id: 'lead-1',
      caller_phone: '555-1234',
      raw_metadata: {}
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('(555) 123-4')
  })

  it('should return "Unknown Caller" when no name or phone is available', () => {
    const lead = {
      id: 'lead-1',
      raw_metadata: {}
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Unknown Caller')
  })

  it('should not display "Not collected" as customer name from extracted info', () => {
    const lead = {
      id: 'lead-1',
      caller_phone: '555-1234',
      raw_metadata: {
        extracted_info: {
          customerName: 'Not collected'
        }
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).not.toBe('Not collected')
    expect(displayName).toBe('(555) 123-4')
  })

  it('should not display "Not collected" as customer name from lead.name', () => {
    const lead = {
      id: 'lead-1',
      caller_phone: '555-1234',
      name: 'Not collected',
      raw_metadata: {}
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).not.toBe('Not collected')
    expect(displayName).toBe('(555) 123-4')
  })

  it('should prioritize extracted name over lead name when both are valid', () => {
    const lead = {
      id: 'lead-1',
      caller_phone: '555-1234',
      name: 'Old Name',
      raw_metadata: {
        extracted_info: {
          customerName: 'New Name'
        }
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('New Name')
  })

  it('should use lead name when extracted name is "Not collected"', () => {
    const lead = {
      id: 'lead-1',
      caller_phone: '555-1234',
      name: 'Valid Name',
      raw_metadata: {
        extracted_info: {
          customerName: 'Not collected'
        }
      }
    }
    const displayName = getLeadDisplayName(lead)
    expect(displayName).toBe('Valid Name')
  })
})
