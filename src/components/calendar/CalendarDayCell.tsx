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
        min-h-[48px] sm:min-h-[64px] md:min-h-[80px] p-1 sm:p-1.5 md:p-2 rounded-md border transition-all duration-200 cursor-pointer active:scale-95 flex flex-col items-start justify-start gap-1
        ${isCurrentMonth
          ? isWeekend
            ? 'bg-slate-50/60 dark:bg-slate-800/25 border-slate-200/40 dark:border-slate-700/25 hover:bg-slate-100/80 dark:hover:bg-slate-800/40'
            : 'bg-white dark:bg-slate-900/20 border-slate-200/40 dark:border-slate-700/25 hover:bg-slate-50/60 dark:hover:bg-slate-800/35'
          : 'bg-slate-50/40 dark:bg-slate-950/20 border-slate-100/40 dark:border-slate-800/20 opacity-50'
        }
        ${isSelected
          ? 'ring-2 ring-blue-500/60 ring-offset-1 ring-offset-background dark:ring-offset-slate-900 bg-blue-50/60 dark:bg-blue-900/20'
          : ''
        }
      `}
    >
      <div
        className={`
          flex items-center justify-center w-5 h-5 md:w-6 md:h-6 flex-none leading-none p-0
          ${isToday
            ? 'bg-blue-500 rounded-md'
            : ''
          }
        `}
      >
        <span
          className={`
            text-[10px] md:text-sm font-semibold leading-none
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
            className={`flex items-center gap-1 text-[10px] sm:text-[11px] leading-tight ${getEventColor(event.type)}`}
            title={event.summary}
          >
            <div className="flex items-center justify-center w-3 h-3 sm:w-3.5 sm:h-3.5 flex-none shrink-0">
              {getEventIcon(event.type)}
            </div>
            <span className="truncate font-medium min-w-0 flex-1">{event.summary}</span>
          </div>
        ))}
        {overflowCount > 0 && (
          <span className={`text-[10px] sm:text-[11px] leading-tight ${overflowCount > 3 ? 'font-semibold' : 'font-normal'} text-slate-500 dark:text-slate-400`}>
            +{overflowCount} more
          </span>
        )}
      </div>
    </div>
  )
}
