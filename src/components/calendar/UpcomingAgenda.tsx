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

    if (eventDateOnly.getTime() === today.getTime()) {
      groupedEvents.today.push(event)
    } else if (eventDateOnly.getTime() === tomorrow.getTime()) {
      groupedEvents.tomorrow.push(event)
    } else if (eventDateTime >= tomorrow && eventDateTime <= endOfWeek) {
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

  if (upcomingEvents.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-3 sm:p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-2 flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-slate-400" />
          Upcoming Events
        </h3>
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2 sm:pt-3">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-2">No upcoming calendar events found</p>
          {calendarConnected ? (
            <button
              onClick={onRefresh}
              className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.001 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">Connect Google Calendar or create an event to get started.</p>
          )}
        </div>
      </div>
    )
  }

  const renderEventGroup = (title: string, events: CalendarEvent[]) => {
    if (events.length === 0) return null
    return (
      <div key={title} className="mb-3 sm:mb-4">
        <p className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 sm:mb-2">
          {title}
        </p>
        <div className="space-y-1.5 sm:space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="group flex items-start gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              onClick={() => {
                if (event.htmlLink) {
                  window.open(event.htmlLink, '_blank', 'noopener,noreferrer')
                }
              }}
            >
              <div className={`flex-shrink-0 w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full mt-2 sm:mt-2.5 ${
                event.isHoliday 
                  ? 'bg-emerald-500 dark:bg-emerald-400' 
                  : 'bg-blue-500 dark:bg-blue-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-foreground truncate mb-0.5 sm:mb-1">
                  {event.summary}
                </p>
                <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                  {!isAllDay(event.start) && (
                    <span className="flex items-center gap-0.5 sm:gap-1">
                      <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      {formatTime(event.start?.dateTime)}
                    </span>
                  )}
                </div>
              </div>
              {event.htmlLink && (
                <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 flex-shrink-0" />
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
