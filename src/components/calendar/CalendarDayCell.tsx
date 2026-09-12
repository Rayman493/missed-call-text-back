import { ReactNode } from 'react'
import { Calendar, Briefcase, CheckCircle2 } from 'lucide-react'
import { useTapGuard } from '@/lib/gesture/use-tap-guard'

interface CalendarEvent {
  id: string
  summary: string
  type: 'appointment' | 'job' | 'task'
  customer?: string
  time?: string
  status?: string
}

interface CalendarDayCellProps {
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected?: boolean
  isWeekend?: boolean
  events?: CalendarEvent[]
  onClick?: () => void
  onEventClick?: (event: CalendarEvent) => void
}

export default function CalendarDayCell({
  day,
  isCurrentMonth,
  isToday,
  isSelected,
  isWeekend = false,
  events = [],
  onClick,
  onEventClick
}: CalendarDayCellProps) {
  // Shared tap-vs-drag guard for the day cell. Suppresses day selection
  // when the user is scrolling/dragging across the calendar grid.
  const dayGuard = useTapGuard()

  // Separate guard for event chips. An event tap must open the event modal
  // and NOT bubble to the day cell's onClick. An event drag must suppress
  // both the event action AND the day selection.
  const eventGuard = useTapGuard()

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'appointment':
        return <Calendar className="w-3 h-3 flex-none" />
      case 'job':
        return <Briefcase className="w-3 h-3 flex-none" />
      case 'task':
        return <CheckCircle2 className="w-3 h-3 flex-none" />
      default:
        return null
    }
  }

  const getEventColor = (type: string) => {
    switch (type) {
      case 'appointment':
        return 'text-blue-600 dark:text-blue-400'
      case 'job':
        return 'text-green-600 dark:text-green-400'
      case 'task':
        return 'text-purple-600 dark:text-purple-400'
      default:
        return 'text-slate-600 dark:text-slate-400'
    }
  }

  const visibleEvents = events.slice(0, 2)
  const overflowCount = Math.max(0, events.length - 2)
  const hasEvents = events.length > 0

  return (
    <div
      onPointerDown={dayGuard.onPointerDown}
      onPointerMove={dayGuard.onPointerMove}
      onPointerUp={dayGuard.onPointerUp}
      onPointerCancel={dayGuard.onPointerCancel}
      onPointerLeave={dayGuard.onPointerLeave}
      onClick={() => {
        // Suppress day selection if this gesture was a drag/scroll.
        // One-shot: consumeDragSuppression() returns true once then resets,
        // so later keyboard/programmatic activation is never stale-suppressed.
        if (dayGuard.consumeDragSuppression()) return
        onClick?.()
      }}
      className={`
        relative min-h-[48px] sm:min-h-[64px] md:min-h-[80px] p-1.5 sm:p-2 md:p-2.5 rounded-md border transition-all duration-200 cursor-pointer active:scale-95 flex flex-col items-start justify-start gap-1
        ${isCurrentMonth
          ? isWeekend
            ? 'bg-slate-100/80 dark:bg-slate-800/30 border-slate-200/50 dark:border-slate-700/30 hover:bg-slate-200/60 dark:hover:bg-slate-800/45'
            : 'bg-white dark:bg-slate-900/20 border-slate-200/40 dark:border-slate-700/25 hover:bg-slate-50/60 dark:hover:bg-slate-800/35'
          : 'bg-slate-50/40 dark:bg-slate-950/20 border-slate-100/40 dark:border-slate-800/20 opacity-50'
        }
        ${isSelected
          ? 'ring-2 ring-blue-500/60 ring-offset-1 ring-offset-background dark:ring-offset-slate-900 bg-blue-50/60 dark:bg-blue-900/20'
          : ''
        }
      `}
    >
      {/* Transparent day-selection hit target — fills the entire cell behind
          the event chips. This ensures that tapping ANY non-event portion of
          the day cell (including gaps between events, padding, and the area
          below the last event) selects the day. Event chips are positioned
          above this overlay (higher z-index) and use stopPropagation so their
          taps open the event instead of selecting the day. */}
      <div
        className="absolute inset-0 z-0"
        aria-hidden="true"
        onClick={(e) => {
          // This overlay is behind the event chips. If the tap reaches here,
          // it means the user tapped a non-event area. Let the parent's
          // onClick handle day selection (don't stop propagation).
          // The parent's onClick checks dayGuard.consumeDragSuppression().
        }}
      />

      {/* Date number — always tappable for day selection, even on busy days.
          The date number sits at the top of the cell and is a reliable
          day-selection target regardless of how many event chips fill the
          cell below. It uses the same dayGuard, so a drag starting on the
          date number still suppresses day selection.
          Enlarged hit target (w-7 h-7 on mobile, w-8 h-8 on desktop) for
          reliable tapping on crowded days. */}
      <div
        className={`
          relative z-10 flex items-center justify-center w-7 h-7 md:w-8 md:h-8 flex-none leading-none p-0
          ${isToday
            ? 'bg-blue-500 rounded-md'
            : ''
          }
        `}
      >
        <span
          className={`
            text-[10px] md:text-sm font-semibold leading-none
            ${isCurrentMonth
              ? isWeekend && !isToday
                ? 'text-slate-500 dark:text-slate-400'
                : 'text-slate-900 dark:text-foreground'
              : 'text-slate-400 dark:text-slate-600'
            }
            ${isToday
              ? 'text-white'
              : ''
            }
          `}
        >
          {day}
        </span>
      </div>
      <div className="relative z-10 w-full flex flex-col gap-0.5 min-h-0">
        {visibleEvents.map((event, index) => (
          <div
            key={`${event.id}-${index}`}
            className={`flex items-center gap-1 text-[10px] sm:text-[11px] leading-tight cursor-pointer hover:opacity-80 ${getEventColor(event.type)}`}
            title={event.summary}
            role="button"
            tabIndex={0}
            onPointerDown={eventGuard.onPointerDown}
            onPointerMove={eventGuard.onPointerMove}
            onPointerUp={eventGuard.onPointerUp}
            onPointerCancel={eventGuard.onPointerCancel}
            onPointerLeave={eventGuard.onPointerLeave}
            onClick={(e) => {
              // Always stop propagation so the day cell's onClick doesn't
              // also fire (prevents day selection when tapping an event).
              e.stopPropagation()
              // Suppress event modal if this gesture was a drag/scroll.
              // One-shot: consumeDragSuppression() returns true once then
              // resets, so later keyboard activation is never stale-suppressed.
              if (eventGuard.consumeDragSuppression()) return
              onEventClick?.(event)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onEventClick?.(event)
              }
            }}
          >
            <div className="flex items-center justify-center w-3 h-3 sm:w-3.5 sm:h-3.5 flex-none shrink-0">
              {getEventIcon(event.type)}
            </div>
            <span className="truncate font-medium min-w-0 flex-1">{event.summary}</span>
          </div>
        ))}
        {overflowCount > 0 && (
          <span className={`text-[10px] sm:text-[11px] leading-tight ${overflowCount > 3 ? 'font-semibold' : 'font-normal'} text-slate-500 dark:text-slate-400`}>
            +{overflowCount} more
          </span>
        )}
      </div>
    </div>
  )
}
