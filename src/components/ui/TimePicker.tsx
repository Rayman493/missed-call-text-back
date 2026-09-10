'use client'

import { useId } from 'react'
import { X, Clock } from 'lucide-react'

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
  const inputId = useId()

  const clearTime = (e: React.MouseEvent) => {
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

      {/* Native time input for all platforms - uses native affordance */}
      <div className="relative min-w-0">
        <input
          id={inputId}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          step={60}
          className={`w-full min-w-0 px-3 py-2.5 text-base sm:text-sm leading-5 border rounded-lg duration-150 appearance-none hide-native-picker min-h-11 ${
            disabled
              ? 'bg-muted/50 dark:bg-slate-900/40 text-muted-foreground/50 cursor-not-allowed border-border/30 pr-3'
              : 'bg-muted/30 dark:bg-slate-900/55 text-foreground placeholder:text-muted-foreground border-border/50 dark:border-slate-700/60 hover:border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60'
          } ${value ? 'pr-20' : 'pr-12'}`}
        />
        {!disabled && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-1 pointer-events-none">
            {value ? (
              <button
                type="button"
                onClick={clearTime}
                className="p-1 hover:bg-accent/40 rounded duration-150 pointer-events-auto z-10"
                aria-label="Clear time"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            ) : (
              <Clock className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
