'use client'

import { useId } from 'react'
import { X, CalendarDays } from 'lucide-react'

interface DatePickerProps {
  value: string // YYYY-MM-DD format
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  required?: boolean
  disabled?: boolean
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  label,
  required = false,
  disabled = false
}: DatePickerProps) {
  const inputId = useId()

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return ''
    // Parse YYYY-MM-DD as local date to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const selectToday = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    onChange(`${year}-${month}-${day}`)
  }

  const clearDate = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onChange('')
  }

  return (
    <div className="relative">
      {label && (
        <label htmlFor={inputId} className="block text-xs text-muted-foreground font-medium mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Native date input for all platforms - uses native affordance */}
      <div className="relative min-w-0">
        <input
          id={inputId}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full min-w-0 px-3 py-2.5 text-base sm:text-sm leading-5 border rounded-lg duration-150 appearance-none hide-native-picker min-h-11 pr-[44px] ${
            disabled
              ? 'bg-muted/50 dark:bg-slate-900/40 text-muted-foreground/50 cursor-not-allowed border-border/30'
              : 'bg-muted/30 dark:bg-slate-900/55 text-foreground placeholder:text-muted-foreground border-border/50 dark:border-slate-700/60 hover:border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60'
          }`}
        />
        {!disabled && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
            {value ? (
              <button
                type="button"
                onClick={clearDate}
                className="p-1 hover:bg-accent/40 rounded duration-150 pointer-events-auto z-10"
                aria-label="Clear date"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            ) : (
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {!required && (
        <button
          type="button"
          onClick={selectToday}
          className="mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Today
        </button>
      )}
    </div>
  )
}
