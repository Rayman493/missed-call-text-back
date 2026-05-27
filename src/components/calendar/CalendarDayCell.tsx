import { ReactNode } from 'react'

interface CalendarDayCellProps {
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  events?: ReactNode
  onClick?: () => void
}

export default function CalendarDayCell({ 
  day, 
  isCurrentMonth, 
  isToday, 
  events,
  onClick 
}: CalendarDayCellProps) {
  return (
    <div
      onClick={onClick}
      className={`
        min-h-[60px] sm:min-h-[70px] md:min-h-[80px] p-1.5 sm:p-2 rounded-lg border transition-all duration-200 cursor-pointer
        ${isCurrentMonth 
          ? 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm' 
          : 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/50 opacity-50'
        }
        ${isToday 
          ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background dark:ring-offset-slate-900' 
          : ''
        }
      `}
    >
      <div className="flex items-center justify-between mb-1 sm:mb-2">
        <span
          className={`
            text-xs sm:text-sm font-medium
            ${isCurrentMonth 
              ? 'text-slate-900 dark:text-foreground' 
              : 'text-slate-400 dark:text-slate-600'
            }
            ${isToday 
              ? 'bg-blue-500 text-white w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center' 
              : ''
            }
          `}
        >
          {day}
        </span>
      </div>
      <div className="space-y-0.5 sm:space-y-1">
        {events}
      </div>
    </div>
  )
}
