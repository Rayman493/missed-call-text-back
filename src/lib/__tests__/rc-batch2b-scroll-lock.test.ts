import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Batch 2B — shared modal/scroll lock contract', () => {
  const lockSrc = readSrc('src/hooks/useBodyScrollLock.ts')

  it('1. captures window scroll position and restores on final unlock', () => {
    expect(lockSrc).toContain('globalScrollPosition = window.pageYOffset')
    expect(lockSrc).toContain('window.scrollTo(0, globalScrollPosition)')
  })

  it('2. freezes body and html overflow, not fixed-position geometry of html', () => {
    expect(lockSrc).toContain("document.body.style.position = 'fixed'")
    expect(lockSrc).toContain("document.body.style.top = `-${globalScrollPosition}px`")
    expect(lockSrc).toContain("document.documentElement.style.overflow = 'hidden'")
    expect(lockSrc).not.toContain("document.documentElement.style.position = 'fixed'")
    expect(lockSrc).not.toContain("document.documentElement.style.width = '100%'")
  })

  it('3. sets and removes the canonical data-modal-open attribute', () => {
    expect(lockSrc).toContain("document.body.setAttribute('data-modal-open', 'true')")
    expect(lockSrc).toContain("document.body.removeAttribute('data-modal-open')")
  })

  it('4. uses reference counting for nested modals', () => {
    expect(lockSrc).toContain('lockCount')
    expect(lockSrc).toContain('activeOwners')
    expect(lockSrc).toContain('if (lockCount === 0)')
  })

  it('5. no timer-based scroll restoration', () => {
    expect(lockSrc).not.toContain('setTimeout')
  })

  it('6. allows touch scrolling inside [data-scroll-lock-allow]', () => {
    expect(lockSrc).toContain("data-scroll-lock-allow")
    expect(lockSrc).toContain("closest('[data-scroll-lock-allow]')")
  })
})
