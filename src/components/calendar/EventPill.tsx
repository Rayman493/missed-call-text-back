import { Clock } from 'lucide-react'

interface EventPillProps {
  title: string
  time?: string
  onClick?: () => void
  isHoliday?: boolean
  eventType?: 'holiday' | 'client' | 'personal' | 'task'
}

export default function EventPill({ title, time, onClick, isHoliday = false, eventType = 'client' }: EventPillProps) {
  const getEventColors = () => {
    if (isHoliday || eventType === 'holiday') {
      return {
        bg: 'bg-green-500/20 hover:bg-green-500/30 dark:bg-green-500/30 dark:hover:bg-green-500/40',
        dot: 'bg-green-600 dark:bg-green-400',
        text: 'text-green-800 dark:text-green-200',
        timeText: 'text-green-700 dark:text-green-300'
      }
    }

    switch (eventType) {
      case 'client':
        return {
          bg: 'bg-blue-500/20 hover:bg-blue-500/30 dark:bg-blue-500/30 dark:hover:bg-blue-500/40',
          dot: 'bg-blue-600 dark:bg-blue-400',
          text: 'text-blue-800 dark:text-blue-200',
          timeText: 'text-blue-700 dark:text-blue-300'
        }
      case 'personal':
        return {
          bg: 'bg-purple-500/20 hover:bg-purple-500/30 dark:bg-purple-500/30 dark:hover:bg-purple-500/40',
          dot: 'bg-purple-600 dark:bg-purple-400',
          text: 'text-purple-800 dark:text-purple-200',
          timeText: 'text-purple-700 dark:text-purple-300'
        }
      case 'task':
        return {
          bg: 'bg-orange-500/20 hover:bg-orange-500/30 dark:bg-orange-500/30 dark:hover:bg-orange-500/40',
          dot: 'bg-orange-600 dark:bg-orange-400',
          text: 'text-orange-800 dark:text-orange-200',
          timeText: 'text-orange-700 dark:text-orange-300'
        }
      default:
        return {
          bg: 'bg-blue-500/20 hover:bg-blue-500/30 dark:bg-blue-500/30 dark:hover:bg-blue-500/40',
          dot: 'bg-blue-600 dark:bg-blue-400',
          text: 'text-blue-800 dark:text-blue-200',
          timeText: 'text-blue-700 dark:text-blue-300'
        }
    }
  }

  const colors = getEventColors()

  return (
    <div
      onClick={onClick}
      className={`
        px-1.5 py-1 sm:px-1.5 sm:py-1 rounded-sm cursor-pointer transition-all duration-200 group flex items-start gap-0.5 sm:gap-1 hover:scale-[1.02] active:scale-95 hover:shadow-sm
        ${colors.bg}
      `}
    >
      <div className={`
        w-1 h-1 sm:w-1 sm:h-1 rounded-full mt-1 sm:mt-1.5 flex-shrink-0
        ${colors.dot}
      `} />
      <div className="flex-1 min-w-0">
        <div className={`
          text-[10px] sm:text-[10px] md:text-xs font-semibold truncate leading-tight
          ${colors.text}
        `}>
          {title}
        </div>
        {time && (
          <div className={`
            text-[9px] sm:text-[9px] md:text-[10px] flex items-center gap-0.5 sm:gap-1 mt-0.5 leading-tight hidden md:flex
            ${colors.timeText}
          `}>
            <Clock className="w-1.5 h-1.5 sm:w-2 sm:h-2 flex-shrink-0" />
            <span className="truncate">{time}</span>
          </div>
        )}
      </div>
    </div>
  )
}
