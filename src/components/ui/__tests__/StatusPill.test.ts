import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/ui/StatusPill.tsx', 'utf8')

describe('Shared StatusPill visual contract', () => {
  it('enforces a fixed pill height', () => {
    expect(content).toContain('h-6')
  })

  it('uses consistent horizontal padding and radius', () => {
    expect(content).toContain('px-2.5')
    expect(content).toContain('rounded-full')
  })

  it('uses a consistent text size and weight', () => {
    expect(content).toContain('text-[11px]')
    expect(content).toContain('font-medium')
  })

  it('keeps semantic color variants distinct', () => {
    expect(content).toContain("green:")
    expect(content).toContain("amber:")
    expect(content).toContain("red:")
    expect(content).toContain("gray:")
  })

  it('does not flatten all statuses to the same color', () => {
    expect(content).toContain('bg-green-500/10')
    expect(content).toContain('bg-amber-500/10')
    expect(content).toContain('bg-red-500/10')
  })
})
