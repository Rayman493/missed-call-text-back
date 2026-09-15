/**
 * Payments Functional + Semantic Cleanup Batch — Regression Tests
 *
 * FIX 1: Venmo external handoff must use the real checkoutUrl (not a
 *        hard-coded https://venmo.com) and must use @capacitor/browser
 *        Browser.open() on native platforms for deterministic external
 *        app launching. The bounce-back was caused by the WebView's
 *        target="_blank" handling on a generic URL.
 *
 * FIX 2: Stripe cancellation must show exactly one error surface. The
 *        duplicate error (dismissible top banner + large inline error
 *        card replacing the content area) is consolidated to the single
 *        dismissible top banner only.
 *
 * FIX 3: View Customer from inside PaymentEditModal must close the modal
 *        before navigating so the modal's history.back() cleanup does not
 *        undo the router.push() navigation.
 *
 * FIX 4: Payment Name (display_name) must be the card title, not the
 *        description. getPaymentDescription must return only description.
 *        getPaymentTitle must prefer display_name, then fall back to
 *        customer name.
 *
 * FIX 5: Venmo fallback card must not repeat the full payment details.
 *        It should only explain the manual fallback with a copy-username
 *        button and the payment note reference.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const handoffSrc = readSrc('src/components/PaymentHandoff.tsx')
const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')
const editModalSrc = readSrc('src/components/payments/PaymentEditModal.tsx')
const cancelRouteSrc = readSrc('src/app/api/payments/[id]/cancel/route.ts')
const modalBackButtonSrc = readSrc('src/lib/modalBackButton.ts')
const useModalBackButtonSrc = readSrc('src/hooks/useModalBackButton.ts')

// ============================================================================
// FIX 1 — Venmo external handoff
// ============================================================================
describe('FIX 1: Venmo external handoff', () => {
  describe('uses real checkoutUrl instead of hard-coded venmo.com', () => {
    it('does NOT hard-code href="https://venmo.com" for the Open Venmo button', () => {
      // The old code had: href={provider === 'venmo' ? 'https://venmo.com' : ...}
      // This should be gone — the button should use checkoutUrl.
      expect(handoffSrc).not.toContain("'https://venmo.com' : (checkoutUrl")
      expect(handoffSrc).not.toContain('"https://venmo.com" : (checkoutUrl')
    })

    it('uses checkoutUrl as the primary navigation target', () => {
      expect(handoffSrc).toContain('checkoutUrl ||')
    })

    it('uses a button with onClick (not an anchor with target="_blank")', () => {
      // The old code used <a href=... target="_blank"> which bounces back
      // in Android WebView. The fix uses a <button> with an onClick handler.
      expect(handoffSrc).toContain('onClick={openProvider}')
      expect(handoffSrc).toContain('<button')
    })

    it('does NOT use target="_blank" on the Open Provider button', () => {
      // The old anchor had target="_blank" which doesn't work in Capacitor WebView
      const openButtonSection = handoffSrc.substring(
        handoffSrc.indexOf('Open {providerName}'),
        handoffSrc.indexOf('Open {providerName}') + 200
      )
      expect(openButtonSection).not.toContain('target="_blank"')
    })
  })

  describe('uses @capacitor/browser Browser.open() on native', () => {
    it('imports Capacitor and Browser', () => {
      expect(handoffSrc).toContain("from '@capacitor/core'")
      expect(handoffSrc).toContain("from '@capacitor/browser'")
    })

    it('checks Capacitor.isNativePlatform()', () => {
      expect(handoffSrc).toContain('Capacitor.isNativePlatform()')
    })

    it('calls Browser.open() on native', () => {
      expect(handoffSrc).toContain('Browser.open(')
    })

    it('falls back to window.open on web', () => {
      expect(handoffSrc).toContain('window.open(')
    })
  })
})

// ============================================================================
// FIX 2 — Single error surface for Stripe cancellation
// ============================================================================
describe('FIX 2: Single error surface for cancellation', () => {
  describe('only one error render site exists in the payments page', () => {
    it('has the dismissible top error banner', () => {
      expect(paymentsPageSrc).toContain('aria-label="Dismiss error"')
    })

    it('does NOT have the inline error card that replaces content area', () => {
      // The old code had: ) : error ? ( <div className="bg-red-900/20 ...">
      // This ternary branch has been removed.
      expect(paymentsPageSrc).not.toContain('bg-red-900/20 border border-red-800 text-red-400')
    })

    it('the loading ternary goes directly to content (no error branch)', () => {
      // After loading, the content should render regardless of error state
      const loadingIdx = paymentsPageSrc.indexOf('animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400')
      expect(loadingIdx).toBeGreaterThan(-1)
      const afterLoading = paymentsPageSrc.substring(loadingIdx, loadingIdx + 300)
      // Should go from loading spinner to <> (content), no error card in between
      expect(afterLoading).toContain(') : (')
      expect(afterLoading).toContain('<>')
    })
  })

  describe('cancel route returns structured retryable errors', () => {
    it('returns retryable: true on all 503 paths', () => {
      const matches = cancelRouteSrc.match(/retryable:\s*true/g)
      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThanOrEqual(4)
    })

    it('includes business_id in Stripe checkout session logging', () => {
      expect(cancelRouteSrc).toContain('business_id: paymentRequest.business_id')
    })

    it('logs reconciliation result after local mutation', () => {
      expect(cancelRouteSrc).toContain('Reconciliation result:')
      expect(cancelRouteSrc).toContain('verification_result:')
    })

    it('handles already-cancelled idempotently', () => {
      expect(cancelRouteSrc).toContain("status === 'cancelled' || paymentRequest.status === 'canceled'")
      expect(cancelRouteSrc).toContain('Payment request already cancelled')
    })

    it('refuses cancellation for paid payments', () => {
      expect(cancelRouteSrc).toContain("status === 'paid'")
      expect(cancelRouteSrc).toContain('Cannot cancel a paid payment request')
    })
  })

  describe('Stripe Connect account context (root cause of original failure)', () => {
    // The original physical failure was: Checkout Session created on a
    // connected account, but cancellation tried to retrieve/expire it on
    // the platform account. Stripe returned resource_missing, and the
    // route returned "Unable to verify cancellation with Stripe."
    //
    // The fix (commit 688dcbfb) uses stripeAccount: connectedAccountId for
    // BOTH retrieve and expire. These tests verify that contract persists.

    it('reads stripe_connect_account_id from the payment request', () => {
      expect(cancelRouteSrc).toContain('stripe_connect_account_id')
    })

    it('builds accountOptions with stripeAccount for connected accounts', () => {
      expect(cancelRouteSrc).toContain('stripeAccount: connectedAccountId')
    })

    it('passes accountOptions to checkout.sessions.retrieve', () => {
      expect(cancelRouteSrc).toContain('stripe.checkout.sessions.retrieve(sessionId, accountOptions)')
    })

    it('passes accountOptions to checkout.sessions.expire', () => {
      expect(cancelRouteSrc).toContain('stripe.checkout.sessions.expire(sessionId, accountOptions)')
    })

    it('falls back to undefined (platform) when no connected account', () => {
      expect(cancelRouteSrc).toContain(': undefined')
    })
  })

  describe('successful cancellation state flow (UI → API → Stripe → verify → reconcile)', () => {
    it('Step 1: retrieves session state before any local mutation', () => {
      // The retrieve must happen BEFORE the status update to 'cancelled'
      const retrieveIdx = cancelRouteSrc.indexOf('stripe.checkout.sessions.retrieve')
      const updateIdx = cancelRouteSrc.indexOf("status: 'cancelled'")
      expect(retrieveIdx).toBeGreaterThan(-1)
      expect(updateIdx).toBeGreaterThan(-1)
      expect(retrieveIdx).toBeLessThan(updateIdx)
    })

    it('Step 2a: expired session → safe to cancel locally (falls through)', () => {
      expect(cancelRouteSrc).toContain("sessionStatus === 'expired'")
      expect(cancelRouteSrc).toContain('safe to cancel locally')
    })

    it('Step 2b: open session → calls expire() before local cancellation', () => {
      expect(cancelRouteSrc).toContain("sessionStatus === 'open'")
      expect(cancelRouteSrc).toContain('stripe.checkout.sessions.expire')
    })

    it('Step 2c: complete + unpaid → terminal, safe to cancel locally', () => {
      expect(cancelRouteSrc).toContain("sessionStatus === 'complete'")
      expect(cancelRouteSrc).toContain("paymentStatus === 'unpaid'")
      expect(cancelRouteSrc).toContain('terminal_complete_unpaid')
    })

    it('Step 3: updates local status to cancelled after provider safety', () => {
      expect(cancelRouteSrc).toContain("status: 'cancelled'")
      expect(cancelRouteSrc).toContain('cancelled_at: new Date().toISOString()')
    })

    it('Step 4: verifies the update by re-fetching the row', () => {
      expect(cancelRouteSrc).toContain('select(\'id, status, cancelled_at, token\')')
      expect(cancelRouteSrc).toContain('verification_result')
    })

    it('Step 5: reconciles lead payment status', () => {
      expect(cancelRouteSrc).toContain("payment_status: 'cancelled'")
      expect(cancelRouteSrc).toContain('last_payment_request_id: null')
    })

    it('Step 6: creates timeline event', () => {
      expect(cancelRouteSrc).toContain('timelineEvents.paymentRequestCanceled')
    })

    it('returns success with status cancelled', () => {
      expect(cancelRouteSrc).toContain("status: 'cancelled'")
      expect(cancelRouteSrc).toContain('Payment request cancelled successfully')
    })
  })

  describe('already-cancelled idempotency', () => {
    it('returns 200 with already-cancelled message for both spellings', () => {
      expect(cancelRouteSrc).toContain("status === 'cancelled' || paymentRequest.status === 'canceled'")
      expect(cancelRouteSrc).toContain('Payment request already cancelled')
    })

    it('does NOT call Stripe for already-cancelled payments', () => {
      // The idempotent check is BEFORE the Stripe checkout session block
      const idempotentIdx = cancelRouteSrc.indexOf("status === 'cancelled' || paymentRequest.status === 'canceled'")
      const stripeIdx = cancelRouteSrc.indexOf('stripe.checkout.sessions.retrieve')
      expect(idempotentIdx).toBeGreaterThan(-1)
      expect(stripeIdx).toBeGreaterThan(-1)
      expect(idempotentIdx).toBeLessThan(stripeIdx)
    })
  })

  describe('genuinely non-cancelable states', () => {
    it('complete + paid → refuses cancellation, reconciles to paid', () => {
      expect(cancelRouteSrc).toContain("sessionStatus === 'complete' && paymentStatus === 'paid'")
      expect(cancelRouteSrc).toContain('reconcile to paid')
      expect(cancelRouteSrc).toContain('Payment already completed')
    })

    it('PaymentIntent succeeded → refuses cancellation, reconciles to paid', () => {
      expect(cancelRouteSrc).toContain("paymentIntent.status === 'succeeded'")
      expect(cancelRouteSrc).toContain('PaymentIntent already succeeded')
    })

    it('PaymentIntent processing → refuses cancellation', () => {
      expect(cancelRouteSrc).toContain("paymentIntent.status === 'processing'")
      expect(cancelRouteSrc).toContain('Payment is currently processing')
    })

    it('PaymentIntent intermediate state → refuses cancellation', () => {
      expect(cancelRouteSrc).toContain('requires_confirmation')
      expect(cancelRouteSrc).toContain('requires_action')
      expect(cancelRouteSrc).toContain('requires_capture')
    })

    it('resource_missing → refuses local cancellation (returns 503 retryable)', () => {
      expect(cancelRouteSrc).toContain("errorCode === 'resource_missing'")
      expect(cancelRouteSrc).toContain('refusing local cancellation for safety')
    })

    it('expire() failure → refuses local cancellation (returns 503 retryable)', () => {
      const expireIdx = cancelRouteSrc.indexOf('Failed to expire Stripe session')
      expect(expireIdx).toBeGreaterThan(-1)
      const afterExpire = cancelRouteSrc.substring(expireIdx, expireIdx + 1000)
      expect(afterExpire).toContain('Unable to verify cancellation with Stripe')
      expect(afterExpire).toContain('retryable: true')
    })

    it('unknown session status → refuses cancellation (returns 503 retryable)', () => {
      expect(cancelRouteSrc).toContain('Unknown session status')
      expect(cancelRouteSrc).toContain('refusing cancellation for safety')
    })

    it('no local mutation before provider safety is established', () => {
      // The safety contract comment must exist
      expect(cancelRouteSrc).toContain('No local mutation')
      expect(cancelRouteSrc).toContain('provider safety is established')
    })
  })

  describe('Tap to Pay (card_present) PaymentIntent safety', () => {
    it('checks PaymentIntent before local cancellation for card_present', () => {
      expect(cancelRouteSrc).toContain("payment_method_type === 'card_present'")
      expect(cancelRouteSrc).toContain('stripe_payment_intent_id')
    })

    it('uses stripe_connect_account_id for PaymentIntent retrieve', () => {
      expect(cancelRouteSrc).toContain('stripe.paymentIntents.retrieve')
      expect(cancelRouteSrc).toContain('stripeAccount: paymentRequest.stripe_connect_account_id')
    })

    it('requires_payment_method or canceled → safe to cancel locally', () => {
      expect(cancelRouteSrc).toContain("paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'canceled'")
    })
  })
})

// ============================================================================
// FIX 3 — View Customer navigation from modal (deterministic, no setTimeout)
// ============================================================================
describe('FIX 3: View Customer navigation from modal', () => {
  it('captures customerId before closing (avoids null payment after unmount)', () => {
    const viewCustomerIdx = editModalSrc.indexOf('handleViewCustomer')
    expect(viewCustomerIdx).toBeGreaterThan(-1)
    const handlerSection = editModalSrc.substring(viewCustomerIdx, viewCustomerIdx + 800)
    expect(handlerSection).toContain('const customerId = payment.leads.id')
  })

  it('calls suppressNextHistoryBackCleanup before onClose', () => {
    const viewCustomerIdx = editModalSrc.indexOf('handleViewCustomer')
    const handlerSection = editModalSrc.substring(viewCustomerIdx, viewCustomerIdx + 2000)
    // Both must exist in the handler
    expect(handlerSection).toContain('suppressNextHistoryBackCleanup()')
    expect(handlerSection).toContain('onClose()')
    // The actual CALL lines (not comment mentions) must be ordered:
    // suppressNextHistoryBackCleanup() before onClose(). Both calls
    // appear on their own indented lines at the end of the handler.
    const callPattern = 'suppressNextHistoryBackCleanup()\n      onClose()\n      onViewCustomer(customerId)'
    expect(handlerSection).toContain(callPattern)
  })

  it('calls onViewCustomer synchronously after onClose (no setTimeout)', () => {
    const viewCustomerIdx = editModalSrc.indexOf('handleViewCustomer')
    const handlerSection = editModalSrc.substring(viewCustomerIdx, viewCustomerIdx + 2000)
    expect(handlerSection).toContain('onClose()')
    expect(handlerSection).toContain('onViewCustomer(customerId)')
    // Must NOT use setTimeout or requestAnimationFrame
    expect(handlerSection).not.toContain('setTimeout')
    expect(handlerSection).not.toContain('requestAnimationFrame')
  })

  it('imports suppressNextHistoryBackCleanup from modalBackButton', () => {
    expect(editModalSrc).toContain("from '@/lib/modalBackButton'")
    expect(editModalSrc).toContain('suppressNextHistoryBackCleanup')
  })
})

// ============================================================================
// FIX 3b — Modal back-button suppression mechanism (deterministic contract)
// ============================================================================
describe('FIX 3b: Modal back-button suppression mechanism', () => {
  it('modalBackButton exports suppressNextHistoryBackCleanup', () => {
    expect(modalBackButtonSrc).toContain('export function suppressNextHistoryBackCleanup')
  })

  it('modalBackButton exports consumeHistoryBackSuppression', () => {
    expect(modalBackButtonSrc).toContain('export function consumeHistoryBackSuppression')
  })

  it('suppression is one-shot (consume clears the flag)', () => {
    expect(modalBackButtonSrc).toContain('suppressHistoryBackCleanupOnce = false')
  })

  it('useModalBackButton imports consumeHistoryBackSuppression', () => {
    expect(useModalBackButtonSrc).toContain('consumeHistoryBackSuppression')
  })

  it('useModalBackButton calls consumeHistoryBackSuppression before history.back()', () => {
    const cleanupIdx = useModalBackButtonSrc.indexOf('historyPushedRef.current && !hasOpenModal() && !closedByPopStateRef.current')
    expect(cleanupIdx).toBeGreaterThan(-1)
    const cleanupSection = useModalBackButtonSrc.substring(cleanupIdx, cleanupIdx + 1200)
    // Must check suppression BEFORE calling history.back()
    const consumeIdx = cleanupSection.indexOf('consumeHistoryBackSuppression()')
    const backIdx = cleanupSection.indexOf('window.history.back()')
    expect(consumeIdx).toBeGreaterThan(-1)
    expect(backIdx).toBeGreaterThan(-1)
    expect(consumeIdx).toBeLessThan(backIdx)
  })

  it('useModalBackButton skips history.back() when suppression is active', () => {
    const cleanupIdx = useModalBackButtonSrc.indexOf('historyPushedRef.current && !hasOpenModal() && !closedByPopStateRef.current')
    const cleanupSection = useModalBackButtonSrc.substring(cleanupIdx, cleanupIdx + 800)
    expect(cleanupSection).toContain('suppressed for navigation')
  })
})

// ============================================================================
// FIX 4 — Payment Name vs Description semantics
// ============================================================================
describe('FIX 4: Payment Name vs Description semantics', () => {
  describe('getPaymentDescription returns only description', () => {
    it('does NOT return display_name from getPaymentDescription', () => {
      const descIdx = paymentsPageSrc.indexOf('getPaymentDescription')
      expect(descIdx).toBeGreaterThan(-1)
      const fnSection = paymentsPageSrc.substring(descIdx, descIdx + 500)
      // The function should return payment.description, NOT payment.display_name
      expect(fnSection).toContain('return payment.description')
      expect(fnSection).not.toContain('if (payment.display_name)')
    })
  })

  describe('getPaymentTitle prefers display_name', () => {
    it('has a getPaymentTitle function', () => {
      expect(paymentsPageSrc).toContain('getPaymentTitle')
    })

    it('getPaymentTitle returns display_name if present', () => {
      const titleIdx = paymentsPageSrc.indexOf('getPaymentTitle')
      const fnSection = paymentsPageSrc.substring(titleIdx, titleIdx + 300)
      expect(fnSection).toContain('if (payment.display_name)')
      expect(fnSection).toContain('return payment.display_name')
    })

    it('getPaymentTitle falls back to getCustomerName', () => {
      const titleIdx = paymentsPageSrc.indexOf('getPaymentTitle')
      const fnSection = paymentsPageSrc.substring(titleIdx, titleIdx + 300)
      expect(fnSection).toContain('getCustomerName(payment)')
    })
  })

  describe('card titles use getPaymentTitle', () => {
    it('mobile visible payments card uses getPaymentTitle', () => {
      expect(paymentsPageSrc).toContain('{getPaymentTitle(payment)}')
    })

    it('does NOT use getCustomerName directly in card header title', () => {
      // The old code had {getCustomerName(payment)} as the card title.
      // Now it should use {getPaymentTitle(payment)} instead.
      // getCustomerName is still used inside getPaymentTitle as a fallback.
      const customerNameUsages = paymentsPageSrc.match(/\{getCustomerName\(payment\)\}/g)
      // Should be 0 direct uses in JSX (only inside getPaymentTitle function)
      if (customerNameUsages) {
        expect(customerNameUsages.length).toBe(0)
      }
    })
  })
})

// ============================================================================
// FIX 5 — Venmo fallback card simplification
// ============================================================================
describe('FIX 5: Venmo fallback card simplification', () => {
  it('uses simplified heading "If Venmo doesn\'t open"', () => {
    expect(handoffSrc).toContain("doesn&rsquo;t open")
  })

  it('does NOT have the old "If Venmo doesn\'t open automatically" heading', () => {
    expect(handoffSrc).not.toContain("doesn't open automatically")
  })

  it('has a single manual instruction line with @username and no repeated amount', () => {
    // The simplified fallback should have a single "Open Venmo manually and pay @username" line
    expect(handoffSrc).toContain('Open Venmo manually and pay')
    expect(handoffSrc).toContain('@{venmoUsername}')
    expect(handoffSrc).toContain('as the payment note')
  })

  it('has a copy-username button in the fallback', () => {
    expect(handoffSrc).toContain("copyToClipboard(`@${venmoUsername}`, 'username-fallback')")
  })

  it('references the payment note (not a repeated Note row)', () => {
    expect(handoffSrc).toContain('as the payment note')
  })

  it('does NOT have separate Recipient/Amount/Note rows in the fallback section', () => {
    // The old fallback had three separate rows duplicating the payment details.
    // The simplified fallback should not have those repeated label rows.
    // Find the fallback section (after "doesn&rsquo;t open")
    const fallbackIdx = handoffSrc.indexOf("doesn&rsquo;t open")
    expect(fallbackIdx).toBeGreaterThan(-1)
    // Get a generous window for the fallback section
    const fallbackSection = handoffSrc.substring(fallbackIdx, fallbackIdx + 1500)
    // Should NOT have the old separate rows with these labels
    // (the payment details card above still has them, but the fallback should not)
    expect(fallbackSection).not.toContain('>Recipient<')
    expect(fallbackSection).not.toContain('>Amount<')
    expect(fallbackSection).not.toContain('>Note<')
  })
})
