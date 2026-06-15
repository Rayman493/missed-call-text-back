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
  renderEvent: (event: any, day: Date) => ReactNode
  onPreviousMonth?: () => void
  onNextMonth?: () => void
  onToday?: () => void
  onAddEvent?: () => void
  onDayClick?: (day: number, isCurrentMonth: boolean) => void
}

export default function CalendarGrid({ 
  month, 
  events, 
  renderEvent,
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
    if (!isCurrentMonth) return { events: [], overflowCount: 0 }
    
    // Create day key for comparison (YYYY-MM-DD)
    const dayKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
    
    const allMatchedEvents = events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      
      // Normalize event start date to YYYY-MM-DD string
      const eventStartDayKey = eventDateRaw.includes('T')
        ? eventDateRaw.split('T')[0]
        : eventDateRaw
      
      // Check if event has an end date (for multi-day events)
      const eventEndRaw = event.end?.dateTime || event.end?.date
      if (eventEndRaw) {
        // Normalize event end date to YYYY-MM-DD string
        const eventEndDayKey = eventEndRaw.includes('T')
          ? eventEndRaw.split('T')[0]
          : eventEndRaw
        
        // For all-day events, Google Calendar uses exclusive end dates
        // Example: June 19-23 comes as start.date = 2026-06-19, end.date = 2026-06-24
        // For timed events, the end date is inclusive
        const isAllDay = !event.start?.dateTime && !!event.start?.date
        const effectiveEndDate = isAllDay 
          ? new Date(eventEndDayKey).getTime() - 86400000 // Subtract 1 day for exclusive end
          : new Date(eventEndDayKey).getTime()
        
        const dayTimestamp = new Date(dayKey).getTime()
        const startTimestamp = new Date(eventStartDayKey).getTime()
        
        // Check if current day falls within the event's date range
        return dayTimestamp >= startTimestamp && dayTimestamp <= effectiveEndDate
      }
      
      // Single-day event: check if start date matches
      return eventStartDayKey === dayKey
    })
    
    // Limit visible events based on screen size
    // Uses SSR-safe state instead of render-time window access
    const visibleEvents = allMatchedEvents.slice(0, maxVisible)
    const overflowCount = Math.max(0, allMatchedEvents.length - maxVisible)
    
    return { events: visibleEvents, overflowCount }
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
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm">
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-t-xl p-1 sm:p-2 md:p-4 md:p-6 border-b border-slate-200/70 dark:border-slate-700/50">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onPreviousMonth}
            className="w-5 h-5 sm:w-8 sm:h-8 md:w-9 md:h-9 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors active:scale-95"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-3 h-3 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <h2 className="text-xs sm:text-xl md:text-2xl font-semibold text-slate-900 dark:text-foreground">
            {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            onClick={onNextMonth}
            className="w-5 h-5 sm:w-8 sm:h-8 md:w-9 md:h-9 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors active:scale-95"
            aria-label="Next month"
          >
            <ChevronRight className="w-3 h-3 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <div className="flex items-center gap-2 ml-auto">
            {onToday && (
              <button
                onClick={onToday}
                className="px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs md:text-sm font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full transition-colors active:scale-95 hidden sm:block"
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-2 sm:p-3 md:p-4 pt-0 sm:pt-0 md:pt-0">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-2 mb-1 sm:mb-1.5 md:mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-[10px] sm:text-[11px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 text-center py-2 sm:py-2.5 md:py-3">
              {day}
            </div>
          ))}
        </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-2">
        {days.map((dayInfo, index) => {
          const { events: dayEvents, overflowCount } = getEventsForDay(dayInfo.day, dayInfo.isCurrentMonth)
          const dayDate = dayInfo.isCurrentMonth ? new Date(year, monthIndex, dayInfo.day) : null
          
          return (
            <CalendarDayCell
              key={index}
              day={dayInfo.day}
              isCurrentMonth={dayInfo.isCurrentMonth}
              isToday={dayInfo.isToday}
              events={
                dayEvents.length > 0 ? (
                  <>
                    {dayEvents.map((event: any) => renderEvent(event, dayDate!))}
                  </>
                ) : null
              }
              overflowCount={overflowCount}
              onClick={() => onDayClick?.(dayInfo.day, dayInfo.isCurrentMonth)}
            />
          )
        })}
      </div>
      </div>
    </div>
  )
}
