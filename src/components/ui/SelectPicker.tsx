'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { ChevronDown, X, Check, Search } from 'lucide-react'

interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectPickerProps {
  value: string | null
  onChange: (value: string | null) => void
  options: SelectOption[]
  placeholder?: string
  label?: string
  required?: boolean
  disabled?: boolean
  searchable?: boolean
  emptyMessage?: string
}

export default function SelectPicker({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  label,
  required = false,
  disabled = false,
  searchable = false,
  emptyMessage = 'No options available'
}: SelectPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dropup, setDropup] = useState(false)
  const [maxDropdownHeight, setMaxDropdownHeight] = useState(300)
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerId = useId()
  const labelId = useId()
  const dropdownId = useId()

  // Calculate available space (respecting the visual viewport, including on-screen keyboard)
  // and determine dropup/dropdown direction and a dynamic max-height for the dropdown.
  useEffect(() => {
    if (!isOpen || !pickerRef.current || !dropdownRef.current) return

    const measure = () => {
      if (!pickerRef.current) return
      const pickerRect = pickerRef.current.getBoundingClientRect()
      const vv = window.visualViewport
      const viewportTop = vv ? vv.offsetTop : 0
      const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight

      const spaceBelow = viewportBottom - pickerRect.bottom
      const spaceAbove = pickerRect.top - viewportTop
      const safeGap = 16
      const desiredMax = 300

      // Prefer upward when there is more space above, but make sure it fits at least the minimum height
      const useDropup = spaceAbove > spaceBelow && (spaceAbove - safeGap) >= 160
      const available = useDropup ? spaceAbove - safeGap : spaceBelow - safeGap
      setDropup(useDropup)
      setMaxDropdownHeight(Math.min(desiredMax, Math.max(available, 160)))
    }

    measure()
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', measure)
      vv.addEventListener('scroll', measure)
    }
    window.addEventListener('resize', measure)

    return () => {
      if (vv) {
        vv.removeEventListener('resize', measure)
        vv.removeEventListener('scroll', measure)
      }
      window.removeEventListener('resize', measure)
    }
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  // Reset query and focus search input when a searchable picker is opened
  useEffect(() => {
    if (isOpen && searchable) {
      setSearchQuery('')
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus()
          pickerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isOpen, searchable])

  // Prevent scroll chaining from dropdown to modal body
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return

    const dropdownEl = dropdownRef.current
    const scrollContainer = dropdownEl.querySelector('.overflow-y-auto') as HTMLElement

    if (!scrollContainer) return

    const handleWheel = (e: WheelEvent) => {
      // Prevent scroll from chaining to parent
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      const isAtTop = scrollTop === 0
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1

      // Allow scrolling within dropdown, but prevent chaining to parent
      if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
        e.preventDefault()
      }
    }

    scrollContainer.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      scrollContainer.removeEventListener('wheel', handleWheel)
    }
  }, [isOpen])

  const filteredOptions = options.filter(option => {
    if (!searchQuery.trim()) return true
    return option.label.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Hide redundant null/"No ..." option when a null-equivalent value is already selected.
  // The canonical null representation remains '' or null (normalized to null by onChange).
  const isCurrentNull = value === null || value === ''
  const visibleOptions = filteredOptions.filter(option => {
    const isNullOption = option.value === '' || option.value === null
    return !(isNullOption && isCurrentNull)
  })

  const selectedOption = options.find(opt => opt.value === value)
  const hasValue = value !== null && value !== ''
  const isSearching = searchable && isOpen

  const handleSelect = (optionValue: string) => {
    onChange(optionValue || null)
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
    setIsOpen(false)
    setSearchQuery('')
  }

  const toggleOpen = () => {
    if (!disabled) setIsOpen(!isOpen)
  }

  return (
    <div className="relative min-w-0" ref={pickerRef}>
      {label && (
        <label
          id={labelId}
          htmlFor={triggerId}
          className="block text-xs text-muted-foreground font-medium mb-1.5"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Trigger / search input area */}
      <div className="relative">
        {isSearching ? (
          <div
            className="w-full flex items-center gap-2 bg-background dark:bg-slate-900/40 border border-border rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/50 text-left"
          >
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={searchInputRef}
              id={triggerId}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-foreground placeholder-muted-foreground focus:outline-none"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={dropdownId}
              aria-autocomplete="list"
              aria-labelledby={label ? `${labelId} ${triggerId}` : triggerId}
              data-scroll-lock-allow
            />
          </div>
        ) : (
          <button
            id={triggerId}
            type="button"
            onClick={toggleOpen}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={dropdownId}
            aria-labelledby={label ? `${labelId} ${triggerId}` : triggerId}
            className={`w-full border rounded-lg flex items-center gap-2 duration-150 text-left ${
              disabled
                ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed border-border/30 px-3 py-2.5 pr-10'
                : 'bg-background dark:bg-slate-900/40 text-foreground border-border/40 hover:border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-border/60 cursor-pointer px-3 py-2.5'
            } ${!disabled && hasValue ? 'pr-14' : 'pr-10'}`}
          >
            <span className={selectedOption ? 'text-foreground truncate flex-1 min-w-0' : 'text-muted-foreground truncate flex-1 min-w-0'}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </button>
        )}

        {/* Dedicated icon slots on the right. The chevron is pointer-events-none
            so clicks pass through to the trigger button. The clear button is
            pointer-events-auto so it keeps its own click target. */}
        {!isSearching && (
          <div
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none"
            aria-hidden={!(hasValue && !disabled)}
          >
            {hasValue && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="pointer-events-auto p-1 hover:bg-accent/40 rounded transition-colors"
                aria-label="Clear selection"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 duration-150 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          id={dropdownId}
          ref={dropdownRef}
          className={`absolute z-[60] w-full bg-popover/95 backdrop-blur-sm rounded-lg shadow-[0_4px_12px_rgb(0,0,0,0.08),0_2px_6px_rgb(0,0,0,0.05)] border border-border/40 max-h-[300px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 ${
            dropup ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          style={{ maxHeight: maxDropdownHeight }}
          role="listbox"
          aria-label={label || 'Options'}
          data-scroll-lock-allow
        >
          <div
            className="overflow-y-auto flex-1 min-h-0 overscroll-contain touch-pan-y"
            data-scroll-lock-allow
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {visibleOptions.length === 0 ? (
              <div className="py-8 text-center px-4">
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
              </div>
            ) : (
              <div className="py-1">
                {visibleOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    onClick={() => handleSelect(option.value)}
                    disabled={option.disabled}
                    className={`w-full px-3 py-2 text-sm text-left duration-150 flex items-center justify-between gap-2 ${
                      option.disabled
                        ? 'text-muted-foreground/50 cursor-not-allowed'
                        : 'text-foreground hover:bg-accent/40'
                    } ${value === option.value ? 'bg-accent/40' : ''}`}
                  >
                    <span className="truncate flex-1 min-w-0">{option.label}</span>
                    {value === option.value && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
