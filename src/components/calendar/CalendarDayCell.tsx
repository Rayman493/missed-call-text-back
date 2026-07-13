import { ReactNode } from 'react'

interface CalendarDayCellProps {
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected?: boolean
  isWeekend?: boolean
  events?: ReactNode
  overflowCount?: number
  onClick?: () => void
}

export default function CalendarDayCell({
  day,
  isCurrentMonth,
  isToday,
  isSelected,
  isWeekend = false,
  events,
  overflowCount,
  onClick
}: CalendarDayCellProps) {
  return (
    <div
      onClick={onClick}
      className={`
        min-h-[48px] sm:min-h-[64px] md:min-h-[86px] p-1 sm:p-1.5 md:p-2.5 rounded-lg border transition-all duration-150 cursor-pointer active:scale-95
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
      <div className="flex items-center justify-between mb-0.5 md:mb-2">
        <span
          className={`
            text-[10px] md:text-sm font-medium
            ${isCurrentMonth
              ? 'text-slate-900 dark:text-foreground'
              : 'text-slate-400 dark:text-slate-600'
            }
            ${isToday
              ? 'bg-blue-500 text-white w-4 h-4 md:w-6 md:h-6 rounded-full flex items-center justify-center'
              : ''
            }
          `}
        >
          {day}
        </span>
      </div>
      <div className="space-y-0.5 md:space-y-1">
        {events}
        {typeof overflowCount === 'number' && overflowCount > 0 && (
          <div className="text-[8px] sm:text-[9px] md:text-[10px] text-slate-500 dark:text-slate-400 pl-0.5 sm:pl-1 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            +{overflowCount} more
          </div>
        )}
      </div>
    </div>
  )
}
