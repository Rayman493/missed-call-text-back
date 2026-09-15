import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Batch 2B — visual viewport height variable', () => {
  const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

  it('1. initializes --visual-viewport-height on mount', () => {
    expect(pageClientSrc).toContain("--visual-viewport-height")
    expect(pageClientSrc).toContain('setProperty(\'--visual-viewport-height\'')
    expect(pageClientSrc).toContain('updateVisibleHeight(previousHeight)')
  })

  it('2. removes --visual-viewport-height on cleanup', () => {
    expect(pageClientSrc).toContain('removeProperty(\'--visual-viewport-height\')')
  })

  it('3. subscribes to visualViewport resize with fallback', () => {
    expect(pageClientSrc).toContain("window.visualViewport.addEventListener('resize', handleResize)")
    expect(pageClientSrc).toContain('window.visualViewport?.removeEventListener(\'resize\', handleResize)')
    expect(pageClientSrc).toContain('window.addEventListener(\'resize\', handleResize)')
    expect(pageClientSrc).toContain('window.removeEventListener(\'resize\', handleResize)')
  })

  it('4. conversation workspace uses the CSS variable with a 100dvh fallback', () => {
    expect(pageClientSrc).toContain('var(--visual-viewport-height,100dvh)')
  })

  it('5. only re-anchors to true bottom when followLatest is active', () => {
    expect(pageClientSrc).toContain('if (followLatestRef.current)')
    expect(pageClientSrc).toContain('scrollToTrueBottom(container)')
  })
})
