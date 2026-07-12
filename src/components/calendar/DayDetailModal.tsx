'use client'

import { useState } from 'react'
import { X, Calendar, Clock, Plus } from 'lucide-react'

interface DayDetailModalProps {
  isOpen: boolean
  onClose: () => void
  date: Date
  events: Array<{
    id: string
    summary: string
    start: { dateTime?: string; date?: string }
    isHoliday?: boolean
    htmlLink?: string | null
  }>
  onAddEvent?: (date: Date) => void
}

export default function DayDetailModal({ isOpen, onClose, date, events, onAddEvent }: DayDetailModalProps) {
  const [isAdding, setIsAdding] = useState(false)

  if (!isOpen) return null

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (dateTime?: string, date?: string) => {
    if (date) return 'All day'
    if (!dateTime) return ''
    const d = new Date(dateTime)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const openEventLink = (url?: string | null) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleAddEventClick = () => {
    if (isAdding || !onAddEvent) return
    setIsAdding(true)
    onAddEvent(date)
    onClose()
    setIsAdding(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card rounded-2xl border border-border/50 shadow-2xl shadow-black/10 dark:shadow-black/30 w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground tracking-tight">{formatDate(date)}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Events List */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {events.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-sm text-slate-400">No events on this day</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {events.map((event) => (
                <div
                  key={event.id}
                  onClick={() => openEventLink(event.htmlLink)}
                  className="p-3.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 rounded-xl cursor-pointer transition-all duration-200 hover:border-slate-600 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate leading-snug ${event.isHoliday ? 'text-emerald-300' : 'text-white'}`}>
                        {event.summary}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="font-medium">{formatTime(event.start.dateTime, event.start.date)}</span>
                      </div>
                    </div>
                    {event.isHoliday && (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5 shadow-sm shadow-emerald-500/30" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {onAddEvent && (
          <div className="px-5 py-4 border-t border-border/50">
            <button
              onClick={handleAddEventClick}
              disabled={isAdding}
              className="w-full px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" />
              <span>{isAdding ? 'Adding...' : 'Add event'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
