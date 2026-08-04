import { ReactNode } from 'react'

interface CalendarDayCellProps {
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected?: boolean
  isWeekend?: boolean
  eventCount?: number
  hasEvents?: boolean
  onClick?: () => void
}

export default function CalendarDayCell({
  day,
  isCurrentMonth,
  isToday,
  isSelected,
  isWeekend = false,
  eventCount = 0,
  hasEvents = false,
  onClick
}: CalendarDayCellProps) {
  return (
    <div
      onClick={onClick}
      className={`
        min-h-[48px] sm:min-h-[64px] md:min-h-[86px] p-1 sm:p-1.5 md:p-2.5 rounded-lg border transition-all duration-150 cursor-pointer active:scale-95 flex flex-col items-center justify-center
        ${isCurrentMonth
          ? isWeekend
            ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            : 'bg-white dark:bg-slate-900/35 border-slate-200/70 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800/60'
          : 'bg-slate-50/70 dark:bg-slate-950/30 border-slate-100 dark:border-slate-900 opacity-45'
        }
        ${isToday
          ? 'ring-1 ring-blue-500/80 ring-offset-1 ring-offset-background dark:ring-offset-slate-900'
          : ''
        }
        ${isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 dark:border-blue-400 shadow-md shadow-blue-500/10'
          : ''
        }
      `}
    >
      <span
        className={`
          text-[10px] md:text-sm font-medium mb-1
          ${isCurrentMonth
            ? 'text-slate-900 dark:text-foreground'
            : 'text-slate-400 dark:text-slate-600'
          }
          ${isToday
            ? 'bg-blue-500 text-white w-5 h-5 md:w-7 md:h-7 rounded-full flex items-center justify-center'
            : ''
          }
        `}
      >
        {day}
      </span>
      {hasEvents && (
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-blue-500"></div>
          {eventCount > 1 && (
            <span className="text-[9px] md:text-[10px] text-slate-600 dark:text-slate-400 font-medium">
              {eventCount}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
