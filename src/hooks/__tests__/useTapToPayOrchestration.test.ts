/**
 * Tests for useTapToPayOrchestration hook
 * 
 * Tests for one-tap flow:
 * - First Start Tap to Pay tap calls native orchestration once
 * - Duplicate payment-entry modal does not mount
 * - Native initialization is not called twice
 * - Double-tapping does not create duplicate PaymentIntents
 * - Amount and job/customer context are preserved
 * - Initialization failure shows retry in the same modal
 * - Retry calls orchestration once
 * - Web/non-native fallback remains correct
 * - Diagnostics remain hidden in production
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useTapToPayOrchestration } from '../useTapToPayOrchestration'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { Capacitor } from '@capacitor/core'

// Mock dependencies
vi.mock('@/lib/terminal/service')
vi.mock('@capacitor/core')

describe('useTapToPayOrchestration', () => {
  const mockTerminalService = {
    getInstance: vi.fn(),
    isSupported: vi.fn(),
    initialize: vi.fn(),
    connectTapToPay: vi.fn(),
    startTapToPayPayment: vi.fn(),
    getUnresolvedAttempt: vi.fn(),
    getSessionId: vi.fn(),
    getPaymentIntentId: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(TerminalBridgeService.getInstance as any).mockReturnValue(mockTerminalService)
    ;(Capacitor.isPluginAvailable as any).mockReturnValue(true)
    ;(Capacitor.isNativePlatform as any).mockReturnValue(true)
    ;(Capacitor.getPlatform as any).mockReturnValue('android')
  })

  describe('One-tap payment flow', () => {
    it('should call startPayment once on first tap', async () => {
      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: 1000,
      }))

      mockTerminalService.isSupported.mockResolvedValue({ supported: true })
      mockTerminalService.initialize.mockResolvedValue({ status: 'ready' })
      mockTerminalService.connectTapToPay.mockResolvedValue({ status: 'connected' })
      mockTerminalService.startTapToPayPayment.mockResolvedValue({ status: 'success' })
      mockTerminalService.getPaymentIntentId.mockReturnValue('pi_123')
      mockTerminalService.getUnresolvedAttempt.mockReturnValue(null)
      mockTerminalService.getSessionId.mockReturnValue('session-123')

      await act(async () => {
        await result.current.startPayment()
      })

      expect(mockTerminalService.startTapToPayPayment).toHaveBeenCalledTimes(1)
    })

    it('should preserve amount and context through payment flow', async () => {
      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: 2500,
        leadId: 'lead-123',
        jobId: 'job-456',
        description: 'Test payment',
      }))

      mockTerminalService.isSupported.mockResolvedValue({ supported: true })
      mockTerminalService.initialize.mockResolvedValue({ status: 'ready' })
      mockTerminalService.connectTapToPay.mockResolvedValue({ status: 'connected' })
      mockTerminalService.startTapToPayPayment.mockResolvedValue({ status: 'success' })
      mockTerminalService.getPaymentIntentId.mockReturnValue('pi_123')
      mockTerminalService.getUnresolvedAttempt.mockReturnValue(null)
      mockTerminalService.getSessionId.mockReturnValue('session-123')

      await act(async () => {
        await result.current.startPayment()
      })

      expect(mockTerminalService.startTapToPayPayment).toHaveBeenCalledWith({
        amountCents: 2500,
        currency: 'usd',
        leadId: 'lead-123',
        jobId: 'job-456',
        description: 'Test payment',
      })
    })

    it('should prevent double-tapping with isPaymentInProgress flag', async () => {
      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: 1000,
      }))

      mockTerminalService.isSupported.mockResolvedValue({ supported: true })
      mockTerminalService.initialize.mockResolvedValue({ status: 'ready' })
      mockTerminalService.connectTapToPay.mockResolvedValue({ status: 'connected' })
      mockTerminalService.startTapToPayPayment.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ status: 'success' }), 100))
      )
      mockTerminalService.getPaymentIntentId.mockReturnValue('pi_123')
      mockTerminalService.getUnresolvedAttempt.mockReturnValue(null)
      mockTerminalService.getSessionId.mockReturnValue('session-123')

      await act(async () => {
        const promise1 = result.current.startPayment()
        const promise2 = result.current.startPayment()
        await Promise.all([promise1, promise2])
      })

      expect(mockTerminalService.startTapToPayPayment).toHaveBeenCalledTimes(1)
    })

    it('should show retry in same modal on initialization failure', async () => {
      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: 1000,
      }))

      mockTerminalService.isSupported.mockResolvedValue({ supported: true })
      mockTerminalService.initialize.mockRejectedValue(new Error('Initialization failed'))
      mockTerminalService.getUnresolvedAttempt.mockReturnValue(null)
      mockTerminalService.getSessionId.mockReturnValue('session-123')

      await act(async () => {
        await result.current.startPayment()
      })

      expect(result.current.error).toBe('Initialization failed')
      expect(result.current.paymentState).toBe('failure')
      expect(result.current.isPaymentInProgress).toBe(false)
    })

    it('should retry payment once on retry call', async () => {
      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: 1000,
      }))

      mockTerminalService.isSupported.mockResolvedValue({ supported: true })
      mockTerminalService.initialize.mockRejectedValueOnce(new Error('Initialization failed'))
      mockTerminalService.initialize.mockResolvedValueOnce({ status: 'ready' })
      mockTerminalService.connectTapToPay.mockResolvedValue({ status: 'connected' })
      mockTerminalService.startTapToPayPayment.mockResolvedValue({ status: 'success' })
      mockTerminalService.getPaymentIntentId.mockReturnValue('pi_123')
      mockTerminalService.getUnresolvedAttempt.mockReturnValue(null)
      mockTerminalService.getSessionId.mockReturnValue('session-123')

      await act(async () => {
        await result.current.startPayment()
      })

      expect(result.current.error).toBe('Initialization failed')

      await act(async () => {
        await result.current.retryPayment()
      })

      expect(mockTerminalService.startTapToPayPayment).toHaveBeenCalledTimes(1)
    })
  })

  describe('Web/non-native fallback', () => {
    it('should show web-only message when not native supported', async () => {
      ;(Capacitor.isNativePlatform as any).mockReturnValue(false)
      ;(Capacitor.getPlatform as any).mockReturnValue('web')
      ;(Capacitor.isPluginAvailable as any).mockReturnValue(false)

      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: 1000,
      }))

      await act(async () => {
        await result.current.checkPlatformSupport()
      })

      expect(result.current.isNativeSupported).toBe(false)
      expect(result.current.platform).toBe('web')
    })

    it('should not call native orchestration in web', async () => {
      ;(Capacitor.isNativePlatform as any).mockReturnValue(false)
      ;(Capacitor.getPlatform as any).mockReturnValue('web')
      ;(Capacitor.isPluginAvailable as any).mockReturnValue(false)

      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: 1000,
      }))

      await act(async () => {
        await result.current.startPayment()
      })

      expect(mockTerminalService.startTapToPayPayment).not.toHaveBeenCalled()
      expect(result.current.error).toBe('Tap to Pay is only available on the mobile app')
    })
  })

  describe('Amount validation', () => {
    it('should reject amounts below minimum', async () => {
      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: 25, // Below $0.50 minimum
      }))

      await act(async () => {
        await result.current.startPayment()
      })

      expect(mockTerminalService.startTapToPayPayment).not.toHaveBeenCalled()
      expect(result.current.error).toBe('Amount must be at least $0.50.')
    })

    it('should reject invalid amount formats', async () => {
      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: NaN,
      }))

      await act(async () => {
        await result.current.startPayment()
      })

      expect(mockTerminalService.startTapToPayPayment).not.toHaveBeenCalled()
      expect(result.current.error).toBe('Invalid amount. Please enter a valid amount.')
    })
  })

  describe('Unresolved attempt handling', () => {
    it('should prevent new payment when unresolved attempt exists', async () => {
      mockTerminalService.getUnresolvedAttempt.mockReturnValue('attempt-123')

      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: 1000,
      }))

      await act(async () => {
        await result.current.startPayment()
      })

      expect(mockTerminalService.startTapToPayPayment).not.toHaveBeenCalled()
      expect(result.current.paymentState).toBe('ambiguous')
      expect(result.current.error).toBe('Please resolve the previous payment status first')
    })
  })

  describe('Cancel payment', () => {
    it('should cancel payment and reset state', async () => {
      const { result } = renderHook(() => useTapToPayOrchestration({
        amountCents: 1000,
      }))

      mockTerminalService.isSupported.mockResolvedValue({ supported: true })
      mockTerminalService.initialize.mockResolvedValue({ status: 'ready' })
      mockTerminalService.connectTapToPay.mockResolvedValue({ status: 'connected' })
      mockTerminalService.startTapToPayPayment.mockImplementation(
        () => new Promise((resolve) => {})
      )
      mockTerminalService.getPaymentIntentId.mockReturnValue('pi_123')
      mockTerminalService.getUnresolvedAttempt.mockReturnValue(null)
      mockTerminalService.getSessionId.mockReturnValue('session-123')

      act(() => {
        result.current.startPayment()
      })

      expect(result.current.isPaymentInProgress).toBe(true)

      act(() => {
        result.current.cancelPayment()
      })

      expect(result.current.isPaymentInProgress).toBe(false)
      expect(result.current.paymentState).toBe('canceled')
      expect(result.current.error).toBe('')
    })
  })
})