/**
 * Shared billing document utilities for Quote/Invoice foundation.
 *
 * Money is stored as integer cents. All authoritative totals are
 * recalculated server-side — the API never trusts client-calculated totals.
 */

export type BillingDocumentType = 'quote' | 'invoice'
export type BillingDocumentStatus = 'draft' | 'sent' | 'cancelled' | 'accepted' | 'declined' | 'expired' | 'paid' | 'overdue'

export interface BillingLineItemInput {
  id?: string
  description?: string
  quantity?: number | string
  unit_label?: string | null
  unit_price_cents?: number | string
}

export interface BillingLineItem extends Omit<BillingLineItemInput, 'quantity' | 'unit_price_cents'> {
  id: string
  description: string
  quantity: number
  unit_label: string | null
  unit_price_cents: number
  line_total_cents: number
}

export interface BillingTotals {
  subtotal_cents: number
  discount_cents: number
  tax_cents: number
  total_cents: number
}

/**
 * Parse a quantity value that may arrive as a string from the client.
 * Quantities support up to 3 decimal places (e.g. 1.5 hours, 120.5 ft).
 */
export function parseQuantity(value: number | string | undefined): number {
  if (value === undefined || value === null || value === '') return 1
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!isFinite(n) || isNaN(n) || n < 0) return 0
  // Round to 3 decimal places to avoid floating-point drift
  return Math.round(n * 1000) / 1000
}

/**
 * Parse a cents value that may arrive as a string from the client.
 */
export function parseCents(value: number | string | undefined): number {
  if (value === undefined || value === null || value === '') return 0
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!isFinite(n) || isNaN(n) || n < 0) return 0
  return Math.round(n)
}

/**
 * Calculate a single line item's total in cents.
 * line_total_cents = round(quantity * unit_price_cents)
 *
 * Uses integer-safe math: quantity is scaled to avoid floating-point
 * corruption. Since unit_price_cents is already an integer, we multiply
 * and round the result.
 */
export function calculateLineTotal(quantity: number, unitPriceCents: number): number {
  if (quantity <= 0 || unitPriceCents <= 0) return 0
  // quantity may be fractional (e.g. 1.5 hours). Multiply carefully.
  const total = quantity * unitPriceCents
  return Math.max(0, Math.round(total))
}

/**
 * Normalize a line item input: parse quantity/price, calculate line total.
 * Returns a sanitized BillingLineItem suitable for persistence.
 */
export function normalizeLineItem(input: BillingLineItemInput, sortOrder: number): BillingLineItem {
  const quantity = parseQuantity(input.quantity)
  const unitPriceCents = parseCents(input.unit_price_cents)
  return {
    id: input.id || '',
    description: (input.description || '').trim(),
    quantity,
    unit_label: input.unit_label ? input.unit_label.trim() : null,
    unit_price_cents: unitPriceCents,
    line_total_cents: calculateLineTotal(quantity, unitPriceCents),
  }
}

/**
 * Recalculate document totals from line items + discount + tax.
 * This is the authoritative server-side calculation — the API always
 * calls this and never persists client-provided totals.
 *
 * total = max(0, subtotal - discount + tax)
 */
export function calculateTotals(
  lineItems: BillingLineItem[],
  discountCents: number,
  taxCents: number
): BillingTotals {
  const subtotal = lineItems.reduce((sum, item) => sum + item.line_total_cents, 0)
  const discount = Math.max(0, Math.round(discountCents))
  const tax = Math.max(0, Math.round(taxCents))
  // Total can never be negative
  const total = Math.max(0, subtotal - discount + tax)
  return {
    subtotal_cents: subtotal,
    discount_cents: discount,
    tax_cents: tax,
    total_cents: total,
  }
}

/**
 * Generate the document number prefix for a document type.
 */
export function documentNumberPrefix(type: BillingDocumentType): string {
  return type === 'quote' ? 'Q-' : 'INV-'
}

/**
 * Canonical PostgREST select projection for the leads relation embedded in
 * billing document queries.
 *
 * Production `leads` table columns (verified via PostgREST OpenAPI):
 *   id, business_id, caller_phone, status, contact_name, company_name,
 *   notes, tags, raw_metadata, source, created_at, ...
 *
 * NOT present in production: `name`, `email`, `phone`.
 * Use this constant in every billing route that embeds leads to avoid
 * 42703 (column does not exist) errors.
 */
export const BILLING_LEADS_SELECT = 'leads ( id, contact_name, caller_phone )'

/**
 * Resolve a billing customer display name from a lead row.
 * Fallback chain: contact_name → caller_phone → 'No customer'.
 */
export function billingCustomerName(lead: { contact_name?: string | null; caller_phone?: string | null } | null | undefined): string {
  if (!lead) return 'No customer'
  return lead.contact_name || lead.caller_phone || 'No customer'
}
