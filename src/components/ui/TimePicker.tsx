'use client'

import { useState, useRef, useEffect } from 'react'
import { Clock, X } from 'lucide-react'

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
  const [isOpen, setIsOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
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
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  // Generate time options in 15-minute increments from 6:00 AM to 8:00 PM
  const generateTimeOptions = () => {
    const options: { label: string; value: string }[] = []
    
    for (let hour = 6; hour <= 20; hour++) {
      for (let minute of [0, 15, 30, 45]) {
        const hour24 = hour
        const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour)
        const ampm = hour >= 12 ? 'PM' : 'AM'
        const minuteStr = minute === 0 ? '00' : String(minute)
        const value24 = `${String(hour24).padStart(2, '0')}:${minuteStr}`
        const label12 = `${hour12}:${minuteStr} ${ampm}`
        
        options.push({ label: label12, value: value24 })
      }
    }
    
    return options
  }

  const timeOptions = generateTimeOptions()

  // Scroll selected time into view when dropdown opens
  useEffect(() => {
    if (isOpen && dropdownRef.current && value) {
      const selectedIndex = timeOptions.findIndex(option => option.value === value)
      if (selectedIndex >= 0) {
        const selectedElement = dropdownRef.current.children[selectedIndex] as HTMLElement
        if (selectedElement) {
          selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }
    }
  }, [isOpen, value, timeOptions])

  const formatTimeDisplay = (timeStr: string) => {
    if (!timeStr) return ''
    const [hours, minutes] = timeStr.split(':')
    const hour = parseInt(hours, 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  const selectTime = (timeValue: string) => {
    onChange(timeValue)
    setIsOpen(false)
  }

  const clearTime = () => {
    onChange('')
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={pickerRef}>
      {label && (
        <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg flex items-center justify-between gap-2 transition-colors ${
          disabled
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed border-slate-200 dark:border-slate-700'
            : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground border-slate-200 dark:border-slate-700 hover:border-blue-500/80 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 cursor-pointer'
        }`}
      >
        <span className={value ? '' : 'text-slate-400 dark:text-slate-500'}>
          {value ? formatTimeDisplay(value) : placeholder}
        </span>
        {value && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              clearTime()
            }}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
        {!value && <Clock className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-2 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 w-full max-h-[320px] overflow-y-auto">
          <div className="p-1" ref={dropdownRef}>
            {timeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => selectTime(option.value)}
                className={`w-full px-4 py-2.5 text-sm rounded-lg transition-colors text-left ${
                  value === option.value
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-slate-900 dark:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          
          {!required && (
            <div className="border-t border-slate-200 dark:border-slate-700 p-1">
              <button
                type="button"
                onClick={clearTime}
                className="w-full px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-left"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
