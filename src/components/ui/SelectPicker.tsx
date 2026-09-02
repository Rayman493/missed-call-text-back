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
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const triggerId = useId()
  const labelId = useId()

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

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen, searchable])

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
    <div className="relative" ref={pickerRef}>
      {label && (
        <label
          id={labelId}
          htmlFor={triggerId}
          className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Trigger button - clear action is a separate sibling button to avoid nested buttons */}
      <div className="relative">
        <button
          id={triggerId}
          type="button"
          onClick={toggleOpen}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={label ? `${labelId} ${triggerId}` : triggerId}
          className={`w-full border rounded-lg flex items-center gap-2 transition-colors text-left ${
            disabled
              ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed border-border/30 px-3 py-2'
              : 'bg-card dark:bg-slate-900/60 text-foreground border-border/40 hover:border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-border/60 cursor-pointer px-3 py-2'
          } pr-10`}
        >
          <span className={selectedOption ? 'text-foreground truncate' : 'text-muted-foreground truncate flex-1'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </button>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        {hasValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-10 top-1/2 -translate-y-1/2 p-1 hover:bg-accent/40 rounded transition-colors"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-[60] mt-2 w-full bg-popover/95 backdrop-blur-sm rounded-lg shadow-[0_4px_12px_rgb(0,0,0,0.08),0_2px_6px_rgb(0,0,0,0.05)] border border-border/40 max-h-[300px] overflow-hidden flex flex-col">
          {searchable && (
            <div className="p-3 border-b border-border/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border border-border/50 rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                />
              </div>
            </div>
          )}

          <div className="overflow-y-auto flex-1">
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
                    onClick={() => handleSelect(option.value)}
                    disabled={option.disabled}
                    className={`w-full px-3 py-2 text-sm text-left transition-colors flex items-center justify-between gap-2 ${
                      option.disabled
                        ? 'text-muted-foreground/50 cursor-not-allowed'
                        : 'text-foreground hover:bg-accent/40'
                    } ${value === option.value ? 'bg-accent/40' : ''}`}
                  >
                    <span className="truncate flex-1">{option.label}</span>
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
