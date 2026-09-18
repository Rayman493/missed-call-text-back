import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const globals = readFileSync('src/app/globals.css', 'utf8')

describe('Light-mode shared contrast tokens', () => {
  it('uses a slightly darker shared border token in light mode', () => {
    expect(globals).toContain('--border: 214.3 31.8% 87%')
    expect(globals).not.toContain('--border: 214.3 31.8% 91%')
  })

  it('uses a slightly stronger shared input/select border token in light mode', () => {
    expect(globals).toContain('--input: 214.3 31.8% 84%')
    expect(globals).not.toContain('--input: 214.3 31.8% 91%')
  })

  it('keeps the dark-mode border token unchanged', () => {
    const rootBlock = globals.match(/:root\s*\{[\s\S]*?--border:\s*([^;]+);/)?.[1]
    expect(rootBlock).toBeTruthy()
    expect(rootBlock?.trim()).toBe('217.2 32.6% 17.5%')
  })

  it('provides shared card/section border utility classes', () => {
    expect(globals).toContain('.card-border')
    expect(globals).toContain('.section-border')
    expect(globals).toContain('border-border/50')
    expect(globals).toContain('border-border/30')
  })

  it('shared input styles use the stronger border token', () => {
    expect(globals).toContain('.premium-input')
    expect(globals).toContain('border-border/60')
  })
})
