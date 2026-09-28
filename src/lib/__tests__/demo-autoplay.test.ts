import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { createRoot, Root } from 'react-dom/client'

const act = (React as any).act as typeof import('react-dom/test-utils').act
import {
  clampStepIndex,
  nextStepIndex,
  prevStepIndex,
  createAutoplayScheduler,
} from '@/lib/demo-autoplay'

/**
 * Regression: the homepage "See How It Works" demo sat on step 1 forever
 * while showing "Pause". The autoplay effect stored the timeout id in state
 * AND listed it as a dependency, so every setTimerId re-ran the effect,
 * cleared the pending timer, and scheduled a fresh one — the countdown was
 * destroyed and recreated in an infinite loop and could never fire. A
 * duplicate stale timeout could also push step past the end, crashing on
 * steps[step].label.
 */

const STEP_DELAY_COMPACT = 5500

describe('step index helpers', () => {
  it('clamps into range', () => {
    expect(clampStepIndex(0, 9)).toBe(0)
    expect(clampStepIndex(8, 9)).toBe(8)
    expect(clampStepIndex(9, 9)).toBe(8) // never out of range
    expect(clampStepIndex(99, 9)).toBe(8)
    expect(clampStepIndex(-3, 9)).toBe(0)
    expect(clampStepIndex(NaN, 9)).toBe(0)
  })

  it('next clamps at the final step', () => {
    expect(nextStepIndex(0, 9)).toBe(1)
    expect(nextStepIndex(8, 9)).toBe(8)
  })

  it('prev clamps at the first step', () => {
    expect(prevStepIndex(3, 9)).toBe(2)
    expect(prevStepIndex(0, 9)).toBe(0)
  })
})

describe('createAutoplayScheduler', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires onTick after the delay', () => {
    const onTick = vi.fn()
    const s = createAutoplayScheduler({ getDelayMs: () => STEP_DELAY_COMPACT, onTick })
    s.schedule()
    vi.advanceTimersByTime(STEP_DELAY_COMPACT - 1)
    expect(onTick).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onTick).toHaveBeenCalledTimes(1)
    expect(s.pending).toBe(false)
  })

  it('never has two pending timers (schedule cancels the previous)', () => {
    const onTick = vi.fn()
    const s = createAutoplayScheduler({ getDelayMs: () => STEP_DELAY_COMPACT, onTick })
    s.schedule()
    s.schedule()
    s.schedule()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(STEP_DELAY_COMPACT)
    expect(onTick).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancel prevents the tick', () => {
    const onTick = vi.fn()
    const s = createAutoplayScheduler({ getDelayMs: () => STEP_DELAY_COMPACT, onTick })
    s.schedule()
    s.cancel()
    expect(s.pending).toBe(false)
    vi.advanceTimersByTime(STEP_DELAY_COMPACT * 2)
    expect(onTick).not.toHaveBeenCalled()
  })

  it('repeated schedule/cancel cycles leave no residue', () => {
    const onTick = vi.fn()
    const s = createAutoplayScheduler({ getDelayMs: () => STEP_DELAY_COMPACT, onTick })
    for (let i = 0; i < 10; i++) {
      s.schedule()
      s.cancel()
      s.schedule()
    }
    expect(vi.getTimerCount()).toBe(1)
    s.cancel()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('InteractiveDemoWalkthrough autoplay', () => {
  let container: HTMLDivElement
  let root: Root
  let InteractiveDemoWalkthrough: typeof import('@/components/InteractiveDemoWalkthrough').default

  const stepText = () => container.textContent?.match(/Step (\d+) of 9/)?.[1]
  const btn = (label: string) =>
    Array.from(container.querySelectorAll('button')).find((b) =>
      b.getAttribute('aria-label')?.toLowerCase().includes(label)
    ) as HTMLButtonElement
  const click = (label: string) => act(() => { btn(label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
  // Each step's next timeout is scheduled by an effect that flushes at act
  // exit — multi-step advances must tick one step at a time.
  const advanceSteps = (n: number) => { for (let i = 0; i < n; i++) advance(STEP_DELAY_COMPACT) }

  beforeEach(async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }))
    InteractiveDemoWalkthrough = (await import('@/components/InteractiveDemoWalkthrough')).default
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(React.createElement(InteractiveDemoWalkthrough, { compact: true, showHeader: true }))
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('starts autoplaying on mount and advances automatically', () => {
    expect(stepText()).toBe('1')
    expect(btn('pause autoplay')).toBeTruthy()
    advance(STEP_DELAY_COMPACT)
    expect(stepText()).toBe('2')
  })

  it('advances through multiple steps', () => {
    advanceSteps(3)
    expect(stepText()).toBe('4')
  })

  it('pause stops advancing; resume continues from the same step', () => {
    advance(STEP_DELAY_COMPACT)
    expect(stepText()).toBe('2')
    click('pause autoplay')
    advance(STEP_DELAY_COMPACT * 5)
    expect(stepText()).toBe('2')
    click('start autoplay')
    advance(STEP_DELAY_COMPACT)
    expect(stepText()).toBe('3')
  })

  it('Next/Previous move the step and keep a single sane timer', () => {
    click('next step')
    expect(stepText()).toBe('2')
    click('previous step')
    expect(stepText()).toBe('1')
    // still playing, exactly one pending timeout
    expect(vi.getTimerCount()).toBe(1)
    advance(STEP_DELAY_COMPACT)
    expect(stepText()).toBe('2')
  })

  it('Restart returns to step 1 and keeps playing', () => {
    advanceSteps(2)
    expect(stepText()).toBe('3')
    click('restart')
    expect(stepText()).toBe('1')
    advance(STEP_DELAY_COMPACT)
    expect(stepText()).toBe('2')
  })

  it('final step stops autoplay and never goes out of range', () => {
    advanceSteps(15)
    expect(stepText()).toBe('9')
    expect(btn('next step').disabled).toBe(true)
    // autoplay self-stopped on the final step — button offers restart+play
    expect(btn('start autoplay')).toBeTruthy()
    advanceSteps(5)
    expect(stepText()).toBe('9') // no overshoot, no crash
  })

  it('Play on the final step restarts from step 1', () => {
    advanceSteps(15)
    expect(stepText()).toBe('9')
    click('start autoplay')
    expect(stepText()).toBe('1')
    advance(STEP_DELAY_COMPACT)
    expect(stepText()).toBe('2')
  })

  it('repeated pause/resume/restart never leaves duplicate timers', () => {
    for (let i = 0; i < 6; i++) {
      click('pause autoplay')
      click('start autoplay')
      click('restart')
    }
    expect(vi.getTimerCount()).toBe(1)
    advance(STEP_DELAY_COMPACT)
    expect(stepText()).toBe('2')
  })

  it('unmount cleans up the pending timer', () => {
    advance(1000)
    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
    // remount for afterEach safety
    container.remove()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => { root.render(React.createElement('div')) })
  })
})
