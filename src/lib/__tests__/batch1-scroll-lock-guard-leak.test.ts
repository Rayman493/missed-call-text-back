import { describe, it, expect, afterEach } from 'vitest'
import { useBodyScrollLock, resetAllScrollLocks } from '@/hooks/useBodyScrollLock'

/**
 * Batch 1 — Finding 8 (FAQ / Help mobile scroll)
 *
 * Regression coverage for the shared scroll-lock touchmove guard lifecycle.
 * preventTouchMove must be a single module-level function: the listener is
 * added by whichever owner acquires the FIRST lock and removed by whichever
 * owner releases the LAST one — often different hook instances. A per-effect
 * closure made removeEventListener a no-op across instances, so the first
 * locker's preventDefault listener stayed attached forever and all touch
 * scrolling outside [data-scroll-lock-allow] died until page reload. That
 * orphaned guard is what froze vertical scrolling on the FAQ / Help page.
 */

function mountLock(componentName: string) {
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { flushSync } = require('react-dom')
  function Comp() {
    useBodyScrollLock(true, componentName)
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => {
    root.render(React.createElement(Comp))
  })
  return {
    unmount() {
      flushSync(() => root.unmount())
      container.remove()
    },
  }
}

function dispatchTouchMove(target: EventTarget = document.body): boolean {
  const e = new Event('touchmove', { cancelable: true, bubbles: true })
  target.dispatchEvent(e)
  return e.defaultPrevented
}

describe('Batch 1 — scroll-lock touchmove guard lifecycle (Finding 8)', () => {
  afterEach(() => {
    resetAllScrollLocks()
  })

  it('overlapping locks: first locker unmounts first, last unlocker still removes the guard', () => {
    const a = mountLock('ModalA')
    const b = mountLock('ModalB')
    // Guard is live while locked — a touchmove on plain content is prevented
    expect(dispatchTouchMove()).toBe(true)
    // First locker releases while B still holds the lock — guard must stay
    a.unmount()
    expect(dispatchTouchMove()).toBe(true)
    // Last unlocker removes the guard even though it never added it
    b.unmount()
    expect(dispatchTouchMove()).toBe(false)
    expect(document.body.style.touchAction).not.toBe('none')
    expect(document.body.hasAttribute('data-modal-open')).toBe(false)
  })

  it('resetAllScrollLocks removes the guard while a lock is still held', () => {
    const a = mountLock('ModalA')
    expect(dispatchTouchMove()).toBe(true)
    resetAllScrollLocks()
    // Orphaned guard must not keep preventDefault-ing after the reset
    expect(dispatchTouchMove()).toBe(false)
    a.unmount()
  })

  it('single lock open/close leaves no guard behind', () => {
    const a = mountLock('ModalA')
    a.unmount()
    expect(dispatchTouchMove()).toBe(false)
  })
})
