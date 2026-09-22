import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const editor = readFileSync('src/components/billing/BillingEditorModal.tsx', 'utf8')
const viewer = readFileSync('src/components/billing/BillingViewerModal.tsx', 'utf8')
const renderer = readFileSync('src/components/billing/DocumentRenderer.tsx', 'utf8')
const modal = readFileSync('src/components/ui/Modal.tsx', 'utf8')
const paymentsPage = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8')

const slice = (src: string, from: string, to: string) => {
  const a = src.indexOf(from)
  const b = src.indexOf(to, a + from.length)
  return a === -1 || b === -1 ? '' : src.slice(a, b)
}

describe('A — quote/invoice create footer single row', () => {
  const footer = slice(editor, 'const footer = (', 'const return')

  it('renders all four actions in one flex row', () => {
    const f = slice(editor, 'const footer = (', 'return (')
    expect(f).toContain('flex items-center gap-1.5')
    expect(f).not.toContain('flex-col-reverse')
    expect(f).not.toContain('flex-col gap-2')
  })

  it('order: Preview icon, Cancel, Create Draft, Create & Send', () => {
    const f = slice(editor, 'const footer = (', 'return (')
    // Anchor on the button handlers — they appear in DOM order
    const eye = f.indexOf('onClick={handlePreview}')
    const cancel = f.indexOf('onClick={handleAttemptClose}')
    const draft = f.indexOf('handleSaveDraft(false)')
    const send = f.indexOf('setShowCreateAndSendConfirm(true)')
    expect(eye).toBeGreaterThan(-1)
    expect(cancel).toBeGreaterThan(-1)
    expect(draft).toBeGreaterThan(-1)
    expect(send).toBeGreaterThan(-1)
    expect(eye).toBeLessThan(cancel)
    expect(cancel).toBeLessThan(draft)
    expect(draft).toBeLessThan(send)
    // Visible labels present
    expect(f).toMatch(/>\s*Cancel\s*<\/button>/)
    expect(f).toContain('Create Draft')
    expect(f).toContain('Create & Send')
  })

  it('Preview is an accessible icon-only button', () => {
    const f = slice(editor, 'const footer = (', 'return (')
    expect(f).toContain('aria-label="Preview"')
    expect(f).toContain('title="Preview"')
    expect(f).toContain('h-11 w-11')
    expect(f).toContain('<Eye className')
  })

  it('narrow-width safety: compact text, nowrap labels, truncate fallback', () => {
    const f = slice(editor, 'const footer = (', 'return (')
    expect(f).toContain('text-xs sm:text-sm')
    expect(f).toContain('whitespace-nowrap')
    expect(f).toContain('truncate')
    expect(f).toContain('min-w-0')
  })

  it('keeps safe-area bottom padding and preserves handlers/loading states', () => {
    const f = slice(editor, 'const footer = (', 'return (')
    expect(f).toContain('env(safe-area-inset-bottom)')
    expect(f).toContain('handlePreview')
    expect(f).toContain('handleAttemptClose')
    expect(f).toContain('handleSaveDraft(false)')
    expect(f).toContain('setShowCreateAndSendConfirm(true)')
    expect(f).toContain("pendingAction === 'draft'")
    expect(f).toContain("pendingAction === 'send'")
    expect(f).toContain('animate-spin')
  })
})

describe('B — document modal download feedback', () => {
  it('viewer accepts modal-local feedback prop', () => {
    expect(viewer).toContain('downloadFeedback?:')
    expect(viewer).toContain("type: 'success' | 'error'")
  })

  it('feedback renders inside the modal footer area (visible without scrolling)', () => {
    const footer = slice(viewer, 'const footer = (', 'return (')
    expect(footer).toContain('downloadFeedback && (')
    expect(footer).toContain('role="status"')
    expect(footer).toContain('downloadFeedback.message')
  })

  it('download button resets state and sticky touch highlight', () => {
    const btn = slice(viewer, 'onClick={onDownload}', 'Download PDF')
    expect(btn).toContain('disabled={isDownloading}')
    expect(btn).toContain('onTouchEnd')
    expect(btn).toContain('blur()')
    expect(viewer).toContain('Preparing PDF…')
  })

  it('page routes feedback to the modal when the viewer is open for that doc', () => {
    const handler = slice(paymentsPage, 'const handleDownloadBillingDoc', 'const handleSendBillingDoc')
    expect(handler).toContain('viewerOpenForDoc')
    expect(handler).toContain("setBillingViewerFeedback({ type: 'success', message })")
    expect(handler).toContain("setBillingViewerFeedback({ type: 'error', message })")
    // page banner still used when viewer is closed
    expect(handler).toContain('setSuccessMessage(message)')
    expect(handler).toContain('setError(message)')
    // spinner always resets
    expect(handler).toContain('setBillingDownloadingId(null)')
  })

  it('clears modal feedback on open, close, and new attempt', () => {
    expect(paymentsPage).toMatch(/setViewingBillingDoc\(doc\)\s*\r?\n\s*setBillingViewerFeedback\(null\)/)
    const closeBlock = slice(paymentsPage, 'onClose={() => {', 'documentId={viewingBillingDoc')
    expect(closeBlock).toContain('setBillingViewerFeedback(null)')
    const handler = slice(paymentsPage, 'const handleDownloadBillingDoc', 'const handleSendBillingDoc')
    expect(handler).toContain('if (viewerOpenForDoc) setBillingViewerFeedback(null)')
  })

  it('passes downloadFeedback to BillingViewerModal', () => {
    expect(paymentsPage).toContain('downloadFeedback={billingViewerFeedback}')
  })

  it('deliverBillingPdf messages are platform-accurate (no false Documents claims)', () => {
    const lib = readFileSync('src/lib/billing/download-billing-pdf.ts', 'utf8')
    // "saved to Documents" only when the native Documents write succeeded
    const saved = slice(lib, 'saved: true', 'saved: false')
    expect(lib).toContain('saved to Documents')
    expect(lib).toContain('PDF ready to save') // share-sheet fallback wording
    expect(lib).toContain('downloaded') // web wording
  })
})

describe('C — document presentation alignment', () => {
  it('metadata uses a deliberate 2-column grid (labels + right-aligned values)', () => {
    const meta = slice(renderer, 'Customer + dates', 'Line items table')
    expect(meta).toContain('grid grid-cols-[auto_minmax(0,auto)]')
    expect(meta).toContain('justify-between sm:justify-end')
    expect(meta).toContain('items-baseline')
    expect(meta).toContain('Issue Date')
    expect(meta).toContain('Valid Until')
    expect(meta).toContain('Due Date')
  })

  it('metadata values can wrap safely (no forced nowrap on dates)', () => {
    const meta = slice(renderer, 'grid grid-cols-[auto_minmax(0,auto)]', 'Line items table')
    expect(meta).toContain('text-right break-words min-w-0')
    // value spans must not be whitespace-nowrap
    const valueSpans = meta.match(/text-sm text-slate-700 [^"]*/g) || []
    for (const cls of valueSpans) expect(cls).not.toContain('whitespace-nowrap')
  })

  it('line items keep right-aligned numeric columns and totals justify-between', () => {
    expect(renderer).toContain('text-right py-2 px-1 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Qty')
    expect(renderer).toContain('whitespace-nowrap">Amount')
    const totals = slice(renderer, '{/* Totals */}', '{/* Notes */}')
    expect(totals).toContain('flex justify-between')
    expect(totals).toContain('border-t-2 border-slate-300')
  })

  it('customer block wraps long names/addresses', () => {
    const billTo = slice(renderer, 'Quote To', 'sm:text-right')
    expect(billTo).toContain('break-words')
  })
})

describe('D — quote/invoice action feedback', () => {
  it('send/resend emits a visible toast', () => {
    const send = slice(paymentsPage, 'const handleSendBillingDoc', 'const handleConvertBillingDoc')
    expect(send).toMatch(/showToast\(doc\.sent_at \? `\$\{label\} resent to/)
    expect(send).toContain("showToast(json.error || 'Failed to send document. Please try again.', 'error')")
  })

  it('delete emits success/error toast and preserves confirmation upstream', () => {
    const del = slice(paymentsPage, 'const handleDeleteBillingDoc', 'const handleDownloadBillingDoc')
    expect(del).toContain("showToast(`${label} deleted.`, 'success')")
    expect(del).toContain("'error'")
    expect(del).toContain('Confirmation is handled by the BillingDocumentList')
  })

  it('convert emits toast and opens the resulting invoice', () => {
    const convert = slice(paymentsPage, 'const handleConvertBillingDoc', 'handleViewBillingDoc')
    expect(convert).toContain('showToast(`Invoice')
    expect(paymentsPage).toContain('setViewingBillingDoc(invoice)')
  })

  it('save surfaces feedback via handleBillingSaved after confirmed save', () => {
    const saved = slice(paymentsPage, 'const handleBillingSaved', 'const showToast')
    expect(saved).toContain('setSuccessMessage')
    expect(saved).toContain("savedDoc.status === 'sent'")
  })

  it('View opens the document without emitting a success toast', () => {
    const view = slice(paymentsPage, 'const handleViewBillingDoc', 'const handleLeadSelected')
    expect(view).not.toContain('showToast')
    expect(view).not.toContain('setSuccessMessage')
  })

  it('all async buttons settle to idle state — finally blocks or onFinally callback', () => {
    const names = ['handleDeleteBillingDoc', 'handleSendBillingDoc', 'handleConvertBillingDoc']
    for (const name of names) {
      const start = paymentsPage.indexOf(`const ${name}`)
      expect(start).toBeGreaterThan(-1)
      const rest = paymentsPage.slice(start)
      const nextConst = rest.indexOf('const handle', 10)
      const body = nextConst === -1 ? rest : rest.slice(0, nextConst)
      expect(body).toContain('finally')
    }
    // Download resets its spinner via deliverBillingPdf's onFinally callback
    const dl = slice(paymentsPage, 'const handleDownloadBillingDoc', 'const handleSendBillingDoc')
    expect(dl).toContain('onFinally: () => setBillingDownloadingId(null)')
  })
})

describe('E/F — New Payment Request modal chrome', () => {
  it('fullScreen card covers the entire viewport — no exposed page chrome', () => {
    expect(modal).toContain("fullScreen")
    expect(modal).toContain('h-[100dvh] max-h-none max-w-none rounded-none')
  })

  it('non-fullScreen modals keep the centered card treatment', () => {
    expect(modal).toContain('max-w-lg max-h-[var(--modal-max-height)]')
    expect(modal).toContain('rounded-2xl border border-border/50')
  })

  it('backdrop remains a fixed full-viewport scrim', () => {
    expect(modal).toContain('fixed inset-0 z-[60]')
    expect(modal).toContain('bg-black/50 backdrop-blur-sm')
  })

  it('fullScreen header keeps base padding below the status bar (not inset-only)', () => {
    expect(modal).toContain("calc(env(safe-area-inset-top) + 0.75rem)")
    // must not collapse to bare inset (0 when inset is absent)
    expect(modal).not.toContain("paddingTop: 'env(safe-area-inset-top)'")
  })

  it('modal history/scroll-lock ownership unchanged', () => {
    expect(modal).toContain('useModalBackButton({ isOpen, onClose })')
    expect(modal).toContain('useBodyScrollLock(isOpen,')
    expect(modal).toContain('data-scroll-lock-allow')
  })

  it('PaymentsNewRequestModal uses the shared fullScreen Modal', () => {
    const req = readFileSync('src/components/payments/PaymentsNewRequestModal.tsx', 'utf8')
    expect(req).toContain('fullScreen')
    expect(req).toContain("from '@/components/ui/Modal'")
    expect(req).toContain('title="New Payment Request"')
  })
})
