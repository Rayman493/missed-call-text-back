/**
 * Quote / Invoice Batch 3 — Polish & Visual Consistency Regression Tests
 *
 * Covers: dollar inputs, preview business profile, hosted expired/overdue,
 * PDF footer/padding, renderer visual hierarchy, double-click protection.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const editorSrc = readSrc('src/components/billing/BillingEditorModal.tsx')
const rendererSrc = readSrc('src/components/billing/DocumentRenderer.tsx')
const pdfComponentSrc = readSrc('src/components/billing/BillingDocumentPdf.tsx')
const hostedSrc = readSrc('src/components/billing/HostedDocumentPage.tsx')
const presentationSrc = readSrc('src/lib/billing/document-presentation.ts')

// ============================================================================
// DOLLAR INPUTS (not cents)
// ============================================================================
describe('DOLLAR INPUTS', () => {
  it('rate input label shows dollars not cents', () => {
    expect(editorSrc).toContain('Rate ($)')
    expect(editorSrc).not.toContain('Rate (cents)')
  })

  it('rate input placeholder is dollar format', () => {
    expect(editorSrc).toContain('placeholder="35.00"')
  })

  it('rate input has step="0.01" for decimal dollars', () => {
    // Check that the rate input has step="0.01"
    const rateMatch = editorSrc.match(/Rate \(\$\)[\s\S]*?step="([^"]+)"/)
    expect(rateMatch).toBeTruthy()
    expect(rateMatch![1]).toBe('0.01')
  })

  it('discount input label shows dollars not cents', () => {
    expect(editorSrc).toContain('Discount ($)')
    expect(editorSrc).not.toContain('Discount (cents)')
  })

  it('tax input label shows dollars not cents', () => {
    expect(editorSrc).toContain('Tax ($)')
    expect(editorSrc).not.toContain('Tax (cents)')
  })

  it('discount and tax inputs have step="0.01"', () => {
    expect(editorSrc).toContain('step="0.01"')
  })

  it('centsToDollars helper converts cents to dollar string', () => {
    expect(editorSrc).toContain('function centsToDollars')
    expect(editorSrc).toContain('/ 100')
    expect(editorSrc).toContain('.toFixed(2)')
  })

  it('dollarsToCents helper converts dollar string to cents', () => {
    expect(editorSrc).toContain('function dollarsToCents')
    expect(editorSrc).toContain('parseFloat(dollars)')
    expect(editorSrc).toContain('* 100')
  })

  it('save payload converts dollars to cents via dollarsToCents', () => {
    expect(editorSrc).toContain('unit_price_cents: dollarsToCents(item.unit_price_cents)')
  })

  it('hydration converts cents to dollars on load', () => {
    expect(editorSrc).toContain('centsToDollars(item.unit_price_cents)')
    expect(editorSrc).toContain('centsToDollars(existingDocument.discount_cents)')
    expect(editorSrc).toContain('centsToDollars(existingDocument.tax_cents)')
  })

  it('live total calculation uses dollarsToCents', () => {
    expect(editorSrc).toContain('dollarsToCents(item.unit_price_cents)')
  })
})

// ============================================================================
// PREVIEW BUSINESS PROFILE
// ============================================================================
describe('PREVIEW BUSINESS PROFILE', () => {
  it('editor uses useBusiness hook for real business data', () => {
    expect(editorSrc).toContain("from '@/contexts/BusinessContext'")
    expect(editorSrc).toContain('useBusiness()')
  })

  it('preview uses business name from context (with fallback)', () => {
    expect(editorSrc).toContain('business?.name')
    // Fallback is OK — the point is it uses the real business name when available
  })

  it('preview uses business phone from context', () => {
    expect(editorSrc).toContain('business?.business_phone_number')
    expect(editorSrc).toContain('business?.twilio_phone_number')
  })

  it('preview uses business logo from context', () => {
    expect(editorSrc).toContain('logo_url')
  })

  it('preview uses business address from context', () => {
    expect(editorSrc).toContain('business_address')
    expect(editorSrc).toContain('business_city')
  })
})

// ============================================================================
// HOSTED EXPIRED / OVERDUE
// ============================================================================
describe('HOSTED EXPIRED / OVERDUE', () => {
  it('hosted page handles expired status in banner', () => {
    expect(hostedSrc).toContain('isExpired')
    expect(hostedSrc).toContain('This quote has expired.')
  })

  it('hosted page handles overdue status in banner', () => {
    expect(hostedSrc).toContain('isOverdue')
    expect(hostedSrc).toContain('This invoice is overdue.')
  })

  it('expired quote cannot be accepted (canRespond only for sent)', () => {
    expect(hostedSrc).toContain("canRespond = isQuote && (status === 'sent')")
    // expired status is not 'sent', so canRespond is false
  })

  it('overdue invoice shows Pay Overdue Invoice button', () => {
    expect(hostedSrc).toContain('Pay Overdue Invoice')
  })

  it('overdue invoice uses red button color', () => {
    expect(hostedSrc).toContain('bg-red-600 hover:bg-red-700')
  })

  it('expired banner uses amber color', () => {
    expect(hostedSrc).toContain('bg-amber-100 text-amber-800')
  })

  it('overdue banner uses red color', () => {
    expect(hostedSrc).toContain('bg-red-100 text-red-800')
  })
})

// ============================================================================
// PDF FOOTER / PADDING
// ============================================================================
describe('PDF FOOTER / PADDING', () => {
  it('page has paddingBottom to prevent footer overlap', () => {
    expect(pdfComponentSrc).toContain('paddingBottom: 60')
  })

  it('page uses paddingTop and paddingHorizontal (not uniform padding)', () => {
    expect(pdfComponentSrc).toContain('paddingTop: 40')
    expect(pdfComponentSrc).toContain('paddingHorizontal: 40')
  })

  it('footer position is absolute at bottom 20', () => {
    expect(pdfComponentSrc).toContain("bottom: 20")
  })

  it('grand total has 2px top border (stronger separator)', () => {
    expect(pdfComponentSrc).toContain('borderTopWidth: 2')
    expect(pdfComponentSrc).toContain('borderTopColor: \'#cbd5e1\'')
  })

  it('grand total value is 14px (larger than subtotal)', () => {
    expect(pdfComponentSrc).toContain('fontSize: 14')
  })
})

// ============================================================================
// RENDERER VISUAL POLISH
// ============================================================================
describe('RENDERER VISUAL POLISH', () => {
  it('logo has max-width constraint to prevent dominating', () => {
    expect(rendererSrc).toContain('max-w-[200px]')
  })

  it('logo height responsive (h-14 on mobile, h-16 on desktop)', () => {
    expect(rendererSrc).toContain('h-14 sm:h-16')
  })

  it('document type heading uses tracking-tight for professional look', () => {
    expect(rendererSrc).toContain('tracking-tight')
  })

  it('document type heading is 3xl on desktop', () => {
    expect(rendererSrc).toContain('text-2xl sm:text-3xl')
  })

  it('line item cells use align-top for long descriptions', () => {
    expect(rendererSrc).toContain('align-top')
  })

  it('line item amount uses slate-900 (stronger than body)', () => {
    expect(rendererSrc).toContain('text-slate-900')
  })

  it('total separator is 2px border (stronger hierarchy)', () => {
    expect(rendererSrc).toContain('border-t-2 border-slate-300')
  })

  it('total uses text-lg (larger than subtotal)', () => {
    expect(rendererSrc).toContain('text-lg font-bold')
  })

  it('notes and terms use leading-relaxed for readability', () => {
    expect(rendererSrc).toContain('leading-relaxed')
  })

  it('dates use flex layout for clean alignment on mobile', () => {
    expect(rendererSrc).toContain('flex sm:justify-end gap-2')
  })
})

// ============================================================================
// DOUBLE-CLICK PROTECTION
// ============================================================================
describe('DOUBLE-CLICK PROTECTION', () => {
  it('editor save prevents double-click via isSaving guard', () => {
    // Send is no longer in the editor; save uses isSaving guard
    expect(editorSrc).toContain('disabled={isSaving}')
  })

  it('hosted page respond prevents double-click via actionLoading guard', () => {
    expect(hostedSrc).toContain('if (actionLoading) return')
  })
})

// ============================================================================
// EFFECTIVE STATUS (re-verify still works)
// ============================================================================
describe('EFFECTIVE STATUS (re-verify)', () => {
  it('effectiveStatus computes overdue for sent invoices past due_date', () => {
    const { effectiveStatus } = require(join(repoRoot, 'src/lib/billing/document-presentation.ts'))
    const overdue = effectiveStatus({
      document_type: 'invoice',
      status: 'sent',
      due_date: '2020-01-01',
      valid_until: null,
    })
    expect(overdue).toBe('overdue')
  })

  it('effectiveStatus computes expired for sent quotes past valid_until', () => {
    const { effectiveStatus } = require(join(repoRoot, 'src/lib/billing/document-presentation.ts'))
    const expired = effectiveStatus({
      document_type: 'quote',
      status: 'sent',
      due_date: null,
      valid_until: '2020-01-01',
    })
    expect(expired).toBe('expired')
  })

  it('effectiveStatus preserves paid status (not overridden by overdue)', () => {
    const { effectiveStatus } = require(join(repoRoot, 'src/lib/billing/document-presentation.ts'))
    const paid = effectiveStatus({
      document_type: 'invoice',
      status: 'paid',
      due_date: '2020-01-01',
      valid_until: null,
    })
    expect(paid).toBe('paid')
  })

  it('effectiveStatus preserves accepted status (not overridden by expired)', () => {
    const { effectiveStatus } = require(join(repoRoot, 'src/lib/billing/document-presentation.ts'))
    const accepted = effectiveStatus({
      document_type: 'quote',
      status: 'accepted',
      due_date: null,
      valid_until: '2020-01-01',
    })
    expect(accepted).toBe('accepted')
  })

  it('effectiveStatus preserves cancelled status', () => {
    const { effectiveStatus } = require(join(repoRoot, 'src/lib/billing/document-presentation.ts'))
    const cancelled = effectiveStatus({
      document_type: 'invoice',
      status: 'cancelled',
      due_date: '2020-01-01',
      valid_until: null,
    })
    expect(cancelled).toBe('cancelled')
  })

  it('effectiveStatus preserves declined status', () => {
    const { effectiveStatus } = require(join(repoRoot, 'src/lib/billing/document-presentation.ts'))
    const declined = effectiveStatus({
      document_type: 'quote',
      status: 'declined',
      due_date: null,
      valid_until: '2020-01-01',
    })
    expect(declined).toBe('declined')
  })
})

// ============================================================================
// VISUAL CONSISTENCY BETWEEN SURFACES
// ============================================================================
describe('VISUAL CONSISTENCY', () => {
  it('all three surfaces use the same Quote/Invoice color scheme', () => {
    // Renderer: blue-700 for quote, emerald-700 for invoice
    expect(rendererSrc).toContain('text-blue-700')
    expect(rendererSrc).toContain('text-emerald-700')
    // PDF: #1d4ed8 (blue-700), #059669 (emerald-700)
    expect(pdfComponentSrc).toContain("QUOTE_COLOR = '#1d4ed8'")
    expect(pdfComponentSrc).toContain("INVOICE_COLOR = '#059669'")
  })

  it('all three surfaces show Quote To / Bill To labels', () => {
    expect(rendererSrc).toContain('Quote To')
    expect(rendererSrc).toContain('Bill To')
    expect(pdfComponentSrc).toContain('Quote To')
    expect(pdfComponentSrc).toContain('Bill To')
  })

  it('all three surfaces hide zero discount/tax rows', () => {
    expect(rendererSrc).toContain('doc.discount_cents > 0')
    expect(rendererSrc).toContain('doc.tax_cents > 0')
    expect(pdfComponentSrc).toContain('doc.discount_cents > 0')
    expect(pdfComponentSrc).toContain('doc.tax_cents > 0')
  })

  it('all three surfaces show Powered by ReplyFlow footer', () => {
    expect(rendererSrc).toContain('Powered by ReplyFlow')
    expect(pdfComponentSrc).toContain('Powered by ReplyFlow')
  })

  it('all three surfaces use the same line item columns', () => {
    const cols = ['Description', 'Qty', 'Unit', 'Rate', 'Amount']
    cols.forEach(col => {
      expect(rendererSrc).toContain(col)
      expect(pdfComponentSrc).toContain(col)
    })
  })
})
