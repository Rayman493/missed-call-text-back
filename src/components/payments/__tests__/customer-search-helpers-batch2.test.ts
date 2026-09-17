import { describe, it, expect } from 'vitest'
import {
  isPlaceholderValue,
  getCustomerDisplayName,
  getCustomerServiceText,
  getCustomerTertiaryText,
  getCustomerLocationText,
} from '../customer-search-helpers'

describe('customer-search-helpers Batch 2 row formatters', () => {
  const customer = {
    id: '1',
    name: 'Ryan Bandi',
    caller_phone: '+14125551234',
    raw_metadata: {
      service_requested: 'Fence Installation',
      address: '5510 Mifflin Road',
    },
  }

  it('returns display name when name exists', () => {
    expect(getCustomerDisplayName(customer as any)).toBe('Ryan Bandi')
  })

  it('falls back to formatted phone when name is empty', () => {
    expect(getCustomerDisplayName({ ...customer, name: '' } as any)).toContain('412')
  })

  it('identifies placeholder and blank values', () => {
    expect(isPlaceholderValue(null)).toBe(true)
    expect(isPlaceholderValue('')).toBe(true)
    expect(isPlaceholderValue('N/A')).toBe(true)
    expect(isPlaceholderValue('unknown')).toBe(true)
    expect(isPlaceholderValue('Fence Installation')).toBe(false)
  })

  it('extracts service request as secondary text', () => {
    expect(getCustomerServiceText(customer as any)).toBe('Fence Installation')
  })

  it('returns intentional fallback when no service context exists', () => {
    expect(getCustomerServiceText({ id: '1', name: 'X', caller_phone: '1' } as any)).toBe('No service listed')
  })

  it('builds tertiary line from phone and location', () => {
    const result = getCustomerTertiaryText(customer as any)
    expect(result).toContain('(412)')
    expect(result).toContain('5510 Mifflin Road')
  })

  it('shows fallback when phone or location are missing', () => {
    expect(getCustomerTertiaryText({ id: '1', name: 'X' } as any)).toContain('No phone')
    expect(getCustomerTertiaryText({ id: '1', name: 'X', caller_phone: '1' } as any)).toContain('No location')
  })

  it('reads AI-intake address from raw_metadata.extracted_info (canonical source)', () => {
    const aiCustomer = {
      id: '2',
      name: 'Ray',
      caller_phone: '+15551234567',
      raw_metadata: {
        extracted_info: {
          serviceAddress: '1632 South Pine Drive',
        },
      },
      aiCallRecords: [],
    }
    expect(getCustomerLocationText(aiCustomer as any)).toBe('1632 South Pine Drive')
  })

  it('still falls back to top-level raw_metadata address fields', () => {
    expect(getCustomerLocationText(customer as any)).toBe('5510 Mifflin Road')
  })
})
