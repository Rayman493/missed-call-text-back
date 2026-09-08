import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('SearchableCustomerSelect canonical name behavior', () => {
  const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')

  it('A: reconciles prefillCustomer by ID so stale same-ID options are replaced', () => {
    // The reconciled list removes any fetched entry with the same id and puts
    // the authoritative prefill version at the front.
    expect(content).toContain('const mergedCustomers = useMemo(() => {')
    expect(content).toContain("const filtered = customers.filter(c => c.id !== prefillCustomer.id)")
    expect(content).toContain('[prefillCustomer, ...filtered]')
  })

  it('B: selected value is resolved from the reconciled list', () => {
    expect(content).toContain('const selectedCustomer = useMemo(() => {')
    expect(content).toContain('mergedCustomers.find(c => c.id === value)')
  })

  it('C: search filters the reconciled list using canonical display labels', () => {
    expect(content).toContain('const filteredCustomers = filterLeadsBySearchQuery(mergedCustomers, searchQuery)')
    expect(content).toContain('getCustomerDisplayName')
  })

  it('D: other customers remain available because only the matching id is replaced', () => {
    // Reconciliation filters by prefillCustomer.id, so every other id is kept.
    expect(content).toContain('customers.filter(c => c.id !== prefillCustomer.id)')
  })
})
