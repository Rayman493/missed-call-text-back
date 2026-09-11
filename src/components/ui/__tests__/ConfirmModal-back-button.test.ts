import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('ConfirmModal Android back handling', () => {
  const content = readFileSync('src/components/ui/ConfirmModal.tsx', 'utf8')

  it('uses shared <Modal> which owns the back-button registration', () => {
    // ConfirmModal renders the shared <Modal> component, which internally
    // calls useModalBackButton. ConfirmModal itself must NOT call
    // useModalBackButton directly to avoid duplicate stack registrations.
    expect(content).toContain('<Modal')
    expect(content).not.toMatch(/useModalBackButton\(\{/)
  })

  it('does not have a per-modal Capacitor backButton listener', () => {
    expect(content).not.toContain("App.addListener('backButton')")
  })
})
