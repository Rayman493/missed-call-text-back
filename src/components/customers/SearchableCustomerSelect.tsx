'use client'

import { useState, useEffect, useRef, useId, useMemo } from 'react'
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
  prefillCustomer?: Customer | null // Pre-fill with a specific customer object (e.g., from parent context)
  onAddCustomerClick?: () => void // Optional inline "Add customer" affordance
}

export default function SearchableCustomerSelect({
  value,
  onChange,
  onCustomerSelect,
  placeholder = 'Search or select a customer...',
  label,
  required = false,
  disabled = false,
  allowClear = true,
  prefillCustomer,
  onAddCustomerClick
}: SearchableCustomerSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dropup, setDropup] = useState(false)
  const [maxDropdownHeight, setMaxDropdownHeight] = useState(300)
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  // Tracks whether the current pointer interaction started inside the picker.
  // Prevents focusout-induced dismissal when the user drags inside the results
  // list to scroll (touch-induced blur fires focusout with relatedTarget=null).
  const pointerDownInsideRef = useRef(false)
  const triggerId = useId()
  const labelId = useId()
  const dropdownId = useId()

  // Fetch customers when component mounts
  useEffect(() => {
    fetchCustomers()
  }, [])

  // Keep the fetched customer list pristine. Reconciliation with the authoritative
  // prefill happens at render time so it always wins over stale fetched data.
  const mergedCustomers = useMemo(() => {
    if (!prefillCustomer) return customers
    const filtered = customers.filter(c => c.id !== prefillCustomer.id)
    return [prefillCustomer, ...filtered]
  }, [customers, prefillCustomer])

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

  // Close on outside click (pointerdown covers mouse + touch reliably)
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (pickerRef.current && pickerRef.current.contains(event.target as Node)) {
        // Pointer started inside the picker — track this so focusout doesn't
        // dismiss the dropdown during touch-scroll of the results list.
        pointerDownInsideRef.current = true
      } else {
        pointerDownInsideRef.current = false
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    const handlePointerUp = () => {
      // Reset after the interaction completes so subsequent outside clicks close normally.
      pointerDownInsideRef.current = false
    }

    if (isOpen) {
      document.addEventListener('pointerdown', handlePointerDown)
      document.addEventListener('pointerup', handlePointerUp)
      document.addEventListener('pointercancel', handlePointerUp)
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown)
        document.removeEventListener('pointerup', handlePointerUp)
        document.removeEventListener('pointercancel', handlePointerUp)
      }
    }
  }, [isOpen])

  // Close when focus leaves the picker (e.g., user taps another field)
  useEffect(() => {
    const handleFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null
      // If focus is moving to an element inside the picker (e.g., a customer row),
      // keep the dropdown open so the selection click can complete.
      if (next && pickerRef.current && pickerRef.current.contains(next)) return
      // Don't dismiss if the pointer is currently down inside the picker.
      // On mobile, touching the results list to scroll blurs the input and fires
      // focusout with relatedTarget=null. This is not a real "focus left" event.
      if (pointerDownInsideRef.current) return
      setIsOpen(false)
      setSearchQuery('')
    }

    const pickerEl = pickerRef.current
    if (isOpen && pickerEl) {
      pickerEl.addEventListener('focusout', handleFocusOut)
      return () => pickerEl.removeEventListener('focusout', handleFocusOut)
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

  // Reset query and focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      // Small timeout to ensure the input is rendered before focusing on mobile
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus()
          pickerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Calculate available space (respecting the visual viewport, including on-screen keyboard)
  // and determine dropup/dropdown direction and a dynamic max-height for the dropdown.
  useEffect(() => {
    if (!isOpen || !pickerRef.current) return

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

      // Determine direction based on available space, but never shrink below 160px
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

  // Filter customers using existing helper against the reconciled list
  const filteredCustomers = filterLeadsBySearchQuery(mergedCustomers, searchQuery)

  // Selected value is resolved from the reconciled list, which always gives the
  // authoritative prefill priority over stale fetched data for the same ID.
  const selectedCustomer = useMemo(() => {
    return mergedCustomers.find(c => c.id === value)
  }, [value, mergedCustomers])
  const hasValue = value !== null && value !== ''

  const handleSelect = (customerId: string | null) => {
    onChange(customerId)
    const customer = customerId ? mergedCustomers.find(c => c.id === customerId) || null : null
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
    <div className="relative min-w-0" ref={pickerRef}>
      {label && (
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <label
            id={labelId}
            className="text-xs text-muted-foreground font-medium"
          >
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          {onAddCustomerClick && !disabled && (
            <button
              type="button"
              onClick={onAddCustomerClick}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium flex-shrink-0"
            >
              Add customer
            </button>
          )}
        </div>
      )}

      {/* Trigger / search input area */}
      <div className="relative">
        {isOpen ? (
          <div
            className="w-full flex items-center gap-2 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/60 text-left"
          >
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={searchInputRef}
              id={triggerId}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customers..."
              className="flex-1 min-w-0 bg-transparent border-0 p-0 text-base sm:text-sm text-foreground placeholder-muted-foreground focus:outline-none"
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
            className={`w-full bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 flex items-center gap-2 duration-150 text-left pr-[44px] ${
              disabled
                ? 'opacity-50 cursor-not-allowed px-3 py-2.5'
                : 'hover:border-slate-700/80 cursor-pointer px-3 py-2.5'
            }`}
          >
            <span className={selectedCustomer ? 'text-foreground truncate flex-1 min-w-0' : 'text-muted-foreground truncate flex-1 min-w-0'}>
              {getDisplayText(selectedCustomer)}
            </span>
          </button>
        )}

        {/* Dedicated icon slots on the right. The chevron is pointer-events-none
            so clicks pass through to the trigger button. The clear button is
            pointer-events-auto so it keeps its own click target. */}
        {!isOpen && (
          <div
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none"
            aria-hidden={!(hasValue && allowClear && !disabled)}
          >
            {hasValue && allowClear && !disabled && (
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
          className={`absolute z-[60] w-full bg-card/95 backdrop-blur-sm rounded-lg shadow-[0_4px_12px_rgb(0,0,0,0.08),0_2px_6px_rgb(0,0,0,0.05)] border border-border/40 max-h-[300px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 ${
            dropup ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          style={{ maxHeight: maxDropdownHeight }}
          role="listbox"
          aria-label="Customers"
          data-scroll-lock-allow
        >
          {/* Results list */}
          <div
            className="overflow-y-auto flex-1 min-h-0 overscroll-contain touch-pan-y customer-dropdown-scroll pr-1"
            data-scroll-lock-allow
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
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
                    role="option"
                    onClick={() => handleSelect(null)}
                    className={`w-full px-3 py-2 text-sm text-left duration-150 flex items-center justify-between gap-2 ${
                      value === null ? 'bg-accent/40' : 'text-foreground hover:bg-accent/40'
                    }`}
                  >
                    <span className="truncate flex-1 min-w-0 text-muted-foreground">No customer</span>
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
                      role="option"
                      onClick={() => handleSelect(customer.id)}
                      className={`w-full px-3 py-2 text-sm text-left duration-150 flex flex-col gap-0.5 ${
                        value === customer.id ? 'bg-accent/40' : 'text-foreground hover:bg-accent/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate flex-1 min-w-0">{getDisplayText(customer)}</span>
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
