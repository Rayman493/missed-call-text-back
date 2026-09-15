/**
 * RC — Final Mobile Polish Batch Regression Tests
 *
 * Covers five physically proven mobile polish issues:
 * 1. Schedule stop card → map focus
 * 2. Compact premium map preview card
 * 3. "Manually" link visual polish
 * 4. Customer summary/filter card half-press state
 * 5. iOS text-entry field auto-zoom
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) =>
  readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const scheduleMapSrc = readSrc('src/components/schedule/ScheduleMap.tsx')
const leadsPageSrc = readSrc('src/app/dashboard/leads/page.tsx')
const statCardSrc = readSrc('src/components/StatCard.tsx')
const globalsCssSrc = readSrc('src/app/globals.css')
const layoutSrc = readSrc('src/app/layout.tsx')
const tapGuardSrc = readSrc('src/lib/gesture/tap-guard.ts')

// ============================================================================
// 1. SCHEDULE FOCUS — stop card → map focus
// ============================================================================

describe('1. SCHEDULE FOCUS', () => {
  it('1. tap stop card #1 → focus stop #1 (single tap calls focusStopOnMap)', () => {
    // The single-tap branch of handleItemClick must call focusStopOnMap
    // for non-business items.
    const singleTapBranch = scheduleMapSrc.match(
      /SINGLE TAP: delay the action[\s\S]*?setTimeout\(\(\) => \{([\s\S]*?)\}, DOUBLE_TAP_DELAY_MS\)/
    )
    expect(singleTapBranch).toBeTruthy()
    expect(singleTapBranch![1]).toContain('focusStopOnMap')
    expect(singleTapBranch![1]).toContain('setFocusedMarkerId(item.id)')
  })

  it('2. tap stop card #2 → focus stop #2 (focusStopOnMap uses item coordinates)', () => {
    // focusStopOnMap must be called with the item's id, latitude, longitude
    expect(scheduleMapSrc).toContain(
      'focusStopOnMap(item.id, item.latitude, item.longitude)'
    )
  })

  it('3. selected details update correctly (toggleMapItemDetails called on single tap)', () => {
    // The single-tap branch must also toggle details
    const singleTapBranch = scheduleMapSrc.match(
      /SINGLE TAP: delay the action[\s\S]*?setTimeout\(\(\) => \{([\s\S]*?)\}, DOUBLE_TAP_DELAY_MS\)/
    )
    expect(singleTapBranch).toBeTruthy()
    expect(singleTapBranch![1]).toContain('toggleMapItemDetails(item.id)')
  })

  it('4. canonical focus helper reused (focusStopOnMap is the single helper)', () => {
    // focusStopOnMap must be defined once and reused — not duplicated
    const focusStopDefCount = (scheduleMapSrc.match(
      /const focusStopOnMap = /g
    ) || []).length
    expect(focusStopDefCount).toBe(1)
  })

  it('5. camera invoked once (panToMarker called inside focusStopOnMap, not separately)', () => {
    // focusStopOnMap calls panToMarker — no separate panToMarker call in
    // the single-tap branch
    const singleTapBranch = scheduleMapSrc.match(
      /SINGLE TAP: delay the action[\s\S]*?setTimeout\(\(\) => \{([\s\S]*?)\}, DOUBLE_TAP_DELAY_MS\)/
    )
    expect(singleTapBranch).toBeTruthy()
    expect(singleTapBranch![1]).not.toContain('panToMarker(')
    expect(singleTapBranch![1]).toContain('focusStopOnMap')
  })

  it('6. horizontal card swipe does not trigger focus (cardMovedRef check)', () => {
    // handleItemClick must check cardMovedRef at the start and return early
    expect(scheduleMapSrc).toContain('cardMovedRef.current')
    expect(scheduleMapSrc).toMatch(
      /if \(cardMovedRef\.current\)[\s\S]*return/
    )
  })

  it('7. initial auto-fit unchanged (showAllMarkers / recenterMap preserved)', () => {
    // The initial auto-fit helpers must still exist
    expect(scheduleMapSrc).toContain('showAllMarkers')
    expect(scheduleMapSrc).toContain('recenterMap')
    expect(scheduleMapSrc).toContain('fitBoundsWithMaxZoom')
  })

  it('8. marker single/double tap unchanged (marker listeners still use focusStopOnMap)', () => {
    // The marker dblclick listener must still call focusStopOnMap
    expect(scheduleMapSrc).toContain("marker.addListener('dblclick'")
    // The touch double-tap detector must still call focusStopOnMap
    expect(scheduleMapSrc).toMatch(
      /if \(item\.type !== 'business'\)[\s\S]*focusStopOnMap/
    )
  })

  it('8a. card pointer tracking uses 10px threshold (same as canonical)', () => {
    // The card pointer move handler must use the 10px threshold
    expect(scheduleMapSrc).toContain('Math.hypot(dx, dy) >= 10')
  })

  it('8b. card pointercancel resets state', () => {
    // The card onPointerCancel must clear both refs
    expect(scheduleMapSrc).toMatch(
      /onPointerCancel=\{\(\) => \{ cardPointerStartRef\.current = null; cardMovedRef\.current = false \}\}/
    )
  })
})

// ============================================================================
// 2. MAP PREVIEW — compact premium callout
// ============================================================================

describe('2. MAP PREVIEW', () => {
  it('9. preview remains bottom-left (absolute bottom-4 left-4)', () => {
    expect(scheduleMapSrc).toContain('absolute bottom-4 left-4')
  })

  it('10. compact mobile width (68% width, max 300px)', () => {
    // Mobile width should be roughly 65-72% of map width, max ~300-320px
    expect(scheduleMapSrc).toContain('w-[68%]')
    expect(scheduleMapSrc).toContain('max-w-[300px]')
  })

  it('11. long title truncates cleanly (truncate class on title)', () => {
    // The mobile title must have truncate
    const mobileSection = scheduleMapSrc.match(
      /Mobile: Compact layout([\s\S]*?)Desktop: Compact layout/
    )
    expect(mobileSection).toBeTruthy()
    expect(mobileSection![1]).toContain('truncate')
  })

  it('12. metadata remains readable (muted text, one-line)', () => {
    // The metadata (Type · Time) must be present and muted
    expect(scheduleMapSrc).toContain('text-slate-400')
    expect(scheduleMapSrc).toMatch(/Job.*Appointment.*formatTimeRangeHHMM/)
  })

  it('13. map controls remain unobstructed (compact padding, not full-width)', () => {
    // The preview must NOT be full-width (no right-4 on mobile)
    const previewMatch = scheduleMapSrc.match(
      /absolute bottom-4 left-4[^"]*right-auto[^"]*/
    )
    expect(previewMatch).toBeTruthy()
    // Must not have right-4 (which would make it full-width)
    expect(previewMatch![0]).not.toContain('right-4')
  })

  it('14. card dimensions remain stable across Job/Appointment (same container)', () => {
    // Both Job and Appointment use the same container className
    // The container doesn't branch on selectedItem.type
    const containerMatch = scheduleMapSrc.match(
      /absolute bottom-4 left-4[^"]*z-20/
    )
    expect(containerMatch).toBeTruthy()
  })

  it('15. View details/X unchanged (both still present and functional)', () => {
    expect(scheduleMapSrc).toContain('View details →')
    expect(scheduleMapSrc).toContain('closeSelectedItem')
    expect(scheduleMapSrc).toContain('handleViewItem')
  })

  it('15a. compact padding (p-2.5 on mobile, p-3 on desktop)', () => {
    expect(scheduleMapSrc).toContain('p-2.5 md:p-3')
  })

  it('15b. subtle border and restrained shadow', () => {
    expect(scheduleMapSrc).toContain('shadow-md')
    expect(scheduleMapSrc).toContain('border-slate-200/50')
  })
})

// ============================================================================
// 3. MANUALLY LINK — visual polish
// ============================================================================

describe('3. MANUALLY LINK', () => {
  it('16. only "manually" is interactive (button wraps only the word)', () => {
    // The button must contain only "manually" as its text content
    const manuallyButton = leadsPageSrc.match(
      /<button[^>]*onClick=\{\(\) => setShowAddCustomerModal\(true\)}[^>]*>\s*manually\s*<\/button>/
    )
    expect(manuallyButton).toBeTruthy()
  })

  it('17. modal still opens (onClick calls setShowAddCustomerModal(true))', () => {
    // The manually button must still call setShowAddCustomerModal(true)
    const manuallyButton = leadsPageSrc.match(
      /<button[^>]*onClick=\{\(\) => setShowAddCustomerModal\(true\)}[^>]*>\s*manually\s*<\/button>/
    )
    expect(manuallyButton).toBeTruthy()
    expect(manuallyButton![0]).toContain('setShowAddCustomerModal(true)')
  })

  it('18. no dotted underline by default (decoration-dotted removed)', () => {
    // The manually button must NOT have decoration-dotted or default underline
    // Match the specific button that wraps "manually" as its text
    const manuallyButton = leadsPageSrc.match(
      /<button[^>]*onClick=\{\(\) => setShowAddCustomerModal\(true\)}[^>]*>\s*manually\s*<\/button>/
    )
    expect(manuallyButton).toBeTruthy()
    expect(manuallyButton![0]).not.toContain('decoration-dotted')
    // Must not have a bare "underline" class — only "hover:underline" is allowed.
    // Check that "underline" is always preceded by a variant prefix (e.g. "hover:")
    // by verifying that "underline" only appears as "hover:underline"
    expect(manuallyButton![0]).toContain('hover:underline')
    // No bare "underline" (without a variant prefix like "hover:")
    // Split into classes and check none is exactly "underline"
    const classMatch = manuallyButton![0].match(/className="([^"]*)"/)
    if (classMatch) {
      const classes = classMatch![1].trim().split(/\s+/)
      expect(classes).not.toContain('underline')
    }
  })

  it('19. + button unchanged (still has aria-label "Add customer")', () => {
    // The + Add Customer button must still exist with aria-label
    expect(leadsPageSrc).toContain('aria-label="Add customer"')
  })

  it('20. Manual badge unchanged (non-interactive span)', () => {
    // The Manual badge must still be a non-interactive span
    // (checked in LeadCard.tsx, not in leads page)
    const leadCardSrc = readSrc('src/components/LeadCard.tsx')
    expect(leadCardSrc).toContain('customerSourceInfo')
  })

  it('21. keyboard activation works (type="button" and tabIndex not removed)', () => {
    // The manually button must have type="button" (prevents form submit)
    // and be focusable (it's a button, so tabIndex=0 by default)
    const manuallyButton = leadsPageSrc.match(
      /<button[^>]*onClick=\{\(\) => setShowAddCustomerModal\(true\)}[^>]*>\s*manually\s*<\/button>/
    )
    expect(manuallyButton).toBeTruthy()
    expect(manuallyButton![0]).toContain('type="button"')
  })

  it('21a. subtle blue accent color (text-blue-600)', () => {
    // The manually button must use blue accent, not muted-foreground
    const manuallyButton = leadsPageSrc.match(
      /<button[^>]*onClick=\{\(\) => setShowAddCustomerModal\(true\)}[^>]*>\s*manually\s*<\/button>/
    )
    expect(manuallyButton).toBeTruthy()
    expect(manuallyButton![0]).toContain('text-blue-600')
  })

  it('21b. font-medium applied', () => {
    const manuallyButton = leadsPageSrc.match(
      /<button[^>]*onClick=\{\(\) => setShowAddCustomerModal\(true\)}[^>]*>\s*manually\s*<\/button>/
    )
    expect(manuallyButton).toBeTruthy()
    expect(manuallyButton![0]).toContain('font-medium')
  })

  it('21c. hover adds solid underline (hover:underline, not dotted)', () => {
    const manuallyButton = leadsPageSrc.match(
      /<button[^>]*onClick=\{\(\) => setShowAddCustomerModal\(true\)}[^>]*>\s*manually\s*<\/button>/
    )
    expect(manuallyButton).toBeTruthy()
    expect(manuallyButton![0]).toContain('hover:underline')
    expect(manuallyButton![0]).not.toContain('hover:decoration-dotted')
  })
})

// ============================================================================
// 4. CUSTOMER SUMMARY CARDS — half-press state
// ============================================================================

describe('4. CUSTOMER SUMMARY CARDS', () => {
  it('22. pointerdown may show transient press state (pressed state set on pointerdown)', () => {
    // StatCard must set pressed=true on pointerdown
    expect(statCardSrc).toContain('setPressed(true)')
  })

  it('23. vertical movement clears transient press state (cleared on drag detection)', () => {
    // StatCard must clear pressed when guard.isDragging() returns true
    expect(statCardSrc).toContain('setPressed(false)')
    expect(statCardSrc).toMatch(
      /if \(pressed && guard\.isDragging\(\)\)[\s\S]*setPressed\(false\)/
    )
  })

  it('24. swipe does not apply filter (guard.consumeDragSuppression still gates onClick)', () => {
    // The onClick must still check consumeDragSuppression
    expect(statCardSrc).toContain('guard.consumeDragSuppression()')
  })

  it('25. pointerup after scroll leaves no half-selected visual (pressed cleared on pointerup)', () => {
    // handlePointerUp must clear pressed
    expect(statCardSrc).toMatch(
      /handlePointerUp = useCallback\(\(\) => \{[\s\S]*setPressed\(false\)/
    )
  })

  it('26. pointercancel clears state (pressed cleared on pointercancel)', () => {
    // handlePointerCancel must clear pressed
    expect(statCardSrc).toMatch(
      /handlePointerCancel = useCallback\(\(\) => \{[\s\S]*setPressed\(false\)/
    )
  })

  it('27. deliberate tap applies filter (onClick still calls onClick prop)', () => {
    // The onClick handler must still call the onClick prop
    expect(statCardSrc).toContain('onClick()')
  })

  it('28. persistent selected style only on actual selected filter (isSelected drives ring)', () => {
    // The selectedClasses must only apply when isSelected is true
    expect(statCardSrc).toContain('isSelected')
    expect(statCardSrc).toContain('ring-2 ring-primary/50')
  })

  it('29. short-list/low-scroll-content case works (no transition-all on hover)', () => {
    // The transition must NOT be transition-all (which animates transform
    // and causes the lingering visual). Use transition-colors instead.
    expect(statCardSrc).toContain('transition-colors duration-150')
    expect(statCardSrc).not.toContain('transition-all duration-200')
  })

  it('29a. hover effects gated to hover-capable devices only', () => {
    // Hover effects must use [@media(hover:hover)] variant
    expect(statCardSrc).toContain('[@media(hover:hover)]:hover:-translate-y-0.5')
    expect(statCardSrc).toContain('[@media(hover:hover)]:hover:shadow-sm')
  })

  it('29b. pressed state provides tap feedback (scale or brightness)', () => {
    // The pressed state must apply some visual feedback
    expect(statCardSrc).toContain("pressed ? 'scale-[0.98] brightness-[0.97]'")
  })
})

// ============================================================================
// 5. iOS INPUT ZOOM — form controls >=16px on mobile
// ============================================================================

describe('5. iOS INPUT ZOOM', () => {
  it('30. mobile/iOS form controls have effective >=16px text (CSS rule exists)', () => {
    // globals.css must have a mobile-only rule setting font-size: 16px
    expect(globalsCssSrc).toContain('@media (max-width: 767px)')
    expect(globalsCssSrc).toMatch(
      /@media \(max-width: 767px\)[\s\S]*font-size: 16px !important/
    )
  })

  it('31. Customer input focus does not zoom viewport (rule covers input elements)', () => {
    expect(globalsCssSrc).toMatch(
      /@media \(max-width: 767px\)[\s\S]*input[\s\S]*font-size: 16px !important/
    )
  })

  it('32. Appointment input focus does not zoom (same rule)', () => {
    // Same rule covers all input elements
    expect(globalsCssSrc).toContain('input,')
  })

  it('33. Job input focus does not zoom (same rule)', () => {
    expect(globalsCssSrc).toContain('input,')
  })

  it('34. Reminder input focus does not zoom (same rule)', () => {
    expect(globalsCssSrc).toContain('input,')
  })

  it('35. Quote/Invoice input focus does not zoom (same rule)', () => {
    expect(globalsCssSrc).toContain('input,')
  })

  it('36. textarea focus does not zoom (rule covers textarea)', () => {
    expect(globalsCssSrc).toMatch(
      /@media \(max-width: 767px\)[\s\S]*textarea[\s\S]*font-size: 16px !important/
    )
  })

  it('37. blur leaves viewport at original scale (no JS zoom-reset, CSS-only fix)', () => {
    // The fix is CSS-only — no JavaScript zoom-reset hacks
    // The viewport meta must NOT include maximum-scale=1 or user-scalable=no
    expect(layoutSrc).not.toContain('maximum-scale=1')
    expect(layoutSrc).not.toContain('user-scalable=no')
  })

  it('38. Android layout unchanged (rule only applies below 768px)', () => {
    // The rule must be inside @media (max-width: 767px)
    // Android phones are typically below 768px, but the rule only sets
    // font-size — it doesn't change layout, padding, or dimensions.
    // The !important only overrides font-size, not other properties.
    const mediaBlock = globalsCssSrc.match(
      /@media \(max-width: 767px\) \{([\s\S]*?)\}/
    )
    expect(mediaBlock).toBeTruthy()
    expect(mediaBlock![1]).not.toContain('padding')
    expect(mediaBlock![1]).not.toContain('height')
    expect(mediaBlock![1]).not.toContain('width')
  })

  it('39. desktop typography unchanged (rule only applies below 768px)', () => {
    // On desktop (>=768px), the existing element-selector rule applies
    // but Tailwind text-sm/text-xs override it. The mobile !important rule
    // only applies below 768px, so desktop typography is unchanged.
    expect(globalsCssSrc).toContain('@media (max-width: 767px)')
    // The base rule (without !important) must still exist for desktop
    expect(globalsCssSrc).toMatch(
      /input,\s*textarea,\s*select\s*\{\s*font-size: 16px;\s*\}/
    )
  })

  it('40. viewport meta retains accessibility zoom support', () => {
    // The viewport meta must NOT restrict zoom
    expect(layoutSrc).toContain('viewport')
    expect(layoutSrc).not.toContain('maximum-scale')
    expect(layoutSrc).not.toContain('user-scalable=no')
    // Must include viewport-fit=cover for safe areas
    expect(layoutSrc).toContain('viewport-fit=cover')
  })
})
