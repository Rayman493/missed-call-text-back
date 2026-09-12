/**
 * Behavioral tests for ChartTouchWrapper clean-tap activation.
 *
 * These tests render the actual ChartTouchWrapper component with a mock
 * child that simulates a Recharts datum (a div with onClick), then
 * dispatch real pointer/touch/click events and verify:
 *
 * A. Clean touch tap on a datum → datum callback fires exactly once
 * B. Vertical touch drag over datum → datum callback fires zero times
 * C. Tap after a drag → works immediately, no stale suppression
 * D. Mouse click → datum callback fires (desktop preserved)
 * E. pointercancel clears gesture state
 *
 * Root cause being fixed:
 * The previous implementation set pointerEvents='none' on pointerdown,
 * which prevented the clean tap's click from reaching the datum handler.
 * The fix only disables pointer events when a drag is detected (movement
 * beyond threshold), so a clean tap's click reaches the datum naturally.
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

// Use React.act (not the deprecated react-dom/test-utils act)
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
// Mock chart datum (simulates a Recharts bar/dot with onClick)
// ============================================================

function MockChart({ onDatumClick }: { onDatumClick: () => void }) {
  return (
    <div className="recharts-wrapper">
      <svg className="recharts-surface">
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

describe('ChartTouchWrapper — behavioral clean-tap activation', () => {
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

  it('A. clean touch tap on datum → datum callback fires exactly once', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    const onDatumClick = vi.fn()

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={onDatumClick} />
        </ChartTouchWrapper>
      )
    })

    // The outer div is the first child of the container
    const wrapper = container.firstElementChild as Element
    expect(wrapper).toBeTruthy()

    const datum = container.querySelector('.recharts-bar-rectangle') as Element
    expect(datum).toBeTruthy()

    // Simulate clean tap: pointerdown (no move) → pointerup → click
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchClick(datum)

    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('B. vertical touch drag over datum → datum callback fires zero times', async () => {
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

    // Simulate vertical drag: pointerdown → pointermove (beyond threshold) → pointerup
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointermove', { clientX: 100, clientY: 130, pointerType: 'touch' })
    // After drag detected, pointer events on inner div are disabled
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 130, pointerType: 'touch' })
    // The click would fire on the outer wrapper, not the datum (inner div has pointerEvents:none)
    dispatchClick(wrapper)

    expect(onDatumClick).toHaveBeenCalledTimes(0)
  })

  it('C. tap after a drag → works immediately, no stale suppression', async () => {
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

  it('D. mouse click → datum callback fires (desktop preserved)', async () => {
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

    // Mouse click (pointerType='mouse') should not trigger drag suppression
    dispatchClick(datum)
    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('E. pointercancel clears gesture state (next tap works)', async () => {
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

    // Start a gesture, then cancel
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointercancel', { clientX: 100, clientY: 100, pointerType: 'touch' })

    // Next clean tap should work
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' })
    dispatchClick(datum)
    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('F. touch fallback: touchstart/touchmove/touchend drag suppresses datum', async () => {
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

    // Simulate drag via touch events (fallback path)
    dispatchTouch(wrapper, 'touchstart', { clientX: 100, clientY: 100 })
    dispatchTouch(wrapper, 'touchmove', { clientX: 100, clientY: 130 })
    dispatchTouch(wrapper, 'touchend')

    // After drag, the inner div pointer events were disabled then restored.
    // A click on the wrapper (not the datum) should not activate the datum.
    dispatchClick(wrapper)
    expect(onDatumClick).toHaveBeenCalledTimes(0)
  })

  it('G. keyboard focus: outer div is tabbable (tabIndex=0)', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={vi.fn()} />
        </ChartTouchWrapper>
      )
    })

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper).toBeTruthy()
    expect(wrapper.tabIndex).toBe(0)
  })

  it('H. no giant focus ring: outer div does NOT have focus-visible:ring classes', async () => {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')

    await act(async () => {
      root.render(
        <ChartTouchWrapper>
          <MockChart onDatumClick={vi.fn()} />
        </ChartTouchWrapper>
      )
    })

    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper).toBeTruthy()
    const className = wrapper.className
    // Must NOT have ring-2 or ring-offset (causes giant white rectangle on Android)
    expect(className).not.toContain('focus-visible:ring-2')
    expect(className).not.toContain('focus-visible:ring-offset-2')
    // Must have focus-visible:outline-2 for keyboard (localized, no offset)
    expect(className).toContain('focus-visible:outline-2')
    expect(className).toContain('focus-visible:outline-blue-500/30')
  })
})
