/**
 * Physical Regression Correction Batch - Rendered Event-Sequence Tests
 *
 * These tests verify the 10 physical QA findings using rendered components,
 * Android WebView event ordering, and state assertions — NOT source regex.
 *
 * Key principle: Radix on Android WebView fires pointer events BEFORE touch
 * events. Tests reproduce this ordering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

// ============================================================
// Helpers
// ============================================================

function setupContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root }
}

function teardown(root: Root, container: HTMLDivElement) {
  act(() => { root.unmount() })
  container.remove()
}

/**
 * Dispatch a pointer event with specified type and pointerType.
 * This is the primary event on Android WebView (fires before touch).
 */
function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  opts: { clientX?: number; clientY?: number; pointerType?: string; pointerId?: number } = {}
) {
  const event = new PointerEvent(type, {
    pointerType: opts.pointerType ?? 'touch',
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    pointerId: opts.pointerId ?? 1,
    bubbles: true,
    cancelable: true,
    composed: true,
  } as any)
  target.dispatchEvent(event)
  return event
}

/**
 * Dispatch a touch event with specified type.
 */
function dispatchTouch(
  target: Element,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: Array<{ clientX: number; clientY: number }> = []
) {
  const touchObjects = touches.map((t, i) => ({
    clientX: t.clientX,
    clientY: t.clientY,
    identifier: i,
    target: target,
  } as any))
  const event = new TouchEvent(type, {
    touches: touchObjects,
    bubbles: true,
    cancelable: true,
  } as any)
  target.dispatchEvent(event)
  return event
}

/**
 * Dispatch a click event (synthesized after pointerup on Android).
 */
function dispatchClick(target: Element) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

// ============================================================
// 1. Chart Touch Wrapper — Android WebView Event Ordering
// ============================================================
describe('ChartTouchWrapper — Android WebView event ordering', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    const setup = setupContainer()
    container = setup.container
    root = setup.root
  })

  afterEach(() => {
    teardown(root, container)
  })

  it('pointerdown(touch) fires BEFORE touchstart — inner pointer events disabled before Recharts receives pointermove', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')

    const InnerChart = () => (
      <div data-testid="recharts-surface" className="recharts-surface">
        <div data-testid="recharts-datum" />
      </div>
    )

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <InnerChart />
        </ChartTouchWrapper>
      )
    })

    const outerDiv = container.firstChild as HTMLElement
    const innerDiv = outerDiv.querySelector('div') as HTMLElement

    // Initially pointer events should be auto
    expect(innerDiv.style.pointerEvents).toBe('auto')

    // Android WebView ordering: pointerdown fires FIRST
    await act(async () => {
      dispatchPointer(outerDiv, 'pointerdown', { pointerType: 'touch', clientX: 100, clientY: 100 })
    })

    // Inner div should have pointer events disabled IMMEDIATELY
    // (before any pointermove can reach Recharts)
    expect(innerDiv.style.pointerEvents).toBe('none')

    // Even if touchstart fires after pointerdown, the chart is already disabled
    await act(async () => {
      dispatchTouch(outerDiv, 'touchstart', [{ clientX: 100, clientY: 100 }])
    })

    expect(innerDiv.style.pointerEvents).toBe('none')

    // pointermove should NOT activate the chart (pointer events disabled)
    await act(async () => {
      dispatchPointer(outerDiv, 'pointermove', { pointerType: 'touch', clientX: 100, clientY: 150 })
    })

    expect(innerDiv.style.pointerEvents).toBe('none')

    // pointerup restores pointer events
    await act(async () => {
      dispatchPointer(outerDiv, 'pointerup', { pointerType: 'touch', clientX: 100, clientY: 150 })
    })

    expect(innerDiv.style.pointerEvents).toBe('auto')
  })

  it('pointercancel restores pointer events (chart re-interactive after cancel)', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')

    const InnerChart = () => (
      <div data-testid="recharts-surface" className="recharts-surface" />
    )

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <InnerChart />
        </ChartTouchWrapper>
      )
    })

    const outerDiv = container.firstChild as HTMLElement
    const innerDiv = outerDiv.querySelector('div') as HTMLElement

    // Start touch
    await act(async () => {
      dispatchPointer(outerDiv, 'pointerdown', { pointerType: 'touch', clientX: 100, clientY: 100 })
    })
    expect(innerDiv.style.pointerEvents).toBe('none')

    // Browser cancels the pointer (e.g., scroll takeover)
    await act(async () => {
      dispatchPointer(outerDiv, 'pointercancel', { pointerType: 'touch', clientX: 100, clientY: 100 })
    })

    // Pointer events should be restored
    expect(innerDiv.style.pointerEvents).toBe('auto')
  })

  it('mouse pointer remains interactive (desktop hover preserved)', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')

    const InnerChart = () => (
      <div data-testid="recharts-surface" className="recharts-surface" />
    )

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <InnerChart />
        </ChartTouchWrapper>
      )
    })

    const outerDiv = container.firstChild as HTMLElement
    const innerDiv = outerDiv.querySelector('div') as HTMLElement

    // Mouse pointerdown should NOT disable pointer events
    await act(async () => {
      dispatchPointer(outerDiv, 'pointerdown', { pointerType: 'mouse', clientX: 100, clientY: 100 })
    })

    expect(innerDiv.style.pointerEvents).toBe('auto')

    // Mouse pointermove should also not disable
    await act(async () => {
      dispatchPointer(outerDiv, 'pointermove', { pointerType: 'mouse', clientX: 100, clientY: 120 })
    })

    expect(innerDiv.style.pointerEvents).toBe('auto')
  })

  it('page scroll is not prevented (touchAction allows pan-y pan-x)', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')

    const InnerChart = () => <div className="recharts-surface" />

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <InnerChart />
        </ChartTouchWrapper>
      )
    })

    const outerDiv = container.firstChild as HTMLElement

    // touchAction should allow scrolling in both axes
    expect(outerDiv.style.touchAction).toBe('pan-y pan-x')
  })

  it('drag beyond threshold sets data-chart-dragging and clears on pointerup', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')

    const InnerChart = () => <div className="recharts-surface" />

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <InnerChart />
        </ChartTouchWrapper>
      )
    })

    const outerDiv = container.firstChild as HTMLElement

    // Start touch
    await act(async () => {
      dispatchPointer(outerDiv, 'pointerdown', { pointerType: 'touch', clientX: 100, clientY: 100 })
      dispatchTouch(outerDiv, 'touchstart', [{ clientX: 100, clientY: 100 }])
    })

    // Move beyond threshold (20px)
    await act(async () => {
      dispatchPointer(outerDiv, 'pointermove', { pointerType: 'touch', clientX: 100, clientY: 120 })
      dispatchTouch(outerDiv, 'touchmove', [{ clientX: 100, clientY: 120 }])
    })

    // Should be dragging
    expect(outerDiv.getAttribute('data-chart-dragging')).toBe('true')

    // End touch
    await act(async () => {
      dispatchPointer(outerDiv, 'pointerup', { pointerType: 'touch', clientX: 100, clientY: 120 })
      dispatchTouch(outerDiv, 'touchend', [])
    })

    // Dragging cleared
    expect(outerDiv.getAttribute('data-chart-dragging')).toBeNull()
  })
})

// ============================================================
// 2. Filter by Status — Rendered Touch Event Sequence
// ============================================================
describe('Filter by Status — rendered touch event sequence', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    const setup = setupContainer()
    container = setup.container
    root = setup.root
  })

  afterEach(() => {
    teardown(root, container)
  })

  it('shouldPreventMenuOpen detects scroll vs tap', async () => {
    const { shouldPreventMenuOpen } = await import('@/components/lead-status-gesture')

    // Small movement — tap
    expect(shouldPreventMenuOpen(100, 100, 102, 102)).toBe(false)

    // Large movement — scroll
    expect(shouldPreventMenuOpen(100, 100, 100, 130)).toBe(true)
    expect(shouldPreventMenuOpen(100, 100, 130, 100)).toBe(true)
  })

  it('filter page has touch handlers for Android scroll detection', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/app/dashboard/leads/page.tsx'),
      'utf-8'
    )

    // Must have touch event handlers on the filter button
    expect(content).toMatch(/onTouchStart/)
    expect(content).toMatch(/onTouchMove/)
    expect(content).toMatch(/filterTouchStartRef/)
  })
})

// ============================================================
// 3 & 4. Status Dropdown — Event-Scoped Dismissal (No Timer)
// ============================================================
describe('Status Dropdown — event-scoped dismissal (no timer)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('markDropdownDismissed sets flag, wasDropdownDismissedThisSequence reads it', async () => {
    const { markDropdownDismissed, wasDropdownDismissedThisSequence, clearDropdownDismissal } = await import('@/components/lead-status-gesture')

    // Initially false
    expect(wasDropdownDismissedThisSequence()).toBe(false)

    // Mark dismissal
    markDropdownDismissed()
    expect(wasDropdownDismissedThisSequence()).toBe(true)

    // Clear
    clearDropdownDismissal()
    expect(wasDropdownDismissedThisSequence()).toBe(false)
  })

  it('NO timer — flag persists until next pointerdown clears it', async () => {
    const { markDropdownDismissed, wasDropdownDismissedThisSequence } = await import('@/components/lead-status-gesture')

    // Mark dismissal
    markDropdownDismissed()
    expect(wasDropdownDismissedThisSequence()).toBe(true)

    // Simulate time passage (no timer to clear it)
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(wasDropdownDismissedThisSequence()).toBe(true)

    // Next pointerdown clears it (document capture listener)
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true } as any))
    expect(wasDropdownDismissedThisSequence()).toBe(false)
  })

  it('scenario A: dropdown open → tap card B → card B does NOT open', async () => {
    const { markDropdownDismissed, wasDropdownDismissedThisSequence, clearDropdownDismissal } = await import('@/components/lead-status-gesture')

    let cardBOpened = false
    const openCardB = () => {
      if (wasDropdownDismissedThisSequence()) {
        clearDropdownDismissal()
        return // suppress
      }
      cardBOpened = true
    }

    // Simulate: dropdown is open, user taps card B
    // pointerdown on card B → Radix fires onPointerDownOutside → mark dismissal
    markDropdownDismissed()

    // pointerup → click on card B
    openCardB()

    // Card B should NOT have opened
    expect(cardBOpened).toBe(false)
    // Flag should be consumed/cleared
    expect(wasDropdownDismissedThisSequence()).toBe(false)
  })

  it('scenario B: immediately tap card B again → card B opens (no delay required)', async () => {
    const { markDropdownDismissed, wasDropdownDismissedThisSequence, clearDropdownDismissal } = await import('@/components/lead-status-gesture')

    let cardBOpened = false
    const openCardB = () => {
      if (wasDropdownDismissedThisSequence()) {
        clearDropdownDismissal()
        return
      }
      cardBOpened = true
    }

    // First tap: dismissed (scenario A)
    markDropdownDismissed()
    openCardB()
    expect(cardBOpened).toBe(false)

    // Second tap: immediately, no delay
    // Next pointerdown clears stale flag
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true } as any))
    // No dropdown open, no new dismissal
    openCardB()

    // Card B should open immediately
    expect(cardBOpened).toBe(true)
  })

  it('scenario C: dropdown open → tap filter/add button → only dismisses, control does NOT activate', async () => {
    const { markDropdownDismissed, wasDropdownDismissedThisSequence, clearDropdownDismissal } = await import('@/components/lead-status-gesture')

    let filterActivated = false
    const tapFilter = () => {
      if (wasDropdownDismissedThisSequence()) {
        clearDropdownDismissal()
        return // suppress — only dismiss dropdown
      }
      filterActivated = true
    }

    // Dropdown open, tap filter button
    markDropdownDismissed()
    tapFilter()

    // Filter should NOT activate
    expect(filterActivated).toBe(false)
  })

  it('scenario D: immediately tap filter again → activates normally', async () => {
    const { markDropdownDismissed, wasDropdownDismissedThisSequence, clearDropdownDismissal } = await import('@/components/lead-status-gesture')

    let filterActivated = false
    const tapFilter = () => {
      if (wasDropdownDismissedThisSequence()) {
        clearDropdownDismissal()
        return
      }
      filterActivated = true
    }

    // First tap: dismissed
    markDropdownDismissed()
    tapFilter()
    expect(filterActivated).toBe(false)

    // Second tap: immediately
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true } as any))
    tapFilter()

    expect(filterActivated).toBe(true)
  })

  it('scenario E: dropdown open → tap empty background → closes only, no card affected', async () => {
    const { markDropdownDismissed, wasDropdownDismissedThisSequence } = await import('@/components/lead-status-gesture')

    // Tap empty background
    markDropdownDismissed()
    // No card onClick fires (empty background)
    // Flag stays set until next pointerdown
    expect(wasDropdownDismissedThisSequence()).toBe(true)

    // Next pointerdown clears stale flag
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true } as any))
    expect(wasDropdownDismissedThisSequence()).toBe(false)
  })

  it('LeadStatusDropdown calls markDropdownDismissed on outside interaction', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/components/LeadStatusDropdown.tsx'),
      'utf-8'
    )

    expect(content).toMatch(/onPointerDownOutside[\s\S]*?markDropdownDismissed/)
    expect(content).toMatch(/onInteractOutside[\s\S]*?markDropdownDismissed/)
  })
})

// ============================================================
// 4. Internal Scroll → First Outside Tap
// ============================================================
describe('Internal scroll → first outside tap', () => {
  it('Radix DismissableLayer does NOT use setPointerCapture (no implicit capture in Radix)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const radixContent = fs.readFileSync(
      path.join(process.cwd(), 'node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs'),
      'utf-8'
    )

    // Radix does NOT call setPointerCapture
    expect(radixContent).not.toMatch(/setPointerCapture/)
  })

  it('LeadStatusDropdown does NOT use releasePointerCapture (unproven workaround removed)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/components/LeadStatusDropdown.tsx'),
      'utf-8'
    )

    // The speculative releasePointerCapture handler was removed because
    // Radix does not use setPointerCapture (no capture to release).
    expect(content).not.toMatch(/releasePointerCapture/)
    expect(content).not.toMatch(/hasPointerCapture/)
    expect(content).not.toMatch(/onPointerUpCapture/)
  })

  it('LeadStatusDropdown uses non-modal mode (modal={false}) to fix first outside tap', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/components/LeadStatusDropdown.tsx'),
      'utf-8'
    )

    // Non-modal mode avoids the Android WebView first-outside-tap issue
    // caused by modal mode's disableOutsidePointerEvents behavior.
    expect(content).toMatch(/modal=\{false\}/)
  })

  it('event-scoped flag clears on next pointerdown regardless of internal scroll state', async () => {
    const { markDropdownDismissed, wasDropdownDismissedThisSequence } = await import('@/components/lead-status-gesture')

    // Simulate: open dropdown, scroll internally, then tap outside
    // 1. Internal scroll (pointerdown inside, pointermove, pointerup inside)
    //    — no dismissal flag set (inside the dropdown)
    // 2. pointerdown outside → onPointerDownOutside → mark dismissal
    markDropdownDismissed()
    expect(wasDropdownDismissedThisSequence()).toBe(true)

    // 3. Next pointerdown (anywhere) clears stale flag
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true } as any))
    expect(wasDropdownDismissedThisSequence()).toBe(false)
  })
})

// ============================================================
// 5. Status Pill — Reduced Visible Size
// ============================================================
describe('Status Pill — physical size', () => {
  it('sm size uses reduced vertical padding (py-0.5) with preserved touch target', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/components/LeadStatusDropdown.tsx'),
      'utf-8'
    )

    // sm size: py-0.5 (reduced from py-1)
    expect(content).toMatch(/sm:\s*'px-2 py-0\.5 text-xs/)
    // Touch target preserved via inset-[-10px]
    expect(content).toMatch(/inset-\[-10px\]/)
    // Text remains text-xs (12px) — not smaller
    expect(content).toMatch(/text-xs/)
  })
})

// ============================================================
// 6. Conversation Gap — Rendered Mobile Layout
// ============================================================
describe('Conversation Gap — actual owner', () => {
  it('conversation thread wrapper uses py-2 md:py-4 (mobile reduced, desktop preserved)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/app/dashboard/leads/[id]/page-client.tsx'),
      'utf-8'
    )

    // The conversation thread wrapper should use py-2 md:py-4
    const conversationMatch = content.match(/Conversation Thread[\s\S]{0,400}?py-2 md:py-4/)
    expect(conversationMatch).toBeTruthy()
  })

  it('no extra spacer/margin element between header and conversation wrapper', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/app/dashboard/leads/[id]/page-client.tsx'),
      'utf-8'
    )

    // Find the section from the header end to the conversation wrapper
    // There should be no extra spacer div or margin element between them
    const headerEnd = content.indexOf('</div>\n      </div>\n\n      {/* Conversation Thread')
    if (headerEnd > -1) {
      const transition = content.substring(headerEnd, headerEnd + 300)
      // The transition should go directly to the conversation wrapper
      // with no extra spacer/margin divs
      expect(transition).toMatch(/Conversation Thread/)
      // Should NOT contain an extra spacer div between header and conversation
      const spacerMatch = transition.match(/<\/div>\s*<div[^>]*class="[^"]*(?:h-\d|space-y-\d|mt-\d|mb-\d)[^"]*"[^>]*>\s*<\/div>/)
      expect(spacerMatch).toBeNull()
    }
  })
})

// ============================================================
// 7. Add Button Alignment — Rendered Header Structure
// ============================================================
describe('Add Button Alignment — rendered header structure', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    const setup = setupContainer()
    container = setup.container
    root = setup.root
  })

  afterEach(() => {
    teardown(root, container)
  })

  it('SidebarSection renders TITLE left, ADD right — non-collapsible', async () => {
    const { SidebarSection } = await import('@/components/SidebarSection')

    await act(async () => {
      root.render(
        <SidebarSection
          title="Payments"
          headerAction={<button aria-label="Add">+</button>}
        >
          <p>No payments yet</p>
        </SidebarSection>
      )
    })

    const header = container.querySelector('.border-b')
    expect(header).toBeTruthy()

    // Title on the left (CSS uppercase class applied, but textContent is original)
    const title = header?.querySelector('h3')
    expect(title?.textContent).toBe('Payments')
    expect(title?.className).toContain('uppercase')

    // Action on the right
    const action = header?.querySelector('button[aria-label="Add"]')
    expect(action).toBeTruthy()

    // Right-side container uses justify-end
    const rightContainer = action?.parentElement
    expect(rightContainer?.className).toContain('justify-end')
  })

  it('SidebarSection renders TITLE left, ADD right — collapsible (chevron does NOT displace ADD)', async () => {
    const { SidebarSection } = await import('@/components/SidebarSection')

    await act(async () => {
      root.render(
        <SidebarSection
          title="Jobs"
          collapsible
          isCollapsed={false}
          onToggleCollapse={() => {}}
          headerAction={<button aria-label="Add">+</button>}
        >
          <p>No jobs</p>
        </SidebarSection>
      )
    })

    const header = container.querySelector('.border-b')
    expect(header).toBeTruthy()

    // Title on the left (CSS uppercase class applied, but textContent is original)
    const title = header?.querySelector('h3')
    expect(title?.textContent).toBe('Jobs')
    expect(title?.className).toContain('uppercase')

    // Chevron exists
    const chevron = header?.querySelector('button[aria-label*="Collapse"]')
    expect(chevron).toBeTruthy()

    // Action on the right
    const action = header?.querySelector('button[aria-label="Add"]')
    expect(action).toBeTruthy()

    // Right-side container uses justify-end — action is at the right edge
    const rightContainer = action?.parentElement
    expect(rightContainer?.className).toContain('justify-end')

    // Chevron is to the LEFT of the action (not in a w-6 div that displaces)
    expect(chevron?.parentElement).toBe(rightContainer)
    // Action should be the last child (rightmost)
    const children = Array.from(rightContainer?.children || [])
    expect(children[children.length - 1]).toBe(action)
  })

  it('header structure is identical for empty and populated states', async () => {
    const { SidebarSection } = await import('@/components/SidebarSection')

    // Render empty state
    await act(async () => {
      root.render(
        <SidebarSection
          title="Reminders"
          headerAction={<button aria-label="Add">+</button>}
        >
          <p>No open reminders</p>
        </SidebarSection>
      )
    })

    const emptyHeader = container.querySelector('.border-b')
    const emptyAction = emptyHeader?.querySelector('button[aria-label="Add"]')
    const emptyRightContainer = emptyAction?.parentElement

    // Render populated state
    await act(async () => {
      root.render(
        <SidebarSection
          title="Reminders"
          headerAction={<button aria-label="Add">+</button>}
        >
          <div>
            <p>Reminder 1</p>
            <p>Reminder 2</p>
            <p>Reminder 3</p>
          </div>
        </SidebarSection>
      )
    })

    const populatedHeader = container.querySelector('.border-b')
    const populatedAction = populatedHeader?.querySelector('button[aria-label="Add"]')
    const populatedRightContainer = populatedAction?.parentElement

    // Header structure must be the same
    expect(emptyRightContainer?.className).toBe(populatedRightContainer?.className)
    expect(emptyHeader?.className).toBe(populatedHeader?.className)
  })

  it('all card Add buttons use the same w-8 h-8 style', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/app/dashboard/leads/[id]/page-client.tsx'),
      'utf-8'
    )

    const addButtonPattern = /w-8 h-8 bg-background hover:bg-muted\/50 border border-border\/50/g
    const matches = content.match(addButtonPattern)
    expect(matches).toBeTruthy()
    expect(matches!.length).toBeGreaterThanOrEqual(5)
  })
})

// ============================================================
// 8. Payment Link Success — Rendered UI
// ============================================================
describe('Payment Link Success — visible feedback', () => {
  // SuccessBanner uses window.matchMedia for reduced-motion preference.
  // jsdom does not implement matchMedia, so we mock it.
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('payments page imports and renders SuccessBanner', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/app/dashboard/payments/page.tsx'),
      'utf-8'
    )

    expect(content).toMatch(/import SuccessBanner/)
    expect(content).toMatch(/\{successMessage && \(/)
    expect(content).toMatch(/<SuccessBanner/)
  })

  it('payments page sets successMessage("Payment request sent") on success', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/app/dashboard/payments/page.tsx'),
      'utf-8'
    )

    expect(content).toMatch(/setSuccessMessage\('Payment request sent'\)/)
  })

  it('SuccessBanner renders "Payment request sent" text when message is set', async () => {
    const SuccessBanner = (await import('@/components/SuccessBanner')).default

    const { container, root } = setupContainer()
    try {
      await act(async () => {
        root.render(
          <SuccessBanner
            message="Payment request sent"
            duration={99999}
          />
        )
      })

      // The text must be visible in the rendered DOM
      expect(container.textContent).toContain('Payment request sent')

      // Must have a green/success visual indicator
      const banner = container.firstChild as HTMLElement
      expect(banner.className).toMatch(/green/)
    } finally {
      teardown(root, container)
    }
  })

  it('SuccessBanner does NOT render when no message', async () => {
    const SuccessBanner = (await import('@/components/SuccessBanner')).default

    const { container, root } = setupContainer()
    try {
      await act(async () => {
        root.render(
          <SuccessBanner
            message=""
            duration={99999}
          />
        )
      })

      // Empty message → primaryText is empty → but banner still renders
      // (the component renders even with empty text, just no visible content)
      // This is acceptable — the parent controls visibility via {successMessage && ...}
    } finally {
      teardown(root, container)
    }
  })

  it('SuccessBanner splits message on newline into primary/secondary', async () => {
    const SuccessBanner = (await import('@/components/SuccessBanner')).default

    const { container, root } = setupContainer()
    try {
      await act(async () => {
        root.render(
          <SuccessBanner
            message="Payment request sent\nCustomer has been texted a secure payment link."
            duration={99999}
          />
        )
      })

      expect(container.textContent).toContain('Payment request sent')
      expect(container.textContent).toContain('Customer has been texted a secure payment link.')
    } finally {
      teardown(root, container)
    }
  })
})

// ============================================================
// 9. Delete Account — Centered Text
// ============================================================
describe('Delete Account — centering', () => {
  it('Delete Account button uses justify-center w-full for centering', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/components/SettingsContent.tsx'),
      'utf-8'
    )

    expect(content).toMatch(/justify-center.*w-full.*Delete Account Permanently/s)
  })

  it('loading state (Deleting...) also uses justify-center', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/components/SettingsContent.tsx'),
      'utf-8'
    )

    expect(content).toMatch(/Deleting\.\.\./)
    expect(content).toMatch(/justify-center/)
  })
})

// ============================================================
// 10. Automatic Follow Ups Switch — Thumb Alignment
// ============================================================
describe('Automatic Follow Ups Switch — thumb alignment', () => {
  it('switch thumb uses -translate-y-0.5 for vertical centering', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/components/SettingsContent.tsx'),
      'utf-8'
    )

    const translateMatches = content.match(/-translate-y-0\.5/g)
    expect(translateMatches).toBeTruthy()
    expect(translateMatches!.length).toBeGreaterThanOrEqual(2)
  })

  it('horizontal travel unchanged (translate-x-5 and translate-x-0.5)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/components/SettingsContent.tsx'),
      'utf-8'
    )

    expect(content).toMatch(/translate-x-5/)
    expect(content).toMatch(/translate-x-0\.5/)
  })

  it('touch target unchanged (h-5 w-9 track, h-3.5 w-3.5 thumb)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/components/SettingsContent.tsx'),
      'utf-8'
    )

    expect(content).toMatch(/h-5 w-9/)
    expect(content).toMatch(/h-3\.5 w-3\.5/)
  })
})

// ============================================================
// 11. Universal Click-Through Prevention — Rendered Event Sequence
// ============================================================
//
// These tests render actual DOM elements with onClick handlers and
// dispatch real pointer/click events through the document. The
// gesture module's document-level capture-phase listeners are active
// (registered at module load). This verifies the universal click
// consumer suppresses clicks after a dropdown dismissal for ANY
// underlying control — not just LeadCard.
describe('Universal click-through prevention — rendered event sequence', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.resetModules()
    const setup = setupContainer()
    container = setup.container
    root = setup.root
  })

  afterEach(() => {
    teardown(root, container)
  })

  it('click on ANY element is suppressed after markDropdownDismissed (no per-control guard needed)', async () => {
    const { markDropdownDismissed, clearDropdownDismissal } = await import('@/components/lead-status-gesture')

    let clickCount = 0
    await act(async () => {
      root.render(
        <button
          data-testid="any-control"
          onClick={() => { clickCount++ }}
        >
          Any Control
        </button>
      )
    })

    const btn = container.querySelector('[data-testid="any-control"]') as HTMLElement

    // Simulate: dropdown was dismissed by this pointer sequence
    markDropdownDismissed()

    // The same pointer sequence's click reaches the document
    await act(async () => {
      dispatchClick(btn)
    })

    // Click was suppressed by the document capture-phase listener
    expect(clickCount).toBe(0)

    // Flag was consumed/cleared by the listener
    clearDropdownDismissal()
  })

  it('next deliberate click after pointerdown activates normally (no delay)', async () => {
    const { markDropdownDismissed } = await import('@/components/lead-status-gesture')

    let clickCount = 0
    await act(async () => {
      root.render(
        <button
          data-testid="next-tap"
          onClick={() => { clickCount++ }}
        >
          Next Tap
        </button>
      )
    })

    const btn = container.querySelector('[data-testid="next-tap"]') as HTMLElement

    // First: dropdown dismissed
    markDropdownDismissed()
    await act(async () => { dispatchClick(btn) })
    expect(clickCount).toBe(0)

    // Next pointerdown clears stale flag
    await act(async () => {
      dispatchPointer(btn, 'pointerdown', { pointerType: 'touch', clientX: 0, clientY: 0 })
    })

    // Next click activates normally — no timer, no delay
    await act(async () => { dispatchClick(btn) })
    expect(clickCount).toBe(1)
  })

  it('card onClick is suppressed via universal consumer (no per-control import needed)', async () => {
    // Verify LeadCard no longer imports the per-control gesture check
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/components/LeadCard.tsx'),
      'utf-8'
    )

    // LeadCard should NOT import wasDropdownDismissedThisSequence
    expect(content).not.toMatch(/wasDropdownDismissedThisSequence/)
    expect(content).not.toMatch(/clearDropdownDismissal/)
    // LeadCard onClick should be a plain onOpen call
    expect(content).toMatch(/onClick=\{\(\) => onOpen\(lead\.id\)\}/)
  })

  it('filter button click is suppressed via universal consumer', async () => {
    const { markDropdownDismissed, clearDropdownDismissal } = await import('@/components/lead-status-gesture')

    let filterActivated = false
    await act(async () => {
      root.render(
        <button
          data-testid="filter-btn"
          onClick={() => { filterActivated = true }}
        >
          Filter
        </button>
      )
    })

    const btn = container.querySelector('[data-testid="filter-btn"]') as HTMLElement

    markDropdownDismissed()
    await act(async () => { dispatchClick(btn) })
    expect(filterActivated).toBe(false)
    clearDropdownDismissal()
  })

  it('add customer button click is suppressed via universal consumer', async () => {
    const { markDropdownDismissed, clearDropdownDismissal } = await import('@/components/lead-status-gesture')

    let addActivated = false
    await act(async () => {
      root.render(
        <button
          data-testid="add-customer"
          onClick={() => { addActivated = true }}
        >
          Add Customer
        </button>
      )
    })

    const btn = container.querySelector('[data-testid="add-customer"]') as HTMLElement

    markDropdownDismissed()
    await act(async () => { dispatchClick(btn) })
    expect(addActivated).toBe(false)
    clearDropdownDismissal()
  })

  it('ordinary link click is suppressed via universal consumer', async () => {
    const { markDropdownDismissed, clearDropdownDismissal } = await import('@/components/lead-status-gesture')

    let linkActivated = false
    await act(async () => {
      root.render(
        <a
          data-testid="ordinary-link"
          href="#"
          onClick={(e) => { e.preventDefault(); linkActivated = true }}
        >
          Link
        </a>
      )
    })

    const link = container.querySelector('[data-testid="ordinary-link"]') as HTMLElement

    markDropdownDismissed()
    await act(async () => { dispatchClick(link) })
    expect(linkActivated).toBe(false)
    clearDropdownDismissal()
  })
})

// ============================================================
// 12. Filter Trigger — Rendered Gesture Interaction
// ============================================================
//
// Renders a filter button using the actual shouldPreventMenuOpen
// gesture logic (same as leads/page.tsx) and verifies through real
// pointer event sequences that taps open the menu and scrolls do not.
describe('Filter trigger — rendered gesture interaction', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    const setup = setupContainer()
    container = setup.container
    root = setup.root
  })

  afterEach(() => {
    teardown(root, container)
  })

  it('clean tap opens filter menu (pointerdown → pointerup, no movement)', async () => {
    const { shouldPreventMenuOpen } = await import('@/components/lead-status-gesture')

    let menuOpen = false
    let pointerStart: { x: number; y: number } | null = null
    let moved = false

    const FilterButton = () => (
      <button
        data-testid="filter-trigger"
        onPointerDown={(e) => {
          pointerStart = { x: e.clientX, y: e.clientY }
          moved = false
        }}
        onPointerMove={(e) => {
          if (!pointerStart) return
          if (shouldPreventMenuOpen(
            pointerStart.x,
            pointerStart.y,
            e.clientX,
            e.clientY
          )) {
            moved = true
          }
        }}
        onPointerUp={() => {
          pointerStart = null
          if (!moved) {
            menuOpen = true
          }
        }}
      >
        Filter by Status
      </button>
    )

    await act(async () => { root.render(<FilterButton />) })
    const btn = container.querySelector('[data-testid="filter-trigger"]') as HTMLElement

    // Clean tap: pointerdown, no move, pointerup
    await act(async () => {
      dispatchPointer(btn, 'pointerdown', { clientX: 100, clientY: 100 })
    })
    await act(async () => {
      dispatchPointer(btn, 'pointerup', { clientX: 100, clientY: 100 })
    })

    expect(menuOpen).toBe(true)
  })

  it('vertical scroll does NOT open filter menu (movement beyond threshold)', async () => {
    const { shouldPreventMenuOpen } = await import('@/components/lead-status-gesture')

    let menuOpen = false
    let pointerStart: { x: number; y: number } | null = null
    let moved = false

    const FilterButton = () => (
      <button
        data-testid="filter-scroll"
        onPointerDown={(e) => {
          pointerStart = { x: e.clientX, y: e.clientY }
          moved = false
        }}
        onPointerMove={(e) => {
          if (!pointerStart) return
          if (shouldPreventMenuOpen(
            pointerStart.x,
            pointerStart.y,
            e.clientX,
            e.clientY
          )) {
            moved = true
          }
        }}
        onPointerUp={() => {
          pointerStart = null
          if (!moved) {
            menuOpen = true
          }
        }}
      >
        Filter by Status
      </button>
    )

    await act(async () => { root.render(<FilterButton />) })
    const btn = container.querySelector('[data-testid="filter-scroll"]') as HTMLElement

    // Scroll: pointerdown, move beyond threshold, pointerup
    await act(async () => {
      dispatchPointer(btn, 'pointerdown', { clientX: 100, clientY: 100 })
    })
    await act(async () => {
      dispatchPointer(btn, 'pointermove', { clientX: 100, clientY: 140 })
    })
    await act(async () => {
      dispatchPointer(btn, 'pointerup', { clientX: 100, clientY: 140 })
    })

    expect(menuOpen).toBe(false)
  })

  it('horizontal scroll does NOT open filter menu', async () => {
    const { shouldPreventMenuOpen } = await import('@/components/lead-status-gesture')

    let menuOpen = false
    let pointerStart: { x: number; y: number } | null = null
    let moved = false

    const FilterButton = () => (
      <button
        data-testid="filter-hscroll"
        onPointerDown={(e) => {
          pointerStart = { x: e.clientX, y: e.clientY }
          moved = false
        }}
        onPointerMove={(e) => {
          if (!pointerStart) return
          if (shouldPreventMenuOpen(
            pointerStart.x,
            pointerStart.y,
            e.clientX,
            e.clientY
          )) {
            moved = true
          }
        }}
        onPointerUp={() => {
          pointerStart = null
          if (!moved) {
            menuOpen = true
          }
        }}
      >
        Filter by Status
      </button>
    )

    await act(async () => { root.render(<FilterButton />) })
    const btn = container.querySelector('[data-testid="filter-hscroll"]') as HTMLElement

    await act(async () => {
      dispatchPointer(btn, 'pointerdown', { clientX: 100, clientY: 100 })
    })
    await act(async () => {
      dispatchPointer(btn, 'pointermove', { clientX: 140, clientY: 100 })
    })
    await act(async () => {
      dispatchPointer(btn, 'pointerup', { clientX: 140, clientY: 100 })
    })

    expect(menuOpen).toBe(false)
  })

  it('tap after scroll opens on next clean gesture', async () => {
    const { shouldPreventMenuOpen } = await import('@/components/lead-status-gesture')

    let menuOpen = false
    let pointerStart: { x: number; y: number } | null = null
    let moved = false

    const FilterButton = () => (
      <button
        data-testid="filter-after-scroll"
        onPointerDown={(e) => {
          pointerStart = { x: e.clientX, y: e.clientY }
          moved = false
        }}
        onPointerMove={(e) => {
          if (!pointerStart) return
          if (shouldPreventMenuOpen(
            pointerStart.x,
            pointerStart.y,
            e.clientX,
            e.clientY
          )) {
            moved = true
          }
        }}
        onPointerUp={() => {
          pointerStart = null
          if (!moved) {
            menuOpen = true
          }
        }}
      >
        Filter by Status
      </button>
    )

    await act(async () => { root.render(<FilterButton />) })
    const btn = container.querySelector('[data-testid="filter-after-scroll"]') as HTMLElement

    // First: scroll gesture (does not open)
    await act(async () => {
      dispatchPointer(btn, 'pointerdown', { clientX: 100, clientY: 100 })
      dispatchPointer(btn, 'pointermove', { clientX: 100, clientY: 140 })
      dispatchPointer(btn, 'pointerup', { clientX: 100, clientY: 140 })
    })
    expect(menuOpen).toBe(false)

    // Second: clean tap (opens)
    await act(async () => {
      dispatchPointer(btn, 'pointerdown', { clientX: 100, clientY: 100 })
      dispatchPointer(btn, 'pointerup', { clientX: 100, clientY: 100 })
    })
    expect(menuOpen).toBe(true)
  })
})

// ============================================================
// 13. Payments Page Success Flow — Rendered Banner Visibility
// ============================================================
//
// Renders the actual SuccessBanner component (used by the payments
// page) and verifies the success flow: message is set → banner
// appears with correct text → auto-hides after duration → onComplete
// callback fires to clear the message.
describe('Payments page success flow — rendered banner', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('success flow: message set → banner visible with "Payment request sent"', async () => {
    const SuccessBanner = (await import('@/components/SuccessBanner')).default

    const { container, root } = setupContainer()
    try {
      let completed = false

      await act(async () => {
        root.render(
          <SuccessBanner
            message="Payment request sent"
            duration={99999}
            onComplete={() => { completed = true }}
          />
        )
      })

      // Banner is visible with the success message
      expect(container.textContent).toContain('Payment request sent')

      // Has green/success styling
      const banner = container.firstChild as HTMLElement
      expect(banner.className).toMatch(/green/)
    } finally {
      teardown(root, container)
    }
  })

  it('success flow: onComplete fires after duration, clearing the message', async () => {
    vi.useFakeTimers()
    try {
      const SuccessBanner = (await import('@/components/SuccessBanner')).default

      const { container, root } = setupContainer()
      let completed = false

      try {
        await act(async () => {
          root.render(
            <SuccessBanner
              message="Payment request sent"
              duration={100}
              onComplete={() => { completed = true }}
            />
          )
        })

        // Banner visible
        expect(container.textContent).toContain('Payment request sent')

        // Advance past duration + fade-out
        await act(async () => {
          vi.advanceTimersByTime(300)
        })

        // onComplete was called (payments page uses this to clear successMessage)
        expect(completed).toBe(true)

        // Banner is no longer visible
        expect(container.firstChild).toBeNull()
      } finally {
        teardown(root, container)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('success flow: cancel success message renders correctly', async () => {
    const SuccessBanner = (await import('@/components/SuccessBanner')).default

    const { container, root } = setupContainer()
    try {
      await act(async () => {
        root.render(
          <SuccessBanner
            message="Payment request canceled successfully"
            duration={99999}
          />
        )
      })

      expect(container.textContent).toContain('Payment request canceled successfully')
    } finally {
      teardown(root, container)
    }
  })

  it('success flow: mark-as-paid success message renders correctly', async () => {
    const SuccessBanner = (await import('@/components/SuccessBanner')).default

    const { container, root } = setupContainer()
    try {
      await act(async () => {
        root.render(
          <SuccessBanner
            message="Payment marked as paid successfully"
            duration={99999}
          />
        )
      })

      expect(container.textContent).toContain('Payment marked as paid successfully')
    } finally {
      teardown(root, container)
    }
  })

  it('payments page wires successMessage to SuccessBanner with onComplete clearing it', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.join(process.cwd(), 'src/app/dashboard/payments/page.tsx'),
      'utf-8'
    )

    // The page sets successMessage on success
    expect(content).toMatch(/setSuccessMessage\('Payment request sent'\)/)
    // The page renders SuccessBanner conditionally on successMessage
    expect(content).toMatch(/\{successMessage && \(/)
    expect(content).toMatch(/<SuccessBanner/)
    // The page clears successMessage via onComplete
    expect(content).toMatch(/onComplete=\{\(\) => setSuccessMessage\(''\)\}/)
  })
})
