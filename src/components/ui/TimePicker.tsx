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
        className={`w-full px-3 py-2 border rounded-md flex items-center justify-between gap-2 transition-colors ${
          disabled
            ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed border-border/30'
            : 'bg-card text-foreground border-border/40 hover:border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-border/60 cursor-pointer'
        }`}
      >
        <span className={value ? '' : 'text-muted-foreground'}>
          {value ? formatTimeDisplay(value) : placeholder}
        </span>
        {value && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              clearTime()
            }}
            className="p-1 hover:bg-accent/40 rounded transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        {!value && <Clock className="w-4 h-4 text-muted-foreground" />}
      </button>

      {isOpen && !disabled && (
        <div className="absolute right-0 mt-2 z-[60] bg-popover/95 backdrop-blur-sm rounded-lg shadow-[0_4px_12px_rgb(0,0,0,0.08),0_2px_6px_rgb(0,0,0,0.05)] border border-border/40 w-[min(360px,calc(100vw-2rem))] sm:w-auto sm:max-w-[420px]">
          <div className="p-3">
            <label className="block text-xs font-medium text-muted-foreground mb-2">Select time (24-hour)</label>
            <div className="flex items-stretch gap-2">
              {/* Hour column */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground/70">Hour</span>
                  <span className="text-xs font-mono text-muted-foreground">{draftHour ?? '--'}</span>
                </div>
                <div ref={hourListRef} className="max-h-[220px] overflow-y-auto rounded-md border border-border/30">
                  {hours.map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => { setDraftHour(h); tryCommitTime(h, draftMinute) }}
                      className={`w-full px-3 py-2 text-sm font-mono text-left transition-colors ${
                        draftHour === h
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-accent/40'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center text-muted-foreground/50">:</div>
              {/* Minute column */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground/70">Minute</span>
                  <span className="text-xs font-mono text-muted-foreground">{draftMinute ?? '--'}</span>
                </div>
                <div ref={minuteListRef} className="max-h-[220px] overflow-y-auto rounded-md border border-border/30">
                  {minutes.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setDraftMinute(m); tryCommitTime(draftHour, m) }}
                      className={`w-full px-3 py-2 text-sm font-mono text-left transition-colors ${
                        draftMinute === m
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-accent/40'
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
            <div className="border-t border-border/20 p-2">
              <button
                type="button"
                onClick={clearTime}
                className="w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 rounded-md transition-colors text-left"
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
