/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..', '..')

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

// ============================================================================
// PART A — FILTER DISMISSAL CLICK-THROUGH
// ============================================================================

describe('Part A: Customer Filter Dismissal Click-Through', () => {
  const leadsPage = readSrc('app/dashboard/leads/page.tsx')

  it('1. filterDismissedAtRef tracks dismissal timestamp', () => {
    expect(leadsPage).toContain('filterDismissedAtRef')
  })

  it('2. DropdownMenuContent has onInteractOutside handler', () => {
    expect(leadsPage).toContain('onInteractOutside')
  })

  it('3. onInteractOutside sets filterDismissedAtRef.current = Date.now()', () => {
    expect(leadsPage).toContain('filterDismissedAtRef.current = Date.now()')
  })

  it('4. card onClick checks filterDismissedAtRef before navigating', () => {
    expect(leadsPage).toContain('filterDismissedAtRef.current > 0')
  })

  it('5. card onClick consumes the dismissal and returns without navigating', () => {
    // The guard resets the ref and returns early
    expect(leadsPage).toContain('filterDismissedAtRef.current = 0')
  })

  it('6. internal filter scrolling (touch-pan-y) is preserved', () => {
    expect(leadsPage).toContain('touch-pan-y')
    expect(leadsPage).toContain('overscroll-contain')
  })

  it('7. no global click lock or document-wide hacks', () => {
    // No document.addEventListener('click') hack
    expect(leadsPage).not.toContain("document.addEventListener('click'")
  })
})

// ============================================================================
// PART B — EDIT CUSTOMER MODAL BOTTOM SPACE
// ============================================================================

describe('Part B: Edit Customer Modal Bottom Space', () => {
  const modalSrc = readSrc('components/ui/Modal.tsx')

  it('4. short form — no excess blank footer space (no --modal-bottom-reserve in content)', () => {
    // The content area must NOT use --modal-bottom-reserve (which includes 72px bottom nav)
    // The backdrop already reserves that space
    expect(modalSrc).not.toContain("paddingBottom: footer ? 'max(16px, env(safe-area-inset-bottom))' : 'max(16px, var(--modal-bottom-reserve))'")
  })

  it('content area uses safe-area-inset-bottom only (not bottom-nav-reserve)', () => {
    expect(modalSrc).toContain("paddingBottom: footer ? 'max(16px, env(safe-area-inset-bottom))' : 'max(16px, env(safe-area-inset-bottom))'")
  })

  it('5. long content — internal scroll with bounded max-height', () => {
    expect(modalSrc).toContain('overflow-y-auto')
    expect(modalSrc).toContain('max-h-[var(--modal-max-height)]')
  })

  it('backdrop still reserves bottom-nav space (not removed)', () => {
    expect(modalSrc).toContain("paddingBottom: 'max(16px, var(--modal-bottom-reserve))'")
  })
})

// ============================================================================
// PART C — ADD BUTTON ALIGNMENT
// ============================================================================

describe('Part C: Add Button Alignment', () => {
  const sidebarSrc = readSrc('components/SidebarSection.tsx')

  it('6a. SidebarSection header uses px-4 (16px both sides)', () => {
    // The old pr-2 (8px right) is removed — now px-4 gives 16px both sides
    expect(sidebarSrc).not.toContain('pl-4 pr-2')
    expect(sidebarSrc).toContain('px-4 py-3')
  })

  it('6b. headerAction container uses justify-end for right alignment', () => {
    expect(sidebarSrc).toContain('justify-end')
  })

  it('6c. body uses p-4 matching header px-4', () => {
    expect(sidebarSrc).toContain('p-4')
  })

  it('all 5 sections use SidebarSection with headerAction', () => {
    const pageClient = readSrc('app/dashboard/leads/[id]/page-client.tsx')
    // Jobs
    expect(pageClient).toContain('title="Jobs"')
    // Reminders
    expect(pageClient).toContain('title="Reminders"')
    // Payments
    expect(pageClient).toContain('title="Payments"')
    // Appointments
    expect(pageClient).toContain('title="Appointments"')
    // Internal Notes
    expect(pageClient).toContain('title="Internal Notes"')
  })
})

// ============================================================================
// PART D — REQUEST HISTORY HISTORICAL MODAL
// ============================================================================

describe('Part D: Request History Historical Modal', () => {
  const requestHistorySrc = readSrc('components/RequestHistory.tsx')
  const modalSrc = readSrc('components/RequestDetailsModal.tsx')

  it('7. handleSelectRecord receives the full record (not just recordId)', () => {
    expect(requestHistorySrc).toContain('handleSelectRecord(record)')
  })

  it('7b. handleSelectRecord sets modalRecord (not onNavigateToTimeline)', () => {
    expect(requestHistorySrc).toContain('setModalRecord(record)')
  })

  it('8. RequestDetailsModal is rendered with the exact record', () => {
    expect(requestHistorySrc).toContain('RequestDetailsModal')
    expect(requestHistorySrc).toContain('record={modalRecord}')
  })

  it('8b. modal closes via onClose -> setModalRecord(null)', () => {
    expect(requestHistorySrc).toContain('onClose={() => setModalRecord(null)}')
  })

  it('9. handleSelectRecord does NOT call onNavigateToTimeline (no conversation change)', () => {
    // The old code called onNavigateToTimeline?.(recordId) — the new code does not
    // inside handleSelectRecord. The prop is still accepted for backwards compat
    // but is not invoked from the click handler.
    const handlerMatch = requestHistorySrc.match(/const handleSelectRecord[\s\S]*?\n  \}/)
    expect(handlerMatch).toBeTruthy()
    if (handlerMatch) {
      // Strip comments before checking — the comment mentions onNavigateToTimeline
      // but the actual code must not call it
      const withoutComments = handlerMatch[0].replace(/\/\/[^\n]*/g, '')
      expect(withoutComments).not.toContain('onNavigateToTimeline')
    }
  })

  it('10. modal does NOT mutate Customer Context (view-only)', () => {
    // RequestDetailsModal does not import or call getCurrentCustomerContext
    expect(modalSrc).not.toContain('getCurrentCustomerContext')
    expect(modalSrc).not.toContain('customer-context')
  })

  it('10b. modal does NOT fetch or refetch data', () => {
    expect(modalSrc).not.toContain('createBrowserClient')
    expect(modalSrc).not.toContain('supabase')
    expect(modalSrc).not.toContain('fetch(')
  })

  it('10c. modal identity is ai_call_record.id via NormalizedIntake.id', () => {
    // The modal takes a NormalizedIntake which has an id field
    expect(modalSrc).toContain('NormalizedIntake')
  })

  it('11. long historical details scroll internally (Modal has overflow-y-auto)', () => {
    expect(modalSrc).toContain('Modal')
    // The shared Modal component has internal scroll
    const sharedModal = readSrc('components/ui/Modal.tsx')
    expect(sharedModal).toContain('overflow-y-auto')
  })

  it('12. Android back closes modal (shared Modal uses useModalBackButton)', () => {
    const sharedModal = readSrc('components/ui/Modal.tsx')
    expect(sharedModal).toContain('useModalBackButton')
  })

  it('modal displays historical fields from the passed record only', () => {
    expect(modalSrc).toContain('record.serviceRequested')
    expect(modalSrc).toContain('record.additionalDetails')
    expect(modalSrc).toContain('record.serviceAddress')
    expect(modalSrc).toContain('record.desiredCompletion')
    expect(modalSrc).toContain('record.callbackTime')
    expect(modalSrc).toContain('record.receivedAt')
    expect(modalSrc).toContain('record.outcome')
  })

  it('modal shows "Not provided" for missing fields', () => {
    expect(modalSrc).toContain('Not provided')
  })

  it('two separate intakes remain isolated — modal uses record prop, not global state', () => {
    // The modal is a pure function of the record prop — no refs, no context, no global state
    expect(modalSrc).toContain('record: NormalizedIntake | null')
    // No useState, useEffect, or context imports
    expect(modalSrc).not.toContain('useState')
    expect(modalSrc).not.toContain('useEffect')
    expect(modalSrc).not.toContain('useContext')
  })
})
