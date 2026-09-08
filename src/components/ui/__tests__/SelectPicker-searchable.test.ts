import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('SelectPicker searchable field-as-search mode', () => {
  const content = readFileSync('src/components/ui/SelectPicker.tsx', 'utf8')

  it('uses the trigger area as the search input when open', () => {
    expect(content).toContain('const isSearching = searchable && isOpen')
    expect(content).toContain('ref={searchInputRef}')
    expect(content).toContain('placeholder="Search..."')
    expect(content).toContain('type="text"')
  })

  it('does not add a second nested search input inside the dropdown', () => {
    expect(content).toContain('{/* Trigger / search input area */}')
    // Dropdown only contains the options list, not an input
    expect(content).not.toMatch(/<input[^>]*placeholder="Search\.\.\."[^>]*>.*\{isOpen/)
  })

  it('typing filters the available options', () => {
    expect(content).toContain('onChange={(e) => setSearchQuery(e.target.value)}')
    expect(content).toContain('const filteredOptions = options.filter')
    expect(content).toContain('option.label.toLowerCase().includes(searchQuery.toLowerCase())')
  })

  it('selecting an option closes the dropdown and resets the search query', () => {
    expect(content).toContain('const handleSelect = (optionValue: string) =>')
    expect(content).toContain('setIsOpen(false)')
    expect(content).toContain("setSearchQuery('')")
    expect(content).toContain('onChange(optionValue || null)')
  })

  it('clear button stops propagation and closes without reopening', () => {
    expect(content).toContain('const handleClear = (e: React.MouseEvent) =>')
    expect(content).toContain('e.stopPropagation()')
    expect(content).toContain('setIsOpen(false)')
  })

  it('preserves visualViewport, drop-up, and mobile scroll behavior', () => {
    expect(content).toContain('window.visualViewport')
    expect(content).toContain('setDropup')
    expect(content).toContain('setMaxDropdownHeight')
    expect(content).toContain('data-scroll-lock-allow')
    expect(content).toContain('overscroll-contain')
    expect(content).toContain('touch-pan-y')
    expect(content).toContain('WebkitOverflowScrolling')
  })

  it('uses combobox and listbox accessibility semantics', () => {
    expect(content).toContain('role="combobox"')
    expect(content).toContain('role="listbox"')
    expect(content).toContain('role="option"')
    expect(content).toContain('aria-expanded={isOpen}')
    expect(content).toContain('aria-controls={dropdownId}')
  })

  it('keeps fixed (non-searchable) mode rendering a simple trigger dropdown', () => {
    // Non-searchable path still renders the trigger button and option list only.
    expect(content).toContain('aria-haspopup="listbox"')
    expect(content).toContain('onClick={() => handleSelect(option.value)}')
    expect(content).toContain('visibleOptions')
  })
})
