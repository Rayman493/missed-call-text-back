import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('LeadStatusDropdown scroll-then-dismiss', () => {
  const content = readFileSync('src/components/LeadStatusDropdown.tsx', 'utf8')

  it('has pointer gesture detection on the trigger', () => {
    expect(content).toContain('handlePointerDown')
    expect(content).toContain('handlePointerMove')
    expect(content).toContain('handlePointerUp')
  })

  it('uses the shared gesture threshold utility', () => {
    expect(content).toContain('shouldPreventMenuOpen')
  })

  it('prevents menu open on scroll gesture', () => {
    expect(content).toContain('hasMovedBeyondThreshold')
    expect(content).toContain('!wasScrollGesture')
  })

  it('allows the dropdown content to scroll independently', () => {
    expect(content).toContain('overflow-y-auto')
    expect(content).toContain('overscroll-contain')
  })

  it('marks the dropdown content as scroll-lock-allow', () => {
    expect(content).toContain('data-scroll-lock-allow')
  })

  it('closes on outside pointer down via onPointerDownOutside', () => {
    expect(content).toContain('onPointerDownOutside')
    expect(content).toContain('setIsOpen(false)')
  })
})
