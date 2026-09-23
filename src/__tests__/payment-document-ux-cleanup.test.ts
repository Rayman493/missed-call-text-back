/**
 * PRE-SUBMISSION PAYMENT & DOCUMENT UX CLEANUP
 *
 * A. Toast stacking/visibility: the toast was mounted inline inside the
 *    dashboard <main> (relative z-10 stacking context), so portal-mounted
 *    modals (document.body, z-60) always painted above it. The toast now
 *    portals to document.body where z-100 actually wins.
 *
 * B. Feedback channel: action results used an in-flow top-of-page banner —
 *    invisible when scrolled down and unreachable behind modals. All action
 *    feedback now uses the existing toast system (no second system added).
 *
 * C. Payment cancellation: success now closes the confirm dialog AND the
 *    parent Edit Payment modal, refreshes silently (no scroll jump), and
 *    confirms via toast. Failure keeps both dialogs and shows the real error.
 *
 * D. Document list stability: save/resend merge by id (no full refetch), the
 *    type filter follows the saved document, and scroll position is kept.
 *
 * E. Editor footer: primary buttons wrap to full-width lines on narrow mobile
 *    instead of truncating "Create & Send" to "Create & S...".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (rel: string) =>
  readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n')

const toastSrc = read('components/Toast.tsx')
const paymentsSrc = read('app/dashboard/payments/page.tsx')
const editorSrc = read('components/billing/BillingEditorModal.tsx')
const shellSrc = read('components/layout/DashboardShell.tsx')
const modalSrc = read('components/ui/Modal.tsx')

// ---------------------------------------------------------------------------
// A. Toast renders above modals, in the viewport
// ---------------------------------------------------------------------------
describe('A. Toast visibility above modals', () => {
  it('Toast portals to document.body, escaping page stacking contexts', () => {
    expect(toastSrc).toContain("from 'react-dom'")
    expect(toastSrc).toMatch(/createPortal\(toastContent, document\.body\)/)
    // The dashboard main element caps inline children at z-10 — the reason
    // an inline z-[100] toast lost to body-level z-[60] modals.
    expect(shellSrc).toMatch(/relative z-10/)
    expect(modalSrc).toContain('createPortal(modalContent, document.body)')
    expect(modalSrc).toContain('z-[60]')
  })

  it('ToastContainer portals to document.body too', () => {
    expect(toastSrc).toMatch(/createPortal\(container, document\.body\)/)
  })

  it('toast stays viewport-anchored with safe-area-aware top positioning', () => {
    expect(toastSrc).toContain('fixed left-4 right-4')
    expect(toastSrc).toContain('env(safe-area-inset-top)')
    expect(toastSrc).toContain('z-[100]') // > modal z-60 at root context
  })
})

// ---------------------------------------------------------------------------
// B. Single feedback system; dedupe; required actions wired
// ---------------------------------------------------------------------------
describe('B. All action feedback uses the existing toast system', () => {
  it('the in-flow SuccessBanner is removed from the payments page', () => {
    expect(paymentsSrc).not.toContain('SuccessBanner')
    expect(paymentsSrc).not.toContain('successMessage')
    expect(paymentsSrc).toContain('<ToastContainer toasts={toasts}')
  })

  it('showToast dedupes identical pending messages (no stacked duplicates)', () => {
    expect(paymentsSrc).toMatch(
      /setToasts\(prev => \[\.\.\.prev\.filter\(t => !\(t\.message === message && t\.type === type\)\), \{ id, message, type \}\]\)/
    )
  })

  it('save quote/invoice reports via toast', () => {
    expect(paymentsSrc).toMatch(/showToast\(savedDoc\.status === 'sent'[\s\S]*?'success'\)/)
  })

  it('resend/send document reports via toast (unchanged, still gated on res.ok)', () => {
    expect(paymentsSrc).toContain("showToast(doc.sent_at ? `${label} resent to ${customerName}.` : `${label} sent to ${customerName}.`, 'success')")
    // The success toast only fires inside the res.ok branch — error branch shows the real error
    const sendIdx = paymentsSrc.indexOf('const handleSendBillingDoc')
    const okIdx = paymentsSrc.indexOf('if (res.ok)', sendIdx)
    const successIdx = paymentsSrc.indexOf("resent to ${customerName}.", okIdx)
    const errIdx = paymentsSrc.indexOf("'Failed to send document. Please try again.'", successIdx)
    expect(okIdx).toBeGreaterThan(sendIdx)
    expect(successIdx).toBeGreaterThan(okIdx)
    expect(errIdx).toBeGreaterThan(successIdx)
  })

  it('download PDF reports via toast when the viewer is closed (modal-local when open)', () => {
    expect(paymentsSrc).toMatch(/onSuccess: \(message\) => \{[\s\S]*?showToast\(message, 'success'\)/)
    expect(paymentsSrc).toMatch(/onError: \(message\) => \{[\s\S]*?showToast\(message, 'error'\)/)
    expect(paymentsSrc).toContain('setBillingViewerFeedback({ type: \'success\', message })')
  })

  it('copy payment link reports success and failure', () => {
    const copyIdx = paymentsSrc.indexOf('const copyPaymentLink')
    const block = paymentsSrc.slice(copyIdx, copyIdx + 500)
    expect(block).toContain("showToast('Payment link copied.', 'success')")
    expect(block).toMatch(/showToast\('Couldn\\'t copy the link\. Please try again\.', 'error'\)/)
  })
})

// ---------------------------------------------------------------------------
// C. Payment cancellation modal behavior
// ---------------------------------------------------------------------------
describe('C. Payment cancellation closes both dialogs on success only', () => {
  it('success path closes the confirm dialog and the edit modal before refetch', () => {
    const cancelIdx = paymentsSrc.indexOf('const handleCancelPayment')
    const block = paymentsSrc.slice(cancelIdx, cancelIdx + 2200)
    const confirmIdx = block.indexOf('setShowCancelConfirm(false)')
    const editIdx = block.indexOf('handleCloseEditModal()')
    const toastIdx = block.indexOf("showToast('Payment request cancelled.', 'success')")
    const refetchIdx = block.indexOf('await fetchPayments()')
    expect(confirmIdx).toBeGreaterThan(-1)
    expect(editIdx).toBeGreaterThan(confirmIdx)
    expect(toastIdx).toBeGreaterThan(editIdx)
    expect(refetchIdx).toBeGreaterThan(toastIdx)
  })

  it('failure path keeps the dialogs open and toasts the real error', () => {
    const cancelIdx = paymentsSrc.indexOf('const handleCancelPayment')
    const block = paymentsSrc.slice(cancelIdx, cancelIdx + 2400)
    const catchIdx = block.indexOf('} catch (err)')
    expect(catchIdx).toBeGreaterThan(-1)
    const catchBlock = block.slice(catchIdx)
    expect(catchBlock).toMatch(/showToast\(err instanceof Error \? err\.message : 'Failed to cancel payment request', 'error'\)/)
    // No modal-closing calls inside catch
    expect(catchBlock).not.toContain('setShowCancelConfirm(false)')
    expect(catchBlock).not.toContain('handleCloseEditModal')
  })

  it('duplicate submissions are prevented while cancelling', () => {
    expect(paymentsSrc).toContain('disabled={isCancelling}')
    expect(paymentsSrc).toContain("isCancelling ? 'Cancelling...' : 'Cancel Payment'")
  })
})

// ---------------------------------------------------------------------------
// D. List position, filters and scroll stability
// ---------------------------------------------------------------------------
describe('D. Document/payment list stability', () => {
  it('document save merges by id — no full refetch, no scroll reset', () => {
    const savedIdx = paymentsSrc.indexOf('const handleBillingSaved')
    const block = paymentsSrc.slice(savedIdx, savedIdx + 2600)
    expect(block).toContain('setBillingDocuments((prev) => {')
    expect(block).not.toContain('fetchBillingDocuments(')
    expect(block).not.toContain('window.scrollTo')
  })

  it('the type filter follows the saved document so it stays visible', () => {
    expect(paymentsSrc).toMatch(/savedDoc\?\.document_type === 'quote' && billingTypeFilter !== 'quote'/)
    expect(paymentsSrc).toMatch(/savedDoc\?\.document_type === 'invoice' && billingTypeFilter !== 'invoice'/)
  })

  it('resend merges the returned document by id instead of refetching', () => {
    expect(paymentsSrc).toContain('setBillingDocuments((prev) => prev.map((d) => d.id === updated.id')
  })

  it('payment refetch is silent — initial-loading flag is not re-set', () => {
    const fetchIdx = paymentsSrc.indexOf('const fetchPayments')
    const block = paymentsSrc.slice(fetchIdx, fetchIdx + 1400)
    expect(block).not.toContain('setLoading(true)')
    expect(block).toContain('setLoading(false)') // only the initial-load finally
  })

  it('edit-modal close restores the pre-edit scroll position', () => {
    expect(paymentsSrc).toContain('window.scrollTo(0, scrollPositionBeforeEdit)')
    expect(paymentsSrc).toContain('setScrollPositionBeforeEdit(window.pageYOffset)')
  })
})

// ---------------------------------------------------------------------------
// E. Editor footer readable at narrow widths
// ---------------------------------------------------------------------------
describe('E. Editor footer — full labels on narrow mobile', () => {
  it('primary buttons wrap to full-width lines instead of truncating', () => {
    expect(editorSrc).toContain('flex flex-wrap items-center gap-1.5 sm:gap-2')
    expect(editorSrc).toContain('flex-1 min-w-[7.5rem]')
  })

  it('full labels are preserved verbatim', () => {
    expect(editorSrc).toContain('Create & Send')
    expect(editorSrc).toContain('Create Draft')
    expect(editorSrc).toContain('Save Changes')
  })

  it('desktop row layout and pending/disabled states are unchanged', () => {
    expect(editorSrc).toContain('h-11')
    expect(editorSrc).toContain('disabled={pendingAction !== null}')
    expect(editorSrc).toContain("pendingAction === 'send'")
    expect(editorSrc).toContain("pendingAction === 'draft'")
  })
})
