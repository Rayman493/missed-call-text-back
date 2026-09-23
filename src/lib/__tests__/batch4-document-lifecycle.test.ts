import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { normalizePaypalLink, normalizePaypalUsername } from '../payment-links'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const migration = read('supabase/migrations/20260919000100_billing_conversion_lifecycle.sql')
const convertRoute = read('src/app/api/billing-documents/[id]/convert/route.ts')
const sendRoute = read('src/app/api/billing-documents/[id]/send/route.ts')
const preparePayment = read('src/lib/billing/prepare-payment.ts')
const paymentsPage = read('src/app/dashboard/payments/page.tsx')
const editor = read('src/components/billing/BillingEditorModal.tsx')
const list = read('src/components/billing/BillingDocumentList.tsx')
const jobDetails = read('src/components/jobs/JobDetailsModal.tsx')
const settings = read('src/components/SettingsContent.tsx')
const handoff = read('src/components/PaymentHandoff.tsx')
const delivery = read('src/lib/billing/download-billing-pdf.ts')

describe('quote to invoice lifecycle', () => {
  it('converts only accepted quotes without mutating the source quote', () => {
    expect(migration).toContain("IF v_quote.status <> 'accepted'")
    expect(migration).toContain("v_quote.document_type <> 'quote'")
    expect(migration).not.toMatch(/UPDATE billing_documents[\s\S]*v_quote\.id/)
  })

  it('creates one linked draft invoice with canonical copied data', () => {
    expect(migration).toContain("v_quote.business_id, 'invoice', 'draft'")
    expect(migration).toContain('v_quote.customer_id')
    expect(migration).toContain('v_quote.subtotal_cents')
    expect(migration).toContain('v_quote.discount_cents')
    expect(migration).toContain('v_quote.tax_cents')
    expect(migration).toContain('v_quote.total_cents')
    expect(migration).toContain('v_quote.id')
    expect(migration).toContain('INSERT INTO billing_document_items')
  })

  it('serializes repeated conversions and enforces one invoice per source quote', () => {
    expect(migration).toContain('FOR UPDATE')
    expect(migration).toContain('document.source_quote_id = v_quote.id')
    expect(migration).toContain('IF v_invoice_id IS NOT NULL')
    expect(migration).toContain('RETURN v_invoice_id')
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS billing_documents_one_invoice_per_source_quote_idx')
    expect(migration).toContain("WHERE source_quote_id IS NOT NULL AND document_type = 'invoice'")
    expect(migration).toContain('HAVING COUNT(*) > 1')
  })

  it('limits the definer RPC to authenticated owners', () => {
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('SET search_path = public, pg_temp')
    expect(migration).toContain('business.user_id = auth.uid()')
    expect(migration).toContain('REVOKE ALL ON FUNCTION convert_quote_to_invoice(uuid) FROM PUBLIC')
    expect(migration).toContain('REVOKE ALL ON FUNCTION convert_quote_to_invoice(uuid) FROM anon')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION convert_quote_to_invoice(uuid) TO authenticated')
    expect(migration).not.toContain('GRANT EXECUTE ON FUNCTION convert_quote_to_invoice(uuid) TO service_role')
  })

  it('uses the canonical concurrency-safe invoice number allocator', () => {
    expect(migration).toContain("assign_billing_document_number(v_quote.business_id, 'invoice')")
    expect(migration).not.toMatch(/MAX\s*\(/i)
  })

  it('conversion is atomic and returns the customer join', () => {
    expect(convertRoute).toContain("rpc('convert_quote_to_invoice'")
    expect(convertRoute).toContain('leads ( id, contact_name, caller_phone, raw_metadata, ai_call_records ( id, created_at, extracted_info ) )')
    expect(convertRoute).not.toContain("delete().eq('id', invoice.id)")
  })

  it('client dedupes by canonical document id and filters by persisted type', () => {
    expect(paymentsPage).toContain('prev.some((document) => document.id === invoiceItem.id)')
    expect(paymentsPage).toContain('document.document_type === billingTypeFilter')
    expect(paymentsPage).toContain("candidate.document_type === 'invoice' && candidate.source_quote_id === document.id")
  })

  it('shows bidirectional relationship navigation', () => {
    expect(list).toContain('Invoice created •')
    expect(list).toContain('Created from')
    expect(list).toContain('onViewRelated')
  })
})

describe('quote to invoice conversion UI feedback', () => {
  const convertFn = paymentsPage.slice(paymentsPage.indexOf('const handleConvertBillingDoc = async'))

  it('shows a success toast only after a successful new conversion', () => {
    expect(paymentsPage).toContain('showToast(')
    expect(paymentsPage).toContain('`Invoice ${newInvoice.document_number || \'\'} created`')
    expect(paymentsPage).toContain('if (isNewlyCreated)')
  })

  it('does not show a duplicate success toast when an existing invoice is returned', () => {
    expect(paymentsPage).toContain('const existing = prev.some((document) => document.id === invoiceItem.id)')
    expect(paymentsPage).toContain('isNewlyCreated = !existing')
    const afterIsNewlyCreated = convertFn.slice(convertFn.indexOf('if (isNewlyCreated)'))
    expect(afterIsNewlyCreated).toContain('showToast(')
  })

  it('shows a visible error toast when the conversion response is not OK', () => {
    expect(paymentsPage).toContain('showToast(errorMessage, \'error\')')
    expect(paymentsPage).toContain('Failed to create invoice')
  })

  it('shows a fallback error toast when fetch/network throws', () => {
    const catchBlock = convertFn.slice(convertFn.indexOf('catch (err)'))
    expect(catchBlock).toContain('showToast(')
  })

  it('does not mutate invoice state on conversion failure', () => {
    const okBranch = convertFn.slice(
      convertFn.indexOf('if (res.ok)'),
      convertFn.indexOf('} else {')
    )
    expect(okBranch).toContain('setBillingDocuments')

    const failureBranch = convertFn.slice(convertFn.indexOf('} else {'))
    expect(failureBranch).not.toContain('setBillingDocuments')
    expect(failureBranch).toContain('showToast(errorMessage, \'error\')')
  })
})

describe('zero-dollar invoice send validation', () => {
  const sendPrepareFn = preparePayment.slice(preparePayment.indexOf('export async function prepareInvoicePayment'))

  it('server-side prepare rejects zero-dollar invoices before any payment_request insert', () => {
    expect(sendPrepareFn).toContain('invoice.total_cents <= 0')
    const guard = sendPrepareFn.slice(sendPrepareFn.indexOf('invoice.total_cents <= 0'), sendPrepareFn.indexOf('// ── Step 1:'))
    expect(guard).toContain('Add an amount greater than $0')
    expect(guard).toMatch(/status:\s*400/)
  })

  it('send route rejects zero-dollar invoices before token persistence or payment prepare', () => {
    // Guard must appear before the token-persist block and before prepareInvoicePayment call.
    const guardIndex = sendRoute.indexOf('doc.total_cents <= 0')
    const prepareIndex = sendRoute.indexOf('prepareInvoicePayment(supabase')
    expect(guardIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeLessThan(prepareIndex)
    expect(sendRoute).toContain('Add an amount greater than $0 before sending this invoice')
    expect(sendRoute).toMatch(/return NextResponse\.json\(\{ error: 'Add an amount greater than \$0 before sending this invoice\.' \}, \{ status: 400 \}\)/)
  })

  it('payments page send modal validates invoice total > 0 before dispatching send', () => {
    expect(paymentsPage).toContain("target.document_type === 'invoice'")
    expect(paymentsPage).toContain('target.total_cents <= 0')
    expect(paymentsPage).toContain('Add an amount greater than $0 before sending this invoice')
    expect(paymentsPage).toContain('setBillingSendError(')
  })

  it('editor create-and-send validates invoice total > 0 before dispatching save-and-send', () => {
    const confirmBlock = editor.slice(editor.indexOf('createAndSendError && ('), editor.indexOf('createAndSendError && (') + 1800)
    expect(confirmBlock).toContain('isInvoice && total <= 0')
    expect(confirmBlock).toContain('Add an amount greater than $0 before sending this invoice')
    expect(confirmBlock).toContain('setCreateAndSendError(')
  })
})

describe('document realtime and safe actions', () => {
  it('publishes full billing document updates for realtime acceptance', () => {
    expect(migration).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE billing_documents')
    expect(migration).toContain("FROM pg_publication_tables")
    expect(migration).toContain("tablename = 'billing_documents'")
    expect(migration).toContain('ALTER TABLE billing_documents REPLICA IDENTITY FULL')
    expect(paymentsPage).toContain("table: 'billing_documents'")
    expect(paymentsPage).toContain('status: row.status ?? d.status')
  })

  it('requires confirmation for send and conversion from list or viewer', () => {
    expect(paymentsPage).toContain('setBillingSendTarget')
    expect(paymentsPage).toContain('Send to Customer')
    expect(paymentsPage).toContain('setBillingConvertTarget')
    expect(paymentsPage).toContain('The original quote will remain accepted and viewable in history')
  })

  it('creates a draft before using the existing send route', () => {
    const save = editor.slice(editor.indexOf('const handleSaveDraft'), editor.indexOf('const handleAttemptClose'))
    expect(save.indexOf("fetch('/api/billing-documents'")).toBeLessThan(save.indexOf('/send`'))
    expect(save).toContain('Draft saved and ready to retry')
    expect(editor).toContain('Create Draft')
    expect(editor).toContain('Create & Send')
    expect(editor).toContain('showCreateAndSendConfirm')
  })

  it('keeps document name editable only for drafts', () => {
    expect(editor).toContain("disabled={!!existingDocument && existingDocument.status !== 'draft'}")
  })

  it('does not autofocus the billing customer search', () => {
    const search = editor.slice(editor.indexOf('placeholder="Search customers..."') - 300, editor.indexOf('placeholder="Search customers..."') + 300)
    expect(search).not.toContain('autoFocus')
  })

  it('uses stable action columns', () => {
    expect(list).toContain('grid grid-cols-6 gap-1 w-full')
    expect(list).toContain('col: 1')
    expect(list).toContain('col: 6')
    expect(list).toContain('style={{ gridColumn: slot.col }}')
  })

  it('maps actual share cancellation to transient normal feedback', () => {
    expect(delivery).toContain("if (cancelled) onSuccess?.('Share canceled')")
  })
})

describe('payment rendering and PayPal manual handoff', () => {
  it('renders neutral payment loading and hides paid placeholder descriptions', () => {
    expect(jobDetails).toContain('paymentLoadedForLeadId !== job.lead_id')
    expect(jobDetails).toContain('Loading payment details')
    expect(jobDetails).toContain("!/^not collected$/i.test(paymentRequest.description.trim())")
  })

  it('normalizes usernames and legacy paypal.me values', () => {
    expect(normalizePaypalUsername('@yourbusiness')).toBe('yourbusiness')
    expect(normalizePaypalUsername('https://paypal.me/legacybusiness/10.00')).toBe('legacybusiness')
    expect(normalizePaypalLink('yourbusiness')).toBe('https://paypal.me/yourbusiness')
  })

  it('settings request a username and public handoff stays manual', () => {
    expect(settings).toContain('PayPal username')
    expect(settings).toContain('With or without @')
    expect(settings).toContain('normalizePaypalUsername')
    expect(handoff).toContain("const paypalRecipient = paypalDisplay || businessName")
    expect(handoff).toContain('Open PayPal (app or paypal.com)')
    expect(handoff).not.toContain('Payment Link')
  })
})
