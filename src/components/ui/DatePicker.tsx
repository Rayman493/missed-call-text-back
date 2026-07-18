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
        className={`w-full px-3 py-2 border rounded-lg flex items-center justify-between gap-2 transition-colors ${
          disabled
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed border-slate-200 dark:border-slate-700'
            : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground border-slate-200 dark:border-slate-700 hover:border-blue-500/80 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 cursor-pointer'
        }`}
      >
        <span className={value ? '' : 'text-slate-400 dark:text-slate-500'}>
          {value ? formatDateDisplay(value) : placeholder}
        </span>
        {value && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              clearDate()
            }}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
        {!value && <Calendar className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-2 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 w-[360px] max-w-[calc(100vw-2rem)] sm:w-auto sm:max-w-[420px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 sm:p-4 border-b border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => navigateMonth('prev')}
              className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <h3 className="text-base sm:text-sm font-semibold text-slate-900 dark:text-foreground">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <button
              type="button"
              onClick={() => navigateMonth('next')}
              className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 px-4 pt-3 pb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
              <div 
                key={day} 
                className={`text-xs font-semibold text-center py-1.5 ${
                  index === 0 || index === 6
                    ? 'text-slate-400 dark:text-slate-500'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1 px-4 pb-4">
            {days.map((dayInfo, index) => (
              <button
                key={index}
                type="button"
                onClick={() => dayInfo.isCurrentMonth && selectDate(dayInfo.date)}
                disabled={!dayInfo.isCurrentMonth}
                className={`aspect-square min-w-[40px] min-h-[40px] flex items-center justify-center text-sm rounded-lg transition-colors ${
                  !dayInfo.isCurrentMonth
                    ? 'text-slate-300 dark:text-slate-600 cursor-default'
                    : isSelectedDate(dayInfo.date)
                      ? 'bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-600 ring-offset-2'
                      : dayInfo.isToday
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 font-medium'
                        : isWeekend(dayInfo.date)
                          ? 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          : 'text-slate-900 dark:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {dayInfo.day}
              </button>
            ))}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={selectToday}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors px-3 py-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              Today
            </button>
            {!required && (
              <button
                type="button"
                onClick={clearDate}
                className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
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
