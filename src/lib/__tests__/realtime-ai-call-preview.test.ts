import { describe, it, expect } from 'vitest'
import { mergeAICallRecordIntoLeads } from '../realtime-lead-merge'
import { getCurrentCustomerContext } from '../customer-context'
import { getLeadAIIntake } from '../ai-field-mapping'

function makeLead(id: string, name: string, records: any[] = []): any {
  return {
    id,
    contact_name: name,
    caller_phone: '+15550000001',
    ai_call_records: records,
    aiCallRecords: records,
    raw_metadata: {}
  }
}

function makeRecord(id: string, leadId: string, extractedInfo: any, createdAt: string): any {
  return {
    id,
    lead_id: leadId,
    business_id: 'biz-1',
    caller_phone: '+15550000001',
    created_at: createdAt,
    extracted_info: extractedInfo
  }
}

describe('realtime AI call preview card updates', () => {
  it('updates the existing preview card in place for the same lead', () => {
    const lead = makeLead('L1', 'Christopher Miller', [
      { id: 'R1', lead_id: 'L1', created_at: '2026-09-08T10:00:00Z', extracted_info: { callerName: 'Christopher Miller' } }
    ])
    const updatedRecord = makeRecord('R1', 'L1', { callerName: 'Christopher Miller-Ray' }, '2026-09-08T10:00:00Z')

    const result = mergeAICallRecordIntoLeads([lead], updatedRecord)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('L1')
    expect(result[0].ai_call_records[0].extracted_info.callerName).toBe('Christopher Miller-Ray')
    expect(result[0].aiCallRecords[0].extracted_info.callerName).toBe('Christopher Miller-Ray')
  })

  it('updates the preview card name without refresh', () => {
    const lead = makeLead('L1', 'Christopher Miller', [
      { id: 'R1', lead_id: 'L1', created_at: '2026-09-08T10:00:00Z', extracted_info: { callerName: 'Christopher Miller', reasonForCalling: 'Water heater' } }
    ])
    const newRecord = makeRecord('R2', 'L1', { callerName: 'Ray', reasonForCalling: 'Water heater' }, '2026-09-09T12:00:00Z')

    const result = mergeAICallRecordIntoLeads([lead], newRecord)

    expect(getCurrentCustomerContext(result[0]).customerName).toBe('Ray')
  })

  it('updates the preview card service/reason without refresh', () => {
    const lead = makeLead('L1', 'Old Name', [
      { id: 'R1', lead_id: 'L1', created_at: '2026-09-08T10:00:00Z', extracted_info: { reasonForCalling: 'Old request' } }
    ])
    const newRecord = makeRecord('R2', 'L1', { reasonForCalling: 'Grass cutting in the next two weeks' }, '2026-09-09T12:00:00Z')

    const result = mergeAICallRecordIntoLeads([lead], newRecord)

    expect(getLeadAIIntake(result[0]).serviceRequested?.toLowerCase()).toContain('grass')
  })

  it('does not duplicate the lead card for repeated updates to the same lead', () => {
    const leads = [makeLead('L1', 'A'), makeLead('L2', 'B')]
    const record = makeRecord('R1', 'L1', { reasonForCalling: 'First' }, '2026-09-09T12:00:00Z')

    const first = mergeAICallRecordIntoLeads(leads, record)
    const second = mergeAICallRecordIntoLeads(first, { ...record, extracted_info: { reasonForCalling: 'Second' } })

    expect(second).toHaveLength(2)
    expect(second.filter(l => l.id === 'L1')).toHaveLength(1)
    expect(second.find(l => l.id === 'L1')!.ai_call_records).toHaveLength(1)
  })

  it('leaves unrelated lead cards unchanged', () => {
    const lead1 = makeLead('L1', 'A', [
      { id: 'R1', lead_id: 'L1', created_at: '2026-09-08T10:00:00Z', extracted_info: { callerName: 'A' } }
    ])
    const lead2 = makeLead('L2', 'B', [
      { id: 'R2', lead_id: 'L2', created_at: '2026-09-08T10:00:00Z', extracted_info: { callerName: 'B' } }
    ])
    const newRecord = makeRecord('R3', 'L1', { callerName: 'A-Updated' }, '2026-09-09T12:00:00Z')

    const result = mergeAICallRecordIntoLeads([lead1, lead2], newRecord)

    expect(result[0].ai_call_records).toHaveLength(2)
    expect(result[1].ai_call_records).toHaveLength(1)
    expect(getCurrentCustomerContext(result[1]).customerName).toBe('B')
  })

  it('does not let a realtime AI update override a newer manual correction', () => {
    const manualCorrectionAt = '2026-09-09T13:00:00Z'
    const lead: any = {
      id: 'L1',
      contact_name: 'Manual Name',
      caller_phone: '+15550000001',
      ai_call_records: [
        { id: 'R1', lead_id: 'L1', created_at: '2026-09-09T12:00:00Z', extracted_info: { callerName: 'AI Name' } }
      ],
      aiCallRecords: [
        { id: 'R1', lead_id: 'L1', created_at: '2026-09-09T12:00:00Z', extracted_info: { callerName: 'AI Name' } }
      ],
      raw_metadata: {
        corrected_fields: { name: 'Manual Name' },
        corrected_fields_updated_at: { name: manualCorrectionAt }
      }
    }
    const staleRecord = makeRecord('R2', 'L1', { callerName: 'Stale AI' }, '2026-09-09T11:00:00Z')

    const result = mergeAICallRecordIntoLeads([lead], staleRecord)

    expect(getCurrentCustomerContext(result[0]).customerName).toBe('Manual Name')
  })

  it('does not regress current customer state from stale or out-of-order events', () => {
    const lead: any = {
      id: 'L1',
      caller_phone: '+15550000001',
      ai_call_records: [
        { id: 'R1', lead_id: 'L1', created_at: '2026-09-09T13:00:00Z', extracted_info: { callerName: 'Newest' } },
        { id: 'R2', lead_id: 'L1', created_at: '2026-09-09T11:00:00Z', extracted_info: { callerName: 'Stale' } }
      ],
      aiCallRecords: [
        { id: 'R1', lead_id: 'L1', created_at: '2026-09-09T13:00:00Z', extracted_info: { callerName: 'Newest' } },
        { id: 'R2', lead_id: 'L1', created_at: '2026-09-09T11:00:00Z', extracted_info: { callerName: 'Stale' } }
      ],
      raw_metadata: {}
    }
    const outOfOrderUpdate = {
      id: 'R2',
      lead_id: 'L1',
      business_id: 'biz-1',
      created_at: '2026-09-09T11:00:00Z',
      extracted_info: { callerName: 'Still stale' }
    }

    const result = mergeAICallRecordIntoLeads([lead], outOfOrderUpdate)

    expect(getCurrentCustomerContext(result[0]).customerName).toBe('Newest')
  })
})
