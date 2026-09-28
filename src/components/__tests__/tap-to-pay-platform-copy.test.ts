import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Regression: the shared Tap to Pay modal previously told Android users to
 * "Hold the contactless card or device near the iPhone." Any 'iPhone' copy in
 * ReplyFlow-controlled payment UI must be gated on platform === 'ios' so the
 * Android flow never calls the device an iPhone.
 */

const ROOT = join(__dirname, '..', '..', '..')

const SHARED_FILES = [
  'src/components/payments/QuickTapToPayModal.tsx',
  'src/components/payments/TapToPayModal.tsx',
  'src/lib/terminal/error-mapper.ts',
  'src/lib/terminal/service.ts',
]

describe('Tap to Pay platform wording', () => {
  it.each(SHARED_FILES)('%s — every iPhone reference is iOS-gated', (file) => {
    const lines = readFileSync(join(ROOT, file), 'utf8').split('\n')
    const offenders = lines
      .map((text, i) => ({ line: i + 1, text: text.trim(), prev: (lines[i - 1] || '').trim() }))
      .filter(({ text }) => text.includes('iPhone'))
      .filter(({ text, prev }) => {
        // Allowed only when the reference or its governing condition line is
        // gated on the iOS platform check (ternary branches may wrap lines).
        const gated = (s: string) => s.includes("'ios'") || s.includes('"ios"')
        return !gated(text) && !gated(prev)
      })
    expect(offenders, JSON.stringify(offenders)).toEqual([])
  })

  it('QuickTapToPayModal uses device-neutral copy for the waiting-for-card instruction', () => {
    const src = readFileSync(join(ROOT, 'src/components/payments/QuickTapToPayModal.tsx'), 'utf8')
    expect(src).toContain("'this device'")
    expect(src).not.toContain('near the iPhone.')
  })
})
