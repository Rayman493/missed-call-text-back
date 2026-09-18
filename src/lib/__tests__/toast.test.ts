import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/lib/toast.ts', 'utf8')

describe('showToast canonical ReplyFlow treatment', () => {
  it('uses the shared popover surface styling', () => {
    expect(content).toContain('bg-popover')
    expect(content).toContain('text-popover-foreground')
    expect(content).toContain('border border-border')
    expect(content).toContain('rounded-lg')
    expect(content).toContain('shadow-lg')
  })

  it('is safe-area aware and auto-dismisses', () => {
    expect(content).toContain('env(safe-area-inset-bottom)')
    expect(content).toContain('2000')
    expect(content).toContain('toast.remove()')
  })

  it('announces accessibly without a browser alert', () => {
    expect(content).toContain("role', 'status'")
    expect(content).toContain("aria-live', 'polite'")
    expect(content).not.toContain('alert(')
  })

  it('has no raw developer/debug appearance', () => {
    expect(content).not.toContain('console.log')
    expect(content).not.toContain('bg-slate-900 dark:bg-slate-100')
  })
})
