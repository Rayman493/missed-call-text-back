'use client'

import { Calendar, X } from 'lucide-react'

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

  const clearDate = () => {
    onChange('')
  }

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Native date input for all platforms */}
      <div className="relative">
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          className={`w-full px-3 py-2 border rounded-lg transition-colors pr-10 ${
            disabled
              ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed border-border/30'
              : 'bg-card text-foreground border-border/40 hover:border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-border/60'
          }`}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={clearDate}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-accent/40 rounded transition-colors"
            aria-label="Clear date"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        {!value && !disabled && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Calendar className="w-4 h-4 text-muted-foreground" />
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