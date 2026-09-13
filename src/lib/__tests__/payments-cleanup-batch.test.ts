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
})

// ============================================================================
// FIX 3 — View Customer navigation from modal
// ============================================================================
describe('FIX 3: View Customer navigation from modal', () => {
  it('closes the modal before navigating', () => {
    const viewCustomerIdx = editModalSrc.indexOf('handleViewCustomer')
    expect(viewCustomerIdx).toBeGreaterThan(-1)
    const handlerSection = editModalSrc.substring(viewCustomerIdx, viewCustomerIdx + 600)
    expect(handlerSection).toContain('onClose()')
  })

  it('defers navigation to let modal history cleanup run', () => {
    const viewCustomerIdx = editModalSrc.indexOf('handleViewCustomer')
    const handlerSection = editModalSrc.substring(viewCustomerIdx, viewCustomerIdx + 600)
    expect(handlerSection).toContain('setTimeout')
    expect(handlerSection).toContain('onViewCustomer(customerId)')
  })

  it('captures customerId before closing (avoids null payment after unmount)', () => {
    const viewCustomerIdx = editModalSrc.indexOf('handleViewCustomer')
    const handlerSection = editModalSrc.substring(viewCustomerIdx, viewCustomerIdx + 600)
    expect(handlerSection).toContain('const customerId = payment.leads.id')
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

  it('has a single instruction line with Pay @username $amount', () => {
    // The simplified fallback should have a single "Pay @username $amount in Venmo" line
    expect(handoffSrc).toContain('Pay ')
    expect(handoffSrc).toContain('@{venmoUsername}')
    expect(handoffSrc).toContain('{formattedAmount}')
    expect(handoffSrc).toContain('in Venmo')
  })

  it('has a copy-username button in the fallback', () => {
    expect(handoffSrc).toContain("copyToClipboard(venmoUsername, 'username-fallback')")
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
