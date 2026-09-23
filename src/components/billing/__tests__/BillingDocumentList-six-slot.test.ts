import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const src = readFileSync('src/components/billing/BillingDocumentList.tsx', 'utf8')

describe('BillingDocumentList six-slot action row', () => {
  it('uses a six-column grid for action slots', () => {
    expect(src).toContain('grid-cols-6')
  })

  it('action bar spans the bottom of the card, not a right-side cluster', () => {
    // Card is now a vertical stack: info+status row on top, full-width
    // action grid on the bottom — matching Payment card placement.
    expect(src).toContain('flex flex-col gap-2 p-3 rounded-xl')
    expect(src).toContain('grid grid-cols-6 gap-1 w-full')
    expect(src).not.toContain('w-48')
    expect(src).not.toContain('max-w-[240px]')
    expect(src).not.toContain('items-end')
  })

  it('renders slots by mapping a six-entry array', () => {
    const matches = src.match(/key: 'edit'/g)
    expect(matches).toBeTruthy()
    expect(src).toContain("key: 'send'")
    expect(src).toContain("key: 'convert'")
    expect(src).toContain("key: 'download'")
    expect(src).toContain("key: 'view'")
    expect(src).toContain("key: 'delete'")
  })

  it('slot order is Edit, Send/Resend, Convert/View Invoice, Download, View, Delete', () => {
    const order = ["key: 'edit'", "key: 'send'", "key: 'convert'", "key: 'download'", "key: 'view'", "key: 'delete'"]
    let last = -1
    order.forEach((key) => {
      const idx = src.indexOf(key)
      expect(idx).toBeGreaterThan(last)
      last = idx
    })
  })

  it('all six slots render as real buttons', () => {
    expect(src).toContain('aria-label={slot.title}')
    expect(src).toContain('title={slot.title}')
    expect(src).toContain('onClick={slot.onClick}')
    expect(src).toContain('disabled={isLoading}')
  })

  it('disabled-by-eligibility slots render as non-action buttons with explanation', () => {
    expect(src).toContain('disabledByEligibility')
    expect(src).toContain('showToast')
    expect(src).toContain('aria-label={`${slot.title} unavailable`}')
    expect(src).toContain('cursor-default')
    expect(src).toContain('h-12')
  })

  it('slots use payment-style labeled fixed action buttons', () => {
    // Same visual pattern as PaymentActionBar: icon + short label, 48px target.
    expect(src).toContain('flex flex-col items-center justify-center gap-0.5 h-12')
    expect(src).toContain('text-[9px] leading-none')
    expect(src).toContain("label: 'Edit'")
    expect(src).toContain("label: isSent ? 'Resend' : 'Send'")
    expect(src).toContain("label: doc.derived_invoice ? 'View Inv.' : 'New Inv.'")
    expect(src).toContain("label: 'Download'")
    expect(src).toContain("label: 'View'")
    expect(src).toContain("label: 'Delete'")
  })

  it('disabled placeholders use muted grey styling', () => {
    expect(src).toContain('text-slate-300')
    expect(src).toContain('dark:text-slate-700')
  })

  it('disabled-by-eligibility slots do not fire the real action', () => {
    expect(src).not.toMatch(/disabledByEligibility[\s\S]{0,300}onClick=\{slot\.onClick\}/)
    expect(src).toContain('slot.disabledReason && showToast')
  })

  it('uses the same icon size in all buttons', () => {
    expect(src).toMatch(/<Icon className="w-4 h-4" \/>/)
  })

  it('preserves stable gridColumn positions for each slot', () => {
    expect(src).toMatch(/gridColumn: slot\.col/)
  })

  it('keeps download and view slots enabled for every document state', () => {
    const downloadSlot = src.match(/key: 'download'[\s\S]*?enabled: (true|false)/)?.[0] || ''
    const viewSlot = src.match(/key: 'view'[\s\S]*?enabled: (true|false)/)?.[0] || ''
    expect(downloadSlot).toContain('enabled: true')
    expect(viewSlot).toContain('enabled: true')
  })

  it('keeps delete slot enabled only for drafts', () => {
    const deleteSlot = src.match(/key: 'delete'[\s\S]*?enabled: [^,\n]+/)?.[0] || ''
    expect(deleteSlot).toContain('enabled: isDraft')
  })

  it('send/resend slot is enabled only for draft or sent documents', () => {
    const sendSlot = src.match(/key: 'send'[\s\S]*?enabled: [^,\n]+/)?.[0] || ''
    expect(sendSlot).toMatch(/isDraft \|\| \(isSent && !isAccepted\)/)
  })

  it('convert/view-invoice slot is enabled only for accepted quotes', () => {
    const convertSlot = src.match(/key: 'convert'[\s\S]*?enabled: [^,\n]+/)?.[0] || ''
    expect(convertSlot).toContain('enabled: isAccepted')
  })
})
