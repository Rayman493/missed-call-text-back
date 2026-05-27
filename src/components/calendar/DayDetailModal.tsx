'use client'

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
  onAddEvent?: () => void
}

export default function DayDetailModal({ isOpen, onClose, date, events, onAddEvent }: DayDetailModalProps) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 dark:bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">{formatDate(date)}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Events List */}
        <div className="flex-1 overflow-y-auto p-4">
          {events.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-slate-400">No events on this day</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  onClick={() => openEventLink(event.htmlLink)}
                  className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${event.isHoliday ? 'text-emerald-300' : 'text-white'}`}>
                        {event.summary}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{formatTime(event.start.dateTime, event.start.date)}</span>
                      </div>
                    </div>
                    {event.isHoliday && (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {onAddEvent && (
          <div className="p-4 border-t border-slate-700">
            <button
              onClick={() => {
                onAddEvent()
                onClose()
              }}
              className="w-full px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors active:scale-95 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add event
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
