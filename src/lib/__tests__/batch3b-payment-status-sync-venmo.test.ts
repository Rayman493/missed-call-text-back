import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const cancelRouteSrc = readSrc('src/app/api/payments/[id]/cancel/route.ts')
const listApiSrc = readSrc('src/app/api/billing-documents/route.ts')
const getApiSrc = readSrc('src/app/api/billing-documents/[id]/route.ts')
const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')
const handoffSrc = readSrc('src/components/PaymentHandoff.tsx')

describe('A. payment / billing document status sync', () => {
  it('cancel does not overwrite invoice document status to cancelled', () => {
    expect(cancelRouteSrc).not.toContain(".update({ status: 'cancelled' })")
    expect(cancelRouteSrc).not.toMatch(/billing_documents.*status.*cancelled/)
    expect(cancelRouteSrc).toMatch(/does NOT cancel the invoice/)
  })

  it('list API joins linked payment request status', () => {
    expect(listApiSrc).toContain('payment_request:payment_requests!payment_request_id')
    expect(listApiSrc).toContain('status')
  })

  it('detail API joins linked payment request status', () => {
    expect(getApiSrc).toContain('payment_request:payment_requests!payment_request_id')
  })

  it('document list item includes payment_request type', () => {
    expect(listSrc).toContain('payment_request:')
    expect(listSrc).toContain('paymentRequest?.status')
  })

  it('list no longer claims waiting after payment cancelled', () => {
    expect(listSrc).toContain('Payment cancelled. Resend to request again.')
    expect(listSrc).toContain("isPaymentCancelled")
    expect(listSrc).not.toMatch(/else if \(isSent && !isQuote\) subline = 'Waiting for payment'/)
  })

  it('viewer uses payment request status for invoice guidance', () => {
    expect(viewerSrc).toContain('payment_request?.status')
    expect(viewerSrc).toContain('Payment cancelled. You can resend the invoice to request payment again.')
    expect(viewerSrc).toContain('Payment received.')
  })

  it('payments page listens for payment_request realtime changes', () => {
    expect(paymentsPageSrc).toContain("'payment_requests'")
    expect(paymentsPageSrc).toContain("fetchBillingDocuments()")
    expect(paymentsPageSrc).toContain('payment_request:')
  })
})

describe('B/C. Venmo/PayPal instruction page (no app launch)', () => {
  it('does not attempt to open the provider app or deep-link out', () => {
    expect(handoffSrc).not.toContain('Browser.open(')
    expect(handoffSrc).not.toContain('window.open(')
    expect(handoffSrc).not.toContain('Capacitor.isNativePlatform')
    expect(handoffSrc).not.toContain('openProvider')
    expect(handoffSrc).not.toContain('setOpening')
  })

  it('does not wait on analytics or unrelated network', () => {
    expect(handoffSrc).not.toContain('analytics')
  })

  it('shows manual how-to-pay instructions', () => {
    expect(handoffSrc).toContain('How to pay with {providerName}')
    expect(handoffSrc).toContain('Open Venmo on your phone')
    expect(handoffSrc).toContain('Send ${formattedAmount}')
    expect(handoffSrc).toContain('as the payment note')
  })

  it('keeps recipient/amount/note copy controls in the details card', () => {
    // Canonical handle helper — never renders a double-@ recipient.
    expect(handoffSrc).toContain('canonicalProviderHandle(venmoUsername)')
    expect(handoffSrc).not.toContain('@{venmoUsername}')
    expect(handoffSrc).toContain("'amount'")
    expect(handoffSrc).toContain('Payment Note')
  })
})
