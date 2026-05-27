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
        px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-md cursor-pointer transition-colors group flex items-start gap-1 sm:gap-1.5
        ${isHoliday
          ? 'bg-emerald-500/15 hover:bg-emerald-500/25 dark:bg-emerald-500/25 dark:hover:bg-emerald-500/35'
          : 'bg-blue-500/15 hover:bg-blue-500/25 dark:bg-blue-500/25 dark:hover:bg-blue-500/35'
        }
      `}
    >
      <div className={`
        w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full mt-1 sm:mt-1.5 flex-shrink-0
        ${isHoliday
          ? 'bg-emerald-500 dark:bg-emerald-400'
          : 'bg-blue-500 dark:bg-blue-400'
        }
      `} />
      <div className="flex-1 min-w-0">
        <div className={`
          text-[10px] sm:text-xs font-medium truncate leading-tight
          ${isHoliday
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-blue-700 dark:text-blue-300'
          }
        `}>
          {title}
        </div>
        {time && (
          <div className={`
            text-[9px] sm:text-[10px] flex items-center gap-0.5 sm:gap-1 mt-0.5 leading-tight hidden sm:flex
            ${isHoliday
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-blue-600 dark:text-blue-400'
            }
          `}>
            <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 flex-shrink-0" />
            <span className="truncate">{time}</span>
          </div>
        )}
      </div>
    </div>
  )
}
