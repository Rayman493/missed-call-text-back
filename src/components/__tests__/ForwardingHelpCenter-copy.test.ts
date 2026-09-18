import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/ForwardingHelpCenter.tsx', 'utf8')

describe('ForwardingHelpCenter copy/help simplification', () => {
  it('removes "(Optional)" from the disable forwarding button', () => {
    expect(content).not.toContain('Disable Call Forwarding (Optional)')
    expect(content).toContain('Disable Call Forwarding')
  })

  it('removes the non-interactive ? icon and keeps plain "Need help?" heading', () => {
    expect(content).not.toMatch(/rounded-full[^>]*>\s*\?\s*<\/div>/)
    expect(content).toContain('Need help?')
    expect(content).toContain('Troubleshooting')
  })
})
