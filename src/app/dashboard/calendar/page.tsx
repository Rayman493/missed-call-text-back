'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import DashboardShell from '@/components/layout/DashboardShell'
import Toast, { ToastContainer } from '@/components/Toast'
import Link from 'next/link'
import { Calendar as CalendarIcon, Plus, RefreshCw, AlertTriangle, Briefcase, MapPin, MoreVertical, CheckCircle2, Map as MapIcon, ExternalLink, Pencil, Bell, Trash2, Video, Clock } from 'lucide-react'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import EventPill from '@/components/calendar/EventPill'
import EventDetailsModal from '@/components/calendar/EventDetailsModal'
import NewAppointmentModal from '@/components/calendar/NewAppointmentModal'
import FloatingHelpButton from '@/components/FloatingHelpButton'
import { filterEventsByMonth, getLocalDateKey, getTodayLocalDateKey } from '@/lib/calendar-date-utils'
import { getBusinessLocalDateString, normalizeBusinessTimezone } from '@/lib/business-date-utils'
import { getMonthCounts } from '@/lib/calendar-summary-utils'
import { toZonedTime } from 'date-fns-tz/toZonedTime'
import { fromZonedTime } from 'date-fns-tz/fromZonedTime'
import { getLeadAIIntake, getLeadRequestTitle } from '@/lib/ai-field-mapping'
import JobComposer from '@/components/jobs/JobComposer'
import JobPill from '@/components/jobs/JobPill'
import JobDetailsModal from '@/components/jobs/JobDetailsModal'
import TodaySchedule from '@/components/jobs/TodaySchedule'
import LeadPickerModal from '@/components/jobs/LeadPickerModal'
import AddCustomerModal from '@/components/AddCustomerModal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import TodayCommandCenter from '@/components/schedule/TodayCommandCenter'
import NewTaskModal from '@/components/schedule/NewTaskModal'
import ScheduleMap from '@/components/schedule/ScheduleMap'
import FocusSection from '@/components/FocusSection'
import Skeleton, { CardSkeleton, ListItemSkeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import type { Job, JobStatus, JobPrefill } from '@/components/jobs/JobComposer'
import { openOAuthFlow } from '@/capacitor/oauth'
import { isCapacitorNative, getCapacitorPlatform } from '@/capacitor/init'
import { formatEventTimeRange } from '@/lib/calendar-date-utils'
import { isReplyFlowOwnedEvent } from '@/lib/calendar-ownership'
import { formatDuration } from '@/lib/job-time-utils'

interface CalendarEvent {
  id: string
  summary: string
  description: string | null
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location: string | null
  htmlLink: string | null
  source?: 'primary' | 'holiday'
  isHoliday?: boolean
  meetingUrl?: string | null
  extendedProperties?: any
}

interface Task {
  id: string
  title: string
  notes: string | null
  due_date: string | null
  due_time: string | null
  completed: boolean
  completed_at: string | null
  lead_id: string | null
  job_id: string | null
  created_at: string
  business_id?: string
}

// Lightweight RemindersList component (scoped, no new files)
function RemindersList({
  tasks,
  onEditTask,
  onAddTask,
  onToggleComplete,
  onDeleteTask,
}: {
  tasks: any[]
  onEditTask: (task: any) => void
  onAddTask: () => void
  onToggleComplete: (taskId: string, completed: boolean) => void
  onDeleteTask: (taskId: string) => void
}) {
  const todayStr = new Date().toLocaleDateString('en-CA')
  const sorted = [...tasks].sort((a, b) => {
    // Overdue first, then by due date
    const aOverdue = a.due_date && a.due_date < todayStr && !a.completed
    const bOverdue = b.due_date && b.due_date < todayStr && !b.completed
    if (aOverdue && !bOverdue) return -1
    if (!aOverdue && bOverdue) return 1
    const aDate = a.due_date || '9999-12-31'
    const bDate = b.due_date || '9999-12-31'
    return aDate.localeCompare(bDate)
  })

  const overdue = sorted.filter(t => t.due_date && t.due_date < todayStr && !t.completed)
  const today = sorted.filter(t => t.due_date === todayStr && !t.completed)
  const upcoming = sorted.filter(t => t.due_date && t.due_date > todayStr && !t.completed)
  const completed = sorted.filter(t => t.completed)
  const noDate = sorted.filter(t => !t.due_date && !t.completed)

  const formatDue = (task: any) => {
    if (!task.due_date) return null
    const d = new Date(task.due_date + 'T00:00:00')
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    if (!task.due_time) return dateStr
    const [h, m] = task.due_time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${dateStr} at ${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }

  const renderGroup = (title: string, count: number, list: any[], accent?: 'red' | 'blue') => (
    <div className="mb-5">
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${accent === 'red' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
        {title} <span className="text-slate-400 dark:text-slate-500 normal-case font-normal">({count})</span>
      </h3>
      <div className="space-y-2">
        {list.map(task => (
          <div
            key={task.id}
            className={`rounded-xl border p-4 transition-all hover:shadow-sm ${
              task.completed
                ? 'bg-slate-50/50 dark:bg-slate-800/20 border-slate-200/40 dark:border-slate-700/20'
                : accent === 'red'
                  ? 'bg-red-50/30 dark:bg-red-900/10 border-red-200/50 dark:border-red-800/30'
                  : 'bg-white dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-700/50 hover:border-blue-300 dark:hover:border-blue-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => onToggleComplete(task.id, task.completed)}
                className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded border-2 transition-colors flex items-center justify-center ${
                  task.completed
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 hover:border-green-600'
                    : 'border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400'
                }`}
                aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
              >
                {task.completed && (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${task.completed ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-900 dark:text-foreground'}`}>
                  {task.title}
                </p>
                {task.due_date && (
                  <p className={`text-xs mt-1 ${task.completed ? 'text-slate-400 dark:text-slate-500' : overdue.includes(task) ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    {formatDue(task)}
                  </p>
                )}
                {task.notes && (
                  <p className={`text-xs mt-1 truncate ${task.completed ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'}`}>{task.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onEditTask(task)}
                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Edit reminder"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDeleteTask(task.id)}
                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Delete reminder"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (tasks.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-6 sm:p-8 text-center">
        <div className="w-11 h-11 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
          <Bell className="w-5 h-5 text-slate-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">No reminders yet</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs mx-auto leading-relaxed">
          Add a reminder to keep follow-ups on track.
        </p>
        <button
          onClick={onAddTask}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Add Reminder
        </button>
      </div>
    )
  }

  return (
    <div>
      {overdue.length > 0 && renderGroup('Overdue', overdue.length, overdue, 'red')}
      {today.length > 0 && renderGroup('Today', today.length, today)}
      {upcoming.length > 0 && renderGroup('Upcoming', upcoming.length, upcoming)}
      {noDate.length > 0 && renderGroup('No Due Date', noDate.length, noDate)}
      {completed.length > 0 && renderGroup('Completed', completed.length, completed)}
    </div>
  )
}

// Lightweight MeetingsTab component (scoped, no new files)
function MeetingsTab({
  events,
  jobs,
  onOpenEvent,
  onViewCustomer,
  onNewMeeting,
  completedMap,
}: {
  events: CalendarEvent[]
  jobs: any[]
  onOpenEvent: (event: CalendarEvent) => void
  onViewCustomer: (leadId: string) => void
  onNewMeeting: () => void
  completedMap: Map<string, { completed_at: string }>
}) {
  // Determine eligibility
  const isEligible = (ev: CalendarEvent) => {
    // Job-linked
    const job = jobs.find(j => j.google_calendar_event_id === ev.id)
    // @ts-ignore
    const rfLead = ev?.extendedProperties?.private?.replyflow_lead_id
    return Boolean(job || rfLead || ev.meetingUrl)
  }

  const eligible = events.filter(isEligible)

  // Sort upcoming by start time
  const toDate = (ev: CalendarEvent) => new Date(ev.start.dateTime || ev.start.date || '').getTime()
  const upcoming = eligible
    .filter(ev => toDate(ev) >= new Date().setHours(0,0,0,0))
    .sort((a,b) => toDate(a) - toDate(b))

  const todayKey = getTodayLocalDateKey()
  const isToday = (ev: CalendarEvent) => (ev.start.dateTime || ev.start.date || '').startsWith(todayKey)

  const labelType = (ev: CalendarEvent) => {
    if (ev.meetingUrl) {
      // naive Google Meet detect
      return ev.meetingUrl.includes('meet.google.com') ? 'Google Meet' : 'Virtual'
    }
    if (ev.location) return 'In Person'
    return 'Appointment'
  }

  const formatDayTime = (ev: CalendarEvent) => {
    const d = ev.start.dateTime || ev.start.date
    if (!d) return ''
    const date = new Date(d)
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const timeStr = formatEventTimeRange(ev.start.dateTime, ev.end.dateTime, ev.start.date)
    return ev.start.date ? dateStr : `${dateStr} • ${timeStr}`
  }

  const renderGroup = (title: string, count: number, list: CalendarEvent[]) => (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        {title} <span className="text-slate-400 dark:text-slate-500 normal-case font-normal">({count})</span>
      </h3>
      <div className="space-y-2">
        {list.map(ev => {
          // Resolve job/lead for quick labels (client-side best-effort)
          const job = jobs.find(j => j.google_calendar_event_id === ev.id)
          const customerName = job?.customer_name || null
          const typeLabel = labelType(ev)
          const isMeet = typeLabel === 'Google Meet'
          return (
            <div
              key={ev.id}
              className="rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-900/60 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => onOpenEvent(ev)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenEvent(ev) } }}
            >
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <h3 className="min-w-0 line-clamp-1 text-sm font-semibold text-slate-900 dark:text-foreground">{ev.summary}</h3>
                  {customerName && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{customerName}</div>
                  )}
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{formatDayTime(ev)}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {isMeet && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                        <Video className="w-3 h-3" />
                        Google Meet
                      </span>
                    )}
                    {typeLabel === 'In Person' && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                        <MapPin className="w-3 h-3" />
                        In Person
                      </span>
                    )}
                    {typeLabel === 'Virtual' && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium">
                        <Video className="w-3 h-3" />
                        Virtual
                      </span>
                    )}
                    {typeLabel === 'Appointment' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                        Appointment
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  {completedMap?.has(ev.id) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 whitespace-nowrap font-medium">Completed</span>
                  )}
                  {!completedMap?.has(ev.id) && (() => {
                    const endRaw = ev.end?.dateTime || ev.end?.date
                    const isPastDue = endRaw ? new Date(endRaw).getTime() < Date.now() : false
                    return isPastDue ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 whitespace-nowrap font-medium">Past</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap font-medium">Scheduled</span>
                    )
                  })()}
                  {/* Primary action: Join far right for virtual meetings */}
                  {ev.meetingUrl && (
                    <a
                      href={ev.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Join
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const todays = upcoming.filter(isToday)
  const later = upcoming.filter(ev => !isToday(ev))
  const recentlyCompleted = eligible
    .filter(ev => completedMap?.has(ev.id))
    .sort((a,b) => new Date(completedMap.get(b.id)!.completed_at).getTime() - new Date(completedMap.get(a.id)!.completed_at).getTime())
    .slice(0, 10)

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">Appointments</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage meetings and scheduled customer time.
          </p>
        </div>
        <button
          onClick={onNewMeeting}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-[0.98] flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Appointment</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>
      {todays.length === 0 && later.length === 0 && recentlyCompleted.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-6 sm:p-8 text-center">
          <div className="w-11 h-11 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <CalendarIcon className="w-5 h-5 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">No appointments scheduled</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs mx-auto leading-relaxed">
            Schedule an appointment to keep customer time organized.
          </p>
          <button
            onClick={onNewMeeting}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Appointment
          </button>
        </div>
      ) : (
        <>
          {todays.length > 0 && renderGroup('Today', todays.length, todays)}
          {later.length > 0 && renderGroup('Upcoming', later.length, later)}
          {recentlyCompleted.length > 0 && renderGroup('Recently Completed', recentlyCompleted.length, recentlyCompleted)}
        </>
      )}
    </div>
  )
}

export default function SchedulePage() {
  const { user, authHydrated } = useAuth()
  const { business } = useBusiness()
  const supabase = createBrowserClient()
  const searchParams = useSearchParams()

  const [calendarConnected, setCalendarConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [isChangingMonth, setIsChangingMonth] = useState(false)
  const [eventsCache, setEventsCache] = useState<Map<string, CalendarEvent[]>>(new Map())
  const [currentMonthKey, setCurrentMonthKey] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${now.getMonth()}`
  })
  const [monthLoadError, setMonthLoadError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [isEventDetailsOpen, setIsEventDetailsOpen] = useState(false)
  const [selectedEventJob, setSelectedEventJob] = useState<Job | null>(null)
  const [selectedEventLead, setSelectedEventLead] = useState<{ id: string; name: string | null; caller_phone: string | null } | null>(null)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])
  const [scheduleTab, setScheduleTab] = useState<'agenda' | 'reminders' | 'jobs' | 'appointments' | 'calendar' | 'map'>(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'agenda' || tabParam === 'reminders' || tabParam === 'jobs' || tabParam === 'appointments' || tabParam === 'calendar' || tabParam === 'map') {
      return tabParam
    }
    return 'agenda'
  })

  // Jobs state
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)

  // Tasks state
  const [tasks, setTasks] = useState<any[]>([])
  const [newJobDefaultDate, setNewJobDefaultDate] = useState<Date | undefined>(undefined)
  const [isLeadPickerOpen, setIsLeadPickerOpen] = useState(false)
  const [isJobComposerOpen, setIsJobComposerOpen] = useState(false)
  const [jobComposerInitialFocus, setJobComposerInitialFocus] = useState<'location' | undefined>(undefined)
  const [jobPrefill, setJobPrefill] = useState<JobPrefill | undefined>(undefined)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [isJobDetailsOpen, setIsJobDetailsOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [eventDetailsMode, setEventDetailsMode] = useState<'details' | 'add-location'>('details')
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false)
  const [newlyCreatedLeadId, setNewlyCreatedLeadId] = useState<string | null>(null)
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false)
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null)
  const [taskRefreshTrigger, setTaskRefreshTrigger] = useState(0)
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false)
  const [newAppointmentContext, setNewAppointmentContext] = useState<'calendar' | 'customer' | 'meetings'>('calendar')
  const [newAppointmentPreselectedLeadId, setNewAppointmentPreselectedLeadId] = useState<string | null>(null)
  const [newAppointmentPreselectedLeadDisplay, setNewAppointmentPreselectedLeadDisplay] = useState<string | null>(null)
  const [newAppointmentRequireCustomer, setNewAppointmentRequireCustomer] = useState<boolean | undefined>(undefined)
  const [newAppointmentAllowAddCustomer, setNewAppointmentAllowAddCustomer] = useState<boolean | undefined>(undefined)
  const [newAppointmentLockCustomer, setNewAppointmentLockCustomer] = useState<boolean | undefined>(undefined)
  
  // Overflow menu state
  const [isCalendarOverflowOpen, setIsCalendarOverflowOpen] = useState(false)
  // Desktop refs
  const desktopCalendarOverflowRef = useRef<HTMLDivElement>(null)
  const desktopCalendarOverflowButtonRef = useRef<HTMLButtonElement>(null)
  // Mobile refs
  const mobileCalendarOverflowRef = useRef<HTMLDivElement>(null)
  const mobileCalendarOverflowButtonRef = useRef<HTMLButtonElement>(null)
  
  // Disconnect confirmation state
  const [isDisconnectConfirmOpen, setIsDisconnectConfirmOpen] = useState(false)

  // Map date navigation state
  const [mapSelectedDate, setMapSelectedDate] = useState<Date>(() => new Date())

  // Edit handlers for ScheduleMap
  const handleMapEditJob = useCallback((job: any) => {
    setSelectedJob(job as Job)
    setIsJobDetailsOpen(true)
  }, [])

  const handleMapAddLocationJob = useCallback((job: any) => {
    setEditingJob(job)
    setJobComposerInitialFocus('location')
    setIsJobComposerOpen(true)
  }, [])

  const handleMapEditTask = useCallback((task: any) => {
    setTaskToEdit(task)
    setIsNewTaskModalOpen(true)
  }, [])

  const handleAgendaEditTask = useCallback((task: any) => {
    setTaskToEdit(task)
    setIsNewTaskModalOpen(true)
  }, [])

  const handleToggleTaskComplete = useCallback(async (taskId: string, completed: boolean) => {
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      })
      if (!response.ok) return
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, completed: !completed, completed_at: !completed ? new Date().toISOString() : null }
          : t
      ))
      setTaskRefreshTrigger(prev => prev + 1)
    } catch (error) {
      console.error('[Schedule] Failed to toggle task:', error)
    }
  }, [])

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!response.ok) return
      setTasks(prev => prev.filter(t => t.id !== taskId))
      setTaskRefreshTrigger(prev => prev + 1)
    } catch (error) {
      console.error('[Schedule] Failed to delete task:', error)
    }
  }, [])

  const handleMapEditEvent = useCallback((event: any) => {
    setSelectedEvent(event)
    setEventDetailsMode('details')
    setIsEventDetailsOpen(true)
  }, [])

  const handleMapAddLocationEvent = useCallback((event: any) => {
    setSelectedEvent(event)
    setEventDetailsMode('add-location')
    setIsEventDetailsOpen(true)
  }, [])

  // Check for OAuth success/error redirect
  useEffect(() => {
    // Wait for auth hydration to complete before processing OAuth return
    // AUTH UNKNOWN is NOT UNAUTHENTICATED - must wait for session restoration
    if (!authHydrated) return

    if (searchParams) {
      const calendarStatus = searchParams.get('calendar')
      const status = searchParams.get('status') // From deep link (replyflow://calendar?status=...)

      if (calendarStatus === 'connected' || status === 'connected') {
        showToast('Google Calendar connected — your appointments will stay in sync', 'success')
        setIsConnecting(false)
        setTokenExpired(false)
        setScheduleTab('calendar') // Switch to Calendar tab after successful connection
        window.history.replaceState({}, '', '/dashboard/calendar')
        // Clear pending Google operation after successful return
        const { setPendingGoogleOperation } = require('@/lib/external-return-handler')
        setPendingGoogleOperation(null)
      } else if (calendarStatus === 'cancelled' || status === 'cancelled') {
        // User cancelled or denied access
        showToast('Google Calendar Not Connected. You can try again anytime.', 'info')
        setIsConnecting(false)
        window.history.replaceState({}, '', '/dashboard/calendar')
        // Clear pending Google operation on cancel
        const { setPendingGoogleOperation } = require('@/lib/external-return-handler')
        setPendingGoogleOperation(null)
      } else if (calendarStatus === 'error' || status === 'error') {
        // Genuine OAuth/server error
        showToast('Couldn\'t connect Google Calendar. Please try again.', 'error')
        setIsConnecting(false)
        window.history.replaceState({}, '', '/dashboard/calendar')
        // Clear pending Google operation on error
        const { setPendingGoogleOperation } = require('@/lib/external-return-handler')
        setPendingGoogleOperation(null)
      }

    }
  }, [searchParams, authHydrated])

  const fetchJobs = async () => {
    setIsLoadingJobs(true)
    try {
      const response = await fetch('/api/jobs')
      if (!response.ok) throw new Error('Failed to fetch jobs')
      const data = await response.json()
      setJobs(data.jobs || [])
    } catch (error) {
      console.error('[Schedule] Failed to fetch jobs:', error)
    } finally {
      setIsLoadingJobs(false)
    }
  }

  const fetchTasks = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) return

      const response = await fetch('/api/tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) return

      const data = await response.json()
      setTasks(data.tasks || [])
    } catch (error) {
      console.error('[Schedule] Failed to fetch tasks:', error)
    }
  }

  useEffect(() => {
    if (business) {
      fetchJobs()
      fetchTasks()
    }
  }, [business])

  
  // Resolve job and customer for selected event
  useEffect(() => {
    const resolve = async () => {
      if (!selectedEvent) {
        setSelectedEventJob(null)
        setSelectedEventLead(null)
        return
      }
      // Job by google_calendar_event_id
      const job = jobs.find(j => j.google_calendar_event_id === selectedEvent.id) || null
      setSelectedEventJob(job)
      // Lead precedence: job.lead_id then extendedProperties.private.replyflow_lead_id
      // @ts-ignore
      const replyLeadId = (selectedEvent?.extendedProperties?.private?.replyflow_lead_id as string) || null
      const leadId = job?.lead_id || replyLeadId || null
      if (!leadId) {
        setSelectedEventLead(null)
        return
      }
      try {
        const { data, error } = await supabase
          .from('leads')
          .select('id, caller_phone, raw_metadata')
          .eq('id', leadId)
          .single()
        if (!error && data) {
          const meta = data.raw_metadata || {}
          const name = meta.customerName || meta.callerName || meta.name || null
          setSelectedEventLead({ id: data.id, name, caller_phone: data.caller_phone })
        } else {
          setSelectedEventLead({ id: leadId, name: null, caller_phone: null })
        }
      } catch {
        setSelectedEventLead({ id: leadId, name: null, caller_phone: null })
      }
    }
    resolve()
  }, [selectedEvent, jobs])

  // Close overflow menu on outside click or Escape key
  useEffect(() => {
    if (!isCalendarOverflowOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const isClickInsideDesktopButton = desktopCalendarOverflowButtonRef.current?.contains(target)
      const isClickInsideDesktopMenu = desktopCalendarOverflowRef.current?.contains(target)
      const isClickInsideMobileButton = mobileCalendarOverflowButtonRef.current?.contains(target)
      const isClickInsideMobileMenu = mobileCalendarOverflowRef.current?.contains(target)

      if (!isClickInsideDesktopButton && !isClickInsideDesktopMenu && !isClickInsideMobileButton && !isClickInsideMobileMenu) {
        setIsCalendarOverflowOpen(false)
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCalendarOverflowOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscapeKey)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isCalendarOverflowOpen])

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, type }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const handleAddEvent = (date?: Date) => {
    // Open standalone appointment modal
    const dateToUse = date || selectedDay || new Date()
    setSelectedDay(dateToUse)
    setIsNewAppointmentModalOpen(true)
  }

  const handleConnectCalendar = async () => {
    // Prevent duplicate concurrent OAuth launches
    if (isConnecting) {
      console.log('[CALENDAR] Google Calendar connection already in progress, ignoring duplicate tap')
      return
    }

    setIsConnecting(true)
    try {
      console.log('[CALENDAR] Google Calendar connect started')
      const response = await fetch('/api/google/calendar/connect', {
        method: 'GET',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to initiate Google Calendar connection')
      }

      const data = await response.json() as { authUrl: string }
      console.log('[CALENDAR] OAuth URL received successfully')

      // Set pending operation so app resume can reconcile Google Calendar status
      const { setPendingGoogleOperation } = await import('@/lib/external-return-handler')
      await setPendingGoogleOperation('calendar_connect', user?.id)
      console.log('[CALENDAR] Pending Google operation set for user:', user?.id)

      // For iOS native: Use ASWebAuthenticationSession for automatic return-to-app
      // For Android native: Use Capacitor Browser plugin
      // For web: Use standard redirect
      if (isCapacitorNative()) {
        const platform = getCapacitorPlatform()
        const callbackHost = window.location.hostname

        if (platform === 'ios') {
          // iOS: Use ASWebAuthenticationSession for automatic return-to-app
          // IMPORTANT: callbackPath must NOT include query parameters for ASWebAuthenticationSession matching
          // We manually navigate with query parameters after callback is received
          const { default: ReplyflowWebCheckoutPlugin } = await import('@/lib/web-checkout')
          console.log('[CALENDAR] Opening in ASWebAuthenticationSession on iOS')
          const result = await ReplyflowWebCheckoutPlugin.openCheckoutSession({
            url: data.authUrl,
            callbackHost,
            callbackPath: '/dashboard/calendar', // Path only - no query parameters
          })
          console.log('[CALENDAR] ASWebAuthenticationSession result:', result)

          // Handle user cancellation immediately
          if (result.canceled) {
            console.log('[CALENDAR] User canceled Google Calendar OAuth')
            showToast('Google Calendar Not Connected. You can try again anytime.', 'info')
            // Clear pending operation on cancel
            try {
              const { setPendingGoogleOperation } = await import('@/lib/external-return-handler')
              await setPendingGoogleOperation(null)
            } catch {}
            setIsConnecting(false)
            return
          }

          // Handle native session error
          if (!result.completed && !result.canceled) {
            console.error('[CALENDAR] Native session error:', result)
            throw new Error(result.errorMessage || 'Native authentication session failed')
          }

          // Handle successful callback - manually navigate with query parameters
          if (result.completed && result.callbackMatched) {
            console.log('[CALENDAR] Callback matched, navigating with calendar=connected')
            window.location.href = '/dashboard/calendar?calendar=connected'
            return
          }
        } else {
          // Android: Use Capacitor Browser plugin
          const { Browser } = await import('@capacitor/browser')
          console.log('[CALENDAR] Opening in system browser (Android)')
          await Browser.open({ url: data.authUrl })
        }
      } else {
        // Web: Standard redirect
        console.log('[CALENDAR] Redirecting to Google OAuth (web)')
        window.location.href = data.authUrl
      }

      // Note: Loading state will be reset on app return via URL param handling
      // or on error. We don't reset it here to avoid race conditions with OAuth completion.
    } catch (error) {
      console.error('[CALENDAR] Failed to connect calendar:', error)
      showToast('Couldn\'t connect calendar', 'error')
      // Clear pending operation on error
      try {
        const { setPendingGoogleOperation } = await import('@/lib/external-return-handler')
        await setPendingGoogleOperation(null)
      } catch {}
      // Reset loading state on error
      setIsConnecting(false)
    } finally {
      // For web, we redirect so loading state doesn't matter
      if (!isCapacitorNative()) {
        setIsConnecting(false)
      }
    }
  }

  const handleConnectCalendarWithExplanation = async () => {
    handleConnectCalendar()
  }

  const handleDisconnectCalendar = async () => {
    setIsDisconnectConfirmOpen(true)
  }

  const confirmDisconnectCalendar = async () => {
    setIsDisconnectConfirmOpen(false)
    setIsDisconnecting(true)
    try {
      const response = await fetch('/api/google/calendar/disconnect', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to disconnect calendar' }))
        throw new Error(errorData.error || 'Failed to disconnect calendar')
      }

      setCalendarConnected(false)
      setCalendarEmail(null)
      setEvents([])
      setLastSyncTime(null)
      setTokenExpired(false)
      showToast('Calendar disconnected', 'success')

      // Refresh connection status to ensure consistency
      await fetchCalendarStatus()
    } catch (error) {
      showToast('Couldn\'t disconnect calendar', 'error')
    } finally {
      setIsDisconnecting(false)
    }
  }

  const handleDayClick = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return

    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const clickedDate = new Date(year, month, day)
    setSelectedDay(clickedDate)
  }

  // Calculate business-local today for calendar highlighting
  const businessLocalToday = useMemo(() => {
    if (!business) return new Date()
    const businessTimezone = business.business_hours_timezone || 'UTC'
    const normalizedTimezone = normalizeBusinessTimezone(businessTimezone)
    const now = new Date()
    const businessNow = toZonedTime(now, normalizedTimezone)
    return new Date(businessNow.getFullYear(), businessNow.getMonth(), businessNow.getDate())
  }, [business])

  // Initialize calendar to business-local month when business loads
  useEffect(() => {
    if (!business) return
    const businessTimezone = business.business_hours_timezone || 'UTC'
    const normalizedTimezone = normalizeBusinessTimezone(businessTimezone)
    const now = new Date()
    const businessNow = toZonedTime(now, normalizedTimezone)
    const newMonth = new Date(businessNow.getFullYear(), businessNow.getMonth(), 1)
    const newMonthKey = `${businessNow.getFullYear()}-${businessNow.getMonth()}`
    setCurrentMonth(newMonth)
    setCurrentMonthKey(newMonthKey)
  }, [business?.id])

  const getTodayKey = getTodayLocalDateKey
  const getDateKey = getLocalDateKey

  const getTodayCounts = () => {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const appointments = events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      const eventDate = new Date(eventDateRaw)
      return eventDate >= startOfDay && eventDate <= endOfDay
    }).length

    const todayKey = getTodayKey()
    const jobCount = jobs.filter(j => j.scheduled_date === todayKey && j.status !== 'cancelled').length

    return { appointments, jobs: jobCount }
  }

  const getThisWeekCounts = () => {
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endOfWeek.setHours(23, 59, 59, 999)

    const appointments = events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false
      const eventDate = new Date(eventDateRaw)
      return eventDate >= startOfWeek && eventDate <= endOfWeek
    }).length

    const startKey = getDateKey(startOfWeek)
    const endKey = getDateKey(endOfWeek)
    const jobCount = jobs.filter(j => {
      if (!j.scheduled_date || j.status === 'cancelled') return false
      return j.scheduled_date >= startKey && j.scheduled_date <= endKey
    }).length

    return { appointments, jobs: jobCount }
  }

  const getThisMonthCounts = () => {
    return getMonthCounts(currentMonth, events, jobs, tasks)
  }

  const getEventsForDay = (date: Date) => {
    const dayKey = getDateKey(date)
    return events.filter(event => {
      const eventDateRaw = event.start?.dateTime || event.start?.date
      if (!eventDateRaw) return false

      const eventStartDayKey = eventDateRaw.includes('T')
        ? eventDateRaw.split('T')[0]
        : eventDateRaw

      const eventEndRaw = event.end?.dateTime || event.end?.date
      if (eventEndRaw) {
        const eventEndDayKey = eventEndRaw.includes('T')
          ? eventEndRaw.split('T')[0]
          : eventEndRaw

        const isAllDay = !event.start?.dateTime && !!event.start?.date
        const effectiveEndDate = isAllDay
          ? new Date(eventEndDayKey).getTime() - 86400000
          : new Date(eventEndDayKey).getTime()

        const dayTimestamp = new Date(dayKey).getTime()
        const startTimestamp = new Date(eventStartDayKey).getTime()

        return dayTimestamp >= startTimestamp && dayTimestamp <= effectiveEndDate
      }

      return eventStartDayKey === dayKey
    })
  }

  const fetchCalendarStatus = async (): Promise<{ connected: boolean }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setCalendarConnected(false)
        setIsLoading(false)
        setIsInitialLoad(false)
        return { connected: false }
      }

      const response = await fetch('/api/google/calendar/status?provider=google', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          setCalendarConnected(false)
          setIsLoading(false)
          setIsInitialLoad(false)
          return { connected: false }
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[GOOGLE CALENDAR SYNC] Status error:', errorData)
        throw new Error('Failed to fetch calendar status')
      }

      const data = await response.json()

      // Set connection status first
      setCalendarConnected(data.connected || false)
      setCalendarEmail(data.calendarEmail || null)
      if (data.connectedAt) {
        setLastSyncTime(new Date(data.connectedAt))
      }

      // Only clear loading state after connection status is determined
      setIsLoading(false)
      setIsInitialLoad(false)

      if (data.connected) {
        await fetchEvents()
      }

      return { connected: data.connected || false }
    } catch (error) {
      console.error('[GOOGLE CALENDAR SYNC ERROR] Error fetching calendar status:', error)
      setCalendarConnected(false)
      setIsLoading(false)
      setIsInitialLoad(false)
      return { connected: false }
    }
  }

  const fetchEvents = async (monthKey?: string) => {
    const targetMonthKey = monthKey || currentMonthKey
    setIsLoadingEvents(true)
    setMonthLoadError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      // Calculate date range for the visible month (including leading/trailing days)
      const year = currentMonth.getFullYear()
      const monthIndex = currentMonth.getMonth()
      const firstDayOfMonth = new Date(year, monthIndex, 1)
      const lastDayOfMonth = new Date(year, monthIndex + 1, 0)
      const startDayOfWeek = firstDayOfMonth.getDay()
      
      // Start from first day of the grid (may include previous month days)
      const gridStart = new Date(year, monthIndex, 1 - startDayOfWeek)
      gridStart.setHours(0, 0, 0, 0)
      
      // End at last day of the grid (may include next month days)
      const daysInMonth = lastDayOfMonth.getDate()
      const remainingDays = 42 - (startDayOfWeek + daysInMonth)
      const gridEnd = new Date(year, monthIndex + 1, remainingDays)
      gridEnd.setHours(23, 59, 59, 999)

      const response = await fetch(
        `/api/google/calendar/events?timeMin=${gridStart.toISOString()}&timeMax=${gridEnd.toISOString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[GOOGLE CALENDAR SYNC ERROR] Events error', errorData)
        
        // Handle token expiration
        if (response.status === 401) {
          setTokenExpired(true)
          throw new Error('Google Calendar connection requires reauthentication')
        }
        
        throw new Error('We couldn\'t load your calendar events. Please try again.')
      }

      const data = await response.json()
      
      // Update last sync time
      setLastSyncTime(new Date())
      
      // Deduplicate events by id
      const uniqueEvents = Array.from(
        new Map((data.events || []).map((event: CalendarEvent) => [event.id, event])).values()
      ) as CalendarEvent[]
      
      setEvents(uniqueEvents)
      
      // Cache the events for this month
      setEventsCache(prev => new Map(prev).set(targetMonthKey, uniqueEvents))
    } catch (error) {
      console.error('[GOOGLE CALENDAR SYNC ERROR] Events error', error)
      setMonthLoadError('We couldn\'t load your calendar events. Please try again.')
      showToast('We couldn\'t load your calendar events. Please try again.', 'error')
    } finally {
      setIsLoadingEvents(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await fetchEvents()
      // Check if events were actually fetched
      if (events.length === 0) {
        showToast('Calendar synced (no events found)', 'info')
      } else {
        showToast('Calendar synced successfully', 'success')
      }
    } catch (error) {
      console.error('[GOOGLE CALENDAR SYNC ERROR] Sync failed:', error)
      showToast('Couldn\'t sync calendar. Please try again.', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  const openNewJob = () => {
    setEditingJob(null)
    setJobPrefill(undefined)
    setNewJobDefaultDate(undefined)
    setIsJobComposerOpen(true)
  }

  const handleJobSaved = (job: Job) => {
    setJobs(prev => {
      const idx = prev.findIndex(j => j.id === job.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = job
        return updated
      }
      return [job, ...prev]
    })
    setEditingJob(null)
    setJobPrefill(undefined)
    setNewJobDefaultDate(undefined)
    // Toast is now shown by JobComposer via onShowToast
  }

  const handleJobStatusChange = (job: Job, status: JobStatus) => {
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status } : j))
    setSelectedJob(prev => prev?.id === job.id ? { ...prev, status } : prev)
  }

  const handleJobDeleted = (job: Job) => {
    setJobs(prev => prev.filter(j => j.id !== job.id))
    showToast('Job removed', 'success')
  }

  const getJobsForDay = (date: Date): Job[] => {
    const dayKey = getDateKey(date)
    return jobs.filter(j => j.scheduled_date === dayKey)
  }

  const getTasksForDay = (date: Date): Task[] => {
    const dayKey = getDateKey(date)
    return tasks.filter(t => t.due_date === dayKey && !t.completed)
  }

  const handleCalendarItemClick = (item: { id: string; type: 'appointment' | 'job' | 'task' }) => {
    if (item.type === 'job') {
      const job = jobs.find(j => j.id === item.id)
      if (job) {
        setSelectedJob(job)
        setIsJobDetailsOpen(true)
      }
      return
    }

    if (item.type === 'task') {
      const task = tasks.find(t => t.id === item.id)
      if (task) {
        setTaskToEdit(task)
        setIsNewTaskModalOpen(true)
      }
      return
    }

    const event = events.find(e => e.id === item.id)
    if (!event) return

    // Job-linked calendar events are owned by the job; open job details
    const linkedJob = jobs.find(j => j.google_calendar_event_id === event.id)
    if (linkedJob) {
      setSelectedJob(linkedJob)
      setIsJobDetailsOpen(true)
      return
    }

    setSelectedEvent(event)
    setEventDetailsMode('details')
    setIsEventDetailsOpen(true)
  }

  useEffect(() => {
    if (business) {
      fetchCalendarStatus()
    }
  }, [business])

  // Refresh connection status when app resumes (Capacitor only)
  useEffect(() => {
    if (!isCapacitorNative()) return

    const handleAppStateChange = async () => {
      console.log('[Calendar Page] App resumed, refreshing connection status')
      const { connected } = await fetchCalendarStatus()
      // Clear connecting state if calendar is connected
      // This handles the case where OAuth completed but URL callback was missed
      if (connected) {
        console.log('[Calendar Page] Calendar connected on resume, clearing connecting state')
        setIsConnecting(false)
      }
    }

    // Listen for app state changes
    let listenerHandle: Promise<{ remove: () => void }> | null = null
    const setupAppStateListener = async () => {
      try {
        const { App } = await import('@capacitor/app')
        listenerHandle = App.addListener('appStateChange', async ({ isActive }) => {
          if (isActive) {
            console.log('[Calendar Page] App became active')
            await handleAppStateChange()
          }
        })
      } catch (error) {
        console.error('[Calendar Page] Failed to set up app state listener:', error)
      }
    }

    setupAppStateListener()

    return () => {
      // Cleanup only this listener on unmount
      if (listenerHandle) {
        listenerHandle.then(handle => handle.remove()).catch(error => {
          console.error('[Calendar Page] Failed to remove app state listener:', error)
        })
      }
    }
  }, [business])

  // Fetch events when month changes (only for initial load or sync)
  useEffect(() => {
    if (calendarConnected && !isLoading && !isChangingMonth && events.length === 0) {
      fetchEvents()
    }
  }, [calendarConnected, isLoading, currentMonthKey])

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) {
      return 'just now'
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60)
    if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`
    }
    
    const diffInDays = Math.floor(diffInHours / 24)
    return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`
  }

  const isAllDay = (start: { dateTime?: string; date?: string }) => {
    return !!start.date
  }

  const handleNewAppointment = () => {
    // Check if Google Calendar is connected before allowing standalone appointments
    if (!calendarConnected) {
      showToast('Connect Google Calendar to create standalone appointments', 'error')
      return
    }
    // Open standalone appointment modal
    setIsNewAppointmentModalOpen(true)
  }

  const goToPreviousMonth = () => {
    if (isChangingMonth) return
    
    setIsChangingMonth(true)
    setCurrentMonth(prev => {
      const newMonth = new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
      const newMonthKey = `${newMonth.getFullYear()}-${newMonth.getMonth()}`
      setCurrentMonthKey(newMonthKey)
      
      // Check if events are cached
      const cachedEvents = eventsCache.get(newMonthKey)
      if (cachedEvents) {
        setEvents(cachedEvents)
        setIsChangingMonth(false)
      } else {
        fetchEvents(newMonthKey).finally(() => setIsChangingMonth(false))
      }
      
      return newMonth
    })
  }

  const goToNextMonth = () => {
    if (isChangingMonth) return
    
    setIsChangingMonth(true)
    setCurrentMonth(prev => {
      const newMonth = new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
      const newMonthKey = `${newMonth.getFullYear()}-${newMonth.getMonth()}`
      setCurrentMonthKey(newMonthKey)
      
      // Check if events are cached
      const cachedEvents = eventsCache.get(newMonthKey)
      if (cachedEvents) {
        setEvents(cachedEvents)
        setIsChangingMonth(false)
      } else {
        fetchEvents(newMonthKey).finally(() => setIsChangingMonth(false))
      }
      
      return newMonth
    })
  }

  const goToToday = () => {
    if (!business) return

    // Get business-local today
    const businessTimezone = business.business_hours_timezone || 'UTC'
    const normalizedTimezone = normalizeBusinessTimezone(businessTimezone)
    const now = new Date()

    // Convert to business timezone
    const businessNow = toZonedTime(now, normalizedTimezone)
    const todayYear = businessNow.getFullYear()
    const todayMonth = businessNow.getMonth()
    const todayDay = businessNow.getDate()

    // Create business-local today date
    const businessToday = new Date(todayYear, todayMonth, todayDay)

    // Update visible month to today's month
    const newMonth = new Date(todayYear, todayMonth, 1)
    const newMonthKey = `${todayYear}-${todayMonth}`

    setCurrentMonth(newMonth)
    setCurrentMonthKey(newMonthKey)

    // Select today's date
    setSelectedDay(businessToday)

    // Check if events are cached
    const cachedEvents = eventsCache.get(newMonthKey)
    if (cachedEvents) {
      setEvents(cachedEvents)
    } else {
      fetchEvents(newMonthKey)
    }
  }

  const handleMapPreviousDay = useCallback(() => {
    setMapSelectedDate(prev => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() - 1)
      return newDate
    })
  }, [])

  const handleMapNextDay = useCallback(() => {
    setMapSelectedDate(prev => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() + 1)
      return newDate
    })
  }, [])

  const handleMapGoToToday = useCallback(() => {
    setMapSelectedDate(new Date())
  }, [])

  const handleMapViewCustomer = useCallback((leadId: string) => {
    // Navigate to lead detail page
    window.location.href = `/dashboard/leads/${leadId}`
  }, [])

  const handleMapViewJob = useCallback((jobId: string) => {
    const job = jobs.find(j => j.id === jobId)
    if (job) {
      setSelectedJob(job)
      setIsJobDetailsOpen(true)
    }
  }, [jobs])

  // Filter events to only show those in the visible month
  const visibleMonthEvents = filterEventsByMonth(
    events,
    currentMonth.getFullYear(),
    currentMonth.getMonth()
  )

  if (!business) {
    return (
      <DashboardShell
        title="Schedule"
        contentClassName="flex-1 flex items-center justify-center px-4 sm:px-5 lg:px-7 pb-20 md:pb-10 relative z-10"
        innerClassName=""
        maxWidthClassName="max-w-[1400px] mx-auto"
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-muted-foreground">Loading...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      title="Schedule"
      contentClassName="flex-1 pt-6 sm:pt-8 lg:pt-10 px-4 sm:px-5 lg:px-7 pb-20 md:pb-10 relative z-10"
      contentStyle={{ paddingBottom: 'max(80px, calc(80px + env(safe-area-inset-bottom)))' }}
      innerClassName=""
      maxWidthClassName="max-w-[1400px] mx-auto"
    >
              {/* Loading State */}
              {isLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[340px_1fr] gap-6 items-stretch py-6">
                  {/* Skeleton Today's Schedule */}
                  <div className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-6 animate-pulse">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2"></div>
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-14 bg-slate-200 dark:bg-slate-700 rounded-lg mb-2"></div>
                    ))}
                  </div>
                  {/* Skeleton Calendar */}
                  <div>
                    <div className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-6 mb-4 animate-pulse">
                      <div className="flex items-center gap-2">
                        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-10"></div>
                        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded flex-1 w-1/3"></div>
                        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-32"></div>
                      </div>
                    </div>
                    <div className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-6 animate-pulse">
                      <div className="grid grid-cols-7 gap-2 mb-4">
                        {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-8 bg-slate-200 dark:bg-slate-700 rounded"></div>)}
                      </div>
                      <div className="grid grid-cols-7 gap-2">
                        {[...Array(35)].map((_, i) => <div key={i} className="h-20 bg-slate-200 dark:bg-slate-700 rounded"></div>)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Mobile-first: Calendar first, then Today's Schedule. Desktop: Today's Schedule sticky on left */}
                  <div className="grid grid-cols-1 gap-6 lg:gap-5 items-stretch">

                  {/* Tab toggle + Calendar / Today content */}
                  <div className="min-w-0">

                  {/* Schedule Tab Toggle */}
                  <div className="hidden md:flex mb-3">
                    <div className="inline-flex bg-slate-100/50 dark:bg-slate-800/40 rounded-md p-0.5 w-fit border border-slate-200/40 dark:border-slate-700/25">
                      <button
                        onClick={() => setScheduleTab('agenda')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all duration-200 ease-out ${
                          scheduleTab === 'agenda'
                            ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-sm'
                        }`}
                      >
                        <CheckCircle2 className={`w-4 h-4 ${scheduleTab === 'agenda' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                        Agenda
                      </button>
                      <button
                        onClick={() => setScheduleTab('reminders')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all duration-200 ease-out ${
                          scheduleTab === 'reminders'
                            ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-sm'
                        }`}
                      >
                        <Bell className={`w-4 h-4 ${scheduleTab === 'reminders' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                        Reminders
                      </button>
                      <button
                        onClick={() => setScheduleTab('jobs')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all duration-200 ease-out ${
                          scheduleTab === 'jobs'
                            ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-sm'
                        }`}
                      >
                        <Briefcase className={`w-4 h-4 ${scheduleTab === 'jobs' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                        Jobs
                      </button>
                      <button
                        onClick={() => setScheduleTab('appointments')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all duration-200 ease-out ${
                          scheduleTab === 'appointments'
                            ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-sm'
                        }`}
                      >
                        <CalendarIcon className={`w-4 h-4 ${scheduleTab === 'appointments' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                        Appointments
                      </button>
                      <button
                        onClick={() => setScheduleTab('calendar')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all duration-200 ease-out ${
                          scheduleTab === 'calendar'
                            ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-sm'
                        }`}
                      >
                        <CalendarIcon className={`w-4 h-4 ${scheduleTab === 'calendar' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                        Calendar
                      </button>
                      <button
                        onClick={() => setScheduleTab('map')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all duration-200 ease-out ${
                          scheduleTab === 'map'
                            ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-sm'
                        }`}
                      >
                        <MapIcon className={`w-4 h-4 ${scheduleTab === 'map' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                        Map
                      </button>
                    </div>
                  </div>

                  {/* Mobile tab toggle (horizontal scroll for 6 tabs) */}
                  <div className="md:hidden mb-4 mt-2">
                    <div className="bg-slate-100/50 dark:bg-slate-800/40 rounded-md p-0.5 border border-slate-200/40 dark:border-slate-700/25">
                      <div className="flex gap-0.5 overflow-x-auto no-scrollbar">
                        <button
                          onClick={() => setScheduleTab('agenda')}
                          className={`flex items-center justify-center gap-1 py-2 px-2.5 rounded-md font-medium transition-all duration-200 ease-out whitespace-nowrap flex-shrink-0 ${
                            scheduleTab === 'agenda'
                              ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-xs'
                          }`}
                        >
                          <CheckCircle2 className={`w-3 h-3 ${scheduleTab === 'agenda' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span>Agenda</span>
                        </button>
                        <button
                          onClick={() => setScheduleTab('reminders')}
                          className={`flex items-center justify-center gap-1 py-2 px-2.5 rounded-md font-medium transition-all duration-200 ease-out whitespace-nowrap flex-shrink-0 ${
                            scheduleTab === 'reminders'
                              ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-xs'
                          }`}
                        >
                          <Bell className={`w-3 h-3 ${scheduleTab === 'reminders' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span>Reminders</span>
                        </button>
                        <button
                          onClick={() => setScheduleTab('jobs')}
                          className={`flex items-center justify-center gap-1 py-2 px-2.5 rounded-md font-medium transition-all duration-200 ease-out whitespace-nowrap flex-shrink-0 ${
                            scheduleTab === 'jobs'
                              ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-xs'
                          }`}
                        >
                          <Briefcase className={`w-3 h-3 ${scheduleTab === 'jobs' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span>Jobs</span>
                        </button>
                        <button
                          onClick={() => setScheduleTab('appointments')}
                          className={`flex items-center justify-center gap-1 py-2 px-2.5 rounded-md font-medium transition-all duration-200 ease-out whitespace-nowrap flex-shrink-0 ${
                            scheduleTab === 'appointments'
                              ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-xs'
                          }`}
                        >
                          <CalendarIcon className={`w-3 h-3 ${scheduleTab === 'appointments' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span>Appts</span>
                        </button>
                        <button
                          onClick={() => setScheduleTab('calendar')}
                          className={`flex items-center justify-center gap-1 py-2 px-2.5 rounded-md font-medium transition-all duration-200 ease-out whitespace-nowrap flex-shrink-0 ${
                            scheduleTab === 'calendar'
                              ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-xs'
                          }`}
                        >
                          <CalendarIcon className={`w-3 h-3 ${scheduleTab === 'calendar' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span>Calendar</span>
                        </button>
                        <button
                          onClick={() => setScheduleTab('map')}
                          className={`flex items-center justify-center gap-1 py-2 px-2.5 rounded-md font-medium transition-all duration-200 ease-out whitespace-nowrap flex-shrink-0 ${
                            scheduleTab === 'map'
                              ? 'bg-white dark:bg-slate-700/60 text-slate-900 dark:text-foreground text-xs'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/30 text-xs'
                          }`}
                        >
                          <MapIcon className={`w-3 h-3 ${scheduleTab === 'map' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span>Map</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Agenda Tab */}
                  {scheduleTab === 'agenda' && (
                    <>
                      {/* Focus - Unified Intelligence for Schedule */}
                      <FocusSection business={business} view="schedule" title="Schedule Focus" compact />
                      <TodayCommandCenter
                        jobs={jobs}
                        calendarEvents={events}
                        onAddTask={() => setIsNewTaskModalOpen(true)}
                        onEditTask={handleAgendaEditTask}
                        onAddJob={openNewJob}
                        onAddAppointment={handleNewAppointment}
                        onJobClick={(job) => {
                          setSelectedJob(job as Job)
                          setIsJobDetailsOpen(true)
                        }}
                        onEditJob={(job) => {
                          setEditingJob(job)
                          setJobPrefill(undefined)
                          setNewJobDefaultDate(undefined)
                          setIsJobComposerOpen(true)
                        }}
                        onDeleteJob={handleJobDeleted}
                        onEditAppointment={(event) => {
                          setSelectedEvent(event)
                          setEventDetailsMode('details')
                          setIsEventDetailsOpen(true)
                        }}
                        onDeleteAppointment={() => {
                          if (selectedEvent) {
                            // The EventDetailsModal handles the actual deletion
                            setSelectedEvent(selectedEvent)
                            setEventDetailsMode('details')
                            setIsEventDetailsOpen(true)
                          }
                        }}
                        taskRefreshTrigger={taskRefreshTrigger}
                        onNavigateTab={(tab) => setScheduleTab(tab)}
                      />
                    </>
                  )}

                  {/* Reminders Tab */}
                  {scheduleTab === 'reminders' && (
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">Reminders</h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Manage reminders and follow-ups.
                          </p>
                        </div>
                        <button
                          onClick={() => setIsNewTaskModalOpen(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-[0.98] flex-shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="hidden sm:inline">Add Reminder</span>
                          <span className="sm:hidden">Add</span>
                        </button>
                      </div>
                      <RemindersList
                        tasks={tasks}
                        onEditTask={handleAgendaEditTask}
                        onAddTask={() => setIsNewTaskModalOpen(true)}
                        onToggleComplete={handleToggleTaskComplete}
                        onDeleteTask={handleDeleteTask}
                      />
                    </div>
                  )}

                  {/* Jobs Tab */}
                  {scheduleTab === 'jobs' && (
                    <JobsTab
                      jobs={jobs}
                      isLoading={isLoadingJobs}
                      onNewJob={openNewJob}
                      onJobClick={(job) => {
                        setSelectedJob(job as Job)
                        setIsJobDetailsOpen(true)
                      }}
                      onEditJob={(job) => {
                        setEditingJob(job)
                        setJobPrefill(undefined)
                        setNewJobDefaultDate(undefined)
                        setIsJobComposerOpen(true)
                      }}
                    />
                  )}

                  {/* Appointments Tab */}
                  {scheduleTab === 'appointments' && (
                    <MeetingsTab
                      events={events}
                      jobs={jobs}
                      onOpenEvent={(event) => {
                        setSelectedEvent(event)
                        setEventDetailsMode('details')
                        setIsEventDetailsOpen(true)
                      }}
                      onViewCustomer={handleMapViewCustomer}
                      onNewMeeting={handleNewAppointment}
                      completedMap={new Map()}
                    />
                  )}

                  {/* Connected State — Calendar Tab */}
                  {calendarConnected && scheduleTab === 'calendar' && (
                    <div>
                      {/* Calendar Header */}
                      <div className="mb-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
                          Calendar
                        </h2>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          See when your jobs and appointments are scheduled.
                        </p>
                      </div>

                      {/* Token Expired Warning Banner - show first if needed */}
                      {tokenExpired && (
                        <div className="mb-4">
                          <div className="bg-amber-900/20 border border-amber-800 rounded-xl p-3 sm:p-6">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex items-start gap-2">
                                <div className="w-6 h-6 bg-amber-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                </div>
                                <div>
                                  <h3 className="text-xs sm:text-sm font-semibold text-amber-100 mb-0.5">
                                    Reauthentication required
                                  </h3>
                                  <p className="text-[10px] sm:text-xs text-amber-300">
                                    Google Calendar access expired. Please reconnect.
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={handleConnectCalendar}
                                disabled={isConnecting}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex-shrink-0"
                              >
                                {isConnecting ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Connecting...</span>
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span>Reconnect</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Compact Status Bar - Desktop: Simplified */}
                      <div className="hidden md:flex items-center justify-between gap-4 mb-4 px-3 py-2.5 bg-white dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-700/25 rounded-lg">
                        {/* Equal-width summary columns */}
                        <div className="grid grid-cols-3 gap-4 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-slate-900 dark:text-foreground">{getThisMonthCounts().reminders}</span>
                              <span className="text-slate-500/70 dark:text-slate-500 ml-1">{getThisMonthCounts().reminders === 1 ? 'reminder' : 'reminders'}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-slate-900 dark:text-foreground">{getThisMonthCounts().jobs}</span>
                              <span className="text-slate-500/70 dark:text-slate-500 ml-1">{getThisMonthCounts().jobs === 1 ? 'job' : 'jobs'}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-slate-900 dark:text-foreground">{getThisMonthCounts().appointments}</span>
                              <span className="text-slate-500/70 dark:text-slate-500 ml-1">{getThisMonthCounts().appointments === 1 ? 'appointment' : 'appointments'}</span>
                            </p>
                          </div>
                        </div>

                        {/* Calendar Status & Actions - Simplified */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-500/10 dark:bg-emerald-500/10 rounded-md border border-emerald-500/20 dark:border-emerald-500/20">
                            <div className="w-1.5 h-1.5 bg-emerald-600 dark:bg-emerald-400 rounded-full"></div>
                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Connected</span>
                          </div>
                          <button
                            onClick={() => handleAddEvent()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors active:scale-[0.98]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>New Appointment</span>
                          </button>
                          <div className="relative">
                            <button
                              ref={desktopCalendarOverflowButtonRef}
                              onClick={() => setIsCalendarOverflowOpen(!isCalendarOverflowOpen)}
                              className="inline-flex items-center justify-center p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {isCalendarOverflowOpen && (
                                <div
                                  ref={desktopCalendarOverflowRef}
                                  className="absolute right-0 top-full mt-1 z-[50] bg-card border border-border/60 rounded-lg shadow-lg shadow-black/10 py-1 min-w-[160px] max-w-[220px]"
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      setIsCalendarOverflowOpen(false)
                                      handleSync()
                                    }}
                                    disabled={isSyncing || isDisconnecting}
                                    className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isSyncing ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                        <span>Syncing...</span>
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCw className="w-4 h-4 text-muted-foreground" />
                                        <span>Sync</span>
                                      </>
                                    )}
                                  </button>
                                  <div className="border-t border-border/40 my-1"></div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      setIsCalendarOverflowOpen(false)
                                      handleDisconnectCalendar()
                                    }}
                                    disabled={isDisconnecting || isSyncing}
                                    className="w-full px-3 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isDisconnecting ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin" />
                                        <span>Disconnecting...</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        <span>Disconnect</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                            )}
                          </div>
                        </div>
                      </div>

                      
                      {/* Mobile: Compact Metrics - equal-width columns */}
                      <div className="md:hidden mb-3">
                        <div className="grid grid-cols-3 gap-2 p-2 bg-white dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-700/25 rounded-md">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                            <span className="text-xs font-medium text-slate-900 dark:text-foreground">{getThisMonthCounts().reminders}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">{getThisMonthCounts().reminders === 1 ? 'reminder' : 'reminders'}</span>
                          </div>
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                            <span className="text-xs font-medium text-slate-900 dark:text-foreground">{getThisMonthCounts().jobs}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">{getThisMonthCounts().jobs === 1 ? 'job' : 'jobs'}</span>
                          </div>
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                            <span className="text-xs font-medium text-slate-900 dark:text-foreground">{getThisMonthCounts().appointments}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">{getThisMonthCounts().appointments === 1 ? 'appointment' : 'appointments'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Calendar Header - mobile only */}
                      <div className="flex md:hidden items-center justify-between gap-2 mb-3 p-2 bg-white dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-700/25 rounded-md">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                          <div>
                            <p className="text-xs font-medium text-slate-900 dark:text-foreground">Google Calendar</p>
                            {lastSyncTime && (
                              <p className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70 font-normal">Connected • {formatTimeAgo(lastSyncTime)}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAddEvent()}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors active:scale-[0.98]"
                          >
                            <Plus className="w-3 h-3" />
                            <span>New</span>
                          </button>
                          <div className="relative">
                            <button
                              ref={mobileCalendarOverflowButtonRef}
                              onClick={() => setIsCalendarOverflowOpen(!isCalendarOverflowOpen)}
                              className="inline-flex items-center justify-center p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-md transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {isCalendarOverflowOpen && (
                                <div
                                  ref={mobileCalendarOverflowRef}
                                  className="absolute right-0 top-full mt-1 z-[50] bg-card border border-border/60 rounded-lg shadow-lg shadow-black/10 py-1 min-w-[160px] max-w-[220px]"
                                >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        setIsCalendarOverflowOpen(false)
                                        handleSync()
                                      }}
                                      disabled={isSyncing || isDisconnecting}
                                      className="w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {isSyncing ? (
                                        <>
                                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                          <span>Syncing...</span>
                                        </>
                                      ) : (
                                        <>
                                          <RefreshCw className="w-4 h-4 text-muted-foreground" />
                                          <span>Sync</span>
                                        </>
                                      )}
                                    </button>
                                    <div className="border-t border-border/40 my-1"></div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        setIsCalendarOverflowOpen(false)
                                        handleDisconnectCalendar()
                                      }}
                                      disabled={isDisconnecting || isSyncing}
                                      className="w-full px-3 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {isDisconnecting ? (
                                        <>
                                          <div className="w-4 h-4 border-2 border-red-600 dark:border-red-400 border-t-transparent rounded-full animate-spin" />
                                          <span>Disconnecting...</span>
                                        </>
                                      ) : (
                                        <>
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                          <span>Disconnect</span>
                                        </>
                                      )}
                                    </button>
                                </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Calendar Grid */}
                      <div className="grid grid-cols-1 gap-6">
                        <CalendarGrid
                          month={currentMonth}
                          events={visibleMonthEvents}
                          jobs={jobs}
                          tasks={tasks}
                          selectedDay={selectedDay}
                          businessLocalToday={businessLocalToday}
                          onPreviousMonth={goToPreviousMonth}
                          onNextMonth={goToNextMonth}
                          onToday={goToToday}
                          onAddEvent={handleAddEvent}
                          onDayClick={handleDayClick}
                          onEventClick={handleCalendarItemClick}
                        />

                        {/* Selected Day Events - shown inline below calendar */}
                        {selectedDay && (
                          <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-6 sm:p-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                              <h3 className="text-lg font-semibold text-foreground">
                                {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                              </h3>
                              <div className="flex items-center gap-2">
                                {calendarConnected && (
                                  <a
                                    href="https://calendar.google.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                                  >
                                    Open Google Calendar
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                <button
                                  onClick={() => setSelectedDay(null)}
                                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  Close
                                </button>
                              </div>
                            </div>

                            {/* Events for selected day */}
                            {(() => {
                              const dayEvents = getEventsForDay(selectedDay)
                              const dayJobs = getJobsForDay(selectedDay)
                              const dayTasks = getTasksForDay(selectedDay)

                              if (dayEvents.length === 0 && dayJobs.length === 0 && dayTasks.length === 0) {
                                return (
                                  <div className="py-6">
                                    <EmptyState
                                      variant="calendar"
                                      title="Nothing scheduled"
                                      description="Add an appointment, job, or reminder to this day to see it here."
                                      className="py-8"
                                    />
                                  </div>
                                )
                              }

                              // Combine and sort events, jobs, and reminders by time
                              const allItems = [
                                ...dayEvents.map(e => ({ type: 'event' as const, data: e, time: e.start.dateTime || e.start.date })),
                                ...dayJobs.map(j => ({ type: 'job' as const, data: j, time: j.scheduled_date })),
                                ...dayTasks.map(t => ({ type: 'task' as const, data: t, time: t.due_time ? `${t.due_date}T${t.due_time}` : t.due_date }))
                              ].sort((a, b) => {
                                const timeA = a.time ? new Date(a.time).getTime() : 0
                                const timeB = b.time ? new Date(b.time).getTime() : 0
                                return timeA - timeB
                              })

                              return (
                                <div className="space-y-3">
                                  {allItems.map((item) => {
                                    if (item.type === 'event') {
                                      const event = item.data as CalendarEvent
                                      const time = formatEventTimeRange(event.start.dateTime, event.end.dateTime, event.start.date)
                                      const job = jobs.find(j => j.google_calendar_event_id === event.id)
                                      const isReplyFlow = isReplyFlowOwnedEvent(event as any, { linkedJob: job })
                                      const customerName = job?.customer_name || null

                                      return (
                                        <div
                                          key={event.id}
                                          className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        >
                                          <button
                                            onClick={() => handleCalendarItemClick({ id: event.id, type: 'appointment' })}
                                            className="flex items-start gap-3 flex-1 min-w-0 text-left"
                                          >
                                            <div className="flex-shrink-0 mt-0.5">
                                              <CalendarIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-medium text-slate-900 dark:text-foreground">
                                                  {event.summary}
                                                </p>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${isReplyFlow ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                                                  {isReplyFlow ? 'ReplyFlow' : 'Google'}
                                                </span>
                                              </div>
                                              {customerName && (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                  {customerName}
                                                </p>
                                              )}
                                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                {time}
                                              </p>
                                              {event.location && (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                                  <span className="truncate">{event.location}</span>
                                                </p>
                                              )}
                                            </div>
                                          </button>
                                          {isReplyFlow ? (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                handleCalendarItemClick({ id: event.id, type: 'appointment' })
                                              }}
                                              aria-label={`Edit appointment: ${event.summary}`}
                                              className="flex-shrink-0 p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                                              title="Edit appointment"
                                            >
                                              <Pencil className="w-4 h-4" />
                                            </button>
                                          ) : (
                                            <a
                                              href={event.htmlLink || 'https://calendar.google.com'}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              aria-label={`Open in Google Calendar: ${event.summary}`}
                                              className="flex-shrink-0 p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                                              title="Open in Google Calendar"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <ExternalLink className="w-4 h-4" />
                                            </a>
                                          )}
                                        </div>
                                      )
                                    } else if (item.type === 'task') {
                                      const task = item.data as Task
                                      const time = task.due_time
                                        ? new Date(`2000-01-01T${task.due_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                        : 'No time'

                                      return (
                                        <div
                                          key={task.id}
                                          className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        >
                                          <button
                                            onClick={() => handleCalendarItemClick({ id: task.id, type: 'task' })}
                                            className="flex items-start gap-3 flex-1 min-w-0 text-left"
                                          >
                                            <div className="flex-shrink-0 mt-0.5">
                                              <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium text-slate-900 dark:text-foreground">
                                                {task.title}
                                              </p>
                                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                {time} • {task.completed ? 'Completed' : 'Pending'}
                                              </p>
                                            </div>
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleCalendarItemClick({ id: task.id, type: 'task' })
                                            }}
                                            aria-label={`Edit reminder: ${task.title}`}
                                            className="flex-shrink-0 p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                                            title="Edit reminder"
                                          >
                                            <Pencil className="w-4 h-4" />
                                          </button>
                                        </div>
                                      )
                                    } else {
                                      const job = item.data
                                      const time = job.scheduled_time
                                        ? new Date(`2000-01-01T${job.scheduled_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                        : 'No time'

                                      return (
                                        <div
                                          key={job.id}
                                          className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        >
                                          <button
                                            onClick={() => {
                                              setSelectedJob(job as Job)
                                              setIsJobDetailsOpen(true)
                                            }}
                                            className="flex items-start gap-3 flex-1 min-w-0 text-left"
                                          >
                                            <div className="flex-shrink-0 mt-0.5">
                                              <Briefcase className="w-4 h-4 text-green-600 dark:text-green-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium text-slate-900 dark:text-foreground">
                                                {job.title}
                                              </p>
                                              {job.customer_name && (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                  {job.customer_name}
                                                </p>
                                              )}
                                              <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                  {time}
                                                </p>
                                                <span className="text-xs text-slate-400 dark:text-slate-500">•</span>
                                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                                  {job.status.replace('_', ' ')}
                                                </p>
                                              </div>
                                            </div>
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setEditingJob(job as Job)
                                              setJobPrefill(undefined)
                                              setNewJobDefaultDate(undefined)
                                              setIsJobComposerOpen(true)
                                            }}
                                            aria-label={`Edit job: ${job.title}`}
                                            className="flex-shrink-0 p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                                            title="Edit job"
                                          >
                                            <Pencil className="w-4 h-4" />
                                          </button>
                                        </div>
                                      )
                                    }
                                  })}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>

                      <div className="md:hidden mt-4 pb-2">
                        <button
                          onClick={() => handleAddEvent()}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors active:scale-[0.99]"
                        >
                          <Plus className="w-4 h-4" />
                          New Appointment
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Disconnected state but showing Jobs tab is still available */}
                  {!calendarConnected && !isInitialLoad && scheduleTab === 'calendar' && (
                    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-8 sm:p-12 text-center">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CalendarIcon className="w-6 h-6 text-slate-400" />
                      </div>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-foreground mb-2">
                        Connect Google Calendar
                      </h2>
                      <p className="text-sm text-slate-600 dark:text-muted-foreground mb-6 max-w-md mx-auto">
                        Connect your Google account to sync your calendar. You'll be asked to sign in to Google once to grant access.
                      </p>
                      <button
                        onClick={handleConnectCalendarWithExplanation}
                        disabled={isConnecting}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-[0.98] shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                      >
                        {isConnecting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Connecting...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            <span>Connect Google Calendar</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Map Tab */}
                  {scheduleTab === 'map' && (
                    <div className="h-[calc(100dvh-160px-var(--bottom-nav-height,80px))] md:h-[calc(100dvh-192px-var(--bottom-nav-height,80px))] min-h-[500px]">
                      <ScheduleMap
                        jobs={jobs}
                        calendarEvents={events}
                        tasks={tasks}
                        selectedDate={mapSelectedDate}
                        business={business}
                        onPreviousDay={handleMapPreviousDay}
                        onNextDay={handleMapNextDay}
                        onGoToToday={handleMapGoToToday}
                        onViewCustomer={handleMapViewCustomer}
                        onViewJob={handleMapViewJob}
                        onEditJob={handleMapEditJob}
                        onEditTask={handleMapEditTask}
                        onEditEvent={handleMapEditEvent}
                        onAddLocationJob={handleMapAddLocationJob}
                        onAddLocationEvent={handleMapAddLocationEvent}
                      />
                    </div>
                  )}


                  {/* Lead Picker Modal */}
                  <LeadPickerModal
                    title="Select Customer"
                    subtitle="Select a customer to continue"
                    isOpen={isLeadPickerOpen}
                    onClose={() => setIsLeadPickerOpen(false)}
                    onSelect={(prefill) => {
                      setJobPrefill(prefill)
                      setIsLeadPickerOpen(false)
                      setIsJobComposerOpen(true)
                    }}
                  />

                  {/* Job Composer Modal */}
                  <JobComposer
                    isOpen={isJobComposerOpen}
                    onClose={() => { setIsJobComposerOpen(false); setEditingJob(null); setJobPrefill(undefined); setNewJobDefaultDate(undefined); setJobComposerInitialFocus(undefined) }}
                    onSave={handleJobSaved}
                    editJob={editingJob || undefined}
                    prefill={jobPrefill}
                    defaultDate={newJobDefaultDate}
                    initialFocus={jobComposerInitialFocus}
                    onShowToast={showToast}
                  />

                  {/* Add Customer Modal */}
                  <AddCustomerModal
                    isOpen={isAddCustomerModalOpen}
                    onClose={() => setIsAddCustomerModalOpen(false)}
                    onLeadCreated={(leadId, leadData) => {
                      setNewlyCreatedLeadId(leadId)
                      setIsAddCustomerModalOpen(false)
                      
                      // Extract customer data from lead using canonical helper
                      let customerName = undefined
                      let customerPhone = undefined
                      let serviceAddress = undefined
                      let title = undefined
                      let notes = undefined
                      let requestedCompletionLabel = undefined
                      let callbackPreferenceLabel = undefined

                      if (leadData) {
                        // Use getLeadAIIntake for canonical field resolution with phone number filtering
                        const { getLeadAIIntake } = require('@/lib/ai-field-mapping')
                        const intake = getLeadAIIntake(leadData)
                        
                        customerName = intake.customerName || undefined
                        customerPhone = intake.customerPhone || undefined
                        serviceAddress = intake.serviceAddress || undefined
                        title = getLeadRequestTitle(leadData) || intake.serviceRequested || intake.reasonForCalling || undefined
                        
                        const noteParts = [
                          intake.additionalDetails || intake.importantDetails,
                        ].filter(Boolean)
                        notes = noteParts.length > 0 ? noteParts.join('\n\n') : undefined

                        // Extract timing fields for Job prefill
                        requestedCompletionLabel = intake.desiredCompletionTime || intake.desiredCompletion || undefined
                        callbackPreferenceLabel = intake.preferredCallbackTime || intake.callbackTime || undefined
                      }

                      // Open job composer with the newly created customer pre-selected
                      setJobPrefill({
                        lead_id: leadId,
                        customer_name: customerName,
                        customer_phone: customerPhone,
                        service_address: serviceAddress,
                        title: title,
                        notes: notes,
                        conversation_id: leadData?.conversation_id || undefined,
                        requested_completion_label: requestedCompletionLabel,
                        callback_preference_label: callbackPreferenceLabel
                      })
                      setIsJobComposerOpen(true)
                    }}
                  />

                  {/* New Task Modal */}
                  <NewTaskModal
                    isOpen={isNewTaskModalOpen}
                    onClose={() => {
                      setIsNewTaskModalOpen(false)
                      setTaskToEdit(null)
                    }}
                    onTaskCreated={(isNew, task) => {
                      if (isNew && task) {
                        // Optimistic update: add task immediately with real ID from API
                        setTasks(prev => {
                          // Deduplicate by ID - if task already exists, don't add duplicate
                          if (prev.some(t => t.id === task.id)) {
                            return prev
                          }
                          return [...prev, task]
                        })
                      }
                      setTaskRefreshTrigger(prev => prev + 1)
                    }}
                    taskToEdit={taskToEdit}
                    onShowToast={showToast}
                    onTaskDeleted={() => {
                      setTaskRefreshTrigger(prev => prev + 1)
                    }}
                  />

                  {/* New Appointment Modal */}
                  <NewAppointmentModal
                    isOpen={isNewAppointmentModalOpen}
                    onClose={() => setIsNewAppointmentModalOpen(false)}
                    onRefresh={async (created) => {
                      // Refresh events from Google Calendar
                      await fetchEvents()
                      // Show success message based on customer confirmation status
                      if (created?.customerConfirmation?.sent) {
                        showToast('Appointment added to calendar and confirmation sent to customer', 'success')
                      } else if (created?.customerConfirmation?.error) {
                        showToast('Appointment added to calendar but confirmation could not be sent', 'warning')
                      } else if (created?.meetingUrl) {
                        showToast('Appointment added to calendar with Google Meet link', 'success')
                      } else {
                        showToast('Appointment added to calendar', 'success')
                      }
                    }}
                    defaultDate={selectedDay || undefined}
                    context={newAppointmentContext}
                    preselectedLeadId={newAppointmentPreselectedLeadId}
                    preselectedLeadDisplay={newAppointmentPreselectedLeadDisplay}
                    requireCustomer={newAppointmentRequireCustomer}
                    allowAddCustomer={newAppointmentAllowAddCustomer}
                    lockCustomer={newAppointmentLockCustomer}
                  />

                  {/* Job Details Modal */}
                  {selectedJob && (
                    <JobDetailsModal
                      isOpen={isJobDetailsOpen}
                      onClose={() => setIsJobDetailsOpen(false)}
                      job={selectedJob}
                      onEdit={(job) => { setEditingJob(job); setJobPrefill(undefined); setNewJobDefaultDate(undefined); setIsJobComposerOpen(true) }}
                      onStatusChange={handleJobStatusChange}
                      onDelete={handleJobDeleted}
                    />
                  )}

                  {/* Event Details Modal */}
                  {selectedEvent && (
                    <EventDetailsModal
                      isOpen={isEventDetailsOpen}
                      onClose={() => {
                        setIsEventDetailsOpen(false)
                        setEventDetailsMode('details')
                      }}
                      event={selectedEvent}
                      mode={eventDetailsMode}
                      job={selectedEventJob}
                      lead={selectedEventLead}
                      businessName={business?.name || null}
                      onViewCustomer={(leadId: string) => window.location.assign(`/dashboard/leads/${leadId}`)}
                      onViewJob={(jobId: string) => {
                        // Open JobDetails modal if we already have the job in state; otherwise navigate if a canonical route exists
                        const j = jobs.find(j => j.id === jobId)
                        if (j) {
                          setSelectedJob(j)
                          setIsJobDetailsOpen(true)
                        } else {
                          // Fallback: lead details page as central hub
                          const leadId = selectedEventLead?.id
                          if (leadId) window.location.assign(`/dashboard/leads/${leadId}`)
                        }
                      }}
                      onShowToast={showToast}
                      onRefresh={async () => {
                        // Refresh events from Google Calendar.
                        // Success toast is owned by the modal (onShowToast) per action,
                        // so onRefresh only handles data refresh — no generic toast here.
                        await fetchEvents()
                      }}
                      onDelete={async () => {
                        // Remove the deleted event from local state
                        setEvents(prev => prev.filter(e => e.id !== selectedEvent.id))
                        // Clear selected event and day to prevent add event modal from opening
                        setSelectedEvent(null)
                        setSelectedDay(null)
                        // Refresh events from Google Calendar
                        await fetchEvents()
                        // Show success message
                        showToast('Appointment removed from calendar', 'success')
                      }}
                    />
                  )}

                  </div>{/* end right column */}
                  </div>{/* end 2-col grid */}
                </>
              )}
          {/* Toast Container */}
          <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
          
          {/* Disconnect Confirmation Modal */}
          <ConfirmModal
            isOpen={isDisconnectConfirmOpen}
            onClose={() => setIsDisconnectConfirmOpen(false)}
            onConfirm={confirmDisconnectCalendar}
            title="Disconnect Google Calendar?"
            description="ReplyFlow will stop syncing with this Google account. Existing ReplyFlow appointments and Google Calendar events will not be deleted."
            confirmText="Disconnect"
            cancelText="Cancel"
            isDestructive={true}
            isLoading={isDisconnecting}
          />
    </DashboardShell>
  )
}

const STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<JobStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

function JobsTab({
  jobs,
  isLoading,
  onNewJob,
  onJobClick,
  onEditJob,
}: {
  jobs: Job[]
  isLoading: boolean
  onNewJob: () => void
  onJobClick: (job: Job) => void
  onEditJob?: (job: Job) => void
}) {
  const hasLoadedOnceRef = useRef(false)
  const [timeSummary, setTimeSummary] = useState<{ today_ms: number; week_ms: number; week_job_count: number; active_timer: boolean } | null>(null)

  useEffect(() => {
    if (!isLoading) {
      hasLoadedOnceRef.current = true
    }
  }, [isLoading])

  // Fetch business-level time summary (today/week) — single query, no N+1.
  useEffect(() => {
    let cancelled = false
    const fetchTimeSummary = async () => {
      try {
        const supabase = createBrowserClient()
        if (!supabase) return
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const res = await fetch('/api/jobs/time-summary', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data) {
          setTimeSummary({
            today_ms: data.today_ms || 0,
            week_ms: data.week_ms || 0,
            week_job_count: data.week_job_count || 0,
            active_timer: !!data.active_timer,
          })
        }
      } catch {
        // Silent — summary is non-critical
      }
    }
    fetchTimeSummary()
    return () => { cancelled = true }
  }, [jobs.length])
  const active = jobs.filter(j => j.status === 'scheduled' || j.status === 'in_progress')
  const completed = jobs.filter(j => j.status === 'completed')
  const cancelled = jobs.filter(j => j.status === 'cancelled')

  const formatScheduled = (job: Job) => {
    if (!job.scheduled_date) return null
    const d = new Date(job.scheduled_date + 'T00:00:00')
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    if (!job.scheduled_time) return dateStr
    const [h, m] = job.scheduled_time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${dateStr} at ${hour}:${String(m).padStart(2, '0')} ${ampm}`
  }

  const PAYMENT_LABELS: Record<string, string> = {
    none: '',
    requested: 'Payment Requested',
    paid: 'Paid',
  }
  const PAYMENT_COLORS: Record<string, string> = {
    requested: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  }

  const JobCard = ({ job, variant }: { job: Job; variant: 'active' | 'completed' | 'cancelled' }) => {
    const isActive = variant === 'active'
    const isCompleted = variant === 'completed'
    const addressFirstLine = job.service_address?.split(',')[0]
    const paymentLabel = PAYMENT_LABELS[job.payment_status || 'none']

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onJobClick(job)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onJobClick(job) } }}
        className={`rounded-xl p-4 transition-all hover:shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
          isActive
            ? 'bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 hover:border-blue-300 dark:hover:border-blue-700'
            : isCompleted
              ? 'bg-slate-50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/30'
              : 'bg-slate-50 dark:bg-slate-800/20 border border-slate-200/50 dark:border-slate-700/20'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-left">
            <p className={`truncate ${isActive ? 'text-base font-semibold text-slate-900 dark:text-foreground' : 'text-sm font-medium text-slate-700 dark:text-slate-300'}`}>
              {job.title}
            </p>
            {job.customer_name && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{job.customer_name}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500 dark:text-slate-400">
              {job.scheduled_date && (
                <span className="inline-flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3" />
                  {formatScheduled(job)}
                </span>
              )}
              {addressFirstLine && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {addressFirstLine}
                </span>
              )}
              {job.time_summary?.has_active_timer && (
                <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                  <Clock className="w-3 h-3" />
                  Timer running
                </span>
              )}
              {!job.time_summary?.has_active_timer && job.time_summary && job.time_summary.completed_ms > 0 && (
                <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <Clock className="w-3 h-3" />
                  {formatDuration(job.time_summary.completed_ms)} tracked
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[job.status]}`}>
              {STATUS_LABELS[job.status]}
            </span>
            {paymentLabel && (
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${PAYMENT_COLORS[job.payment_status || 'none']}`}>
                {paymentLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (isLoading && !hasLoadedOnceRef.current) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
            Jobs
            {isLoading && hasLoadedOnceRef.current && (
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 ml-2 align-middle">
                <span className="w-3 h-3 border-2 border-slate-300 dark:border-slate-600 border-t-transparent rounded-full animate-spin" />
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage customer work from scheduled to completed.
          </p>
        </div>
        <button
          onClick={onNewJob}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-[0.98] flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Job</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Time Tracked Summary — compact business-level aggregate */}
      {timeSummary && (timeSummary.today_ms > 0 || timeSummary.week_ms > 0 || timeSummary.active_timer) && (
        <div className="mb-4 rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            <h3 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Time Tracked
            </h3>
            {timeSummary.active_timer && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 ml-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Timer running
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Today</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-foreground tabular-nums">
                {formatDuration(timeSummary.today_ms)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">This Week</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-foreground tabular-nums">
                {formatDuration(timeSummary.week_ms)}
              </p>
              {timeSummary.week_job_count > 0 && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {timeSummary.week_job_count} {timeSummary.week_job_count === 1 ? 'job' : 'jobs'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-6 sm:p-8 text-center">
          <div className="w-11 h-11 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <Briefcase className="w-5 h-5 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">No active jobs</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs mx-auto leading-relaxed">
            Create a job to start tracking customer work.
          </p>
          <button
            onClick={onNewJob}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Job
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Jobs */}
          {active.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground uppercase tracking-wider mb-3">
                Active Jobs <span className="text-slate-400 dark:text-slate-500 normal-case font-normal">({active.length})</span>
              </h3>
              <div className="space-y-3">
                {active.map(job => <JobCard key={job.id} job={job} variant="active" />)}
              </div>
            </div>
          )}

          {/* Completed Jobs */}
          {completed.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Completed Jobs <span className="text-slate-400 dark:text-slate-500 normal-case font-normal">({completed.length})</span>
              </h3>
              <div className="space-y-3">
                {completed.map(job => <JobCard key={job.id} job={job} variant="completed" />)}
              </div>
            </div>
          )}

          {/* Cancelled Jobs */}
          {cancelled.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Cancelled Jobs <span className="text-slate-400 dark:text-slate-500 normal-case font-normal">({cancelled.length})</span>
              </h3>
              <div className="space-y-3">
                {cancelled.map(job => <JobCard key={job.id} job={job} variant="cancelled" />)}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
