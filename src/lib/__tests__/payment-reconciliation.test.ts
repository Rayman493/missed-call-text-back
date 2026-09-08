import { describe, it, expect } from 'vitest'
import { mergePaymentRequests, reconcileLeadData } from '@/lib/payment-reconciliation'

describe('mergePaymentRequests', () => {
  it('keeps all unique requests', () => {
    const existing = [{ id: 'pr-1', created_at: '2026-01-01T00:00:00Z', amount_cents: 100 }]
    const incoming = [{ id: 'pr-2', created_at: '2026-01-02T00:00:00Z', amount_cents: 200 }]
    const result = mergePaymentRequests(existing, incoming)
    expect(result.map(r => r.id)).toEqual(['pr-1', 'pr-2'])
  })

  it('does not duplicate the same optimistic request when the server fetch is stale', () => {
    const optimistic = { id: 'pr-new', created_at: '2026-01-03T00:00:00Z', amount_cents: 300, status: 'pending' }
    const existing = [optimistic]
    const incoming = [{ id: 'pr-new', created_at: '2026-01-03T00:00:00Z', amount_cents: 300, status: 'pending' }]
    const result = mergePaymentRequests(existing, incoming)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('pr-new')
  })

  it('preserves an optimistic request missing from a stale server fetch', () => {
    const optimistic = { id: 'pr-new', created_at: '2026-01-03T00:00:00Z', amount_cents: 300 }
    const existing = [optimistic]
    const incoming = [{ id: 'pr-old', created_at: '2026-01-01T00:00:00Z', amount_cents: 100 }]
    const result = mergePaymentRequests(existing, incoming)
    expect(result).toHaveLength(2)
    expect(result.some(r => r.id === 'pr-new')).toBe(true)
    expect(result.some(r => r.id === 'pr-old')).toBe(true)
  })

  it('lets authoritative server updates overwrite existing records by ID', () => {
    const existing = [{ id: 'pr-1', created_at: '2026-01-01T00:00:00Z', status: 'pending' }]
    const incoming = [{ id: 'pr-1', created_at: '2026-01-01T00:00:00Z', status: 'paid' }]
    const result = mergePaymentRequests(existing, incoming)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('paid')
  })
})

describe('reconcileLeadData', () => {
  it('merges payment requests while taking other fields from the server payload', () => {
    const prev = { id: 'lead-1', name: 'Lead', paymentRequests: [{ id: 'pr-new', created_at: '2026-01-03T00:00:00Z', amount_cents: 300 }] }
    const next = { id: 'lead-1', name: 'Lead Updated', paymentRequests: [{ id: 'pr-old', created_at: '2026-01-01T00:00:00Z', amount_cents: 100 }] }
    const result = reconcileLeadData(prev, next)
    expect(result.name).toBe('Lead Updated')
    expect(result.paymentRequests.map(r => r.id)).toEqual(['pr-old', 'pr-new'])
  })
})
