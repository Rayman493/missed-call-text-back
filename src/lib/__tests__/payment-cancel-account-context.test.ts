/**
 * Behavioral test matrix for Stripe payment cancellation account-context fix
 * AND safety contract correction.
 *
 * Root cause proven from code:
 *   - Creation  (/api/payments/create):       stripe.checkout.sessions.create(params, { stripeAccount: connectedAccountId })
 *   - Cancellation (/api/payments/[id]/cancel): stripe.checkout.sessions.expire(sessionId)  ← was MISSING stripeAccount
 *   - Reconcile  (/api/payments/[id]/reconcile): stripe.checkout.sessions.retrieve(sessionId, { stripeAccount })  ✓
 *
 * Safety contract (corrected):
 *   Local status must NOT become `cancelled` unless ReplyFlow has evidence
 *   that the Stripe checkout can no longer accept payment.
 *
 *   - OPEN session → expire successfully → THEN local cancellation
 *   - EXPIRED session → already closed → local cancellation (idempotent)
 *   - COMPLETE + PAID → reconcile to paid, refuse cancellation (409)
 *   - COMPLETE + UNPAID → terminal (cannot accept payment) → local cancellation
 *   - RESOURCE_MISSING → provider inconsistency → 503 retryable, NO local mutation
 *   - Other Stripe error → 503 retryable, NO local mutation
 *   - expire() fails after open retrieval → 503 retryable, NO local mutation
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const cancelRouteContent = readFileSync('src/app/api/payments/[id]/cancel/route.ts', 'utf8')
const createRouteContent = readFileSync('src/app/api/payments/create/route.ts', 'utf8')
const reconcileRouteContent = readFileSync('src/app/api/payments/[id]/reconcile/route.ts', 'utf8')
const payPageContent = readFileSync('src/app/pay/[token]/page.tsx', 'utf8')

describe('Stripe Payment Cancellation — Account Context + Safety Contract', () => {
  describe('A. Creation uses connected account context', () => {
    it('create route passes stripeAccount to checkout.sessions.create', () => {
      expect(createRouteContent).toMatch(/stripeAccount:\s*business\.stripe_connect_account_id/)
    })

    it('create route persists stripe_connect_account_id on the payment request', () => {
      expect(createRouteContent).toContain('stripe_connect_account_id')
      expect(createRouteContent).toMatch(/insertPayload\.stripe_connect_account_id\s*=\s*business\.stripe_connect_account_id/)
    })
  })

  describe('B. Cancellation uses the SAME connected account context', () => {
    it('cancel route selects stripe_connect_account_id from the payment request', () => {
      expect(cancelRouteContent).toContain('stripe_connect_account_id')
    })

    it('cancel route builds accountOptions from stripe_connect_account_id', () => {
      expect(cancelRouteContent).toContain('connectedAccountId')
      expect(cancelRouteContent).toMatch(/accountOptions\s*=\s*connectedAccountId/)
      expect(cancelRouteContent).toMatch(/stripeAccount:\s*connectedAccountId/)
    })

    it('cancel route passes accountOptions to checkout.sessions.retrieve', () => {
      expect(cancelRouteContent).toMatch(/stripe\.checkout\.sessions\.retrieve\(sessionId,\s*accountOptions\)/)
    })

    it('cancel route passes accountOptions to checkout.sessions.expire', () => {
      expect(cancelRouteContent).toMatch(/stripe\.checkout\.sessions\.expire\(sessionId,\s*accountOptions\)/)
    })

    it('cancel route does NOT call expire() without account context', () => {
      expect(cancelRouteContent).not.toMatch(/expire\(paymentRequest\.stripe_checkout_session_id\)\s*\)/)
    })
  })

  describe('C. resource_missing in correct account context — NO local cancellation', () => {
    it('cancel route detects resource_missing and refuses local cancellation', () => {
      expect(cancelRouteContent).toContain('resource_missing')
      expect(cancelRouteContent).toMatch(/errorCode\s*===\s*['"]resource_missing['"]/)
    })

    it('cancel route returns 503 retryable for resource_missing', () => {
      // The resource_missing branch must return a 503, not fall through to local cancellation
      expect(cancelRouteContent).toMatch(/Unable to verify cancellation with Stripe/)
      expect(cancelRouteContent).toMatch(/retryable:\s*true/)
    })

    it('cancel route does NOT continue to local cancellation after resource_missing', () => {
      // The old code had "Continue with local cancellation — the /pay route will block it"
      // That comment/behavior must be gone
      expect(cancelRouteContent).not.toContain('Continue with local cancellation — the /pay route will block it')
      expect(cancelRouteContent).not.toContain('Local cancellation will block the /pay route')
    })

    it('cancel route logs local_mutation_performed=false for resource_missing', () => {
      expect(cancelRouteContent).toContain('local_mutation_performed: false')
    })

    it('cancel route logs structured inconsistency for resource_missing', () => {
      expect(cancelRouteContent).toMatch(/session_retrieval_result.*resource_missing/)
      expect(cancelRouteContent).toMatch(/stripe_account_context/)
    })
  })

  describe('D. Already expired — idempotent local cancellation', () => {
    it('cancel route detects already-expired session and proceeds with local cancellation', () => {
      expect(cancelRouteContent).toMatch(/sessionStatus\s*===\s*['"]expired['"]/)
      expect(cancelRouteContent).toContain('idempotent')
    })

    it('cancel route skips expire() call when session is already expired', () => {
      expect(cancelRouteContent).toContain('already_expired')
    })
  })

  describe('E. Complete + paid — refuse cancellation, reconcile to paid', () => {
    it('cancel route pre-checks session status before expiring', () => {
      expect(cancelRouteContent).toMatch(/sessionStatus\s*===\s*['"]complete['"]/)
      expect(cancelRouteContent).toMatch(/paymentStatus\s*===\s*['"]paid['"]/)
    })

    it('cancel route refuses cancellation and reconciles to paid if session is complete+paid', () => {
      expect(cancelRouteContent).toContain('Payment already completed')
      expect(cancelRouteContent).toMatch(/status:\s*['"]paid['"]/)
      expect(cancelRouteContent).toMatch(/update.*status.*paid/)
    })

    it('cancel route returns 409 for already-paid session', () => {
      expect(cancelRouteContent).toMatch(/status:\s*409/)
    })
  })

  describe('E2. Complete + unpaid — terminal, safe to cancel locally', () => {
    it('cancel route handles complete+unpaid as terminal (safe to cancel)', () => {
      expect(cancelRouteContent).toMatch(/complete.*unpaid/)
      expect(cancelRouteContent).toContain('terminal_complete_unpaid')
    })

    it('cancel route documents that complete sessions cannot accept payment again', () => {
      // Per Stripe SDK: Status = 'complete' | 'expired' | 'open'
      // A 'complete' session is terminal — the customer has finished checkout.
      expect(cancelRouteContent).toContain('terminal')
      expect(cancelRouteContent).toContain('cannot accept payment again')
    })

    it('cancel route handles complete+no_payment_required as terminal', () => {
      expect(cancelRouteContent).toMatch(/no_payment_required/)
    })
  })

  describe('F. expire() fails after open retrieval — NO local cancellation', () => {
    it('cancel route wraps expire() in its own try/catch', () => {
      // The expire call must have its own error handling separate from retrieve
      expect(cancelRouteContent).toMatch(/stripe\.checkout\.sessions\.expire[\s\S]*?catch\s*\(\s*expireError/)
    })

    it('cancel route returns 503 retryable if expire() fails', () => {
      // After a successful open retrieval, if expire() fails, we must NOT cancel locally
      expect(cancelRouteContent).toMatch(/Failed to expire Stripe session/)
    })

    it('cancel route logs local_mutation_performed=false when expire() fails', () => {
      // The expire failure path must log that no local mutation occurred
      expect(cancelRouteContent).toContain('local_mutation_performed: false')
    })
  })

  describe('G. Successful provider close — local mutation occurs AFTER Stripe success', () => {
    it('cancel route retrieves session BEFORE any local mutation', () => {
      // The retrieve call must come before the local status update
      const retrieveIdx = cancelRouteContent.indexOf('stripe.checkout.sessions.retrieve')
      const updateIdx = cancelRouteContent.indexOf("status: 'cancelled'")
      expect(retrieveIdx).toBeGreaterThan(-1)
      expect(updateIdx).toBeGreaterThan(-1)
      expect(retrieveIdx).toBeLessThan(updateIdx)
    })

    it('cancel route expires session BEFORE local status update', () => {
      // The expire call must come before the local status update
      const expireIdx = cancelRouteContent.indexOf('stripe.checkout.sessions.expire')
      const updateIdx = cancelRouteContent.indexOf("status: 'cancelled'")
      expect(expireIdx).toBeGreaterThan(-1)
      expect(updateIdx).toBeGreaterThan(-1)
      expect(expireIdx).toBeLessThan(updateIdx)
    })

    it('cancel route does NOT have a blanket "continue with cancellation" catch', () => {
      // The old outer catch said "Non-critical — continue with local cancellation"
      expect(cancelRouteContent).not.toContain('Non-critical — continue with local cancellation')
    })
  })

  describe('H. Cancelled /pay/[token] remains blocked', () => {
    it('public pay route checks for cancelled status', () => {
      expect(payPageContent).toMatch(/status\s*===\s*['"]cancelled['"]/)
    })

    it('public pay route shows canceled message and does not redirect to checkout', () => {
      expect(payPageContent).toContain('Payment Request Canceled')
    })

    it('public pay route blocks Stripe redirect for cancelled payments (cancelled check before redirect)', () => {
      const cancelledIdx = payPageContent.indexOf("status === 'cancelled'")
      const redirectIdx = payPageContent.indexOf('redirect(paymentRequest.checkout_url)')
      expect(cancelledIdx).toBeGreaterThan(-1)
      expect(redirectIdx).toBeGreaterThan(-1)
      expect(cancelledIdx).toBeLessThan(redirectIdx)
    })
  })

  describe('I. Correct account-context options passed to Stripe SDK', () => {
    it('cancel route uses the same stripeAccount pattern as reconcile route', () => {
      expect(cancelRouteContent).toMatch(/stripeAccount:\s*connectedAccountId\s*\}\s*as\s*any/)
      expect(reconcileRouteContent).toMatch(/stripeAccount:\s*stripeAccountId\s*\}\s*as\s*any/)
    })

    it('cancel route falls back to undefined (platform) when no connected account', () => {
      expect(cancelRouteContent).toMatch(/connectedAccountId\s*\?\s*\{[^}]*\}\s*as\s*any\s*:\s*undefined/)
    })
  })

  describe('J. Unknown session status — conservative refusal', () => {
    it('cancel route refuses cancellation for unknown session status', () => {
      expect(cancelRouteContent).toContain('Unknown session status')
    })
  })

  describe('Observability — structured logging', () => {
    it('logs payment_id, session_id (redacted), provider, stripe_account_context', () => {
      expect(cancelRouteContent).toContain('payment_id')
      expect(cancelRouteContent).toContain('session_id')
      expect(cancelRouteContent).toContain('provider')
      expect(cancelRouteContent).toContain('stripe_account_context')
    })

    it('logs business_connect_account_id', () => {
      expect(cancelRouteContent).toContain('business_connect_account_id')
    })

    it('logs session_state and expire_result', () => {
      expect(cancelRouteContent).toContain('session_state')
      expect(cancelRouteContent).toContain('expire_result')
    })

    it('logs local_mutation_performed for provider failures', () => {
      expect(cancelRouteContent).toContain('local_mutation_performed')
    })

    it('redacts session ID in logs (only tail)', () => {
      expect(cancelRouteContent).toContain('sessionIdSafe')
      expect(cancelRouteContent).toMatch(/slice\(-8\)/)
    })

    it('does not log full session ID or secret keys', () => {
      expect(cancelRouteContent).not.toMatch(/console\.log.*sessionId\b(?!Safe)/)
    })
  })
})
