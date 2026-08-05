import { describe, it, expect } from 'vitest'
import { buildCustomerMemory, buildBusinessMemory } from './memory-builder'
import { CustomerMemory, BusinessMemory } from './types'

describe('Memory Builder - Deterministic Tests', () => {
  describe('buildCustomerMemory', () => {
    it('should handle no data gracefully', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {})
      expect(result.customerId).toBe('customer-1')
      expect(result.businessId).toBe('business-1')
      expect(result.jobCount).toBe(0)
      expect(result.repeatCustomer).toBe(false)
      expect(result.preferredContactMethod).toBeUndefined()
      expect(result.preferredAppointmentTime).toBeUndefined()
      expect(result.averageJobValue).toBeUndefined()
      expect(result.lifetimeRevenue).toBeUndefined()
    })

    it('should handle one customer with one job', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {
        jobs: [
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: 100, service: 'Lawn Care' }
        ]
      })
      expect(result.jobCount).toBe(1)
      expect(result.repeatCustomer).toBe(false)
      expect(result.averageJobValue).toBe(100)
      expect(result.lifetimeRevenue).toBe(100)
      expect(result.estimatedCustomerValue).toBe(100)
    })

    it('should handle repeat customer (2+ jobs)', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {
        jobs: [
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: 100, service: 'Lawn Care' },
          { created_at: '2024-02-01T10:00:00Z', status: 'completed', amount: 150, service: 'Lawn Care' }
        ]
      })
      expect(result.jobCount).toBe(2)
      expect(result.repeatCustomer).toBe(true)
      expect(result.averageJobValue).toBe(125)
      expect(result.lifetimeRevenue).toBe(250)
      expect(result.estimatedCustomerValue).toBe(250)
    })

    it('should handle duplicate events', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {
        jobs: [
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: 100, service: 'Lawn Care' },
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: 100, service: 'Lawn Care' }
        ]
      })
      expect(result.jobCount).toBe(2) // Duplicates are removed based on created_at + status
    })

    it('should handle out-of-order timestamps', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {
        jobs: [
          { created_at: '2024-02-01T10:00:00Z', status: 'completed', amount: 150, service: 'Lawn Care' },
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: 100, service: 'Lawn Care' }
        ]
      })
      expect(result.firstJobDate).toBe('2024-01-01T10:00:00.000Z')
      expect(result.lastJobDate).toBe('2024-02-01T10:00:00.000Z')
    })

    it('should handle deleted jobs (non-completed status)', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {
        jobs: [
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: 100, service: 'Lawn Care' },
          { created_at: '2024-02-01T10:00:00Z', status: 'cancelled', amount: 150, service: 'Lawn Care' }
        ]
      })
      expect(result.jobCount).toBe(1) // Only completed jobs count
      expect(result.averageJobValue).toBe(100)
    })

    it('should handle partial payments', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {
        jobs: [
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: undefined, service: 'Lawn Care' },
          { created_at: '2024-02-01T10:00:00Z', status: 'completed', amount: 100, service: 'Lawn Care' }
        ]
      })
      expect(result.jobCount).toBe(2)
      expect(result.averageJobValue).toBe(100) // Undefined amounts filtered out
    })

    it('should handle no messages', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {
        messages: [],
        jobs: [
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: 100, service: 'Lawn Care' }
        ]
      })
      expect(result.preferredContactMethod).toBeUndefined()
      expect(result.communicationFrequency).toBeUndefined()
    })

    it('should handle many messages', () => {
      const messages = Array.from({ length: 20 }, (_, i) => ({
        created_at: new Date(2024, 0, i + 1).toISOString(),
        direction: (i % 2 === 0 ? 'inbound' : 'outbound') as 'inbound' | 'outbound',
        type: i % 2 === 0 ? 'sms' : 'call'
      }))
      const result = buildCustomerMemory('customer-1', 'business-1', { messages })
      expect(result.preferredContactMethod).toBe('sms') // 10 vs 10, sms wins due to sort order
      expect(result.communicationFrequency).toBeGreaterThan(0)
    })

    it('should require minimum sample size for preferred appointment time', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {
        jobs: [
          { created_at: '2024-01-01T09:00:00Z', status: 'completed', amount: 100, scheduled_date: '2024-01-01T09:00:00Z' }
        ]
      })
      expect(result.preferredAppointmentTime).toBeUndefined() // Only 1 job, minimum is 3
    })

    it('should require minimum sample size for preferred contact method', () => {
      const messages = Array.from({ length: 3 }, (_, i) => ({
        created_at: new Date(2024, 0, i + 1).toISOString(),
        direction: 'inbound' as 'inbound' | 'outbound',
        type: 'sms'
      }))
      const result = buildCustomerMemory('customer-1', 'business-1', { messages })
      expect(result.preferredContactMethod).toBeUndefined() // Only 3 messages, minimum is 5
    })

    it('should handle invalid timestamps', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {
        jobs: [
          { created_at: 'invalid-date', status: 'completed', amount: 100, service: 'Lawn Care' }
        ]
      })
      expect(result.jobCount).toBe(0) // Invalid timestamp filtered out
    })

    it('should produce identical output for identical inputs (deterministic)', () => {
      const input = {
        jobs: [
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: 100, service: 'Lawn Care' },
          { created_at: '2024-02-01T10:00:00Z', status: 'completed', amount: 150, service: 'Lawn Care' }
        ]
      }
      const result1 = buildCustomerMemory('customer-1', 'business-1', input)
      const result2 = buildCustomerMemory('customer-1', 'business-1', input)
      expect(result1.jobCount).toBe(result2.jobCount)
      expect(result1.averageJobValue).toBe(result2.averageJobValue)
      expect(result1.repeatCustomer).toBe(result2.repeatCustomer)
    })

    it('should include provenance metadata', () => {
      const result = buildCustomerMemory('customer-1', 'business-1', {
        jobs: [
          { created_at: '2024-01-01T10:00:00Z', status: 'completed', amount: 100, service: 'Lawn Care' },
          { created_at: '2024-02-01T10:00:00Z', status: 'completed', amount: 150, service: 'Lawn Care' }
        ]
      })
      expect(result.averageJobValueProvenance).toBeDefined()
      expect(result.averageJobValueProvenance?.derivedFrom).toBe('jobs')
      expect(result.averageJobValueProvenance?.sampleSize).toBe(2)
      expect(result.averageJobValueProvenance?.confidence).toBeGreaterThan(0)
      expect(result.lifetimeRevenueProvenance).toBeDefined()
      expect(result.repeatCustomerProvenance).toBeDefined()
    })
  })

  describe('buildBusinessMemory', () => {
    it('should handle no customers gracefully', () => {
      const result = buildBusinessMemory('business-1', {
        customers: 0,
        customerMemories: []
      })
      expect(result.businessId).toBe('business-1')
      expect(result.totalCustomers).toBe(0)
      expect(result.repeatCustomerRate).toBe(0)
    })

    it('should aggregate from multiple customers', () => {
      const customerMemories: CustomerMemory[] = [
        {
          customerId: 'c1',
          businessId: 'business-1',
          updatedAt: new Date().toISOString(),
          repeatCustomer: true,
          jobCount: 2,
          averageJobValue: 100,
          lifetimeRevenue: 200,
          mostRequestedService: 'Lawn Care',
          averageIntervalBetweenJobs: 30
        },
        {
          customerId: 'c2',
          businessId: 'business-1',
          updatedAt: new Date().toISOString(),
          repeatCustomer: false,
          jobCount: 1,
          averageJobValue: 150,
          lifetimeRevenue: 150,
          mostRequestedService: 'Snow Removal',
          averageIntervalBetweenJobs: undefined
        }
      ]
      const result = buildBusinessMemory('business-1', {
        customers: 2,
        customerMemories
      })
      expect(result.totalCustomers).toBe(2)
      expect(result.repeatCustomerRate).toBe(50)
      expect(result.averageJobValue).toBe(125)
    })

    it('should filter customer memories by businessId (tenant safety)', () => {
      const customerMemories: CustomerMemory[] = [
        {
          customerId: 'c1',
          businessId: 'business-1',
          updatedAt: new Date().toISOString(),
          repeatCustomer: true,
          jobCount: 2,
          averageJobValue: 100,
          lifetimeRevenue: 200
        },
        {
          customerId: 'c2',
          businessId: 'business-2', // Different business
          updatedAt: new Date().toISOString(),
          repeatCustomer: true,
          jobCount: 2,
          averageJobValue: 200,
          lifetimeRevenue: 400
        }
      ]
      const result = buildBusinessMemory('business-1', {
        customers: 1,
        customerMemories
      })
      expect(result.averageJobValue).toBe(100) // Only business-1 customer included
    })

    it('should handle division by zero', () => {
      const result = buildBusinessMemory('business-1', {
        customers: 0,
        customerMemories: []
      })
      expect(result.repeatCustomerRate).toBe(0) // 0/0 handled as 0
    })

    it('should produce identical output for identical inputs (deterministic)', () => {
      const customerMemories: CustomerMemory[] = [
        {
          customerId: 'c1',
          businessId: 'business-1',
          updatedAt: new Date().toISOString(),
          repeatCustomer: true,
          jobCount: 2,
          averageJobValue: 100,
          lifetimeRevenue: 200
        }
      ]
      const input = { customers: 1, customerMemories }
      const result1 = buildBusinessMemory('business-1', input)
      const result2 = buildBusinessMemory('business-1', input)
      expect(result1.repeatCustomerRate).toBe(result2.repeatCustomerRate)
      expect(result1.averageJobValue).toBe(result2.averageJobValue)
    })

    it('should include provenance metadata', () => {
      const customerMemories: CustomerMemory[] = [
        {
          customerId: 'c1',
          businessId: 'business-1',
          updatedAt: new Date().toISOString(),
          repeatCustomer: true,
          jobCount: 2,
          averageJobValue: 100,
          lifetimeRevenue: 200
        }
      ]
      const result = buildBusinessMemory('business-1', {
        customers: 1,
        customerMemories
      })
      expect(result.repeatCustomerRateProvenance).toBeDefined()
      expect(result.repeatCustomerRateProvenance?.derivedFrom).toBe('customer_memories')
      expect(result.repeatCustomerRateProvenance?.sampleSize).toBe(1)
    })
  })
})
