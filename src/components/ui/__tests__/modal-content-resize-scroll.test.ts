import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const modalSource = readFileSync('src/components/ui/Modal.tsx', 'utf8')

describe('Modal async content resize scroll handling', () => {
  it('exposes a ref on the scrollable modal content panel', () => {
    expect(modalSource).toMatch(/ref=\{contentRef\}/)
  })

  it('attaches a ResizeObserver to the content panel', () => {
    expect(modalSource).toMatch(/new ResizeObserver/)
    expect(modalSource).toMatch(/ro\.observe\(content\)/)
  })

  it('only re-anchors when the user was already near the bottom and content grew', () => {
    expect(modalSource).toMatch(/wasNearBottom/)
    expect(modalSource).toMatch(/scrollHeight > prev\.scrollHeight/)
    expect(modalSource).toMatch(/content\.scrollTop = Math\.max\(0, scrollHeight - content\.clientHeight\)/)
  })

  it('records scroll state from passive scroll events', () => {
    expect(modalSource).toMatch(/addEventListener\('scroll', updateScrollState, \{ passive: true \}\)/)
  })
})
