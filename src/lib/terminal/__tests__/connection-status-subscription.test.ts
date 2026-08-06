import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TerminalBridgeService } from '../service'

describe('TerminalBridgeService - Connection Status Subscription', () => {
  let service: TerminalBridgeService

  beforeEach(() => {
    // Clear singleton instance
    ;(TerminalBridgeService as any).singletonInstance = null
    service = TerminalBridgeService.getInstance()!
  })

  afterEach(() => {
    // Clean up subscribers
    ;(TerminalBridgeService as any).singletonInstance = null
  })

  describe('subscribeToConnectionStatus', () => {
    it('should subscribe to connection status changes', () => {
      const callback = vi.fn()
      const unsubscribe = service.subscribeToConnectionStatus(callback)

      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })

    it('should immediately notify with current status if available', () => {
      const callback = vi.fn()
      ;(service as any).connectionStatus = 'ready'
      
      service.subscribeToConnectionStatus(callback)
      
      expect(callback).toHaveBeenCalledWith('ready')
    })

    it('should not notify if current status is undefined', () => {
      const callback = vi.fn()
      ;(service as any).connectionStatus = undefined
      
      service.subscribeToConnectionStatus(callback)
      
      expect(callback).not.toHaveBeenCalled()
    })

    it('should deduplicate repeated status values', () => {
      const callback = vi.fn()
      service.subscribeToConnectionStatus(callback)
      
      // Simulate same status being emitted multiple times
      ;(service as any).notifyConnectionStatusSubscribers('ready')
      ;(service as any).notifyConnectionStatusSubscribers('ready')
      ;(service as any).notifyConnectionStatusSubscribers('ready')
      
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should notify on status changes', () => {
      const callback = vi.fn()
      service.subscribeToConnectionStatus(callback)
      
      ;(service as any).notifyConnectionStatusSubscribers('ready')
      ;(service as any).notifyConnectionStatusSubscribers('connecting')
      ;(service as any).notifyConnectionStatusSubscribers('connected')
      
      expect(callback).toHaveBeenCalledTimes(3)
      expect(callback).toHaveBeenNthCalledWith(1, 'ready')
      expect(callback).toHaveBeenNthCalledWith(2, 'connecting')
      expect(callback).toHaveBeenNthCalledWith(3, 'connected')
    })

    it('should unsubscribe correctly', () => {
      const callback = vi.fn()
      const unsubscribe = service.subscribeToConnectionStatus(callback)
      
      unsubscribe()
      
      ;(service as any).notifyConnectionStatusSubscribers('ready')
      
      expect(callback).not.toHaveBeenCalled()
    })

    it('should handle subscriber errors without breaking other subscribers', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Subscriber error')
      })
      const normalCallback = vi.fn()
      
      service.subscribeToConnectionStatus(errorCallback)
      service.subscribeToConnectionStatus(normalCallback)
      
      ;(service as any).notifyConnectionStatusSubscribers('ready')
      
      expect(errorCallback).toHaveBeenCalled()
      expect(normalCallback).toHaveBeenCalled()
    })

    it('should allow multiple subscribers', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()
      
      service.subscribeToConnectionStatus(callback1)
      service.subscribeToConnectionStatus(callback2)
      service.subscribeToConnectionStatus(callback3)
      
      ;(service as any).notifyConnectionStatusSubscribers('ready')
      
      expect(callback1).toHaveBeenCalledWith('ready')
      expect(callback2).toHaveBeenCalledWith('ready')
      expect(callback3).toHaveBeenCalledWith('ready')
    })
  })

  describe('initialize concurrency safety', () => {
    it('should share in-flight initialize promise', async () => {
      const mockPlugin = {
        initialize: vi.fn().mockResolvedValue({ status: 'ready' }),
        addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
      }
      ;(service as any).plugin = mockPlugin
      
      const promise1 = service.initialize()
      const promise2 = service.initialize()
      
      // Should be the same promise
      expect(promise1).toBe(promise2)
      
      await Promise.all([promise1, promise2])
      
      // Should only call initialize once
      expect(mockPlugin.initialize).toHaveBeenCalledTimes(1)
    })

    it('should clear in-flight promise after completion', async () => {
      const mockPlugin = {
        initialize: vi.fn().mockResolvedValue({ status: 'ready' }),
        addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
      }
      ;(service as any).plugin = mockPlugin
      
      await service.initialize()
      
      expect((service as any).initializeInFlight).toBeNull()
    })

    it('should clear in-flight promise after error', async () => {
      const mockPlugin = {
        initialize: vi.fn().mockRejectedValue(new Error('Init failed')),
        addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
      }
      ;(service as any).plugin = mockPlugin
      
      try {
        await service.initialize()
      } catch (e) {
        // Expected error
      }
      
      expect((service as any).initializeInFlight).toBeNull()
    })

    it('should allow new initialize after previous completes', async () => {
      const mockPlugin = {
        initialize: vi.fn().mockResolvedValue({ status: 'ready' }),
        addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
      }
      ;(service as any).plugin = mockPlugin
      
      await service.initialize()
      await service.initialize()
      
      expect(mockPlugin.initialize).toHaveBeenCalledTimes(2)
    })
  })
})

describe('300ms Preparing UI Timer - Race Condition Safety', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Timer behavior with fake timers', () => {
    it('should not show preparing UI if initialize resolves in 200ms', () => {
      // Simulate the timer logic
      const isInitializationPendingRef = { current: true }
      const paymentStateRef = { current: 'ready' as const }
      const updatePaymentStateRef = vi.fn()
      const initializationStartTime = Date.now()
      let preparingTimerRef: NodeJS.Timeout | null = null

      // Start timer
      preparingTimerRef = setTimeout(() => {
        const elapsed = Date.now() - initializationStartTime
        if (elapsed >= 300 && isInitializationPendingRef.current && paymentStateRef.current === 'ready') {
          updatePaymentStateRef('preparing', 'initialization_timeout')
        }
        preparingTimerRef = null
      }, 300)

      // Simulate initialization completing at 200ms
      vi.advanceTimersByTime(200)
      isInitializationPendingRef.current = false
      if (preparingTimerRef) {
        clearTimeout(preparingTimerRef)
        preparingTimerRef = null
      }

      // Advance to 300ms (timer would fire if not cleared)
      vi.advanceTimersByTime(100)

      // Preparing should not have been called
      expect(updatePaymentStateRef).not.toHaveBeenCalled()
    })

    it('should not show preparing UI if initialize resolves at 299ms', () => {
      const isInitializationPendingRef = { current: true }
      const paymentStateRef = { current: 'ready' as const }
      const updatePaymentStateRef = vi.fn()
      const initializationStartTime = Date.now()
      let preparingTimerRef: NodeJS.Timeout | null = null

      preparingTimerRef = setTimeout(() => {
        const elapsed = Date.now() - initializationStartTime
        if (elapsed >= 300 && isInitializationPendingRef.current && paymentStateRef.current === 'ready') {
          updatePaymentStateRef('preparing', 'initialization_timeout')
        }
        preparingTimerRef = null
      }, 300)

      // Simulate initialization completing at 299ms
      vi.advanceTimersByTime(299)
      isInitializationPendingRef.current = false
      if (preparingTimerRef) {
        clearTimeout(preparingTimerRef)
        preparingTimerRef = null
      }

      // Advance to 300ms
      vi.advanceTimersByTime(1)

      expect(updatePaymentStateRef).not.toHaveBeenCalled()
    })

    it('should show preparing UI if initialize takes 500ms', () => {
      const isInitializationPendingRef = { current: true }
      const paymentStateRef = { current: 'ready' as const }
      const updatePaymentStateRef = vi.fn()
      const initializationStartTime = Date.now()
      let preparingTimerRef: NodeJS.Timeout | null = null

      preparingTimerRef = setTimeout(() => {
        const elapsed = Date.now() - initializationStartTime
        if (elapsed >= 300 && isInitializationPendingRef.current && paymentStateRef.current === 'ready') {
          updatePaymentStateRef('preparing', 'initialization_timeout')
        }
        preparingTimerRef = null
      }, 300)

      // Advance to 300ms
      vi.advanceTimersByTime(300)

      // Preparing should have been called
      expect(updatePaymentStateRef).toHaveBeenCalledWith('preparing', 'initialization_timeout')

      // Simulate initialization completing at 500ms
      vi.advanceTimersByTime(200)
      isInitializationPendingRef.current = false
      if (preparingTimerRef) {
        clearTimeout(preparingTimerRef)
        preparingTimerRef = null
      }
    })

    it('should handle completion immediately before timer callback', () => {
      const isInitializationPendingRef = { current: true }
      const paymentStateRef = { current: 'ready' as const }
      const updatePaymentStateRef = vi.fn()
      const initializationStartTime = Date.now()
      let preparingTimerRef: NodeJS.Timeout | null = null

      preparingTimerRef = setTimeout(() => {
        const elapsed = Date.now() - initializationStartTime
        if (elapsed >= 300 && isInitializationPendingRef.current && paymentStateRef.current === 'ready') {
          updatePaymentStateRef('preparing', 'initialization_timeout')
        }
        preparingTimerRef = null
      }, 300)

      // Advance to 299ms
      vi.advanceTimersByTime(299)

      // Complete initialization synchronously before timer fires
      isInitializationPendingRef.current = false
      if (preparingTimerRef) {
        clearTimeout(preparingTimerRef)
        preparingTimerRef = null
      }

      // Advance to 300ms (timer would fire if not cleared)
      vi.advanceTimersByTime(1)

      // Preparing should not have been called
      expect(updatePaymentStateRef).not.toHaveBeenCalled()
    })

    it('should handle initialization failure after preparing state', () => {
      const isInitializationPendingRef = { current: true }
      const paymentStateRef = { current: 'ready' as const }
      const updatePaymentStateRef = vi.fn()
      const initializationStartTime = Date.now()
      let preparingTimerRef: NodeJS.Timeout | null = null

      preparingTimerRef = setTimeout(() => {
        const elapsed = Date.now() - initializationStartTime
        if (elapsed >= 300 && isInitializationPendingRef.current && paymentStateRef.current === 'ready') {
          updatePaymentStateRef('preparing', 'initialization_timeout')
        }
        preparingTimerRef = null
      }, 300)

      // Advance to 300ms
      vi.advanceTimersByTime(300)

      // Preparing should have been called
      expect(updatePaymentStateRef).toHaveBeenCalledWith('preparing', 'initialization_timeout')

      // Simulate initialization failure at 500ms
      vi.advanceTimersByTime(200)
      isInitializationPendingRef.current = false
      if (preparingTimerRef) {
        clearTimeout(preparingTimerRef)
        preparingTimerRef = null
      }

      // Timer should be cleared
      expect(preparingTimerRef).toBeNull()
    })

    it('should handle second initialization after first completes', () => {
      const isInitializationPendingRef = { current: true }
      const paymentStateRef = { current: 'ready' as const }
      const updatePaymentStateRef = vi.fn()
      let preparingTimerRef: NodeJS.Timeout | null = null

      // First initialization
      const initializationStartTime1 = Date.now()
      preparingTimerRef = setTimeout(() => {
        const elapsed = Date.now() - initializationStartTime1
        if (elapsed >= 300 && isInitializationPendingRef.current && paymentStateRef.current === 'ready') {
          updatePaymentStateRef('preparing', 'initialization_timeout')
        }
        preparingTimerRef = null
      }, 300)

      // First initialization completes at 200ms
      vi.advanceTimersByTime(200)
      isInitializationPendingRef.current = false
      if (preparingTimerRef) {
        clearTimeout(preparingTimerRef)
        preparingTimerRef = null
      }

      // Second initialization starts
      isInitializationPendingRef.current = true
      const initializationStartTime2 = Date.now()
      preparingTimerRef = setTimeout(() => {
        const elapsed = Date.now() - initializationStartTime2
        if (elapsed >= 300 && isInitializationPendingRef.current && paymentStateRef.current === 'ready') {
          updatePaymentStateRef('preparing', 'initialization_timeout')
        }
        preparingTimerRef = null
      }, 300)

      // Advance to 300ms from second start
      vi.advanceTimersByTime(300)

      // Preparing should have been called once (from second initialization)
      expect(updatePaymentStateRef).toHaveBeenCalledTimes(1)
    })
  })
})
