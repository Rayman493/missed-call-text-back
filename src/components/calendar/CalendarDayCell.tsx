import { ReactNode } from 'react'
import { Calendar, Briefcase, CheckCircle2 } from 'lucide-react'

interface CalendarEvent {
  id: string
  summary: string
  type: 'appointment' | 'job' | 'task'
  customer?: string
  time?: string
  status?: string
}

interface CalendarDayCellProps {
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected?: boolean
  isWeekend?: boolean
  events?: CalendarEvent[]
  onClick?: () => void
}

export default function CalendarDayCell({
  day,
  isCurrentMonth,
  isToday,
  isSelected,
  isWeekend = false,
  events = [],
  onClick
}: CalendarDayCellProps) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'appointment':
        return <Calendar className="w-3 h-3 flex-none" />
      case 'job':
        return <Briefcase className="w-3 h-3 flex-none" />
      case 'task':
        return <CheckCircle2 className="w-3 h-3 flex-none" />
      default:
        return null
    }
  }

  const getEventColor = (type: string) => {
    switch (type) {
      case 'appointment':
        return 'text-blue-600 dark:text-blue-400'
      case 'job':
        return 'text-green-600 dark:text-green-400'
      case 'task':
        return 'text-purple-600 dark:text-purple-400'
      default:
        return 'text-slate-600 dark:text-slate-400'
    }
  }

  const visibleEvents = events.slice(0, 2)
  const overflowCount = Math.max(0, events.length - 2)
  const hasEvents = events.length > 0

  return (
    <div
      onClick={onClick}
      className={`
        min-h-[48px] sm:min-h-[64px] md:min-h-[86px] p-0.5 sm:p-1.5 md:p-2 rounded-lg border transition-all duration-200 cursor-pointer active:scale-95 flex flex-col items-start justify-start gap-1
        ${isCurrentMonth
          ? isWeekend
            ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            : 'bg-white dark:bg-slate-900/35 border-slate-200/70 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800/60'
          : 'bg-slate-50/70 dark:bg-slate-950/30 border-slate-100 dark:border-slate-900 opacity-45'
        }
        ${isSelected
          ? 'ring-2 ring-blue-500/70 ring-offset-1 ring-offset-background dark:ring-offset-slate-900 bg-blue-50/80 dark:bg-blue-900/25 shadow-md shadow-blue-500/10'
          : ''
        }
      `}
    >
      <div
        className={`
          flex items-center justify-center w-5 h-5 md:w-7 md:h-7 flex-none leading-none p-0
          ${isToday
            ? 'bg-blue-500 rounded-full'
            : ''
          }
        `}
      >
        <span
          className={`
            text-[10px] md:text-sm font-medium leading-none
            ${isCurrentMonth
              ? 'text-slate-900 dark:text-foreground'
              : 'text-slate-400 dark:text-slate-600'
            }
            ${isToday
              ? 'text-white'
              : ''
            }
          `}
        >
          {day}
        </span>
      </div>
      <div className="w-full flex flex-col gap-0.5">
        {visibleEvents.map((event, index) => (
          <div
            key={`${event.id}-${index}`}
            className={`flex items-center gap-0.5 text-[10px] leading-none ${getEventColor(event.type)}`}
            title={event.summary}
          >
            <div className="flex items-center justify-center w-3 h-3 sm:w-4 sm:h-4 flex-none shrink-0">
              {getEventIcon(event.type)}
            </div>
            <span className="truncate font-medium min-w-0 flex-1">{event.summary}</span>
          </div>
        ))}
        {overflowCount > 0 && (
          <span className={`text-[9px] leading-none ${overflowCount > 3 ? 'font-semibold' : 'font-normal'} text-slate-500 dark:text-slate-400`}>
            +{overflowCount} more
          </span>
        )}
      </div>
    </div>
  )
}
