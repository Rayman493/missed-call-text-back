import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncTerminalLocation, shouldSyncTerminalLocation } from '@/lib/terminal/location-sync'

// Mock dependencies
vi.mock('@/lib/stripe', () => ({
  default: vi.fn(() => ({
    terminal: {
      locations: {
        update: vi.fn()
      }
    }
  }))
}))

vi.mock('@/lib/validation/business-address', () => ({
  validateBusinessAddress: vi.fn(),
}))

import getStripe from '@/lib/stripe'
import { validateBusinessAddress } from '@/lib/validation/business-address'

describe('location-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('shouldSyncTerminalLocation', () => {
    it('should return false if old address is null', () => {
      const result = shouldSyncTerminalLocation(null, {
        line1: '123 Main St',
        line2: null,
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'US'
      })
      expect(result).toBe(false)
    })

    it('should return false if new address is null', () => {
      const result = shouldSyncTerminalLocation(
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        null
      )
      expect(result).toBe(false)
    })

    it('should return false if old address is incomplete', () => {
      const result = shouldSyncTerminalLocation(
        {
          line1: null,
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        {
          line1: '456 Oak Ave',
          line2: null,
          city: 'Oakland',
          state: 'CA',
          postal_code: '94601',
          country: 'US'
        }
      )
      expect(result).toBe(false)
    })

    it('should return false if new address is incomplete', () => {
      const result = shouldSyncTerminalLocation(
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        {
          line1: null,
          line2: null,
          city: 'Oakland',
          state: 'CA',
          postal_code: '94601',
          country: 'US'
        }
      )
      expect(result).toBe(false)
    })

    it('should return true if line1 changed', () => {
      const result = shouldSyncTerminalLocation(
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        {
          line1: '456 Oak Ave',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      )
      expect(result).toBe(true)
    })

    it('should return true if line2 changed', () => {
      const result = shouldSyncTerminalLocation(
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        {
          line1: '123 Main St',
          line2: 'Apt 4B',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      )
      expect(result).toBe(true)
    })

    it('should return true if city changed', () => {
      const result = shouldSyncTerminalLocation(
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        {
          line1: '123 Main St',
          line2: null,
          city: 'Oakland',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      )
      expect(result).toBe(true)
    })

    it('should return true if state changed', () => {
      const result = shouldSyncTerminalLocation(
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'NY',
          postal_code: '94102',
          country: 'US'
        }
      )
      expect(result).toBe(true)
    })

    it('should return true if postal_code changed', () => {
      const result = shouldSyncTerminalLocation(
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94103',
          country: 'US'
        }
      )
      expect(result).toBe(true)
    })

    it('should return true if country changed', () => {
      const result = shouldSyncTerminalLocation(
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'CA'
        }
      )
      expect(result).toBe(true)
    })

    it('should return false if addresses are identical', () => {
      const result = shouldSyncTerminalLocation(
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        },
        {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      )
      expect(result).toBe(false)
    })
  })

  describe('syncTerminalLocation', () => {
    it('should skip sync if no terminal location ID exists', async () => {
      const result = await syncTerminalLocation({
        businessId: 'biz_123',
        stripeAccountId: 'acct_123',
        terminalLocationId: null,
        address: {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      })

      expect(result).toEqual({ success: true, terminalLocationId: null })
      expect(getStripe).not.toHaveBeenCalled()
    })

    it('should return error if address validation fails', async () => {
      vi.mocked(validateBusinessAddress).mockReturnValue({
        valid: false,
        errors: [{ field: 'line1', message: 'Street address is required' }]
      })

      const result = await syncTerminalLocation({
        businessId: 'biz_123',
        stripeAccountId: 'acct_123',
        terminalLocationId: 'tml_123',
        address: {
          line1: null,
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      })

      expect(result).toEqual({
        success: false,
        terminalLocationId: 'tml_123',
        error: 'Address validation failed'
      })
      expect(getStripe).not.toHaveBeenCalled()
    })

    it('should return error if Stripe client is unavailable', async () => {
      vi.mocked(getStripe).mockReturnValue(null as any)

      vi.mocked(validateBusinessAddress).mockReturnValue({
        valid: true,
        normalized: {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      })

      const result = await syncTerminalLocation({
        businessId: 'biz_123',
        stripeAccountId: 'acct_123',
        terminalLocationId: 'tml_123',
        address: {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      })

      expect(result).toEqual({
        success: false,
        terminalLocationId: 'tml_123',
        error: 'Stripe client unavailable'
      })
    })

    it('should successfully sync address to Stripe Terminal Location', async () => {
      const mockStripe = {
        terminal: {
          locations: {
            update: vi.fn().mockResolvedValue({ id: 'tml_123' })
          }
        }
      }

      vi.mocked(getStripe).mockReturnValue(mockStripe as any)

      vi.mocked(validateBusinessAddress).mockReturnValue({
        valid: true,
        normalized: {
          line1: '123 Main St',
          line2: 'Apt 4B',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      })

      const result = await syncTerminalLocation({
        businessId: 'biz_123',
        stripeAccountId: 'acct_123',
        terminalLocationId: 'tml_123',
        address: {
          line1: '123 Main St',
          line2: 'Apt 4B',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      })

      expect(result).toEqual({
        success: true,
        terminalLocationId: 'tml_123'
      })

      expect(mockStripe.terminal.locations.update).toHaveBeenCalledWith(
        'tml_123',
        {
          address: {
            line1: '123 Main St',
            line2: 'Apt 4B',
            city: 'San Francisco',
            state: 'CA',
            postal_code: '94102',
            country: 'US'
          }
        },
        {
          stripeAccount: 'acct_123'
        }
      )
    })

    it('should handle Stripe update failure gracefully', async () => {
      const mockStripe = {
        terminal: {
          locations: {
            update: vi.fn().mockRejectedValue(new Error('Stripe API error'))
          }
        }
      }

      vi.mocked(getStripe).mockReturnValue(mockStripe as any)

      vi.mocked(validateBusinessAddress).mockReturnValue({
        valid: true,
        normalized: {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      })

      const result = await syncTerminalLocation({
        businessId: 'biz_123',
        stripeAccountId: 'acct_123',
        terminalLocationId: 'tml_123',
        address: {
          line1: '123 Main St',
          line2: null,
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US'
        }
      })

      expect(result).toEqual({
        success: false,
        terminalLocationId: 'tml_123',
        error: 'Failed to sync to Stripe Terminal Location'
      })

      // Should not throw, should return error gracefully
      expect(mockStripe.terminal.locations.update).toHaveBeenCalled()
    })
  })
})