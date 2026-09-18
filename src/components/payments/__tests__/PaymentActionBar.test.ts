import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/payments/PaymentActionBar.tsx', 'utf8')

describe('PaymentActionBar fixed slot system', () => {
  it('defines a fixed six-slot order', () => {
    expect(content).toContain("{ key: 'customer'")
    expect(content).toContain("{ key: 'edit'")
    expect(content).toContain("{ key: 'copy'")
    expect(content).toContain("{ key: 'open'")
    expect(content).toContain("{ key: 'status'")
    expect(content).toContain("{ key: 'cancel'")
  })

  it('renders unavailable actions with a lightweight explanation', () => {
    expect(content).toContain('reason:')
    expect(content).toContain('showToast')
    expect(content).toContain('Only pending payments can be cancelled.')
  })

  it('keeps the same icon size and touch target across slots', () => {
    expect(content).toContain('h-12')
    expect(content).toContain('w-4 h-4')
  })

  it('uses a chain/link icon and "Copy Link" label for the copy slot', () => {
    expect(content).toContain("icon: Link2")
    expect(content).toContain("title: 'Copy Link'")
    expect(content).toContain("label: 'Copy Link'")
    expect(content).not.toContain("icon: Copy")
  })

  it('does not execute the action when a disabled slot is tapped', () => {
    expect(content).toContain('slot.reason && showToast(slot.reason)')
    expect(content).not.toMatch(/disabledByEligibility[\s\S]{0,200}onClick=\{slot\.onClick\}/)
  })
})
