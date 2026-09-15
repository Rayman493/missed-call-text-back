/**
 * Batch 1A — Proven backend failures from production logs
 *
 * 1. iOS Tap to Pay reconciliation: authoritative Stripe correction of a local
 *    failed/uncertain terminal state to paid.
 * 2. Historical MMS media access: expired signed URL tokens continue to work for
 *    authenticated users via durable session/cookie auth.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { validateStateTransition, isAuthoritativePaidCorrection } from '@/lib/terminal/state-transition-guards'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const reconcileRouteSrc = readSrc('src/app/api/terminal/reconcile-payment/route.ts')
const mmsServeRouteSrc = readSrc('src/app/api/mms-media/serve/route.ts')
const mmsUrlHelperSrc = readSrc('src/lib/mms-media-url-helper.ts')
const mmsTokenSrc = readSrc('src/lib/mms-media-token.ts')

describe('Batch 1A — Tap to Pay authoritative reconciliation', () => {
  it('1. normal failed -> paid transition is still blocked by the guard', () => {
    const result = validateStateTransition('failed', 'paid')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("Cannot transition from terminal state 'failed'")
  })

  it('2. authoritative correction identifies failed as correctable to paid', () => {
    expect(isAuthoritativePaidCorrection('failed')).toBe(true)
  })

  it('3. authoritative correction identifies requires_payment_method as correctable', () => {
    expect(isAuthoritativePaidCorrection('requires_payment_method')).toBe(true)
  })

  it('4. cancelled is NOT correctable to paid by authoritative Stripe', () => {
    expect(isAuthoritativePaidCorrection('cancelled')).toBe(false)
    expect(isAuthoritativePaidCorrection('canceled')).toBe(false)
  })

  it('5. paid cannot be overwritten by authoritative correction', () => {
    expect(isAuthoritativePaidCorrection('paid')).toBe(false)
  })

  it('6. reconcile route imports and uses the authoritative correction helper', () => {
    expect(reconcileRouteSrc).toContain("isAuthoritativePaidCorrection")
    expect(reconcileRouteSrc).toContain("import { validateStateTransition, isAuthoritativePaidCorrection } from '@/lib/terminal/state-transition-guards'")
  })

  it('7. reconcile route logs previous status, Stripe status, and correction reason', () => {
    expect(reconcileRouteSrc).toMatch(/authoritative_correction[\s\S]*?previous_status=/)
    expect(reconcileRouteSrc).toMatch(/authoritative_correction[\s\S]*?stripe_status=/)
    expect(reconcileRouteSrc).toContain('reason=trusted_stripe_succeeded')
  })

  it('8. reconcile route verifies amount before authoritative correction', () => {
    expect(reconcileRouteSrc).toContain('paymentRequest.amount_cents !== paymentIntent.amount')
    expect(reconcileRouteSrc).toContain('Payment amount mismatch')
  })

  it('9. reconcile route is idempotent for already-paid requests', () => {
    expect(reconcileRouteSrc).toContain("stage=reconciliation_complete reason=already_paid")
    expect(reconcileRouteSrc).toContain("if (paymentRequest.status === 'paid')")
  })

  it('10. reconcile route is idempotent for already-failed requests', () => {
    expect(reconcileRouteSrc).toContain("if (paymentRequest.status === 'failed')")
    expect(reconcileRouteSrc).toContain("stage=reconciliation_complete reason=already_failed")
  })

  it('11. reconcile route is idempotent for already-cancelled requests', () => {
    expect(reconcileRouteSrc).toContain("if (paymentRequest.status === 'cancelled')")
    expect(reconcileRouteSrc).toContain("stage=reconciliation_complete reason=already_cancelled")
  })

  it('12. reconcile route preserves cancelled records from requires_payment_method downgrade', () => {
    expect(reconcileRouteSrc).toContain("failed_but_cancelled_preserved")
    expect(reconcileRouteSrc).toContain("status: 'cancelled'")
  })
})

describe('Batch 1A — Historical MMS media durable auth', () => {
  it('13. serve route uses getAuthenticatedUser for session/cookie fallback', () => {
    expect(mmsServeRouteSrc).toContain("import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'")
    expect(mmsServeRouteSrc).toContain('await getAuthenticatedUser(request)')
  })

  it('14. serve route verifies the user owns the business from the durable path', () => {
    expect(mmsServeRouteSrc).toContain('eq(\'user_id\', user.id)')
    expect(mmsServeRouteSrc).toContain('User not authorized for this business')
    expect(mmsServeRouteSrc).toContain('Access denied')
  })

  it('15. serve route still verifies signed URL tokens first', () => {
    expect(mmsServeRouteSrc).toContain('verifyMmsMediaToken(authToken, filePath)')
  })

  it('16. serve route validates storage path for both auth modes', () => {
    expect(mmsServeRouteSrc).toMatch(/isValidStoragePath\(filePath\)[\s\S]*?isValidStoragePath\(filePath\)/)
    expect(mmsServeRouteSrc).toContain('Invalid file path')
  })

  it('17. serve route no longer depends on SUPABASE_SERVICE_ROLE_KEY for user auth', () => {
    expect(mmsServeRouteSrc).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('18. token remains bound to the durable storage path', () => {
    expect(mmsTokenSrc).toContain('path: filePath')
    expect(mmsUrlHelperSrc).toContain('createMmsMediaAccessUrl(storagePath)')
    expect(mmsUrlHelperSrc).toContain('extractStoragePathFromUrl(storedUrl)')
  })
})
