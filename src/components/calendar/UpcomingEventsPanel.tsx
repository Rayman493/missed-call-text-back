import { Clock, MapPin, ExternalLink, Calendar as CalendarIcon } from 'lucide-react'

interface CalendarEvent {
  id: string
  summary: string
  description: string | null
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location: string | null
  htmlLink: string | null
}

interface UpcomingEventsPanelProps {
  events: CalendarEvent[]
  isLoading: boolean
}

export default function UpcomingEventsPanel({ events, isLoading }: UpcomingEventsPanelProps) {
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const isAllDay = (start: { dateTime?: string; date?: string }) => {
    return !!start.date
  }

  const groupEventsByTime = (events: CalendarEvent[]) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const endOfWeek = new Date(today)
    endOfWeek.setDate(endOfWeek.getDate() + 7)

    const groups = {
      today: [] as CalendarEvent[],
      tomorrow: [] as CalendarEvent[],
      thisWeek: [] as CalendarEvent[],
      later: [] as CalendarEvent[]
    }

    events.forEach(event => {
      const eventDate = event.start.dateTime || event.start.date
      if (!eventDate) return
      
      const date = new Date(eventDate)
      date.setHours(0, 0, 0, 0)

      if (date.getTime() === today.getTime()) {
        groups.today.push(event)
      } else if (date.getTime() === tomorrow.getTime()) {
        groups.tomorrow.push(event)
      } else if (date.getTime() <= endOfWeek.getTime()) {
        groups.thisWeek.push(event)
      } else {
        groups.later.push(event)
      }
    })

    return groups
  }

  const groupedEvents = groupEventsByTime(events)

  const renderEventGroup = (title: string, events: CalendarEvent[], icon?: React.ReactNode) => {
    if (events.length === 0) return null

    return (
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
          {icon}
          {title}
        </h3>
        <div className="space-y-2">
          {events.map(event => (
            <div
              key={event.id}
              className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-foreground mb-1 truncate">
                    {event.summary}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>
                        {isAllDay(event.start) ? 'All day' : formatDate(event.start.dateTime)}
                      </span>
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}
                  </div>
                </div>
                {event.htmlLink && (
                  <a
                    href={event.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-6 h-fit">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-4">
        Upcoming
      </h2>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-8">
          <CalendarIcon className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-muted-foreground">
            No upcoming appointments
          </p>
        </div>
      ) : (
        <>
          {renderEventGroup('Today', groupedEvents.today)}
          {renderEventGroup('Tomorrow', groupedEvents.tomorrow)}
          {renderEventGroup('This Week', groupedEvents.thisWeek)}
          {renderEventGroup('Later', groupedEvents.later)}
        </>
      )}
    </div>
  )
}
