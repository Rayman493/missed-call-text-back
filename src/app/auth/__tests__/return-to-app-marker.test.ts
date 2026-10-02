/**
 * iOS return_to_app marker regression tests
 *
 * Defect: two checkout-session call sites in auth/page.tsx passed
 * `return_to_app: checkNativeIOS` (a function reference) instead of
 * `checkNativeIOS()`. JSON.stringify silently drops function values, so the
 * native return marker never reached the server on the fallback recovery path.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(process.cwd(), 'src/app/auth/page.tsx'), 'utf-8')

describe('auth/page.tsx return_to_app marker', () => {
  it('invokes checkNativeIOS() at every checkout call site (no bare function reference)', () => {
    const bare = src.match(/return_to_app:\s*checkNativeIOS(?!\s*\()/g)
    expect(bare).toBeNull()
  })

  it('sends the invoked boolean at all three signup/retry checkout call sites', () => {
    const invoked = src.match(/return_to_app:\s*checkNativeIOS\(\)/g)
    expect(invoked).toHaveLength(3)
  })

  it('documents why: JSON.stringify drops function references, keeps booleans', () => {
    expect(JSON.parse(JSON.stringify({ return_to_app: () => true })))
      .not.toHaveProperty('return_to_app')
    expect(JSON.parse(JSON.stringify({ return_to_app: true })).return_to_app).toBe(true)
  })
})
