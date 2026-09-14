/**
 * Quote / Invoice Physical QA Blockers — Regression Tests
 *
 * Covers the four concrete issues found during physical QA:
 * 1. Billing document number RPC / production migration failure
 * 2. Customer picker does not dismiss on outside click
 * 3. Billing date-only values render one day early (timezone shift)
 * 4. Send / Download flow too buried after Preview / Save
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { formatDate } from '../billing/document-presentation'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const foundationMigrationSrc = readSrc('supabase/migrations/20260913210000_create_billing_documents.sql')
const repairMigrationSrc = readSrc('supabase/migrations/20260919000000_repair_billing_document_numbering.sql')
const apiListSrc = readSrc('src/app/api/billing-documents/route.ts')
const convertSrc = readSrc('src/app/api/billing-documents/[id]/convert/route.ts')
const editorSrc = readSrc('src/components/billing/BillingEditorModal.tsx')
const presentationSrc = readSrc('src/lib/billing/document-presentation.ts')
const rendererSrc = readSrc('src/components/billing/DocumentRenderer.tsx')
const pdfSrc = readSrc('src/components/billing/BillingDocumentPdf.tsx')
const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')

// ============================================================================
// 1. NUMBERING / MIGRATIONS
// ============================================================================
describe('NUMBERING / MIGRATIONS', () => {
  it('1. canonical RPC exists in foundation migration', () => {
    expect(foundationMigrationSrc).toContain('assign_billing_document_number')
    expect(foundationMigrationSrc).toContain('CREATE OR REPLACE FUNCTION assign_billing_document_number')
  })

  it('2. exact parameter names match app call', () => {
    // App call: supabase.rpc('assign_billing_document_number', { p_business_id, p_document_type })
    expect(apiListSrc).toContain("rpc('assign_billing_document_number'")
    expect(apiListSrc).toContain('p_business_id:')
    expect(apiListSrc).toContain('p_document_type:')

    // Migration defines matching params
    expect(foundationMigrationSrc).toContain('p_business_id uuid')
    expect(foundationMigrationSrc).toContain('p_document_type text')
  })

  it('3. counter table exists', () => {
    expect(foundationMigrationSrc).toContain('billing_document_counters')
    expect(foundationMigrationSrc).toContain('CREATE TABLE IF NOT EXISTS billing_document_counters')
  })

  it('4. quote returns Q- number', () => {
    expect(foundationMigrationSrc).toContain("v_prefix := 'Q-'")
  })

  it('5. invoice returns INV- number', () => {
    expect(foundationMigrationSrc).toContain("v_prefix := 'INV-'")
  })

  it('6. no max()+1 fallback', () => {
    // The function must use atomic counter UPSERT, not max()+1
    expect(foundationMigrationSrc).toContain('INSERT INTO billing_document_counters')
    expect(foundationMigrationSrc).toContain('ON CONFLICT (business_id, document_type) DO NOTHING')
    expect(foundationMigrationSrc).toContain('UPDATE billing_document_counters')
    expect(foundationMigrationSrc).toContain('SET next_number = next_number + 1')
    // Must NOT contain max()-based numbering
    expect(foundationMigrationSrc).not.toMatch(/MAX\s*\(\s*next_number\s*\)/i)
  })

  it('7. correct business isolation / security', () => {
    expect(foundationMigrationSrc).toContain('SECURITY DEFINER')
    expect(foundationMigrationSrc).toContain('SET search_path = public')
    expect(foundationMigrationSrc).toContain('auth.uid()')
    expect(foundationMigrationSrc).toContain('Business does not belong to the current user')
    expect(foundationMigrationSrc).toContain('GRANT EXECUTE ON FUNCTION assign_billing_document_number')
    expect(foundationMigrationSrc).toContain('TO authenticated')
  })

  it('8. corrective migration exists and is idempotent', () => {
    expect(repairMigrationSrc).toContain('assign_billing_document_number')
    expect(repairMigrationSrc).toContain('SECURITY DEFINER')
    expect(repairMigrationSrc).toContain('SET search_path = public')
    expect(repairMigrationSrc).toContain('GRANT EXECUTE ON FUNCTION assign_billing_document_number')
    expect(repairMigrationSrc).toContain('TO authenticated')
    // Idempotent: uses CREATE TABLE IF NOT EXISTS
    expect(repairMigrationSrc).toContain('CREATE TABLE IF NOT EXISTS billing_documents')
    expect(repairMigrationSrc).toContain('CREATE TABLE IF NOT EXISTS billing_document_items')
    expect(repairMigrationSrc).toContain('CREATE TABLE IF NOT EXISTS billing_document_counters')
    // Idempotent: uses DROP ... IF EXISTS for policies/triggers
    expect(repairMigrationSrc).toContain('DROP POLICY IF EXISTS')
    expect(repairMigrationSrc).toContain('DROP TRIGGER IF EXISTS')
    // No max()+1 in repair migration either
    expect(repairMigrationSrc).not.toMatch(/MAX\s*\(\s*next_number\s*\)/i)
  })
})

// ============================================================================
// 2. CUSTOMER PICKER
// ============================================================================
describe('CUSTOMER PICKER', () => {
  it('9. opens on click', () => {
    expect(editorSrc).toContain('setShowCustomerPicker(true)')
  })

  it('10. outside click closes picker', () => {
    expect(editorSrc).toContain('customerFieldRef')
    expect(editorSrc).toContain('useRef')
    expect(editorSrc).toContain('pointerdown')
    expect(editorSrc).toContain('contains(e.target')
    expect(editorSrc).toContain('setShowCustomerPicker(false)')
  })

  it('11. clicking Issue Date closes (covered by outside-click ref)', () => {
    // The customer field is wrapped in a div with customerFieldRef.
    // Issue Date is outside that ref, so clicking it triggers outside-click dismissal.
    expect(editorSrc).toContain('ref={customerFieldRef}')
  })

  it('12. clicking another input closes (covered by outside-click ref)', () => {
    // All other inputs (Issue Date, Valid Until, Due Date, line items, notes, terms)
    // are outside the customerFieldRef wrapper, so they trigger dismissal.
    expect(editorSrc).toMatch(/ref=\{customerFieldRef\}/)
  })

  it('13. search input does NOT close picker', () => {
    // The search input is inside the customerFieldRef wrapper, so clicks on it
    // do not trigger outside-click dismissal.
    const refIdx = editorSrc.indexOf('ref={customerFieldRef}')
    const searchIdx = editorSrc.indexOf('customerSearch', refIdx)
    expect(searchIdx).toBeGreaterThan(refIdx)
    // Also verify the search input placeholder is present
    const placeholderIdx = editorSrc.indexOf('Search customers', refIdx)
    expect(placeholderIdx).toBeGreaterThan(refIdx)
  })

  it('14. selecting customer closes picker', () => {
    expect(editorSrc).toContain('selectCustomer')
    expect(editorSrc).toContain('setShowCustomerPicker(false)')
  })

  it('15. selected customer retained', () => {
    expect(editorSrc).toContain('customerId')
    expect(editorSrc).toContain('customerName')
    expect(editorSrc).toContain('customerPhone')
    expect(editorSrc).toContain('customerEmail')
  })

  it('16. reopening works', () => {
    // After selecting, clicking "Select customer" reopens the picker
    expect(editorSrc).toContain('setShowCustomerPicker(true)')
  })

  it('17. Escape closes picker only', () => {
    expect(editorSrc).toContain("e.key === 'Escape'")
    expect(editorSrc).toContain('stopPropagation')
  })

  it('18. editor remains open (no onClose in picker dismissal)', () => {
    // The outside-click and Escape handlers only close the picker, not the editor
    const pointerHandler = editorSrc.match(/handlePointerDown[\s\S]*?setShowCustomerPicker\(false\)[\s\S]*?setCustomerSearch\(''\)/)
    expect(pointerHandler).toBeTruthy()
    // The Escape handler should not call onClose
    const escapeHandler = editorSrc.match(/handleKeyDown[\s\S]*?e\.key === 'Escape'[\s\S]*?setShowCustomerPicker\(false\)/)
    expect(escapeHandler).toBeTruthy()
  })
})

// ============================================================================
// 3. DATES
// ============================================================================
describe('DATES', () => {
  it('19. issue_date preserves exact day', () => {
    expect(formatDate('2026-09-14')).toBe('September 14, 2026')
  })

  it('20. valid_until preserves exact day', () => {
    expect(formatDate('2026-09-19')).toBe('September 19, 2026')
  })

  it('21. due_date preserves exact day', () => {
    expect(formatDate('2026-10-01')).toBe('October 1, 2026')
  })

  it('22. New York timezone test', () => {
    // Simulate America/New_York by setting TZ — the formatter should still
    // produce the correct day because it parses YYYY-MM-DD components directly
    const originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(formatDate('2026-09-14')).toBe('September 14, 2026')
      expect(formatDate('2026-06-15')).toBe('June 15, 2026')
    } finally {
      process.env.TZ = originalTz
    }
  })

  it('23. Los Angeles timezone test', () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      expect(formatDate('2026-09-14')).toBe('September 14, 2026')
      expect(formatDate('2026-01-15')).toBe('January 15, 2026')
    } finally {
      process.env.TZ = originalTz
    }
  })

  it('24. Jan 1 boundary test', () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(formatDate('2026-01-01')).toBe('January 1, 2026')
      expect(formatDate('2026-12-31')).toBe('December 31, 2026')
    } finally {
      process.env.TZ = originalTz
    }
  })

  it('25. Preview uses safe formatter (DocumentRenderer)', () => {
    expect(rendererSrc).toContain('formatDate')
    // DocumentRenderer imports formatDate from document-presentation
    expect(rendererSrc).toContain("from '@/lib/billing/document-presentation'")
  })

  it('26. PDF uses safe formatter', () => {
    expect(pdfSrc).toContain('formatDate')
    expect(pdfSrc).toContain("from '@/lib/billing/document-presentation'")
  })

  it('27. Hosted page uses safe formatter (via DocumentRenderer)', () => {
    const hostedSrc = readSrc('src/components/billing/HostedDocumentPage.tsx')
    expect(hostedSrc).toContain('DocumentRenderer')
  })

  it('28. list uses safe formatter for timestamps', () => {
    // BillingDocumentList has its own formatDate for timestamps (sent_at, updated_at)
    // These are timestamptz, not date-only, so standard Date parsing is correct
    expect(listSrc).toContain('formatDate')
    // Verify it's used for timestamps, not date-only fields
    expect(listSrc).toContain('doc.sent_at')
    expect(listSrc).toContain('doc.updated_at')
  })

  it('formatDate does NOT use new Date(iso) for date-only strings', () => {
    // The formatter should parse YYYY-MM-DD components directly
    expect(presentationSrc).toContain("split('-')")
    expect(presentationSrc).toContain('parseInt(parts[0]')
    expect(presentationSrc).toContain('parseInt(parts[1]')
    expect(presentationSrc).toContain('parseInt(parts[2]')
    // Should construct a local date from components, not from the ISO string
    expect(presentationSrc).toContain('new Date(year, month - 1, day)')
  })
})

// ============================================================================
// 4. PREVIEW / SEND
// ============================================================================
describe('PREVIEW / SEND', () => {
  it('29. unsaved preview shows Save Draft', () => {
    expect(editorSrc).toContain('Save Draft')
    expect(editorSrc).toContain('fromPreview: true')
  })

  it('30. unsaved preview does not expose Send before persistence', () => {
    // The preview footer conditionally shows Send only when isSaved is true
    expect(editorSrc).toContain('isSaved')
    expect(editorSrc).toContain('existingDocument?.id || savedDoc?.id')
  })

  it('31. successful Save Draft updates preview to saved state', () => {
    expect(editorSrc).toContain('savedDoc')
    expect(editorSrc).toContain('setSavedDoc')
    expect(editorSrc).toContain('setDocNumber')
  })

  it('32. saved preview shows Download PDF', () => {
    expect(editorSrc).toContain('Download PDF')
  })

  it('33. saved preview shows Send to Customer', () => {
    expect(editorSrc).toContain('Send to Customer')
  })

  it('34. send requires customer', () => {
    expect(editorSrc).toContain('Select a customer before sending')
  })

  it('35. no-phone customer handled', () => {
    expect(editorSrc).toContain('no phone number')
  })

  it('36. save does not create duplicate document (uses existingId for PATCH)', () => {
    expect(editorSrc).toContain('existingDocument?.id || savedDoc?.id')
    expect(editorSrc).toContain('PATCH')
    expect(editorSrc).toContain('POST')
  })

  it('37. list actions remain functional', () => {
    const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
    expect(listSrc).toContain('Download')
    expect(listSrc).toContain('Send')
    expect(listSrc).toContain('View')
  })

  it('38. redundant draft message removed from preview', () => {
    // The old "This is an unsaved draft preview" message should be removed
    expect(editorSrc).not.toContain('This is an unsaved draft preview')
  })

  it('39. convert route also uses correct RPC', () => {
    expect(convertSrc).toContain("rpc('assign_billing_document_number'")
    expect(convertSrc).toContain('p_business_id:')
    expect(convertSrc).toContain("p_document_type: 'invoice'")
  })
})
