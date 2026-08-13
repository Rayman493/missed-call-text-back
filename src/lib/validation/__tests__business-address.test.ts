import { describe, it, expect } from 'vitest'
import { validateBusinessAddress, isAddressComplete } from '@/lib/validation/business-address'

describe('business-address validation', () => {
  describe('validateBusinessAddress', () => {
    it('should accept valid US address', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(true)
      expect(result.normalized).toEqual({
        line1: '123 Main Street',
        line2: null,
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      })
    })

    it('should accept ZIP+4 format', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102-1234',
        country: 'US'
      })
      expect(result.valid).toBe(true)
      expect(result.normalized?.postal_code).toBe('94102-1234')
    })

    it('should reject missing line1', () => {
      const result = validateBusinessAddress({
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('line1')
    })

    it('should reject empty line1', () => {
      const result = validateBusinessAddress({
        line1: '   ',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('line1')
    })

    it('should reject missing city', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('city')
    })

    it('should reject missing state', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: 'San Francisco',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('state')
    })

    it('should reject invalid state code', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'XX',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('state')
    })

    it('should accept lowercase state and normalize to uppercase', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'ca',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(true)
      expect(result.normalized?.state).toBe('CA')
    })

    it('should reject missing postal code', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        country: 'US'
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('postal_code')
    })

    it('should reject invalid postal code format', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '9410',
        country: 'US'
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('postal_code')
    })

    it('should reject non-US country', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'CA'
      })
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('country')
    })

    it('should normalize lowercase country to US', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'us'
      })
      expect(result.valid).toBe(true)
      expect(result.normalized?.country).toBe('US')
    })

    it('should accept optional line2', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        line2: 'Apt 4B',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(true)
      expect(result.normalized?.line2).toBe('Apt 4B')
    })

    it('should accept null line2', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        line2: null,
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(true)
      expect(result.normalized?.line2).toBeNull()
    })

    it('should trim whitespace from line1', () => {
      const result = validateBusinessAddress({
        line1: '  123 Main Street  ',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(true)
      expect(result.normalized?.line1).toBe('123 Main Street')
    })

    it('should trim whitespace from city', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: '  San Francisco  ',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      })
      expect(result.valid).toBe(true)
      expect(result.normalized?.city).toBe('San Francisco')
    })

    it('should trim whitespace from postal code', () => {
      const result = validateBusinessAddress({
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '  94102  ',
        country: 'US'
      })
      expect(result.valid).toBe(true)
      expect(result.normalized?.postal_code).toBe('94102')
    })
  })

  describe('isAddressComplete', () => {
    it('should return true for complete address', () => {
      const address = {
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      }
      expect(isAddressComplete(address)).toBe(true)
    })

    it('should return false for missing line1', () => {
      const address = {
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      }
      expect(isAddressComplete(address)).toBe(false)
    })

    it('should return false for missing city', () => {
      const address = {
        line1: '123 Main Street',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      }
      expect(isAddressComplete(address)).toBe(false)
    })

    it('should return false for missing state', () => {
      const address = {
        line1: '123 Main Street',
        city: 'San Francisco',
        postal_code: '94102',
        country: 'US'
      }
      expect(isAddressComplete(address)).toBe(false)
    })

    it('should return false for missing postal code', () => {
      const address = {
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        country: 'US'
      }
      expect(isAddressComplete(address)).toBe(false)
    })

    it('should return false for missing country', () => {
      const address = {
        line1: '123 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102'
      }
      expect(isAddressComplete(address)).toBe(false)
    })

    it('should return false for null address', () => {
      expect(isAddressComplete(null)).toBe(false)
    })

    it('should return false for undefined address', () => {
      expect(isAddressComplete(undefined)).toBe(false)
    })

    it('should return true for address with optional line2', () => {
      const address = {
        line1: '123 Main Street',
        line2: 'Apt 4B',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      }
      expect(isAddressComplete(address)).toBe(true)
    })
  })
})