import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('ConfirmModal Android back handling', () => {
  const content = readFileSync('src/components/ui/ConfirmModal.tsx', 'utf8')

  it('imports and uses the canonical modal back button hook', () => {
    expect(content).toContain('useModalBackButton')
    expect(content).toContain('useModalBackButton({ isOpen, onClose })')
  })
})
