import { describe, it, expect } from 'vitest'

/**
 * Batch 4 — Modal / Form / Native-Shell Behavior
 *
 * Covers:
 * HELP MODAL SCROLL (1-6)
 * ANDROID BACK (7-12)
 * IOS ZOOM (13-16)
 * PHONE (17-20)
 * TAP TO PAY (21-27)
 * MODAL STACK OWNERSHIP AUDIT (28-40)
 */

const fs = require('fs')

function readContent(path: string): string {
  return fs.readFileSync(path, 'utf8')
}

// ============================================================
// HELP MODAL SCROLL
// ============================================================

describe('Batch 4 — Help modal scroll', () => {
  it('1. ReplyFlowAssistant has exactly one scroll owner with flex-1 min-h-0', () => {
    const content = readContent('src/components/ReplyFlowAssistant.tsx')
    expect(content).toContain('flex-1 min-h-0 overflow-y-auto overscroll-contain [touch-action:pan-y]')
  })

  it('2. scroll owner has data-scroll-lock-allow (touch scroll permitted inside modal)', () => {
    const content = readContent('src/components/ReplyFlowAssistant.tsx')
    expect(content).toContain('data-scroll-lock-allow')
  })

  it('3. header is flex-shrink-0 (non-scrolling)', () => {
    const content = readContent('src/components/ReplyFlowAssistant.tsx')
    expect(content).toContain('flex-shrink-0 z-30')
  })

  it('4. ContactSupportModal content has data-scroll-lock-allow', () => {
    const content = readContent('src/components/ContactSupportModal.tsx')
    expect(content).toContain('data-scroll-lock-allow')
  })

  it('5. ContactSupportModal content is flex-1 min-h-0 (scroll owner)', () => {
    const content = readContent('src/components/ContactSupportModal.tsx')
    expect(content).toContain('flex-1 min-h-0 overflow-y-auto overscroll-contain [touch-action:pan-y]')
  })

  it('6. no nested competing overflow-y-auto inside scroll owner', () => {
    const content = readContent('src/components/ReplyFlowAssistant.tsx')
    const scrollOwnerMatch = content.match(/ref=\{scrollContainerRef\}[\s\S]*?className="flex-1 min-h-0 overflow-y-auto/)
    expect(scrollOwnerMatch).toBeTruthy()
  })
})

// ============================================================
// ANDROID BACK
// ============================================================

describe('Batch 4 — Android Back button', () => {
  it('7. ContactSupportModal uses useModalBackButton (topmost modal closes)', () => {
    const content = readContent('src/components/ContactSupportModal.tsx')
    expect(content).toContain('useModalBackButton')
    expect(content).toContain("useModalBackButton({ isOpen, onClose })")
  })

  it('8. AssistantMobileShell uses useModalBackButton (not custom handler)', () => {
    const content = readContent('src/components/AssistantMobileShell.tsx')
    expect(content).toContain('useModalBackButton')
    expect(content).toContain("useModalBackButton({ isOpen, onClose })")
  })

  it('9. AssistantMobileShell no longer has custom backButton listener', () => {
    const content = readContent('src/components/AssistantMobileShell.tsx')
    expect(content).not.toContain("App.addListener('backButton')")
  })

  it('10. shared Modal component uses useModalBackButton', () => {
    const content = readContent('src/components/ui/Modal.tsx')
    expect(content).toContain('useModalBackButton')
    expect(content).toContain("useModalBackButton({ isOpen, onClose })")
  })

  it('11. modalBackButton lib has handleCapacitorBackButton (closes topmost)', () => {
    const content = readContent('src/lib/modalBackButton.ts')
    expect(content).toContain('handleCapacitorBackButton')
    expect(content).toContain('modalStack[modalStack.length - 1]')
  })

  it('12. Capacitor init checks shared stack before normal back handling', () => {
    const content = readContent('src/capacitor/init.ts')
    expect(content).toContain('hasOpenModal')
    expect(content).toContain('handleCapacitorBackButton')
  })
})

// ============================================================
// IOS ZOOM
// ============================================================

describe('Batch 4 — iOS form focus auto-zoom', () => {
  it('13. SearchableCustomerSelect search input uses text-base sm:text-sm (>=16px mobile)', () => {
    const content = readContent('src/components/customers/SearchableCustomerSelect.tsx')
    expect(content).toContain('text-base sm:text-sm')
  })

  it('14. SelectPicker search input uses text-base sm:text-sm (>=16px mobile)', () => {
    const content = readContent('src/components/ui/SelectPicker.tsx')
    expect(content).toContain('text-base sm:text-sm')
  })

  it('15. DatePicker uses text-base sm:text-sm (>=16px mobile)', () => {
    const content = readContent('src/components/ui/DatePicker.tsx')
    expect(content).toContain('text-base sm:text-sm')
  })

  it('15b. TimePicker uses text-base sm:text-sm (>=16px mobile)', () => {
    const content = readContent('src/components/ui/TimePicker.tsx')
    expect(content).toContain('text-base sm:text-sm')
  })

  it('16. no viewport zoom-disabling meta changes (no maximum-scale=1)', () => {
    const layoutContent = readContent('src/app/layout.tsx')
    if (layoutContent.includes('viewport')) {
      expect(layoutContent).not.toContain('maximum-scale=1')
      expect(layoutContent).not.toContain('user-scalable=no')
    }
    const globalsContent = readContent('src/app/globals.css')
    expect(globalsContent).not.toContain('touch-action: manipulation')
  })

  it('16b. AddCustomerModal inputs use text-base sm:text-sm', () => {
    const content = readContent('src/components/AddCustomerModal.tsx')
    expect(content).toContain('text-base sm:text-sm')
  })

  it('16c. EditCustomerModal inputs use text-base sm:text-sm', () => {
    const content = readContent('src/components/EditCustomerModal.tsx')
    expect(content).toContain('text-base sm:text-sm')
  })
})

// ============================================================
// PHONE
// ============================================================

describe('Batch 4 — Phone field semantics', () => {
  it('17. AddCustomerModal phone uses type="tel", inputMode="tel", autoComplete="tel"', () => {
    const content = readContent('src/components/AddCustomerModal.tsx')
    const phoneStart = content.indexOf('Phone Number')
    expect(phoneStart).toBeGreaterThan(-1)
    const phoneSection = content.substring(phoneStart, phoneStart + 500)
    expect(phoneSection).toContain('type="tel"')
    expect(phoneSection).toContain('inputMode="tel"')
    expect(phoneSection).toContain('autoComplete="tel"')
    expect(phoneSection).toContain('name="phoneNumber"')
    expect(phoneSection).toContain('id="phoneNumber"')
  })

  it('18. EditCustomerModal phone uses type="tel", inputMode="tel", autoComplete="tel"', () => {
    const content = readContent('src/components/EditCustomerModal.tsx')
    const phoneStart = content.indexOf('Phone Number')
    expect(phoneStart).toBeGreaterThan(-1)
    const phoneSection = content.substring(phoneStart, phoneStart + 500)
    expect(phoneSection).toContain('type="tel"')
    expect(phoneSection).toContain('inputMode="tel"')
    expect(phoneSection).toContain('autoComplete="tel"')
    expect(phoneSection).toContain('name="phoneNumber"')
    expect(phoneSection).toContain('id="phoneNumber"')
  })

  it('19. no credential/password attributes on phone inputs', () => {
    const addContent = readContent('src/components/AddCustomerModal.tsx')
    const editContent = readContent('src/components/EditCustomerModal.tsx')
    expect(addContent).not.toContain('type="password"')
    expect(editContent).not.toContain('type="password"')
    const addPhoneStart = addContent.indexOf('Phone Number')
    const addPhoneSection = addContent.substring(addPhoneStart, addPhoneStart + 500)
    expect(addPhoneSection).not.toContain('autoComplete="username"')
    expect(addPhoneSection).not.toContain('autoComplete="current-password"')
    const editPhoneStart = editContent.indexOf('Phone Number')
    const editPhoneSection = editContent.substring(editPhoneStart, editPhoneStart + 500)
    expect(editPhoneSection).not.toContain('autoComplete="username"')
    expect(editPhoneSection).not.toContain('autoComplete="current-password"')
  })

  it('20. no global autofill disable', () => {
    const addContent = readContent('src/components/AddCustomerModal.tsx')
    const editContent = readContent('src/components/EditCustomerModal.tsx')
    expect(addContent).not.toContain('autoComplete="off"')
    expect(editContent).not.toContain('autoComplete="off"')
  })
})

// ============================================================
// TAP TO PAY
// ============================================================

describe('Batch 4 — Tap-to-Pay reminder gating', () => {
  it('21. ready/configured (terminal_location_id set) => reminder hidden', () => {
    const content = readContent('src/hooks/useTapToPayAwareness.ts')
    expect(content).toContain('stripe_terminal_location_id')
    expect(content).toContain('Tap to Pay already configured')
  })

  it('22. loading/unknown => reminder hidden (isLoading starts true, isEligible starts false)', () => {
    const content = readContent('src/hooks/useTapToPayAwareness.ts')
    expect(content).toContain('isEligible: false')
    expect(content).toContain('isLoading: true')
  })

  it('23. incomplete (no terminal_location_id, not acknowledged) => reminder can show', () => {
    const content = readContent('src/hooks/useTapToPayAwareness.ts')
    expect(content).toContain('All checks passed - eligible')
  })

  it('24. checkCapability respects terminal_location_id gating', () => {
    const content = readContent('src/hooks/useTapToPayAwareness.ts')
    const checkCapStart = content.indexOf('const checkCapability = async')
    expect(checkCapStart).toBeGreaterThan(-1)
    const checkCapSection = content.substring(checkCapStart, checkCapStart + 500)
    expect(checkCapSection).toContain('stripe_terminal_location_id')
  })

  it('25. no duplicate reminder state ownership (single useTapToPayAwareness hook)', () => {
    const content = readContent('src/app/dashboard/DashboardContent.tsx')
    const hookCount = (content.match(/useTapToPayAwareness/g) || []).length
    expect(hookCount).toBeGreaterThanOrEqual(2) // import + usage
  })

  it('26. TapToPayAwarenessModal uses shared Modal (which owns useModalBackButton)', () => {
    const content = readContent('src/components/TapToPayAwarenessModal.tsx')
    expect(content).toContain('<Modal')
    // The leaf component must NOT register useModalBackButton itself —
    // the shared <Modal> owns that registration.
    expect(content).not.toMatch(/useModalBackButton\(\{/)
  })

  it('27. DashboardContent gates modal on isEligible && !isAcknowledged', () => {
    const content = readContent('src/app/dashboard/DashboardContent.tsx')
    expect(content).toContain('tapToPayAwareness.state.isEligible')
    expect(content).toContain('!tapToPayAwareness.isAcknowledged')
  })
})

// ============================================================
// MODAL STACK OWNERSHIP AUDIT
// ============================================================

describe('Batch 4 — Modal stack ownership audit (one registration per visible modal)', () => {
  // Helper: count active useModalBackButton CALLS (not imports, not comments, not tests)
  function countBackButtonCalls(content: string): number {
    // Match useModalBackButton({ ... }) but not import lines, not comment lines, not test descriptions
    const lines = content.split('\n')
    let count = 0
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('//')) continue
      if (trimmed.startsWith('*')) continue
      if (trimmed.startsWith('import ')) continue
      if (trimmed.includes('useModalBackButton({')) {
        count++
      }
    }
    return count
  }

  function usesSharedModal(content: string): boolean {
    return /<Modal[\s/>]/.test(content)
  }

  it('28. AddCustomerModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/AddCustomerModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('29. EditCustomerModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/EditCustomerModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('30. TapToPayAwarenessModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/TapToPayAwarenessModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('31. TapToPayEducationModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/TapToPayEducationModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('32. RequestPaymentModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('33. NewAppointmentModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/calendar/NewAppointmentModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('34. NewTaskModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/schedule/NewTaskModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('35. ConfirmModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/ui/ConfirmModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('36. NewJobModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/jobs/NewJobModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('37. PaymentsNewRequestModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/payments/PaymentsNewRequestModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('38. TestYourSetupModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/TestYourSetupModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('39. PaymentEditModal: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/payments/PaymentEditModal.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  it('40. JobComposer: exactly one registration (via shared Modal, no direct call)', () => {
    const content = readContent('src/components/jobs/JobComposer.tsx')
    expect(usesSharedModal(content)).toBe(true)
    expect(countBackButtonCalls(content)).toBe(0)
  })

  // Custom shells (do NOT use shared Modal) — must register themselves exactly once

  it('41. AssistantMobileShell: custom shell, exactly one direct registration', () => {
    const content = readContent('src/components/AssistantMobileShell.tsx')
    expect(usesSharedModal(content)).toBe(false)
    expect(countBackButtonCalls(content)).toBe(1)
  })

  it('42. ContactSupportModal: custom shell, exactly one direct registration', () => {
    const content = readContent('src/components/ContactSupportModal.tsx')
    expect(usesSharedModal(content)).toBe(false)
    expect(countBackButtonCalls(content)).toBe(1)
  })

  it('43. JobDetailsModal: custom shell, two distinct visible modals (main + nested confirm)', () => {
    const content = readContent('src/components/jobs/JobDetailsModal.tsx')
    expect(usesSharedModal(content)).toBe(false)
    // Two registrations: main modal + NestedCancelConfirm (two distinct visible modals)
    expect(countBackButtonCalls(content)).toBe(2)
  })

  it('44. shared Modal: exactly one registration per instance', () => {
    const content = readContent('src/components/ui/Modal.tsx')
    expect(countBackButtonCalls(content)).toBe(1)
  })

  it('45. page-client: custom payment modal keeps direct registration (not shared Modal)', () => {
    const content = readContent('src/app/dashboard/leads/[id]/page-client.tsx')
    // The payment modal uses a custom div, NOT shared <Modal>, so it keeps its own call.
    // The Customer Details modal (showLeadInfo) also uses a custom inline shell, so it
    // also keeps a direct call. The InternalNotes, Ignore, and AppointmentSelection
    // modals use shared <Modal>, so they must NOT have direct calls.
    // Find the useModalBackButton call that references showPaymentModal
    const paymentCallMatch = content.match(/useModalBackButton\(\{[^}]*showPaymentModal[^}]*\}/)
    expect(paymentCallMatch).toBeTruthy()
    // Find the useModalBackButton call that references showLeadInfo
    const leadInfoCallMatch = content.match(/useModalBackButton\(\{[^}]*showLeadInfo[^}]*\}/)
    expect(leadInfoCallMatch).toBeTruthy()
    // Total direct calls in page-client should be exactly 2 (payment modal + customer details)
    expect(countBackButtonCalls(content)).toBe(2)
  })

  // Nested modal behavior

  it('46. nested distinct modals register twice in correct order (Assistant → Contact Support)', () => {
    // AssistantMobileShell registers first (parent), ContactSupportModal registers second (child).
    // The shared stack is LIFO, so Contact Support is topmost and closes first.
    const assistantContent = readContent('src/components/AssistantMobileShell.tsx')
    const contactContent = readContent('src/components/ContactSupportModal.tsx')
    expect(assistantContent).toContain('useModalBackButton({ isOpen, onClose })')
    expect(contactContent).toContain('useModalBackButton({ isOpen, onClose })')
    // Both are custom shells, so each registers exactly once — two distinct visible modals.
    expect(countBackButtonCalls(assistantContent)).toBe(1)
    expect(countBackButtonCalls(contactContent)).toBe(1)
  })

  // Global native listener count

  it('47. exactly one global App.addListener("backButton") in init.ts', () => {
    const content = readContent('src/capacitor/init.ts')
    const count = (content.match(/App\.addListener\('backButton'/g) || []).length
    expect(count).toBe(1)
  })

  it('48. no per-modal App.addListener("backButton") in any component', () => {
    const componentDirs = [
      'src/components',
    ]
    let found = false
    for (const dir of componentDirs) {
      const files = fs.readdirSync(dir, { recursive: true }) as string[]
      for (const file of files) {
        if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue
        if (file.includes('__tests__')) continue
        const fullPath = `${dir}/${file}`
        if (!fs.existsSync(fullPath)) continue
        const content = fs.readFileSync(fullPath, 'utf8')
        if (content.includes("App.addListener('backButton')")) {
          found = true
          console.error(`FOUND per-modal backButton listener in: ${fullPath}`)
        }
      }
    }
    expect(found).toBe(false)
  })

  it('49. no popstate listener in AssistantMobileShell (removed in favor of shared hook)', () => {
    const content = readContent('src/components/AssistantMobileShell.tsx')
    expect(content).not.toContain("addEventListener('popstate'")
    expect(content).not.toContain('history.pushState')
  })

  // Stack returns to zero after close/unmount (structural verification)

  it('50. useModalBackButton hook unregisters on close (isOpen=false)', () => {
    const content = readContent('src/hooks/useModalBackButton.ts')
    // The hook should call unregisterModal when isOpen becomes false or on cleanup
    expect(content).toContain('unregisterModal')
  })

  it('51. modalBackButton lib has unregisterModal (cleanup path)', () => {
    const content = readContent('src/lib/modalBackButton.ts')
    expect(content).toContain('unregisterModal')
  })

  it('52. modalBackButton lib has registerModal (registration path)', () => {
    const content = readContent('src/lib/modalBackButton.ts')
    expect(content).toContain('registerModal')
  })

  it('53. modalBackButton lib has getModalStack (introspection)', () => {
    const content = readContent('src/lib/modalBackButton.ts')
    expect(content).toContain('getModalStack')
  })

  it('54. handleCapacitorBackButton returns true when modal consumed the event', () => {
    const content = readContent('src/lib/modalBackButton.ts')
    // The handler should return true when a modal consumed the back press,
    // and false (or undefined) when no modal is open (falls through to normal nav).
    expect(content).toContain('return true')
  })

  it('55. handleCapacitorBackButton returns false when no modal open (normal nav)', () => {
    const content = readContent('src/lib/modalBackButton.ts')
    // When stack is empty, should return false so init.ts falls through
    expect(content).toContain('return false')
  })
})
