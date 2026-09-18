import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/LeadCard.tsx', 'utf8')

describe('LeadCard first-tap reliability', () => {
  it('uses useMobilePressGuard for pointer-based activation', () => {
    expect(content).toContain('useMobilePressGuard')
    expect(content).toContain('onActivate: () => onOpen(lead.id)')
    expect(content).toContain('onPointerDown={pressGuard.onPointerDown}')
    expect(content).toContain('onPointerUp={pressGuard.onPointerUp}')
  })

  it('does not duplicate activation with a separate onClick handler', () => {
    expect(content).not.toMatch(/onClick=\{\(\) => onOpen\(lead\.id\)\}/)
  })

  it('preserves keyboard activation via onKeyDown', () => {
    expect(content).toContain('onKeyDown={')
    expect(content).toContain("e.key === 'Enter'")
    expect(content).toContain('onOpen(lead.id)')
  })
})
