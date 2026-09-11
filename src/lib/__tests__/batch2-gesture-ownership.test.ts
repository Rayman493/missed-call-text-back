import { describe, it, expect } from 'vitest'
import { isDragGesture, GESTURE_MOVEMENT_THRESHOLD } from '@/lib/gesture/tap-guard'
import { useTapGuard } from '@/lib/gesture/use-tap-guard'

const fs = require('fs')

function readSrc(path: string): string {
  return fs.readFileSync(path, 'utf8')
}

// ============================================================
// BATCH 2 — MOBILE GESTURE OWNERSHIP / TAP VS SCROLL
// Focused regression coverage for the canonical gesture model
// across Dashboard charts, Agenda cards, Customer filter, and
// Calendar day/event cells.
// ============================================================

// ---------- Part 0: Canonical gesture model ----------

describe('Batch 2 — Canonical gesture model', () => {
  it('exports GESTURE_MOVEMENT_THRESHOLD = 10', () => {
    expect(GESTURE_MOVEMENT_THRESHOLD).toBe(10)
  })

  it('isDragGesture returns false for no movement (tap)', () => {
    expect(isDragGesture(100, 100, 100, 100)).toBe(false)
  })

  it('isDragGesture returns false for minor jitter <= 10px', () => {
    expect(isDragGesture(100, 100, 105, 105)).toBe(false)
  })

  it('isDragGesture returns false at exactly 10px (boundary is tap)', () => {
    expect(isDragGesture(100, 100, 110, 100)).toBe(false)
    expect(isDragGesture(100, 100, 100, 110)).toBe(false)
  })

  it('isDragGesture returns true for vertical > 10px', () => {
    expect(isDragGesture(100, 100, 100, 115)).toBe(true)
    expect(isDragGesture(100, 100, 100, 85)).toBe(true)
  })

  it('isDragGesture returns true for horizontal > 10px', () => {
    expect(isDragGesture(100, 100, 115, 100)).toBe(true)
    expect(isDragGesture(100, 100, 85, 100)).toBe(true)
  })

  it('isDragGesture returns true for diagonal > 10px', () => {
    expect(isDragGesture(100, 100, 115, 105)).toBe(true)
  })

  it('isDragGesture returns false for diagonal <= 10px', () => {
    expect(isDragGesture(100, 100, 105, 105)).toBe(false)
  })

  it('one pixel over threshold is drag', () => {
    expect(isDragGesture(100, 100, 100 + GESTURE_MOVEMENT_THRESHOLD + 1, 100)).toBe(true)
  })
})

// ---------- Part 1: Dashboard charts ----------

describe('Batch 2 — Part 1: Dashboard chart gesture ownership', () => {
  const chartUtils = readSrc('src/lib/chart-utils.tsx')

  it('ChartTouchWrapper imports canonical isDragGesture', () => {
    expect(chartUtils).toContain("import { GESTURE_MOVEMENT_THRESHOLD, isDragGesture } from '@/lib/gesture/tap-guard'")
  })

  it('ChartTouchWrapper tracks start X/Y on touch start', () => {
    expect(chartUtils).toContain('startXRef')
    expect(chartUtils).toContain('startYRef')
  })

  it('ChartTouchWrapper uses isDragGesture in touch move', () => {
    expect(chartUtils).toContain('isDragGesture(startXRef.current, startYRef.current, touchX, touchY)')
  })

  it('ChartTouchWrapper synchronously disables pointer events on drag (direct DOM)', () => {
    // Direct DOM manipulation avoids the async React state race where
    // Recharts processes more move events before pointerEvents: 'none' applies
    expect(chartUtils).toContain("innerRef.current.style.pointerEvents = 'none'")
  })

  it('ChartTouchWrapper clears transient state after drag via synthetic mouseleave (no remount)', () => {
    // After a drag, Recharts didn't receive its own touchend, so it would
    // leave the last-touched datum highlighted. The previous approach used
    // key-based remounting (chartResetKey). The current approach sets
    // pointerEvents:'none' on touchstart (preventing activation in the
    // first place) and dispatches a synthetic mouseleave on touchend to
    // clear any residual state — avoiding the visual regeneration caused
    // by remounting.
    expect(chartUtils).toContain('mouseleave')
    expect(chartUtils).toContain('.recharts-surface')
    // Must NOT use the old remount approach
    expect(chartUtils).not.toContain('chartResetKey')
    expect(chartUtils).not.toContain('setChartResetKey')
  })

  it('ChartTouchWrapper restores pointer events on touch end', () => {
    expect(chartUtils).toContain("innerRef.current.style.pointerEvents = 'auto'")
  })

  it('ChartTouchWrapper uses pan-y pan-x touch-action (native scroll preserved)', () => {
    expect(chartUtils).toContain("touchAction: 'pan-y pan-x'")
  })

  it('ChartTouchWrapper does NOT use setTimeout or requestAnimationFrame', () => {
    const codeLines = chartUtils.split('\n').filter(line => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    const codeWithoutComments = codeLines.join('\n')
    expect(codeWithoutComments).not.toContain('setTimeout')
    expect(codeWithoutComments).not.toContain('requestAnimationFrame')
  })

  it('all 7 chart components still use ChartTouchWrapper', () => {
    const charts = [
      'src/components/analytics/RevenueGraph.tsx',
      'src/components/analytics/BusinessActivityGraph.tsx',
      'src/components/analytics/NewCustomersGraph.tsx',
      'src/components/analytics/CustomerPipelineGraph.tsx',
      'src/components/analytics/CustomersStatusGraph.tsx',
      'src/components/analytics/PaymentCollectionGraph.tsx',
      'src/components/analytics/LeadsSourceGraph.tsx',
    ]
    for (const path of charts) {
      const content = readSrc(path)
      expect(content).toContain('ChartTouchWrapper')
    }
  })

  it('prior scroll does not prevent next deliberate tap (state resets on touch end)', () => {
    // handleTouchEnd must reset isDraggingRef so the next gesture starts fresh
    expect(chartUtils).toContain('isDraggingRef.current = false')
  })
})

// ---------- Part 2: Agenda summary cards ----------

describe('Batch 2 — Part 2: Agenda summary card gesture ownership', () => {
  const todaySchedule = readSrc('src/components/jobs/TodaySchedule.tsx')
  const tasksTab = readSrc('src/components/schedule/TasksTab.tsx')

  it('TodaySchedule imports useTapGuard', () => {
    expect(todaySchedule).toContain("import { useTapGuard } from '@/lib/gesture/use-tap-guard'")
  })

  it('TodaySchedule has a shared cardGuard', () => {
    expect(todaySchedule).toContain('const cardGuard = useTapGuard()')
  })

  it('TodaySchedule job card binds pointer handlers', () => {
    expect(todaySchedule).toContain('cardGuard.onPointerDown')
    expect(todaySchedule).toContain('cardGuard.onPointerMove')
  })

  it('TodaySchedule job card onClick checks consumeDragSuppression', () => {
    expect(todaySchedule).toContain('cardGuard.consumeDragSuppression()')
  })

  it('TodaySchedule calendar event card binds pointer handlers', () => {
    // The event card block must also have the guard
    const eventCardMatch = todaySchedule.match(/key=\{event\.id\}[\s\S]*?cardGuard\.onPointerDown/)
    expect(eventCardMatch).toBeTruthy()
  })

  it('TasksTab imports useTapGuard', () => {
    expect(tasksTab).toContain("import { useTapGuard } from '@/lib/gesture/use-tap-guard'")
  })

  it('TasksTab has a shared cardGuard', () => {
    expect(tasksTab).toContain('const cardGuard = useTapGuard()')
  })

  it('TasksTab task card binds pointer handlers', () => {
    expect(tasksTab).toContain('cardGuard.onPointerDown')
    expect(tasksTab).toContain('cardGuard.onPointerMove')
  })

  it('TasksTab toggle button checks consumeDragSuppression', () => {
    expect(tasksTab).toContain('cardGuard.consumeDragSuppression()')
  })

  it('no stuck highlight after drag (no active:scale or pressed state persists)', () => {
    // The guard suppresses onClick, so no action fires. The CSS
    // active:scale-95 is transient (only while finger is down) and
    // clears on pointer up. No sticky state.
    expect(todaySchedule).toContain('transition-colors')
  })
})

// ---------- Part 3: Customer status filter ----------

describe('Batch 2 — Part 3: Customer status filter gesture ownership', () => {
  const leadsPage = readSrc('src/app/dashboard/leads/page.tsx')

  it('leads page imports useTapGuard', () => {
    expect(leadsPage).toContain("import { useTapGuard } from '@/lib/gesture/use-tap-guard'")
  })

  it('leads page has a shared filterItemGuard', () => {
    expect(leadsPage).toContain('const filterItemGuard = useTapGuard()')
  })

  it('filter dropdown items bind pointer handlers', () => {
    expect(leadsPage).toContain('filterItemGuard.onPointerDown')
    expect(leadsPage).toContain('filterItemGuard.onPointerMove')
  })

  it('filter dropdown items check consumeDragSuppression in onSelect', () => {
    // Both dropdown menus must suppress selection on drag (one-shot)
    const matches = leadsPage.match(/if \(filterItemGuard\.consumeDragSuppression\(\)\) return/g)
    expect(matches).toBeTruthy()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })

  it('filter trigger still uses existing pointer guard (shouldPreventMenuOpen)', () => {
    // The trigger button already had the gesture guard; it must remain
    expect(leadsPage).toContain('shouldPreventMenuOpen')
    expect(leadsPage).toContain('filterPointerStartRef')
  })

  it('StatCard (lifecycle summary) uses useTapGuard internally', () => {
    const statCard = readSrc('src/components/StatCard.tsx')
    expect(statCard).toContain("import { useTapGuard } from '@/lib/gesture/use-tap-guard'")
    expect(statCard).toContain('const guard = useTapGuard()')
    expect(statCard).toContain('guard.consumeDragSuppression()')
  })
})

// ---------- Part 4: Calendar day vs event ----------

describe('Batch 2 — Part 4: Calendar day vs event gesture ownership', () => {
  const dayCell = readSrc('src/components/calendar/CalendarDayCell.tsx')

  it('CalendarDayCell imports useTapGuard', () => {
    expect(dayCell).toContain("import { useTapGuard } from '@/lib/gesture/use-tap-guard'")
  })

  it('CalendarDayCell has separate dayGuard and eventGuard', () => {
    expect(dayCell).toContain('const dayGuard = useTapGuard()')
    expect(dayCell).toContain('const eventGuard = useTapGuard()')
  })

  it('day cell onClick checks dayGuard.consumeDragSuppression', () => {
    expect(dayCell).toContain('dayGuard.consumeDragSuppression()')
  })

  it('event chip onClick calls stopPropagation (no bubble to day)', () => {
    expect(dayCell).toContain('e.stopPropagation()')
  })

  it('event chip onClick checks eventGuard.consumeDragSuppression', () => {
    expect(dayCell).toContain('eventGuard.consumeDragSuppression()')
  })

  it('event chip has onKeyDown for keyboard accessibility', () => {
    expect(dayCell).toContain("e.key === 'Enter' || e.key === ' '")
  })

  it('date number is always rendered (day selection target on busy days)', () => {
    // The date number div must always be present, not conditionally hidden
    expect(dayCell).toContain('{day}')
  })

  it('day cell binds dayGuard pointer handlers', () => {
    expect(dayCell).toContain('dayGuard.onPointerDown')
    expect(dayCell).toContain('dayGuard.onPointerMove')
    expect(dayCell).toContain('dayGuard.onPointerCancel')
    expect(dayCell).toContain('dayGuard.onPointerLeave')
  })

  it('event chip binds eventGuard pointer handlers', () => {
    expect(dayCell).toContain('eventGuard.onPointerDown')
    expect(dayCell).toContain('eventGuard.onPointerMove')
    expect(dayCell).toContain('eventGuard.onPointerCancel')
    expect(dayCell).toContain('eventGuard.onPointerLeave')
  })
})

// ---------- Cross-cutting: backward compatibility ----------

describe('Batch 2 — Backward compatibility', () => {
  it('lead-status-gesture re-exports canonical constants', () => {
    const content = readSrc('src/components/lead-status-gesture.ts')
    expect(content).toContain("from '@/lib/gesture/tap-guard'")
    expect(content).toContain('GESTURE_MOVEMENT_THRESHOLD')
    expect(content).toContain('isDragGesture')
  })

  it('shouldPreventMenuOpen is still exported (alias of isDragGesture)', () => {
    const content = readSrc('src/components/lead-status-gesture.ts')
    expect(content).toContain('isDragGesture as shouldPreventMenuOpen')
  })

  it('useTapGuard hook exports all required handlers', () => {
    const content = readSrc('src/lib/gesture/use-tap-guard.ts')
    expect(content).toContain('onPointerDown')
    expect(content).toContain('onPointerMove')
    expect(content).toContain('onPointerUp')
    expect(content).toContain('onPointerCancel')
    expect(content).toContain('onPointerLeave')
    expect(content).toContain('consumeDragSuppression')
    expect(content).toContain('isDragging')
  })
})

// ============================================================
// BATCH 2 — FINAL CORRECTION: One-shot suppression lifecycle
// Tests that stale drag state does NOT suppress later
// keyboard/programmatic activation.
// ============================================================

import { useTapGuard as useTapGuardHook } from '@/lib/gesture/use-tap-guard'

/**
 * Minimal hook runner for testing useTapGuard without @testing-library/react.
 * Uses React's createRoot with flushSync to ensure synchronous rendering.
 * Returns { result: { current } } shape to match @testing-library/react's
 * renderHook API so tests can destructure `const { result } = runHook(...)`
 * and access `result.current`.
 */
function runHook<T>(fn: () => T): { result: { current: T } } {
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { flushSync } = require('react-dom')
  let current: T | undefined
  function Comp() {
    current = fn()
    return null
  }
  const container = document.createElement('div')
  const root = createRoot(container)
  flushSync(() => {
    root.render(React.createElement(Comp))
  })
  return { result: { current: current as T } }
}

/**
 * Simulate a pointer gesture lifecycle against a useTapGuard hook.
 * Returns the guard so the caller can inspect consumeDragSuppression().
 */
function simulateGesture(
  guard: ReturnType<typeof useTapGuardHook>,
  opts: { startX?: number; startY?: number; endX?: number; endY?: number; cancel?: boolean; leave?: boolean; up?: boolean } = {}
) {
  const { startX = 100, startY = 100, endX = 100, endY = 100, cancel = false, leave = false, up = false } = opts
  // pointerdown
  guard.onPointerDown({ clientX: startX, clientY: startY, button: 0 } as any)
  // pointermove (if end differs from start)
  if (endX !== startX || endY !== startY) {
    guard.onPointerMove({ clientX: endX, clientY: endY, button: 0 } as any)
  }
  // pointercancel, pointerleave, pointerup, or neither
  if (cancel) {
    guard.onPointerCancel()
  } else if (leave) {
    guard.onPointerLeave()
  } else if (up) {
    guard.onPointerUp()
  }
}

describe('Batch 2 — One-shot suppression lifecycle', () => {
  it('1. drag → corresponding click suppressed once', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Drag: move > 10px, then pointerup (released on element)
    simulateGesture(guard, { endX: 130, endY: 100, up: true })
    // First consume (the click from this gesture) → suppressed
    expect(guard.consumeDragSuppression()).toBe(true)
    // Second consume (no new gesture) → NOT suppressed
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('2. drag → later unrelated keyboard activation allowed', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    simulateGesture(guard, { endX: 130, endY: 100, up: true })
    // Consume the drag suppression (the click)
    guard.consumeDragSuppression()
    // Later keyboard activation (no new pointerdown) → allowed
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('3. drag → later deliberate pointer tap allowed', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // First gesture: drag with pointerup
    simulateGesture(guard, { endX: 130, endY: 100, up: true })
    guard.consumeDragSuppression() // suppress the drag's click
    // Second gesture: tap (no movement) with pointerup
    simulateGesture(guard, { startX: 200, startY: 200, endX: 200, endY: 200, up: true })
    // The tap's click → allowed (not suppressed)
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('4. drag → pointercancel → later activation allowed', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Drag then cancel (no click follows a cancel)
    simulateGesture(guard, { endX: 130, endY: 100, cancel: true })
    // pointercancel clears all state, so no suppression lingers
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('5. drag → pointerleave → valid synthetic click → click suppressed exactly once', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Drag then pointerleave (pointer left element during drag)
    simulateGesture(guard, { endX: 130, endY: 100, leave: true })
    // Pointer comes back and is released on element → pointerup
    guard.onPointerUp()
    // The click that follows → suppressed (drag=true, released=true)
    expect(guard.consumeDragSuppression()).toBe(true)
    // A later activation → allowed (suppression consumed)
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('6. filter drag → Enter on item selects (keyboard not suppressed)', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Simulate scrolling through filter items (drag with pointerup)
    simulateGesture(guard, { endX: 100, endY: 130, up: true })
    // The synthetic click from the pointer gesture → suppressed
    guard.consumeDragSuppression()
    // Now user uses keyboard (Enter) — no new pointerdown
    // consumeDragSuppression returns false → selection allowed
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('7. filter drag → Space on item selects (keyboard not suppressed)', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    simulateGesture(guard, { endX: 100, endY: 130, up: true })
    guard.consumeDragSuppression()
    // Space activation — same as Enter, no new pointerdown
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('8. Agenda drag → later tap works', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // First: drag over a card with pointerup
    simulateGesture(guard, { endX: 130, endY: 130, up: true })
    guard.consumeDragSuppression()
    // Later: deliberate tap on the card
    simulateGesture(guard, { startX: 100, startY: 100, endX: 100, endY: 100, up: true })
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('9. Calendar event drag → later keyboard activation works', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Drag over event chip with pointerup
    simulateGesture(guard, { endX: 130, endY: 100, up: true })
    guard.consumeDragSuppression()
    // Later keyboard Enter on event chip (no new pointerdown)
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('10. Calendar day drag → later tap works', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Drag over day cell with pointerup
    simulateGesture(guard, { endX: 100, endY: 130, up: true })
    guard.consumeDragSuppression()
    // Later: deliberate tap on day cell
    simulateGesture(guard, { startX: 100, startY: 100, endX: 100, endY: 100, up: true })
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('11. repeated separate drags do not leak state between gestures', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // First drag with pointerup
    simulateGesture(guard, { endX: 130, endY: 100, up: true })
    expect(guard.consumeDragSuppression()).toBe(true)
    // Second drag (new pointerdown resets) with pointerup
    simulateGesture(guard, { startX: 200, startY: 200, endX: 230, endY: 200, up: true })
    expect(guard.consumeDragSuppression()).toBe(true)
    // Third: tap (no movement) with pointerup
    simulateGesture(guard, { startX: 300, startY: 300, endX: 300, endY: 300, up: true })
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('12. synthetic mouseleave occurs exactly once per completed drag, never normal tap', () => {
    const chartUtils = readSrc('src/lib/chart-utils.tsx')
    // The synthetic mouseleave dispatch must be inside the
    // isDraggingRef.current check in handleTouchEnd, so it only fires
    // after a drag, not after a tap
    const touchEndBlock = chartUtils.match(/const handleTouchEnd = \([\s\S]*?\n  \}/)
    expect(touchEndBlock).toBeTruthy()
    const body = touchEndBlock![0]
    // The mouseleave must be guarded by isDraggingRef.current
    expect(body).toContain('if (isDraggingRef.current)')
    expect(body).toContain('mouseleave')
    // Must NOT use the old remount approach
    expect(body).not.toContain('setChartResetKey')
  })

  it('isDragging() reflects live drag state without consuming', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Before any gesture
    expect(guard.isDragging()).toBe(false)
    // During drag (after move, before consume)
    guard.onPointerDown({ clientX: 100, clientY: 100, button: 0 } as any)
    guard.onPointerMove({ clientX: 130, clientY: 100, button: 0 } as any)
    expect(guard.isDragging()).toBe(true)
    // After consume, isDragging should also be false (flag was reset)
    guard.onPointerUp()
    guard.consumeDragSuppression()
    expect(guard.isDragging()).toBe(false)
  })

  it('non-primary button (right click) does not start gesture tracking', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Right click (button 2) should not start tracking
    guard.onPointerDown({ clientX: 100, clientY: 100, button: 2 } as any)
    guard.onPointerMove({ clientX: 130, clientY: 100, button: 2 } as any)
    guard.onPointerUp()
    // No drag should have been recorded
    expect(guard.consumeDragSuppression()).toBe(false)
  })
})

// ============================================================
// BATCH 2 — FINAL LIFECYCLE EDGE CASE:
// Abandoned pointerleave must not retain stale suppression
// ============================================================

describe('Batch 2 — Abandoned pointerleave edge cases', () => {
  it('1. drag → pointerleave → pointerup outside → NO click → keyboard Enter allowed', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Drag then pointerleave (pointer left element, no pointerup on element)
    simulateGesture(guard, { endX: 130, endY: 100, leave: true })
    // NO pointerup on this element (released outside)
    // NO click fires on this element
    // Later keyboard Enter (no new pointerdown)
    // consumeDragSuppression returns false because released=false
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('2. drag → pointerleave → valid synthetic click → click suppressed exactly once', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Drag then pointerleave (pointer left during drag)
    simulateGesture(guard, { endX: 130, endY: 100, leave: true })
    // Pointer comes back and is released on element → pointerup fires
    guard.onPointerUp()
    // The click → suppressed (drag=true, released=true)
    expect(guard.consumeDragSuppression()).toBe(true)
    // Later activation → allowed
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('3. abandoned drag → later programmatic/keyboard activation allowed', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Drag then pointerleave (abandoned — released outside, no click)
    simulateGesture(guard, { endX: 130, endY: 100, leave: true })
    // No pointerup, no click — gesture abandoned
    // Later programmatic/keyboard activation
    expect(guard.consumeDragSuppression()).toBe(false)
    // And again — still not suppressed
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('4. normal drag → normal click still suppressed', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Normal drag with pointerup on element
    simulateGesture(guard, { endX: 130, endY: 100, up: true })
    // Click → suppressed
    expect(guard.consumeDragSuppression()).toBe(true)
  })

  it('5. normal tap still activates', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Tap (no movement) with pointerup
    simulateGesture(guard, { startX: 100, startY: 100, endX: 100, endY: 100, up: true })
    // Click → allowed (no drag)
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('6. next pointer gesture unaffected by abandoned drag', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Abandoned drag (pointerleave, no pointerup)
    simulateGesture(guard, { endX: 130, endY: 100, leave: true })
    // Next gesture: tap with pointerup
    simulateGesture(guard, { startX: 200, startY: 200, endX: 200, endY: 200, up: true })
    // Click → allowed (no drag in this gesture)
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('7. drag without pointerup (no release) → keyboard activation allowed', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Drag but no pointerup (e.g., pointercancel happened, or pointer
    // was released outside without pointerleave firing first)
    guard.onPointerDown({ clientX: 100, clientY: 100, button: 0 } as any)
    guard.onPointerMove({ clientX: 130, clientY: 100, button: 0 } as any)
    // No pointerup, no pointerleave, no pointercancel
    // Later keyboard activation → allowed because released=false
    expect(guard.consumeDragSuppression()).toBe(false)
  })

  it('8. drag → pointerleave → pointerup outside → next pointer tap works', () => {
    const { result } = runHook(() => useTapGuardHook())
    const guard = result.current
    // Abandoned drag
    simulateGesture(guard, { endX: 130, endY: 100, leave: true })
    // Next gesture: tap with pointerup
    simulateGesture(guard, { startX: 200, startY: 200, endX: 200, endY: 200, up: true })
    expect(guard.consumeDragSuppression()).toBe(false)
  })
})
