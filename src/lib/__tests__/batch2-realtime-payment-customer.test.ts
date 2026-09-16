import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'

function readSrc(...segments: string[]) {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', ...segments), 'utf-8')
}

const paymentsPage = readSrc('app', 'dashboard', 'payments', 'page.tsx')
const leadsPage = readSrc('app', 'dashboard', 'leads', 'page.tsx')
const useRealtimeLeads = readSrc('hooks', 'useRealtimeLeads.ts')
const paymentStatus = readSrc('lib', 'payment-status.ts')

describe('Batch 2 — realtime payment + customer state reconciliation', () => {
  describe('A. Payment / invoice realtime', () => {
    it('payment_requests realtime invalidation triggers canonical payment list refetch', () => {
      expect(paymentsPage).toMatch(/payment-requests-realtime[\s\S]{0,1200}?fetchPayments\(\)/)
    })

    it('payment_requests realtime also refreshes billing documents for joined state', () => {
      expect(paymentsPage).toMatch(/payment-requests-realtime[\s\S]{0,1200}?fetchBillingDocuments\(\)/)
    })

    it('paid is only rendered from canonical status, never invented optimistically', () => {
      // normalizePaymentStatus returns 'paid' only when the raw DB value is 'paid'
      expect(paymentStatus).toMatch(/if \(status === 'paid'\) return 'paid'/)
      expect(paymentStatus).not.toMatch(/status\s*=\s*['"]paid['"]/)
    })

    it('payment and billing document ids are the stable persisted identities', () => {
      // Payment list is built from canonical /api/payments and billing document ids
      expect(paymentsPage).toMatch(/payment\.id/)
      expect(paymentsPage).toMatch(/doc\.id/)
      expect(paymentsPage).toMatch(/paymentRequests/)
    })
  })

  describe('B. Customer overview realtime', () => {
    beforeAll(() => {
      // ensure source read succeeded
      expect(leadsPage).toContain('applySingleLead')
    })

    it('new lead INSERT fetches the canonical single lead record', () => {
      expect(leadsPage).toMatch(/\(newLead\) => applySingleLead\(newLead\)/)
    })

    it('lead UPDATE fetches the canonical single lead record', () => {
      expect(leadsPage).toMatch(/\(updatedLead\) => applySingleLead\(updatedLead\)/)
    })

    it('canonical lead fetch uses the full card select and business-scoped id filter', () => {
      expect(leadsPage).toMatch(/\.select\(SINGLE_LEAD_SELECT\)[\s\S]{0,120}?\.eq\('id', leadId\)/)
      expect(leadsPage).toMatch(/\.eq\('business_id', business\.id\)[\s\S]{0,60}?\.maybeSingle\(\)/)
    })

    it('incoming lead is merged by persisted id, never duplicated', () => {
      expect(leadsPage).toMatch(/const existingIndex = prev\.findIndex\(l => l\.id === fullLead\.id\)/)
      expect(leadsPage).toMatch(/if \(existingIndex >= 0\)[\s\S]{0,80}?updated\[existingIndex\] = fullLead/)
      expect(leadsPage).toMatch(/else \{[\s\S]{0,40}?updated\.unshift\(fullLead\)/)
    })

    it('realtime single lead fetch bumps generation to prevent stale full-list overwrites', () => {
      expect(leadsPage).toMatch(/const applySingleLead[\s\S]{0,400}?fetchGenerationRef\.current\+\+/)
    })

    it('single lead select includes messages and ai_call_records for derived card fields', () => {
      expect(leadsPage).toMatch(/const SINGLE_LEAD_SELECT = `[\s\S]*?messages \(/)
      expect(leadsPage).toMatch(/const SINGLE_LEAD_SELECT = `[\s\S]*?ai_call_records \(/)
    })

    it('KPI counts are derived from the reconciled leads list', () => {
      expect(leadsPage).toMatch(/const leadStatusCounts = calculateLeadStatusCounts\(leads\)/)
    })
  })

  describe('C. Shared realtime architecture', () => {
    it('useRealtimeLeads subscribes to payment_requests for customer card updates', () => {
      expect(useRealtimeLeads).toMatch(/.channel\(`payment-requests-\$\{businessId\}`\)/)
      expect(useRealtimeLeads).toMatch(/table: 'payment_requests'/)
    })

    it('useRealtimeLeads subscribes to jobs for schedule status updates', () => {
      expect(useRealtimeLeads).toMatch(/.channel\(`jobs-\$\{businessId\}`\)/)
      expect(useRealtimeLeads).toMatch(/table: 'jobs'/)
    })

    it('payment_request and job events are mapped to the associated lead id', () => {
      expect(useRealtimeLeads).toMatch(/const leadId = payload\.new\?\.lead_id/)
      expect(useRealtimeLeads).toMatch(/callbacksRef\.current\.onLeadUpdate\(\{ id: leadId \}\)/)
    })

    it('all realtime channels are business-scoped', () => {
      const businessFilters = useRealtimeLeads.match(/filter: `business_id=eq\.\$\{businessId\}`/g)
      expect(businessFilters).not.toBeNull()
      expect(businessFilters!.length).toBeGreaterThanOrEqual(4)
    })

    it('all channels are removed on unmount or business switch', () => {
      expect(useRealtimeLeads).toMatch(/return \(\) => \{[\s\S]{0,120}?channelsRef\.current\.forEach\(channel => \{[\s\S]{0,80}?supabase\.removeChannel\(channel\)/)
      expect(useRealtimeLeads).toMatch(/channelsRef\.current = \[\]/)
    })

    it('payment_requests and jobs channels participate in cleanup array', () => {
      expect(useRealtimeLeads).toMatch(/channelsRef\.current = \[leadsChannel, messagesChannel, aiCallRecordsChannel, paymentRequestsChannel, jobsChannel\]/)
    })

    it('cross-business mutation is prevented by business_id filter and cleanup', () => {
      // Both pages and the hook rely on the business_id equality filter
      expect(paymentsPage).toMatch(/business_id=eq\.\$\{business\.id\}/)
      expect(useRealtimeLeads).toMatch(/business_id=eq\.\$\{businessId\}/)
      expect(leadsPage).toMatch(/\.eq\('business_id', business\.id\)/)
    })
  })
})
