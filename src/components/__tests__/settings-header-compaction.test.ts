import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Settings mobile header compaction', () => {
  const content = readFileSync('src/components/SettingsContent.tsx', 'utf8')

  it('uses compact top padding on mobile and larger on desktop', () => {
    expect(content).toContain('pt-4 sm:pt-8')
  })

  it('uses compact bottom padding on mobile and larger on desktop', () => {
    expect(content).toContain('pb-4 sm:pb-6')
  })

  it('uses smaller heading on mobile and larger on desktop', () => {
    expect(content).toContain('text-2xl sm:text-3xl')
  })

  it('uses smaller description text on mobile and larger on desktop', () => {
    expect(content).toContain('text-sm sm:text-base')
  })

  it('uses compact back button margin on mobile and larger on desktop', () => {
    expect(content).toContain('mb-2 sm:mb-4')
  })

  it('uses compact tab padding on mobile and larger on desktop', () => {
    expect(content).toContain('py-3 sm:py-5')
  })
})
