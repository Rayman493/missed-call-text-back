import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { getAllCustomerStatuses, getCustomerStatusLabel } from '@/lib/customer-status'

describe('Customers page status filter parity', () => {
  const content = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')
  const canonicalStatuses = getAllCustomerStatuses()

  it('imports canonical status helpers', () => {
    expect(content).toContain('getAllCustomerStatuses')
    expect(content).toContain('getCustomerStatusLabel')
    expect(content).toContain('getCustomerStatusIcon')
  })

  it('derives statusFilterOptions from getAllCustomerStatuses()', () => {
    expect(content).toContain('getAllCustomerStatuses().map')
    expect(content).toContain('value: status')
    expect(content).toContain('label: getCustomerStatusLabel(status)')
  })

  it('renders canonical statuses through the shared options', () => {
    expect(content).toContain('statusFilterOptions.map')
    expect(content).toContain('getStatusFilterIcon(option.value)')
  })

  it('does not skip terminal or key workflow statuses', () => {
    for (const status of ['new', 'needs_reply', 'cancelled', 'ignored', 'lost']) {
      expect(canonicalStatuses).toContain(status)
    }
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
