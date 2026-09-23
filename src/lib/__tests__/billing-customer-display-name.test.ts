import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { billingCustomerDisplayName } from '@/lib/billing/billing-utils'

const BILLING_LEAD_EMBED = 'leads ( id, contact_name, caller_phone, raw_metadata, ai_call_records ( id, created_at, extracted_info ) )'

describe('billing customer display names', () => {
  it('uses the saved canonical contact name', () => {
    expect(billingCustomerDisplayName({ contact_name: 'Current Customer' })).toBe('Current Customer')
  })

  it('uses the persisted intake name when contact_name is empty', () => {
    expect(billingCustomerDisplayName({
      contact_name: null,
      raw_metadata: { extracted_info: { customerName: 'Invoice Customer' } },
    })).toBe('Invoice Customer')
  })

  it('uses the same AI-call name source as the customer picker', () => {
    expect(billingCustomerDisplayName({
      contact_name: null,
      caller_phone: '+15551234567',
      raw_metadata: {},
      ai_call_records: [{
        id: 'ai-1',
        created_at: '2026-01-01T12:00:00.000Z',
        extracted_info: { callerName: 'Quote Customer' },
      }],
    })).toBe('Quote Customer')
  })

  it('supports corrected and historical caller-name fields used by existing leads', () => {
    expect(billingCustomerDisplayName({
      raw_metadata: { corrected_fields: { customerName: 'Corrected Customer' } },
    })).toBe('Corrected Customer')
    expect(billingCustomerDisplayName({
      raw_metadata: { extracted_info: { caller_name: 'Legacy Customer' } },
    })).toBe('Legacy Customer')
    expect(billingCustomerDisplayName({
      raw_metadata: { customerName: 'Historical Customer' },
    })).toBe('Historical Customer')
  })

  it('preserves the unnamed fallback for missing, placeholder and phone-only customers', () => {
    expect(billingCustomerDisplayName(null)).toBeNull()
    expect(billingCustomerDisplayName({
      contact_name: 'Unknown',
      raw_metadata: { extracted_info: { customerName: 'Not collected' } },
    })).toBeNull()
    expect(billingCustomerDisplayName({ caller_phone: '+15551234567' })).toBeNull()
  })

  it('loads the same persisted identity for list, reopen, viewer, snapshot, quote and invoice flows', () => {
    const listRoute = readFileSync('src/app/api/billing-documents/route.ts', 'utf8')
    const detailRoute = readFileSync('src/app/api/billing-documents/[id]/route.ts', 'utf8')
    const sendRoute = readFileSync('src/app/api/billing-documents/[id]/send/route.ts', 'utf8')
    const convertRoute = readFileSync('src/app/api/billing-documents/[id]/convert/route.ts', 'utf8')
    const documentList = readFileSync('src/components/billing/BillingDocumentList.tsx', 'utf8')
    const viewer = readFileSync('src/components/billing/BillingViewerModal.tsx', 'utf8')
    const paymentsPage = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8')
    const builder = readFileSync('src/lib/billing/document-builder.ts', 'utf8')

    for (const source of [listRoute, detailRoute, sendRoute, convertRoute]) {
      expect(source).toContain(BILLING_LEAD_EMBED)
    }
    expect(documentList).toContain('billingCustomerDisplayName(doc.leads)')
    expect(viewer).toContain('billingCustomerDisplayName(d.leads)')
    expect(paymentsPage).toContain('customer_name: billingCustomerDisplayName(d.leads)')
    expect(builder).toContain(".select('contact_name, caller_phone, raw_metadata, ai_call_records ( id, created_at, extracted_info )')")
    expect(builder).toContain(".eq('business_id', doc.business_id)")
  })
})
