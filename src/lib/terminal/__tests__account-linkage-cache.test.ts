/**
 * Terminal Account Linkage Cache Tests
 *
 * Tests for warm-start performance optimization:
 * Account linkage status is cached once linked to avoid repeated native calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Terminal Account Linkage Cache', () => {
  let terminalService: any
  let mockPlugin: any

  beforeEach(() => {
    mockPlugin = {
      isTapToPayAccountLinked: vi.fn(),
    }
    
    // Mock TerminalBridgeService with minimal implementation
    terminalService = {
      plugin: mockPlugin,
      cachedAccountLinked: null,
      sessionId: 'test-session',
      clearAccountLinkedCache() {
        this.cachedAccountLinked = null
      },
      async isTapToPayAccountLinked(options?: { onBehalfOf?: string }) {
        if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
        
        // Safe optimization: if we've cached "linked" status, return it immediately
        if (this.cachedAccountLinked === true) {
          return { isLinked: true }
        }
        
        const result = await this.plugin.isTapToPayAccountLinked(options)
        
        // Cache the result if linked
        if (result.isLinked) {
          this.cachedAccountLinked = true
        }
        
        return result
      },
    }
  })

  describe('Cache Behavior', () => {
    it('should cache linked status after first successful check', async () => {
      mockPlugin.isTapToPayAccountLinked.mockResolvedValue({ isLinked: true })
      
      const result1 = await terminalService.isTapToPayAccountLinked()
      expect(result1.isLinked).toBe(true)
      expect(terminalService.cachedAccountLinked).toBe(true)
      expect(mockPlugin.isTapToPayAccountLinked).toHaveBeenCalledTimes(1)
      
      // Second call should use cache
      const result2 = await terminalService.isTapToPayAccountLinked()
      expect(result2.isLinked).toBe(true)
      expect(mockPlugin.isTapToPayAccountLinked).toHaveBeenCalledTimes(1) // No additional call
    })

    it('should not cache not-linked status', async () => {
      mockPlugin.isTapToPayAccountLinked.mockResolvedValue({ isLinked: false })
      
      const result1 = await terminalService.isTapToPayAccountLinked()
      expect(result1.isLinked).toBe(false)
      expect(terminalService.cachedAccountLinked).toBe(null)
      
      // Second call should still check native (no cache)
      const result2 = await terminalService.isTapToPayAccountLinked()
      expect(result2.isLinked).toBe(false)
      expect(mockPlugin.isTapToPayAccountLinked).toHaveBeenCalledTimes(2)
    })

    it('should clear cache when explicitly requested', async () => {
      mockPlugin.isTapToPayAccountLinked.mockResolvedValue({ isLinked: true })
      
      // First call caches the result
      await terminalService.isTapToPayAccountLinked()
      expect(terminalService.cachedAccountLinked).toBe(true)
      expect(mockPlugin.isTapToPayAccountLinked).toHaveBeenCalledTimes(1)
      
      // Clear cache
      terminalService.clearAccountLinkedCache()
      expect(terminalService.cachedAccountLinked).toBe(null)
      
      // Next call should check native again
      await terminalService.isTapToPayAccountLinked()
      expect(mockPlugin.isTapToPayAccountLinked).toHaveBeenCalledTimes(2)
    })

    it('should handle cache clearing when not linked', async () => {
      mockPlugin.isTapToPayAccountLinked.mockResolvedValue({ isLinked: false })
      
      await terminalService.isTapToPayAccountLinked()
      expect(terminalService.cachedAccountLinked).toBe(null)
      
      // Clear cache when null should be safe
      terminalService.clearAccountLinkedCache()
      expect(terminalService.cachedAccountLinked).toBe(null)
    })
  })

  describe('Safety Guarantees', () => {
    it('should still perform native check when cache is null', async () => {
      mockPlugin.isTapToPayAccountLinked.mockResolvedValue({ isLinked: false })
      
      const result = await terminalService.isTapToPayAccountLinked()
      expect(result.isLinked).toBe(false)
      expect(mockPlugin.isTapToPayAccountLinked).toHaveBeenCalledTimes(1)
    })

    it('should handle native check errors without caching', async () => {
      mockPlugin.isTapToPayAccountLinked.mockRejectedValue(new Error('Native error'))
      
      await expect(terminalService.isTapToPayAccountLinked()).rejects.toThrow('Native error')
      expect(terminalService.cachedAccountLinked).toBe(null)
    })

    it('should not cache false status even if native returns false multiple times', async () => {
      mockPlugin.isTapToPayAccountLinked.mockResolvedValue({ isLinked: false })
      
      await terminalService.isTapToPayAccountLinked()
      await terminalService.isTapToPayAccountLinked()
      await terminalService.isTapToPayAccountLinked()
      
      expect(terminalService.cachedAccountLinked).toBe(null)
      expect(mockPlugin.isTapToPayAccountLinked).toHaveBeenCalledTimes(3)
    })

    it('should transition from not-linked to linked correctly', async () => {
      // First call: not linked
      mockPlugin.isTapToPayAccountLinked.mockResolvedValueOnce({ isLinked: false })
      const result1 = await terminalService.isTapToPayAccountLinked()
      expect(result1.isLinked).toBe(false)
      expect(terminalService.cachedAccountLinked).toBe(null)
      
      // Second call: linked (after T&C enablement)
      mockPlugin.isTapToPayAccountLinked.mockResolvedValueOnce({ isLinked: true })
      const result2 = await terminalService.isTapToPayAccountLinked()
      expect(result2.isLinked).toBe(true)
      expect(terminalService.cachedAccountLinked).toBe(true)
      
      // Third call: should use cache
      const result3 = await terminalService.isTapToPayAccountLinked()
      expect(result3.isLinked).toBe(true)
      expect(mockPlugin.isTapToPayAccountLinked).toHaveBeenCalledTimes(2)
    })
  })

  describe('Performance Impact', () => {
    it('should skip native call on subsequent checks after linking', async () => {
      mockPlugin.isTapToPayAccountLinked.mockResolvedValue({ isLinked: true })
      
      // First call: native check + cache
      await terminalService.isTapToPayAccountLinked()
      expect(mockPlugin.isTapToPayAccountLinked).toHaveBeenCalledTimes(1)
      
      // Subsequent calls: cache hit, no native call
      await terminalService.isTapToPayAccountLinked()
      await terminalService.isTapToPayAccountLinked()
      await terminalService.isTapToPayAccountLinked()
      
      expect(mockPlugin.isTapToPayAccountLinked).toHaveBeenCalledTimes(1)
    })
  })
})