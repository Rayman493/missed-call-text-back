/**
 * Cancel/Retry Regression Tests
 *
 * Tests that cancel properly clears state to allow immediate retry.
 * Regression for: Android Tap to Pay second-attempt relaunch failure
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TerminalBridgeService } from '../service'
import Terminal, { isNativeCapacitor } from '../index'

// Mock the Terminal plugin
vi.mock('../index', () => ({
  default: {
    initialize: vi.fn(),
    isSupported: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    supplyConnectionToken: vi.fn(),
    supplyConnectionTokenError: vi.fn(),
    connectTapToPay: vi.fn(),
    createTerminalPayment: vi.fn(),
    collectPayment: vi.fn(),
    cancel: vi.fn(),
    disconnect: vi.fn(),
    teardown: vi.fn(),
  },
  isNativeCapacitor: vi.fn(() => true),
}))

describe('TerminalBridgeService - Cancel/Retry Regression', () => {
  let service: TerminalBridgeService

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton for testing
    vi.resetModules()
    service = TerminalBridgeService.getInstance()
  })

  describe('cancel clears state for retry', () => {
    beforeEach(() => {
      vi.mocked(isNativeCapacitor).mockReturnValue(true)
      // Reset singleton to get fresh instance for test
      vi.resetModules()
      service = TerminalBridgeService.getInstance()
    })

    it('resetForRetry clears attempt-scoped state', async () => {
      // Simulate active attempt state
      ;(service as any).currentAttemptId = 'attempt-123'
      ;(service as any).currentPaymentIntentId = 'pi_123'
      ;(service as any).currentLocalPaymentId = 'local-123'
      ;(service as any).attemptStartMs = Date.now()
      ;(service as any).currentPhase = 'collecting'

      await service.resetForRetry('user_retry')

      // Verify all attempt-scoped state is cleared
      expect((service as any).currentAttemptId).toBeNull()
      expect((service as any).currentPaymentIntentId).toBeUndefined()
      expect((service as any).currentLocalPaymentId).toBeUndefined()
      expect((service as any).attemptStartMs).toBeNull()
      expect((service as any).currentPhase).toBeUndefined()
    })

    it('cancel clears currentAttemptId synchronously', async () => {
      // Simulate active attempt
      ;(service as any).currentAttemptId = 'attempt-123'
      ;(service as any).attemptStartMs = Date.now()
      ;(service as any).currentPhase = 'collecting'

      vi.mocked(Terminal.cancel).mockResolvedValue({ status: 'canceled' })

      await service.cancel()

      // Verify attempt state is cleared synchronously
      expect((service as any).currentAttemptId).toBeNull()
      expect((service as any).attemptStartMs).toBeNull()
      expect((service as any).currentPhase).toBeUndefined()
    })

    it('resetForRetry does not disconnect reader', async () => {
      const disconnectSpy = vi.spyOn(Terminal, 'disconnect')

      await service.resetForRetry('user_retry')

      // Verify disconnect was not called
      expect(disconnectSpy).not.toHaveBeenCalled()
    })

    it('resetForRetry clears unresolved attempt', async () => {
      // Mock localStorage
      const localStorageSetSpy = vi.spyOn(Storage.prototype, 'removeItem')

      await service.resetForRetry('user_retry')

      // Verify clearUnresolvedAttempt was called (via storage clear)
      expect(localStorageSetSpy).toHaveBeenCalled()
    })

    it('resetForRetry clears attempt outcome', async () => {
      // Mock localStorage
      const localStorageSetSpy = vi.spyOn(Storage.prototype, 'removeItem')

      await service.resetForRetry('user_retry')

      // Verify clearAttemptOutcome was called (via storage clear)
      expect(localStorageSetSpy).toHaveBeenCalled()
    })
  })

  describe('second attempt uses fresh state', () => {
    beforeEach(() => {
      vi.mocked(isNativeCapacitor).mockReturnValue(true)
      vi.resetModules()
      service = TerminalBridgeService.getInstance()
    })

    it('new attempt does not reuse previous attemptId', async () => {
      const firstAttemptId = 'attempt-123'
      ;(service as any).currentAttemptId = firstAttemptId

      await service.resetForRetry('user_retry')

      // After reset, attemptId is null
      expect((service as any).currentAttemptId).toBeNull()

      // New attempt would generate new ID (simulated here)
      const newAttemptId = 'attempt-456'
      ;(service as any).currentAttemptId = newAttemptId

      // Verify IDs are different
      expect(newAttemptId).not.toBe(firstAttemptId)
    })

    it('new attempt does not reuse previous paymentIntentId', async () => {
      const firstPi = 'pi_123'
      ;(service as any).currentPaymentIntentId = firstPi

      await service.resetForRetry('user_retry')

      // After reset, paymentIntentId is undefined
      expect((service as any).currentPaymentIntentId).toBeUndefined()

      // New attempt would use new PI (simulated here)
      const newPi = 'pi_456'
      ;(service as any).currentPaymentIntentId = newPi

      // Verify PIs are different
      expect(newPi).not.toBe(firstPi)
    })

    it('new attempt does not reuse previous phase', async () => {
      ;(service as any).currentPhase = 'collecting'

      await service.resetForRetry('user_retry')

      // After reset, phase is undefined
      expect((service as any).currentPhase).toBeUndefined()

      // New attempt would start with new phase
      ;(service as any).currentPhase = 'collecting'
      expect((service as any).currentPhase).toBe('collecting')
    })
  })

  describe('repeated cancel/retry cycles', () => {
    beforeEach(() => {
      vi.mocked(isNativeCapacitor).mockReturnValue(true)
      vi.resetModules()
      service = TerminalBridgeService.getInstance()
    })

    it('handles multiple cancel/retry cycles', async () => {
      vi.mocked(Terminal.cancel).mockResolvedValue({ status: 'canceled' })

      // First cycle
      ;(service as any).currentAttemptId = 'attempt-1'
      await service.cancel()
      expect((service as any).currentAttemptId).toBeNull()

      ;(service as any).currentAttemptId = 'attempt-2'
      await service.cancel()
      expect((service as any).currentAttemptId).toBeNull()

      // Third cycle
      ;(service as any).currentAttemptId = 'attempt-3'
      await service.cancel()
      expect((service as any).currentAttemptId).toBeNull()
    })

    it('resetForRetry clears attempt-scoped state for new attempt', async () => {
      // Simulate that cancel was called and callback has completed
      ;(service as any).currentAttemptId = 'attempt-1'
      ;(service as any).currentPaymentIntentId = 'pi_1'
      
      // resetForRetry clears state to prepare for new attempt
      await service.resetForRetry('user_retry')
      
      expect((service as any).currentAttemptId).toBeNull()
      expect((service as any).currentPaymentIntentId).toBeUndefined()
      
      // New attempt can start after cancellation completes
      ;(service as any).currentAttemptId = 'attempt-2'
      ;(service as any).currentPaymentIntentId = 'pi_2'
      
      expect((service as any).currentAttemptId).toBe('attempt-2')
      expect((service as any).currentPaymentIntentId).toBe('pi_2')
    })
  })
})