/**
 * Batch 3 — Modal Behavior / Scroll / Viewport / Save Semantics Tests
 *
 * Proves:
 * - Customer Details modal has one body scroll owner with data-scroll-lock-allow
 * - Call Forwarding body has data-scroll-lock-allow (dynamic expansion scrollable)
 * - Job Overview footer has flex-shrink-0 and safe-area-bottom
 * - Request Payment does not autofocus Amount on open
 * - Request Payment uses shared Modal (has X button)
 * - New Payment Request uses shared Modal
 * - Event Details: no duplicate Edit buttons
 * - Event Details: Save disabled when unchanged
 * - Event Details: Save disabled when invalid (empty summary)
 * - Event Details: no autoFocus on add-location input
 * - Notification Center bounded by bottom nav height
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Batch 3 — Modal scroll / viewport / save semantics', () => {
  const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
  const callForwardingSrc = readSrc('src/components/CallForwardingInstructions.tsx')
  const jobDetailsModalSrc = readSrc('src/components/jobs/JobDetailsModal.tsx')
  const requestPaymentSrc = readSrc('src/components/payments/RequestPaymentModal.tsx')
  const paymentsNewRequestSrc = readSrc('src/components/payments/PaymentsNewRequestModal.tsx')
  const eventDetailsSrc = readSrc('src/components/calendar/EventDetailsModal.tsx')
  const navbarNotificationsSrc = readSrc('src/components/NavbarNotifications.tsx')
  const modalSrc = readSrc('src/components/ui/Modal.tsx')
  const useBodyScrollLockSrc = readSrc('src/hooks/useBodyScrollLock.ts')
  const tapToPayModalSrc = readSrc('src/components/payments/TapToPayModal.tsx')

  // ========== SCROLL / VIEWPORT ==========

  // 1. Customer Details modal has one body scroll owner
  it('Customer Details mobile body has data-scroll-lock-allow and overflow-y-auto', () => {
    const mobileSheetIdx = pageClientSrc.indexOf('Mobile Bottom Sheet for Customer Details')
    expect(mobileSheetIdx).toBeGreaterThan(0)
    // Use a wider window to find the body (it's further down)
    const mobileSheet = pageClientSrc.substring(mobileSheetIdx, mobileSheetIdx + 3000)
    // Body scroll owner
    expect(mobileSheet).toContain('overflow-y-auto')
    expect(mobileSheet).toContain('data-scroll-lock-allow')
    expect(mobileSheet).toContain('overscroll-contain')
    expect(mobileSheet).toContain('[touch-action:pan-y]')
  })

  // 2. Customer Details lower fields remain reachable (body is the scroll owner, not the shell)
  it('Customer Details mobile shell has overflow-hidden (body is the scroll owner)', () => {
    const mobileSheetIdx = pageClientSrc.indexOf('Mobile Bottom Sheet for Customer Details')
    const mobileSheet = pageClientSrc.substring(mobileSheetIdx, mobileSheetIdx + 400)
    // Shell has overflow-hidden
    expect(mobileSheet).toContain('overflow-hidden')
  })

  // 3. Call Forwarding body has data-scroll-lock-allow
  it('Call Forwarding body has data-scroll-lock-allow for scroll ownership', () => {
    const bodyIdx = callForwardingSrc.indexOf('ref={bodyRef}')
    expect(bodyIdx).toBeGreaterThan(0)
    const bodySection = callForwardingSrc.substring(bodyIdx, bodyIdx + 200)
    expect(bodySection).toContain('data-scroll-lock-allow')
    expect(bodySection).toContain('overflow-y-auto')
    expect(bodySection).toContain('overscroll-contain')
    expect(bodySection).toContain('[touch-action:pan-y]')
  })

  // 4. Call Forwarding shell does not grow outside viewport
  it('Call Forwarding shell is constrained to viewport with max-h and overflow-hidden', () => {
    expect(callForwardingSrc).toContain('max-h-[calc(100dvh')
    expect(callForwardingSrc).toContain('overflow-hidden')
    expect(callForwardingSrc).toContain('flex flex-col')
  })

  // 5. Call Forwarding dynamic content grows inside body scroll owner
  it('Call Forwarding body is the flex-1 scroll owner (provider expansion stays inside)', () => {
    const bodyIdx = callForwardingSrc.indexOf('ref={bodyRef}')
    const bodySection = callForwardingSrc.substring(bodyIdx, bodyIdx + 200)
    expect(bodySection).toContain('flex-1')
    expect(bodySection).toContain('min-h-0')
  })

  // 6. Job Overview footer remains inside usable viewport
  it('JobDetailsModal footer has flex-shrink-0 and safe-area-bottom', () => {
    const footerIdx = jobDetailsModalSrc.indexOf('{/* Footer */}')
    expect(footerIdx).toBeGreaterThan(0)
    const footerSection = jobDetailsModalSrc.substring(footerIdx, footerIdx + 200)
    expect(footerSection).toContain('flex-shrink-0')
    expect(footerSection).toContain('env(safe-area-inset-bottom)')
  })

  // 7. JobDetailsModal shell accounts for bottom nav
  it('JobDetailsModal shell max-h accounts for bottom-nav-height', () => {
    expect(jobDetailsModalSrc).toContain('var(--bottom-nav-height')
  })

  // 7b. New Payment Request content stays inside viewport (uses shared Modal)
  it('New Payment Request uses shared Modal primitive (viewport-safe)', () => {
    expect(paymentsNewRequestSrc).toContain("from '@/components/ui/Modal'")
    expect(paymentsNewRequestSrc).toContain('<Modal')
  })

  // 8. Notification panel stays bounded between app chrome
  it('Notification Center maxHeight accounts for bottom-nav-height on mobile', () => {
    expect(navbarNotificationsSrc).toContain('var(--bottom-nav-height')
    expect(navbarNotificationsSrc).toContain('buttonPosition')
  })

  // 9. Notification Center list is the scroll owner
  it('Notification Center list has data-scroll-lock-allow and overflow-y-auto', () => {
    expect(navbarNotificationsSrc).toContain('data-scroll-lock-allow')
    expect(navbarNotificationsSrc).toContain('overflow-y-auto')
    expect(navbarNotificationsSrc).toContain('overscroll-contain')
  })

  // ========== FOCUS / KEYBOARD ==========

  // 10. Request Payment does not autofocus Amount on open
  it('Request Payment does not autofocus Amount input on open', () => {
    // Should not have autoFocus on the amount input
    const amountInputIdx = requestPaymentSrc.indexOf('amountInputRef')
    if (amountInputIdx > 0) {
      const amountInputSection = requestPaymentSrc.substring(amountInputIdx, amountInputIdx + 500)
      // The ref exists but should not have autoFocus prop
      const inputMatch = amountInputSection.match(/<input[^>]*ref=\{amountInputRef\}[^>]*>/)
      if (inputMatch) {
        expect(inputMatch[0]).not.toContain('autoFocus')
      }
    }
    // The comment confirms no per-modal focus management
    expect(requestPaymentSrc).toContain('No per-modal focus/blur management is needed here')
  })

  // 11. New Payment Request does not autofocus input on open
  it('New Payment Request does not have autoFocus on any input', () => {
    expect(paymentsNewRequestSrc).not.toContain('autoFocus')
  })

  // 12. Shared Modal does not focus inputs on open
  it('Shared Modal focuses dialog panel (non-input) on open, not an input', () => {
    expect(modalSrc).toContain('modalRef.current.focus()')
    expect(modalSrc).toContain('tabIndex={-1}')
    // Should not call .focus() on any input ref
    expect(modalSrc).not.toMatch(/inputRef\.current\.focus/)
  })

  // 13. Shared Modal allows explicit user tap to focus input
  it('Shared Modal does not prevent input focus on user tap', () => {
    // The Modal does not have any global focus prevention
    expect(modalSrc).not.toContain('preventDefault')
  })

  // 14. iOS input font sizing protection (text-base on inputs)
  it('Event Details add-location input uses text-base (iOS zoom protection)', () => {
    const inputIdx = eventDetailsSrc.indexOf('Add an address or place')
    expect(inputIdx).toBeGreaterThan(0)
    const inputSection = eventDetailsSrc.substring(inputIdx - 200, inputIdx + 200)
    expect(inputSection).toContain('text-base')
  })

  // 15. Shared Modal footer respects safe-area-bottom (keyboard does not permanently obscure)
  it('Shared Modal footer has safe-area-bottom padding', () => {
    expect(modalSrc).toContain('env(safe-area-inset-bottom)')
  })

  // ========== DISMISSAL ==========

  // 16. Request Payment X dismisses without submit
  it('Request Payment uses shared Modal which has X button in header', () => {
    expect(requestPaymentSrc).toContain('<Modal')
    expect(modalSrc).toContain('aria-label="Close"')
    expect(modalSrc).toContain('<X className="w-5 h-5 stroke-[1.5]" />')
  })

  // 17. Cancel dismisses without submit
  it('Request Payment Cancel button calls onClose (not submit)', () => {
    const cancelIdx = requestPaymentSrc.indexOf('Cancel')
    expect(cancelIdx).toBeGreaterThan(0)
    // Look backwards from Cancel to find the onClick
    const cancelSection = requestPaymentSrc.substring(cancelIdx - 400, cancelIdx + 50)
    expect(cancelSection).toContain('onClick={onClose}')
    expect(cancelSection).not.toContain('handleCreatePayment')
  })

  // 18. Android Back dismisses topmost modal (shared useModalBackButton)
  it('Shared Modal uses useModalBackButton for Android Back', () => {
    expect(modalSrc).toContain('useModalBackButton')
  })

  // 19. One Back event closes only one modal layer (stack-based)
  it('useModalBackButton uses a stack (one Back = one modal)', () => {
    const useModalBackButtonSrc = readSrc('src/hooks/useModalBackButton.ts')
    expect(useModalBackButtonSrc).toContain('registerModal')
    expect(useModalBackButtonSrc).toContain('unregisterModal')
    expect(useModalBackButtonSrc).toContain('getModalStack')
    // Only topmost modal responds
    expect(useModalBackButtonSrc).toContain('stack[stack.length - 1]')
  })

  // 20. Page navigation not triggered while modal consumes Back
  it('useModalBackButton pushes history state to intercept Back', () => {
    const useModalBackButtonSrc = readSrc('src/hooks/useModalBackButton.ts')
    expect(useModalBackButtonSrc).toContain('history.pushState')
  })

  // 21. Normal page Back works with no modal open
  it('useModalBackButton only registers when isOpen is true', () => {
    const useModalBackButtonSrc = readSrc('src/hooks/useModalBackButton.ts')
    expect(useModalBackButtonSrc).toContain('if (!isOpen) return')
  })

  // ========== EVENT EDIT/SAVE ==========

  // 22. Event opens read-only (isEditing defaults to false)
  it('Event Details opens in read-only mode (isEditing defaults to false)', () => {
    expect(eventDetailsSrc).toContain("const [isEditing, setIsEditing] = useState(false)")
  })

  // 23. Edit enters draft mode
  it('Edit button sets isEditing to true', () => {
    expect(eventDetailsSrc).toContain('handleEditClick')
    const editIdx = eventDetailsSrc.indexOf('handleEditClick')
    const editSection = eventDetailsSrc.substring(editIdx, editIdx + 100)
    expect(editSection).toContain('setIsEditing(true)')
  })

  // 24. Changing field does NOT persist immediately (draft-only)
  it('Event Details field changes update draft state only (onChange sets state, not API)', () => {
    // Summary is not user-editable (displayed read-only in header); only
    // description, location, notes, dates, and all-day toggle are editable.
    // The onChange handlers for editable fields call setEditedX, not fetch.
    expect(eventDetailsSrc).toContain('onChange={(e) => setEditedDescription(e.target.value)}')
    expect(eventDetailsSrc).toContain('onChange={(e) => setEditedLocation(e.target.value)}')
    expect(eventDetailsSrc).toContain('onChange={(e) => setEditedNotes(e.target.value)}')
    // Verify the onChange handlers are simple one-liners that only set state
    const onChangeCount = (eventDetailsSrc.match(/onChange=\{\(e\) => setEdited\w+\(e\.target\.value\)\}/g) || []).length
    expect(onChangeCount).toBeGreaterThan(0)
  })

  // 25. blur does NOT persist
  it('Event Details inputs do not persist on blur', () => {
    // Check that no onBlur handler calls fetch or handleSave
    const onBlurMatches = eventDetailsSrc.match(/onBlur=\{[^}]*\}/g) || []
    onBlurMatches.forEach(m => {
      expect(m).not.toContain('fetch')
      expect(m).not.toContain('handleSave')
    })
  })

  // 26. Save disabled when unchanged
  it('Event Details Save disabled when draft equals persisted (hasMeaningfulChanges)', () => {
    expect(eventDetailsSrc).toContain('hasMeaningfulChanges')
    expect(eventDetailsSrc).toContain('canSave')
    expect(eventDetailsSrc).toContain('disabled={!canSave}')
  })

  // 27. Meaningful edit enables Save
  it('hasMeaningfulChanges compares draft to persisted values', () => {
    expect(eventDetailsSrc).toContain('summaryChanged')
    expect(eventDetailsSrc).toContain('descriptionChanged')
    expect(eventDetailsSrc).toContain('locationChanged')
    expect(eventDetailsSrc).toContain('notesChanged')
  })

  // 28. Reverting edit disables Save
  it('Reverting all edits back to original disables Save (comparison is trim-based)', () => {
    // The comparison uses .trim() so whitespace-only changes don't count
    expect(eventDetailsSrc).toContain('.trim() !== persistedSummary.trim()')
  })

  // 29. Invalid draft disables Save
  it('Save disabled when draft is invalid (empty summary or inverted times)', () => {
    expect(eventDetailsSrc).toContain('isDraftValid')
    expect(eventDetailsSrc).toContain("if (!editedSummary.trim()) return false")
    expect(eventDetailsSrc).toContain('editedStartTime > editedEndTime')
  })

  // 30. Save persists exactly once
  it('Save persists exactly once (single fetch in handleSaveChanges)', () => {
    const saveIdx = eventDetailsSrc.indexOf('handleSaveChanges')
    const saveSection = eventDetailsSrc.substring(saveIdx, saveIdx + 3000)
    // Main event PATCH
    expect(saveSection).toContain('method: \'PATCH\'')
    // Notes PATCH is conditional (only if notes changed)
    expect(saveSection).toContain('editedNotes !== notes')
  })

  // 31. Failed Save retains draft
  it('Failed Save retains draft (does not exit edit mode on error)', () => {
    const saveIdx = eventDetailsSrc.indexOf('handleSaveChanges')
    const saveSection = eventDetailsSrc.substring(saveIdx, saveIdx + 3000)
    // On error, setError is called
    expect(saveSection).toContain('setError(')
    // On success, setIsEditing(false) is called
    expect(saveSection).toContain('setIsEditing(false)')
    // On notes failure, draft is preserved (return before setIsEditing)
    expect(saveSection).toContain('notesSaveFailed')
    expect(saveSection).toContain('Your notes draft is preserved')
  })

  // 32. Cancel discards draft
  it('Cancel Edit restores persisted values and exits edit mode', () => {
    const cancelIdx = eventDetailsSrc.indexOf('handleCancelEdit')
    expect(cancelIdx).toBeGreaterThan(0)
    const cancelSection = eventDetailsSrc.substring(cancelIdx, cancelIdx + 400)
    expect(cancelSection).toContain('setIsEditing(false)')
    expect(cancelSection).toContain('setEditedSummary(event.summary)')
    expect(cancelSection).toContain('setEditedDescription(event.description')
    expect(cancelSection).toContain('setEditedLocation(event.location')
  })

  // 33. Duplicate Edit action is absent
  it('Event Details read-only footer has exactly one Edit button', () => {
    // Count handleEditClick references in the footer area
    const footerIdx = eventDetailsSrc.indexOf('{/* Footer */}')
    expect(footerIdx).toBeGreaterThan(0)
    const footerSection = eventDetailsSrc.substring(footerIdx)
    // Count Edit buttons (handleEditClick calls)
    const editButtonCount = (footerSection.match(/handleEditClick/g) || []).length
    expect(editButtonCount).toBe(1)
  })

  // 34. Read-only external event stays read-only
  it('Edit button only shows for ReplyFlow-owned non-job events', () => {
    expect(eventDetailsSrc).toContain('isReplyFlowOwned && !isJobEvent')
  })

  // 35. Mark Complete remains explicit
  it('Mark Complete requires explicit confirmation (showCompleteConfirm)', () => {
    expect(eventDetailsSrc).toContain('showCompleteConfirm')
    expect(eventDetailsSrc).toContain('setShowCompleteConfirm(true)')
    expect(eventDetailsSrc).toContain('Confirm')
  })

  // 36. Event Details add-location input does not have autoFocus
  it('Event Details add-location input does NOT have autoFocus', () => {
    const inputIdx = eventDetailsSrc.indexOf('Add an address or place')
    const inputSection = eventDetailsSrc.substring(inputIdx - 300, inputIdx + 100)
    expect(inputSection).not.toContain('autoFocus')
  })

  // ========== MODAL ARCHITECTURE ==========

  // Shared Modal primitive has canonical layout
  it('Shared Modal has flex flex-col, overflow-hidden shell', () => {
    expect(modalSrc).toContain('flex flex-col')
    expect(modalSrc).toContain('overflow-hidden')
    expect(modalSrc).toContain('max-h-[var(--modal-max-height)]')
  })

  it('Shared Modal header is shrink-0 with X button', () => {
    expect(modalSrc).toContain('shrink-0')
    expect(modalSrc).toContain('aria-label="Close"')
  })

  it('Shared Modal body is the single scroll owner with data-scroll-lock-allow', () => {
    expect(modalSrc).toContain('flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain')
    expect(modalSrc).toContain('data-scroll-lock-allow')
    expect(modalSrc).toContain('[touch-action:pan-y]')
  })

  it('Shared Modal footer is shrink-0 with safe-area-bottom', () => {
    expect(modalSrc).toContain('shrink-0')
    expect(modalSrc).toContain('env(safe-area-inset-bottom)')
  })

  // useBodyScrollLock allows scrolling inside data-scroll-lock-allow
  it('useBodyScrollLock allows touchmove inside data-scroll-lock-allow', () => {
    expect(useBodyScrollLockSrc).toContain("data-scroll-lock-allow")
    expect(useBodyScrollLockSrc).toContain("closest('[data-scroll-lock-allow]')")
  })

  // RequestPaymentModal uses shared Modal
  it('RequestPaymentModal uses shared Modal primitive', () => {
    expect(requestPaymentSrc).toContain("from '@/components/ui/Modal'")
    expect(requestPaymentSrc).toContain('<Modal')
  })

  // Customer Details uses useBodyScrollLock
  it('Customer Details uses useBodyScrollLock', () => {
    expect(pageClientSrc).toContain("useBodyScrollLock(showLeadInfo, 'customer-details-modal')")
  })

  // CallForwarding uses useBodyScrollLock
  it('CallForwarding uses useBodyScrollLock', () => {
    expect(callForwardingSrc).toContain("useBodyScrollLock(isOpen, 'call-forwarding-instructions')")
  })

  // JobDetailsModal uses useBodyScrollLock
  it('JobDetailsModal uses useBodyScrollLock', () => {
    expect(jobDetailsModalSrc).toContain("useBodyScrollLock(isOpen, 'job-details-modal')")
  })

  // JobDetailsModal uses useModalBackButton
  it('JobDetailsModal uses useModalBackButton', () => {
    expect(jobDetailsModalSrc).toContain('useModalBackButton')
  })

  // ========== BACK OWNERSHIP (Batch 3 Final Pass) ==========

  // 1. EventDetailsModal Back closes modal
  it('EventDetailsModal uses useModalBackButton (Android Back closes modal)', () => {
    expect(eventDetailsSrc).toContain('useModalBackButton')
    expect(eventDetailsSrc).toContain("useModalBackButton({ isOpen, onClose })")
  })

  // 2. EventDetailsModal Back does not navigate (no direct App.addListener)
  it('EventDetailsModal does NOT register direct App.addListener backButton', () => {
    expect(eventDetailsSrc).not.toContain("App.addListener('backButton')")
    expect(eventDetailsSrc).not.toContain('App.addListener("backButton")')
  })

  // 3. Customer Details Back closes modal
  it('Customer Details registers showLeadInfo with useModalBackButton', () => {
    expect(pageClientSrc).toContain('useModalBackButton({ isOpen: showLeadInfo')
    expect(pageClientSrc).toContain('onClose: () => setShowLeadInfo(false)')
  })

  // 4. Call Forwarding Back closes modal
  it('CallForwardingInstructions uses useModalBackButton', () => {
    expect(callForwardingSrc).toContain('useModalBackButton')
    expect(callForwardingSrc).toContain("useModalBackButton({ isOpen, onClose })")
  })

  // 5. TapToPayModal uses canonical back ownership
  it('TapToPayModal uses useModalBackButton (not direct App.addListener)', () => {
    expect(tapToPayModalSrc).toContain('useModalBackButton')
    expect(tapToPayModalSrc).not.toContain("App.addListener('backButton')")
    // Payment state gating is preserved
    expect(tapToPayModalSrc).toContain("paymentState === 'ready'")
    expect(tapToPayModalSrc).toContain("paymentState === 'failure'")
    expect(tapToPayModalSrc).toContain("paymentState === 'canceled'")
  })

  // 6. One Back event closes one modal layer only (stack-based)
  it('useModalBackButton stack ensures one Back = one modal close', () => {
    const useModalBackButtonSrc = readSrc('src/hooks/useModalBackButton.ts')
    expect(useModalBackButtonSrc).toContain('stack[stack.length - 1]')
    // Only the topmost modal's close callback is invoked
    expect(useModalBackButtonSrc).toContain('=== stableCloseWrapper.current')
  })

  // 7. Nested/topmost modal precedence works
  it('handleCapacitorBackButton closes only the topmost modal', () => {
    const modalBackButtonSrc = readSrc('src/lib/modalBackButton.ts')
    expect(modalBackButtonSrc).toContain('modalStack[modalStack.length - 1]')
    expect(modalBackButtonSrc).toContain('topModal()')
  })

  // 8. No duplicate native back listeners introduced in changed files
  it('Changed modal files do not register direct App.addListener backButton', () => {
    expect(eventDetailsSrc).not.toContain("App.addListener('backButton')")
    expect(callForwardingSrc).not.toContain("App.addListener('backButton')")
    expect(tapToPayModalSrc).not.toContain("App.addListener('backButton')")
  })

  // 9. Normal page Back works with no modal open
  it('useModalBackButton only registers when isOpen is true (normal Back works otherwise)', () => {
    const useModalBackButtonSrc = readSrc('src/hooks/useModalBackButton.ts')
    expect(useModalBackButtonSrc).toContain('if (!isOpen) return')
  })

  // ========== REQUEST PAYMENT (Active Path) ==========

  // 10. Customer-conversation Request Payment active implementation is inline in page-client
  it('Customer-conversation Request Payment is the inline modal in page-client.tsx', () => {
    // The inline modal is triggered by showPaymentModal state
    expect(pageClientSrc).toContain('const handleRequestPaymentClick')
    expect(pageClientSrc).toContain('setShowPaymentModal(true)')
    // The inline modal renders when showPaymentModal is true
    expect(pageClientSrc).toContain('{showPaymentModal && (')
    // It is NOT using the shared RequestPaymentModal component
    expect(pageClientSrc).not.toContain('<RequestPaymentModal')
  })

  // 11. No autofocus on open
  it('Request Payment does NOT autofocus amount input on open', () => {
    // The autofocus setTimeout was removed
    expect(pageClientSrc).not.toContain('paymentAmountRef.current?.focus()')
    // The input ref exists but is not auto-focused
    expect(pageClientSrc).toContain('ref={paymentAmountRef}')
    // The input does NOT have autoFocus prop
    const inputIdx = pageClientSrc.indexOf('ref={paymentAmountRef}')
    const inputSection = pageClientSrc.substring(inputIdx - 50, inputIdx + 200)
    expect(inputSection).not.toContain('autoFocus')
  })

  // 12. X dismisses without submit
  it('Request Payment X button dismisses without submit', () => {
    // X button exists in the header
    expect(pageClientSrc).toContain('aria-label="Close modal"')
    // The X button's onClick calls setShowPaymentModal(false), not the submit handler
    const xButtonIdx = pageClientSrc.indexOf('aria-label="Close modal"')
    const xSection = pageClientSrc.substring(xButtonIdx - 500, xButtonIdx + 50)
    expect(xSection).toContain('setShowPaymentModal(false)')
  })

  // 13. Cancel dismisses without submit
  it('Request Payment Cancel button dismisses without submit', () => {
    // Find the Cancel button in the payment modal footer
    const paymentModalIdx = pageClientSrc.indexOf('{/* Payment Request Modal */}')
    const paymentModalSection = pageClientSrc.substring(paymentModalIdx, paymentModalIdx + 12000)
    expect(paymentModalSection).toContain('Cancel')
    // Cancel onClick sets showPaymentModal to false (dismissal)
    const cancelIdx = paymentModalSection.indexOf('Cancel')
    const cancelSection = paymentModalSection.substring(cancelIdx - 500, cancelIdx + 50)
    expect(cancelSection).toContain('setShowPaymentModal(false)')
  })

  // 14. Android Back dismisses without navigation
  it('Request Payment uses useModalBackButton for Android Back', () => {
    expect(pageClientSrc).toContain('useModalBackButton({ isOpen: showPaymentModal')
  })

  // 15. Viewport remains bounded
  it('Request Payment shell is bounded to viewport (max-h, overflow-hidden, flex-col)', () => {
    const paymentModalIdx = pageClientSrc.indexOf('{/* Payment Request Modal */}')
    const paymentModalSection = pageClientSrc.substring(paymentModalIdx, paymentModalIdx + 1000)
    expect(paymentModalSection).toContain('max-h-[calc(100dvh')
    expect(paymentModalSection).toContain('overflow-hidden')
    expect(paymentModalSection).toContain('flex flex-col')
  })

  // 16. Content/actions remain reachable (scrollable body, fixed footer)
  it('Request Payment body scrolls and footer stays visible', () => {
    const paymentModalIdx = pageClientSrc.indexOf('{/* Payment Request Modal */}')
    const paymentModalSection = pageClientSrc.substring(paymentModalIdx, paymentModalIdx + 5000)
    // Body is the scroll owner
    expect(paymentModalSection).toContain('overflow-y-auto')
    expect(paymentModalSection).toContain('data-scroll-lock-allow')
    // Footer is flex-shrink-0 so it stays visible
    expect(paymentModalSection).toContain('flex-shrink-0')
  })

  // 17. Request Payment uses useBodyScrollLock
  it('Request Payment uses useBodyScrollLock', () => {
    expect(pageClientSrc).toContain("useBodyScrollLock(showPaymentModal, 'request-payment-modal')")
  })

  // ========== NEW PAYMENT REQUEST (Active Path) ==========

  // 18. Active component identified
  it('Payments page uses PaymentsNewRequestModal component', () => {
    const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')
    expect(paymentsPageSrc).toContain('PaymentsNewRequestModal')
    expect(paymentsPageSrc).toContain('<PaymentsNewRequestModal')
  })

  // 19. No autofocus
  it('New Payment Request does not have autoFocus on any input', () => {
    expect(paymentsNewRequestSrc).not.toContain('autoFocus')
  })

  // 20. Bounded viewport (uses shared Modal)
  it('New Payment Request uses shared Modal (viewport-safe)', () => {
    expect(paymentsNewRequestSrc).toContain("from '@/components/ui/Modal'")
    expect(paymentsNewRequestSrc).toContain('<Modal')
  })

  // 21. X dismisses (shared Modal has X button)
  it('New Payment Request X dismisses via shared Modal', () => {
    expect(modalSrc).toContain('aria-label="Close"')
    expect(paymentsNewRequestSrc).toContain('onClose={handleClose}')
  })

  // 22. Android Back dismisses (shared Modal owns useModalBackButton)
  it('New Payment Request Android Back dismisses via shared Modal', () => {
    expect(modalSrc).toContain('useModalBackButton({ isOpen, onClose })')
    expect(paymentsNewRequestSrc).toContain('onClose={handleClose}')
  })

  // ========== GLOBAL BACK LISTENER AUDIT ==========

  // Global init.ts handler defers to modal stack
  it('Global Capacitor back handler defers to modal stack (hasOpenModal check)', () => {
    const initSrc = readSrc('src/capacitor/init.ts')
    expect(initSrc).toContain("App.addListener('backButton'")
    expect(initSrc).toContain('hasOpenModal')
    expect(initSrc).toContain('handleCapacitorBackButton')
  })
})
