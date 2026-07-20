'use client'

import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

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
  const [isOpen, setIsOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const pickerRef = useRef<HTMLDivElement>(null)

  // Initialize currentMonth from value when value changes
  useEffect(() => {
    if (value) {
      // Parse YYYY-MM-DD as local date to avoid timezone shifts
      const [year, month, day] = value.split('-').map(Number)
      const date = new Date(year, month - 1, day)
      setCurrentMonth(date)
    }
  }, [value])

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

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return ''
    // Parse YYYY-MM-DD as local date to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay() // 0 = Sunday

    const days = []

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        day: prevMonthLastDay - i,
        isCurrentMonth: false,
        isToday: false,
        date: new Date(year, month - 1, prevMonthLastDay - i)
      })
    }

    // Current month days
    const today = new Date()
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month, day)
      const isToday = currentDate.toDateString() === today.toDateString()
      days.push({
        day,
        isCurrentMonth: true,
        isToday,
        date: currentDate
      })
    }

    // Next month days
    const remainingDays = 42 - days.length
    for (let day = 1; day <= remainingDays; day++) {
      days.push({
        day,
        isCurrentMonth: false,
        isToday: false,
        date: new Date(year, month + 1, day)
      })
    }

    return days
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1)
      } else {
        newDate.setMonth(newDate.getMonth() + 1)
      }
      return newDate
    })
  }

  const selectDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    onChange(`${year}-${month}-${day}`)
    setIsOpen(false)
  }

  const selectToday = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    onChange(`${year}-${month}-${day}`)
    setIsOpen(false)
  }

  const clearDate = () => {
    onChange('')
    setIsOpen(false)
  }

  const isSelectedDate = (date: Date) => {
    if (!value) return false
    // Parse YYYY-MM-DD as local date to avoid timezone shifts
    const [year, month, day] = value.split('-').map(Number)
    const selected = new Date(year, month - 1, day)
    return date.toDateString() === selected.toDateString()
  }

  const isWeekend = (date: Date) => {
    const dayOfWeek = date.getDay()
    return dayOfWeek === 0 || dayOfWeek === 6 // Sunday or Saturday
  }

  const days = getDaysInMonth(currentMonth)

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
        className={`w-full px-3 py-2 border rounded-md flex items-center justify-between gap-2 transition-colors ${
          disabled
            ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed border-border/30'
            : 'bg-card text-foreground border-border/40 hover:border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-border/60 cursor-pointer'
        }`}
      >
        <span className={value ? '' : 'text-muted-foreground'}>
          {value ? formatDateDisplay(value) : placeholder}
        </span>
        {value && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              clearDate()
            }}
            className="p-1 hover:bg-accent/40 rounded transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        {!value && <Calendar className="w-4 h-4 text-muted-foreground" />}
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-[60] mt-2 bg-popover/95 backdrop-blur-sm rounded-lg shadow-[0_4px_12px_rgb(0,0,0,0.08),0_2px_6px_rgb(0,0,0,0.05)] border border-border/40 w-[360px] max-w-[calc(100vw-2rem)] sm:w-[400px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 border-b border-border/20">
            <button
              type="button"
              onClick={() => navigateMonth('prev')}
              className="p-2.5 hover:bg-accent/40 rounded-md transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <h3 className="text-base sm:text-sm font-semibold text-foreground">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <button
              type="button"
              onClick={() => navigateMonth('next')}
              className="p-2.5 hover:bg-accent/40 rounded-md transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 px-4 sm:px-5 pt-3 pb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
              <div 
                key={day} 
                className={`text-xs font-semibold text-center py-1.5 ${
                  index === 0 || index === 6
                    ? 'text-muted-foreground/60'
                    : 'text-muted-foreground/80'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1 px-4 sm:px-5 pb-4">
            {days.map((dayInfo, index) => (
              <button
                key={index}
                type="button"
                onClick={() => dayInfo.isCurrentMonth && selectDate(dayInfo.date)}
                disabled={!dayInfo.isCurrentMonth}
                className={`aspect-square min-w-[40px] min-h-[40px] flex items-center justify-center text-sm rounded-md transition-colors ${
                  !dayInfo.isCurrentMonth
                    ? 'text-muted-foreground/30 cursor-default'
                    : isSelectedDate(dayInfo.date)
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : dayInfo.isToday
                        ? 'bg-accent/40 text-foreground hover:bg-accent/60 font-medium'
                        : isWeekend(dayInfo.date)
                          ? 'text-muted-foreground/70 hover:bg-accent/30'
                          : 'text-foreground hover:bg-accent/30'
                }`}
              >
                {dayInfo.day}
              </button>
            ))}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-t border-border/20">
            <button
              type="button"
              onClick={selectToday}
              className="text-sm font-medium text-foreground hover:text-foreground/80 transition-colors px-3 py-1.5 rounded-md hover:bg-accent/40"
            >
              Today
            </button>
            {!required && (
              <button
                type="button"
                onClick={clearDate}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-accent/40"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
