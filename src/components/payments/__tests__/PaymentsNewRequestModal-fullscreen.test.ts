import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const modal = readFileSync('src/components/ui/Modal.tsx', 'utf8')
const newRequest = readFileSync('src/components/payments/PaymentsNewRequestModal.tsx', 'utf8')

describe('New Payment Request modal full-screen overlay', () => {
  it('Modal supports a fullScreen prop', () => {
    expect(modal).toContain('fullScreen?: boolean')
    expect(modal).toContain('fullScreen = false')
  })

  it('renders the full-screen payment request modal as a true viewport overlay', () => {
    expect(newRequest).toMatch(/<Modal[\s\S]*?title="New Payment Request"/)
    expect(newRequest).toMatch(/<Modal[\s\S]*?fullScreen/)
  })

  it('fullScreen mode renders a viewport-wide backdrop while keeping the polished card shape', () => {
    expect(modal).toContain('fixed inset-0 z-[60]')
    expect(modal).toContain('items-center')
    expect(modal).toContain('justify-center')
    expect(modal).toContain('max-w-lg')
    expect(modal).toContain('rounded-2xl')
    expect(modal).not.toContain('h-full max-w-none rounded-none')
  })
})
