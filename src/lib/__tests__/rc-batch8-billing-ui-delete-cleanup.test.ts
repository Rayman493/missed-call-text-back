/**
 * RC Batch 8 — Final Billing UI Consistency + Delete Cleanup
 *
 * Regression tests for:
 * A. Single delete confirmation (no double-confirm)
 * B. Consistent list-card actions across statuses
 * C. Saved viewer action consistency
 * D. MMS recover-url endpoint auth/ownership
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')
const billingListSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
const billingViewerSrc = readSrc('src/components/billing/BillingViewerModal.tsx')
const recoverUrlRouteSrc = readSrc('src/app/api/mms-media/recover-url/route.ts')
const mmsServeRouteSrc = readSrc('src/app/api/mms-media/serve/route.ts')
const mmsMediaTokenSrc = readSrc('src/lib/mms-media-token.ts')

// ============================================================================
// A. SINGLE DELETE CONFIRMATION (NO DOUBLE-CONFIRM)
// ============================================================================
describe('A. SINGLE DELETE CONFIRMATION', () => {
  it('1. BillingDocumentList has custom Modal-based confirmation', () => {
    expect(billingListSrc).toContain('deleteTarget')
    expect(billingListSrc).toContain('handleConfirmDelete')
    expect(billingListSrc).toContain('<Modal')
    expect(billingListSrc).toContain('Delete quote?')
    expect(billingListSrc).toContain('Delete invoice?')
  })

  it('2. no window.confirm / browser-native confirm in billing delete path', () => {
    // The payments page handler must NOT call confirm()
    const deleteHandlerMatch = paymentsPageSrc.match(
      /handleDeleteBillingDoc = async \(doc[\s\S]*?\n  \}/
    )
    expect(deleteHandlerMatch).toBeTruthy()
    // Strip comments before checking for confirm() calls
    const codeOnly = deleteHandlerMatch![0].replace(/\/\/[^\n]*/g, '')
    expect(codeOnly).not.toMatch(/\bconfirm\s*\(/)
    expect(codeOnly).not.toMatch(/window\.confirm/)
  })

  it('3. delete handler comment documents the single-confirmation contract', () => {
    expect(paymentsPageSrc).toContain('Confirmation is handled by the BillingDocumentList')
    expect(paymentsPageSrc).toContain('Do NOT add a second browser-native confirm()')
  })

  it('4. Cancel in Modal performs no DELETE (setDeleteTarget(null) only)', () => {
    const cancelMatch = billingListSrc.match(
      /onClick=\{\(\) => setDeleteTarget\(null\)\}[\s\S]*?Cancel/
    )
    expect(cancelMatch).toBeTruthy()
  })

  it('5. Confirm in Modal performs exactly one onDelete call', () => {
    const confirmMatch = billingListSrc.match(
      /handleConfirmDelete = \(\) => \{([\s\S]*?)\n  \}/
    )
    expect(confirmMatch).toBeTruthy()
    expect(confirmMatch![1]).toContain('onDelete(deleteTarget)')
    // Ensure only one onDelete call
    const onDeleteCount = (confirmMatch![1].match(/onDelete\(/g) || []).length
    expect(onDeleteCount).toBe(1)
  })

  it('6. delete button does not open card/viewer (setDeleteTarget, not onView)', () => {
    const deleteBtnMatch = billingListSrc.match(
      /onClick=\{\(\) => setDeleteTarget\(doc\)\}/
    )
    expect(deleteBtnMatch).toBeTruthy()
    // The delete button should NOT call onView or onOpen
    expect(deleteBtnMatch![0]).not.toContain('onView')
    expect(deleteBtnMatch![0]).not.toContain('onOpen')
  })

  it('7. no duplicate Cheers/toast on delete (single success path)', () => {
    // The delete handler does not show a success toast — it just removes
    // the document from the list. No duplicate feedback.
    const deleteHandlerMatch = paymentsPageSrc.match(
      /handleDeleteBillingDoc = async \(doc[\s\S]*?\n  \}/
    )
    expect(deleteHandlerMatch).toBeTruthy()
    // Should not contain setSuccessMessage or toast in the delete handler
    expect(deleteHandlerMatch![0]).not.toContain('setSuccessMessage')
    expect(deleteHandlerMatch![0]).not.toContain('Cheers')
  })
})

// ============================================================================
// B. CONSISTENT LIST-CARD ACTIONS
// ============================================================================
describe('B. CONSISTENT LIST-CARD ACTIONS', () => {
  it('8. Draft Quote/Invoice actions: Edit + Download + Delete (in order)', () => {
    const draftBlock = billingListSrc.match(
      /\{isDraft && \(([\s\S]*?)\n              \)\}/
    )
    expect(draftBlock).toBeTruthy()
    const block = draftBlock![1]
    // Order: Edit first, Download second, Delete last
    const editIdx = block.indexOf("onOpen(doc)")
    const downloadIdx = block.indexOf("onDownload(doc)")
    const deleteIdx = block.indexOf("setDeleteTarget(doc)")
    expect(editIdx).toBeGreaterThan(-1)
    expect(downloadIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeGreaterThan(-1)
    expect(editIdx).toBeLessThan(downloadIdx)
    expect(downloadIdx).toBeLessThan(deleteIdx)
  })

  it('9. Sent Quote actions: Resend + Download + View (in order)', () => {
    const sentQuoteBlock = billingListSrc.match(
      /\{isSent && isQuote && \(([\s\S]*?)\n              \)\}/
    )
    expect(sentQuoteBlock).toBeTruthy()
    const block = sentQuoteBlock![1]
    const resendIdx = block.indexOf("onSend(doc)")
    const downloadIdx = block.indexOf("onDownload(doc)")
    const viewIdx = block.indexOf("onView(doc)")
    expect(resendIdx).toBeGreaterThan(-1)
    expect(downloadIdx).toBeGreaterThan(-1)
    expect(viewIdx).toBeGreaterThan(-1)
    expect(resendIdx).toBeLessThan(downloadIdx)
    expect(downloadIdx).toBeLessThan(viewIdx)
  })

  it('10. Accepted Quote actions: Convert + Download + View (in order)', () => {
    const acceptedBlock = billingListSrc.match(
      /\{isAccepted && \(([\s\S]*?)\n              \)\}/
    )
    expect(acceptedBlock).toBeTruthy()
    const block = acceptedBlock![1]
    const convertIdx = block.indexOf("onConvert(doc)")
    const downloadIdx = block.indexOf("onDownload(doc)")
    const viewIdx = block.indexOf("onView(doc)")
    expect(convertIdx).toBeGreaterThan(-1)
    expect(downloadIdx).toBeGreaterThan(-1)
    expect(viewIdx).toBeGreaterThan(-1)
    expect(convertIdx).toBeLessThan(downloadIdx)
    expect(downloadIdx).toBeLessThan(viewIdx)
  })

  it('11. Declined actions: Edit + Download + View (in order)', () => {
    const declinedBlock = billingListSrc.match(
      /\{isDeclined && \(([\s\S]*?)\n              \)\}/
    )
    expect(declinedBlock).toBeTruthy()
    const block = declinedBlock![1]
    const editIdx = block.indexOf("onOpen(doc)")
    const downloadIdx = block.indexOf("onDownload(doc)")
    const viewIdx = block.indexOf("onView(doc)")
    expect(editIdx).toBeGreaterThan(-1)
    expect(downloadIdx).toBeGreaterThan(-1)
    expect(viewIdx).toBeGreaterThan(-1)
    expect(editIdx).toBeLessThan(downloadIdx)
    expect(downloadIdx).toBeLessThan(viewIdx)
  })

  it('12. Sent Invoice actions: Resend + Download + View (in order)', () => {
    const sentInvoiceBlock = billingListSrc.match(
      /\{isSent && !isQuote && \(([\s\S]*?)\n              \)\}/
    )
    expect(sentInvoiceBlock).toBeTruthy()
    const block = sentInvoiceBlock![1]
    const resendIdx = block.indexOf("onSend(doc)")
    const downloadIdx = block.indexOf("onDownload(doc)")
    const viewIdx = block.indexOf("onView(doc)")
    expect(resendIdx).toBeGreaterThan(-1)
    expect(downloadIdx).toBeGreaterThan(-1)
    expect(viewIdx).toBeGreaterThan(-1)
    expect(resendIdx).toBeLessThan(downloadIdx)
    expect(downloadIdx).toBeLessThan(viewIdx)
  })

  it('13. Paid/Cancelled actions: Download + View (in order)', () => {
    const paidBlock = billingListSrc.match(
      /\{\(isPaid \|\| isCancelled\) && \(([\s\S]*?)\n              \)\}/
    )
    expect(paidBlock).toBeTruthy()
    const block = paidBlock![1]
    const downloadIdx = block.indexOf("onDownload(doc)")
    const viewIdx = block.indexOf("onView(doc)")
    expect(downloadIdx).toBeGreaterThan(-1)
    expect(viewIdx).toBeGreaterThan(-1)
    expect(downloadIdx).toBeLessThan(viewIdx)
    // No destructive actions for paid/cancelled
    expect(block).not.toContain('setDeleteTarget')
    expect(block).not.toContain('onOpen')
  })

  it('14. all action buttons share w-8 h-8 dimensions', () => {
    // Every action button should use w-8 h-8 flex items-center justify-center
    const buttonMatches = billingListSrc.match(/className="w-8 h-8 flex items-center justify-center[^"]*"/g)
    expect(buttonMatches).toBeTruthy()
    expect(buttonMatches!.length).toBeGreaterThan(10) // many action buttons
    buttonMatches!.forEach(cls => {
      expect(cls).toContain('w-8 h-8')
      expect(cls).toContain('flex items-center justify-center')
    })
  })

  it('15. destructive Delete is visually distinct (red hover)', () => {
    const deleteButtonMatch = billingListSrc.match(
      /setDeleteTarget\(doc\)[\s\S]*?hover:text-red-600/
    )
    expect(deleteButtonMatch).toBeTruthy()
  })

  it('16. all action icons use w-4 h-4 (consistent icon size)', () => {
    const iconMatches = billingListSrc.match(/className="w-4 h-4"/g)
    expect(iconMatches).toBeTruthy()
    expect(iconMatches!.length).toBeGreaterThan(10)
  })

  it('17. nested actions do not trigger card click (siblings, not nested)', () => {
    // The card body is a <button> and actions are in a sibling <div>.
    // Action buttons are NOT inside the card-body button, so no bubbling.
    // Verify the action div comes AFTER the info button closes (sibling, not child).
    const infoButtonClose = billingListSrc.indexOf('</button>')
    const actionDivIdx = billingListSrc.indexOf('className="flex items-center gap-1 flex-shrink-0"')
    expect(infoButtonClose).toBeGreaterThan(-1)
    expect(actionDivIdx).toBeGreaterThan(-1)
    // The action div must come after the info button closes
    expect(actionDivIdx).toBeGreaterThan(infoButtonClose)
    // Verify no action button is nested inside the info button
    const infoButtonSection = billingListSrc.substring(0, infoButtonClose)
    const actionDivSection = billingListSrc.substring(infoButtonClose, actionDivIdx)
    // The section between </button> and the action div should NOT contain action handlers
    // (only comments and whitespace)
    expect(actionDivSection).not.toContain('setDeleteTarget')
    expect(actionDivSection).not.toContain('onDownload')
    expect(actionDivSection).not.toContain('onSend')
  })

  it('18. mobile and desktop use same semantic actions (no mobile-specific branches)', () => {
    // The BillingDocumentList does not branch on screen size for actions
    expect(billingListSrc).not.toMatch(/sm:hidden.*Delete/)
    expect(billingListSrc).not.toMatch(/hidden sm:flex.*Delete/)
  })
})

// ============================================================================
// C. SAVED VIEWER ACTION CONSISTENCY
// ============================================================================
describe('C. SAVED VIEWER ACTION CONSISTENCY', () => {
  it('19. Draft Quote next-step guidance: "Review the quote, then send"', () => {
    expect(billingViewerSrc).toContain("Review the quote, then send it when you're ready.")
    expect(billingViewerSrc).toContain("Send Quote")
  })

  it('20. Sent Quote guidance: "Waiting for your customer"', () => {
    expect(billingViewerSrc).toContain("Waiting for your customer to review the quote.")
  })

  it('21. Accepted Quote: Create Invoice available', () => {
    expect(billingViewerSrc).toContain("Ready to bill for the work?")
    expect(billingViewerSrc).toContain("Create Invoice")
    expect(billingViewerSrc).toContain("showConvert = isQuote && isAccepted")
  })

  it('22. Draft Invoice guidance: "Review the invoice, then send"', () => {
    expect(billingViewerSrc).toContain("Review the invoice, then send it when you're ready to collect payment.")
    expect(billingViewerSrc).toContain("Send Invoice")
  })

  it('23. Sent/Overdue Invoice guidance correct', () => {
    expect(billingViewerSrc).toContain("Waiting for payment.")
    expect(billingViewerSrc).toContain("Payment is overdue. You can resend the invoice if needed.")
    expect(billingViewerSrc).toContain("Resend Invoice")
  })

  it('24. Paid Invoice shows payment-received state', () => {
    expect(billingViewerSrc).toContain("Payment received.")
  })

  it('25. no mandatory workflow restriction introduced (actions are available by status)', () => {
    // The viewer shows actions based on status but does not block/gate the user
    // from proceeding — it's guidance, not enforcement.
    expect(billingViewerSrc).toContain('showEdit = isDraft || isDeclined')
    expect(billingViewerSrc).toContain('showSend = isDraft')
    expect(billingViewerSrc).toContain('showResend = isSent || isOverdue')
    expect(billingViewerSrc).toContain('showDownload = true')
  })
})

// ============================================================================
// D. MMS RECOVER-URL ENDPOINT AUTH/OWNERSHIP
// ============================================================================
describe('D. MMS RECOVER-URL AUTH/OWNERSHIP', () => {
  it('26. recover-url requires authentication (session check)', () => {
    expect(recoverUrlRouteSrc).toContain('supabase.auth.getUser()')
    expect(recoverUrlRouteSrc).toContain('Authentication required')
    expect(recoverUrlRouteSrc).toContain('status: 401')
  })

  it('27. recover-url validates ownership (business_id extracted from path)', () => {
    expect(recoverUrlRouteSrc).toContain('extractStoragePathFromUrl')
    expect(recoverUrlRouteSrc).toContain('businessId')
    expect(recoverUrlRouteSrc).toContain("pathSegments[0]")
  })

  it('28. unauthorized business/media path cannot mint token (403)', () => {
    expect(recoverUrlRouteSrc).toContain("eq('user_id', user.id)")
    expect(recoverUrlRouteSrc).toContain('Access denied')
    expect(recoverUrlRouteSrc).toContain('status: 403')
  })

  it('29. authorized historical media can recover successfully', () => {
    expect(recoverUrlRouteSrc).toContain('getValidMediaAccessUrl(storedUrl)')
    expect(recoverUrlRouteSrc).toContain('validUrl')
    expect(recoverUrlRouteSrc).toContain('recovered: true')
  })

  it('30. path traversal prevention (.. and . checks)', () => {
    expect(recoverUrlRouteSrc).toContain("businessId.includes('..')")
    expect(recoverUrlRouteSrc).toContain("businessId.includes('.')")
  })

  it('31. recover-url uses same ownership contract as serve endpoint', () => {
    // Both endpoints verify business ownership via supabaseAdmin businesses table
    expect(recoverUrlRouteSrc).toContain("from('businesses')")
    expect(recoverUrlRouteSrc).toContain("eq('id', businessId)")
    expect(mmsServeRouteSrc).toContain("from('businesses')")
    expect(mmsServeRouteSrc).toContain("eq('user_id', user.id)")
  })

  it('32. recover-url does not bypass token signature verification', () => {
    // The fresh token is still verified by the serve endpoint via jwtVerify
    expect(mmsMediaTokenSrc).toContain('jwtVerify(token, secret)')
  })
})
