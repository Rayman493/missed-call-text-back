/**
 * Tests for SearchableCustomerSelect Component
 *
 * Code inspection tests verifying the component structure and behavior.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('SearchableCustomerSelect', () => {
  it('should import filterLeadsBySearchQuery from customer-search-helpers', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('filterLeadsBySearchQuery')
  })

  it('should import getCustomerDisplayName from customer-search-helpers', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('getCustomerDisplayName')
  })

  it('should import getCustomerSecondaryText from customer-search-helpers', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('getCustomerSecondaryText')
  })

  it('should import formatForDisplay from phone-formatting utils', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain("from '@/utils/phone-formatting'")
  })

  it('should have isOpen state for dropdown visibility', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('const [isOpen, setIsOpen]')
  })

  it('should have searchQuery state for search input', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('const [searchQuery, setSearchQuery]')
  })

  it('should have customers state for fetched customers', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('const [customers, setCustomers]')
  })

  it('should fetch customers from /api/leads', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain("'/api/leads'")
  })

  it('should filter customers using filterLeadsBySearchQuery', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('const filteredCustomers = filterLeadsBySearchQuery(customers, searchQuery)')
  })

  it('should use filterLeadsBySearchQuery for name and phone matching', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('filterLeadsBySearchQuery')
  })

  it('should call onChange with customer ID when selected', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('onChange(customerId)')
  })

  it('should call onCustomerSelect with full customer object when selected', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('onCustomerSelect?.(customer)')
  })

  it('should have allowClear prop to control clear button visibility', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('allowClear?: boolean')
  })

  it('should render No customer option when allowClear is true', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('{allowClear && (')
    expect(content).toContain('No customer')
  })

  it('should NOT render Add New Customer in results', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).not.toContain('Add New Customer')
    expect(content).not.toContain('+ Create New Customer')
  })

  it('should render no-results state when search has no matches', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('No customers match')
  })

  it('should render loading state while fetching customers', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('Loading customers...')
  })

  it('should render error state when fetch fails', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('Could not load customers')
  })

  it('should have error state', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('const [error, setError]')
  })

  it('should have isLoading state', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('const [isLoading, setIsLoading]')
  })

  it('should close dropdown on Escape key', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain("event.key === 'Escape'")
  })

  it('should close dropdown on click outside', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('handleClickOutside')
  })

  it('should focus search input when dropdown opens', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('searchInputRef.current.focus()')
  })

  it('should use type="button" on trigger to prevent form submit', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('type="button"')
  })

  it('should use standard modal form control styling', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('px-4 py-2.5 sm:px-3 sm:py-2')
    expect(content).toContain('bg-background')
    expect(content).toContain('border border-border')
    expect(content).toContain('rounded-lg')
    expect(content).toContain('focus:ring-2 focus:ring-blue-500/50')
  })

  it('should have max-h-[300px] for dropdown scroll', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('max-h-[300px]')
  })

  it('should use z-[60] for dropdown positioning above Modal', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('z-[60]')
  })

  it('should use semantic theme classes for dark mode', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('bg-background')
    expect(content).toContain('bg-card')
    expect(content).toContain('text-foreground')
    expect(content).toContain('text-muted-foreground')
    expect(content).toContain('bg-muted')
    expect(content).toContain('bg-accent/40')
  })

  it('should have onCustomerSelect optional prop', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('onCustomerSelect?:')
  })

  it('should include raw_metadata in Customer interface', () => {
    const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
    expect(content).toContain('raw_metadata?: Record<string, any> | null')
  })
})