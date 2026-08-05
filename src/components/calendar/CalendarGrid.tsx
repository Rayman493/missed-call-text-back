import CalendarDayCell from './CalendarDayCell'
import { ReactNode, useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

interface CalendarGridProps {
  month: Date
  events: Array<{
    id: string
    summary: string
    start: { dateTime?: string; date?: string }
    end?: { dateTime?: string; date?: string }
  }>
  jobs?: Array<{
    id: string
    title: string
    customer_name: string | null
    scheduled_date: string | null
    scheduled_time: string | null
    status: string
    google_calendar_event_id: string | null
    lead_id: string | null
  }>
  selectedDay?: Date | null
  renderEvent?: (event: any, day: Date) => ReactNode
  renderExtraContent?: (date: Date) => ReactNode
  onPreviousMonth?: () => void
  onNextMonth?: () => void
  onToday?: () => void
  onAddEvent?: () => void
  onDayClick?: (day: number, isCurrentMonth: boolean) => void
}

export default function CalendarGrid({
  month,
  events,
  jobs = [],
  selectedDay,
  renderEvent,
  renderExtraContent,
  onPreviousMonth,
  onNextMonth,
  onToday,
  onAddEvent,
  onDayClick
}: CalendarGridProps) {
  // SSR-safe screen size detection
  // Default to 2 (desktop) during SSR to avoid hydration mismatch
  // Update to 1 (mobile) after mount if screen width < 768px
  const [maxVisible, setMaxVisible] = useState(2)

  useEffect(() => {
    // Only run on client after mount
    const updateMaxVisible = () => {
      setMaxVisible(window.innerWidth < 768 ? 1 : 2)
    }

    // Set initial value
    updateMaxVisible()

    // Update on resize
    window.addEventListener('resize', updateMaxVisible)
    return () => window.removeEventListener('resize', updateMaxVisible)
  }, [])

  // Ensure we're working with local time by reconstructing the date
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  
  // Use local-safe date construction
  const firstDayOfMonth = new Date(year, monthIndex, 1)
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startDayOfWeek = firstDayOfMonth.getDay() // Sunday = 0, Monday = 1, etc.
  
  const today = new Date()
  const isCurrentMonth = today.getMonth() === monthIndex && today.getFullYear() === year

  const days = []
  
  // Calculate previous month days
  const prevMonthLastDay = new Date(year, monthIndex, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({
      day: prevMonthLastDay - i,
      isCurrentMonth: false,
      isToday: false
    })
  }
  
  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = isCurrentMonth && day === today.getDate()
    days.push({
      day,
      isCurrentMonth: true,
      isToday
    })
  }
  
  // Next month days to fill the grid
  const remainingDays = 42 - days.length
  for (let day = 1; day <= remainingDays; day++) {
    days.push({
      day,
      isCurrentMonth: false,
      isToday: false
    })
  }

  const getEventsForDay = (dayNumber: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return []

    // Create day key for comparison (YYYY-MM-DD)
    const dayKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`

    const dayEvents: Array<{
      id: string
      summary: string
      type: 'appointment' | 'job'
      customer?: string
      time?: string
      status?: string
    }> = []

    // Add calendar events (appointments)
    events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false

      const eventStartDayKey = eventDateRaw.includes('T')
        ? eventDateRaw.split('T')[0]
        : eventDateRaw

      const eventEndRaw = event.end?.dateTime || event.end?.date
      if (eventEndRaw) {
        const eventEndDayKey = eventEndRaw.includes('T')
          ? eventEndRaw.split('T')[0]
          : eventEndRaw

        const isAllDay = !event.start?.dateTime && !!event.start?.date
        const effectiveEndDate = isAllDay
          ? new Date(eventEndDayKey).getTime() - 86400000
          : new Date(eventEndDayKey).getTime()

        const dayTimestamp = new Date(dayKey).getTime()
        const startTimestamp = new Date(eventStartDayKey).getTime()

        return dayTimestamp >= startTimestamp && dayTimestamp <= effectiveEndDate
      }

      return eventStartDayKey === dayKey
    }).forEach(event => {
      const time = event.start.dateTime
        ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : undefined

      dayEvents.push({
        id: event.id,
        summary: event.summary,
        type: 'appointment',
        time
      })
    })

    // Add jobs (excluding those linked to calendar events)
    jobs.filter(job => {
      if (job.scheduled_date !== dayKey) return false
      if (job.status === 'cancelled') return false
      // Deduplicate: exclude jobs linked to calendar events
      const isLinkedToEvent = events.some(e => e.id === job.google_calendar_event_id)
      return !isLinkedToEvent
    }).forEach(job => {
      dayEvents.push({
        id: job.id,
        summary: job.title,
        type: 'job',
        customer: job.customer_name || undefined,
        time: job.scheduled_time || undefined,
        status: job.status.replace('_', ' ')
      })
    })

    // Sort by time
    return dayEvents.sort((a, b) => {
      if (!a.time && !b.time) return 0
      if (!a.time) return 1
      if (!b.time) return -1
      return a.time.localeCompare(b.time)
    })
  }

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  return (
    <div className="w-full bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm overflow-hidden overflow-x-hidden">
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900/60 backdrop-blur-sm p-1.5 sm:p-3 md:p-4 border-b border-slate-200/70 dark:border-slate-700/50">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onPreviousMonth}
            className="min-w-[44px] min-h-[44px] w-10 h-10 md:w-11 md:h-11 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors active:scale-95"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <h2 className="text-sm sm:text-xl md:text-2xl font-semibold text-slate-900 dark:text-foreground truncate">
            {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            onClick={onNextMonth}
            className="min-w-[44px] min-h-[44px] w-10 h-10 md:w-11 md:h-11 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors active:scale-95"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <div className="flex items-center gap-2 ml-auto">
            {onToday && (
              <button
                onClick={onToday}
                className="min-h-[44px] px-3 py-2 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs md:text-sm font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full transition-colors active:scale-95 hidden sm:block"
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-1.5 sm:p-3 md:p-4 pt-0">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-2 mb-1 md:mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-[10px] sm:text-[11px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 text-center py-1 md:py-2.5 truncate">
              {day}
            </div>
          ))}
        </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-2">
        {days.map((dayInfo, index) => {
          const dayEvents = getEventsForDay(dayInfo.day, dayInfo.isCurrentMonth)
          const dayDate = dayInfo.isCurrentMonth ? new Date(year, monthIndex, dayInfo.day) : null

          // Calculate if this is a weekend (Saturday or Sunday)
          // Grid starts with Sunday (index 0), so:
          // Sunday: index % 7 === 0
          // Saturday: index % 7 === 6
          const isWeekend = index % 7 === 0 || index % 7 === 6

          // Check if this day is selected
          const isSelected = selectedDay && dayDate
            ? dayDate.toDateString() === selectedDay.toDateString()
            : false

          return (
            <CalendarDayCell
              key={index}
              day={dayInfo.day}
              isCurrentMonth={dayInfo.isCurrentMonth}
              isToday={dayInfo.isToday}
              isSelected={isSelected}
              isWeekend={isWeekend}
              events={dayEvents}
              onClick={() => onDayClick?.(dayInfo.day, dayInfo.isCurrentMonth)}
            />
          )
        })}
      </div>
      </div>
    </div>
  )
}
