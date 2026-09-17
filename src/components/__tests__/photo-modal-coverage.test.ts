import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const source = readFileSync('src/components/PhotoModal.tsx', 'utf8')

describe('PhotoModal full-viewport coverage', () => {
  it('renders a fixed inset-0 root that covers the viewport', () => {
    expect(source).toMatch(/fixed inset-0 z-\[60\]/)
  })

  it('places the opaque backdrop as a sibling of the content, not a child of it', () => {
    // The backdrop must cover the fixed root, not only the image container.
    // In the corrected markup the backdrop is a direct child of the fixed root,
    // and the relative image wrapper is a separate sibling.
    expect(source).toMatch(/<div\s+className="absolute inset-0 bg-black\/90[^"]*"\s*\/>/)
    expect(source).toMatch(/<div\s+className="relative max-w-5xl max-h-\[90vh\]/)
  })
})
