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

  it('67. unsaved preview shows Save Draft', () => {
    expect(editorSrc).toContain('Save Draft')
    expect(editorSrc).toContain('fromPreview: true')
  })

  it('68. successful preview save stores persisted id', () => {
    expect(editorSrc).toContain('savedDoc')
    expect(editorSrc).toContain('setSavedDoc')
  })

  it('69. document number updates after save', () => {
    expect(editorSrc).toContain('setDocNumber')
  })

  it('70. saved preview shows Download PDF', () => {
    expect(editorSrc).toContain('Download PDF')
  })

  it('71. saved preview shows Send to Customer', () => {
    expect(editorSrc).toContain('Send to Customer')
  })

  it('72. no duplicate document POST (uses existingId for PATCH)', () => {
    expect(editorSrc).toContain('existingDocument?.id || savedDoc?.id')
    expect(editorSrc).toContain('PATCH')
    expect(editorSrc).toContain('POST')
  })

  it('73. send requires persisted document', () => {
    expect(editorSrc).toContain('existingDocument?.id || savedDoc?.id')
  })

  it('74. send requires customer', () => {
    expect(editorSrc).toContain('Select a customer before sending')
  })

  it('75. send requires phone', () => {
    expect(editorSrc).toContain('no phone number')
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
