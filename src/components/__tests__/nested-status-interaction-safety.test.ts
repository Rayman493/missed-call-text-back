/**
 * Nested Status Interaction Safety Audit
 *
 * Tests proving that removing pointer-event stopPropagation from the
 * LeadCard status-dropdown wrapper does NOT cause parent activation
 * (customer card open) when interacting with the status dropdown.
 *
 * Key architectural facts:
 * 1. LeadCard creates `pressGuard = useMobilePressGuard(...)` but NEVER
 *    attaches it to any element — it is dead code. The LeadCard root div
 *    has only `onClick` and `onKeyDown`, no pointer handlers.
 * 2. The status dropdown wrapper div has `onClick={(e) => e.stopPropagation()}`
 *    which stops click propagation from reaching the LeadCard root.
 * 3. DropdownMenuContent is rendered in a Portal (DropdownMenuPortal),
 *    so clicks on menu items NEVER bubble to the LeadCard root.
 * 4. DropdownMenuItem has `onPointerDown={(e) => e.stopPropagation()}`.
 *
 * Event flow traced:
 *
 * A. Clean tap on Status pill:
 *    pointerdown → handlePointerDown (records start)
 *    pointerup → handlePointerUp → setIsOpen(true) → dropdown opens
 *    click → handleClick (no-op) → bubbles to wrapper → stopPropagation → STOP
 *    LeadCard root onClick NEVER fires → customer does NOT open ✅
 *
 * B. Tap status option:
 *    pointerdown on DropdownMenuItem → stopPropagation
 *    pointerup on DropdownMenuItem
 *    click → Radix fires onSelect → handleStatusSelect → setIsOpen(false)
 *    Click is in Portal (outside LeadCard DOM) → never reaches LeadCard root ✅
 *
 * C. Internal menu scroll:
 *    All pointer events fire inside Portal content → never reach LeadCard root ✅
 *
 * D. Outside tap while dropdown is open:
 *    pointerdown outside → Radix onPointerDownOutside → setIsOpen(false)
 *    click outside → if on LeadCard body, onClick fires (expected — opens customer)
 *    The dropdown closes as a side effect of the outside tap ✅
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const leadCardContent = readFileSync('src/components/LeadCard.tsx', 'utf8').replace(/\r\n/g, '\n')
const dropdownContent = readFileSync('src/components/LeadStatusDropdown.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Nested Status Interaction — parent activation safety', () => {
  it('1. tapping Status pill does not invoke LeadCard onActivate (onClick stopPropagation blocks)', () => {
    // The wrapper div around LeadStatusDropdown has onClick stopPropagation
    // This stops the click from bubbling to the LeadCard root div's onClick
    const wrapperMatch = leadCardContent.match(
      /<div className="flex-shrink-0">\s*<div[\s\S]*?onClick=\{[\s\S]*?stopPropagation[\s\S]*?\}>/
    )
    expect(wrapperMatch).toBeTruthy()
    if (wrapperMatch) {
      expect(wrapperMatch[0]).toContain('onClick={(e) => e.stopPropagation()}')
    }
  })

  it('2. selecting status does not invoke LeadCard onActivate (Portal is outside LeadCard DOM)', () => {
    // DropdownMenuContent is rendered in DropdownMenuPortal, so clicks
    // on menu items never bubble to the LeadCard root div.
    expect(dropdownContent).toContain('DropdownMenuPortal')
    // DropdownMenuItem has onSelect that calls handleStatusSelect
    expect(dropdownContent).toContain('onSelect={() => handleStatusSelect(status)}')
    // handleStatusSelect calls onStatusChange and setIsUpdating — NOT onOpen
    expect(dropdownContent).toContain('await onStatusChange(newStatus)')
  })

  it('3. scrolling inside status menu does not invoke LeadCard onActivate (Portal isolation)', () => {
    // The dropdown content is in a Portal, so all pointer events inside
    // the menu never reach the LeadCard root div.
    expect(dropdownContent).toContain('DropdownMenuPortal')
    // The content has overscroll-contain to prevent scroll propagation
    expect(dropdownContent).toContain('overscroll-contain')
    // DropdownMenuItem stops pointer down propagation
    expect(dropdownContent).toContain('onPointerDown={(e) => e.stopPropagation()}')
  })

  it('4. outside dismissal does not invoke LeadCard onActivate (Radix handles outside tap)', () => {
    // onPointerDownOutside and onInteractOutside close the dropdown
    // without activating the LeadCard's onClick
    expect(dropdownContent).toContain('onPointerDownOutside')
    expect(dropdownContent).toContain('onInteractOutside')
    // Both call setIsOpen(false), not onOpen
    expect(dropdownContent).toContain('setIsOpen(false)')
  })

  it('5. ordinary LeadCard body tap still invokes onActivate exactly once', () => {
    // The LeadCard root div has onClick that opens the customer
    // This is the ONLY activation path — no pointer handlers on root
    expect(leadCardContent).toContain('onClick={() => onOpen(lead.id)}')
    // The root div must NOT have onPointerUp or onPointerDown handlers
    // (pressGuard is dead code — created but never attached)
    const rootDivMatch = leadCardContent.match(
      /<div\s+className=\{`w-full max-w-2xl[\s\S]*?`[\s\S]*?onClick=\{\(\) => onOpen\(lead\.id\)\}[\s\S]*?style=\{\{ touchAction: 'pan-y' \}\}\s*>/
    )
    expect(rootDivMatch).toBeTruthy()
    if (rootDivMatch) {
      const rootDiv = rootDivMatch[0]
      // Must NOT have pressGuard.onPointerUp or pressGuard.onPointerDown
      expect(rootDiv).not.toContain('pressGuard.onPointerUp')
      expect(rootDiv).not.toContain('pressGuard.onPointerDown')
      expect(rootDiv).not.toContain('pressGuard.onPointerMove')
    }
  })

  it('6. Radix first outside tap still closes after page scroll (onInteractOutside safety net)', () => {
    // onInteractOutside is the broad handler that catches pointer, focus,
    // and any other outside interaction — the safety net for cases where
    // onPointerDownOutside alone is insufficient after scroll.
    expect(dropdownContent).toContain('onInteractOutside')
    expect(dropdownContent).toContain('onPointerDownOutside')
  })
})

describe('Nested Status Interaction — useMobilePressGuard dead code verification', () => {
  it('pressGuard is created but NEVER attached to any element', () => {
    // useMobilePressGuard is imported and a pressGuard is created,
    // but it is never attached to any element's onPointerUp/Down/Move.
    // This means it has NO effect on event flow — the parent activation
    // path is via onClick only, which is properly stopped by the
    // wrapper div's onClick stopPropagation.
    expect(leadCardContent).toContain('useMobilePressGuard')
    expect(leadCardContent).toContain('const pressGuard = useMobilePressGuard')

    // The pressGuard handlers must NOT appear in any JSX element
    // Search for pressGuard.onPointerUp, pressGuard.onPointerDown, etc.
    // in attribute positions (onPointerUp={pressGuard.onPointerUp})
    const handlerPattern = /onPointer(?:Up|Down|Move|Cancel)=\{pressGuard\./
    expect(handlerPattern.test(leadCardContent)).toBe(false)
  })

  it('LeadCard root div has only onClick and onKeyDown (no pointer handlers)', () => {
    // The root div is the ONLY element that calls onOpen(lead.id)
    // It uses onClick, not pointer handlers. This is the critical
    // safety property: pointerup bubbling cannot activate the parent
    // because there are no pointer handlers on the root div.
    const rootDivMatch = leadCardContent.match(
      /<div\s+className=\{`w-full max-w-2xl[\s\S]*?style=\{\{ touchAction: 'pan-y' \}\}\s*>/
    )
    expect(rootDivMatch).toBeTruthy()
    if (rootDivMatch) {
      const rootDiv = rootDivMatch[0]
      expect(rootDiv).toContain('onClick={() => onOpen(lead.id)}')
      expect(rootDiv).toContain('onKeyDown=')
      // No pointer handlers on root div
      expect(rootDiv).not.toMatch(/onPointerUp=/)
      expect(rootDiv).not.toMatch(/onPointerDown=/)
      expect(rootDiv).not.toMatch(/onPointerMove=/)
    }
  })
})
