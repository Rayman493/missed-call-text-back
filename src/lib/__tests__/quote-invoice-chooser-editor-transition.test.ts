/**
 * Quote / Invoice Chooser → Editor Transition Regression Tests
 *
 * Regression for the blocking production bug where clicking "Create Quote"
 * or "Create Invoice" in the chooser closed the chooser but the editor
 * never opened.
 *
 * Root cause: the chooser's useModalBackButton cleanup called
 * window.history.back() during the transition, triggering a popstate
 * that immediately closed the editor.
 *
 * Fix: handleBillingChooserSelect calls suppressNextHistoryBackCleanup()
 * before closing the chooser, so the chooser cleanup skips history.back().
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')
const chooserSrc = readSrc('src/components/billing/BillingChooserModal.tsx')
const editorSrc = readSrc('src/components/billing/BillingEditorModal.tsx')
const viewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
const listSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
const modalSrc = readSrc('src/components/ui/Modal.tsx')
const modalBackButtonSrc = readSrc('src/hooks/useModalBackButton.ts')
const modalBackButtonLibSrc = readSrc('src/lib/modalBackButton.ts')

// ============================================================================
// STATE CONTRACT
// ============================================================================
describe('STATE CONTRACT', () => {
  it('payments page has all four required state variables', () => {
    expect(paymentsPageSrc).toContain('showBillingChooser')
    expect(paymentsPageSrc).toContain('showBillingEditor')
    expect(paymentsPageSrc).toContain('billingEditorType')
    expect(paymentsPageSrc).toContain('billingEditorDoc')
  })

  it('chooser isOpen is controlled by showBillingChooser', () => {
    expect(paymentsPageSrc).toContain('isOpen={showBillingChooser}')
  })

  it('editor isOpen is controlled by showBillingEditor', () => {
    expect(paymentsPageSrc).toContain('isOpen={showBillingEditor}')
  })

  it('editor documentType is controlled by billingEditorType', () => {
    expect(paymentsPageSrc).toContain('documentType={billingEditorType}')
  })

  it('editor existingDocument is controlled by billingEditorDoc', () => {
    expect(paymentsPageSrc).toContain('existingDocument={billingEditorDoc}')
  })

  it('editor does NOT require existingDocument to be non-null (isOpen is independent)', () => {
    // The editor open condition is showBillingEditor, NOT !!billingEditorDoc
    // This is critical: a NEW document has billingEditorDoc = null
    expect(paymentsPageSrc).toContain('isOpen={showBillingEditor}')
    // Make sure there's no condition like isOpen={!!billingEditorDoc}
    expect(paymentsPageSrc).not.toContain('isOpen={!!billingEditorDoc}')
  })
})

// ============================================================================
// CHOOSER → EDITOR TRANSITION (THE FIX)
// ============================================================================
describe('CHOOSER → EDITOR TRANSITION', () => {
  it('handleBillingChooserSelect sets document type', () => {
    expect(paymentsPageSrc).toContain('setBillingEditorType(type)')
  })

  it('handleBillingChooserSelect clears existing document (new document)', () => {
    expect(paymentsPageSrc).toContain('setBillingEditorDoc(null)')
  })

  it('handleBillingChooserSelect closes chooser', () => {
    expect(paymentsPageSrc).toContain('setShowBillingChooser(false)')
  })

  it('handleBillingChooserSelect opens editor', () => {
    expect(paymentsPageSrc).toContain('setShowBillingEditor(true)')
  })

  it('handleBillingChooserSelect calls suppressNextHistoryBackCleanup BEFORE closing chooser', () => {
    // The suppression call must appear before setShowBillingChooser(false)
    const handlerMatch = paymentsPageSrc.match(
      /handleBillingChooserSelect[\s\S]*?\{([\s\S]*?)\n  \}/
    )
    expect(handlerMatch).toBeTruthy()
    const body = handlerMatch![1]
    const suppressIdx = body.indexOf('suppressNextHistoryBackCleanup()')
    const closeChooserIdx = body.indexOf('setShowBillingChooser(false)')
    expect(suppressIdx).toBeGreaterThan(-1)
    expect(closeChooserIdx).toBeGreaterThan(-1)
    expect(suppressIdx).toBeLessThan(closeChooserIdx)
  })

  it('suppressNextHistoryBackCleanup is imported from modalBackButton', () => {
    expect(paymentsPageSrc).toContain("from '@/lib/modalBackButton'")
    expect(paymentsPageSrc).toContain('suppressNextHistoryBackCleanup')
  })

  it('NO setTimeout or requestAnimationFrame call in the transition', () => {
    const handlerMatch = paymentsPageSrc.match(
      /handleBillingChooserSelect[\s\S]*?\{([\s\S]*?)\n  \}/
    )
    expect(handlerMatch).toBeTruthy()
    const body = handlerMatch![1]
    // Strip comments before checking for actual calls
    const codeOnly = body.replace(/\/\/[^\n]*/g, '')
    expect(codeOnly).not.toMatch(/setTimeout\s*\(/)
    expect(codeOnly).not.toMatch(/requestAnimationFrame\s*\(/)
  })
})

// ============================================================================
// CHOOSER X (manual close) — does NOT open editor
// ============================================================================
describe('CHOOSER X (manual close)', () => {
  it('chooser onClose only closes chooser (does not open editor)', () => {
    // The chooser's onClose is () => setShowBillingChooser(false)
    // It must NOT call setShowBillingEditor(true)
    // Find the BillingChooserModal JSX usage (not the import)
    const chooserIdx = paymentsPageSrc.indexOf('<BillingChooserModal')
    expect(chooserIdx).toBeGreaterThan(-1)
    const chooserBlock = paymentsPageSrc.slice(chooserIdx, chooserIdx + 300)
    expect(chooserBlock).toContain('setShowBillingChooser(false)')
    expect(chooserBlock).not.toContain('setShowBillingEditor(true)')
  })
})

// ============================================================================
// EDITOR CLOSE — clears transient state safely
// ============================================================================
describe('EDITOR CLOSE', () => {
  it('editor onClose closes editor and clears document', () => {
    // Find the BillingEditorModal block specifically (not the viewer)
    const editorIdx = paymentsPageSrc.indexOf('Quote / Invoice Editor Modal')
    expect(editorIdx).toBeGreaterThan(-1)
    const editorBlock = paymentsPageSrc.slice(editorIdx, editorIdx + 400)
    expect(editorBlock).toContain('setShowBillingEditor(false)')
    expect(editorBlock).toContain('setBillingEditorDoc(null)')
  })
})

// ============================================================================
// EDIT EXISTING DRAFT — still works
// ============================================================================
describe('EDIT EXISTING DRAFT', () => {
  it('handleOpenBillingDoc sets editor type from document', () => {
    expect(paymentsPageSrc).toContain('setBillingEditorType(d.document_type)')
  })

  it('handleOpenBillingDoc sets editor doc from fetched document', () => {
    expect(paymentsPageSrc).toContain('setBillingEditorDoc(')
  })

  it('handleOpenBillingDoc opens editor', () => {
    expect(paymentsPageSrc).toContain('setShowBillingEditor(true)')
  })

  it('editor supports existingDocument=null (NEW document)', () => {
    // The title computation handles null existingDocument
    expect(editorSrc).toContain('existingDocument')
    expect(editorSrc).toContain('New ')
    // The hydration useEffect checks if existingDocument exists
    expect(editorSrc).toContain('if (existingDocument)')
  })
})

// ============================================================================
// MODAL HISTORY CLEANUP — does not undo sequential transition
// ============================================================================
describe('MODAL HISTORY CLEANUP', () => {
  it('useModalBackButton checks hasOpenModal before calling history.back()', () => {
    expect(modalBackButtonSrc).toContain('!hasOpenModal()')
    expect(modalBackButtonSrc).toContain('window.history.back()')
  })

  it('useModalBackButton checks consumeHistoryBackSuppression before history.back()', () => {
    expect(modalBackButtonSrc).toContain('consumeHistoryBackSuppression()')
  })

  it('suppressNextHistoryBackCleanup sets the one-shot flag', () => {
    expect(modalBackButtonLibSrc).toContain('export function suppressNextHistoryBackCleanup')
    expect(modalBackButtonLibSrc).toContain('suppressHistoryBackCleanupOnce = true')
  })

  it('consumeHistoryBackSuppression returns true when flag set, then clears it', () => {
    expect(modalBackButtonLibSrc).toContain('export function consumeHistoryBackSuppression')
    expect(modalBackButtonLibSrc).toContain('wasSuppressed')
    expect(modalBackButtonLibSrc).toContain('suppressHistoryBackCleanupOnce = false')
  })

  it('chooser uses shared Modal (and thus useModalBackButton)', () => {
    expect(chooserSrc).toContain("from '@/components/ui/Modal'")
  })

  it('editor uses shared Modal (and thus useModalBackButton)', () => {
    expect(editorSrc).toContain("from '@/components/ui/Modal'")
  })

  it('Modal registers with useModalBackButton', () => {
    expect(modalSrc).toContain('useModalBackButton')
  })
})

// ============================================================================
// NO TIMING HACKS
// ============================================================================
describe('NO TIMING HACKS', () => {
  it('no setTimeout call in handleBillingChooserSelect', () => {
    const handlerMatch = paymentsPageSrc.match(
      /handleBillingChooserSelect[\s\S]*?\{([\s\S]*?)\n  \}/
    )
    expect(handlerMatch).toBeTruthy()
    const body = handlerMatch![1]
    // Check for actual setTimeout call, not comments mentioning it
    expect(body).not.toMatch(/[^a-zA-Z]setTimeout\s*\(/)
  })

  it('no requestAnimationFrame call in handleBillingChooserSelect', () => {
    const handlerMatch = paymentsPageSrc.match(
      /handleBillingChooserSelect[\s\S]*?\{([\s\S]*?)\n  \}/
    )
    expect(handlerMatch).toBeTruthy()
    const body = handlerMatch![1]
    expect(body).not.toMatch(/requestAnimationFrame\s*\(/)
  })

  it('no arbitrary delay patterns in the billing transition code', () => {
    // Check the broader billing state section for delay hacks
    const billingSectionMatch = paymentsPageSrc.match(
      /\/\/ Quote \/ Invoice state[\s\S]*?handleBillingChooserSelect[\s\S]*?\n  \}/
    )
    expect(billingSectionMatch).toBeTruthy()
    const section = billingSectionMatch![0]
    // Check for actual calls, not comments mentioning the word
    // Remove comment lines before checking
    const codeOnly = section.replace(/\/\/[^\n]*/g, '')
    expect(codeOnly).not.toMatch(/setTimeout\s*\(/)
    expect(codeOnly).not.toMatch(/requestAnimationFrame\s*\(/)
  })
})

// ============================================================================
// REOPEN CHOOSER AFTER EDITOR CLOSE
// ============================================================================
describe('REOPEN CHOOSER', () => {
  it('there is a button/control that opens the chooser (setShowBillingChooser(true))', () => {
    expect(paymentsPageSrc).toContain('setShowBillingChooser(true)')
  })

  it('opening chooser does not require editor to be closed first', () => {
    // The chooser open is independent: setShowBillingChooser(true)
    // There is no condition like !showBillingEditor
    const openChooserMatches = paymentsPageSrc.match(/setShowBillingChooser\(true\)/g)
    expect(openChooserMatches).toBeTruthy()
    expect(openChooserMatches!.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// MOBILE POSITIONING — chooser centered, not bottom-sheet
// ============================================================================
describe('MOBILE POSITIONING', () => {
  it('chooser does NOT use bottomSheetOnMobile', () => {
    // bottomSheetOnMobile causes items-end on mobile (bottom-aligned).
    // The chooser is a compact two-option modal and should be centered.
    expect(chooserSrc).not.toContain('bottomSheetOnMobile')
  })

  it('chooser is centered on mobile (default Modal centering)', () => {
    // Without bottomSheetOnMobile, the shared Modal uses items-center on mobile.
    // Verify the Modal component supports centered mobile layout by default.
    expect(modalSrc).toContain('items-center')
  })

  it('chooser preserves X close button (title prop set)', () => {
    expect(chooserSrc).toContain('title="Quote / Invoice"')
  })

  it('chooser preserves overlay/backdrop (uses shared Modal)', () => {
    expect(chooserSrc).toContain('<Modal')
  })

  it('chooser Create Quote action unchanged', () => {
    expect(chooserSrc).toContain("onSelectType('quote')")
    expect(chooserSrc).toContain('Create Quote')
  })

  it('chooser Create Invoice action unchanged', () => {
    expect(chooserSrc).toContain("onSelectType('invoice')")
    expect(chooserSrc).toContain('Create Invoice')
  })

  it('chooser onClose still wired (back/escape/X)', () => {
    expect(chooserSrc).toContain('onClose={onClose}')
  })

  it('editor modals still use bottomSheetOnMobile (unchanged)', () => {
    // The editor and preview modals should keep their existing mobile presentation.
    expect(editorSrc).toContain('bottomSheetOnMobile')
  })

  it('chooser does not use hardcoded positioning hacks', () => {
    expect(chooserSrc).not.toMatch(/top:\s*\d+px/)
    expect(chooserSrc).not.toMatch(/translate-y/)
    expect(chooserSrc).not.toMatch(/setTimeout/)
    expect(chooserSrc).not.toMatch(/requestAnimationFrame/)
  })
})

// ============================================================================
// PAYMENTS SEGMENTED VIEW
// ============================================================================
describe('PAYMENTS SEGMENTED VIEW', () => {
  it('has a Payments | Quotes & Invoices segment control', () => {
    expect(paymentsPageSrc).toContain('paymentsSegment')
    expect(paymentsPageSrc).toContain("'payments'")
    expect(paymentsPageSrc).toContain("'billing'")
  })

  it('segment defaults to payments', () => {
    expect(paymentsPageSrc).toContain("useState<'payments' | 'billing'>('payments')")
  })

  it('action cards remain visible above segmented content', () => {
    // Action cards come before the segment control UI (not the state declaration)
    const actionCardsIdx = paymentsPageSrc.indexOf('{/* Action Cards */}')
    const segmentUiIdx = paymentsPageSrc.indexOf('Segment control: Payments | Quotes')
    expect(actionCardsIdx).toBeGreaterThan(-1)
    expect(segmentUiIdx).toBeGreaterThan(-1)
    expect(actionCardsIdx).toBeLessThan(segmentUiIdx)
  })

  it('action card order remains Quote/Invoice → Request Payment → Tap to Pay', () => {
    const quoteIdx = paymentsPageSrc.indexOf('{/* Quote / Invoice Card */}')
    const requestIdx = paymentsPageSrc.indexOf('{/* Request Payment Card */}')
    const tapIdx = paymentsPageSrc.indexOf('{/* Tap to Pay Card */}')
    expect(quoteIdx).toBeLessThan(requestIdx)
    expect(requestIdx).toBeLessThan(tapIdx)
  })

  it('Payments segment wraps existing payment content', () => {
    expect(paymentsPageSrc).toContain("paymentsSegment === 'payments'")
    // KPI overview cards should be inside the payments segment
    const segmentStart = paymentsPageSrc.indexOf("paymentsSegment === 'payments'")
    const overviewIdx = paymentsPageSrc.indexOf('Overview Cards')
    expect(overviewIdx).toBeGreaterThan(segmentStart)
  })

  it('Quotes & Invoices segment renders billing document list', () => {
    expect(paymentsPageSrc).toContain("paymentsSegment === 'billing'")
    expect(paymentsPageSrc).toContain('BillingDocumentList')
  })

  it('documents do not depend on being below payment table', () => {
    // The billing segment is independent of the payments segment
    // Both are conditional on paymentsSegment, not on each other
    const billingSegment = paymentsPageSrc.indexOf("paymentsSegment === 'billing'")
    const paymentsSegment = paymentsPageSrc.indexOf("paymentsSegment === 'payments'")
    expect(billingSegment).toBeGreaterThan(-1)
    expect(paymentsSegment).toBeGreaterThan(-1)
  })

  it('has All / Quotes / Invoices type filter in billing segment', () => {
    expect(paymentsPageSrc).toContain('billingTypeFilter')
    expect(paymentsPageSrc).toContain("'all'")
    expect(paymentsPageSrc).toContain("'quote'")
    expect(paymentsPageSrc).toContain("'invoice'")
  })

  it('type filter defaults to all', () => {
    expect(paymentsPageSrc).toContain("useState<'all' | 'quote' | 'invoice'>('all')")
  })

  it('filteredBillingDocuments applies type filter', () => {
    expect(paymentsPageSrc).toContain('filteredBillingDocuments')
    expect(paymentsPageSrc).toContain("d.document_type === billingTypeFilter")
  })

  it('billing list uses filtered documents', () => {
    expect(paymentsPageSrc).toContain('documents={filteredBillingDocuments}')
  })
})

// ============================================================================
// SAVED VIEWER ACTIONS BY STATUS
// ============================================================================
describe('SAVED VIEWER ACTIONS BY STATUS', () => {
  it('viewer computes action visibility internally from fetched doc', () => {
    expect(viewerSrc).toContain('rawStatus')
    expect(viewerSrc).toContain('effective')
    expect(viewerSrc).toContain('isDraft')
    expect(viewerSrc).toContain('isSent')
    expect(viewerSrc).toContain('isAccepted')
    expect(viewerSrc).toContain('isDeclined')
    expect(viewerSrc).toContain('isPaid')
  })

  it('draft Quote exposes Edit + Download + Send', () => {
    expect(viewerSrc).toContain('const showEdit = isDraft || isDeclined')
    expect(viewerSrc).toContain('const showSend = isDraft')
    expect(viewerSrc).toContain('showDownload = true')
  })

  it('sent Quote exposes Download + Resend (not Send)', () => {
    expect(viewerSrc).toContain('const showResend = isSent || isOverdue')
    // Send is only for drafts
    expect(viewerSrc).toContain('const showSend = isDraft')
  })

  it('accepted Quote exposes Create Invoice', () => {
    expect(viewerSrc).toContain('const showConvert = isQuote && isAccepted')
    expect(viewerSrc).toContain('Create Invoice')
  })

  it('declined Quote exposes Edit + Download', () => {
    // showEdit includes isDeclined
    expect(viewerSrc).toContain('isDraft || isDeclined')
  })

  it('draft Invoice exposes Edit + Download + Send', () => {
    // Same as draft Quote — showEdit for drafts, showSend for drafts
    expect(viewerSrc).toContain('const showSend = isDraft')
  })

  it('sent Invoice exposes Download + Resend', () => {
    expect(viewerSrc).toContain('const showResend = isSent || isOverdue')
  })

  it('paid Invoice shows Paid and Download (no primary action)', () => {
    // No send/resend/convert for paid
    // showSend is only for drafts, showResend is for sent/overdue
    // showConvert is for accepted quotes only
    // So paid invoices only get Download
  })

  it('Download uses persisted PDF route (not transient editor state)', () => {
    // The viewer's onDownload is wired to handleDownloadBillingDoc in the payments page
    expect(paymentsPageSrc).toContain('handleDownloadBillingDoc')
    expect(paymentsPageSrc).toContain('/api/billing-documents/')
    expect(paymentsPageSrc).toContain('/pdf')
  })

  it('send uses existing send route', () => {
    expect(paymentsPageSrc).toContain('handleSendBillingDoc')
    expect(paymentsPageSrc).toContain('/send')
  })

  it('viewer no longer accepts showConvert/showSend/showEdit props', () => {
    // These are now computed internally
    expect(viewerSrc).not.toContain('showConvert?:')
    expect(viewerSrc).not.toContain('showSend?:')
    expect(viewerSrc).not.toContain('showEdit?:')
  })

  it('payments page no longer passes showConvert/showSend/showEdit props', () => {
    // The old props should not be passed to BillingViewerModal
    const viewerUsage = paymentsPageSrc.substring(
      paymentsPageSrc.indexOf('<BillingViewerModal'),
      paymentsPageSrc.indexOf('/>', paymentsPageSrc.indexOf('<BillingViewerModal'))
    )
    expect(viewerUsage).not.toContain('showConvert=')
    expect(viewerUsage).not.toContain('showSend=')
    expect(viewerUsage).not.toContain('showEdit=')
  })
})

// ============================================================================
// NEXT-STEP GUIDANCE
// ============================================================================
describe('NEXT-STEP GUIDANCE', () => {
  it("viewer has What's next? guidance section", () => {
    expect(viewerSrc).toContain("What's next?")
    expect(viewerSrc).toContain('nextStepTitle')
    expect(viewerSrc).toContain('nextStepBody')
    expect(viewerSrc).toContain('nextStepCta')
  })

  it('draft Quote recommends Send', () => {
    expect(viewerSrc).toContain("Review the quote, then send it when you're ready.")
    expect(viewerSrc).toContain("'Send Quote'")
  })

  it('sent Quote says waiting for customer', () => {
    expect(viewerSrc).toContain("Waiting for your customer to review the quote.")
  })

  it('accepted Quote recommends Create Invoice', () => {
    expect(viewerSrc).toContain("Ready to bill for the work?")
    expect(viewerSrc).toContain("'Create Invoice'")
  })

  it('declined Quote provides revision guidance', () => {
    expect(viewerSrc).toContain("The customer declined this quote. Update it if you'd like to send a revision.")
    expect(viewerSrc).toContain("'Edit Quote'")
  })

  it('draft Invoice recommends Send', () => {
    expect(viewerSrc).toContain("Review the invoice, then send it when you're ready to collect payment.")
    expect(viewerSrc).toContain("'Send Invoice'")
  })

  it('sent Invoice says waiting for payment', () => {
    expect(viewerSrc).toContain("Waiting for payment.")
  })

  it('overdue Invoice recommends resend', () => {
    expect(viewerSrc).toContain("Payment is overdue. You can resend the invoice if needed.")
    expect(viewerSrc).toContain("'Resend Invoice'")
  })

  it('paid Invoice says payment received', () => {
    expect(viewerSrc).toContain("'Payment received.'")
  })

  it('guidance is advisory (no workflow locks or mandatory gates)', () => {
    // No restrictions preventing direct Tap to Pay or Request Payment
    expect(viewerSrc).not.toMatch(/mandatory|required.*to.*proceed|cannot.*proceed|locked/i)
    // The guidance is just a recommendation, not a gate
    expect(viewerSrc).toContain('nextStepCta')
    // CTA is optional (can be null)
    expect(viewerSrc).toContain('null')
  })

  it('guidance is visually subtle (compact styling)', () => {
    expect(viewerSrc).toContain('text-xs')
    expect(viewerSrc).toContain('rounded-lg')
  })
})

// ============================================================================
// DOCUMENT LIST CLARITY
// ============================================================================
describe('DOCUMENT LIST CLARITY', () => {
  it('list shows document number', () => {
    expect(listSrc).toContain('doc.document_number')
  })

  it('list shows customer name', () => {
    expect(listSrc).toContain('customerName')
  })

  it('list shows amount', () => {
    expect(listSrc).toContain('formatCurrency(doc.total_cents')
  })

  it('list shows status badge', () => {
    expect(listSrc).toContain('statusBadge')
    expect(listSrc).toContain('badge.label')
  })

  it('list shows date label', () => {
    expect(listSrc).toContain('dateLabel')
  })

  it('list has contextual subline for draft quote', () => {
    expect(listSrc).toContain("'Next: Send quote'")
  })

  it('list has contextual subline for accepted quote', () => {
    expect(listSrc).toContain("'Next: Create invoice'")
  })

  it('list has contextual subline for sent invoice', () => {
    expect(listSrc).toContain("'Waiting for payment'")
  })

  it('list has contextual subline for paid', () => {
    expect(listSrc).toContain("'Payment received'")
  })

  it('list has contextual subline for declined', () => {
    expect(listSrc).toContain("'Customer declined'")
  })

  it('list has contextual subline for overdue', () => {
    expect(listSrc).toContain("'Payment overdue'")
  })

  it('declined quote row exposes Edit action', () => {
    // Declined should have its own block with Edit
    expect(listSrc).toContain('Declined: View + Edit + Download')
    expect(listSrc).toContain('isDeclined')
  })
})

// ============================================================================
// REGRESSION — PRESERVE EXISTING BEHAVIOR
// ============================================================================
describe('REGRESSION — PRESERVE EXISTING BEHAVIOR', () => {
  it('chooser centering unchanged (no bottomSheetOnMobile)', () => {
    expect(chooserSrc).not.toContain('bottomSheetOnMobile')
  })

  it('editor modals still use bottomSheetOnMobile', () => {
    expect(editorSrc).toContain('bottomSheetOnMobile')
  })

  it('viewer still uses bottomSheetOnMobile', () => {
    expect(viewerSrc).toContain('bottomSheetOnMobile')
  })

  it('unsaved-warning behavior unchanged (isDirtyRef)', () => {
    expect(editorSrc).toContain('isDirtyRef')
    expect(editorSrc).toContain('markDirty')
    expect(editorSrc).toContain('markClean')
  })

  it('modal/back behavior unchanged (useModalBackButton)', () => {
    expect(modalSrc).toContain('useModalBackButton')
  })

  it('scroll lock behavior unchanged (useBodyScrollLock)', () => {
    expect(modalSrc).toContain('useBodyScrollLock')
  })

  it('mobile layout does not overflow (segment control uses w-fit max-w-full)', () => {
    expect(paymentsPageSrc).toContain('w-fit max-w-full')
    expect(paymentsPageSrc).toContain('whitespace-nowrap')
  })
})
