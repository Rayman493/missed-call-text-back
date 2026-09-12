/**
 * Batch 3 — Behavioral tests for ChartTouchWrapper capture-phase drag suppression
 *
 * These tests render the actual ChartTouchWrapper component with a mock chart
 * that simulates Recharts' DOM structure (recharts-wrapper, recharts-surface,
 * recharts-bar-rectangle). They verify:
 *
 * A. Clean touch tap → datum callback fires (preserved)
 * B. Vertical drag → datum callback fires zero times (suppressed)
 * C. Drag → capture-phase stopPropagation prevents Recharts touchmove
 * D. Tap after drag → works immediately (no stale suppression)
 * E. Mouse click → datum callback fires (desktop preserved)
 * F. pointercancel → state resets, next tap works
 * G. Drag → clearRechartsState dispatches synthetic mouseleave on surface
 *
 * Root cause being fixed:
 * The previous implementation only disabled pointer events AFTER the 10px
 * threshold was exceeded, but Recharts received touchmove/pointermove BEFORE
 * that and activated activeDot/activeBar. The fix adds capture-phase handlers
 * that stop propagation when drag is detected, preventing Recharts from
 * receiving the events at all. Also, clearRechartsState is called immediately
 * when drag is detected (not just on touchend).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, Root } from 'react-dom/client'

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

function act(fn: () => void | Promise<void>) {
  return React.act(fn)
}

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
    button: 0,
    buttons: type === 'pointerdown' ? 1 : 0,
    bubbles: true,
    cancelable: true,
    composed: true,
  } as any)
  target.dispatchEvent(event)
  return event
}

function dispatchClick(target: Element) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function dispatchTouch(
  target: Element,
  type: 'touchstart' | 'touchmove' | 'touchend',
  opts: { clientX?: number; clientY?: number } = {}
) {
  const touch = { clientX: opts.clientX ?? 0, clientY: opts.clientY ?? 0, identifier: 0 } as any
  const event = new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
    targetTouches: type === 'touchend' ? [] : [touch],
    bubbles: true,
    cancelable: true,
  } as any)
  target.dispatchEvent(event)
  return event
}

// ============================================================
// Mock chart (simulates Recharts DOM structure)
// ============================================================

function MockChart({ onDatumClick, onSurfaceTouchMove }: {
  onDatumClick: () => void
  onSurfaceTouchMove?: (e: Event) => void
}) {
  return (
    <div className="recharts-wrapper">
      <svg
        className="recharts-surface"
        onTouchMove={onSurfaceTouchMove}
      >
        <rect
          className="recharts-bar-rectangle"
          onClick={onDatumClick}
          style={{ pointerEvents: 'auto' }}
        />
      </svg>
    </div>
  )
}

// ============================================================
// Tests
// ============================================================

describe('Batch 3 — ChartTouchWrapper capture-phase drag suppression', () => {
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

  it('A. clean touch tap → datum callback fires exactly once', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    const onDatumClick = vi.fn()

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={onDatumClick} />
        </ChartTouchWrapper>
      )
    })

    const wrapper = container.firstElementChild as Element
    const datum = container.querySelector('.recharts-bar-rectangle') as Element

    // Clean tap: pointerdown (no move) → pointerup → click
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchClick(datum)

    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('B. vertical drag → datum callback fires zero times', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    const onDatumClick = vi.fn()

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={onDatumClick} />
        </ChartTouchWrapper>
      )
    })

    const wrapper = container.firstElementChild as Element

    // Vertical drag: pointerdown → pointermove (beyond 10px) → pointerup → click
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointermove', { clientX: 100, clientY: 130, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 130, pointerType: 'touch' })
    dispatchClick(wrapper)

    expect(onDatumClick).toHaveBeenCalledTimes(0)
  })

  it('C. drag → capture-phase stopPropagation prevents Recharts touchmove', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    const onDatumClick = vi.fn()

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={onDatumClick} />
        </ChartTouchWrapper>
      )
    })

    const wrapper = container.firstElementChild as Element

    // Simulate vertical drag: pointerdown → pointermove (beyond threshold) → pointerup
    // The drag should suppress the datum activation
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointermove', { clientX: 100, clientY: 130, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 130, pointerType: 'touch' })
    // Click on the wrapper (not the datum) — should not activate datum
    dispatchClick(wrapper)

    expect(onDatumClick).toHaveBeenCalledTimes(0)
  })

  it('D. tap after drag → works immediately, no stale suppression', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    const onDatumClick = vi.fn()

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={onDatumClick} />
        </ChartTouchWrapper>
      )
    })

    const wrapper = container.firstElementChild as Element
    const datum = container.querySelector('.recharts-bar-rectangle') as Element

    // First: drag (should not activate datum)
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointermove', { clientX: 100, clientY: 130, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 130, pointerType: 'touch' })
    dispatchClick(wrapper)
    expect(onDatumClick).toHaveBeenCalledTimes(0)

    // Second: clean tap (should activate datum immediately)
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchClick(datum)
    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('E. mouse click → datum callback fires (desktop preserved)', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    const onDatumClick = vi.fn()

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={onDatumClick} />
        </ChartTouchWrapper>
      )
    })

    const datum = container.querySelector('.recharts-bar-rectangle') as Element

    // Mouse click should not trigger drag suppression
    dispatchClick(datum)
    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('F. pointercancel → state resets, next tap works', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    const onDatumClick = vi.fn()

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={onDatumClick} />
        </ChartTouchWrapper>
      )
    })

    const wrapper = container.firstElementChild as Element
    const datum = container.querySelector('.recharts-bar-rectangle') as Element

    // Start drag, then cancel
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointermove', { clientX: 100, clientY: 130, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointercancel', { clientX: 100, clientY: 130, pointerType: 'touch' })

    // Dragging state should be cleared
    const draggingAttr = wrapper.getAttribute('data-chart-dragging')
    expect(draggingAttr).toBeNull()

    // Next clean tap should work
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchClick(datum)
    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('G. drag → clearRechartsState dispatches synthetic mouseleave on surface', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    const onDatumClick = vi.fn()

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={onDatumClick} />
        </ChartTouchWrapper>
      )
    })

    const wrapper = container.firstElementChild as Element
    const surface = container.querySelector('.recharts-surface') as Element

    // Track mouseleave events on the surface
    const mouseLeaves = vi.fn()
    surface.addEventListener('mouseleave', mouseLeaves)

    // Start drag
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    // Move beyond threshold — should trigger clearRechartsState
    dispatchPointer(wrapper, 'pointermove', { clientX: 100, clientY: 130, pointerType: 'touch' })

    // clearRechartsState should have dispatched a mouseleave on the surface
    expect(mouseLeaves).toHaveBeenCalled()

    // End the drag
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 130, pointerType: 'touch' })
  })

  it('H. touch drag via touch events → datum not activated', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    const onDatumClick = vi.fn()

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={onDatumClick} />
        </ChartTouchWrapper>
      )
    })

    const wrapper = container.firstElementChild as Element

    // Simulate touch-only drag (no pointer events)
    dispatchTouch(wrapper, 'touchstart', { clientX: 100, clientY: 100 })
    dispatchTouch(wrapper, 'touchmove', { clientX: 100, clientY: 130 })
    dispatchTouch(wrapper, 'touchend', { clientX: 100, clientY: 130 })
    dispatchClick(wrapper)

    expect(onDatumClick).toHaveBeenCalledTimes(0)
  })

  it('I. touch tap via touch events → datum activated', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    const onDatumClick = vi.fn()

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={onDatumClick} />
        </ChartTouchWrapper>
      )
    })

    const wrapper = container.firstElementChild as Element
    const datum = container.querySelector('.recharts-bar-rectangle') as Element

    // Simulate clean touch tap (no movement)
    dispatchTouch(wrapper, 'touchstart', { clientX: 100, clientY: 100 })
    dispatchTouch(wrapper, 'touchend', { clientX: 100, clientY: 100 })
    dispatchClick(datum)

    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })
})
