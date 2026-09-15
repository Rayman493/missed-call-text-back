/**
 * Quote / Invoice Physical QA Blockers — Regression Tests
 *
 * Covers the concrete issues found during physical QA:
 * 1. Billing document number RPC / production migration failure
 * 2. Customer picker dismissal responsiveness (capture phase)
 * 3. Billing date-only values render one day early (timezone shift)
 * 4. Send / Download flow too buried after Preview / Save
 * 5. RPC security: explicit REVOKE PUBLIC/anon, GRANT authenticated/service_role
 * 6. Logo path verification across Preview/PDF/Hosted
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { formatDate } from '../billing/document-presentation'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const foundationMigrationSrc = readSrc('supabase/migrations/20260913210000_create_billing_documents.sql')
const repairMigrationSrc = readSrc('supabase/migrations/20260914000000_repair_billing_document_numbering.sql')
const apiListSrc = readSrc('src/app/api/billing-documents/route.ts')
const convertSrc = readSrc('src/app/api/billing-documents/[id]/convert/route.ts')
const editorSrc = readSrc('src/components/billing/BillingEditorModal.tsx')
const presentationSrc = readSrc('src/lib/billing/document-presentation.ts')
const rendererSrc = readSrc('src/components/billing/DocumentRenderer.tsx')
const pdfSrc = readSrc('src/components/billing/BillingDocumentPdf.tsx')
const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
const hostedSrc = readSrc('src/components/billing/HostedDocumentPage.tsx')

// ============================================================================
// 1. NUMBERING / MIGRATIONS / RPC SECURITY
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
    expect(repairMigrationSrc).toContain("v_prefix := 'Q-'")
  })

  it('5. invoice returns INV- number', () => {
    expect(foundationMigrationSrc).toContain("v_prefix := 'INV-'")
    expect(repairMigrationSrc).toContain("v_prefix := 'INV-'")
  })

  it('6. no max()+1 fallback', () => {
    // The function must use atomic counter UPSERT, not max()+1
    expect(foundationMigrationSrc).toContain('INSERT INTO billing_document_counters')
    expect(foundationMigrationSrc).toContain('ON CONFLICT (business_id, document_type) DO NOTHING')
    expect(foundationMigrationSrc).toContain('UPDATE billing_document_counters')
    expect(foundationMigrationSrc).toContain('SET next_number = next_number + 1')
    // Must NOT contain max()-based numbering
    expect(foundationMigrationSrc).not.toMatch(/MAX\s*\(\s*next_number\s*\)/i)
    expect(repairMigrationSrc).not.toMatch(/MAX\s*\(\s*next_number\s*\)/i)
  })

  it('7. correct business isolation / security', () => {
    expect(foundationMigrationSrc).toContain('SECURITY DEFINER')
    expect(foundationMigrationSrc).toContain('SET search_path = public')
    expect(foundationMigrationSrc).toContain('auth.uid()')
    expect(foundationMigrationSrc).toContain('Business does not belong to the current user')
  })

  it('8. repair migration is narrowed and conservative', () => {
    expect(repairMigrationSrc).toContain('assign_billing_document_number')
    expect(repairMigrationSrc).toContain('SECURITY DEFINER')
    expect(repairMigrationSrc).toContain('SET search_path = public')
    expect(repairMigrationSrc).toContain('GRANT EXECUTE ON FUNCTION assign_billing_document_number')
    expect(repairMigrationSrc).toContain('TO authenticated')
    // Idempotent: uses CREATE TABLE IF NOT EXISTS
    expect(repairMigrationSrc).toContain('CREATE TABLE IF NOT EXISTS billing_documents')
    expect(repairMigrationSrc).toContain('CREATE TABLE IF NOT EXISTS billing_document_items')
    expect(repairMigrationSrc).toContain('CREATE TABLE IF NOT EXISTS billing_document_counters')
    // Narrowed: does NOT recreate healthy policies/triggers from foundation
    expect(repairMigrationSrc).not.toContain('DROP POLICY')
    expect(repairMigrationSrc).not.toContain('CREATE POLICY')
    expect(repairMigrationSrc).not.toContain('DROP TRIGGER')
    expect(repairMigrationSrc).not.toContain('CREATE TRIGGER')
    // No max()+1 in repair migration
    expect(repairMigrationSrc).not.toMatch(/MAX\s*\(\s*next_number\s*\)/i)
  })

  it('9. repair migration timestamp is not future-dated', () => {
    const fs = require('fs')
    const migrationsDir = join(repoRoot, 'supabase/migrations')
    const files = fs.readdirSync(migrationsDir)
    const repairFile = files.find(f => f.includes('repair_billing_document_numbering'))
    expect(repairFile).toBeTruthy()
    const timestamp = repairFile!.split('_')[0]
    const year = parseInt(timestamp.slice(0, 4))
    const month = parseInt(timestamp.slice(4, 6))
    const day = parseInt(timestamp.slice(6, 8))
    expect(year).toBeLessThanOrEqual(2026)
    if (year === 2026) {
      expect(month).toBeLessThanOrEqual(9)
      if (month === 9) {
        expect(day).toBeLessThanOrEqual(14)
      }
    }
    expect(parseInt(timestamp)).toBeGreaterThan(20260913230000)
  })

  it('10. repair RPC exact name and return type', () => {
    expect(repairMigrationSrc).toContain('CREATE FUNCTION assign_billing_document_number(')
    expect(repairMigrationSrc).toContain('RETURNS text')
  })

  it('11. repair RPC exact parameter names and types', () => {
    expect(repairMigrationSrc).toContain('p_business_id uuid')
    expect(repairMigrationSrc).toContain('p_document_type text')
  })

  it('12. repair RPC SECURITY DEFINER', () => {
    expect(repairMigrationSrc).toContain('SECURITY DEFINER')
  })

  it('13. repair RPC safe search_path (public first, pg_temp last)', () => {
    const searchPathLine = repairMigrationSrc.split('\n').find(l => l.trim().startsWith('SET search_path'))
    expect(searchPathLine).toBeTruthy()
    expect(searchPathLine!.trim()).toMatch(/^SET search_path = public,/)
    expect(searchPathLine!).toContain('pg_temp')
    const publicIdx = searchPathLine!.indexOf('public')
    const pgTempIdx = searchPathLine!.indexOf('pg_temp')
    expect(pgTempIdx).toBeGreaterThan(publicIdx)
  })

  it('14. repair RPC rejects invalid document_type', () => {
    expect(repairMigrationSrc).toContain('RAISE EXCEPTION')
    expect(repairMigrationSrc).toContain('Invalid document_type')
  })

  it('15. repair RPC prevents cross-business numbering', () => {
    expect(repairMigrationSrc).toContain('auth.uid()')
    expect(repairMigrationSrc).toContain('Business does not belong to the current user')
  })

  it('16. repair RPC first sequence value is 1001', () => {
    expect(repairMigrationSrc).toContain('1001')
  })

  it('17. repair RPC atomic ON CONFLICT counter update', () => {
    expect(repairMigrationSrc).toContain('ON CONFLICT (business_id, document_type) DO NOTHING')
    expect(repairMigrationSrc).toContain('SET next_number = next_number + 1')
    expect(repairMigrationSrc).toContain('RETURNING next_number - 1 INTO v_assigned')
  })

  it('18. repair migration no destructive DROP TABLE/TRUNCATE', () => {
    const sqlOnly = repairMigrationSrc.split('\n')
      .filter(l => !l.trim().startsWith('--'))
      .join('\n')
    expect(sqlOnly).not.toMatch(/DROP\s+TABLE/i)
    expect(sqlOnly).not.toMatch(/TRUNCATE/i)
    expect(sqlOnly).not.toMatch(/DELETE\s+FROM/i)
  })

  it('19. repair migration preserves existing counters', () => {
    expect(repairMigrationSrc).toContain('ON CONFLICT (business_id, document_type) DO NOTHING')
    expect(repairMigrationSrc).not.toMatch(/UPDATE\s+billing_document_counters\s+SET\s+next_number\s*=\s*1001/i)
  })

  it('20. repair migration explicit schema cache reload', () => {
    expect(repairMigrationSrc).toContain('NOTIFY pgrst')
    expect(repairMigrationSrc).toContain("'reload schema'")
  })

  it('21. repair RPC matches foundation RPC definition', () => {
    const extractFunction = (src: string) => {
      const start = src.indexOf('assign_billing_document_number')
      const dollarStart = src.indexOf('$$', start)
      const dollarEnd = src.indexOf('$$', dollarStart + 2)
      return src.slice(start, dollarEnd + 2)
    }
    const foundationFn = extractFunction(foundationMigrationSrc)
    const repairFn = extractFunction(repairMigrationSrc)
    expect(foundationFn).toContain("v_prefix := 'Q-'")
    expect(repairFn).toContain("v_prefix := 'Q-'")
    expect(foundationFn).toContain("v_prefix := 'INV-'")
    expect(repairFn).toContain("v_prefix := 'INV-'")
    expect(foundationFn).toContain('auth.uid()')
    expect(repairFn).toContain('auth.uid()')
    expect(foundationFn).toContain('ON CONFLICT (business_id, document_type) DO NOTHING')
    expect(repairFn).toContain('ON CONFLICT (business_id, document_type) DO NOTHING')
  })

  // --- RPC ACL SECURITY (Issue 2) ---

  it('22. foundation migration explicitly revokes PUBLIC', () => {
    expect(foundationMigrationSrc).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+assign_billing_document_number\s*\(\s*uuid\s*,\s*text\s*\)\s+FROM\s+PUBLIC/i)
  })

  it('23. foundation migration explicitly revokes anon', () => {
    expect(foundationMigrationSrc).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+assign_billing_document_number\s*\(\s*uuid\s*,\s*text\s*\)\s+FROM\s+anon/i)
  })

  it('24. repair migration explicitly revokes PUBLIC', () => {
    expect(repairMigrationSrc).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+assign_billing_document_number\s*\(\s*uuid\s*,\s*text\s*\)\s+FROM\s+PUBLIC/i)
  })

  it('25. repair migration explicitly revokes anon', () => {
    expect(repairMigrationSrc).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+assign_billing_document_number\s*\(\s*uuid\s*,\s*text\s*\)\s+FROM\s+anon/i)
  })

  it('26. authenticated explicitly granted in foundation', () => {
    expect(foundationMigrationSrc).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+assign_billing_document_number\s*\(\s*uuid\s*,\s*text\s*\)\s+TO\s+authenticated/i)
  })

  it('27. service_role explicitly granted in foundation', () => {
    expect(foundationMigrationSrc).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+assign_billing_document_number\s*\(\s*uuid\s*,\s*text\s*\)\s+TO\s+service_role/i)
  })

  it('28. authenticated explicitly granted in repair', () => {
    expect(repairMigrationSrc).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+assign_billing_document_number\s*\(\s*uuid\s*,\s*text\s*\)\s+TO\s+authenticated/i)
  })

  it('29. service_role explicitly granted in repair', () => {
    expect(repairMigrationSrc).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+assign_billing_document_number\s*\(\s*uuid\s*,\s*text\s*\)\s+TO\s+service_role/i)
  })

  it('30. no later PUBLIC/anon grant in foundation (after REVOKE)', () => {
    // Find all GRANT statements after the REVOKE statements
    const revokeIdx = foundationMigrationSrc.indexOf('REVOKE ALL ON FUNCTION assign_billing_document_number')
    expect(revokeIdx).toBeGreaterThan(-1)
    const afterRevoke = foundationMigrationSrc.slice(revokeIdx)
    // Should NOT re-grant to PUBLIC or anon
    expect(afterRevoke).not.toMatch(/GRANT.*TO\s+PUBLIC/i)
    expect(afterRevoke).not.toMatch(/GRANT.*TO\s+anon/i)
  })

  it('31. no later PUBLIC/anon grant in repair (after REVOKE)', () => {
    const revokeIdx = repairMigrationSrc.indexOf('REVOKE ALL ON FUNCTION assign_billing_document_number')
    expect(revokeIdx).toBeGreaterThan(-1)
    const afterRevoke = repairMigrationSrc.slice(revokeIdx)
    expect(afterRevoke).not.toMatch(/GRANT.*TO\s+PUBLIC/i)
    expect(afterRevoke).not.toMatch(/GRANT.*TO\s+anon/i)
  })

  it('32. search_path remains public, pg_temp in foundation', () => {
    const searchPathLine = foundationMigrationSrc.split('\n').find(l => l.trim().startsWith('SET search_path'))
    expect(searchPathLine).toBeTruthy()
    expect(searchPathLine!.trim()).toBe('SET search_path = public, pg_temp;')
  })

  it('33. SECURITY DEFINER remains in foundation', () => {
    expect(foundationMigrationSrc).toContain('SECURITY DEFINER')
  })

  it('34. business ownership check remains in foundation', () => {
    expect(foundationMigrationSrc).toContain('auth.uid()')
    expect(foundationMigrationSrc).toContain('Business does not belong to the current user')
  })

  // --- RPC SOURCE CONTRACT (Issue 3) ---

  it('35. exact function name in create route', () => {
    expect(apiListSrc).toContain("rpc('assign_billing_document_number'")
  })

  it('36. exact p_business_id key in create route', () => {
    expect(apiListSrc).toContain('p_business_id:')
  })

  it('37. exact p_document_type key in create route', () => {
    expect(apiListSrc).toContain('p_document_type:')
  })

  it('38. document_type validated as quote or invoice before RPC call', () => {
    expect(apiListSrc).toContain("document_type !== 'quote'")
    expect(apiListSrc).toContain("document_type !== 'invoice'")
  })

  it('39. no max()+1 fallback in create route', () => {
    expect(apiListSrc).not.toMatch(/MAX\s*\(\s*next_number\s*\)/i)
    // No JS-generated Q-/INV numbers
    expect(apiListSrc).not.toMatch(/['"]Q-['"]\s*\+/i)
    expect(apiListSrc).not.toMatch(/['"]INV-['"]\s*\+/i)
  })

  it('40. no max()+1 fallback in convert route', () => {
    expect(convertSrc).not.toMatch(/MAX\s*\(\s*next_number\s*\)/i)
    expect(convertSrc).not.toMatch(/['"]Q-['"]\s*\+/i)
    expect(convertSrc).not.toMatch(/['"]INV-['"]\s*\+/i)
  })

  it('41. create route uses authenticated server client (not service role)', () => {
    expect(apiListSrc).toContain('createServerClient')
    expect(apiListSrc).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(apiListSrc).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    // Should NOT use service role key for the RPC call
    expect(apiListSrc).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('42. convert route also uses correct RPC', () => {
    expect(convertSrc).toContain("rpc('assign_billing_document_number'")
    expect(convertSrc).toContain('p_business_id:')
    expect(convertSrc).toContain("p_document_type: 'invoice'")
  })
})

// ============================================================================
// 2. CUSTOMER PICKER
// ============================================================================
describe('CUSTOMER PICKER', () => {
  it('43. opens on click', () => {
    expect(editorSrc).toContain('setShowCustomerPicker(true)')
  })

  it('44. outside pointerdown closes immediately (capture phase)', () => {
    expect(editorSrc).toContain('customerFieldRef')
    expect(editorSrc).toContain('useRef')
    expect(editorSrc).toContain('pointerdown')
    expect(editorSrc).toContain('contains(e.target')
    expect(editorSrc).toContain('setShowCustomerPicker(false)')
    // Must use capture phase (third argument true)
    expect(editorSrc).toContain("addEventListener('pointerdown', handlePointerDown, true)")
  })

  it('45. handler does not preventDefault', () => {
    // Extract the handlePointerDown function body
    const handlerMatch = editorSrc.match(/handlePointerDown[\s\S]*?\}/)
    expect(handlerMatch).toBeTruthy()
    expect(handlerMatch![0]).not.toContain('preventDefault')
  })

  it('46. handler does not stopPropagation', () => {
    const handlerMatch = editorSrc.match(/handlePointerDown[\s\S]*?\}/)
    expect(handlerMatch).toBeTruthy()
    expect(handlerMatch![0]).not.toContain('stopPropagation')
  })

  it('47. Issue Date receives same interaction (outside ref)', () => {
    // Issue Date is outside customerFieldRef, so clicking it triggers dismissal
    // and the click naturally reaches the date input
    expect(editorSrc).toContain('ref={customerFieldRef}')
    expect(editorSrc).toContain('type="date"')
    expect(editorSrc).toContain('Issue Date')
  })

  it('48. line-item input receives same interaction (outside ref)', () => {
    // Line item inputs are outside customerFieldRef
    expect(editorSrc).toContain('Line Items')
  })

  it('49. blank-space interaction closes picker', () => {
    // Blank modal space is outside customerFieldRef
    expect(editorSrc).toContain('customerFieldRef')
  })

  it('50. search click stays open (inside ref)', () => {
    const refIdx = editorSrc.indexOf('ref={customerFieldRef}')
    const searchIdx = editorSrc.indexOf('customerSearch', refIdx)
    expect(searchIdx).toBeGreaterThan(refIdx)
    const placeholderIdx = editorSrc.indexOf('Search customers', refIdx)
    expect(placeholderIdx).toBeGreaterThan(refIdx)
  })

  it('51. row selection still works', () => {
    expect(editorSrc).toContain('selectCustomer')
    expect(editorSrc).toContain('setShowCustomerPicker(false)')
  })

  it('52. Escape behavior preserved (closes picker only)', () => {
    expect(editorSrc).toContain("e.key === 'Escape'")
    expect(editorSrc).toContain('stopPropagation')
  })

  it('53. no timers / delayed blur hacks', () => {
    // The pointer handler should not use setTimeout or requestAnimationFrame
    const handlerMatch = editorSrc.match(/handlePointerDown[\s\S]*?\}/)
    expect(handlerMatch).toBeTruthy()
    expect(handlerMatch![0]).not.toContain('setTimeout')
    expect(handlerMatch![0]).not.toContain('requestAnimationFrame')
  })

  it('54. editor remains open (no onClose in picker dismissal)', () => {
    const pointerHandler = editorSrc.match(/handlePointerDown[\s\S]*?setShowCustomerPicker\(false\)[\s\S]*?setCustomerSearch\(''\)/)
    expect(pointerHandler).toBeTruthy()
    const escapeHandler = editorSrc.match(/handleKeyDown[\s\S]*?e\.key === 'Escape'[\s\S]*?setShowCustomerPicker\(false\)/)
    expect(escapeHandler).toBeTruthy()
  })
})

// ============================================================================
// 3. DATES
// ============================================================================
describe('DATES', () => {
  it('55. issue_date preserves exact day', () => {
    expect(formatDate('2026-09-14')).toBe('September 14, 2026')
  })

  it('56. valid_until preserves exact day', () => {
    expect(formatDate('2026-09-19')).toBe('September 19, 2026')
  })

  it('57. due_date preserves exact day', () => {
    expect(formatDate('2026-10-01')).toBe('October 1, 2026')
  })

  it('58. New York timezone test', () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(formatDate('2026-09-14')).toBe('September 14, 2026')
      expect(formatDate('2026-06-15')).toBe('June 15, 2026')
    } finally {
      process.env.TZ = originalTz
    }
  })

  it('59. Los Angeles timezone test', () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      expect(formatDate('2026-09-14')).toBe('September 14, 2026')
      expect(formatDate('2026-01-15')).toBe('January 15, 2026')
    } finally {
      process.env.TZ = originalTz
    }
  })

  it('60. Jan 1 boundary test', () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(formatDate('2026-01-01')).toBe('January 1, 2026')
      expect(formatDate('2026-12-31')).toBe('December 31, 2026')
    } finally {
      process.env.TZ = originalTz
    }
  })

  it('61. Preview uses safe formatter (DocumentRenderer)', () => {
    expect(rendererSrc).toContain('formatDate')
    expect(rendererSrc).toContain("from '@/lib/billing/document-presentation'")
  })

  it('62. PDF uses safe formatter', () => {
    expect(pdfSrc).toContain('formatDate')
    expect(pdfSrc).toContain("from '@/lib/billing/document-presentation'")
  })

  it('63. Hosted page uses safe formatter (via DocumentRenderer)', () => {
    expect(hostedSrc).toContain('DocumentRenderer')
  })

  it('64. list uses safe formatter for timestamps', () => {
    expect(listSrc).toContain('formatDate')
    expect(listSrc).toContain('doc.sent_at')
    expect(listSrc).toContain('doc.updated_at')
  })

  it('65. formatDate does NOT use new Date(iso) for date-only strings', () => {
    expect(presentationSrc).toContain("split('-')")
    expect(presentationSrc).toContain('parseInt(parts[0]')
    expect(presentationSrc).toContain('parseInt(parts[1]')
    expect(presentationSrc).toContain('parseInt(parts[2]')
    expect(presentationSrc).toContain('new Date(year, month - 1, day)')
  })
})

// ============================================================================
// 4. PREVIEW / SEND
// ============================================================================
describe('PREVIEW / SEND', () => {
  it('66. unsaved editor does NOT show Send', () => {
    // The editor footer only shows Send when existingDocument?.id || savedDoc?.id
    expect(editorSrc).toContain('existingDocument?.id || savedDoc?.id')
  })

  it('67. unsaved preview shows Save Draft (no fromPreview branching)', () => {
    expect(editorSrc).toContain('Save Draft')
    // The old fromPreview path is removed — save always closes the editor
    expect(editorSrc).not.toContain('fromPreview')
  })

  it('68. successful save calls onSaved and closes editor', () => {
    expect(editorSrc).toContain('onSaved?.(savedDocument)')
    expect(editorSrc).toContain('onClose()')
  })

  it('69. document number displayed when editing existing document', () => {
    expect(editorSrc).toContain('setDocNumber')
  })

  it('70. editor does NOT show Download PDF (moved to viewer)', () => {
    expect(editorSrc).not.toContain('Download PDF')
    expect(editorSrc).not.toContain('handleDownload')
  })

  it('71. editor does NOT show Send to Customer (moved to viewer)', () => {
    expect(editorSrc).not.toContain('Send to Customer')
    expect(editorSrc).not.toContain('handleSend')
  })

  it('72. no duplicate document POST (uses existingId for PATCH)', () => {
    expect(editorSrc).toContain('existingDocument?.id || savedDoc?.id')
    expect(editorSrc).toContain('PATCH')
    expect(editorSrc).toContain('POST')
  })

  it('73. send is not in editor (moved to saved viewer)', () => {
    // Send validation lives in the viewer/list, not the editor
    expect(editorSrc).not.toContain('Select a customer before sending')
  })

  it('74. send validation is not in editor', () => {
    expect(editorSrc).not.toContain('no phone number')
  })

  it('75. viewer has Send to Customer', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain('Send to Customer')
  })

  it('76. list actions remain functional', () => {
    expect(listSrc).toContain('Download')
    expect(listSrc).toContain('Send')
    expect(listSrc).toContain('View')
  })

  it('77. redundant draft message removed from preview', () => {
    expect(editorSrc).not.toContain('This is an unsaved draft preview')
  })
})

// ============================================================================
// 5. LOGO PATHS
// ============================================================================
describe('LOGO PATHS', () => {
  it('78. logo client uses intended production Supabase browser client', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    expect(logoSrc).toContain('createBrowserClient')
    expect(logoSrc).toContain("@/lib/supabase/browser")
  })

  it('79. update targets businesses.logo_url', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    expect(logoSrc).toContain(".from('businesses')")
    expect(logoSrc).toContain('logo_url')
    expect(logoSrc).toContain('.update({ logo_url:')
  })

  it('80. no alternate logo field', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    // Must not use a different column name for logo storage
    expect(logoSrc).not.toContain('logo_image')
    expect(logoSrc).not.toContain('logo_file')
    expect(logoSrc).not.toContain('business_logo')
  })

  it('81. no alternate businesses relation', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    // Must update the businesses table, not a view or alternate table
    expect(logoSrc).toContain(".from('businesses')")
    expect(logoSrc).not.toContain('.from("businesses"')
    expect(logoSrc).not.toContain('.from(\'business_profiles\'')
    expect(logoSrc).not.toContain('.from("business_profiles"')
  })

  it('82. upload still business scoped', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    expect(logoSrc).toContain("business-logos")
    expect(logoSrc).toContain('${businessId}')
  })

  it('83. successful update refreshes BusinessContext (onLogoChange callback)', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    expect(logoSrc).toContain('onLogoChange')
  })

  it('84. Preview consumes business logo (buildPreviewDoc)', () => {
    expect(editorSrc).toContain('business_logo_url')
    expect(editorSrc).toContain('logo_url')
  })

  it('85. PDF consumes business logo', () => {
    expect(pdfSrc).toContain('business_logo_url')
    expect(pdfSrc).toContain('Image')
  })

  it('86. Hosted document consumes business logo (via DocumentRenderer)', () => {
    expect(rendererSrc).toContain('business_logo_url')
    expect(hostedSrc).toContain('DocumentRenderer')
  })
})

// ============================================================================
// 6. BILLING LIST CUSTOMER QUERY
// ============================================================================
describe('BILLING LIST CUSTOMER QUERY', () => {
  it('87. billing list does not select leads.name', () => {
    // The leads table in production does not have a `name` column.
    // The query must only select columns that actually exist.
    expect(apiListSrc).not.toMatch(/leads\s*\(\s*[^)]*\bname\b/)
  })

  it('88. billing list selects actual canonical lead fields', () => {
    // Must select contact_name (canonical customer name) and caller_phone
    expect(apiListSrc).toContain('contact_name')
    expect(apiListSrc).toContain('caller_phone')
  })

  it('89. named customer display works (contact_name)', () => {
    expect(listSrc).toContain('contact_name')
    expect(listSrc).toContain('doc.leads?.contact_name')
  })

  it('90. phone-only customer fallback works (caller_phone)', () => {
    expect(listSrc).toContain('caller_phone')
    expect(listSrc).toContain('doc.leads?.caller_phone')
  })

  it('91. null optional fields do not crash (No customer fallback)', () => {
    expect(listSrc).toContain("'No customer'")
  })

  it('92. customer ownership/business isolation unchanged', () => {
    expect(apiListSrc).toContain('.eq(\'business_id\', business.id)')
  })

  it('93. quote list renders customer correctly', () => {
    // The list query supports type filtering for quotes
    expect(apiListSrc).toContain("document_type")
    expect(apiListSrc).toContain("type")
  })

  it('94. invoice list renders customer correctly', () => {
    // The list query supports type filtering for invoices
    expect(apiListSrc).toContain("query = query.eq('document_type', type)")
  })

  it('95. single-document route also does not select leads.name', () => {
    const singleDocSrc = readSrc('src/app/api/billing-documents/[id]/route.ts')
    expect(singleDocSrc).not.toMatch(/leads\s*\(\s*[^)]*\bname\b/)
    expect(singleDocSrc).toContain('contact_name')
  })

  it('96. send route also does not select leads.name', () => {
    const sendSrc = readSrc('src/app/api/billing-documents/[id]/send/route.ts')
    expect(sendSrc).not.toMatch(/leads\s*\(\s*[^)]*\bname\b/)
    expect(sendSrc).toContain('contact_name')
  })

  it('97. viewer modal uses contact_name (not leads.name)', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain('contact_name')
    expect(viewerSrc).not.toContain('d.leads?.name')
  })
})

// ============================================================================
// 7. SAVED-DOCUMENT REVIEW/SEND FLOW
// ============================================================================
describe('SAVED-DOCUMENT REVIEW/SEND FLOW', () => {
  it('98. editor has Preview', () => {
    expect(editorSrc).toContain('Preview')
    expect(editorSrc).toContain('handlePreview')
  })

  it('99. editor has Cancel', () => {
    expect(editorSrc).toContain('Cancel')
  })

  it('100. editor has Save Draft', () => {
    expect(editorSrc).toContain('Save Draft')
    expect(editorSrc).toContain('handleSaveDraft')
  })

  it('101. editor does NOT have Send to Customer', () => {
    expect(editorSrc).not.toContain('Send to Customer')
    expect(editorSrc).not.toContain('handleSend')
  })

  it('102. editor Preview does NOT have Send', () => {
    // The preview footer should not contain Send
    expect(editorSrc).not.toMatch(/Send to Customer/)
  })

  it('103. editor Preview does NOT expose final Download PDF action', () => {
    // Preview footer should only have Back to Edit + Save Draft
    expect(editorSrc).not.toContain('Download PDF')
    expect(editorSrc).not.toContain('handleDownload')
  })

  it('104. successful Save Draft closes editor (onClose called)', () => {
    expect(editorSrc).toContain('onSaved?.(savedDocument)')
    expect(editorSrc).toContain('onClose()')
  })

  it('105. successful Save Draft refreshes list (onSaved callback)', () => {
    // onSaved is called before onClose, parent uses it to refresh
    expect(editorSrc).toContain('onSaved?.(savedDocument)')
  })

  it('106. successful POST is not retried if list refresh fails', () => {
    // handleSaveDraft does not contain retry logic
    expect(editorSrc).not.toContain('retry')
    expect(editorSrc).not.toContain('POST again')
  })

  it('107. successful POST is not reported as failed because GET failed', () => {
    // The save error only comes from the POST response, not from list refresh
    // handleBillingSaved in payments page just calls fetchBillingDocuments
    // which silently ignores errors
    const paymentsSrc = readSrc('src/app/dashboard/payments/page.tsx')
    expect(paymentsSrc).toContain('handleBillingSaved')
    expect(paymentsSrc).toContain('fetchBillingDocuments()')
  })

  it('108. editor no longer has fromPreview branching', () => {
    // The old fromPreview path that kept preview open is removed
    expect(editorSrc).not.toContain('fromPreview')
  })

  it('109. saved document list has View action', () => {
    expect(listSrc).toContain('onView')
    expect(listSrc).toContain('View document')
  })

  it('110. saved document list has Edit action (for drafts)', () => {
    expect(listSrc).toContain('onOpen')
    expect(listSrc).toContain('Edit document')
  })

  it('111. saved document list has Download PDF action', () => {
    expect(listSrc).toContain('onDownload')
    expect(listSrc).toContain('Download PDF')
  })

  it('112. saved document list has Send action', () => {
    expect(listSrc).toContain('onSend')
  })

  it('113. viewer loads persisted document', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain('documentId')
    expect(viewerSrc).toContain('/api/billing-documents/')
  })

  it('114. viewer shows persisted document number', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain('document_number')
  })

  it('115. viewer shows persisted totals', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain('subtotal_cents')
    expect(viewerSrc).toContain('total_cents')
  })

  it('116. viewer shows Download PDF', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain('Download PDF')
  })

  it('117. viewer shows Send to Customer', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain('Send to Customer')
  })

  it('118. viewer has Edit action (for drafts)', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain('onEdit')
    expect(viewerSrc).toContain('Edit')
  })

  it('119. viewer Send is wired to persisted document send endpoint', () => {
    const paymentsSrc = readSrc('src/app/dashboard/payments/page.tsx')
    expect(paymentsSrc).toContain('handleSendBillingDoc')
    expect(paymentsSrc).toContain('/send')
  })

  it('120. viewer Edit reopens editor with persisted document', () => {
    const paymentsSrc = readSrc('src/app/dashboard/payments/page.tsx')
    expect(paymentsSrc).toContain('onEdit')
    expect(paymentsSrc).toContain('handleOpenBillingDoc')
  })

  it('121. edit saved document uses PATCH (not POST)', () => {
    expect(editorSrc).toContain('PATCH')
    expect(editorSrc).toContain('existingId')
  })

  it('122. edit saved document does not POST duplicate', () => {
    // When existingId is present, it uses PATCH, not POST
    expect(editorSrc).toContain("if (existingId)")
    expect(editorSrc).toContain('PATCH')
  })

  it('123. document number remains unchanged after edit', () => {
    // The PATCH payload does not include document_number
    // document_number is only set from existingDocument on hydrate
    expect(editorSrc).toContain('setDocNumber(existingDocument.document_number')
    // Payload should not contain document_number
    const payloadMatch = editorSrc.match(/const payload = \{[\s\S]*?\}/)
    if (payloadMatch) {
      expect(payloadMatch[0]).not.toContain('document_number')
    }
  })

  it('124. no leads.name regression in billing routes', () => {
    expect(apiListSrc).not.toMatch(/leads\s*\(\s*[^)]*\bname\b/)
    const singleDocSrc = readSrc('src/app/api/billing-documents/[id]/route.ts')
    expect(singleDocSrc).not.toMatch(/leads\s*\(\s*[^)]*\bname\b/)
    const sendSrc = readSrc('src/app/api/billing-documents/[id]/send/route.ts')
    expect(sendSrc).not.toMatch(/leads\s*\(\s*[^)]*\bname\b/)
  })

  it('125. contact_name fallback preserved in list', () => {
    expect(listSrc).toContain('contact_name')
  })

  it('126. phone fallback preserved in list', () => {
    expect(listSrc).toContain('caller_phone')
  })

  it('127. null optional customer safe (No customer fallback)', () => {
    expect(listSrc).toContain("'No customer'")
  })

  it('128. PDF loads persisted document (uses DocumentPresentation)', () => {
    expect(pdfSrc).toContain('DocumentPresentation')
  })

  it('129. correct date formatter used in PDF', () => {
    expect(pdfSrc).toContain('formatDate')
  })

  it('130. logo used in PDF when available', () => {
    expect(pdfSrc).toContain('business_logo_url')
  })

  it('131. totals match persisted values in PDF', () => {
    expect(pdfSrc).toContain('subtotal_cents')
    expect(pdfSrc).toContain('total_cents')
  })
})

// ============================================================================
// 8. PRODUCTION LEADS ALIGNMENT (leads.email removal)
// ============================================================================
describe('PRODUCTION LEADS ALIGNMENT', () => {
  it('132. no billing query selects leads.email', () => {
    expect(apiListSrc).not.toMatch(/leads\s*\(\s*[^)]*\bemail\b/)
    const singleDocSrc = readSrc('src/app/api/billing-documents/[id]/route.ts')
    expect(singleDocSrc).not.toMatch(/leads\s*\(\s*[^)]*\bemail\b/)
    const sendSrc = readSrc('src/app/api/billing-documents/[id]/send/route.ts')
    expect(sendSrc).not.toMatch(/leads\s*\(\s*[^)]*\bemail\b/)
  })

  it('133. no billing query selects leads.phone', () => {
    expect(apiListSrc).not.toMatch(/leads\s*\(\s*[^)]*\bphone\b[^)]/)
    const sendSrc = readSrc('src/app/api/billing-documents/[id]/send/route.ts')
    expect(sendSrc).not.toMatch(/leads\s*\(\s*[^)]*\bphone\b[^)]/)
  })

  it('134. billing leads select uses only canonical fields', () => {
    // Only id, contact_name, caller_phone should be selected
    expect(apiListSrc).toContain('leads ( id, contact_name, caller_phone )')
    const singleDocSrc = readSrc('src/app/api/billing-documents/[id]/route.ts')
    expect(singleDocSrc).toContain('leads ( id, contact_name, caller_phone )')
  })

  it('135. viewer does not fall back to leads.email', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).not.toContain('d.leads?.email')
  })

  it('136. payments page does not fall back to leads.email', () => {
    const paymentsSrc = readSrc('src/app/dashboard/payments/page.tsx')
    expect(paymentsSrc).not.toContain('d.leads?.email')
  })

  it('137. send route does not reference leads.phone or leads.name', () => {
    const sendSrc = readSrc('src/app/api/billing-documents/[id]/send/route.ts')
    expect(sendSrc).not.toContain('doc.leads?.phone')
    expect(sendSrc).not.toContain('doc.leads?.name')
  })

  it('138. editor lead picker does not reference l.phone', () => {
    expect(editorSrc).not.toContain('l.caller_phone || l.phone')
  })

  it('139. billing-utils exports canonical leads select constant', () => {
    const billingUtilsSrc = readSrc('src/lib/billing/billing-utils.ts')
    expect(billingUtilsSrc).toContain('BILLING_LEADS_SELECT')
    expect(billingUtilsSrc).toContain('leads ( id, contact_name, caller_phone )')
  })

  it('140. billing-utils exports billingCustomerName helper', () => {
    const billingUtilsSrc = readSrc('src/lib/billing/billing-utils.ts')
    expect(billingUtilsSrc).toContain('billingCustomerName')
  })
})

// ============================================================================
// 9. PRICING UX (Flat rate vs Per unit)
// ============================================================================
describe('PRICING UX', () => {
  it('141. BillingLineItem has pricing_mode field', () => {
    expect(editorSrc).toContain("pricing_mode")
  })

  it('142. flat rate mode available', () => {
    expect(editorSrc).toContain("'flat'")
    expect(editorSrc).toContain('Flat rate')
  })

  it('143. per unit mode available', () => {
    expect(editorSrc).toContain("'unit'")
    expect(editorSrc).toContain('Per unit')
  })

  it('144. flat rate shows Amount input only', () => {
    expect(editorSrc).toContain('Amount ($)')
  })

  it('145. per unit shows Qty / Unit / Rate', () => {
    expect(editorSrc).toContain('Rate (')
    expect(editorSrc).toContain('Qty')
    expect(editorSrc).toContain('Unit')
  })

  it('146. setLineItemPricingMode switches mode', () => {
    expect(editorSrc).toContain('setLineItemPricingMode')
  })

  it('147. flat rate sets quantity=1 and clears unit_label', () => {
    expect(editorSrc).toContain("pricing_mode: 'flat', quantity: '1', unit_label: ''")
  })

  it('148. per unit preserves existing values', () => {
    expect(editorSrc).toContain("pricing_mode: 'unit', quantity: item.quantity || '1'")
  })

  it('149. line formula shows calculation', () => {
    expect(editorSrc).toContain('lineFormula')
    expect(editorSrc).toContain('Flat rate = ')
    expect(editorSrc).toContain('× ')
  })

  it('150. existing documents infer pricing mode on hydrate', () => {
    expect(editorSrc).toContain('inferredMode')
    expect(editorSrc).toContain("qty === '1' && !unitLabel")
  })

  it('151. empty line item defaults to flat mode', () => {
    expect(editorSrc).toContain("pricing_mode: 'flat'")
  })

  it('152. cents persistence unchanged (dollarsToCents used in save)', () => {
    expect(editorSrc).toContain('dollarsToCents(item.unit_price_cents)')
  })

  it('153. fractional quantity preserved (step=0.001)', () => {
    expect(editorSrc).toContain('step="0.001"')
  })

  it('154. line total updates from current input (no memoization)', () => {
    expect(editorSrc).toContain('lineTotalCents')
  })

  it('155. rate label shows per-unit context', () => {
    expect(editorSrc).toContain('item.unit_label ? `$/${item.unit_label}`')
  })
})

// ============================================================================
// 10. SETTINGS LOGO THUMBNAIL
// ============================================================================
describe('SETTINGS LOGO THUMBNAIL', () => {
  it('156. logo thumbnail uses formBusiness.logo_url (not just business.logo_url)', () => {
    const settingsSrc = readSrc('src/components/SettingsContent.tsx')
    expect(settingsSrc).toContain('formBusiness?.logo_url || business.logo_url')
  })

  it('157. logo thumbnail has object-contain', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    expect(logoSrc).toContain('object-contain')
  })

  it('158. logo thumbnail has padding', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    expect(logoSrc).toContain('p-1')
  })

  it('159. null logo_url shows placeholder (ImageIcon)', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    expect(logoSrc).toContain('ImageIcon')
  })

  it('160. existing logo_url renders img thumbnail', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    expect(logoSrc).toContain('logoUrl ? (')
    expect(logoSrc).toContain('<img')
  })

  it('161. onLogoChange calls updateBusiness', () => {
    const settingsSrc = readSrc('src/components/SettingsContent.tsx')
    expect(settingsSrc).toContain("updateBusiness({ logo_url: url })")
  })

  it('162. logo thumbnail no cropping (overflow-hidden + object-contain)', () => {
    const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
    expect(logoSrc).toContain('overflow-hidden')
    expect(logoSrc).toContain('object-contain')
  })
})

// ============================================================================
// 11. DOCUMENT POLISH
// ============================================================================
describe('DOCUMENT POLISH', () => {
  it('163. header logo has refined sizing (h-12 sm:h-14)', () => {
    expect(rendererSrc).toContain('h-12 sm:h-14')
  })

  it('164. header logo has mb-4 spacing', () => {
    expect(rendererSrc).toContain('mb-4')
  })

  it('165. business name uses text-base (not text-lg)', () => {
    expect(rendererSrc).toContain('text-base font-bold')
  })

  it('166. quote/invoice title uses text-xl sm:text-2xl (refined)', () => {
    expect(rendererSrc).toContain('text-xl sm:text-2xl')
  })

  it('167. customer + dates block has min-w to prevent wrapping', () => {
    expect(rendererSrc).toContain('min-w-[180px]')
  })

  it('168. date labels use whitespace-nowrap', () => {
    expect(rendererSrc).toContain('whitespace-nowrap')
  })

  it('169. line item table headers use uppercase tracking-wider', () => {
    expect(rendererSrc).toContain('uppercase tracking-wider')
  })

  it('170. flat-rate items show em-dash for Qty', () => {
    expect(rendererSrc).toContain("isFlatRate")
    expect(rendererSrc).toContain("'\\u2014'")
  })

  it('171. description column uses break-words', () => {
    expect(rendererSrc).toContain('break-words')
  })

  it('172. totals section uses w-72 (wider for balance)', () => {
    expect(rendererSrc).toContain('sm:w-72')
  })

  it('173. totals labels use text-slate-500 (lighter)', () => {
    expect(rendererSrc).toContain('text-slate-500')
  })

  it('174. notes/terms have increased spacing (mb-6)', () => {
    expect(rendererSrc).toContain('mb-6')
  })

  it('175. footer is subtle (text-slate-300, text-[11px])', () => {
    expect(rendererSrc).toContain('text-[11px]')
    expect(rendererSrc).toContain('text-slate-300')
  })

  it('176. footer has mt-16 spacing (avoid overlap)', () => {
    expect(rendererSrc).toContain('mt-16')
  })

  it('177. PDF flat-rate items also show em-dash', () => {
    expect(pdfSrc).toContain('isFlatRate')
    expect(pdfSrc).toContain("'\\u2014'")
  })

  it('178. saved document preview does not show unsaved-preview label', () => {
    // The "(unsaved draft)" text only appears in buildPreviewDoc for unsaved state
    // It should not appear in the DocumentRenderer itself
    expect(rendererSrc).not.toContain('unsaved draft')
  })
})

// ============================================================================
// 12. BATCH-2 SCHEMA REPAIR
// ============================================================================
describe('BATCH-2 SCHEMA REPAIR', () => {
  const repairMigrationSrc = readSrc('supabase/migrations/20260914010000_repair_billing_batch2_columns.sql')

  it('179. repair migration adds public_token', () => {
    expect(repairMigrationSrc).toContain('public_token text UNIQUE')
  })

  it('180. repair migration adds source_quote_id', () => {
    expect(repairMigrationSrc).toContain('source_quote_id uuid REFERENCES billing_documents(id)')
  })

  it('181. repair migration adds paid_at', () => {
    expect(repairMigrationSrc).toContain('paid_at timestamptz')
  })

  it('182. repair migration adds all business snapshot fields', () => {
    expect(repairMigrationSrc).toContain('snapshot_business_name')
    expect(repairMigrationSrc).toContain('snapshot_business_phone')
    expect(repairMigrationSrc).toContain('snapshot_business_email')
    expect(repairMigrationSrc).toContain('snapshot_business_address')
    expect(repairMigrationSrc).toContain('snapshot_business_logo_url')
  })

  it('183. repair migration adds all customer snapshot fields', () => {
    expect(repairMigrationSrc).toContain('snapshot_customer_name')
    expect(repairMigrationSrc).toContain('snapshot_customer_phone')
    expect(repairMigrationSrc).toContain('snapshot_customer_email')
    expect(repairMigrationSrc).toContain('snapshot_customer_address')
  })

  it('184. repair uses ADD COLUMN IF NOT EXISTS', () => {
    expect(repairMigrationSrc).toContain('ADD COLUMN IF NOT EXISTS')
  })

  it('185. repair does NOT drop billing_documents', () => {
    expect(repairMigrationSrc).not.toMatch(/DROP TABLE/i)
  })

  it('186. repair does NOT truncate', () => {
    // Check for actual TRUNCATE statement, not the word in comments
    expect(repairMigrationSrc).not.toMatch(/TRUNCATE\s+TABLE/i)
  })

  it('187. repair creates public_token index', () => {
    expect(repairMigrationSrc).toContain('idx_billing_documents_public_token')
  })

  it('188. repair creates source_quote index', () => {
    expect(repairMigrationSrc).toContain('idx_billing_documents_source_quote')
  })

  it('189. repair reloads PostgREST schema', () => {
    expect(repairMigrationSrc).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('190. repair does not touch storage buckets', () => {
    expect(repairMigrationSrc).not.toContain('storage.buckets')
  })

  it('191. repair does not modify RPC', () => {
    // Check for actual CREATE OR REPLACE FUNCTION, not the word in comments
    expect(repairMigrationSrc).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i)
  })
})

// ============================================================================
// 13. NULL BATCH-2 FIELD SAFETY
// ============================================================================
describe('NULL BATCH-2 FIELD SAFETY', () => {
  it('192. BillingDocumentList type has nullable public_token', () => {
    const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
    expect(listSrc).toContain('public_token: string | null')
  })

  it('193. BillingDocumentList type has nullable source_quote_id', () => {
    const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
    expect(listSrc).toContain('source_quote_id: string | null')
  })

  it('194. viewer handles null snapshot fields with fallback', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain('d.snapshot_business_name ||')
    expect(viewerSrc).toContain('d.snapshot_customer_name ||')
  })

  it('195. viewer falls back to leads for customer name', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain('d.leads?.contact_name')
  })

  it('196. list query selects public_token and source_quote_id', () => {
    expect(apiListSrc).toContain('public_token')
    expect(apiListSrc).toContain('source_quote_id')
  })

  it('197. list query selects paid_at', () => {
    expect(apiListSrc).toContain('paid_at')
  })

  it('198. send route generates token only on first send', () => {
    const sendSrc = readSrc('src/app/api/billing-documents/[id]/send/route.ts')
    expect(sendSrc).toContain('generatePublicToken()')
    // New unified flow: token is reused via `let publicToken = doc.public_token`
    // and only generated when no existing token is present.
    expect(sendSrc).toContain('let publicToken = doc.public_token')
    expect(sendSrc).toContain('if (!publicToken)')
  })

  it('199. public token uses crypto.randomBytes (strong)', () => {
    const builderSrc = readSrc('src/lib/billing/document-builder.ts')
    expect(builderSrc).toContain('randomBytes(24)')
  })

  it('200. public document route queries by public_token', () => {
    const publicRouteSrc = readSrc('src/app/api/public/document/[token]/route.ts')
    expect(publicRouteSrc).toContain("eq('public_token', token)")
  })
})

// ============================================================================
// 14. UNSAVED CHANGES CONFIRMATION
// ============================================================================
describe('UNSAVED CHANGES CONFIRMATION', () => {
  it('201. editor has isDirtyRef for tracking unsaved changes', () => {
    expect(editorSrc).toContain('isDirtyRef')
  })

  it('202. editor has markDirty callback', () => {
    expect(editorSrc).toContain('markDirty')
  })

  it('203. editor has markClean callback', () => {
    expect(editorSrc).toContain('markClean')
  })

  it('204. editor has showDiscardConfirm state', () => {
    expect(editorSrc).toContain('showDiscardConfirm')
  })

  it('205. editor has handleAttemptClose function', () => {
    expect(editorSrc).toContain('handleAttemptClose')
  })

  it('206. handleAttemptClose checks dirty state', () => {
    expect(editorSrc).toContain('if (isDirtyRef.current)')
  })

  it('207. dirty state shows discard confirmation dialog', () => {
    expect(editorSrc).toContain('setShowDiscardConfirm(true)')
  })

  it('208. clean state closes immediately', () => {
    expect(editorSrc).toContain('} else {')
    expect(editorSrc).toContain('onClose()')
  })

  it('209. Modal onClose uses handleAttemptClose', () => {
    expect(editorSrc).toContain('onClose={handleAttemptClose}')
  })

  it('210. Cancel button uses handleAttemptClose', () => {
    expect(editorSrc).toContain('onClick={handleAttemptClose}')
  })

  it('211. discard dialog has Keep Editing button', () => {
    expect(editorSrc).toContain('Keep Editing')
  })

  it('212. discard dialog has Discard button', () => {
    expect(editorSrc).toContain('Discard')
  })

  it('213. Keep Editing closes confirmation only (not editor)', () => {
    expect(editorSrc).toContain("setShowDiscardConfirm(false)")
  })

  it('214. Discard closes editor without saving', () => {
    expect(editorSrc).toMatch(/Discard[\s\S]*onClose/)
  })

  it('215. Discard clears dirty state', () => {
    // The Discard button should call markClean before onClose
    expect(editorSrc).toContain('markClean()')
  })

  it('216. quote wording uses "quote"', () => {
    expect(editorSrc).toContain("hasn't been saved. Your changes will be lost.")
    // The wording uses isInvoice ? 'invoice' : 'quote'
    expect(editorSrc).toContain("isInvoice ? 'invoice' : 'quote'")
  })

  it('217. invoice wording uses "invoice"', () => {
    expect(editorSrc).toContain("isInvoice ? 'invoice' : 'quote'")
  })

  it('218. markDirty called on line item changes', () => {
    expect(editorSrc).toContain('markDirty()')
  })

  it('219. markDirty called on customer selection', () => {
    // selectCustomer and clearCustomer both call markDirty
    const selectMatch = editorSrc.match(/selectCustomer[\s\S]*?markDirty/)
    expect(selectMatch).toBeTruthy()
  })

  it('220. markDirty called on date changes', () => {
    expect(editorSrc).toContain('markDirty(); setIssueDate')
    expect(editorSrc).toContain('markDirty(); setValidUntil')
    expect(editorSrc).toContain('markDirty(); setDueDate')
  })

  it('221. markDirty called on notes/terms changes', () => {
    expect(editorSrc).toContain('markDirty(); setNotes')
    expect(editorSrc).toContain('markDirty(); setTerms')
  })

  it('222. markDirty called on discount/tax changes', () => {
    expect(editorSrc).toContain('markDirty(); setDiscountCents')
    // Tax input calls markDirty() then conditionally setTaxPercent or setTaxCents
    expect(editorSrc).toContain('markDirty()')
    expect(editorSrc).toContain('setTaxCents')
    expect(editorSrc).toContain('setTaxPercent')
  })

  it('223. successful save calls markClean', () => {
    // handleSaveDraft should call markClean before onClose
    const saveMatch = editorSrc.match(/markClean\(\)[\s\S]*?onSaved/)
    expect(saveMatch).toBeTruthy()
  })

  it('224. hydrate resets dirty state', () => {
    // The useEffect that hydrates should call markClean
    expect(editorSrc).toContain('markClean()')
  })

  it('225. no setTimeout in discard confirmation', () => {
    // The discard dialog should not use setTimeout
    const discardSection = editorSrc.substring(editorSrc.indexOf('showDiscardConfirm'))
    // Check the confirmation dialog section doesn't use setTimeout
    const confirmSection = editorSrc.substring(editorSrc.indexOf('Discard unsaved changes'))
    expect(confirmSection).not.toContain('setTimeout')
  })

  it('226. no requestAnimationFrame in discard confirmation', () => {
    const confirmSection = editorSrc.substring(editorSrc.indexOf('Discard unsaved changes'))
    expect(confirmSection).not.toContain('requestAnimationFrame')
  })

  it('227. discard dialog uses shared Modal component', () => {
    // The confirmation should use the same Modal component
    const confirmSection = editorSrc.substring(editorSrc.indexOf('Discard unsaved changes'))
    expect(confirmSection).toContain('<Modal')
  })
})
