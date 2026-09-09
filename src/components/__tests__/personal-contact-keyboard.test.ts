import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Personal Contact modal keyboard layout', () => {
  const content = readFileSync('src/components/SettingsContent.tsx', 'utf8')

  it('tracks visualViewport height while the Add Personal Contact modal is open', () => {
    expect(content).toContain('visualViewport')
    expect(content).toContain('setVvh')
  })

  it('uses the tracked viewport height for the modal container maxHeight', () => {
    expect(content).toContain('vvh')
    expect(content).toContain('maxHeight')
  })

  it('body scrolls independently with flex-1 min-h-0 and scroll-lock-allow', () => {
    expect(content).toContain('flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y')
    expect(content).toContain('data-scroll-lock-allow')
  })

  it('keeps the footer as a separate flex-shrink-0 region', () => {
    expect(content).toContain('flex-shrink-0 flex justify-end gap-3')
  })
})
