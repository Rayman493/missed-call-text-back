import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/CustomerAttachmentsCard.tsx', 'utf8')

describe('CustomerAttachmentsCard image lightbox full-viewport coverage', () => {
  it('renders the expanded image viewer via a portal to document.body', () => {
    expect(content).toContain("import { createPortal } from 'react-dom'")
    expect(content).toMatch(/expandedImage && typeof document !== 'undefined' && createPortal\(/)
    expect(content).toContain('document.body')
  })

  it('uses a fixed inset-0 root that covers the entire viewport', () => {
    expect(content).toContain('fixed inset-0 z-[70] bg-black/90')
    // The backdrop/root itself should not carry content padding (p-4 belongs
    // to the image/content layer).
    const rootLine = content.match(/className="fixed[^"]*inset-0[^"]*bg-black\/90[^"]*"/)?.[0] || ''
    expect(rootLine).toBeTruthy()
    expect(rootLine).not.toContain('p-4')
    expect(rootLine).not.toContain('pt-')
    expect(rootLine).not.toContain('top-')
  })

  it('does not apply safe-area padding to the backdrop/root itself', () => {
    const backdropMatch = content.match(/fixed\s+inset-0\s+z-\[70\]\s+bg-black\/90[\s\S]*?onClick=\{\(\) => setExpandedImage\(null\)\}/)?.[0] || ''
    expect(backdropMatch).toBeTruthy()
    expect(backdropMatch).not.toContain('safe-area-inset')
  })

  it('applies safe-area-aware positioning only to the close button', () => {
    const closeButton = content.match(/className="absolute z-10[\s\S]*?aria-label="Close"[\s\S]*?\>\s*<X/)?.[0] || ''
    expect(closeButton).toContain('safe-area-inset-top')
    expect(closeButton).toContain('safe-area-inset-right')
  })

  it('keeps the image in a content layer rather than covering the root with padding', () => {
    const imageMatch = content.match(/alt="Expanded attachment"[\s\S]*?\/>/)?.[0] || ''
    expect(imageMatch).toContain('object-contain')
    expect(imageMatch).toContain('p-4')
  })
})
