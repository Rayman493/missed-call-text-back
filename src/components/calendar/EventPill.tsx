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
        px-2 py-1 rounded-md cursor-pointer transition-colors group
        ${isHoliday
          ? 'bg-emerald-500/10 hover:bg-emerald-500/20 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30'
          : 'bg-blue-500/10 hover:bg-blue-500/20 dark:bg-blue-500/20 dark:hover:bg-blue-500/30'
        }
      `}
    >
      <div className={`
        text-xs font-medium truncate
        ${isHoliday
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-blue-700 dark:text-blue-300'
        }
      `}>
        {title}
      </div>
      {time && (
        <div className={`
          text-[10px] flex items-center gap-1 mt-0.5
          ${isHoliday
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-blue-600 dark:text-blue-400'
          }
        `}>
          <Clock className="w-2.5 h-2.5" />
          {time}
        </div>
      )}
    </div>
  )
}
