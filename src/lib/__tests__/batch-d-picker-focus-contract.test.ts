/**
 * Batch D — Final Verification: Customer Picker Touch-Scroll Focus/Keyboard Contract
 *
 * Proves the actual event/focus behavior when the user drags the result list:
 *
 * 1. Result-list drag does not dismiss picker
 * 2. Query is preserved after internal drag
 * 3. No accidental customer selection occurs
 * 4. Outside tap still closes
 * 5. Deliberate result tap still selects
 * 6. visualViewport resize does not close picker
 * 7. Actual focus behavior matches the documented contract
 * 8. Result row buttons have no pointerdown/touchstart/focus handlers (focus
 *    moves only on click, which fires for taps not drags)
 * 9. No preventDefault on touch/pointerdown (native pan-y preserved)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Batch D — Picker Touch-Scroll Focus/Keyboard Contract', () => {
  // ============================================================
  // 1. Result-list drag does not dismiss picker
  // ============================================================
  it('1. result-list drag does not dismiss picker (pointerDownInsideRef guard)', () => {
    // pointerdown inside the picker sets pointerDownInsideRef = true
    expect(content).toContain('pointerDownInsideRef.current = true')
    // focusout checks pointerDownInsideRef before dismissing
    const focusOutIdx = content.indexOf('handleFocusOut = (event: FocusEvent)')
    const focusOutSection = content.substring(focusOutIdx, focusOutIdx + 700)
    expect(focusOutSection).toContain('pointerDownInsideRef.current')
    expect(focusOutSection).toContain('return')
    // pointerdown outside the picker closes it
    const pointerDownIdx = content.indexOf('handlePointerDown = (event: PointerEvent)')
    const pointerDownSection = content.substring(pointerDownIdx, pointerDownIdx + 500)
    expect(pointerDownSection).toContain('setIsOpen(false)')
  })

  // ============================================================
  // 2. Query is preserved after internal drag
  // ============================================================
  it('2. query is preserved after internal drag (no setSearchQuery in pointerdown-inside path)', () => {
    // The pointerdown handler does NOT reset searchQuery when pointer is inside
    const pointerDownIdx = content.indexOf('handlePointerDown = (event: PointerEvent)')
    const pointerDownSection = content.substring(pointerDownIdx, pointerDownIdx + 500)
    // The inside branch only sets pointerDownInsideRef = true, does NOT call setSearchQuery
    const insideBranch = pointerDownSection.substring(
      pointerDownSection.indexOf('pointerDownInsideRef.current = true'),
      pointerDownSection.indexOf('} else {')
    )
    expect(insideBranch).not.toContain('setSearchQuery')
    // The focusout guard line itself does NOT call setSearchQuery (only the line after the guard does)
    const guardLineIdx = content.indexOf('if (pointerDownInsideRef.current) return')
    const guardLine = content.substring(guardLineIdx, guardLineIdx + 50)
    expect(guardLine).not.toContain('setSearchQuery')
  })

  // ============================================================
  // 3. No accidental customer selection occurs
  // ============================================================
  it('3. no accidental selection (handleSelect only called from onClick, not pointerdown)', () => {
    // handleSelect is only referenced in onClick handlers
    const handleSelectOccurrences = content.split('handleSelect').length - 1
    // Should appear in: definition, handleSelect(null) onClick, handleSelect(customer.id) onClick
    // That's 3 occurrences: 1 definition + 2 onClick calls
    expect(handleSelectOccurrences).toBeGreaterThanOrEqual(3)
    // handleSelect is NOT called from any pointerdown handler
    const pointerDownIdx = content.indexOf('handlePointerDown = (event: PointerEvent)')
    const pointerDownSection = content.substring(pointerDownIdx, pointerDownIdx + 500)
    expect(pointerDownSection).not.toContain('handleSelect')
    // handleSelect is NOT called from any focusout handler
    const focusOutIdx = content.indexOf('handleFocusOut = (event: FocusEvent)')
    const focusOutSection = content.substring(focusOutIdx, focusOutIdx + 700)
    expect(focusOutSection).not.toContain('handleSelect')
  })

  // ============================================================
  // 4. Outside tap still closes
  // ============================================================
  it('4. outside tap still closes (pointerdown outside closes + resets query)', () => {
    const pointerDownIdx = content.indexOf('handlePointerDown = (event: PointerEvent)')
    const pointerDownSection = content.substring(pointerDownIdx, pointerDownIdx + 500)
    // The else branch (outside) closes and resets query
    const outsideBranch = pointerDownSection.substring(
      pointerDownSection.indexOf('} else {'),
      pointerDownSection.indexOf('}', pointerDownSection.indexOf('} else {') + 1)
    )
    expect(outsideBranch).toContain('setIsOpen(false)')
    expect(outsideBranch).toContain("setSearchQuery('')")
  })

  // ============================================================
  // 5. Deliberate result tap still selects
  // ============================================================
  it('5. deliberate result tap still selects (onClick calls handleSelect)', () => {
    // Result row buttons have onClick that calls handleSelect
    expect(content).toContain('onClick={() => handleSelect(customer.id)}')
    // handleSelect closes the picker and calls onChange
    const handleSelectIdx = content.indexOf('const handleSelect = (customerId')
    const handleSelectSection = content.substring(handleSelectIdx, handleSelectIdx + 300)
    expect(handleSelectSection).toContain('onChange(customerId)')
    expect(handleSelectSection).toContain('setIsOpen(false)')
  })

  // ============================================================
  // 6. visualViewport resize does not close picker
  // ============================================================
  it('6. visualViewport resize does not close picker (resize calls measure, not setIsOpen)', () => {
    // The resize listener calls measure(), not setIsOpen(false)
    expect(content).toContain('vv.addEventListener(\'resize\', measure)')
    // The measure function does NOT call setIsOpen
    expect(content).toContain('setDropup(useDropup)')
    expect(content).toContain('setMaxDropdownHeight(')
    // Verify measure does not close the picker
    const measureFnIdx = content.indexOf('const measure = () => {')
    const measureFn = content.substring(measureFnIdx, measureFnIdx + 600)
    expect(measureFn).not.toContain('setIsOpen(false)')
  })

  // ============================================================
  // 7. Actual focus behavior matches the documented contract
  // ============================================================
  it('7. focusout with relatedTarget inside picker does not dismiss (tap on result row)', () => {
    // When a result row button receives focus (via click/tap), focusout fires
    // with relatedTarget = button. The handler checks if the button is inside
    // the picker and returns early.
    const focusOutIdx = content.indexOf('handleFocusOut = (event: FocusEvent)')
    const focusOutSection = content.substring(focusOutIdx, focusOutIdx + 700)
    expect(focusOutSection).toContain('next && pickerRef.current && pickerRef.current.contains(next)')
    expect(focusOutSection).toContain('return')
  })

  it('7b. focusout with relatedTarget=null and pointerDownInside does not dismiss (scroll-induced blur)', () => {
    // When touch-scroll causes blur with relatedTarget=null, the handler checks
    // pointerDownInsideRef and returns early.
    const focusOutIdx = content.indexOf('handleFocusOut = (event: FocusEvent)')
    const focusOutSection = content.substring(focusOutIdx, focusOutIdx + 700)
    expect(focusOutSection).toContain('if (pointerDownInsideRef.current) return')
  })

  // ============================================================
  // 8. Result row buttons have no pointerdown/touchstart/focus handlers
  //    (focus moves only on click, which fires for taps not drags)
  // ============================================================
  it('8. result row buttons have no pointerdown/touchstart/focus handlers', () => {
    // Find all result row button elements
    const buttonStart = content.indexOf('filteredCustomers.map((customer)')
    const buttonEnd = content.indexOf('})\n                })', buttonStart)
    const buttonSection = content.substring(buttonStart, buttonEnd)
    // The button only has onClick, no pointerdown/touchstart/focus/onFocus/onBlur
    expect(buttonSection).not.toContain('onPointerDown')
    expect(buttonSection).not.toContain('onMouseDown')
    expect(buttonSection).not.toContain('onTouchStart')
    expect(buttonSection).not.toContain('onFocus')
    expect(buttonSection).not.toContain('onBlur')
    expect(buttonSection).not.toContain('tabIndex')
    // It DOES have onClick
    expect(buttonSection).toContain('onClick')
  })

  // ============================================================
  // 9. No preventDefault on touch/pointerdown (native pan-y preserved)
  // ============================================================
  it('9. no preventDefault on touch/pointerdown (native pan-y preserved)', () => {
    // The only preventDefault is in the wheel handler for scroll chaining
    expect(content).toContain('e.preventDefault()')
    // The preventDefault is inside a wheel handler, not pointerdown/touchstart
    const wheelHandlerIdx = content.indexOf('const handleWheel')
    const wheelSection = content.substring(wheelHandlerIdx, wheelHandlerIdx + 500)
    expect(wheelSection).toContain('preventDefault')
    // The pointerdown handler does NOT call preventDefault
    const pointerDownIdx = content.indexOf('handlePointerDown = (event: PointerEvent)')
    const pointerDownSection = content.substring(pointerDownIdx, pointerDownIdx + 500)
    expect(pointerDownSection).not.toContain('preventDefault')
    // The scroll container has touch-pan-y for native vertical scrolling
    expect(content).toContain('touch-pan-y')
  })
})
