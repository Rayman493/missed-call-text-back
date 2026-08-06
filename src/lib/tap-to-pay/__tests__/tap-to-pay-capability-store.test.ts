import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Capacitor } from '@capacitor/core'
import tapToPayCapabilityStore from '../tap-to-pay-capability-store'
import ReplyflowStripeTerminal from '@/lib/terminal'

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
}))

// Mock ReplyflowStripeTerminal
vi.mock('@/lib/terminal', () => ({
  default: {
    getTapToPaySupportStatus: vi.fn(),
  },
}))

const mockReplyflowStripeTerminal = ReplyflowStripeTerminal as any

describe('TapToPayCapabilityStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tapToPayCapabilityStore.clearCache()
  })

  afterEach(() => {
    tapToPayCapabilityStore.clearCache()
  })

  describe('single consumer', () => {
    it('should return cached result within cache duration', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
        deviceInfo: {
          checkMethod: 'PaymentCardReader.isSupported',
        },
      })

      // First call
      const result1 = await tapToPayCapabilityStore.checkCapability()
      expect(mockReplyflowStripeTerminal.getTapToPaySupportStatus).toHaveBeenCalledTimes(1)
      expect(result1?.status).toBe('supported')

      // Second call within cache duration - should not call native plugin
      const result2 = await tapToPayCapabilityStore.checkCapability()
      expect(mockReplyflowStripeTerminal.getTapToPaySupportStatus).toHaveBeenCalledTimes(1)
      expect(result2?.status).toBe('supported')
    })

    it('should bypass cache with forceRefresh', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
      })

      // First call
      await tapToPayCapabilityStore.checkCapability()
      expect(mockReplyflowStripeTerminal.getTapToPaySupportStatus).toHaveBeenCalledTimes(1)

      // Second call with forceRefresh
      await tapToPayCapabilityStore.checkCapability({ forceRefresh: true })
      expect(mockReplyflowStripeTerminal.getTapToPaySupportStatus).toHaveBeenCalledTimes(2)
    })

    it('should return unavailable for non-iOS platforms', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('web')

      const result = await tapToPayCapabilityStore.checkCapability()
      expect(mockReplyflowStripeTerminal.getTapToPaySupportStatus).not.toHaveBeenCalled()
      expect(result?.status).toBe('unavailable')
      expect(result?.platform).toBe('web')
    })

    it('should return unavailable for Android', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android')

      const result = await tapToPayCapabilityStore.checkCapability()
      expect(mockReplyflowStripeTerminal.getTapToPaySupportStatus).not.toHaveBeenCalled()
      expect(result?.status).toBe('unavailable')
      expect(result?.platform).toBe('android')
    })

    it('should handle native plugin errors', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockRejectedValue(new Error('Plugin error'))

      const result = await tapToPayCapabilityStore.checkCapability()
      expect(result?.status).toBe('unknown')
      expect(result?.unsupportedReason).toBe('capability_check_failed')
    })
  })

  describe('concurrent consumers', () => {
    it('should share in-flight promise for concurrent calls', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      
      let resolveCount = 0
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockImplementation(
        () => new Promise(resolve => {
          resolveCount++
          setTimeout(() => resolve({
            status: 'supported',
            supported: true,
            platform: 'ios',
          }), 50)
        })
      )

      // Start multiple concurrent calls
      const promise1 = tapToPayCapabilityStore.checkCapability()
      const promise2 = tapToPayCapabilityStore.checkCapability()
      const promise3 = tapToPayCapabilityStore.checkCapability()

      await Promise.all([promise1, promise2, promise3])

      // Should only call native plugin once for all concurrent calls
      expect(resolveCount).toBe(1)
      expect(mockReplyflowStripeTerminal.getTapToPaySupportStatus).toHaveBeenCalledTimes(1)
    })

    it('should update all subscribers when result changes', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
      })

      const listener1Results: any[] = []
      const listener2Results: any[] = []

      const unsubscribe1 = tapToPayCapabilityStore.subscribe((state) => {
        listener1Results.push(state)
      })

      const unsubscribe2 = tapToPayCapabilityStore.subscribe((state) => {
        listener2Results.push(state)
      })

      await tapToPayCapabilityStore.checkCapability()

      // Both listeners should receive the updated state
      expect(listener1Results.length).toBeGreaterThan(1)
      expect(listener2Results.length).toBeGreaterThan(1)
      expect(listener1Results[listener1Results.length - 1].status?.status).toBe('supported')
      expect(listener2Results[listener2Results.length - 1].status?.status).toBe('supported')

      unsubscribe1()
      unsubscribe2()
    })

    it('should not overwrite newer result with stale earlier result', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      
      let callCount = 0
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockImplementation(
        () => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({
              status: 'unsupported_device',
              supported: false,
              platform: 'ios',
              unsupportedReason: 'unsupported_device_type',
            })
          } else {
            return Promise.resolve({
              status: 'supported',
              supported: true,
              platform: 'ios',
            })
          }
        }
      )

      // First call returns unsupported
      const result1 = await tapToPayCapabilityStore.checkCapability()
      expect(result1?.status).toBe('unsupported_device')

      // Force refresh returns supported
      const result2 = await tapToPayCapabilityStore.checkCapability({ forceRefresh: true })
      expect(result2?.status).toBe('supported')

      // Verify the store has the newer result
      const state = tapToPayCapabilityStore.getState()
      expect(state.status?.status).toBe('supported')
    })
  })

  describe('subscription lifecycle', () => {
    it('should stop notifying after unsubscribe', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
      })

      const listenerResults: any[] = []
      const unsubscribe = tapToPayCapabilityStore.subscribe((state) => {
        listenerResults.push(state)
      })

      await tapToPayCapabilityStore.checkCapability()
      const countBeforeUnsubscribe = listenerResults.length

      unsubscribe()

      // Force refresh after unsubscribe
      await tapToPayCapabilityStore.checkCapability({ forceRefresh: true })

      // Listener should not receive new updates
      expect(listenerResults.length).toBe(countBeforeUnsubscribe)
    })

    it('should allow multiple subscribers independently', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
      })

      const listener1Results: any[] = []
      const listener2Results: any[] = []

      const unsubscribe1 = tapToPayCapabilityStore.subscribe((state) => {
        listener1Results.push(state)
      })

      await tapToPayCapabilityStore.checkCapability()

      const unsubscribe2 = tapToPayCapabilityStore.subscribe((state) => {
        listener2Results.push(state)
      })

      // Listener2 should receive current state immediately
      expect(listener2Results.length).toBe(1)

      unsubscribe1()
      unsubscribe2()
    })

    it('should unmounting one consumer does not clear shared result', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
      })

      const unsubscribe1 = tapToPayCapabilityStore.subscribe(() => {})
      const unsubscribe2 = tapToPayCapabilityStore.subscribe(() => {})

      await tapToPayCapabilityStore.checkCapability()

      // Unmount one consumer
      unsubscribe1()

      // Result should still be in store
      const state = tapToPayCapabilityStore.getState()
      expect(state.status?.status).toBe('supported')
      expect(state.lastChecked).not.toBeNull()

      unsubscribe2()
    })
  })

  describe('retry functionality', () => {
    it('should update all consumers on retry', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      
      mockReplyflowStripeTerminal.getTapToPaySupportStatus
        .mockResolvedValueOnce({
          status: 'unknown',
          supported: false,
          platform: 'ios',
          unsupportedReason: 'capability_check_failed',
        })
        .mockResolvedValueOnce({
          status: 'supported',
          supported: true,
          platform: 'ios',
        })

      const listener1Results: any[] = []
      const listener2Results: any[] = []

      const unsubscribe1 = tapToPayCapabilityStore.subscribe((state) => {
        listener1Results.push(state)
      })

      const unsubscribe2 = tapToPayCapabilityStore.subscribe((state) => {
        listener2Results.push(state)
      })

      // Initial check returns unknown
      await tapToPayCapabilityStore.checkCapability()
      expect(listener1Results[listener1Results.length - 1].status?.status).toBe('unknown')
      expect(listener2Results[listener2Results.length - 1].status?.status).toBe('unknown')

      // Retry returns supported
      await tapToPayCapabilityStore.checkCapability({ forceRefresh: true })
      expect(listener1Results[listener1Results.length - 1].status?.status).toBe('supported')
      expect(listener2Results[listener2Results.length - 1].status?.status).toBe('supported')

      unsubscribe1()
      unsubscribe2()
    })

    it('should handle failed retry gracefully', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      
      mockReplyflowStripeTerminal.getTapToPaySupportStatus
        .mockResolvedValueOnce({
          status: 'supported',
          supported: true,
          platform: 'ios',
        })
        .mockRejectedValueOnce(new Error('Retry failed'))

      const listenerResults: any[] = []
      const unsubscribe = tapToPayCapabilityStore.subscribe((state) => {
        listenerResults.push(state)
      })

      // Initial check succeeds
      await tapToPayCapabilityStore.checkCapability()
      expect(listenerResults[listenerResults.length - 1].status?.status).toBe('supported')

      // Retry fails
      await tapToPayCapabilityStore.checkCapability({ forceRefresh: true })
      expect(listenerResults[listenerResults.length - 1].status?.status).toBe('unknown')
      expect(listenerResults[listenerResults.length - 1].error).not.toBeNull()

      unsubscribe()
    })
  })

  describe('cache management', () => {
    it('should clear cache on clearCache call', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
      })

      await tapToPayCapabilityStore.checkCapability()

      let state = tapToPayCapabilityStore.getState()
      expect(state.status).not.toBeNull()
      expect(state.lastChecked).not.toBeNull()

      tapToPayCapabilityStore.clearCache()

      state = tapToPayCapabilityStore.getState()
      expect(state.status).toBeNull()
      expect(state.lastChecked).toBeNull()
      expect(state.isLoading).toBe(false)
    })

    it('should expire cache after duration', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
      })

      // First call
      await tapToPayCapabilityStore.checkCapability()
      expect(mockReplyflowStripeTerminal.getTapToPaySupportStatus).toHaveBeenCalledTimes(1)

      // Wait for cache to expire (11 seconds, cache is 10 seconds)
      await new Promise(resolve => setTimeout(resolve, 11000))

      // Second call after cache expires
      await tapToPayCapabilityStore.checkCapability()
      expect(mockReplyflowStripeTerminal.getTapToPaySupportStatus).toHaveBeenCalledTimes(2)
    })
  })

  describe('loading state', () => {
    it('should set loading state during check', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          status: 'supported',
          supported: true,
          platform: 'ios',
        }), 50))
      )

      const loadingStates: boolean[] = []
      const unsubscribe = tapToPayCapabilityStore.subscribe((state) => {
        loadingStates.push(state.isLoading)
      })

      const checkPromise = tapToPayCapabilityStore.checkCapability()
      
      // Should be loading during check
      const loadingState = tapToPayCapabilityStore.getState()
      expect(loadingState.isLoading).toBe(true)

      await checkPromise

      // Should not be loading after check completes
      const finalState = tapToPayCapabilityStore.getState()
      expect(finalState.isLoading).toBe(false)

      unsubscribe()
    })
  })
})
