import CalendarDayCell from './CalendarDayCell'
import { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CalendarGridProps {
  month: Date
  events: Array<{
    id: string
    summary: string
    start: { dateTime?: string; date?: string }
  }>
  renderEvent: (event: any, day: Date) => ReactNode
  onPreviousMonth?: () => void
  onNextMonth?: () => void
  onToday?: () => void
}

export default function CalendarGrid({ 
  month, 
  events, 
  renderEvent,
  onPreviousMonth,
  onNextMonth,
  onToday
}: CalendarGridProps) {
  console.log('[GRID EVENTS RECEIVED]', events.length, events.slice(0, 5))
  
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  
  const firstDayOfMonth = new Date(year, monthIndex, 1)
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startDayOfWeek = firstDayOfMonth.getDay()
  
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
    
    const matchedEvents = events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      
      // Normalize event date to YYYY-MM-DD string
      const eventDayKey = eventDateRaw.includes('T')
        ? eventDateRaw.split('T')[0]
        : eventDateRaw
      
      return eventDayKey === dayKey
    }).slice(0, 2)
    
    console.log('[CALENDAR GRID DEBUG]', {
      dayKey,
      matchedEventsCount: matchedEvents.length,
      sampleEvents: matchedEvents.slice(0, 2).map(e => ({ id: e.id, summary: e.summary, start: e.start }))
    })
    
    return matchedEvents
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
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-t-xl p-2 sm:p-3 md:p-4 md:p-6 border-b border-slate-200/70 dark:border-slate-700/50">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onPreviousMonth}
            className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors active:scale-95"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <h2 className="text-base sm:text-xl md:text-2xl font-semibold text-slate-900 dark:text-foreground">
            {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            onClick={onNextMonth}
            className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors active:scale-95"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-400" />
          </button>
          {onToday && (
            <button
              onClick={onToday}
              className="px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs md:text-sm font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full transition-colors active:scale-95 ml-auto"
            >
              Today
            </button>
          )}
        </div>
      </div>
      
      <div className="p-1.5 sm:p-2 md:p-3 md:p-4 pt-0 sm:pt-0 md:pt-0">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-2 mb-0.5 sm:mb-1 md:mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-[9px] sm:text-[10px] md:text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 text-center py-0.5 sm:py-1 md:py-2">
              {day}
            </div>
          ))}
        </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-2">
        {days.map((dayInfo, index) => {
          const dayEvents = getEventsForDay(dayInfo.day, dayInfo.isCurrentMonth)
          const dayDate = dayInfo.isCurrentMonth ? new Date(year, monthIndex, dayInfo.day) : null
          
          if (dayEvents.length > 0) {
            console.log('[DAY CELL EVENTS]', dayInfo.day, dayInfo.isCurrentMonth, dayEvents.length, dayEvents)
          }
          
          return (
            <CalendarDayCell
              key={index}
              day={dayInfo.day}
              isCurrentMonth={dayInfo.isCurrentMonth}
              isToday={dayInfo.isToday}
              events={
                dayEvents.length > 0 ? (
                  <>
                    {dayEvents.map(event => renderEvent(event, dayDate!))}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 pl-1">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </>
                ) : null
              }
            />
          )
        })}
      </div>
      </div>
    </div>
  )
}
