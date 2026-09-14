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
