import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const base = join(__dirname, '..', '..', '..')

function readSrc(rel: string): string {
  return readFileSync(join(base, rel), 'utf8')
}

const pdfRouteSrc = readSrc('src/app/api/billing-documents/[id]/pdf/route.tsx')
const sendRouteSrc = readSrc('src/app/api/billing-documents/[id]/send/route.ts')
const detailRouteSrc = readSrc('src/app/api/billing-documents/[id]/route.ts')
const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
const rendererSrc = readSrc('src/components/billing/DocumentRenderer.tsx')
const twilioSrc = readSrc('src/lib/twilio.ts')
const nextConfigSrc = readSrc('next.config.js')
const builderSrc = readSrc('src/lib/billing/document-builder.ts')
const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')

// ============================================================================
// PDF PRODUCTION PACKAGING
// ============================================================================
describe('PDF PRODUCTION PACKAGING', () => {
  it('1. PDF route uses Node runtime (not Edge)', () => {
    expect(pdfRouteSrc).toContain("runtime = 'nodejs'")
  })

  it('2. next.config.js relies on Next.js default externalization for @react-pdf/renderer', () => {
    // @react-pdf/renderer is in Next.js 15's default serverExternalPackages
    // list; commit 153fc37f removed the explicit entry when the React #31
    // root cause was fixed via the @react-pdf/reconciler patch.
    expect(nextConfigSrc).toContain('serverExternalPackages')
    expect(nextConfigSrc).toContain("'pdfkit'")
    expect(nextConfigSrc).toContain("'@react-pdf/font'")
  })

  it('3. no manual Helvetica.cjs path references', () => {
    expect(pdfRouteSrc).not.toContain('Helvetica.cjs')
    expect(pdfRouteSrc).not.toContain('standard-fonts')
  })

  it('4. PDF route uses @react-pdf/renderer renderToBuffer', () => {
    expect(pdfRouteSrc).toContain('renderToBuffer')
    expect(pdfRouteSrc).toContain('@react-pdf/renderer')
  })

  it('5. Quote PDF filename is correct', () => {
    expect(pdfRouteSrc).toContain('Quote-${doc.document_number}.pdf')
  })

  it('6. Invoice PDF filename is correct', () => {
    expect(pdfRouteSrc).toContain('Invoice-${doc.document_number}.pdf')
  })

  it('7. PDF response has application/pdf content type', () => {
    expect(pdfRouteSrc).toContain("'Content-Type': 'application/pdf'")
  })

  it('8. PDF route pre-fetches logo as data URL (production-safe)', () => {
    expect(pdfRouteSrc).toContain('logoDataUrl')
    expect(pdfRouteSrc).toContain('data:')
    expect(pdfRouteSrc).toContain('base64')
  })

  it('9. logo fetch failure does not crash PDF generation', () => {
    expect(pdfRouteSrc).toContain('catch (logoErr)')
    expect(pdfRouteSrc).toContain('rendering without logo')
  })

  it('10. PDF route falls back to no-logo on fetch failure', () => {
    expect(pdfRouteSrc).toContain('logoDataUrl: string | null = null')
    expect(pdfRouteSrc).toContain('presentationWithLogo')
  })
})

// ============================================================================
// LOGO CONTRACT
// ============================================================================
describe('LOGO CONTRACT', () => {
  it('11. unsent draft PDF can use current business logo fallback', () => {
    // buildDocumentPresentation fetches live business logo for drafts
    expect(builderSrc).toContain("logo_url: business?.logo_url || null")
  })

  it('12. sent document uses snapshot logo', () => {
    expect(builderSrc).toContain('isSent && doc.snapshot_business_name')
    expect(builderSrc).toContain('logo_url: doc.snapshot_business_logo_url')
  })

  it('13. missing logo does not crash (PDF renderer guards on truthy)', () => {
    expect(pdfRouteSrc).toContain('presentation.business_logo_url')
    // The conditional check ensures null logo is skipped
  })

  it('14. bad/unreachable logo does not crash (try/catch around fetch)', () => {
    expect(pdfRouteSrc).toContain('catch (logoErr)')
  })

  it('15. detail route returns business_logo_url for drafts', () => {
    expect(detailRouteSrc).toContain('business_logo_url')
    expect(detailRouteSrc).toContain("doc.status === 'draft'")
    expect(detailRouteSrc).toContain('logo_url')
  })

  it('16. saved viewer uses business_logo_url from API for drafts', () => {
    expect(viewerSrc).toContain('businessLogoUrl')
    expect(viewerSrc).toContain('json.business_logo_url')
    expect(viewerSrc).toContain('d.snapshot_business_logo_url || businessLogoUrl')
  })

  it('17. snapshot builder freezes logo at send time', () => {
    expect(builderSrc).toContain('snapshot_business_logo_url: business?.logo_url || null')
  })
})

// ============================================================================
// CARD DOWNLOAD BUTTON
// ============================================================================
describe('CARD DOWNLOAD BUTTON', () => {
  it('18. Quote row has Download PDF button', () => {
    expect(listSrc).toContain('aria-label="Download PDF"')
    expect(listSrc).toContain('onDownload(doc)')
  })

  it('19. Invoice row has Download PDF button', () => {
    // Same component renders both types
    expect(listSrc).toContain('onDownload')
  })

  it('20. click uses existing download handler', () => {
    expect(listSrc).toContain('onDownload(doc)')
  })

  it('21. Download button has Download icon', () => {
    expect(listSrc).toContain('<Download')
  })

  it('22. Download button has loading state (downloadingId)', () => {
    expect(listSrc).toContain('downloadingId === doc.id')
  })

  it('23. Edit and Delete remain intact', () => {
    expect(listSrc).toContain('onOpen(doc)')
    expect(listSrc).toContain('setDeleteTarget(doc)')
  })
})

// ============================================================================
// DELETE CONFIRMATION
// ============================================================================
describe('DELETE CONFIRMATION', () => {
  it('24. delete click opens confirmation (not immediate delete)', () => {
    expect(listSrc).toContain('setDeleteTarget(doc)')
    expect(listSrc).not.toContain('onClick={() => onDelete(doc)}')
  })

  it('25. no deletion before confirmation', () => {
    // onDelete is only called from handleConfirmDelete
    expect(listSrc).toContain('handleConfirmDelete')
    expect(listSrc).toContain('onDelete(deleteTarget)')
  })

  it('26. Cancel preserves document', () => {
    expect(listSrc).toContain('Cancel')
    expect(listSrc).toContain('setDeleteTarget(null)')
  })

  it('27. confirmation modal uses shared Modal component', () => {
    expect(listSrc).toContain("from '@/components/ui/Modal'")
    expect(listSrc).toContain('<Modal')
    expect(listSrc).toContain('isOpen={!!deleteTarget}')
  })

  it('28. Quote wording says "Delete quote?"', () => {
    expect(listSrc).toContain("Delete quote?")
  })

  it('29. Invoice wording says "Delete invoice?"', () => {
    expect(listSrc).toContain("Delete invoice?")
  })

  it('30. body mentions document number and permanence', () => {
    expect(listSrc).toContain("will be permanently deleted")
    expect(listSrc).toContain("can't be undone")
  })

  it('31. Delete button has destructive red styling', () => {
    expect(listSrc).toContain('bg-red-600')
    expect(listSrc).toContain('hover:bg-red-700')
  })

  it('32. no window.confirm() usage', () => {
    expect(listSrc).not.toContain('window.confirm')
  })

  it('33. delete confirmation prevents double-delete (disabled while in flight)', () => {
    expect(listSrc).toContain('deletingId === deleteTarget?.id')
  })
})

// ============================================================================
// VIEWER DEAD SPACE
// ============================================================================
describe('VIEWER DEAD SPACE', () => {
  it('34. DocumentRenderer does not force min-h-screen', () => {
    expect(rendererSrc).not.toContain('min-h-screen')
  })

  it('35. DocumentRenderer content is content-sized (no fixed page height)', () => {
    // The min-h-screen was removed; content should flow naturally
    expect(rendererSrc).toContain('max-w-2xl mx-auto bg-white p-6 sm:p-10')
  })

  it('36. actual PDF page sizing unchanged (BillingDocumentPdf uses Page size LETTER)', () => {
    const pdfSrc = readSrc('src/components/billing/BillingDocumentPdf.tsx')
    expect(pdfSrc).toContain('size="LETTER"')
  })
})

// ============================================================================
// SEND ROUTE — BUSINESS TWILIO FIELDS
// ============================================================================
describe('SEND ROUTE — BUSINESS TWILIO FIELDS', () => {
  it('37. billing send route loads canonical business messaging fields', () => {
    expect(sendRouteSrc).toContain('twilio_phone_number')
    expect(sendRouteSrc).toContain('twilio_phone_number_sid')
    expect(sendRouteSrc).toContain('twilio_messaging_service_sid')
  })

  it('38. send route fetches full business row (not just guard fields)', () => {
    expect(sendRouteSrc).toContain("from('businesses')")
    expect(sendRouteSrc).toContain('provisioning_status')
  })

  it('39. send route does NOT mark sent before SMS succeeds', () => {
    // SMS is sent BEFORE the update to status=sent
    const smsIdx = sendRouteSrc.indexOf('sendSms(business')
    const updateIdx = sendRouteSrc.indexOf("status: 'sent'")
    expect(smsIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(-1)
    // The first sendSms call (for first send) must come before the update
    // Find the first-send sendSms (not the resend one)
    const firstSendSmsIdx = sendRouteSrc.indexOf('sendSms(business', sendRouteSrc.indexOf('First send'))
    expect(firstSendSmsIdx).toBeGreaterThan(-1)
    expect(firstSendSmsIdx).toBeLessThan(updateIdx)
  })

  it('40. SMS failure returns error (does not mark sent)', () => {
    expect(sendRouteSrc).toContain("NO_TWILIO_NUMBER")
    expect(sendRouteSrc).toContain("503")
    expect(sendRouteSrc).toContain("isn't ready")
  })

  it('41. SMS failure does not set sent_at', () => {
    // sent_at is only in the update block AFTER smsResult checks pass
    const sentAtIdx = sendRouteSrc.indexOf('sent_at:')
    const noTwilioIdx = sendRouteSrc.indexOf("NO_TWILIO_NUMBER")
    // The NO_TWILIO_NUMBER check returns before sent_at is set
    expect(noTwilioIdx).toBeGreaterThan(-1)
    expect(sentAtIdx).toBeGreaterThan(noTwilioIdx)
  })

  it('42. successful send sets Sent after SMS success', () => {
    expect(sendRouteSrc).toContain("status: 'sent'")
    expect(sendRouteSrc).toContain('sent_at: new Date().toISOString()')
  })

  it('43. resend reuses existing token', () => {
    // New unified flow: token is reused via `let publicToken = doc.public_token`
    // regardless of status (sent OR draft with prepared token).
    expect(sendRouteSrc).toContain('let publicToken = doc.public_token')
    expect(sendRouteSrc).toContain('if (!publicToken)')
  })

  it('44. send route uses Node runtime', () => {
    expect(sendRouteSrc).toContain("runtime = 'nodejs'")
  })

  it('45. send route returns user-friendly error on NO_TWILIO_NUMBER', () => {
    expect(sendRouteSrc).toContain("ReplyFlow couldn't send this document")
  })
})

// ============================================================================
// FAILED SMS PERSISTENCE
// ============================================================================
describe('FAILED SMS PERSISTENCE', () => {
  it('46. failed SMS logging never stores a Messaging Service SID in from_phone', () => {
    // The fromPhone value must only be a real phone number, never a messaging service SID
    expect(twilioSrc).not.toContain("business.twilio_phone_number || business.twilio_messaging_service_sid")
    expect(twilioSrc).not.toContain("from_phone: business.twilio_messaging_service_sid")
  })

  it('47. failed SMS logging never stores "unknown" in from_phone', () => {
    // "unknown" must never be used as a from_phone value
    expect(twilioSrc).not.toContain("'unknown'")
    // The comment documenting this is acceptable, but no code path should assign it
    expect(twilioSrc).not.toContain("from_phone: 'unknown'")
    expect(twilioSrc).not.toContain("fromPhone = 'unknown'")
  })

  it('48. real canonical From phone is persisted when available', () => {
    // When twilio_phone_number exists, it is used as from_phone
    expect(twilioSrc).toContain('const fromPhone = business.twilio_phone_number || null')
    expect(twilioSrc).toContain('from_phone: fromPhone')
  })

  it('49. failed SMS logging skips messages insert when no canonical from_phone', () => {
    // When twilio_phone_number is null, skip the insert entirely
    expect(twilioSrc).toContain("if (!fromPhone)")
    expect(twilioSrc).toContain("Skipping messages insert")
  })

  it('50. logging failure does not throw (catches errors silently)', () => {
    expect(twilioSrc).toContain("Don't throw - this is just logging")
  })

  it('51. primary NO_TWILIO_NUMBER error remains preserved (returned before logging)', () => {
    // sendSms returns { reason: 'NO_TWILIO_NUMBER' } before logFailedMessage is called
    // The billing send route checks this reason and returns 503
    expect(sendRouteSrc).toContain("NO_TWILIO_NUMBER")
    expect(sendRouteSrc).toContain("503")
  })

  it('52. document remains Draft on send failure', () => {
    // The send route sends SMS BEFORE marking sent — on failure it returns early
    const smsIdx = sendRouteSrc.indexOf('sendSms(business')
    const updateIdx = sendRouteSrc.indexOf("status: 'sent'")
    expect(smsIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(-1)
    expect(smsIdx).toBeLessThan(updateIdx)
  })

  it('53. successful send path unchanged (marks sent after SMS success)', () => {
    expect(sendRouteSrc).toContain("status: 'sent'")
    expect(sendRouteSrc).toContain('sent_at: new Date().toISOString()')
    expect(sendRouteSrc).toContain('public_token: publicToken')
  })
})

// ============================================================================
// UI FEEDBACK
// ============================================================================
describe('UI FEEDBACK', () => {
  it('49. download failure shows error to user', () => {
    expect(paymentsPageSrc).toContain("Failed to download PDF")
  })

  it('50. send failure shows error to user', () => {
    expect(paymentsPageSrc).toContain("Failed to send document")
  })

  it('51. send failure does not show success', () => {
    // On !res.ok, it sets error, not success
    const sendHandler = paymentsPageSrc.substring(
      paymentsPageSrc.indexOf('handleSendBillingDoc'),
      paymentsPageSrc.indexOf('handleConvertBillingDoc')
    )
    expect(sendHandler).toContain('setError')
    expect(sendHandler).toContain("setSuccessMessage('')")
  })

  it('52. download filename is Quote-Q-XXXX.pdf for quotes', () => {
    expect(paymentsPageSrc).toContain('Quote-${doc.document_number}.pdf')
  })

  it('53. download filename is Invoice-INV-XXXX.pdf for invoices', () => {
    expect(paymentsPageSrc).toContain('Invoice-${doc.document_number}.pdf')
  })
})
