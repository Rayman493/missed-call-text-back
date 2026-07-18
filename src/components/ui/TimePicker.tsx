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
  const hourListRef = useRef<HTMLDivElement>(null)
  const minuteListRef = useRef<HTMLDivElement>(null)
  const [draftHour, setDraftHour] = useState<string | null>(null)
  const [draftMinute, setDraftMinute] = useState<string | null>(null)

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

  // 24-hour hours and minutes
  const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
  const minutes = Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0'))

  // Initialize draft selection when opening
  useEffect(() => {
    if (isOpen) {
      if (value && /^\d{2}:\d{2}$/.test(value)) {
        const [h, m] = value.split(':')
        setDraftHour(h)
        setDraftMinute(m)
      } else {
        setDraftHour(null)
        setDraftMinute(null)
      }
    }
  }, [isOpen, value])

  // Scroll selected hour/minute into view when open
  useEffect(() => {
    if (!isOpen) return
    if (draftHour && hourListRef.current) {
      const idx = hours.indexOf(draftHour)
      const el = hourListRef.current.children[idx] as HTMLElement
      if (el) el.scrollIntoView({ block: 'center' })
    }
    if (draftMinute && minuteListRef.current) {
      const idx = minutes.indexOf(draftMinute)
      const el = minuteListRef.current.children[idx] as HTMLElement
      if (el) el.scrollIntoView({ block: 'center' })
    }
  }, [isOpen, draftHour, draftMinute])

  const formatTimeDisplay = (timeStr: string) => {
    if (!timeStr) return ''
    return timeStr // show 24-hour format within this picker
  }

  const tryCommitTime = (h: string | null, m: string | null) => {
    if (h != null && m != null) {
      onChange(`${h}:${m}`)
      setIsOpen(false)
    }
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
        <div className="absolute z-50 mt-2 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 w-[360px] max-w-[calc(100vw-2rem)] sm:w-auto sm:max-w-[420px]">
          <div className="p-3">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Select time (24-hour)</label>
            <div className="flex items-stretch gap-2">
              {/* Hour column */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">Hour</span>
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{draftHour ?? '--'}</span>
                </div>
                <div ref={hourListRef} className="max-h-[220px] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                  {hours.map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => { setDraftHour(h); tryCommitTime(h, draftMinute) }}
                      className={`w-full px-3 py-2 text-sm font-mono text-left transition-colors ${
                        draftHour === h
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-900 dark:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center text-slate-400">:</div>
              {/* Minute column */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">Minute</span>
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{draftMinute ?? '--'}</span>
                </div>
                <div ref={minuteListRef} className="max-h-[220px] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                  {minutes.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setDraftMinute(m); tryCommitTime(draftHour, m) }}
                      className={`w-full px-3 py-2 text-sm font-mono text-left transition-colors ${
                        draftMinute === m
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-900 dark:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {!required && (
            <div className="border-t border-slate-200 dark:border-slate-700 p-2">
              <button
                type="button"
                onClick={clearTime}
                className="w-full px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors text-left"
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
