'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { ChevronDown, X, Check, Search, Loader2 } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { filterLeadsBySearchQuery, normalizePhoneDigits, getCustomerDisplayName, getCustomerSecondaryText } from '@/components/payments/customer-search-helpers'
import { formatForDisplay } from '@/utils/phone-formatting'

export interface Customer {
  id: string
  name: string | null
  caller_phone: string | null
  raw_metadata?: Record<string, any> | null
}

interface SearchableCustomerSelectProps {
  value: string | null
  onChange: (customerId: string | null) => void
  onCustomerSelect?: (customer: Customer | null) => void // Optional callback with full customer data
  placeholder?: string
  label?: string
  required?: boolean
  disabled?: boolean
  allowClear?: boolean // Allow clearing selection (for optional customers)
}

export default function SearchableCustomerSelect({
  value,
  onChange,
  onCustomerSelect,
  placeholder = 'Search or select a customer...',
  label,
  required = false,
  disabled = false,
  allowClear = true
}: SearchableCustomerSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const triggerId = useId()
  const labelId = useId()

  // Fetch customers when component mounts
  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const supabase = createBrowserClient()
      if (!supabase) throw new Error('Client unavailable')
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/leads', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Request failed (${res.status})`)
      }
      const data = await res.json()
      setCustomers(data.leads || [])
    } catch (e) {
      console.error('[SearchableCustomerSelect] Failed to load customers:', e)
      setError('Could not load customers')
    } finally {
      setIsLoading(false)
    }
  }

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
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  // Filter customers using existing helper
  const filteredCustomers = filterLeadsBySearchQuery(customers, searchQuery)

  const selectedCustomer = customers.find(c => c.id === value)
  const hasValue = value !== null && value !== ''

  const handleSelect = (customerId: string | null) => {
    onChange(customerId)
    const customer = customerId ? customers.find(c => c.id === customerId) || null : null
    onCustomerSelect?.(customer)
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
    onCustomerSelect?.(null)
    setIsOpen(false)
    setSearchQuery('')
  }

  const toggleOpen = () => {
    if (!disabled) setIsOpen(!isOpen)
  }

  const getDisplayText = (customer: Customer | null | undefined): string => {
    if (!customer) return placeholder
    return getCustomerDisplayName(customer)
  }

  const getSecondaryText = (customer: Customer | null | undefined): string | null => {
    if (!customer) return null
    return getCustomerSecondaryText(customer)
  }

  // Show the null "No customer" option only when a customer is actually selected
  // (so the user can deselect), and hide it when already cleared.
  const showNoCustomerOption = allowClear && hasValue

  return (
    <div className="relative" ref={pickerRef}>
      {label && (
        <label
          id={labelId}
          className="text-xs text-muted-foreground font-medium mb-1.5 block"
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
          className={`w-full bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 flex items-center justify-between gap-2 transition-colors text-left ${
            disabled
              ? 'opacity-50 cursor-not-allowed px-4 py-2.5 sm:px-3 sm:py-2'
              : 'hover:border-border/80 cursor-pointer px-4 py-2.5 sm:px-3 sm:py-2'
          } ${hasValue ? 'pr-16' : 'pr-10'}`}
        >
          <span className={selectedCustomer ? 'text-foreground truncate' : 'text-muted-foreground truncate'}>
            {getDisplayText(selectedCustomer)}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
        {hasValue && allowClear && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-1.5 hover:bg-accent/40 rounded transition-colors"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-[60] mt-2 w-full bg-card/95 backdrop-blur-sm rounded-lg shadow-[0_4px_12px_rgb(0,0,0,0.08),0_2px_6px_rgb(0,0,0,0.05)] border border-border/40 max-h-[300px] overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="p-3 border-b border-border/20">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or phone..."
                className="w-full pl-9 pr-3 py-2 text-base sm:text-sm bg-muted/50 border border-border/50 rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80"
              />
            </div>
          </div>

          {/* Results list */}
          <div className="overflow-y-auto flex-1" data-scroll-lock-allow>
            {isLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading customers...</span>
              </div>
            ) : error ? (
              <div className="py-8 text-center px-4">
                <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
                <button
                  type="button"
                  onClick={fetchCustomers}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : filteredCustomers.length === 0 && !showNoCustomerOption ? (
              <div className="py-8 text-center px-4">
                {searchQuery ? (
                  <p className="text-sm text-muted-foreground">No customers match <span className="font-medium">"{searchQuery}"</span></p>
                ) : (
                  <p className="text-sm text-muted-foreground">No customers available</p>
                )}
              </div>
            ) : (
              <div className="py-1">
                {showNoCustomerOption && (
                  <button
                    type="button"
                    onClick={() => handleSelect(null)}
                    className={`w-full px-3 py-2 text-sm text-left transition-colors flex items-center justify-between gap-2 ${
                      value === null ? 'bg-accent/40' : 'text-foreground hover:bg-accent/40'
                    }`}
                  >
                    <span className="truncate flex-1 text-muted-foreground">No customer</span>
                    {value === null && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                )}
                {filteredCustomers.map((customer) => {
                  const secondaryText = getSecondaryText(customer)
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => handleSelect(customer.id)}
                      className={`w-full px-3 py-2 text-sm text-left transition-colors flex flex-col gap-0.5 ${
                        value === customer.id ? 'bg-accent/40' : 'text-foreground hover:bg-accent/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate flex-1">{getDisplayText(customer)}</span>
                        {value === customer.id && (
                          <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        )}
                      </div>
                      {secondaryText && (
                        <span className="text-xs text-muted-foreground truncate">{secondaryText}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
