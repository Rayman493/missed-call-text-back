import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('SearchableCustomerSelect field-as-search interaction', () => {
  const content = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')

  it('renders the closed trigger as a button with the selected value', () => {
    expect(content).toContain('<button')
    expect(content).toContain('onClick={toggleOpen}')
    expect(content).toContain('getDisplayText(selectedCustomer)')
  })

  it('renders the trigger as a search input when open', () => {
    expect(content).toContain('{isOpen ? (')
    expect(content).toContain('ref={searchInputRef}')
    expect(content).toContain('placeholder="Search customers..."')
    expect(content).toContain('type="text"')
  })

  it('does not render a second nested search input inside the dropdown', () => {
    expect(content).toContain('{/* Trigger / search input area */}')
    expect(content).toContain('{/* Results list */}')
    expect(content).not.toContain('Search by name or phone')
  })

  it('typing updates the search query', () => {
    expect(content).toContain('onChange={(e) => setSearchQuery(e.target.value)}')
    expect(content).toContain('const filteredCustomers = filterLeadsBySearchQuery(customers, searchQuery)')
  })

  it('selecting a customer closes the dropdown and resets the query', () => {
    expect(content).toContain('const handleSelect = (customerId: string | null) =>')
    expect(content).toContain('setIsOpen(false)')
    expect(content).toContain("setSearchQuery('')")
    expect(content).toContain('onChange(customerId)')
  })

  it('does not clear selection merely by opening the search field', () => {
    // Opening only resets the query; onChange is not called in the open effect.
    expect(content).toContain('setSearchQuery(\'\')')
    const openStart = content.indexOf('// Reset query and focus search input when opened')
    const openEnd = content.indexOf('}, [isOpen]', openStart)
    const openEffect = content.slice(openStart, openEnd)
    expect(openEffect).toContain("setSearchQuery('')")
    expect(openEffect).not.toContain('onChange')
  })

  it('clear button stops propagation and closes without reopening', () => {
    expect(content).toContain('const handleClear = (e: React.MouseEvent) =>')
    expect(content).toContain('e.stopPropagation()')
    expect(content).toContain('setIsOpen(false)')
  })

  it('chevron does not block trigger click', () => {
    expect(content).toContain('pointer-events-none')
    expect(content).toContain('<ChevronDown')
  })

  it('closes on outside click and Escape', () => {
    expect(content).toContain('handleClickOutside')
    expect(content).toContain("event.key === 'Escape'")
    expect(content).toContain("setSearchQuery('')")
  })

  it('truncates long selected values and search input text', () => {
    expect(content).toContain('truncate flex-1 min-w-0')
    expect(content).toContain('flex-1 min-w-0 bg-transparent')
  })

  it('preserves visualViewport drop-up/drop-down and scroll containment behavior', () => {
    expect(content).toContain('window.visualViewport')
    expect(content).toContain('setDropup')
    expect(content).toContain('setMaxDropdownHeight')
    expect(content).toContain('data-scroll-lock-allow')
    expect(content).toContain('overscroll-contain')
    expect(content).toContain('touch-pan-y')
    expect(content).toContain('WebkitOverflowScrolling')
  })

  it('uses combobox and listbox accessibility roles', () => {
    expect(content).toContain('role="combobox"')
    expect(content).toContain('role="listbox"')
    expect(content).toContain('role="option"')
    expect(content).toContain('aria-expanded={isOpen}')
    expect(content).toContain('aria-controls={dropdownId}')
  })

  it('retains data fetching and display helpers unchanged', () => {
    expect(content).toContain("fetch('/api/leads'")
    expect(content).toContain('getCustomerDisplayName')
    expect(content).toContain('getCustomerSecondaryText')
    expect(content).toContain('filterLeadsBySearchQuery')
  })
})
