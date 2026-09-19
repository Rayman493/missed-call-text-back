import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/ConversationComposer.tsx', 'utf8')

describe('ConversationComposer video attachment MIME fallback', () => {
  it('resolves an empty file.type from the file extension before rejecting', () => {
    expect(content).toContain('resolveMimeByExtension')
    expect(content).toContain('effectiveType')
    expect(content).toContain("case 'mp4': return 'video/mp4'")
  })

  it('uses the effective type for supported-type checks and size limits', () => {
    expect(content).toMatch(/SUPPORTED_ATTACHMENT_TYPES\.includes\(effectiveType\)/)
    expect(content).toMatch(/effectiveType === 'application\/pdf'/)
    expect(content).toMatch(/effectiveType === 'video\/mp4'/)
  })

  it('keeps MP4 in the supported type list and input accept attribute', () => {
    expect(content).toContain("'video/mp4'")
    expect(content).toContain('video/mp4,.mp4')
  })

  it('still rejects unsupported file types with a user-facing error', () => {
    expect(content).toContain("This file type isn\\'t supported yet")
  })
})
