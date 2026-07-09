import { Clock } from 'lucide-react'

interface EventPillProps {
  title: string
  time?: string
  endTime?: string
  onClick?: () => void
  isHoliday?: boolean
  eventType?: 'holiday' | 'client' | 'personal' | 'task'
  source?: 'primary' | 'holiday' | 'replyflow'
}

export default function EventPill({ title, time, endTime, onClick, isHoliday = false, eventType = 'client', source }: EventPillProps) {
  const getEventColors = () => {
    if (isHoliday || eventType === 'holiday') {
      return {
        bg: 'bg-emerald-500/10 hover:bg-emerald-500/15 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15 border border-emerald-500/15',
        dot: 'bg-green-600 dark:bg-green-400',
        text: 'text-green-800 dark:text-green-200',
        timeText: 'text-green-700 dark:text-green-300'
      }
    }

    switch (eventType) {
      case 'client':
        return {
          bg: 'bg-blue-500/10 hover:bg-blue-500/15 dark:bg-blue-500/10 dark:hover:bg-blue-500/15 border border-blue-500/15',
          dot: 'bg-blue-600 dark:bg-blue-400',
          text: 'text-blue-800 dark:text-blue-200',
          timeText: 'text-blue-700 dark:text-blue-300'
        }
      case 'personal':
        return {
          bg: 'bg-purple-500/10 hover:bg-purple-500/15 dark:bg-purple-500/10 dark:hover:bg-purple-500/15 border border-purple-500/15',
          dot: 'bg-purple-600 dark:bg-purple-400',
          text: 'text-purple-800 dark:text-purple-200',
          timeText: 'text-purple-700 dark:text-purple-300'
        }
      case 'task':
        return {
          bg: 'bg-orange-500/10 hover:bg-orange-500/15 dark:bg-orange-500/10 dark:hover:bg-orange-500/15 border border-orange-500/15',
          dot: 'bg-orange-600 dark:bg-orange-400',
          text: 'text-orange-800 dark:text-orange-200',
          timeText: 'text-orange-700 dark:text-orange-300'
        }
      default:
        return {
          bg: 'bg-blue-500/10 hover:bg-blue-500/15 dark:bg-blue-500/10 dark:hover:bg-blue-500/15 border border-blue-500/15',
          dot: 'bg-blue-600 dark:bg-blue-400',
          text: 'text-blue-800 dark:text-blue-200',
          timeText: 'text-blue-700 dark:text-blue-300'
        }
    }
  }

  const colors = getEventColors()

  const getSourceLabel = () => {
    if (source === 'holiday') return 'Holiday'
    if (source === 'replyflow') return 'ReplyFlow'
    return 'Google'
  }

  const getSourceColor = () => {
    if (source === 'holiday') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    if (source === 'replyflow') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }

  return (
    <div
      onClick={onClick}
      className={`
        px-1.5 py-1 md:px-2 md:py-1.5 rounded-md cursor-pointer transition-colors duration-150 group flex items-center gap-1.5 active:scale-95
        ${colors.bg}
      `}
    >
      <div className={`
        w-1.5 h-1.5 rounded-full flex-shrink-0
        ${colors.dot}
      `} />
      <div className="flex-1 min-w-0">
        <div className={`
          text-[10px] md:text-[12px] font-medium truncate leading-tight
          ${colors.text}
        `}>
          {title}
        </div>
        {source && source !== 'primary' && (
          <div className={`
            hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium mt-0.5
            ${getSourceColor()}
          `}>
            {getSourceLabel()}
          </div>
        )}
        {time && (
          <div className={`
            text-[9px] sm:text-[9px] md:text-[10px] flex items-center gap-0.5 sm:gap-1 mt-0.5 leading-tight hidden md:flex
            ${colors.timeText}
          `}>
            <Clock className="w-1.5 h-1.5 sm:w-2 sm:h-2 flex-shrink-0" />
            <span className="truncate">
              {endTime ? `${time} – ${endTime}` : time}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
