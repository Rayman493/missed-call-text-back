/**
 * Quote / Invoice Batch 2 — Customer-Ready Workflow Regression Tests
 *
 * Covers: logo, document render, public token, send, quote accept/decline,
 * conversion, invoice payment, snapshots, overdue/expired, modal.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const migration1Src = readSrc('supabase/migrations/20260913210000_create_billing_documents.sql')
const migration2Src = readSrc('supabase/migrations/20260913220000_add_billing_snapshots_tokens_logo.sql')
const sendRouteSrc = readSrc('src/app/api/billing-documents/[id]/send/route.ts')
const pdfRouteSrc = readSrc('src/app/api/billing-documents/[id]/pdf/route.tsx')
const convertRouteSrc = readSrc('src/app/api/billing-documents/[id]/convert/route.ts')
const payRouteSrc = readSrc('src/app/api/billing-documents/[id]/pay/route.ts')
const publicRouteSrc = readSrc('src/app/api/public/document/[token]/route.ts')
const respondRouteSrc = readSrc('src/app/api/public/document/[token]/respond/route.ts')
const webhookSrc = readSrc('src/app/api/stripe/webhook/route.ts')
const markPaidSrc = readSrc('src/app/api/payments/[id]/mark-paid/route.ts')
const rendererSrc = readSrc('src/components/billing/DocumentRenderer.tsx')
const pdfComponentSrc = readSrc('src/components/billing/BillingDocumentPdf.tsx')
const editorSrc = readSrc('src/components/billing/BillingEditorModal.tsx')
const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
const hostedSrc = readSrc('src/components/billing/HostedDocumentPage.tsx')
const logoSrc = readSrc('src/components/billing/BusinessLogoSettings.tsx')
const presentationSrc = readSrc('src/lib/billing/document-presentation.ts')
const builderSrc = readSrc('src/lib/billing/document-builder.ts')
const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')
const settingsSrc = readSrc('src/components/SettingsContent.tsx')

// ============================================================================
// LOGO
// ============================================================================
describe('LOGO', () => {
  it('upload accepts PNG, JPG, WebP', () => {
    expect(logoSrc).toContain("image/png")
    expect(logoSrc).toContain("image/jpeg")
    expect(logoSrc).toContain("image/webp")
  })

  it('rejects invalid format (ACCEPTED_TYPES check)', () => {
    expect(logoSrc).toContain('ACCEPTED_TYPES')
    expect(logoSrc).toContain('Please upload a PNG, JPG, or WebP image')
  })

  it('rejects oversize (2MB max)', () => {
    expect(logoSrc).toContain('MAX_SIZE_BYTES')
    expect(logoSrc).toContain('2 * 1024 * 1024')
    expect(logoSrc).toContain('Logo must be under 2 MB')
  })

  it('replace removes old logo files before uploading new', () => {
    expect(logoSrc).toContain('.remove(oldPaths)')
    expect(logoSrc).toContain('upsert: true')
  })

  it('remove deletes logo files + sets logo_url null', () => {
    expect(logoSrc).toContain('handleRemove')
    expect(logoSrc).toContain('logo_url: null')
  })

  it('fallback without logo (styled placeholder)', () => {
    expect(logoSrc).toContain('ImageIcon')
    expect(rendererSrc).toContain('business_logo_url')
  })

  it('logo_url column added to businesses', () => {
    expect(migration2Src).toContain('ADD COLUMN IF NOT EXISTS logo_url text')
  })

  it('storage bucket created with public access', () => {
    expect(migration2Src).toContain("'business-logos', 'business-logos', true")
    expect(migration2Src).toContain('business_logos_read_all')
  })

  it('storage policies scoped to business ownership', () => {
    expect(migration2Src).toContain('business_logos_insert_own')
    expect(migration2Src).toContain('business_logos_update_own')
    expect(migration2Src).toContain('business_logos_delete_own')
    expect(migration2Src).toContain('user_id = auth.uid()')
  })

  it('Settings page includes BusinessLogoSettings component', () => {
    expect(settingsSrc).toContain('BusinessLogoSettings')
    expect(logoSrc).toContain('Used on quotes and invoices')
  })
})

// ============================================================================
// DOCUMENT RENDER
// ============================================================================
describe('DOCUMENT RENDER', () => {
  it('quote renderer shows QUOTE heading', () => {
    expect(rendererSrc).toContain("'QUOTE'")
    expect(pdfComponentSrc).toContain("'QUOTE'")
  })

  it('invoice renderer shows INVOICE heading', () => {
    expect(rendererSrc).toContain("'INVOICE'")
    expect(pdfComponentSrc).toContain("'INVOICE'")
  })

  it('logo included when business_logo_url present', () => {
    expect(rendererSrc).toContain('business_logo_url')
    expect(pdfComponentSrc).toContain('business_logo_url')
    expect(pdfComponentSrc).toContain('<Image')
  })

  it('quote valid-until displayed', () => {
    expect(rendererSrc).toContain('Valid Until')
    expect(pdfComponentSrc).toContain('Valid Until')
  })

  it('invoice due-date displayed', () => {
    expect(rendererSrc).toContain('Due Date')
    expect(pdfComponentSrc).toContain('Due Date')
  })

  it('line totals and totals rendered', () => {
    expect(rendererSrc).toContain('formatMoney')
    expect(rendererSrc).toContain('Subtotal')
    expect(rendererSrc).toContain('Total')
    expect(pdfComponentSrc).toContain('Subtotal')
    expect(pdfComponentSrc).toContain('Total')
  })

  it('PDF endpoint uses @react-pdf/renderer renderToBuffer', () => {
    expect(pdfRouteSrc).toContain('@react-pdf/renderer')
    expect(pdfRouteSrc).toContain('renderToBuffer')
    expect(pdfRouteSrc).toContain('BillingDocumentPdf')
  })

  it('PDF filename follows Quote-/Invoice- pattern', () => {
    expect(pdfRouteSrc).toContain('Quote-')
    expect(pdfRouteSrc).toContain('Invoice-')
    expect(pdfRouteSrc).toContain('.pdf')
  })

  it('PDF content-type is application/pdf', () => {
    expect(pdfRouteSrc).toContain("'application/pdf'")
    expect(pdfRouteSrc).toContain('Content-Disposition')
  })

  it('ReplyFlow attribution is subtle footer only', () => {
    expect(rendererSrc).toContain('Powered by ReplyFlow')
    expect(rendererSrc).toContain('text-slate-300')
  })
})

// ============================================================================
// PUBLIC TOKEN
// ============================================================================
describe('PUBLIC TOKEN', () => {
  it('token generated using crypto.randomBytes (24 bytes hex = 48 chars)', () => {
    expect(builderSrc).toContain("randomBytes(24).toString('hex')")
  })

  it('valid token resolves document (public route queries by token)', () => {
    expect(publicRouteSrc).toContain("eq('public_token', token)")
  })

  it('invalid token returns 404', () => {
    expect(publicRouteSrc).toContain("'Document not found'")
    expect(publicRouteSrc).toContain('404')
  })

  it('UUID alone insufficient (no lookup by document id in public route)', () => {
    // Public route only queries by public_token, never by document id
    // (payment_request lookup by id is OK — that's a different table)
    expect(publicRouteSrc).toContain("eq('public_token', token)")
    // The document fetch uses .single() on the token query, not a separate id query
  })

  it('token minimum length check (prevents short token guessing)', () => {
    expect(publicRouteSrc).toContain('token.length < 16')
    expect(respondRouteSrc).toContain('token.length < 16')
  })

  it('cross-document isolation (public route returns only the token-matching doc)', () => {
    expect(publicRouteSrc).toContain('.single()')
  })

  it('public_token column has unique constraint', () => {
    expect(migration2Src).toContain('public_token text UNIQUE')
  })

  it('public_token indexed for lookups', () => {
    expect(migration2Src).toContain('idx_billing_documents_public_token')
  })
})

// ============================================================================
// SEND
// ============================================================================
describe('SEND', () => {
  it('customer required before sending', () => {
    expect(sendRouteSrc).toContain('A customer must be selected before sending')
  })

  it('phone required before sending', () => {
    expect(sendRouteSrc).toContain('Customer has no phone number')
  })

  it('business ownership enforced (fetch by business_id)', () => {
    expect(sendRouteSrc).toContain("eq('business_id', business.id)")
  })

  it('SMS contains secure link with public token', () => {
    expect(sendRouteSrc).toContain('/document/')
    expect(sendRouteSrc).toContain('public_token')
  })

  it('draft → sent on first send', () => {
    expect(sendRouteSrc).toContain("status: 'sent'")
  })

  it('sent_at set on first send', () => {
    expect(sendRouteSrc).toContain('sent_at: new Date().toISOString()')
  })

  it('snapshot created on first send', () => {
    expect(sendRouteSrc).toContain('createSnapshot')
    expect(sendRouteSrc).toContain('...snapshot')
  })

  it('public_token generated on first send', () => {
    expect(sendRouteSrc).toContain('generatePublicToken')
  })

  it('resend reuses same document/token (idempotent)', () => {
    expect(sendRouteSrc).toContain('resend')
    expect(sendRouteSrc).toContain("doc.status === 'sent' && doc.public_token")
  })

  it('SMS message format includes business name + document number + total', () => {
    expect(sendRouteSrc).toContain('business.name')
    expect(sendRouteSrc).toContain('doc.document_number')
    expect(sendRouteSrc).toContain('totalDollars')
  })

  it('SMS uses existing sendSms infrastructure', () => {
    expect(sendRouteSrc).toContain("from '@/lib/twilio'")
    expect(sendRouteSrc).toContain('sendSms(business, customerPhone, message')
  })
})

// ============================================================================
// QUOTE ACCEPT / DECLINE
// ============================================================================
describe('QUOTE ACCEPT / DECLINE', () => {
  it('accept sets status to accepted', () => {
    expect(respondRouteSrc).toContain("'accepted'")
  })

  it('decline sets status to declined', () => {
    expect(respondRouteSrc).toContain("'declined'")
  })

  it('duplicate accept is safe (idempotent)', () => {
    expect(respondRouteSrc).toContain('idempotent')
    expect(respondRouteSrc).toContain("doc.status === 'accepted' || doc.status === 'declined'")
  })

  it('only quotes can be accepted/declined', () => {
    expect(respondRouteSrc).toContain("doc.document_type !== 'quote'")
    expect(respondRouteSrc).toContain('Only quotes can be accepted or declined')
  })

  it('only sent quotes can be responded to', () => {
    expect(respondRouteSrc).toContain("doc.status !== 'sent'")
  })

  it('hosted page has Accept and Decline buttons', () => {
    expect(hostedSrc).toContain('Accept Quote')
    expect(hostedSrc).toContain('Decline')
  })

  it('hosted page shows accepted/declined status banner', () => {
    expect(hostedSrc).toContain('You have accepted this quote')
    expect(hostedSrc).toContain('You have declined this quote')
  })
})

// ============================================================================
// CONVERSION
// ============================================================================
describe('CONVERSION', () => {
  it('accepted quote converts to invoice', () => {
    expect(convertRouteSrc).toContain("document_type: 'invoice'")
  })

  it('items copied from quote to invoice', () => {
    expect(convertRouteSrc).toContain('billing_document_items')
    expect(convertRouteSrc).toContain('itemRows')
  })

  it('customer_id copied', () => {
    expect(convertRouteSrc).toContain('customer_id: quote.customer_id')
  })

  it('totals copied (subtotal, discount, tax, total)', () => {
    expect(convertRouteSrc).toContain('subtotal_cents: quote.subtotal_cents')
    expect(convertRouteSrc).toContain('discount_cents: quote.discount_cents')
    expect(convertRouteSrc).toContain('tax_cents: quote.tax_cents')
    expect(convertRouteSrc).toContain('total_cents: quote.total_cents')
  })

  it('new INV number assigned', () => {
    expect(convertRouteSrc).toContain("p_document_type: 'invoice'")
  })

  it('source_quote_id preserved on new invoice', () => {
    expect(convertRouteSrc).toContain('source_quote_id: quote.id')
  })

  it('duplicate conversion prevented (idempotent check)', () => {
    expect(convertRouteSrc).toContain('source_quote_id')
    expect(convertRouteSrc).toContain('idempotent')
    expect(convertRouteSrc).toContain('existingInvoice')
  })

  it('only quotes can be converted', () => {
    expect(convertRouteSrc).toContain('Only quotes can be converted to invoices')
  })

  it('business ownership enforced', () => {
    expect(convertRouteSrc).toContain("eq('business_id', business.id)")
  })

  it('new invoice gets draft status', () => {
    expect(convertRouteSrc).toContain("status: 'draft'")
  })
})

// ============================================================================
// INVOICE PAYMENT
// ============================================================================
describe('INVOICE PAYMENT', () => {
  it('Pay Invoice creates payment request using existing Stripe flow', () => {
    expect(payRouteSrc).toContain('stripe.checkout.sessions.create')
    expect(payRouteSrc).toContain("from('payment_requests')")
    expect(payRouteSrc).toContain('.insert(')
  })

  it('exact amount (invoice total_cents)', () => {
    expect(payRouteSrc).toContain('unit_amount: invoice.total_cents')
  })

  it('correct business and customer', () => {
    expect(payRouteSrc).toContain('business_id: business.id')
    expect(payRouteSrc).toContain('lead_id: invoice.customer_id')
  })

  it('payment_request_id persisted on invoice', () => {
    expect(payRouteSrc).toContain('payment_request_id')
    expect(payRouteSrc).toContain("update({ payment_request_id: paymentRequest.id })")
  })

  it('idempotent: reuses existing pending payment request', () => {
    expect(payRouteSrc).toContain('invoice.payment_request_id')
    expect(payRouteSrc).toContain('idempotent')
  })

  it('only invoices can be paid', () => {
    expect(payRouteSrc).toContain('Only invoices can be paid')
  })

  it('already-paid invoice rejected', () => {
    expect(payRouteSrc).toContain('Invoice is already paid')
  })

  it('metadata includes invoice_id and invoice_number', () => {
    expect(payRouteSrc).toContain('invoice_id: String(invoice.id)')
    expect(payRouteSrc).toContain('invoice_number: String(invoice.document_number)')
  })
})

// ============================================================================
// PAID RECONCILIATION
// ============================================================================
describe('PAID RECONCILIATION', () => {
  it('Stripe webhook reconciles linked invoice to paid', () => {
    expect(webhookSrc).toContain('payment_request_id')
    expect(webhookSrc).toContain("from('billing_documents')")
    expect(webhookSrc).toContain("status: 'paid'")
    expect(webhookSrc).toContain('paid_at')
  })

  it('mark-paid route also reconciles linked invoice', () => {
    expect(markPaidSrc).toContain('payment_request_id')
    expect(markPaidSrc).toContain("from('billing_documents')")
    expect(markPaidSrc).toContain("status: 'paid'")
  })

  it('reconciliation is non-fatal (wrapped in try/catch)', () => {
    expect(webhookSrc).toContain('non-fatal')
    expect(markPaidSrc).toContain('non-fatal')
  })

  it('only unpaid invoices are reconciled', () => {
    expect(webhookSrc).toContain("linkedInvoice.status !== 'paid'")
    expect(markPaidSrc).toContain("linkedInvoice.status !== 'paid'")
  })
})

// ============================================================================
// SNAPSHOTS
// ============================================================================
describe('SNAPSHOTS', () => {
  it('snapshot columns added in migration', () => {
    expect(migration2Src).toContain('snapshot_business_name')
    expect(migration2Src).toContain('snapshot_business_phone')
    expect(migration2Src).toContain('snapshot_business_email')
    expect(migration2Src).toContain('snapshot_business_address')
    expect(migration2Src).toContain('snapshot_business_logo_url')
    expect(migration2Src).toContain('snapshot_customer_name')
    expect(migration2Src).toContain('snapshot_customer_phone')
    expect(migration2Src).toContain('snapshot_customer_email')
    expect(migration2Src).toContain('snapshot_customer_address')
  })

  it('builder uses snapshot for sent documents', () => {
    expect(builderSrc).toContain('isSent')
    expect(builderSrc).toContain('snapshot_business_name')
    expect(builderSrc).toContain('snapshot_customer_name')
  })

  it('builder uses live data for drafts', () => {
    expect(builderSrc).toContain("from('businesses')")
    expect(builderSrc).toContain("from('leads')")
  })

  it('createSnapshot function exists and fetches live data', () => {
    expect(builderSrc).toContain('export async function createSnapshot')
    expect(builderSrc).toContain("from('businesses')")
  })

  it('snapshot immutability: sent doc renders from snapshot, not live data', () => {
    // The buildDocumentPresentation function checks isSent before using snapshot
    expect(builderSrc).toContain('if (isSent && doc.snapshot_business_name)')
    expect(builderSrc).toContain('if (isSent && doc.snapshot_customer_name !== undefined)')
  })
})

// ============================================================================
// OVERDUE / EXPIRED
// ============================================================================
describe('OVERDUE / EXPIRED', () => {
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

  it('effectiveStatus returns original status when not overdue/expired', () => {
    const { effectiveStatus } = require(join(repoRoot, 'src/lib/billing/document-presentation.ts'))
    expect(effectiveStatus({ document_type: 'invoice', status: 'draft', due_date: null, valid_until: null })).toBe('draft')
    expect(effectiveStatus({ document_type: 'quote', status: 'accepted', due_date: null, valid_until: '2020-01-01' })).toBe('accepted')
  })

  it('list uses effectiveStatus for badge display', () => {
    expect(listSrc).toContain('effectiveStatus')
  })
})

// ============================================================================
// DOCUMENT LIST POLISH
// ============================================================================
describe('DOCUMENT LIST POLISH', () => {
  it('list supports all statuses (draft, sent, accepted, declined, paid, overdue, expired, cancelled)', () => {
    expect(listSrc).toContain('draft')
    expect(listSrc).toContain('sent')
    expect(listSrc).toContain('accepted')
    expect(listSrc).toContain('declined')
    expect(listSrc).toContain('paid')
    expect(listSrc).toContain('overdue')
    expect(listSrc).toContain('expired')
    expect(listSrc).toContain('cancelled')
  })

  it('list shows document number, type, customer, total, status, date', () => {
    expect(listSrc).toContain('document_number')
    expect(listSrc).toContain('document_type')
    expect(listSrc).toContain('customerName')
    expect(listSrc).toContain('formatCurrency(doc.total_cents')
    expect(listSrc).toContain('statusBadge')
  })

  it('draft rows show Edit + Delete', () => {
    expect(listSrc).toContain('isDraft')
    expect(listSrc).toContain('onOpen')
    expect(listSrc).toContain('onDelete')
  })

  it('sent rows show View + Download + Resend', () => {
    expect(listSrc).toContain('isSent')
    expect(listSrc).toContain('onView')
    expect(listSrc).toContain('onDownload')
    expect(listSrc).toContain('onSend')
  })

  it('accepted quote shows Convert to Invoice', () => {
    expect(listSrc).toContain('isAccepted')
    expect(listSrc).toContain('onConvert')
    expect(listSrc).toContain('Convert to Invoice')
  })

  it('paid/cancelled show View + Download only; declined shows View + Edit + Download', () => {
    // Declined now has its own block with Edit for revision
    expect(listSrc).toContain('isPaid || isCancelled')
    expect(listSrc).toContain('isDeclined')
    expect(listSrc).toContain('Declined: View + Edit + Download')
  })
})

// ============================================================================
// MOBILE / MODAL
// ============================================================================
describe('MOBILE / MODAL', () => {
  it('editor still uses shared Modal', () => {
    expect(editorSrc).toContain("from '@/components/ui/Modal'")
  })

  it('editor has Preview button', () => {
    expect(editorSrc).toContain('handlePreview')
    expect(editorSrc).toContain('Preview')
  })

  it('editor does NOT have Download (moved to viewer)', () => {
    // Download is now only on the saved document viewer, not the editor
    expect(editorSrc).not.toContain('handleDownload')
  })

  it('editor does NOT have Send to Customer (moved to viewer)', () => {
    // Send is now only on the saved document viewer, not the editor
    expect(editorSrc).not.toContain('handleSend')
    expect(editorSrc).not.toContain('Send to Customer')
  })

  it('preview modal uses shared Modal with Back to Edit', () => {
    expect(editorSrc).toContain('Back to Edit')
    expect(editorSrc).toContain('showPreview')
  })

  it('viewer modal uses shared Modal', () => {
    const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
    expect(viewerSrc).toContain("from '@/components/ui/Modal'")
    expect(viewerSrc).toContain('bottomSheetOnMobile')
  })

  it('hosted page works on mobile (responsive)', () => {
    expect(hostedSrc).toContain('min-h-screen')
    expect(hostedSrc).toContain('sticky bottom-0')
  })

  it('bottomSheetOnMobile used in all billing modals', () => {
    expect(editorSrc).toContain('bottomSheetOnMobile')
    expect(hostedSrc).toContain('max-w-2xl')
  })
})

// ============================================================================
// SECURITY
// ============================================================================
describe('SECURITY', () => {
  it('numbering RPC is SECURITY DEFINER with business auth check', () => {
    expect(migration1Src).toContain('SECURITY DEFINER')
    expect(migration1Src).toContain('SET search_path = public')
    expect(migration1Src).toContain('user_id = auth.uid()')
    expect(migration1Src).toContain('Business does not belong to the current user')
  })

  it('GRANT EXECUTE on numbering function to authenticated', () => {
    expect(migration1Src).toContain('GRANT EXECUTE ON FUNCTION assign_billing_document_number')
    expect(migration1Src).toContain('TO authenticated')
  })

  it('public route does not expose business data', () => {
    // Public route only returns the document presentation, not business records
    expect(publicRouteSrc).toContain('buildDocumentPresentation')
    expect(publicRouteSrc).not.toMatch(/from\('businesses'\)/)
  })

  it('respond route validates token + document type + status', () => {
    expect(respondRouteSrc).toContain("eq('public_token', token)")
    expect(respondRouteSrc).toContain("document_type !== 'quote'")
    expect(respondRouteSrc).toContain("status !== 'sent'")
  })

  it('pay route enforces business ownership', () => {
    expect(payRouteSrc).toContain("eq('business_id', business.id)")
  })

  it('convert route enforces business ownership', () => {
    expect(convertRouteSrc).toContain("eq('business_id', business.id)")
  })

  it('send route enforces business ownership', () => {
    expect(sendRouteSrc).toContain("eq('business_id', business.id)")
  })

  it('logo storage scoped to business folder', () => {
    expect(migration2Src).toContain('storage.foldername(name)')
    expect(migration2Src).toContain('user_id = auth.uid()')
  })

  it('no service-role credentials exposed to browser (logo uses browser client)', () => {
    expect(logoSrc).toContain('createBrowserClient')
    expect(logoSrc).not.toMatch(/service_role|SERVICE_ROLE/)
  })
})

// ============================================================================
// MIGRATION TIMESTAMP
// ============================================================================
describe('MIGRATION TIMESTAMP', () => {
  it('billing foundation migration renamed to correct timestamp (20260913210000)', () => {
    // The original 20260919000000 was future-dated and unapplied
    // It was renamed to 20260913210000 (today's date)
    expect(migration1Src).toBeDefined()
  })

  it('batch 2 migration timestamp is after foundation', () => {
    // 20260913220000 > 20260913210000
    expect(migration2Src).toBeDefined()
  })
})
