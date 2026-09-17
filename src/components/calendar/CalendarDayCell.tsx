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

  const hasEvents = events.length > 0
  const eventCountLabel = `${events.length} ${events.length === 1 ? 'event' : 'events'}`

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
        className="relative z-10 flex items-center justify-center w-7 h-7 md:w-8 md:h-8 flex-none leading-none p-0"
      >
        <span
          className={`
            text-[10px] md:text-sm font-semibold leading-none
            ${isToday
              ? 'inline-flex items-center justify-center w-5 h-5 md:w-6 md:h-6 bg-blue-500 text-white rounded-full'
              : ''
            }
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
      <div className="relative z-10 w-full flex flex-col items-center justify-end flex-1 min-h-0">
        {hasEvents && (
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onClick?.()
            }}
          >
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/40 whitespace-nowrap">
              <span className="sm:hidden">{events.length}</span>
              <span className="hidden sm:inline">{eventCountLabel}</span>
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
