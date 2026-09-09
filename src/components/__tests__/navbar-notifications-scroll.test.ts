import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('NavbarNotifications mobile scroll structure', () => {
  const content = readFileSync('src/components/NavbarNotifications.tsx', 'utf8')

  it('renders the notification panel as a flex column with bounded height', () => {
    expect(content).toContain('flex flex-col')
    expect(content).toMatch(/maxHeight: isMobile \? 'calc\(100dvh - 120px\)' : '600px'/)
  })

  it('marks the header and footer as non-shrinking', () => {
    expect(content).toContain('border-b border-border bg-muted/20 shrink-0')
    expect(content).toContain('border-t border-border bg-muted/20 shrink-0')
  })

  it('gives the notification list a dedicated scroll owner', () => {
    expect(content).toContain('flex-1 min-h-0 overflow-y-auto')
  })

  it('allows internal touch scrolling through the body scroll lock', () => {
    expect(content).toContain('data-scroll-lock-allow')
  })

  it('uses pan-y touch action and overscroll containment', () => {
    expect(content).toContain('touch-pan-y')
    expect(content).toContain('overscroll-contain')
  })

  it('uses momentum scrolling on iOS WebViews', () => {
    expect(content).toContain("WebkitOverflowScrolling: 'touch'")
  })
})
