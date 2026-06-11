import { ReactNode } from 'react'

interface CalendarDayCellProps {
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected?: boolean
  events?: ReactNode
  overflowCount?: number
  onClick?: () => void
}

export default function CalendarDayCell({
  day,
  isCurrentMonth,
  isToday,
  isSelected,
  events,
  overflowCount,
  onClick
}: CalendarDayCellProps) {
  return (
    <div
      onClick={onClick}
      className={`
        min-h-[55px] sm:min-h-[70px] md:min-h-[90px] p-1 sm:p-1.5 md:p-2.5 rounded-sm border transition-all duration-150 cursor-pointer active:scale-95
        ${isCurrentMonth
          ? 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md hover:scale-[1.02]'
          : 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/50 opacity-50'
        }
        ${isToday
          ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background dark:ring-offset-slate-900'
          : ''
        }
        ${isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 dark:border-blue-400 shadow-md'
          : ''
        }
      `}
    >
      <div className="flex items-center justify-between mb-0 sm:mb-0.5 md:mb-2">
        <span
          className={`
            text-[9px] sm:text-[10px] md:text-sm font-medium
            ${isCurrentMonth 
              ? 'text-slate-900 dark:text-foreground' 
              : 'text-slate-400 dark:text-slate-600'
            }
            ${isToday 
              ? 'bg-blue-500 text-white w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-6 md:h-6 rounded-full flex items-center justify-center' 
              : ''
            }
          `}
        >
          {day}
        </span>
      </div>
      <div className="space-y-0 sm:space-y-0.5 sm:space-y-1">
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
