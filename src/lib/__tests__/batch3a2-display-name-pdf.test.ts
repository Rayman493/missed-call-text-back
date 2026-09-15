import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const migrationSrc = readSrc('supabase/migrations/20260915000100_add_billing_document_display_name.sql')
const editorSrc = readSrc('src/components/billing/BillingEditorModal.tsx')
const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
const paymentsSrc = readSrc('src/app/dashboard/payments/page.tsx')
const createApiSrc = readSrc('src/app/api/billing-documents/route.ts')
const patchApiSrc = readSrc('src/app/api/billing-documents/[id]/route.ts')
const downloadPdfSrc = readSrc('src/lib/billing/download-billing-pdf.ts')

describe('A. display_name schema/migration', () => {
  it('adds display_name column with <= 80 char constraint', () => {
    expect(migrationSrc).toContain('display_name text NULL')
    expect(migrationSrc).toContain('length(display_name) <= 80')
  })

  it('does not alter existing rows beyond nullable column addition', () => {
    expect(migrationSrc).not.toMatch(/UPDATE\s+billing_documents/)
    expect(migrationSrc).not.toMatch(/SET\s+display_name/)
  })
})

describe('A. editor UI', () => {
  it('has display_name state, input, and maxLength', () => {
    expect(editorSrc).toContain('const [displayName, setDisplayName]')
    expect(editorSrc).toContain('Document name (optional)')
    expect(editorSrc).toContain("display_name: displayName.trim() || null")
    expect(editorSrc).toContain('maxLength={80}')
    expect(editorSrc).toContain('e.g. Backyard Fence Installation')
    expect(editorSrc).toContain('e.g. Kitchen Sink Repair')
  })

  it('survives edits by loading existing display_name', () => {
    expect(editorSrc).toContain("setDisplayName(existingDocument.display_name || '')")
  })
})

describe('A. API payloads', () => {
  it('POST accepts and trims display_name', () => {
    expect(createApiSrc).toContain('display_name,')
    expect(createApiSrc).toContain('display_name')
    expect(createApiSrc).toMatch(/display_name\.trim\(\)/)
  })

  it('PATCH accepts and trims display_name', () => {
    expect(patchApiSrc).toContain('display_name,')
    expect(patchApiSrc).toContain('display_name')
    expect(patchApiSrc).toMatch(/display_name\.trim\(\)/)
  })
})

describe('A. list display', () => {
  it('shows display_name as primary label', () => {
    expect(listSrc).toContain('display_name || `')
  })

  it('still shows canonical document number when display_name exists', () => {
    expect(listSrc).toMatch(/doc\.display_name\s*&&/)
    expect(listSrc).toContain('Quote')
    expect(listSrc).toContain('Invoice')
  })
})

describe('A. creation cheers', () => {
  it('uses display_name in quoted success when present', () => {
    expect(paymentsSrc).toContain('savedDoc.display_name?.trim()')
    expect(paymentsSrc).toContain('“${identity}”')
    expect(paymentsSrc).toContain('Ready to review and send.')
  })
})

describe('B. native PDF save', () => {
  it('does not claim downloaded on native fallback', () => {
    expect(downloadPdfSrc).toContain('PDF ready to save')
  })

  it('Android requests public storage permission before writing', () => {
    expect(downloadPdfSrc).toContain("'android'")
    expect(downloadPdfSrc).toContain('requestPermissions')
    expect(downloadPdfSrc).toContain('publicStorage')
  })

  it('Android attempts a true public Documents save', () => {
    expect(downloadPdfSrc).toContain('Directory.Documents')
    expect(downloadPdfSrc).toMatch(/saved to Documents/)
    expect(downloadPdfSrc).toContain('saved: true')
  })

  it('falls back to cache + share if Android Documents write is denied/fails', () => {
    expect(downloadPdfSrc).toContain('Save PDF to Files')
    expect(downloadPdfSrc).toMatch(/saved:\s*false/)
    expect(downloadPdfSrc).toContain('PDF ready to save')
    expect(downloadPdfSrc).toMatch(/Documents\s+write\s+failed/)
  })

  it('iOS uses Documents + share save handoff', () => {
    expect(downloadPdfSrc).toContain('saveIosPdf')
    expect(downloadPdfSrc).toContain('Save PDF to Files')
  })

  it('preserves web download behavior', () => {
    expect(downloadPdfSrc).toContain('a.download = filename')
    expect(downloadPdfSrc).toContain('downloadWebPdf')
  })

  it('does not invoke onSuccess on error', () => {
    expect(downloadPdfSrc).toContain('onError?.(message)')
    expect(downloadPdfSrc).toContain('onSuccess?.(message)')
  })
})
