import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { BillingDocumentPdf } from '@/components/billing/BillingDocumentPdf'
import type { DocumentPresentation } from '@/lib/billing/document-presentation'

/**
 * Regression coverage for the production React error #31 failure that
 * occurred when downloading a billing document PDF on Vercel.
 *
 * Root cause: Next.js 15 bundles its own React 19 canary for server-side
 * JSX, which creates elements with $$typeof = Symbol.for('react.transitional.element').
 * @react-pdf/renderer is in Next.js's default serverExternalPackages list,
 * so @react-pdf/reconciler imports react from node_modules (18.3.1) and
 * selects the React 18 reconciler (reconciler-23), which only recognizes
 * Symbol.for('react.element'). The symbol mismatch causes React error #31.
 *
 * The fix is a patch-package patch on @react-pdf/reconciler that makes
 * reconciler-23 also recognize Symbol.for('react.transitional.element').
 *
 * These tests render the real BillingDocumentPdf component (not a mock)
 * through @react-pdf/renderer's renderToBuffer, exercising the same code
 * path as the production PDF route. They assert that:
 *   - rendering does not throw React error #31
 *   - the output is a non-empty binary buffer
 *   - the output begins with the PDF signature %PDF-
 *
 * Note: in the vitest environment, JSX uses the installed React 18.3.1,
 * so these tests do NOT exercise the symbol mismatch directly. They
 * guard against regressions in the BillingDocumentPdf component itself
 * and confirm the @react-pdf/renderer pipeline produces valid PDFs.
 * The symbol-mismatch fix is verified by the production build + route
 * test in scripts and the patch file at patches/@react-pdf+reconciler+2.0.0.patch.
 */

const baseQuote: DocumentPresentation = {
  document_type: 'quote',
  document_number: 'Q-1001',
  status: 'draft',
  issue_date: '2026-09-14',
  valid_until: '2026-09-21',
  due_date: null,
  business_name: 'Acme Plumbing Co',
  business_phone: '+15551234567',
  business_email: 'hello@acme.example',
  business_address: '123 Main St, Springfield, IL 62701',
  business_logo_url: null,
  customer_name: 'Jane Customer',
  customer_phone: '+15559876543',
  customer_email: 'jane@example.com',
  customer_address: '456 Oak Ave, Shelbyville, IL 62501',
  line_items: [
    {
      description: 'Fix leaky kitchen faucet',
      quantity: 1,
      unit_label: null,
      unit_price_cents: 15000,
      line_total_cents: 15000,
    },
    {
      description: 'Replace bathroom valve',
      quantity: 2,
      unit_label: 'each',
      unit_price_cents: 4500,
      line_total_cents: 9000,
    },
  ],
  subtotal_cents: 24000,
  discount_cents: 0,
  tax_cents: 1920,
  total_cents: 25920,
  notes: 'Thanks for your business.',
  terms: 'Payment due within 7 days of acceptance.',
  payment_url: null,
}

function toPdfHeader(buffer: Uint8Array | Buffer): string {
  return Buffer.from(buffer.slice(0, 5)).toString('latin1')
}

describe('BillingDocumentPdf rendering', () => {
  it('renders a Quote PDF without throwing and produces a valid PDF signature', async () => {
    const buffer = await renderToBuffer(<BillingDocumentPdf doc={baseQuote} />)
    expect(buffer.length).toBeGreaterThan(1000)
    expect(toPdfHeader(buffer)).toBe('%PDF-')
  }, 60000)

  it('renders an Invoice PDF without throwing and produces a valid PDF signature', async () => {
    const invoice: DocumentPresentation = {
      ...baseQuote,
      document_type: 'invoice',
      document_number: 'INV-2002',
      status: 'sent',
      issue_date: '2026-09-14',
      valid_until: null,
      due_date: '2026-09-28',
    }
    const buffer = await renderToBuffer(<BillingDocumentPdf doc={invoice} />)
    expect(buffer.length).toBeGreaterThan(1000)
    expect(toPdfHeader(buffer)).toBe('%PDF-')
  }, 60000)

  it('renders a Quote with a payment_url without throwing', async () => {
    const quoteWithPay: DocumentPresentation = {
      ...baseQuote,
      payment_url: 'https://pay.example.com/quote/Q-1001',
    }
    const buffer = await renderToBuffer(<BillingDocumentPdf doc={quoteWithPay} />)
    expect(buffer.length).toBeGreaterThan(1000)
    expect(toPdfHeader(buffer)).toBe('%PDF-')
  }, 60000)

  it('renders an Invoice with a discount without throwing', async () => {
    const invoiceWithDiscount: DocumentPresentation = {
      ...baseQuote,
      document_type: 'invoice',
      document_number: 'INV-2003',
      status: 'sent',
      issue_date: '2026-09-14',
      valid_until: null,
      due_date: '2026-09-28',
      discount_cents: 2000,
      total_cents: 23920,
    }
    const buffer = await renderToBuffer(<BillingDocumentPdf doc={invoiceWithDiscount} />)
    expect(buffer.length).toBeGreaterThan(1000)
    expect(toPdfHeader(buffer)).toBe('%PDF-')
  }, 60000)

  it('produces deterministic output for the same Quote input', async () => {
    const a = await renderToBuffer(<BillingDocumentPdf doc={baseQuote} />)
    const b = await renderToBuffer(<BillingDocumentPdf doc={baseQuote} />)
    expect(a.length).toBe(b.length)
  }, 60000)
})
