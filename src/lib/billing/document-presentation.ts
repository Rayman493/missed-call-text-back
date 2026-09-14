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

/**
 * Format a date-only value (YYYY-MM-DD) as a long human-readable string.
 *
 * Date-only fields (issue_date, valid_until, due_date) are stored as
 * YYYY-MM-DD strings in Postgres. We parse the year/month/day components
 * directly and construct a LOCAL date to avoid the UTC-midnight →
 * local-timezone shift that would render the date one day early in
 * negative-offset timezones (e.g. America/New_York).
 *
 * For timestamp strings (containing 'T' or time components), falls back
 * to standard Date parsing since those have an explicit time component.
 */
export function formatDate(iso: string | null): string {
  if (!iso) return ''
  const sliced = iso.slice(0, 10)
  const parts = sliced.split('-')
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    const day = parseInt(parts[2], 10)
    if (year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // Construct as LOCAL date — no UTC midnight shift
      const d = new Date(year, month - 1, day)
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    }
  }
  // Fallback for timestamp strings with time component
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
