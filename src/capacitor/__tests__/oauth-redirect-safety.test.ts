import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const initTs = fs.readFileSync(path.join(process.cwd(), 'src/capacitor/init.ts'), 'utf8')

describe('Native OAuth callback redirect safety', () => {
  it('validates the next parameter before navigating', () => {
    expect(initTs).toContain('isValidOAuthNextPath(next)')
    expect(initTs).toContain('window.location.href = next')
  })

  it('rejects unsafe next destinations and falls back to dashboard', () => {
    expect(initTs).toContain('Rejecting unsafe next parameter')
    expect(initTs).toContain("next = '/dashboard'")
  })

  it('defines a safe-path allow-list for OAuth redirects', () => {
    expect(initTs).toContain('SAFE_OAUTH_REDIRECT_PATHS')
    expect(initTs).toContain("'/dashboard'")
    expect(initTs).toContain("'/billing/success'")
  })
})
