/**
 * Canonical document presentation model for Quote/Invoice.
 *
 * Used by:
 * - Preview (in-editor)
 * - Hosted customer page
 * - PDF renderer
 *
 * All three render from the same data shape to avoid visual drift.
 */

export interface DocumentLineItem {
  description: string
  quantity: number
  unit_label: string | null
  unit_price_cents: number
  line_total_cents: number
}

export interface DocumentPresentation {
  document_type: 'quote' | 'invoice'
  document_number: string
  status: string
  issue_date: string
  valid_until: string | null
  due_date: string | null

  // Business (snapshot or live)
  business_name: string
  business_phone: string | null
  business_email: string | null
  business_address: string | null
  business_logo_url: string | null

  // Customer (snapshot or live)
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  customer_address: string | null

  // Line items + totals
  line_items: DocumentLineItem[]
  subtotal_cents: number
  discount_cents: number
  tax_cents: number
  total_cents: number

  notes: string | null
  terms: string | null

  // Payment link (invoice only, hosted page)
  payment_url: string | null
}

export function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatQuantity(qty: number): string {
  if (Number.isInteger(qty)) return String(qty)
  return String(qty).replace(/\.?0+$/, '')
}

/**
 * Compute effective status for display.
 * Sent quotes past valid_until → expired.
 * Sent invoices past due_date → overdue.
 */
export function effectiveStatus(doc: DocumentPresentation): string {
  if (doc.status === 'sent') {
    const today = new Date().toISOString().slice(0, 10)
    if (doc.document_type === 'quote' && doc.valid_until && doc.valid_until < today) {
      return 'expired'
    }
    if (doc.document_type === 'invoice' && doc.due_date && doc.due_date < today) {
      return 'overdue'
    }
  }
  return doc.status
}
