/**
 * ChartTouchWrapper — gesture axis ownership regression tests.
 *
 * Physical bug: on Android, starting a vertical page scroll on a chart
 * surface sometimes felt trapped/interfered with. Root cause: one-shot axis
 * classification claimed 'horizontal' whenever the first >=10px delta had
 * deltaX >= deltaY — first-move lateral noise on a vertical-intent scroll
 * flipped the chart into scrub mode (pointer-events flip, datum activation,
 * suppressed follow-up click). The fix requires the dominant axis to lead by
 * a margin before ownership is claimed, and resolves sustained ambiguity to
 * vertical (page owns).
 *
 * Behavioral assertions verify event ownership (preventDefault, pointer
 * events, datum activation), not class strings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..', '..', '..')
const chartUtilsSrc = readFileSync(join(repoRoot, 'src/lib/chart-utils.tsx'), 'utf-8').replace(/\r\n/g, '\n')
const globalsCss = readFileSync(join(repoRoot, 'src/app/globals.css'), 'utf-8').replace(/\r\n/g, '\n')

function setupContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root }
}

function act(fn: () => void | Promise<void>) {
  return React.act(fn)
}

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  opts: { clientX?: number; clientY?: number; pointerType?: string } = {}
) {
  const event = new PointerEvent(type, {
    pointerType: opts.pointerType ?? 'touch',
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    pointerId: 1,
    button: 0,
    buttons: type === 'pointerdown' ? 1 : 0,
    bubbles: true,
    cancelable: true,
    composed: true,
  } as any)
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

function dispatchClick(target: Element) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

const DATA = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }]

function MockChart({ onDatumClick }: { onDatumClick: () => void }) {
  return (
    <div className="recharts-wrapper">
      <svg className="recharts-surface">
        <rect className="recharts-bar-rectangle" onClick={onDatumClick} />
      </svg>
    </div>
  )
}

/** Stub the Recharts surface rect so X→index mapping works in JSDOM. */
function stubSurfaceRect(container: HTMLElement) {
  const surface = container.querySelector('.recharts-surface') as Element
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  return surface
}

describe('ChartTouchWrapper — axis ownership', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    const setup = setupContainer()
    container = setup.container
    root = setup.root
  })

  afterEach(() => {
    act(() => { root.unmount() })
    container.remove()
  })

  async function render(opts: { onDatumClick?: () => void; onActiveIndexChange?: (i: number | null) => void } = {}) {
    const { ChartTouchWrapper } = await import('@/lib/chart-utils')
    await act(async () => {
      root.render(
        <ChartTouchWrapper data={DATA} onActiveIndexChange={opts.onActiveIndexChange}>
          <MockChart onDatumClick={opts.onDatumClick ?? (() => {})} />
        </ChartTouchWrapper>
      )
    })
    return container.firstElementChild as HTMLElement
  }

  it('1. clean tap → datum activates', async () => {
    const onDatumClick = vi.fn()
    const wrapper = await render({ onDatumClick })
    const datum = container.querySelector('.recharts-bar-rectangle') as Element

    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 100 })
    dispatchClick(datum)

    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('2. pointerdown alone → no preventDefault, no ownership claim', async () => {
    const wrapper = await render()
    const down = dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    expect(down.defaultPrevented).toBe(false)
    const inner = wrapper.firstElementChild as HTMLElement
    expect(inner.style.pointerEvents).not.toBe('none')
  })

  it('3. sub-threshold movement → no preventDefault, no activation', async () => {
    const onActiveIndexChange = vi.fn()
    const wrapper = await render({ onActiveIndexChange })
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    const move = dispatchPointer(wrapper, 'pointermove', { clientX: 105, clientY: 108 })
    expect(move.defaultPrevented).toBe(false)
    expect(onActiveIndexChange).not.toHaveBeenCalled()
  })

  it('4. vertical movement past threshold → no preventDefault, no pointer-events claim, no activation', async () => {
    const onActiveIndexChange = vi.fn()
    const wrapper = await render({ onActiveIndexChange })
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    const move = dispatchPointer(wrapper, 'pointermove', { clientX: 102, clientY: 140 })
    expect(move.defaultPrevented).toBe(false)

    const inner = wrapper.firstElementChild as HTMLElement
    expect(inner.style.pointerEvents).not.toBe('none')
    expect(onActiveIndexChange).not.toHaveBeenCalled()
    // No scrub state
    expect(wrapper.getAttribute('data-chart-scrubbing')).not.toBe('true')
  })

  it('5. mostly-vertical diagonal → page owns (same as vertical)', async () => {
    const onActiveIndexChange = vi.fn()
    const wrapper = await render({ onActiveIndexChange })
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    // dx=10, dy=40 → clearly vertical-dominant
    const move = dispatchPointer(wrapper, 'pointermove', { clientX: 110, clientY: 140 })
    expect(move.defaultPrevented).toBe(false)
    expect(onActiveIndexChange).not.toHaveBeenCalled()
    const inner = wrapper.firstElementChild as HTMLElement
    expect(inner.style.pointerEvents).not.toBe('none')
  })

  it('6. horizontal movement → chart owns: scrub activates nearest datum', async () => {
    const onActiveIndexChange = vi.fn()
    const wrapper = await render({ onActiveIndexChange })
    stubSurfaceRect(container)

    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    // dx=55, dy=4 → horizontal-dominant → classify (classification move itself
    // must not preventDefault; the browser may still be deciding)
    const classifying = dispatchPointer(wrapper, 'pointermove', { clientX: 155, clientY: 104 })
    expect(classifying.defaultPrevented).toBe(false)
    // Once owned, subsequent horizontal moves may preventDefault + scrub
    const scrub = dispatchPointer(wrapper, 'pointermove', { clientX: 160, clientY: 104 })
    expect(scrub.defaultPrevented).toBe(true)
    expect(onActiveIndexChange).toHaveBeenCalled()
    expect(onActiveIndexChange.mock.calls[0][0]).toBe(2)
    // Chart owns: inner chart pointer events are claimed for the scrub
    const inner = wrapper.firstElementChild as HTMLElement
    expect(inner.style.pointerEvents).toBe('none')
  })

  it('7. mostly-horizontal diagonal → chart ownership', async () => {
    const onActiveIndexChange = vi.fn()
    const wrapper = await render({ onActiveIndexChange })
    stubSurfaceRect(container)

    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    // dx=40, dy=10 → dominance 30 >= margin → horizontal (classifying move)
    dispatchPointer(wrapper, 'pointermove', { clientX: 140, clientY: 110 })
    // Subsequent owned move: chart may preventDefault + scrub
    const move = dispatchPointer(wrapper, 'pointermove', { clientX: 145, clientY: 110 })
    expect(move.defaultPrevented).toBe(true)
    expect(onActiveIndexChange).toHaveBeenCalled()
  })

  it('8. ambiguous first-move noise must NOT claim the chart (the physical regression)', async () => {
    const onActiveIndexChange = vi.fn()
    const wrapper = await render({ onActiveIndexChange })
    const inner = wrapper.firstElementChild as HTMLElement
    stubSurfaceRect(container)

    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    // First-move noise: dx=11, dy=10 — lateral leads by 1px. Old code locked
    // 'horizontal' here. Must stay unowned.
    const noiseMove = dispatchPointer(wrapper, 'pointermove', { clientX: 111, clientY: 110 })
    expect(noiseMove.defaultPrevented).toBe(false)
    expect(inner.style.pointerEvents).not.toBe('none')
    expect(onActiveIndexChange).not.toHaveBeenCalled()
    expect(wrapper.getAttribute('data-chart-scrubbing')).not.toBe('true')

    // Gesture resolves vertical — still no chart side effects
    const vMove = dispatchPointer(wrapper, 'pointermove', { clientX: 112, clientY: 160 })
    expect(vMove.defaultPrevented).toBe(false)
    expect(onActiveIndexChange).not.toHaveBeenCalled()
    expect(inner.style.pointerEvents).not.toBe('none')
  })

  it('9. horizontal drag release → exactly one follow-up click suppressed', async () => {
    const onDatumClick = vi.fn()
    const wrapper = await render({ onDatumClick })
    stubSurfaceRect(container)
    const datum = container.querySelector('.recharts-bar-rectangle') as Element

    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    dispatchPointer(wrapper, 'pointermove', { clientX: 160, clientY: 102 })
    dispatchPointer(wrapper, 'pointerup', { clientX: 160, clientY: 102 })

    dispatchClick(datum)
    expect(onDatumClick).toHaveBeenCalledTimes(0)
    dispatchClick(datum)
    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('10. next genuine tap after a vertical scroll works normally', async () => {
    const onDatumClick = vi.fn()
    const wrapper = await render({ onDatumClick })
    const datum = container.querySelector('.recharts-bar-rectangle') as Element

    // Vertical scroll gesture
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    dispatchPointer(wrapper, 'pointermove', { clientX: 101, clientY: 160 })
    dispatchPointer(wrapper, 'pointerup', { clientX: 101, clientY: 160 })
    dispatchClick(wrapper) // post-scroll synthesized click is eaten

    // Genuine tap — new gesture resets suppression at pointerdown
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    dispatchPointer(wrapper, 'pointerup', { clientX: 100, clientY: 100 })
    dispatchClick(datum)
    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('11. pointercancel → full reset, no sticky ownership', async () => {
    const onActiveIndexChange = vi.fn()
    const wrapper = await render({ onActiveIndexChange })
    stubSurfaceRect(container)
    const inner = wrapper.firstElementChild as HTMLElement

    // Start horizontal scrub, then cancel mid-gesture
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    dispatchPointer(wrapper, 'pointermove', { clientX: 160, clientY: 100 })
    expect(inner.style.pointerEvents).toBe('none')
    dispatchPointer(wrapper, 'pointercancel', { clientX: 160, clientY: 100 })

    expect(inner.style.pointerEvents).toBe('auto')
    expect(wrapper.getAttribute('data-chart-scrubbing')).not.toBe('true')

    // Fresh gesture starts clean
    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    const move = dispatchPointer(wrapper, 'pointermove', { clientX: 100, clientY: 140 })
    expect(move.defaultPrevented).toBe(false)
  })

  it('12. desktop mouse → click unchanged, no suppression', async () => {
    const onDatumClick = vi.fn()
    await render({ onDatumClick })
    const datum = container.querySelector('.recharts-bar-rectangle') as Element
    dispatchClick(datum)
    expect(onDatumClick).toHaveBeenCalledTimes(1)
  })

  it('13. touch-event path: ambiguous-then-vertical never claims the chart', async () => {
    const onActiveIndexChange = vi.fn()
    const wrapper = await render({ onActiveIndexChange })
    const inner = wrapper.firstElementChild as HTMLElement

    dispatchTouch(wrapper, 'touchstart', { clientX: 100, clientY: 100 })
    // Noise: dx leads by 1px at threshold
    const noise = dispatchTouch(wrapper, 'touchmove', { clientX: 111, clientY: 110 })
    expect(noise.defaultPrevented).toBe(false)
    expect(inner.style.pointerEvents).not.toBe('none')

    const resolved = dispatchTouch(wrapper, 'touchmove', { clientX: 112, clientY: 160 })
    expect(resolved.defaultPrevented).toBe(false)
    expect(onActiveIndexChange).not.toHaveBeenCalled()
    dispatchTouch(wrapper, 'touchend')
  })

  it('14. sustained ambiguous diagonal resolves to page, never activates datum', async () => {
    const onDatumClick = vi.fn()
    const onActiveIndexChange = vi.fn()
    const wrapper = await render({ onDatumClick, onActiveIndexChange })
    stubSurfaceRect(container)
    const datum = container.querySelector('.recharts-bar-rectangle') as Element

    dispatchPointer(wrapper, 'pointerdown', { clientX: 100, clientY: 100 })
    // 45° diagonal: neither axis dominates by the margin; travels past the
    // ambiguity distance → resolves vertical (page owns)
    dispatchPointer(wrapper, 'pointermove', { clientX: 113, clientY: 112 })
    dispatchPointer(wrapper, 'pointermove', { clientX: 125, clientY: 124 })
    expect(onActiveIndexChange).not.toHaveBeenCalled()
    const inner = wrapper.firstElementChild as HTMLElement
    expect(inner.style.pointerEvents).not.toBe('none')

    dispatchPointer(wrapper, 'pointerup', { clientX: 125, clientY: 124 })
    // Post-gesture synthesized click is suppressed — a long drag must not
    // activate a datum.
    dispatchClick(datum)
    expect(onDatumClick).toHaveBeenCalledTimes(0)
  })
})

describe('ChartTouchWrapper — structural contract', () => {
  it('no document-level gesture listeners', () => {
    expect(chartUtilsSrc).not.toContain('document.addEventListener')
    expect(chartUtilsSrc).not.toContain('window.addEventListener')
  })

  it('no pointer capture APIs are used', () => {
    expect(chartUtilsSrc).not.toContain('setPointerCapture')
    expect(chartUtilsSrc).not.toContain('releasePointerCapture')
  })

  it('vertical path never calls preventDefault or setPointerCapture; may stopPropagation to block Recharts only', () => {
    const touchMove = chartUtilsSrc.match(/handleTouchMoveCapture[\s\S]*?\n  \}/)
    expect(touchMove).toBeTruthy()
    const body = touchMove![0]
    // The vertical branch must not preventDefault (page scroll must remain native),
    // but it deliberately stops propagation in capture phase so Recharts' own
    // touch handlers cannot claim the gesture. Pointer capture is never used.
    const verticalIdx = body.indexOf("gestureModeRef.current === 'vertical'")
    const horizontalIdx = body.indexOf("gestureModeRef.current === 'horizontal'")
    expect(verticalIdx).toBeGreaterThan(-1)
    expect(horizontalIdx).toBeGreaterThan(verticalIdx)
    const verticalBranch = body.substring(verticalIdx, horizontalIdx)
    expect(verticalBranch).not.toContain('preventDefault(')
    expect(verticalBranch).not.toContain('setPointerCapture(')
  })

  it('classification requires dominant-axis margin (no one-shot noise lock)', () => {
    expect(chartUtilsSrc).toContain('GESTURE_AXIS_MARGIN')
    expect(chartUtilsSrc).toContain('classifyGestureAxis')
    // Ambiguity must resolve to vertical (page), never horizontal
    expect(chartUtilsSrc).toMatch(/GESTURE_AMBIGUOUS_DISTANCE[^;]*\? 'vertical' : null/)
  })

  it('clearRechartsState is not dispatched per vertical move', () => {
    const touchMove = chartUtilsSrc.match(/handleTouchMoveCapture[\s\S]*?\n  \}/)
    const body = touchMove![0]
    const verticalIdx = body.indexOf("gestureModeRef.current === 'vertical'")
    const horizontalIdx = body.indexOf("gestureModeRef.current === 'horizontal'")
    const verticalBranch = body.substring(verticalIdx, horizontalIdx)
    expect(verticalBranch).not.toContain('clearRechartsState')
  })

  it('interactive chart surfaces permit native vertical pan (pan-y)', () => {
    // Wrapper inline style
    expect(chartUtilsSrc).toContain("touchAction: 'pan-y'")
    expect(chartUtilsSrc).not.toContain("touchAction: 'none'")
    // CSS covers the actual Recharts touch targets
    expect(globalsCss).toMatch(/\.recharts-surface,[\s\S]*?\.recharts-wrapper,[\s\S]*?\.recharts-bar,[\s\S]*?\{[\s\S]*?touch-action:\s*pan-y/)
  })
})
