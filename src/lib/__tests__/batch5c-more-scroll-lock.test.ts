import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) =>
  readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const scrollLockSrc = readSrc('src/hooks/useBodyScrollLock.ts')
const bottomNavSrc = readSrc('src/components/BottomNavigation.tsx')

describe('Batch 5C — More menu scroll lock preserves bottom nav geometry', () => {
  it('MoreMenu caller is the only componentName that bypasses body fixed positioning', () => {
    expect(bottomNavSrc).toContain("useBodyScrollLock(isMoreMenuOpen, 'MoreMenu')")
  })

  it('useBodyScrollLock still sets data-modal-open for MoreMenu', () => {
    expect(scrollLockSrc).toContain("document.body.setAttribute('data-modal-open', 'true')")
  })

  it('MoreMenu guard prevents body.position fixed and body.top offset', () => {
    // The MoreMenu path must check componentName and skip the fixed-body offset.
    expect(scrollLockSrc).toMatch(/const isMoreMenu = componentName === 'MoreMenu'/)
    expect(scrollLockSrc).toMatch(/if \(!isMoreMenu\) \{[\s\S]*?document\.body\.style\.position = 'fixed'[\s\S]*?\}/)
    expect(scrollLockSrc).toMatch(/if \(!isMoreMenu\) \{[\s\S]*?document\.body\.style\.top = `-\$\{globalScrollPosition\}px`[\s\S]*?\}/)
  })

  it('reconcile path also avoids fixed-body offset when only MoreMenu owns the lock', () => {
    expect(scrollLockSrc).toMatch(/const onlyMore = Array\.from\(activeOwners\.values\(\)\)\.every\(o => o\.component === 'MoreMenu'\)/)
    expect(scrollLockSrc).toMatch(/if \(!onlyMore\) \{[\s\S]*?document\.body\.style\.position = 'fixed'/)
  })
})
