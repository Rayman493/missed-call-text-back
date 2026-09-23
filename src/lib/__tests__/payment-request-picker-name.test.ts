import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const pickerSrc = readFileSync(
  join(process.cwd(), 'src/components/jobs/LeadPickerModal.tsx'),
  'utf8'
)
const paymentsSrc = readFileSync(
  join(process.cwd(), 'src/app/dashboard/payments/page.tsx'),
  'utf8'
)
const leadsApiSrc = readFileSync(
  join(process.cwd(), 'src/app/api/leads/route.ts'),
  'utf8'
)

describe('Payment Request customer picker name precedence', () => {
  it('uses the canonical API name (getLeadDisplayName) from /api/leads', () => {
    expect(leadsApiSrc).toContain('name: getLeadDisplayName(leadWithRecords)')
  })

  it('picker prefers canonical saved name over historical intake name', () => {
    expect(pickerSrc).toContain('getPickerCustomerName')
    expect(pickerSrc).toContain('lead.name')
    // Canonical name check happens before intake fallback
    const helperIdx = pickerSrc.indexOf('function getPickerCustomerName')
    const apiNameIdx = pickerSrc.indexOf('const apiName = lead.name', helperIdx)
    const intakeIdx = pickerSrc.indexOf('return intakeName || null', helperIdx)
    expect(apiNameIdx).toBeGreaterThan(-1)
    expect(apiNameIdx).toBeLessThan(intakeIdx)
  })

  it('rejects phone-shaped and Unknown Caller values as canonical names', () => {
    expect(pickerSrc).toContain("'Unknown Caller'")
    expect(pickerSrc).toMatch(/\[\^?\\d|\[\\d\+\(\)/)
  })

  it('row primary uses canonical precedence', () => {
    expect(pickerSrc).toContain(
      "const name = getPickerCustomerName(lead, intake.customerName) || lead.name || 'Unknown Caller'"
    )
  })

  it('selection prefill uses canonical precedence', () => {
    expect(pickerSrc).toContain('const name = getPickerCustomerName(lead, intake.customerName)')
  })

  it('search filters by the canonical precedence name', () => {
    expect(pickerSrc).toContain(
      "(getPickerCustomerName(lead, intake.customerName) || '').toLowerCase()"
    )
  })

  it('new-customer prefill prefers saved contact_name over intake name', () => {
    expect(paymentsSrc).toContain(
      'customer_name: lead.contact_name || lead.name || intake.customerName || undefined'
    )
  })

  it('still passes the persisted lead id, not inferred identity', () => {
    expect(pickerSrc).toContain('lead_id: lead.id')
    expect(paymentsSrc).toContain('lead_id: lead.id')
  })
})
