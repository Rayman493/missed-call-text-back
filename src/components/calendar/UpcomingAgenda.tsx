'use client'

import React from 'react'
import { Clock, Calendar as CalendarIcon, ExternalLink } from 'lucide-react'

interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  htmlLink?: string | null
  isHoliday?: boolean
}

interface UpcomingAgendaProps {
  events: CalendarEvent[]
  maxEvents?: number
}

export default function UpcomingAgenda({ events, maxEvents = 5 }: UpcomingAgendaProps) {
  // Get current date and filter for upcoming events
  const now = new Date()
  const upcomingEvents = events
    .filter(event => {
      const eventDate = event.start?.dateTime || event.start?.date
      if (!eventDate) return false
      const eventDateTime = new Date(eventDate)
      return eventDateTime >= now
    })
    .sort((a, b) => {
      const dateA = new Date(a.start?.dateTime || a.start?.date || 0)
      const dateB = new Date(b.start?.dateTime || b.start?.date || 0)
      return dateA.getTime() - dateB.getTime()
    })
    .slice(0, maxEvents)

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Check if it's today
    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    }
    // Check if it's tomorrow
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow'
    }
    // Otherwise show date
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatTime = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const isAllDay = (start: { dateTime?: string; date?: string }) => {
    return !!start.date
  }

  if (upcomingEvents.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-2 flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-slate-400" />
          Upcoming Events
        </h3>
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">No upcoming events scheduled</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-3 flex items-center gap-2">
        <CalendarIcon className="w-4 h-4 text-slate-400" />
        Upcoming Events
      </h3>
      <div className="space-y-3">
        {upcomingEvents.map((event) => (
          <div
            key={event.id}
            className="group flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
            onClick={() => {
              if (event.htmlLink) {
                window.open(event.htmlLink, '_blank', 'noopener,noreferrer')
              }
            }}
          >
            <div className={`flex-shrink-0 w-1 h-1.5 rounded-full mt-2 ${
              event.isHoliday 
                ? 'bg-emerald-500 dark:bg-emerald-400' 
                : 'bg-blue-500 dark:bg-blue-400'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-foreground truncate">
                {event.summary}
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium">{formatDate(event.start?.dateTime || event.start?.date)}</span>
                {!isAllDay(event.start) && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatTime(event.start?.dateTime)}
                    </span>
                  </>
                )}
              </div>
            </div>
            {event.htmlLink && (
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
