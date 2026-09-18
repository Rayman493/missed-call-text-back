import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/lib/toast.ts', 'utf8')

describe('showToast positioning contract', () => {
  it('accepts an optional anchor element for control-adjacent positioning', () => {
    expect(content).toContain('anchor?: Element | null')
    expect(content).toContain('options?.anchor')
    expect(content).toContain('getBoundingClientRect()')
  })

  it('defaults to a canonical elevated position above the bottom nav + safe area', () => {
    expect(content).toContain('calc(4.5rem + env(safe-area-inset-bottom) + 0.5rem)')
  })

  it('keeps polished ReplyFlow visuals and accessible status semantics', () => {
    expect(content).toContain("setAttribute('role', 'status')")
    expect(content).toContain("setAttribute('aria-live', 'polite')")
    expect(content).toContain('bg-popover')
    expect(content).toContain('text-popover-foreground')
    expect(content).toContain('z-[100]')
  })

  it('does not use alert()', () => {
    expect(content).not.toContain('alert(')
  })
})
