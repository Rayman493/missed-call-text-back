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

interface MultiDayEvent {
  id: string
  summary: string
  start: Date
  end: Date
  isAllDay: boolean
  originalEvent: any
}

interface MultiDaySegment {
  event: MultiDayEvent
  startDay: Date
  endDay: Date
  startColumn: number
  spanDays: number
  lane: number
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
      isToday: false,
      date: new Date(year, monthIndex - 1, prevMonthLastDay - i)
    })
  }
  
  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = isCurrentMonth && day === today.getDate()
    days.push({
      day,
      isCurrentMonth: true,
      isToday,
      date: new Date(year, monthIndex, day)
    })
  }
  
  // Next month days to fill the grid
  const remainingDays = 42 - days.length
  for (let day = 1; day <= remainingDays; day++) {
    days.push({
      day,
      isCurrentMonth: false,
      isToday: false,
      date: new Date(year, monthIndex + 1, day)
    })
  }

  // Group days into week rows (6 rows of 7 days)
  const weekRows: Array<Array<{
    day: number
    isCurrentMonth: boolean
    isToday: boolean
    date: Date
  }>> = []
  for (let i = 0; i < 6; i++) {
    const startIdx = i * 7
    const endIdx = startIdx + 7
    weekRows.push(days.slice(startIdx, endIdx))
  }

  // Helper function to check if an event is multi-day
  const isMultiDayEvent = (event: any): boolean => {
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

  // Helper function to get effective end date (handling exclusive end dates)
  const getEffectiveEndDate = (event: any): Date => {
    const endDate = event.end?.dateTime || event.end?.date
    if (!endDate) return new Date(event.start?.dateTime || event.start?.date)
    
    const end = new Date(endDate)
    const isAllDayEvent = !event.start?.dateTime && !!event.start?.date
    return isAllDayEvent ? new Date(end.getTime() - 86400000) : end
  }

  // Separate events into single-day and multi-day categories
  const { singleDayEvents, multiDayEvents } = (() => {
    const singleDay: any[] = []
    const multiDay: MultiDayEvent[] = []
    
    events.forEach(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return
      
      if (isMultiDayEvent(event)) {
        const startDate = new Date(eventDateRaw)
        const endDate = getEffectiveEndDate(event)
        const isAllDay = !event.start?.dateTime && !!event.start?.date
        
        multiDay.push({
          id: event.id,
          summary: event.summary,
          start: startDate,
          end: endDate,
          isAllDay,
          originalEvent: event
        })
      } else {
        singleDay.push(event)
      }
    })
    
    return { singleDayEvents: singleDay, multiDayEvents: multiDay }
  })()

  // Calculate multi-day event segments per week row
  const calculateMultiDaySegments = (): Map<number, MultiDaySegment[]> => {
    const segmentsByWeek = new Map<number, MultiDaySegment[]>()
    
    // Initialize segments for each week row
    for (let i = 0; i < 6; i++) {
      segmentsByWeek.set(i, [])
    }
    
    multiDayEvents.forEach(event => {
      // Calculate which week rows this event appears in
      weekRows.forEach((week, weekIndex) => {
        const weekStart = week[0].date
        const weekEnd = week[6].date
        
        // Check if event overlaps with this week
        const eventStart = event.start.getTime()
        const eventEnd = event.end.getTime()
        const weekStartTime = weekStart.getTime()
        const weekEndTime = weekEnd.getTime()
        
        if (eventStart <= weekEndTime && eventEnd >= weekStartTime) {
          // Calculate segment within this week
          const segmentStart = new Date(Math.max(eventStart, weekStartTime))
          const segmentEnd = new Date(Math.min(eventEnd, weekEndTime))
          
          // Calculate which columns this segment spans
          const startColumn = week.findIndex(day => 
            day.date.toDateString() === segmentStart.toDateString()
          )
          const endColumn = week.findIndex(day => 
            day.date.toDateString() === segmentEnd.toDateString()
          )
          const spanDays = endColumn - startColumn + 1
          
          segmentsByWeek.get(weekIndex)?.push({
            event,
            startDay: segmentStart,
            endDay: segmentEnd,
            startColumn,
            spanDays,
            lane: 0 // Will be assigned later
          })
        }
      })
    })
    
    // Assign lanes to segments to avoid overlaps
    segmentsByWeek.forEach((segments, weekIndex) => {
      // Sort segments by start column
      segments.sort((a, b) => a.startColumn - b.startColumn)
      
      // Assign lanes
      const lanes: Array<{ start: number; end: number }[]> = []
      
      segments.forEach(segment => {
        let assignedLane = -1
        
        // Find the first available lane
        for (let i = 0; i < lanes.length; i++) {
          const lane = lanes[i]
          let canUseLane = true
          
          // Check if this segment overlaps with any segment in this lane
          for (const laneSegment of lane) {
            if (segment.startColumn <= laneSegment.end && segment.startColumn + segment.spanDays - 1 >= laneSegment.start) {
              canUseLane = false
              break
            }
          }
          
          if (canUseLane) {
            assignedLane = i
            break
          }
        }
        
        // If no available lane, create a new one
        if (assignedLane === -1) {
          assignedLane = lanes.length
          lanes.push([])
        }
        
        // Assign the lane to the segment
        segment.lane = assignedLane
        lanes[assignedLane].push({
          start: segment.startColumn,
          end: segment.startColumn + segment.spanDays - 1
        })
      })
      
      // Re-sort segments by lane, then by start column
      segments.sort((a, b) => {
        if (a.lane !== b.lane) return a.lane - b.lane
        return a.startColumn - b.startColumn
      })
    })
    
    return segmentsByWeek
  }

  const getEventsForDay = (dayNumber: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return { events: [], overflowCount: 0 }
    
    // Create day key for comparison (YYYY-MM-DD)
    const dayKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
    
    // Only filter single-day events (multi-day events are rendered separately as bars)
    const allMatchedEvents = singleDayEvents.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      
      // Normalize event date to YYYY-MM-DD string
      const eventDayKey = eventDateRaw.includes('T')
        ? eventDateRaw.split('T')[0]
        : eventDateRaw
      
      return eventDayKey === dayKey
    })
    
    // Limit visible events based on screen size
    // Uses SSR-safe state instead of render-time window access
    const visibleEvents = allMatchedEvents.slice(0, maxVisible)
    const overflowCount = Math.max(0, allMatchedEvents.length - maxVisible)
    
    return { events: visibleEvents, overflowCount }
  }

  const multiDaySegmentsByWeek = calculateMultiDaySegments()

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
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm relative">
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
      
      {/* Calendar grid with week-row multi-day bars */}
      <div className="space-y-0.5 sm:space-y-1 md:space-y-2">
        {weekRows.map((week, weekIndex) => {
          const weekSegments = multiDaySegmentsByWeek.get(weekIndex) || []
          
          return (
            <div key={weekIndex} className="relative">
              {/* Multi-day event bars for this week */}
              <div className="absolute inset-0 top-6 sm:top-8 pointer-events-none">
                {weekSegments.map((segment, segmentIndex) => (
                  <div
                    key={segment.event.id}
                    className="absolute h-6 sm:h-8 bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1 text-[10px] sm:text-xs font-medium text-blue-800 dark:text-blue-200 truncate pointer-events-auto cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors"
                    style={{
                      left: `calc(${segment.startColumn * (100 / 7)}% + 0.25%)`,
                      width: `calc(${segment.spanDays * (100 / 7)}% - 0.5%)`,
                      top: `${segment.lane * 2.5}rem`,
                      zIndex: 10 + segmentIndex
                    }}
                    onClick={() => {
                      if (segment.event.originalEvent.htmlLink) {
                        window.open(segment.event.originalEvent.htmlLink, '_blank', 'noopener,noreferrer')
                      }
                    }}
                    title={segment.event.summary}
                  >
                    {segment.event.summary}
                  </div>
                ))}
              </div>

              {/* Calendar grid cells for this week */}
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-2 relative z-0">
                {week.map((dayInfo, dayIndex) => {
                  const { events: dayEvents, overflowCount } = getEventsForDay(dayInfo.day, dayInfo.isCurrentMonth)
                  const dayDate = dayInfo.isCurrentMonth ? new Date(year, monthIndex, dayInfo.day) : null
                  
                  return (
                    <CalendarDayCell
                      key={dayIndex}
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
          )
        })}
      </div>
      </div>
    </div>
  )
}
