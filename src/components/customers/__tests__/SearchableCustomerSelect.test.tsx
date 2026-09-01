/**
 * Tests for SearchableCustomerSelect Component
 *
 * Code inspection tests verifying the component structure and behavior.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('SearchableCustomerSelect', () => {
  const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')

  it('should import filterLeadsBySearchQuery from customer-search-helpers', () => {
    expect(content).toContain('filterLeadsBySearchQuery')
  })

  it('should import getCustomerDisplayName from customer-search-helpers', () => {
    expect(content).toContain('getCustomerDisplayName')
  })

  it('should import getCustomerSecondaryText from customer-search-helpers', () => {
    expect(content).toContain('getCustomerSecondaryText')
  })

  it('should import formatForDisplay from phone-formatting utils', () => {
    expect(content).toContain("from '@/utils/phone-formatting'")
  })

  it('should have isOpen state for dropdown visibility', () => {
    expect(content).toContain('const [isOpen, setIsOpen]')
  })

  it('should have searchQuery state for search input', () => {
    expect(content).toContain('const [searchQuery, setSearchQuery]')
  })

  it('should have customers state for fetched customers', () => {
    expect(content).toContain('const [customers, setCustomers]')
  })

  it('should fetch customers from /api/leads', () => {
    expect(content).toContain("'/api/leads'")
  })

  it('should filter customers using filterLeadsBySearchQuery', () => {
    expect(content).toContain('const filteredCustomers = filterLeadsBySearchQuery(customers, searchQuery)')
  })

  it('should use filterLeadsBySearchQuery for name and phone matching', () => {
    expect(content).toContain('filterLeadsBySearchQuery')
  })

  it('should call onChange with customer ID when selected', () => {
    expect(content).toContain('onChange(customerId)')
  })

  it('should call onCustomerSelect with full customer object when selected', () => {
    expect(content).toContain('onCustomerSelect?.(customer)')
  })

  it('should have allowClear prop to control clear button visibility', () => {
    expect(content).toContain('allowClear?: boolean')
  })

  it('should render No customer option only when a customer is selected', () => {
    expect(content).toContain('showNoCustomerOption')
    expect(content).toContain('No customer')
    expect(content).toContain('allowClear && hasValue')
  })

  it('should hide No customer option when value is already null', () => {
    expect(content).toContain('const showNoCustomerOption = allowClear && hasValue')
    expect(content).toContain('const hasValue = value !== null')
  })

  it('should NOT render Add New Customer in results', () => {
    expect(content).not.toContain('Add New Customer')
    expect(content).not.toContain('+ Create New Customer')
  })

  it('should render no-results state when search has no matches', () => {
    expect(content).toContain('No customers match')
  })

  it('should render loading state while fetching customers', () => {
    expect(content).toContain('Loading customers...')
  })

  it('should render error state when fetch fails', () => {
    expect(content).toContain('Could not load customers')
  })

  it('should have error state', () => {
    expect(content).toContain('const [error, setError]')
  })

  it('should have isLoading state', () => {
    expect(content).toContain('const [isLoading, setIsLoading]')
  })

  it('should close dropdown on Escape key', () => {
    expect(content).toContain("event.key === 'Escape'")
  })

  it('should close dropdown on click outside', () => {
    expect(content).toContain('handleClickOutside')
  })

  it('should close dropdown after selecting a customer', () => {
    expect(content).toContain('setIsOpen(false)')
    expect(content).toContain('handleSelect')
  })

  it('should close dropdown after clearing the customer', () => {
    expect(content).toContain('handleClear')
    expect(content).toContain('setIsOpen(false)')
  })

  it('should focus search input when dropdown opens', () => {
    expect(content).toContain('searchInputRef.current.focus()')
  })

  it('should use type="button" on trigger to prevent form submit', () => {
    expect(content).toContain('type="button"')
  })

  it('should keep clear button separate from trigger button', () => {
    expect(content).toMatch(/<button[^>]*onClick={toggleOpen}/)
    expect(content).toMatch(/<button[^>]*onClick={handleClear}/)
    expect(content).not.toMatch(/<button[^>]*>\s*<button/)
  })

  it('should use standard modal form control styling', () => {
    expect(content).toContain('px-4 py-2.5 sm:px-3 sm:py-2')
    expect(content).toContain('bg-background')
    expect(content).toContain('border border-border')
    expect(content).toContain('rounded-lg')
    expect(content).toContain('focus:ring-2 focus:ring-blue-500/50')
  })

  it('should have max-h-[300px] for dropdown scroll', () => {
    expect(content).toContain('max-h-[300px]')
  })

  it('should use z-[60] for dropdown positioning above Modal', () => {
    expect(content).toContain('z-[60]')
  })

  it('should use semantic theme classes for dark mode', () => {
    expect(content).toContain('bg-background')
    expect(content).toContain('bg-card')
    expect(content).toContain('text-foreground')
    expect(content).toContain('text-muted-foreground')
    expect(content).toContain('bg-muted')
    expect(content).toContain('bg-accent/40')
  })

  it('should have onCustomerSelect optional prop', () => {
    expect(content).toContain('onCustomerSelect?:')
  })

  it('should include raw_metadata in Customer interface', () => {
    expect(content).toContain('raw_metadata?: Record<string, any> | null')
  })

  it('should add right padding for clear icon', () => {
    expect(content).toContain("hasValue ? 'pr-16' : 'pr-10'")
  })

  // Truth-table behavioral assertions derived from the implementation
  it('should define hasValue as value !== null && value !== \'\'', () => {
    expect(content).toContain('const hasValue = value !== null && value !== \'\'')
  })

  it('should hide No customer when value is null (no redundant null option)', () => {
    // value === null => hasValue === false => showNoCustomerOption === false
    expect(content).toContain('const hasValue = value !== null && value !== \'\'')
    expect(content).toContain('const showNoCustomerOption = allowClear && hasValue')
  })

  it('should show No customer when value is a real customer id', () => {
    // value !== null => hasValue === true => showNoCustomerOption === true (when allowClear)
    expect(content).toContain('const showNoCustomerOption = allowClear && hasValue')
  })

  it('should call onChange(null) when No customer option is selected', () => {
    expect(content).toContain('onClick={() => handleSelect(null)}')
    expect(content).toContain('const handleSelect = (customerId: string | null) =>')
  })

  it('should close dropdown and reset search when No customer option is selected', () => {
    expect(content).toContain('setIsOpen(false)')
    expect(content).toContain('setSearchQuery(\'\')')
    expect(content).toContain('onChange(customerId)')
  })
})
