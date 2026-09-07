import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { getAllCustomerStatuses, getCustomerStatusLabel } from '@/lib/customer-status'

describe('Customers page status filter parity', () => {
  const content = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')
  const canonicalStatuses = getAllCustomerStatuses()

  it('imports getAllCustomerStatuses and getCustomerStatusLabel', () => {
    expect(content).toContain('getAllCustomerStatuses')
    expect(content).toContain('getCustomerStatusLabel')
  })

  it('derives statusFilterOptions from getAllCustomerStatuses()', () => {
    expect(content).toContain('getAllCustomerStatuses().map')
    expect(content).toContain('value: status')
    expect(content).toContain('label: getCustomerStatusLabel(status)')
  })

  it('includes the canonical status values in the filter', () => {
    for (const status of canonicalStatuses) {
      expect(content).toContain(status)
    }
  })

  it('does not skip needs_reply in the filter', () => {
    expect(content).toContain('needs_reply')
  })

  it('does not skip cancelled in the filter', () => {
    expect(content).toContain('cancelled')
  })
})

describe('API leads route status filter parity', () => {
  const content = readFileSync('src/app/api/leads/route.ts', 'utf8')
  const canonicalStatuses = getAllCustomerStatuses()

  it('includes all canonical statuses in valid GET status filter list', () => {
    for (const status of canonicalStatuses) {
      expect(content).toContain(status)
    }
  })
})
