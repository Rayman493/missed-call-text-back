import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Customer context prefill normalization', () => {
  const content = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

  it('imports normalizeEditableContext and firstNonPlaceholder', () => {
    expect(content).toContain('normalizeEditableContext')
    expect(content).toContain('firstNonPlaceholder')
    expect(content).toContain('@/components/payments/customer-search-helpers')
  })

  it('normalizes leadName before using it in prefill title and customer_name', () => {
    expect(content).toContain('const leadName = firstNonPlaceholder(intake.customerName, leadData?.name, leadData?.contact_name)')
  })

  it('normalizes leadAddress before using it as service_address', () => {
    expect(content).toContain('const leadAddress = normalizeEditableContext(intake.serviceAddress)')
  })

  it('normalizes additionalDetails before adding to notes sections', () => {
    expect(content).toContain('const additionalDetails = normalizeEditableContext(intake.additionalDetails)')
    expect(content).toContain('if (additionalDetails) {')
  })

  it('normalizes serviceRequestedFallback before using as title fallback', () => {
    expect(content).toContain('const serviceRequestedFallback = normalizeEditableContext(intake.serviceRequested)')
  })

  it('uses canonical getLeadDisplayName for preselectedLeadCustomer name', () => {
    expect(content).toContain('name: getLeadDisplayName(leadData)')
  })

  it('uses canonical getLeadDisplayName for payment modal recipient description', () => {
    expect(content).toContain('Send a payment request to {getLeadDisplayName(leadData || lead)')
  })
})
