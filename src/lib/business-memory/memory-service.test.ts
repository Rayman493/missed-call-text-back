import { describe, it, expect, beforeEach } from 'vitest'
import { memoryService } from './memory-service'
import { CustomerMemory, BusinessMemory } from './types'

describe('Memory Service - Deterministic Tests', () => {
  beforeEach(() => {
    memoryService.clearAll()
  })

  describe('Tenant Safety', () => {
    it('should prevent cross-business customer memory leakage', () => {
      const business1Customer: CustomerMemory = {
        customerId: 'customer-1',
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        repeatCustomer: true,
        jobCount: 2,
        averageJobValue: 100
      }

      const business2Customer: CustomerMemory = {
        customerId: 'customer-1', // Same customer ID
        businessId: 'business-2', // Different business
        updatedAt: new Date().toISOString(),
        repeatCustomer: false,
        jobCount: 1,
        averageJobValue: 200
      }

      memoryService.setCustomerMemory('business-1', 'customer-1', business1Customer)
      memoryService.setCustomerMemory('business-2', 'customer-1', business2Customer)

      const retrieved1 = memoryService.getCustomerMemory('business-1', 'customer-1')
      const retrieved2 = memoryService.getCustomerMemory('business-2', 'customer-1')

      expect(retrieved1?.businessId).toBe('business-1')
      expect(retrieved1?.averageJobValue).toBe(100)
      expect(retrieved2?.businessId).toBe('business-2')
      expect(retrieved2?.averageJobValue).toBe(200)
    })

    it('should throw error on tenant safety violation in setCustomerMemory', () => {
      const memory: CustomerMemory = {
        customerId: 'customer-1',
        businessId: 'business-2',
        updatedAt: new Date().toISOString(),
        repeatCustomer: true,
        jobCount: 2
      }

      expect(() => {
        memoryService.setCustomerMemory('business-1', 'customer-1', memory)
      }).toThrow('Tenant safety violation')
    })

    it('should throw error on tenant safety violation in refreshBusinessMemory', async () => {
      const dataFetcher = async () => ({
        customers: 1,
        customerMemories: [
          {
            customerId: 'c1',
            businessId: 'business-2', // Wrong business
            updatedAt: new Date().toISOString(),
            repeatCustomer: true,
            jobCount: 2
          }
        ]
      })

      await expect(
        memoryService.refreshBusinessMemory('business-1', dataFetcher)
      ).rejects.toThrow('Tenant safety violation')
    })

    it('should invalidate memory with businessId', () => {
      const memory: CustomerMemory = {
        customerId: 'customer-1',
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        repeatCustomer: true,
        jobCount: 2
      }

      memoryService.setCustomerMemory('business-1', 'customer-1', memory)
      memoryService.invalidateCustomerMemory('business-1', 'customer-1')

      const retrieved = memoryService.getCustomerMemory('business-1', 'customer-1')
      expect(retrieved).toBeNull()
    })
  })

  describe('Cache Behavior', () => {
    it('should cache customer memory', () => {
      const memory: CustomerMemory = {
        customerId: 'customer-1',
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        repeatCustomer: true,
        jobCount: 2
      }

      memoryService.setCustomerMemory('business-1', 'customer-1', memory)
      const retrieved = memoryService.getCustomerMemory('business-1', 'customer-1')

      expect(retrieved).not.toBeNull()
      expect(retrieved?.customerId).toBe('customer-1')
    })

    it('should return null for cache miss', () => {
      const retrieved = memoryService.getCustomerMemory('business-1', 'customer-1')
      expect(retrieved).toBeNull()
    })

    it('should expire cache after 5 minutes', () => {
      const memory: CustomerMemory = {
        customerId: 'customer-1',
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        repeatCustomer: true,
        jobCount: 2
      }

      memoryService.setCustomerMemory('business-1', 'customer-1', memory)
      
      // Manually expire the cache by setting lastRefreshTime to past
      const service = memoryService as any
      const cacheKey = service.customerCacheKey('business-1', 'customer-1')
      service.lastRefreshTime.set(cacheKey, Date.now() - 6 * 60 * 1000)

      const retrieved = memoryService.getCustomerMemory('business-1', 'customer-1')
      expect(retrieved).toBeNull()
    })

    it('should cache business memory', () => {
      const memory: BusinessMemory = {
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        totalCustomers: 10,
        repeatCustomerRate: 50
      }

      memoryService.setBusinessMemory('business-1', memory)
      const retrieved = memoryService.getBusinessMemory('business-1')

      expect(retrieved).not.toBeNull()
      expect(retrieved?.businessId).toBe('business-1')
    })

    it('should invalidate business memory', () => {
      const memory: BusinessMemory = {
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        totalCustomers: 10,
        repeatCustomerRate: 50
      }

      memoryService.setBusinessMemory('business-1', memory)
      memoryService.invalidateBusinessMemory('business-1')

      const retrieved = memoryService.getBusinessMemory('business-1')
      expect(retrieved).toBeNull()
    })

    it('should clear all caches', () => {
      const customerMemory: CustomerMemory = {
        customerId: 'customer-1',
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        repeatCustomer: true,
        jobCount: 2
      }

      const businessMemory: BusinessMemory = {
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        totalCustomers: 10,
        repeatCustomerRate: 50
      }

      memoryService.setCustomerMemory('business-1', 'customer-1', customerMemory)
      memoryService.setBusinessMemory('business-1', businessMemory)
      memoryService.clearAll()

      expect(memoryService.getCustomerMemory('business-1', 'customer-1')).toBeNull()
      expect(memoryService.getBusinessMemory('business-1')).toBeNull()
    })
  })

  describe('Refresh Behavior', () => {
    it('should refresh customer memory and cache it', async () => {
      const dataFetcher = async () => ({
        jobs: [
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: 100 }
        ]
      })

      const memory = await memoryService.refreshCustomerMemory('business-1', 'customer-1', dataFetcher)
      expect(memory.customerId).toBe('customer-1')
      expect(memory.businessId).toBe('business-1')

      const cached = memoryService.getCustomerMemory('business-1', 'customer-1')
      expect(cached).not.toBeNull()
      expect(cached?.customerId).toBe('customer-1')
    })

    it('should refresh business memory and cache it', async () => {
      const dataFetcher = async () => ({
        customers: 5,
        customerMemories: [
          {
            customerId: 'c1',
            businessId: 'business-1',
            updatedAt: new Date().toISOString(),
            repeatCustomer: true,
            jobCount: 2
          }
        ]
      })

      const memory = await memoryService.refreshBusinessMemory('business-1', dataFetcher)
      expect(memory.businessId).toBe('business-1')

      const cached = memoryService.getBusinessMemory('business-1')
      expect(cached).not.toBeNull()
      expect(cached?.businessId).toBe('business-1')
    })
  })

  describe('Deterministic Behavior', () => {
    it('should produce identical cache behavior for identical operations', () => {
      const memory: CustomerMemory = {
        customerId: 'customer-1',
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        repeatCustomer: true,
        jobCount: 2
      }

      memoryService.setCustomerMemory('business-1', 'customer-1', memory)
      const retrieved1 = memoryService.getCustomerMemory('business-1', 'customer-1')
      const retrieved2 = memoryService.getCustomerMemory('business-1', 'customer-1')

      expect(retrieved1?.customerId).toBe(retrieved2?.customerId)
      expect(retrieved1?.businessId).toBe(retrieved2?.businessId)
    })

    it('should produce identical results across multiple set/get cycles', () => {
      const memory: CustomerMemory = {
        customerId: 'customer-1',
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        repeatCustomer: true,
        jobCount: 2
      }

      memoryService.setCustomerMemory('business-1', 'customer-1', memory)
      memoryService.invalidateCustomerMemory('business-1', 'customer-1')
      memoryService.setCustomerMemory('business-1', 'customer-1', memory)

      const retrieved = memoryService.getCustomerMemory('business-1', 'customer-1')
      expect(retrieved?.customerId).toBe('customer-1')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty customer ID', () => {
      const memory: CustomerMemory = {
        customerId: '',
        businessId: 'business-1',
        updatedAt: new Date().toISOString(),
        repeatCustomer: false,
        jobCount: 0
      }

      memoryService.setCustomerMemory('business-1', '', memory)
      const retrieved = memoryService.getCustomerMemory('business-1', '')
      expect(retrieved).not.toBeNull()
    })

    it('should handle empty business ID', () => {
      const memory: CustomerMemory = {
        customerId: 'customer-1',
        businessId: '',
        updatedAt: new Date().toISOString(),
        repeatCustomer: false,
        jobCount: 0
      }

      memoryService.setCustomerMemory('', 'customer-1', memory)
      const retrieved = memoryService.getCustomerMemory('', 'customer-1')
      expect(retrieved).not.toBeNull()
    })

    it('should handle special characters in IDs', () => {
      const memory: CustomerMemory = {
        customerId: 'customer:with:colons',
        businessId: 'business:with:colons',
        updatedAt: new Date().toISOString(),
        repeatCustomer: false,
        jobCount: 0
      }

      memoryService.setCustomerMemory('business:with:colons', 'customer:with:colons', memory)
      const retrieved = memoryService.getCustomerMemory('business:with:colons', 'customer:with:colons')
      expect(retrieved).not.toBeNull()
    })
  })
})
