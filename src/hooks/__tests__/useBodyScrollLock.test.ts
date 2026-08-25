import { describe, it, expect } from 'vitest'
import { useBodyScrollLock } from '../useBodyScrollLock'

/**
 * Regression test for module-scope useRef call
 *
 * This test ensures that useBodyScrollLock can be imported without throwing
 * "Cannot read properties of null (reading 'useRef')" error.
 *
 * Root cause: The hook previously called useRef at module scope (line 5),
 * which violated React's Rules of Hooks. When the module was imported,
 * React's dispatcher was null, causing the production crash.
 *
 * Fix: Moved useRef call inside the hook function (line 7).
 */
describe('useBodyScrollLock - Module Import Safety', () => {
  it('should import without throwing useRef dispatcher error', () => {
    // This test verifies the module can be imported without
    // calling hooks at module scope
    expect(typeof useBodyScrollLock).toBe('function')
  })
})