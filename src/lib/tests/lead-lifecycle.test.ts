/**
 * Lead Lifecycle Status Count Tests
 *
 * Tests for the calculateLeadStatusCounts function to ensure
 * count parity between summary cards and filters on the Customers page.
 */

import { describe, it, expect } from 'vitest'
import { calculateLeadStatusCounts } from '../lead-lifecycle'

describe('calculateLeadStatusCounts', () => {
  it('should count ignored leads correctly', () => {
    const leads = [
      { id: '1', status: 'new', deleted_at: null },
      { id: '2', status: 'active', deleted_at: null },
      { id: '3', status: 'ignored', deleted_at: null },
      { id: '4', status: 'completed', deleted_at: null },
      { id: '5', status: 'ignored', deleted_at: null },
    ]

    const counts = calculateLeadStatusCounts(leads)

    expect(counts.ignored).to.equal(2)
  })

  it('should exclude deleted leads from ignored count', () => {
    const leads = [
      { id: '1', status: 'ignored', deleted_at: null },
      { id: '2', status: 'ignored', deleted_at: '2024-01-01' },
      { id: '3', status: 'ignored', deleted_at: null },
    ]

    const counts = calculateLeadStatusCounts(leads)

    expect(counts.ignored).to.equal(2)
  })

  it('should count new leads correctly (Needs Reply card)', () => {
    const leads = [
      { id: '1', status: 'new', deleted_at: null },
      { id: '2', status: 'active', deleted_at: null },
      { id: '3', status: 'new', deleted_at: null },
      { id: '4', status: 'completed', deleted_at: null },
    ]

    const counts = calculateLeadStatusCounts(leads)

    expect(counts.new).to.equal(2)
  })

  it('should count active leads correctly', () => {
    const leads = [
      { id: '1', status: 'new', deleted_at: null },
      { id: '2', status: 'active', deleted_at: null },
      { id: '3', status: 'active', deleted_at: null },
      { id: '4', status: 'completed', deleted_at: null },
    ]

    const counts = calculateLeadStatusCounts(leads)

    expect(counts.active).to.equal(2)
  })

  it('should count completed leads correctly', () => {
    const leads = [
      { id: '1', status: 'new', deleted_at: null },
      { id: '2', status: 'active', deleted_at: null },
      { id: '3', status: 'completed', deleted_at: null },
      { id: '4', status: 'completed', deleted_at: null },
    ]

    const counts = calculateLeadStatusCounts(leads)

    expect(counts.completed).to.equal(2)
  })

  it('should exclude deleted leads from all counts', () => {
    const leads = [
      { id: '1', status: 'new', deleted_at: null },
      { id: '2', status: 'new', deleted_at: '2024-01-01' },
      { id: '3', status: 'active', deleted_at: null },
      { id: '4', status: 'active', deleted_at: '2024-01-01' },
      { id: '5', status: 'completed', deleted_at: null },
      { id: '6', status: 'completed', deleted_at: '2024-01-01' },
      { id: '7', status: 'ignored', deleted_at: null },
      { id: '8', status: 'ignored', deleted_at: '2024-01-01' },
    ]

    const counts = calculateLeadStatusCounts(leads)

    expect(counts.new).to.equal(1)
    expect(counts.active).to.equal(1)
    expect(counts.completed).to.equal(1)
    expect(counts.ignored).to.equal(1)
  })

  it('should handle lead_status field as fallback', () => {
    const leads = [
      { id: '1', lead_status: 'new', deleted_at: null },
      { id: '2', lead_status: 'active', deleted_at: null },
      { id: '3', lead_status: 'completed', deleted_at: null },
      { id: '4', lead_status: 'ignored', deleted_at: null },
    ]

    const counts = calculateLeadStatusCounts(leads)

    expect(counts.new).to.equal(1)
    expect(counts.active).to.equal(1)
    expect(counts.completed).to.equal(1)
    expect(counts.ignored).to.equal(1)
  })

  it('should return zero for empty lead array', () => {
    const leads: any[] = []

    const counts = calculateLeadStatusCounts(leads)

    expect(counts.new).to.equal(0)
    expect(counts.active).to.equal(0)
    expect(counts.completed).to.equal(0)
    expect(counts.ignored).to.equal(0)
  })
})