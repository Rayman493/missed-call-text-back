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
  onRefresh?: () => void
  calendarConnected?: boolean
}

export default function UpcomingAgenda({ events, maxEvents = 5, onRefresh, calendarConnected }: UpcomingAgendaProps) {
  // Get current date and filter for upcoming events
  const now = new Date()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  
  const endOfWeek = new Date(today)
  endOfWeek.setDate(endOfWeek.getDate() + 6)
  endOfWeek.setHours(23, 59, 59, 999)

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

  // Group events by date category
  const groupedEvents = {
    today: [] as CalendarEvent[],
    tomorrow: [] as CalendarEvent[],
    thisWeek: [] as CalendarEvent[],
    later: [] as CalendarEvent[]
  }

  upcomingEvents.forEach(event => {
    const eventDate = event.start?.dateTime || event.start?.date
    if (!eventDate) return
    const eventDateTime = new Date(eventDate)
    const eventDateOnly = new Date(eventDateTime)
    eventDateOnly.setHours(0, 0, 0, 0)

    // Use local date string comparison to avoid timezone issues around midnight
    if (eventDateOnly.toDateString() === today.toDateString()) {
      groupedEvents.today.push(event)
    } else if (eventDateOnly.toDateString() === tomorrow.toDateString()) {
      groupedEvents.tomorrow.push(event)
    } else if (eventDateOnly >= tomorrow && eventDateOnly <= endOfWeek) {
      groupedEvents.thisWeek.push(event)
    } else {
      groupedEvents.later.push(event)
    }
  })

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)

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

  const isMultiDay = (event: CalendarEvent) => {
    const startDate = event.start?.dateTime || event.start?.date
    const endDate = event.end?.dateTime || event.end?.date
    if (!startDate || !endDate) return false
    
    const start = new Date(startDate)
    const end = new Date(endDate)
    
    // For all-day events, Google Calendar uses exclusive end dates
    const isAllDayEvent = !event.start?.dateTime && !!event.start?.date
    const effectiveEnd = isAllDayEvent ? new Date(end.getTime() - 86400000) : end
    
    return start.toDateString() !== effectiveEnd.toDateString()
  }

  const formatEventDateRange = (event: CalendarEvent) => {
    const startDate = event.start?.dateTime || event.start?.date
    const endDate = event.end?.dateTime || event.end?.date
    if (!startDate || !endDate) return formatDate(startDate)

    const start = new Date(startDate)
    const end = new Date(endDate)
    
    // For all-day events, Google Calendar uses exclusive end dates
    const isAllDayEvent = !event.start?.dateTime && !!event.start?.date
    const effectiveEnd = isAllDayEvent ? new Date(end.getTime() - 86400000) : end

    // If it's a single-day event, just show the date
    if (start.toDateString() === effectiveEnd.toDateString()) {
      return formatDate(startDate)
    }

    // For multi-day events, show the full range
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const endStr = effectiveEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${startStr} - ${endStr}`
  }

  if (upcomingEvents.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-3 sm:p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-2 flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-slate-400" />
          Upcoming Events
        </h3>
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2 sm:pt-3">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-2">No appointments scheduled.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Appointments you create or sync from Google Calendar will appear here.</p>
        </div>
      </div>
    )
  }

  const renderEventGroup = (title: string, events: CalendarEvent[]) => {
    if (events.length === 0) return null
    return (
      <div key={title} className="mb-4">
        <p className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
          {title}
        </p>
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className={`group flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer border ${
                event.isHoliday
                  ? 'bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800 hover:shadow-md'
                  : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-md'
              }`}
              onClick={() => {
                if (event.htmlLink) {
                  window.open(event.htmlLink, '_blank', 'noopener,noreferrer')
                }
              }}
            >
              <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                event.isHoliday 
                  ? 'bg-emerald-500 dark:bg-emerald-400 ring-4 ring-emerald-100 dark:ring-emerald-900/30' 
                  : 'bg-blue-500 dark:bg-blue-400 ring-4 ring-blue-100 dark:ring-blue-900/30'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-foreground truncate mb-1">
                  {event.summary}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {isMultiDay(event) ? (
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon className="w-3 h-3" />
                      {formatEventDateRange(event)}
                    </span>
                  ) : !isAllDay(event.start) ? (
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {formatTime(event.start?.dateTime)} – {formatTime(event.end?.dateTime)}
                    </span>
                  ) : null}
                  {event.isHoliday && (
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <CalendarIcon className="w-3 h-3" />
                      Holiday
                    </span>
                  )}
                </div>
              </div>
              {event.htmlLink && (
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 flex-shrink-0 mt-1" />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-3 sm:p-4 md:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-xs sm:text-sm md:text-base font-semibold text-slate-900 dark:text-foreground flex items-center gap-2">
          <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
          Upcoming Events
        </h3>
        {calendarConnected && onRefresh && (
          <button
            onClick={onRefresh}
            className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1 sm:gap-1.5 transition-colors"
          >
            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0 a8.003 8.001 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        )}
      </div>
      {renderEventGroup('Today', groupedEvents.today)}
      {renderEventGroup('Tomorrow', groupedEvents.tomorrow)}
      {renderEventGroup('This Week', groupedEvents.thisWeek)}
      {renderEventGroup('Later', groupedEvents.later)}
    </div>
  )
}
