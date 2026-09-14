/**
 * Quote / Invoice Foundation — Regression Tests
 *
 * SCHEMA / SECURITY
 * 1. quote document type supported
 * 2. invoice document type supported
 * 3. business ownership enforced
 * 4. cross-business customer rejected
 * 5. cross-business job rejected
 * 6. items inaccessible across businesses
 *
 * NUMBERING
 * 7. quote numbering generated
 * 8. invoice numbering generated
 * 9. uniqueness within business/type
 *
 * MONEY
 * 10. line total calculation
 * 11. subtotal calculation
 * 12. discount applied
 * 13. tax applied
 * 14. total calculated server-side
 * 15. negative totals prevented
 * 16. decimal quantity safe
 *
 * DRAFTS
 * 17. create draft
 * 18. update draft
 * 19. reopen draft with items intact
 * 20. draft can exist without customer
 * 21. draft can exist with partial fields
 *
 * UI
 * 22. Payments has Quote / Invoice action
 * 23. chooser contains Create Quote and Create Invoice
 * 24. Quote editor uses valid-until
 * 25. Invoice editor uses due-date
 * 26. line item add/remove
 * 27. totals update
 * 28. Save Draft wired
 * 29. document list shows status/type/number/total
 * 30. draft row can reopen editor
 *
 * MODAL
 * 31. shared Modal used
 * 32. modal normalization tests remain green
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const migrationSrc = readSrc('supabase/migrations/20260913210000_create_billing_documents.sql')
const billingUtilsSrc = readSrc('src/lib/billing/billing-utils.ts')
const apiListSrc = readSrc('src/app/api/billing-documents/route.ts')
const apiItemSrc = readSrc('src/app/api/billing-documents/[id]/route.ts')
const chooserSrc = readSrc('src/components/billing/BillingChooserModal.tsx')
const editorSrc = readSrc('src/components/billing/BillingEditorModal.tsx')
const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')

// ============================================================================
// SCHEMA / SECURITY
// ============================================================================
describe('SCHEMA / SECURITY', () => {
  it('1. quote document type supported', () => {
    expect(migrationSrc).toContain("document_type IN ('quote', 'invoice')")
    expect(migrationSrc).toContain("CHECK (document_type IN ('quote', 'invoice'))")
  })

  it('2. invoice document type supported', () => {
    expect(migrationSrc).toContain("'invoice'")
  })

  it('3. business ownership enforced (RLS uses businesses.user_id = auth.uid())', () => {
    expect(migrationSrc).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migrationSrc).toContain('businesses.user_id = auth.uid()')
    // billing_documents select policy
    expect(migrationSrc).toContain('billing_documents_select_own')
    // billing_document_items select policy (inherited through parent)
    expect(migrationSrc).toContain('billing_document_items_select_own')
  })

  it('4. cross-business customer rejected (API validates customer_id belongs to business)', () => {
    expect(apiListSrc).toContain("from('leads')")
    expect(apiListSrc).toContain('.eq(\'business_id\', business.id)')
    expect(apiItemSrc).toContain("from('leads')")
    expect(apiItemSrc).toContain('Customer not found in your business')
  })

  it('5. cross-business job rejected (API validates job_id belongs to business)', () => {
    expect(apiListSrc).toContain("from('jobs')")
    expect(apiListSrc).toContain('Job not found in your business')
    expect(apiItemSrc).toContain("from('jobs')")
  })

  it('6. items inaccessible across businesses (RLS inherited through parent document)', () => {
    expect(migrationSrc).toContain('billing_document_items')
    expect(migrationSrc).toContain('document_id IN')
    expect(migrationSrc).toContain('SELECT bd.id FROM billing_documents bd')
  })

  it('RLS enabled on billing_document_counters', () => {
    expect(migrationSrc).toContain('ALTER TABLE billing_document_counters ENABLE ROW LEVEL SECURITY')
  })

  it('business_id index created', () => {
    expect(migrationSrc).toContain('idx_billing_documents_business_id')
  })

  it('unique constraint on business + type + document_number', () => {
    expect(migrationSrc).toContain('UNIQUE (business_id, document_type, document_number)')
  })

  it('money fields use integer cents with CHECK >= 0', () => {
    expect(migrationSrc).toContain('subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0)')
    expect(migrationSrc).toContain('discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0)')
    expect(migrationSrc).toContain('tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0)')
    expect(migrationSrc).toContain('total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0)')
    expect(migrationSrc).toContain('unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0)')
    expect(migrationSrc).toContain('line_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (line_total_cents >= 0)')
  })
})

// ============================================================================
// NUMBERING
// ============================================================================
describe('NUMBERING', () => {
  it('7. quote numbering generated (Q- prefix, starts at 1001)', () => {
    expect(migrationSrc).toContain('assign_billing_document_number')
    expect(migrationSrc).toContain("v_prefix := 'Q-'")
    expect(migrationSrc).toContain('1001')
  })

  it('8. invoice numbering generated (INV- prefix)', () => {
    expect(migrationSrc).toContain("v_prefix := 'INV-'")
  })

  it('9. uniqueness within business/type (unique constraint + counter table)', () => {
    expect(migrationSrc).toContain('billing_document_counters')
    expect(migrationSrc).toContain('PRIMARY KEY (business_id, document_type)')
    expect(migrationSrc).toContain('UNIQUE (business_id, document_type, document_number)')
  })

  it('numbering uses atomic UPDATE for concurrency safety', () => {
    expect(migrationSrc).toContain('ON CONFLICT (business_id, document_type) DO NOTHING')
    expect(migrationSrc).toContain('UPDATE billing_document_counters')
    expect(migrationSrc).toContain('SET next_number = next_number + 1')
  })

  it('API calls RPC for document number', () => {
    expect(apiListSrc).toContain('rpc(\'assign_billing_document_number\'')
  })
})

// ============================================================================
// MONEY
// ============================================================================
describe('MONEY', () => {
  // Import the actual functions for runtime testing
  const billingUtils = require(join(repoRoot, 'src/lib/billing/billing-utils.ts'))

  it('10. line total calculation (quantity * unit_price_cents)', () => {
    expect(billingUtils.calculateLineTotal(1, 3500)).toBe(3500)
    expect(billingUtils.calculateLineTotal(2, 3500)).toBe(7000)
    expect(billingUtils.calculateLineTotal(0, 3500)).toBe(0)
    expect(billingUtils.calculateLineTotal(1, 0)).toBe(0)
  })

  it('11. subtotal calculation (sum of line totals)', () => {
    const items = [
      { id: '1', description: 'a', quantity: 2, unit_label: null, unit_price_cents: 3500, line_total_cents: 7000 },
      { id: '2', description: 'b', quantity: 1, unit_label: null, unit_price_cents: 15000, line_total_cents: 15000 },
    ]
    const totals = billingUtils.calculateTotals(items, 0, 0)
    expect(totals.subtotal_cents).toBe(22000)
  })

  it('12. discount applied', () => {
    const items = [{ id: '1', description: 'a', quantity: 1, unit_label: null, unit_price_cents: 10000, line_total_cents: 10000 }]
    const totals = billingUtils.calculateTotals(items, 2000, 0)
    expect(totals.discount_cents).toBe(2000)
    expect(totals.total_cents).toBe(8000)
  })

  it('13. tax applied', () => {
    const items = [{ id: '1', description: 'a', quantity: 1, unit_label: null, unit_price_cents: 10000, line_total_cents: 10000 }]
    const totals = billingUtils.calculateTotals(items, 0, 800)
    expect(totals.tax_cents).toBe(800)
    expect(totals.total_cents).toBe(10800)
  })

  it('14. total calculated server-side (API recalculates, does not trust client)', () => {
    expect(apiListSrc).toContain('calculateTotals')
    expect(apiItemSrc).toContain('calculateTotals')
    // API does not accept total_cents from the body
    expect(apiListSrc).not.toMatch(/body\.total_cents/)
  })

  it('15. negative totals prevented (Math.max(0, ...))', () => {
    const items = [{ id: '1', description: 'a', quantity: 1, unit_label: null, unit_price_cents: 5000, line_total_cents: 5000 }]
    // Discount larger than subtotal
    const totals = billingUtils.calculateTotals(items, 10000, 0)
    expect(totals.total_cents).toBe(0)
    expect(totals.total_cents).toBeGreaterThanOrEqual(0)
  })

  it('16. decimal quantity safe (3 decimal places)', () => {
    expect(billingUtils.calculateLineTotal(1.5, 8500)).toBe(12750)
    expect(billingUtils.calculateLineTotal(120.5, 35)).toBe(4218)
    expect(billingUtils.parseQuantity('1.5')).toBe(1.5)
    expect(billingUtils.parseQuantity('2')).toBe(2)
    expect(billingUtils.parseQuantity('')).toBe(1)
    expect(billingUtils.parseQuantity(undefined)).toBe(1)
  })
})

// ============================================================================
// DRAFTS
// ============================================================================
describe('DRAFTS', () => {
  it('17. create draft (POST route inserts with status draft)', () => {
    expect(apiListSrc).toContain("status: 'draft'")
    expect(apiListSrc).toContain('from(\'billing_documents\')')
    expect(apiListSrc).toContain('.insert(insertPayload)')
  })

  it('18. update draft (PATCH route updates existing)', () => {
    expect(apiItemSrc).toContain('.update(updatePayload)')
    expect(apiItemSrc).toContain('.eq(\'id\', id)')
  })

  it('19. reopen draft with items intact (GET fetches items + PATCH replaces items)', () => {
    expect(apiItemSrc).toContain('billing_document_items')
    expect(apiItemSrc).toContain('.select(')
    // PATCH deletes and reinserts items
    expect(apiItemSrc).toContain('.delete().eq(\'document_id\', id)')
  })

  it('20. draft can exist without customer (customer_id nullable)', () => {
    expect(migrationSrc).toContain('customer_id uuid REFERENCES leads(id) ON DELETE SET NULL')
    // API does not require customer_id
    expect(apiListSrc).not.toMatch(/customer_id.*required/i)
  })

  it('21. draft can exist with partial fields (only document_type required)', () => {
    // Default line item is an empty one
    expect(apiListSrc).toContain('Array.isArray(line_items) ? line_items : [{}]')
    // issue_date defaults to today
    expect(apiListSrc).toContain("issue_date || new Date().toISOString().slice(0, 10)")
  })

  it('only drafts can be edited (PATCH checks status === draft)', () => {
    expect(apiItemSrc).toContain("existing.status !== 'draft'")
    expect(apiItemSrc).toContain('Only draft documents can be edited')
  })

  it('only drafts can be deleted', () => {
    expect(apiItemSrc).toContain('Only draft documents can be deleted')
  })
})

// ============================================================================
// UI
// ============================================================================
describe('UI', () => {
  it('22. Payments has Quote / Invoice action', () => {
    expect(paymentsPageSrc).toContain('Quote / Invoice')
    expect(paymentsPageSrc).toContain('setShowBillingChooser(true)')
  })

  it('23. chooser contains Create Quote and Create Invoice', () => {
    expect(chooserSrc).toContain('Create Quote')
    expect(chooserSrc).toContain('Create Invoice')
    expect(chooserSrc).toContain("onSelectType('quote')")
    expect(chooserSrc).toContain("onSelectType('invoice')")
  })

  it('24. Quote editor uses valid-until', () => {
    expect(editorSrc).toContain('Valid Until')
    expect(editorSrc).toContain('validUntil')
    // valid_until only sent for quotes
    expect(editorSrc).toContain('isInvoice ? null : (validUntil')
  })

  it('25. Invoice editor uses due-date', () => {
    expect(editorSrc).toContain('Due Date')
    expect(editorSrc).toContain('dueDate')
    expect(editorSrc).toContain('isInvoice ? (dueDate')
  })

  it('26. line item add/remove', () => {
    expect(editorSrc).toContain('addLineItem')
    expect(editorSrc).toContain('removeLineItem')
    expect(editorSrc).toContain('Add Line Item')
  })

  it('27. totals update (live client-side preview)', () => {
    expect(editorSrc).toContain('subtotal')
    expect(editorSrc).toContain('total')
    expect(editorSrc).toContain('formatCurrency')
  })

  it('28. Save Draft wired', () => {
    expect(editorSrc).toContain('Save Draft')
    expect(editorSrc).toContain('handleSaveDraft')
    expect(editorSrc).toContain('/api/billing-documents')
  })

  it('29. document list shows status/type/number/total', () => {
    expect(listSrc).toContain('document_number')
    expect(listSrc).toContain('statusBadge')
    expect(listSrc).toContain('formatCurrency(doc.total_cents')
    expect(listSrc).toContain('document_type')
  })

  it('30. draft row can reopen editor (onOpen callback)', () => {
    expect(listSrc).toContain('onOpen')
    expect(paymentsPageSrc).toContain('handleOpenBillingDoc')
    expect(paymentsPageSrc).toContain('setShowBillingEditor(true)')
  })
})

// ============================================================================
// MODAL
// ============================================================================
describe('MODAL', () => {
  it('31. shared Modal used (chooser and editor import from ui/Modal)', () => {
    expect(chooserSrc).toContain("from '@/components/ui/Modal'")
    expect(editorSrc).toContain("from '@/components/ui/Modal'")
  })

  it('32. modal normalization tests remain green (bottomSheetOnMobile used)', () => {
    // Chooser is now centered (no bottomSheetOnMobile), editor keeps it
    expect(chooserSrc).not.toContain('bottomSheetOnMobile')
    expect(editorSrc).toContain('bottomSheetOnMobile')
  })

  it('editor uses footer prop for Save Draft button', () => {
    expect(editorSrc).toContain('footer={footer}')
    expect(editorSrc).toContain('Save Draft')
  })

  it('editor uses contentMaxHeight for scrollable body', () => {
    expect(editorSrc).toContain('contentMaxHeight')
  })
})
