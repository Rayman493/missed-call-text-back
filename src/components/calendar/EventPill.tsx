import { Clock } from 'lucide-react'

interface EventPillProps {
  title: string
  time?: string
  onClick?: () => void
}

export default function EventPill({ title, time, onClick }: EventPillProps) {
  return (
    <div
      onClick={onClick}
      className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 dark:bg-blue-500/20 dark:hover:bg-blue-500/30 rounded-md cursor-pointer transition-colors group"
    >
      <div className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate">
        {title}
      </div>
      {time && (
        <div className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5">
          <Clock className="w-2.5 h-2.5" />
          {time}
        </div>
      )}
    </div>
  )
}
