import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/SetupStatusCard.tsx', 'utf8')

describe('ReplyFlow Ready chevron positioning', () => {
  it('uses a compact top-right header control with a comfortable tap target', () => {
    expect(content).toContain('w-10 h-10')
    expect(content).toContain('inline-flex items-center justify-center')
  })

  it('applies a subtle premium border and background', () => {
    expect(content).toContain('border border-border/60')
    expect(content).toContain('bg-muted/40')
  })

  it('centers the chevron icon', () => {
    expect(content).toContain('<ChevronDown className="w-5 h-5"')
    expect(content).toContain('<ChevronUp className="w-5 h-5"')
  })
})
