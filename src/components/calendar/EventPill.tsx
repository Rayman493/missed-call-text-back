import { Clock } from 'lucide-react'

interface EventPillProps {
  title: string
  time?: string
  onClick?: () => void
  isHoliday?: boolean
}

export default function EventPill({ title, time, onClick, isHoliday = false }: EventPillProps) {
  return (
    <div
      onClick={onClick}
      className={`
        px-1.5 py-1 sm:px-1.5 sm:py-1 rounded-sm cursor-pointer transition-all duration-200 group flex items-start gap-0.5 sm:gap-1 hover:scale-[1.02] active:scale-95
        ${isHoliday
          ? 'bg-emerald-500/20 hover:bg-emerald-500/30 dark:bg-emerald-500/30 dark:hover:bg-emerald-500/40 hover:shadow-sm'
          : 'bg-blue-500/20 hover:bg-blue-500/30 dark:bg-blue-500/30 dark:hover:bg-blue-500/40 hover:shadow-sm'
        }
      `}
    >
      <div className={`
        w-1 h-1 sm:w-1 sm:h-1 rounded-full mt-1 sm:mt-1.5 flex-shrink-0
        ${isHoliday
          ? 'bg-emerald-600 dark:bg-emerald-400'
          : 'bg-blue-600 dark:bg-blue-400'
        }
      `} />
      <div className="flex-1 min-w-0">
        <div className={`
          text-[10px] sm:text-[10px] md:text-xs font-semibold truncate leading-tight
          ${isHoliday
            ? 'text-emerald-800 dark:text-emerald-200'
            : 'text-blue-800 dark:text-blue-200'
          }
        `}>
          {title}
        </div>
        {time && (
          <div className={`
            text-[9px] sm:text-[9px] md:text-[10px] flex items-center gap-0.5 sm:gap-1 mt-0.5 leading-tight hidden md:flex
            ${isHoliday
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-blue-700 dark:text-blue-300'
            }
          `}>
            <Clock className="w-1.5 h-1.5 sm:w-2 sm:h-2 flex-shrink-0" />
            <span className="truncate">{time}</span>
          </div>
        )}
      </div>
    </div>
  )
}
