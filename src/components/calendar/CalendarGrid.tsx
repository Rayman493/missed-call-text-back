import CalendarDayCell from './CalendarDayCell'
import { ReactNode } from 'react'

interface CalendarGridProps {
  month: Date
  events: Array<{
    id: string
    summary: string
    start: { dateTime?: string; date?: string }
  }>
  renderEvent: (event: any, day: Date) => ReactNode
}

export default function CalendarGrid({ month, events, renderEvent }: CalendarGridProps) {
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
    
    return events.filter(event => {
      const eventDate = event.start.dateTime || event.start.date
      if (!eventDate) return false
      const date = new Date(eventDate)
      return date.getDate() === dayNumber && 
             date.getMonth() === monthIndex && 
             date.getFullYear() === year
    }).slice(0, 2)
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
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
      </div>
      
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 text-center py-2">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((dayInfo, index) => {
          const dayEvents = getEventsForDay(dayInfo.day, dayInfo.isCurrentMonth)
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
  )
}
