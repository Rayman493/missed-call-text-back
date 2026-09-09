/**
 * Tap to Pay authority-guard focused tests (Batch 3)
 *
 * Verifies client/service behavior for the new-payment authority lifecycle:
 * - new payment proceeds when old succeeded/failed/canceled attempts are reconciled
 * - processing/unknown attempts still block safely
 * - same-attempt resumed success returns canonical paid outcome
 * - handled domain errors carry structured fields and clear local markers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TerminalBridgeService } from '../service'

const UNRESOLVED_ATTEMPT_KEY = 'terminal_unresolved_attempt'
const LAST_ATTEMPT_OUTCOME_KEY = 'terminal_last_attempt_outcome'

describe('Tap to Pay authority guard client/service lifecycle', () => {
  let service: TerminalBridgeService

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    service = TerminalBridgeService.getInstance()!
    ;(service as any).currentAttemptId = 'current-attempt'
  })

  describe('createTerminalPayment authority outcomes', () => {
    it('proceeds with a fresh PaymentIntent for a genuinely new payment after old succeeded attempt is reconciled', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          paymentIntentId: 'pi_new_b',
          clientSecret: 'pi_new_b_secret',
          localPaymentId: 'local_new_b',
        }),
      }) as any

      const result = await service.createTerminalPayment({
        amountCents: 1000,
        currency: 'usd',
        terminalAttemptId: 'attempt-b',
      })

      expect(result.paymentIntentId).toBe('pi_new_b')
      expect(result.clientSecret).toBe('pi_new_b_secret')
      expect(result.localPaymentId).toBe('local_new_b')
    })

    it('blocks new payment when old attempt is still processing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({
          error: 'Payment is still processing',
          status: 'processing',
          unresolvedAttemptId: 'attempt-a',
        }),
      }) as any

      await expect(service.createTerminalPayment({
        amountCents: 1000,
        currency: 'usd',
        terminalAttemptId: 'attempt-b',
      })).rejects.toMatchObject({
        code: 'Payment is still processing',
        status: 'processing',
        unresolvedAttemptId: 'attempt-a',
      })
    })

    it('blocks new payment conservatively when old attempt status is unknown', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({
          error: 'Unable to verify payment status. Please check your payment history before trying again.',
          unresolvedAttemptId: 'attempt-a',
        }),
      }) as any

      await expect(service.createTerminalPayment({
        amountCents: 1000,
        currency: 'usd',
        terminalAttemptId: 'attempt-b',
      })).rejects.toMatchObject({
        code: 'Unable to verify payment status. Please check your payment history before trying again.',
        unresolvedAttemptId: 'attempt-a',
      })
    })

    it('proceeds with a new PaymentIntent after old failed/canceled attempt is reconciled', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          paymentIntentId: 'pi_new_b',
          clientSecret: 'pi_new_b_secret',
          localPaymentId: 'local_new_b',
        }),
      }) as any

      const result = await service.createTerminalPayment({
        amountCents: 1000,
        currency: 'usd',
        terminalAttemptId: 'attempt-b',
      })

      expect(result.paymentIntentId).toBe('pi_new_b')
    })

    it('returns canonical paid success when the same attempt is resumed after Stripe succeeded', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({
          error: 'payment_already_completed',
          status: 'paid',
          message: 'This payment has already been completed',
          localPaymentId: 'local-a',
          paymentIntentId: 'pi_a',
        }),
      }) as any

      await expect(service.createTerminalPayment({
        amountCents: 1000,
        currency: 'usd',
        terminalAttemptId: 'attempt-a',
      })).rejects.toMatchObject({
        code: 'payment_already_completed',
        status: 'paid',
        localPaymentId: 'local-a',
        paymentIntentId: 'pi_a',
      })
    })

    it('creates two independent successful payment records with distinct PaymentIntents', async () => {
      let callIndex = 0
      global.fetch = vi.fn().mockImplementation(() => {
        callIndex++
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            paymentIntentId: `pi_${callIndex}`,
            clientSecret: `pi_${callIndex}_secret`,
            localPaymentId: `local_${callIndex}`,
          }),
        } as any)
      })

      const first = await service.createTerminalPayment({
        amountCents: 1000,
        currency: 'usd',
        terminalAttemptId: 'attempt-a',
      })
      const second = await service.createTerminalPayment({
        amountCents: 1000,
        currency: 'usd',
        terminalAttemptId: 'attempt-b',
      })

      expect(first.paymentIntentId).not.toBe(second.paymentIntentId)
      expect(first.localPaymentId).not.toBe(second.localPaymentId)
    })
  })

  describe('Definitive paid outcome client reconciliation', () => {
    it('clears unresolved marker and records succeeded outcome for a definitive 409 paid', () => {
      localStorage.setItem(UNRESOLVED_ATTEMPT_KEY, 'attempt-a')
      service.terminalizeSucceededAttempt()

      expect(localStorage.getItem(UNRESOLVED_ATTEMPT_KEY)).toBeNull()
      expect(localStorage.getItem(LAST_ATTEMPT_OUTCOME_KEY)).toBe('succeeded')
    })
  })

  describe('Handled domain error propagation', () => {
    it('rejects with a structured error that can be caught instead of an unhandled rejection', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({
          error: 'payment_already_completed',
          status: 'paid',
          localPaymentId: 'local-a',
        }),
      }) as any

      const promise = service.createTerminalPayment({
        amountCents: 1000,
        currency: 'usd',
        terminalAttemptId: 'attempt-a',
      })

      // Awaiting the promise consumes the rejection; it should not become unhandled
      await expect(promise).rejects.toMatchObject({ code: 'payment_already_completed' })
    })
  })
})
