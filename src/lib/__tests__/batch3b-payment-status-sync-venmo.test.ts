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

describe('B/C. Venmo handoff and fallback card', () => {
  it('shows opening/loading state before handoff', () => {
    expect(handoffSrc).toContain('setOpening(true)')
    expect(handoffSrc).toContain('Opening ${providerName}')
  })

  it('clears opening state after a bounded timeout', () => {
    expect(handoffSrc).toMatch(/setTimeout.*setOpening\(false\)/)
    expect(handoffSrc).toMatch(/2500/)
  })

  it('does not wait on analytics or unrelated network before opening', () => {
    expect(handoffSrc).not.toContain('analytics')
  })

  it('simplified fallback card shows manual instructions and useful copy only', () => {
    expect(handoffSrc).toContain('Open Venmo manually and pay')
    expect(handoffSrc).toContain('username-fallback')
    // Fallback block should not repeat the amount or the primary details
    const fallbackStart = handoffSrc.indexOf("If {providerName} doesn't open")
    const fallbackSrc = fallbackStart >= 0 ? handoffSrc.slice(fallbackStart) : ''
    expect(fallbackSrc).not.toContain('formattedAmount')
    expect(fallbackSrc).not.toContain("copyToClipboard(amount,")
  })

  it('does not duplicate recipient or note in fallback card', () => {
    // Recovery card should not include the primary Payment Details again
    expect(handoffSrc).not.toContain('Pay <span className="font-medium text-gray-900">@{venmoUsername}</span> {formattedAmount} in Venmo.')
  })
})
