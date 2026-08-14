'use client'

import { X } from 'lucide-react'

interface TimePickerProps {
  value: string // HH:MM format (24-hour)
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  required?: boolean
  disabled?: boolean
}

export default function TimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  label,
  required = false,
  disabled = false
}: TimePickerProps) {
  const clearTime = () => {
    onChange('')
  }

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Native time input for all platforms */}
      <div className="relative">
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          step={60}
          className={`w-full px-3 py-2 border rounded-lg transition-colors pr-10 ${
            disabled
              ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed border-border/30'
              : 'bg-card text-foreground border-border/40 hover:border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-border/60'
          }`}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={clearTime}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-accent/40 rounded transition-colors"
            aria-label="Clear time"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  )
}