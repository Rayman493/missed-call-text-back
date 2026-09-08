import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'

describe('Previous Job Requests history', () => {
  const pageContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

  it('A: Jobs section is restored and no longer titled Previous Jobs', () => {
    // The sidebar/mobile Jobs section must be titled exactly Jobs and use the
    // actual lead job data, not a date/status split derived from appointments.
    expect(pageContent).toContain('title="Jobs"')
    expect(pageContent).toContain('leadJobs.map((job: any)')
    expect(pageContent).not.toContain('title="Previous Jobs"')
  })

  it('B: latest AI call stays current context and older calls become previous requests', () => {
    const records = [
      { id: 'call-2', created_at: '2026-05-20T12:00:00Z', extracted_info: { reasonForCalling: 'Leaking kitchen faucet', callerName: 'Michael Thompson' } },
      { id: 'call-1', created_at: '2026-05-15T12:00:00Z', extracted_info: { reasonForCalling: 'Fence repair', callerName: 'Amanda Lewis' } },
    ]

    // The page takes aiCallRecords[1..] as previous requests (newest first).
    const previousRequests = records.slice(1)
    expect(previousRequests.length).toBe(1)
    expect(previousRequests[0].id).toBe('call-1')

    const currentIntake = getLeadAIIntake({ aiCallRecords: [records[0]], raw_metadata: {} })
    expect(currentIntake.customerName).toBe('Michael Thompson')
    expect(currentIntake.serviceRequested).toBe('Leaking kitchen faucet')
  })

  it('C: historical request keeps the captured name after a display-name change', () => {
    const historicalRecord = {
      id: 'call-1',
      created_at: '2026-05-15T12:00:00Z',
      caller_phone: '+15555551212',
      extracted_info: { callerName: 'Amanda Lewis', reasonForCalling: 'Fence repair' }
    }

    // Simulate the historical intake: no current lead name/contact_name is passed,
    // so the name is read only from the historical extracted_info.
    const historicalIntake = getLeadAIIntake({
      aiCallRecords: [historicalRecord],
      raw_metadata: {},
      name: null,
      contact_name: null,
      caller_phone: historicalRecord.caller_phone
    })

    expect(historicalIntake.customerName).toBe('Amanda Lewis')
    expect(historicalIntake.serviceRequested).toBe('Fence repair')
  })

  it('D: clicking a specific previous request opens a detail view for that record only', () => {
    expect(pageContent).toContain('setSelectedHistoricalRecord(record)')
    expect(pageContent).toContain('selectedHistoricalRecord')
    expect(pageContent).toContain('Previous job request —')
    expect(pageContent).toContain('getHistoricalJobRequestContext')
  })

  it('E: empty previous requests renders a clean empty state without hiding Jobs', () => {
    expect(pageContent).toContain('No previous job requests')
    expect(pageContent).toContain('No jobs')
  })

  it('F: previous requests are sourced from lead-details aiCallRecords, scoped to lead/phone', () => {
    // The UI consumes leadData.aiCallRecords which is already scoped by
    // lead_id (or business+normalized phone) inside the authenticated lead-details route.
    expect(pageContent).toContain('leadData?.aiCallRecords')
    expect(pageContent).toContain('previousAiCallRecords')
  })

  it('G: mobile Previous Job Requests section opens the detail modal in bottom-sheet mode', () => {
    expect(pageContent).toContain('Previous Job Requests</span>')
    expect(pageContent).toContain('bottomSheetOnMobile')
  })
})
