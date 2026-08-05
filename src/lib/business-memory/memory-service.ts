import { CustomerMemory, BusinessMemory } from './types'
import { buildCustomerMemory, buildBusinessMemory, buildMemory } from './memory-builder'

/**
 * Memory Service manages the state of business and customer memory
 * It provides caching and refresh capabilities
 * 
 * Cache Behavior:
 * - Duration: 5 minutes (300,000ms)
 * - Invalidation: Manual via invalidate methods, automatic on expiration
 * - Cache keys: Composite (businessId:customerId) for tenant safety
 * - Cache misses: Return null, caller must refresh
 * - Cache rebuild: Automatic on refresh methods
 * 
 * Tenant Safety:
 * - All cache keys include businessId
 * - businessId validated on get/set operations
 * - Cross-business memory access prevented
 * - Singleton service safe for multi-tenant use
 */
class MemoryService {
  private customerMemoryCache: Map<string, CustomerMemory> = new Map()
  private businessMemoryCache: Map<string, BusinessMemory> = new Map()
  private readonly cacheValidDuration = 5 * 60 * 1000 // 5 minutes
  private lastRefreshTime: Map<string, number> = new Map()

  /**
   * Create tenant-safe cache key for customer memory
   */
  private customerCacheKey(businessId: string, customerId: string): string {
    return `${businessId}:${customerId}`
  }

  /**
   * Get customer memory for a specific customer
   * Tenant-safe: requires businessId to prevent cross-business leakage
   */
  getCustomerMemory(businessId: string, customerId: string): CustomerMemory | null {
    const cacheKey = this.customerCacheKey(businessId, customerId)
    const cached = this.customerMemoryCache.get(cacheKey)
    if (!cached) return null

    // Validate tenant safety: cached memory must belong to the business
    if (cached.businessId !== businessId) {
      this.customerMemoryCache.delete(cacheKey)
      this.lastRefreshTime.delete(cacheKey)
      return null
    }

    const lastRefresh = this.lastRefreshTime.get(cacheKey) || 0
    const now = Date.now()

    // Return cached if valid
    if (now - lastRefresh < this.cacheValidDuration) {
      return cached
    }

    // Cache expired, clear it
    this.customerMemoryCache.delete(cacheKey)
    this.lastRefreshTime.delete(cacheKey)
    return null
  }

  /**
   * Set customer memory (cache it)
   * Tenant-safe: validates businessId before caching
   */
  setCustomerMemory(businessId: string, customerId: string, memory: CustomerMemory): void {
    // Validate tenant safety
    if (memory.businessId !== businessId) {
      throw new Error(`Tenant safety violation: memory.businessId (${memory.businessId}) does not match provided businessId (${businessId})`)
    }
    const cacheKey = this.customerCacheKey(businessId, customerId)
    this.customerMemoryCache.set(cacheKey, memory)
    this.lastRefreshTime.set(cacheKey, Date.now())
  }

  /**
   * Get business memory for a specific business
   */
  getBusinessMemory(businessId: string): BusinessMemory | null {
    const cached = this.businessMemoryCache.get(businessId)
    if (!cached) return null

    const lastRefresh = this.lastRefreshTime.get(`business-${businessId}`) || 0
    const now = Date.now()

    // Return cached if valid
    if (now - lastRefresh < this.cacheValidDuration) {
      return cached
    }

    // Cache expired, clear it
    this.businessMemoryCache.delete(businessId)
    this.lastRefreshTime.delete(`business-${businessId}`)
    return null
  }

  /**
   * Set business memory (cache it)
   */
  setBusinessMemory(businessId: string, memory: BusinessMemory): void {
    this.businessMemoryCache.set(businessId, memory)
    this.lastRefreshTime.set(`business-${businessId}`, Date.now())
  }

  /**
   * Refresh customer memory from raw data
   * Tenant-safe: validates businessId
   */
  async refreshCustomerMemory(
    businessId: string,
    customerId: string,
    dataFetcher: () => Promise<{
      messages?: Array<{ created_at: string; direction: 'inbound' | 'outbound'; type?: string }>
      jobs?: Array<{ created_at: string; status: string; amount?: number; service?: string; scheduled_date?: string }>
      payments?: Array<{ created_at: string; amount: number; status: string }>
    }>
  ): Promise<CustomerMemory> {
    const data = await dataFetcher()
    const memory = buildCustomerMemory(customerId, businessId, data)
    this.setCustomerMemory(businessId, customerId, memory)
    return memory
  }

  /**
   * Refresh business memory from raw data
   * Tenant-safe: validates businessId in built memory
   */
  async refreshBusinessMemory(
    businessId: string,
    dataFetcher: () => Promise<{
      customers: number
      customerMemories: CustomerMemory[]
      jobs?: Array<{ created_at: string; status: string; amount?: number; service?: string; scheduled_date?: string }>
      payments?: Array<{ created_at: string; amount: number; status: string }>
    }>
  ): Promise<BusinessMemory> {
    const data = await dataFetcher()
    const memory = buildBusinessMemory(businessId, data)
    // Validate tenant safety
    if (memory.businessId !== businessId) {
      throw new Error(`Tenant safety violation: memory.businessId (${memory.businessId}) does not match provided businessId (${businessId})`)
    }
    this.setBusinessMemory(businessId, memory)
    return memory
  }

  /**
   * Invalidate cache for a specific customer
   * Tenant-safe: requires businessId
   */
  invalidateCustomerMemory(businessId: string, customerId: string): void {
    const cacheKey = this.customerCacheKey(businessId, customerId)
    this.customerMemoryCache.delete(cacheKey)
    this.lastRefreshTime.delete(cacheKey)
  }

  /**
   * Invalidate cache for a specific business
   */
  invalidateBusinessMemory(businessId: string): void {
    this.businessMemoryCache.delete(businessId)
    this.lastRefreshTime.delete(`business-${businessId}`)
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.customerMemoryCache.clear()
    this.businessMemoryCache.clear()
    this.lastRefreshTime.clear()
  }
}

// Singleton instance
export const memoryService = new MemoryService()
