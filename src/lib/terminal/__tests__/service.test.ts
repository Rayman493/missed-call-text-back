import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TerminalBridgeService } from '../service'
import Terminal, { isNativeCapacitor } from '../index'

// Mock the Terminal plugin
vi.mock('../index', () => ({
  default: {
    initialize: vi.fn(),
    isSupported: vi.fn(),
    addListener: vi.fn(),
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

describe('TerminalBridgeService', () => {
  let service: TerminalBridgeService

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton for testing
    vi.resetModules()
    service = TerminalBridgeService.getInstance()
  })

  describe('on web (not native)', () => {
    beforeEach(() => {
      vi.mocked(isNativeCapacitor).mockReturnValue(false)
      // Reset singleton to get fresh instance for test
      vi.resetModules()
      service = TerminalBridgeService.getInstance()
    })

    it('reports unsupported on web', async () => {
      const res = await service.isSupported()
      expect(res.supported).toBe(false)
      expect(res.platform).toBe('web')
    })

    it('initialize returns not_initialized on web', async () => {
      const res = await service.initialize()
      expect(res.status).toBe('not_initialized')
    })
  })

  describe('on native (Capacitor)', () => {
    beforeEach(() => {
      vi.mocked(isNativeCapacitor).mockReturnValue(true)
      // Reset singleton to get fresh instance for test
      vi.resetModules()
      service = TerminalBridgeService.getInstance()
    })

    it('sets up token request listener on initialize', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      vi.mocked(Terminal.addListener).mockResolvedValue({ remove: vi.fn() })

      await service.initialize()

      expect(Terminal.addListener).toHaveBeenCalledWith(
        'connectionTokenRequested',
        expect.any(Function)
      )
    })

    it('does not set up listener twice', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      vi.mocked(Terminal.addListener).mockResolvedValue({ remove: vi.fn() })

      await service.initialize()
      await service.initialize()

      expect(Terminal.addListener).toHaveBeenCalledTimes(1)
    })

    it('handles token request by fetching from backend and supplying to native', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      
      let capturedListener: ((data: { requestId: string }) => void) | null = null
      vi.mocked(Terminal.addListener).mockImplementation((event, listener) => {
        capturedListener = listener as any
        return Promise.resolve({ remove: vi.fn() })
      })

      // Mock fetch to return a token
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ secret: 'tok_secret_123' }),
      }) as any

      await service.initialize()

      // Simulate native token request
      expect(capturedListener).not.toBeNull()
      await capturedListener!({ requestId: 'req-123' })

      expect(global.fetch).toHaveBeenCalledWith('/api/terminal/connection-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(Terminal.supplyConnectionToken).toHaveBeenCalledWith({
        requestId: 'req-123',
        secret: 'tok_secret_123',
      })
    })

    it('ignores stale token requests', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      
      let capturedListener: ((data: { requestId: string }) => void) | null = null
      vi.mocked(Terminal.addListener).mockImplementation((event, listener) => {
        capturedListener = listener as any
        return Promise.resolve({ remove: vi.fn() })
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ secret: 'tok_secret_123' }),
      }) as any

      await service.initialize()

      // Trigger first request
      const promise1 = capturedListener!({ requestId: 'req-1' })
      
      // Trigger second request (this becomes active)
      const promise2 = capturedListener!({ requestId: 'req-2' })

      await promise1
      await promise2

      // Only the second request should have been supplied
      expect(Terminal.supplyConnectionToken).toHaveBeenCalledTimes(1)
      expect(Terminal.supplyConnectionToken).toHaveBeenCalledWith({
        requestId: 'req-2',
        secret: 'tok_secret_123',
      })
    })

    it('reports error to native on fetch failure', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      
      let capturedListener: ((data: { requestId: string }) => void) | null = null
      vi.mocked(Terminal.addListener).mockImplementation((event, listener) => {
        capturedListener = listener as any
        return Promise.resolve({ remove: vi.fn() })
      })

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'Unauthorized',
      }) as any

      await service.initialize()

      await capturedListener!({ requestId: 'req-123' })

      expect(Terminal.supplyConnectionTokenError).toHaveBeenCalledWith({
        requestId: 'req-123',
        message: 'Failed to fetch connection token: Unauthorized',
      })
    })

    it('cleans up listener on teardown', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      
      const mockRemove = vi.fn()
      vi.mocked(Terminal.addListener).mockResolvedValue({ remove: mockRemove })
      vi.mocked(Terminal.teardown).mockResolvedValue({ status: 'not_initialized' })

      await service.initialize()
      await service.teardown()

      expect(mockRemove).toHaveBeenCalled()
      expect(Terminal.teardown).toHaveBeenCalled()
    })

    it('fetches location ID and passes to connectTapToPay', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      vi.mocked(Terminal.addListener).mockResolvedValue({ remove: vi.fn() })
      
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ locationId: 'tml_123' }),
      }) as any

      await service.initialize()
      await service.connectTapToPay({ simulated: true })

      expect(global.fetch).toHaveBeenCalledWith('/api/terminal/location', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(Terminal.connectTapToPay).toHaveBeenCalledWith({
        simulated: true,
        locationId: 'tml_123',
      })
    })

    it('handles location fetch failure', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      vi.mocked(Terminal.addListener).mockResolvedValue({ remove: vi.fn() })

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'Unauthorized',
      }) as any

      await service.initialize()

      await expect(service.connectTapToPay({ simulated: true })).rejects.toThrow(
        'Failed to fetch terminal location: Unauthorized'
      )
    })

    it('handles discovery-already-active error', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      vi.mocked(Terminal.addListener).mockResolvedValue({ remove: vi.fn() })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ locationId: 'tml_123' }),
      }) as any

      // Mock connectTapToPay to return discovery-already-active on second call
      vi.mocked(Terminal.connectTapToPay)
        .mockResolvedValueOnce({ status: 'connected' })
        .mockRejectedValueOnce(new Error('discovery-already-active'))

      await service.initialize()
      await service.connectTapToPay({ simulated: true })

      // Second call should fail with discovery-already-active
      await expect(service.connectTapToPay({ simulated: true })).rejects.toThrow(
        'discovery-already-active'
      )
    })

    it('passes clientSecret to collectPayment', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      vi.mocked(Terminal.addListener).mockResolvedValue({ remove: vi.fn() })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          paymentIntentId: 'pi_123',
          clientSecret: 'pi_123_secret_abc',
          localPaymentId: 'local_123',
        }),
      }) as any

      await service.initialize()

      await service.startTapToPayPayment({
        amountCents: 1000,
        currency: 'usd',
      })

      expect(Terminal.collectPayment).toHaveBeenCalledWith({
        paymentIntentId: 'pi_123',
        clientSecret: 'pi_123_secret_abc',
      })
    })

    it('throws error when payment-intent API returns missing clientSecret', async () => {
      vi.mocked(Terminal.initialize).mockResolvedValue({ status: 'ready' })
      vi.mocked(Terminal.addListener).mockResolvedValue({ remove: vi.fn() })

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          paymentIntentId: 'pi_123',
          // clientSecret missing
          localPaymentId: 'local_123',
        }),
      }) as any

      await service.initialize()

      await expect(service.startTapToPayPayment({
        amountCents: 1000,
        currency: 'usd',
      })).rejects.toThrow('Invalid PaymentIntent response: missing paymentIntentId or clientSecret')
    })
  })
})

describe('TerminalBridgeService.resolvePreviousAttemptBeforeNewPayment stale-attempt cleanup', () => {
  let cleanupService: TerminalBridgeService

  beforeEach(() => {
    cleanupService = TerminalBridgeService.getInstance()!
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('clears stale marker and proceeds when reconciliation returns 404', async () => {
    const staleAttemptId = 'stale-attempt-123'
    localStorage.setItem('terminal_unresolved_attempt', staleAttemptId)
    localStorage.setItem('terminal_last_attempt_outcome', 'ambiguous')

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Payment request not found',
    }) as any

    const result = await cleanupService.resolvePreviousAttemptBeforeNewPayment()

    expect(result.action).toBe('proceed')
    expect(result.reason).toBe('stale_marker_cleared')
    expect(localStorage.getItem('terminal_unresolved_attempt')).toBeNull()
    expect(localStorage.getItem('terminal_last_attempt_outcome')).toBeNull()
  })

  it('does NOT clear marker for 500 server errors', async () => {
    const staleAttemptId = 'stale-attempt-123'
    localStorage.setItem('terminal_unresolved_attempt', staleAttemptId)
    localStorage.setItem('terminal_last_attempt_outcome', 'ambiguous')

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    }) as any

    const result = await cleanupService.resolvePreviousAttemptBeforeNewPayment()

    expect(result.action).toBe('block')
    expect(localStorage.getItem('terminal_unresolved_attempt')).toBe(staleAttemptId)
  })

  it('does NOT clear marker for network failures', async () => {
    const staleAttemptId = 'stale-attempt-123'
    localStorage.setItem('terminal_unresolved_attempt', staleAttemptId)
    localStorage.setItem('terminal_last_attempt_outcome', 'ambiguous')

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await cleanupService.resolvePreviousAttemptBeforeNewPayment()

    expect(result.action).toBe('block')
    expect(localStorage.getItem('terminal_unresolved_attempt')).toBe(staleAttemptId)
  })

  it('recovers paid attempt authoritatively and clears marker', async () => {
    const staleAttemptId = 'stale-attempt-123'
    localStorage.setItem('terminal_unresolved_attempt', staleAttemptId)
    localStorage.setItem('terminal_last_attempt_outcome', 'ambiguous')

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'paid', stripe_payment_intent_id: 'pi_123' }),
    }) as any

    const result = await cleanupService.resolvePreviousAttemptBeforeNewPayment()

    expect(result.action).toBe('recover')
    expect(result.reason).toBe('previous_succeeded')
    expect(localStorage.getItem('terminal_unresolved_attempt')).toBeNull()
  })

  it('preserves marker for legitimate pending/processing attempt on same account', async () => {
    const legitimateAttemptId = 'legit-attempt-456'
    localStorage.setItem('terminal_unresolved_attempt', legitimateAttemptId)
    localStorage.setItem('terminal_last_attempt_outcome', 'ambiguous')

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'processing' }),
    }) as any

    const result = await cleanupService.resolvePreviousAttemptBeforeNewPayment()

    expect(result.action).toBe('block')
    expect(result.reason).toBe('previous_processing')
    expect(localStorage.getItem('terminal_unresolved_attempt')).toBe(legitimateAttemptId)
  })

  it('does not reuse old attempt ID after stale marker is cleared', async () => {
    const staleAttemptId = 'stale-attempt-123'
    localStorage.setItem('terminal_unresolved_attempt', staleAttemptId)
    localStorage.setItem('terminal_last_attempt_outcome', 'ambiguous')

    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlString = typeof url === 'string' ? url : String(url)
      if (urlString.includes('reconcile-payment')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          text: async () => 'Payment request not found',
        } as any)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          paymentIntentId: 'pi_new',
          clientSecret: 'pi_new_secret',
          localPaymentId: 'local_new',
        }),
      } as any)
    }) as any

    vi.mocked(Terminal.collectPayment).mockResolvedValue({ status: 'canceled' } as any)

    await cleanupService.resolvePreviousAttemptBeforeNewPayment()

    // Simulate a connected reader so startTapToPayPayment skips connect/reconnect
    ;(cleanupService as any).connectionStatus = 'connected'
    ;(cleanupService as any).lastReaderId = 'reader-1'

    await cleanupService.startTapToPayPayment({
      amountCents: 1000,
      currency: 'usd',
    })

    const paymentIntentCalls = (global.fetch as any).mock.calls.filter((call: any[]) => {
      const url = typeof call[0] === 'string' ? call[0] : String(call[0])
      return url.includes('/api/terminal/payment-intent')
    })

    expect(paymentIntentCalls.length).toBeGreaterThan(0)
    const paymentIntentBody = JSON.parse(paymentIntentCalls[0][1].body as string)
    expect(paymentIntentBody.terminalAttemptId).toBeDefined()
    expect(paymentIntentBody.terminalAttemptId).not.toBe(staleAttemptId)
  })
})
