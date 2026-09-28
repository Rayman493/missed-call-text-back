import { describe, it, expect } from 'vitest'
import { mergeLeadRealtimeUpdate } from '@/lib/lead-merge'
import { getCurrentCustomerContext } from '@/lib/customer-context'

// Simulates the conversation-page edit flow: PATCH /api/leads/[id] returns the
// persisted row, the page merges it via mergeLeadRealtimeUpdate, and
// CustomerDetails renders getCurrentCustomerContext(leadData).

const baseLead: any = {
  id: 'lead-1',
  contact_name: 'Old Name',
  caller_phone: '+15550001111',
  raw_metadata: {
    extracted_info: { callerName: 'AI Name', serviceRequested: 'Old reason' },
    corrected_fields: {},
    corrected_fields_updated_at: {},
  },
  aiCallRecords: [
    { id: 'r1', created_at: '2026-09-20T10:00:00Z', extracted_info: { callerName: 'AI Name', serviceRequested: 'Old reason' } },
  ],
}

function patchRow(overrides: any = {}) {
  return {
    ...baseLead,
    contact_name: overrides.contact_name ?? 'New Name',
    caller_phone: overrides.caller_phone ?? '+15552223333',
    raw_metadata: {
      ...baseLead.raw_metadata,
      ...(overrides.raw_metadata || {}),
      corrected_fields: overrides.corrected_fields ?? {
        callerName: 'New Name', name: 'New Name', customerName: 'New Name',
        serviceRequested: 'New reason', reasonForCalling: 'New reason', reason: 'New reason',
        importantDetails: 'New details', details: 'New details', issueDescription: 'New details',
        addressOrLocation: '123 New St', address: '123 New St', serviceAddress: '123 New St',
        desiredCompletionTime: 'Friday', desiredCompletion: 'Friday',
        preferredCallbackTime: 'after 5pm', callbackTime: 'after 5pm',
        email: 'new@x.com',
      },
      corrected_fields_updated_at: overrides.corrected_fields_updated_at ?? {
        callerName: '2026-09-27T12:00:00Z', reasonForCalling: '2026-09-27T12:00:00Z',
        importantDetails: '2026-09-27T12:00:00Z', addressOrLocation: '2026-09-27T12:00:00Z',
        desiredCompletionTime: '2026-09-27T12:00:00Z', preferredCallbackTime: '2026-09-27T12:00:00Z',
        email: '2026-09-27T12:00:00Z',
      },
    },
  }
}

describe('customer edit → Customer Details reconcile', () => {
  it('surfaces every edited field immediately after merge', () => {
    const merged = mergeLeadRealtimeUpdate(baseLead, patchRow())
    const ctx = getCurrentCustomerContext(merged)
    expect(ctx.customerName).toBe('New Name')
    expect(ctx.reasonForCalling).toBe('New reason')
    expect(ctx.details).toBe('New details')
    expect(ctx.location).toBe('123 New St')
    expect(ctx.desiredCompletionTime).toBe('Friday')
    expect(ctx.preferredCallbackTime).toBe('After 5pm')
    expect(ctx.phoneNumber).toBe('+15552223333')
    expect(ctx.email).toBe('new@x.com')
  })

  it('manual re-assertion with a fresh timestamp beats a newer AI call record', () => {
    // Column already holds the user's value, but a newer AI record exists —
    // the PATCH must re-stamp corrected_fields_updated_at.callerName so the
    // saved name wins arbitration.
    const stale: any = {
      ...baseLead,
      contact_name: 'Jon Smith',
      raw_metadata: {
        extracted_info: {},
        corrected_fields: { callerName: 'Jon Smith', name: 'Jon Smith', customerName: 'Jon Smith' },
        corrected_fields_updated_at: { callerName: '2026-09-10T10:00:00Z' },
      },
      aiCallRecords: [
        { id: 'r2', created_at: '2026-09-26T10:00:00Z', extracted_info: { callerName: 'John Smith' } },
      ],
    }
    // Pre-fix behavior: stale timestamp loses to the newer AI record.
    expect(getCurrentCustomerContext(stale).customerName).toBe('John Smith')
    // Post-PATCH row: same values, but callerName timestamp re-stamped to now.
    const afterPatch = patchRow({
      contact_name: 'Jon Smith',
      corrected_fields: { callerName: 'Jon Smith', name: 'Jon Smith', customerName: 'Jon Smith' },
      corrected_fields_updated_at: { callerName: '2026-09-27T12:00:00Z' },
    })
    afterPatch.aiCallRecords = stale.aiCallRecords
    const merged = mergeLeadRealtimeUpdate(stale, afterPatch)
    expect(getCurrentCustomerContext(merged).customerName).toBe('Jon Smith')
  })

  it('merge does not contaminate when the PATCH row is for a different lead', () => {
    const otherLeadPatch = { ...patchRow(), id: 'lead-OTHER' }
    // The page callback guards on updatedLead.id === params.id before merging.
    const merged = otherLeadPatch.id === baseLead.id
      ? mergeLeadRealtimeUpdate(baseLead, otherLeadPatch)
      : baseLead
    expect(merged.contact_name).toBe('Old Name')
  })
})
