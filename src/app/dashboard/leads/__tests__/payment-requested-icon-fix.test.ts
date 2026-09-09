import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const leadsPageContent = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')
const statCardContent = readFileSync('src/components/StatCard.tsx', 'utf8')
const customerStatusContent = readFileSync('src/lib/customer-status.ts', 'utf8')

describe('Payment Requested Status Icon Fix', () => {
  it('Payment Requested card uses a Lucide CreditCard icon component (iconNode)', () => {
    // Find the Payment Requested StatCard block
    const paymentBlock = leadsPageContent.substring(
      leadsPageContent.indexOf('label="Payment Requested"'),
      leadsPageContent.indexOf('ariaLabel="Filter customers with payment requested"')
    )
    expect(paymentBlock).toContain('iconNode')
    expect(paymentBlock).toContain('CreditCard')
    expect(paymentBlock).toContain('w-4 h-4')
  })

  it('no broken Unicode replacement character remains for Payment Requested', () => {
    // The broken glyph was U+FFFD (replacement character)
    const paymentBlock = leadsPageContent.substring(
      leadsPageContent.indexOf('label="Payment Requested"'),
      leadsPageContent.indexOf('ariaLabel="Filter customers with payment requested"')
    )
    expect(paymentBlock).not.toContain('\uFFFD')
    // Also check no empty icon="" that would render nothing
    expect(paymentBlock).not.toMatch(/icon="[^"]+"\s*\n/)
  })

  it('CreditCard is imported from lucide-react', () => {
    expect(leadsPageContent).toContain('CreditCard')
    expect(leadsPageContent).toMatch(/from 'lucide-react'/)
  })

  it('amber semantic color preserved on Payment Requested card', () => {
    const paymentBlock = leadsPageContent.substring(
      leadsPageContent.indexOf('label="Payment Requested"'),
      leadsPageContent.indexOf('ariaLabel="Filter customers with payment requested"')
    )
    expect(paymentBlock).toContain('iconColor="amber"')
  })

  it('icon size matches other cards (w-4 h-4 ≈ text-base emoji size)', () => {
    // The StatCard renders emoji at text-base (16px). w-4 h-4 = 16px.
    const paymentBlock = leadsPageContent.substring(
      leadsPageContent.indexOf('label="Payment Requested"'),
      leadsPageContent.indexOf('ariaLabel="Filter customers with payment requested"')
    )
    expect(paymentBlock).toContain('w-4 h-4')
  })

  it('StatCard supports iconNode prop for React component icons', () => {
    expect(statCardContent).toContain('iconNode')
    expect(statCardContent).toContain('iconNode?: React.ReactNode')
    // iconNode takes precedence over icon string
    expect(statCardContent).toContain('{iconNode || icon}')
  })

  it('StatCard icon container size unchanged (w-7 h-7)', () => {
    expect(statCardContent).toContain('w-7 h-7')
  })

  it('other status cards still use emoji icons (unchanged)', () => {
    // Needs Reply
    const needsReplyBlock = leadsPageContent.substring(
      leadsPageContent.indexOf('label="Needs Reply"'),
      leadsPageContent.indexOf('ariaLabel="Filter customers needing a reply"')
    )
    expect(needsReplyBlock).toContain('icon="👥"')
    expect(needsReplyBlock).not.toContain('iconNode')

    // Active
    const activeBlock = leadsPageContent.substring(
      leadsPageContent.indexOf('label="Active"'),
      leadsPageContent.indexOf('ariaLabel="Filter active customers"')
    )
    expect(activeBlock).toContain('icon="💬"')
    expect(activeBlock).not.toContain('iconNode')

    // Scheduled
    const scheduledBlock = leadsPageContent.substring(
      leadsPageContent.indexOf('label="Scheduled"'),
      leadsPageContent.indexOf('ariaLabel="Filter scheduled customers"')
    )
    expect(scheduledBlock).toContain('icon="📅"')
    expect(scheduledBlock).not.toContain('iconNode')
  })

  it('canonical customer-status.ts uses CreditCard for payment_requested', () => {
    // The canonical source already uses CreditCard for payment_requested
    expect(customerStatusContent).toContain('CreditCard')
    expect(customerStatusContent).toContain('payment_requested')
  })

  it('card ordering unchanged (Needs Reply, Active, Scheduled, Payment Requested)', () => {
    const needsReplyIdx = leadsPageContent.indexOf('label="Needs Reply"')
    const activeIdx = leadsPageContent.indexOf('label="Active"')
    const scheduledIdx = leadsPageContent.indexOf('label="Scheduled"')
    const paymentIdx = leadsPageContent.indexOf('label="Payment Requested"')
    expect(needsReplyIdx).toBeLessThan(activeIdx)
    expect(activeIdx).toBeLessThan(scheduledIdx)
    expect(scheduledIdx).toBeLessThan(paymentIdx)
  })
})
