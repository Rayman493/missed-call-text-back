'use client'

import { useState, useEffect } from 'react'
import { Calendar, Briefcase, CheckCircle2, Clock, Plus, AlertCircle, Pencil, ChevronDown, ChevronUp, Video, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/browser'
import type { Job } from '@/components/jobs/JobComposer'
import { formatTime12Hour, formatDate } from '@/lib/time-format'

// Mount/unmount diagnostics
if (typeof window !== 'undefined') {
  console.log('[TODAY_COMMAND_CENTER] Component file loaded', { timestamp: Date.now(), pathname: window.location.pathname })
}

interface Task {
  id: string
  title: string
  notes: string | null
  due_date: string | null
  due_time: string | null
  completed: boolean
  lead_id: string | null
  job_id: string | null
  created_at: string
}

interface CalendarEvent {
  id: string
  summary: string
  description: string | null
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location: string | null
  htmlLink: string | null
  meetingUrl?: string | null
  extendedProperties?: any
}

interface TodayCommandCenterProps {
  jobs: Job[]
  calendarEvents: CalendarEvent[]
  onAddTask?: () => void
  onAddJob?: () => void
  onAddAppointment?: () => void
  onJobClick?: (job: Job) => void
  onEditJob?: (job: Job) => void
  onDeleteJob?: (job: Job) => void
  onEditAppointment?: (event: CalendarEvent) => void
  onDeleteAppointment?: (event: CalendarEvent) => void
  onEditTask?: (task: Task) => void
  taskRefreshTrigger?: number
  onNavigateTab?: (tab: 'reminders' | 'jobs' | 'appointments') => void
}

export default function TodayCommandCenter({
  jobs,
  calendarEvents,
  onAddTask,
  onAddJob,
  onAddAppointment,
  onJobClick,
  onEditJob,
  onDeleteJob,
  onEditAppointment,
  onDeleteAppointment,
  onEditTask,
  taskRefreshTrigger,
  onNavigateTab,
}: TodayCommandCenterProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const supabase = createBrowserClient()

  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone

  // Mount/unmount diagnostics
  useEffect(() => {
    console.log('[TODAY_COMMAND_CENTER] Component mounted', { timestamp: Date.now(), pathname: window.location.pathname })
    return () => {
      console.log('[TODAY_COMMAND_CENTER] Component unmounted', { timestamp: Date.now(), pathname: window.location.pathname })
    }
  }, [])

  // Helper function to resolve customer information from calendar event
  const getCustomerFromCalendarEvent = (event: CalendarEvent): string | null => {
    // Try to find a linked job
    const linkedJob = jobs.find(job => job.google_calendar_event_id === event.id)
    if (linkedJob && linkedJob.customer_name) {
      return linkedJob.customer_name
    }
    return null
  }

  useEffect(() => {
    fetchTasks()
  }, [taskRefreshTrigger])

  const fetchTasks = async () => {
    setIsLoadingTasks(true)
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
      console.error('[Today] Failed to fetch tasks:', error)
    } finally {
      setIsLoadingTasks(false)
    }
  }

  const toggleTaskComplete = async (taskId: string, completed: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) return

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: !completed }),
      })

      if (!response.ok) return

      setTasks(prev => prev.map(t => 
        t.id === taskId 
          ? { ...t, completed: !completed, completed_at: !completed ? new Date().toISOString() : null }
          : t
      ))
    } catch (error) {
      console.error('[Today] Failed to toggle task:', error)
    }
  }

  const deleteTask = async (taskId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) return

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (!response.ok) return

      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (error) {
      console.error('[Today] Failed to delete task:', error)
    }
  }

  const todayTasks = tasks.filter(t => 
    !t.completed && t.due_date === todayStr
  )

  const overdueTasks = tasks.filter(t => 
    !t.completed && t.due_date && t.due_date < todayStr
  )

  // Tasks for browse card: show all incomplete tasks
  const browseTasks = tasks.filter(t => !t.completed)

  // Sort browse tasks: overdue first, then today, then upcoming by due date, then undated last
  const sortedBrowseTasks = browseTasks.sort((a, b) => {
    const aOverdue = a.due_date && a.due_date < todayStr
    const bOverdue = b.due_date && b.due_date < todayStr

    // Overdue first
    if (aOverdue !== bOverdue) {
      return aOverdue ? -1 : 1
    }

    // Then by due date
    const aDate = a.due_date || '9999-12-31' // Undated last
    const bDate = b.due_date || '9999-12-31'
    return aDate.localeCompare(bDate)
  })

  const todayJobs = jobs.filter(j => 
    j.scheduled_date === todayStr && j.status !== 'cancelled'
  )

  // Jobs for browse card: show all active/upcoming jobs
  const browseJobs = jobs.filter(j =>
    j.status !== 'cancelled' && j.status !== 'completed'
  )

  // Sort browse jobs: today first, then upcoming by scheduled date
  const sortedBrowseJobs = browseJobs.sort((a, b) => {
    const aToday = a.scheduled_date === todayStr
    const bToday = b.scheduled_date === todayStr

    // Today first
    if (aToday !== bToday) {
      return aToday ? -1 : 1
    }

    // Then by scheduled date
    const aDate = a.scheduled_date || '9999-12-31' // Unscheduled last
    const bDate = b.scheduled_date || '9999-12-31'
    return aDate.localeCompare(bDate)
  })

  const todayAppointments = calendarEvents.filter(event => {
    const eventDateRaw = event.start?.dateTime || event.start?.date
    if (!eventDateRaw) return false
    const eventDate = eventDateRaw.split('T')[0]
    if (eventDate !== todayStr) return false
    
    // Deduplicate: exclude calendar events that are linked to today's jobs
    const isLinkedToJob = todayJobs.some(job => job.google_calendar_event_id === event.id)
    return !isLinkedToJob
  })

  // Appointments for browse card: show all upcoming calendar events
  const now = new Date()
  const browseAppointments = calendarEvents.filter(event => {
    const eventDateRaw = event.start?.dateTime || event.start?.date
    if (!eventDateRaw) return false
    const eventDateTime = new Date(eventDateRaw)
    return eventDateTime >= now
  })

  // Sort browse appointments: next upcoming first, then later future events
  const sortedBrowseAppointments = browseAppointments.sort((a, b) => {
    const dateA = new Date(a.start?.dateTime || a.start?.date || 0).getTime()
    const dateB = new Date(b.start?.dateTime || b.start?.date || 0).getTime()
    return dateA - dateB
  })

  // Collapsed view limit for each section
  const COLLAPSED_LIMIT = 5

  // Helper to determine if a section has more items than the collapsed limit
  const hasMoreReminders = sortedBrowseTasks.length > COLLAPSED_LIMIT
  const hasMoreJobs = sortedBrowseJobs.length > COLLAPSED_LIMIT
  const hasMoreAppointments = sortedBrowseAppointments.length > COLLAPSED_LIMIT

  const upcomingJobs = jobs
    .filter(j => j.scheduled_date && j.scheduled_date > todayStr && j.status !== 'cancelled')
    .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''))
    .slice(0, 5)

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    // Parse YYYY-MM-DD as local date to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false
    return dueDate < todayStr
  }

  // Create combined chronological list for "Needs Done Today"
  const getSortedWorkItems = () => {
    const items: Array<{
      type: 'task' | 'job' | 'appointment' | 'overdue'
      id: string
      title: string
      customer: string | null
      time: string | null
      date: string | null
      icon: React.ReactNode
      status?: string
      isOverdue: boolean
      rawTime: number
      data: any
    }> = []

    // Add overdue tasks (highest priority)
    overdueTasks.forEach(task => {
      items.push({
        type: 'overdue',
        id: task.id,
        title: task.title,
        customer: null,
        time: task.due_time ? formatTime12Hour(task.due_time) : null,
        date: task.due_date,
        icon: <AlertCircle className="w-4 h-4 text-red-500" />,
        status: 'Overdue',
        isOverdue: true,
        rawTime: task.due_date ? new Date(task.due_date).getTime() : 0,
        data: task
      })
    })

    // Add today's appointments
    todayAppointments.forEach(event => {
      const eventTime = event.start.dateTime || event.start.date
      const customer = getCustomerFromCalendarEvent(event)
      items.push({
        type: 'appointment',
        id: event.id,
        title: event.summary,
        customer: customer,
        time: event.start.dateTime ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null,
        date: eventTime ? eventTime.split('T')[0] : null,
        icon: <Calendar className="w-4 h-4 text-blue-500" />,
        status: 'Scheduled',
        isOverdue: false,
        rawTime: eventTime ? new Date(eventTime).getTime() : Date.now(),
        data: event
      })
    })

    // Add today's jobs
    todayJobs.forEach(job => {
      const jobTime = job.scheduled_date && job.scheduled_time 
        ? `${job.scheduled_date}T${job.scheduled_time}`
        : job.scheduled_date
      items.push({
        type: 'job',
        id: job.id,
        title: job.title,
        customer: job.customer_name,
        time: job.scheduled_time ? formatTime12Hour(job.scheduled_time) : null,
        date: job.scheduled_date,
        icon: <Briefcase className="w-4 h-4 text-slate-500" />,
        status: job.status.replace('_', ' '),
        isOverdue: false,
        rawTime: jobTime ? new Date(jobTime).getTime() : Date.now(),
        data: job
      })
    })

    // Add today's tasks
    todayTasks.forEach(task => {
      const taskTime = task.due_date && task.due_time
        ? `${task.due_date}T${task.due_time}`
        : task.due_date
      items.push({
        type: 'task',
        id: task.id,
        title: task.title,
        customer: null,
        time: task.due_time ? formatTime12Hour(task.due_time) : null,
        date: task.due_date,
        icon: <CheckCircle2 className="w-4 h-4 text-slate-400" />,
        status: task.completed ? 'Completed' : 'Pending',
        isOverdue: false,
        rawTime: taskTime ? new Date(taskTime).getTime() : Date.now(),
        data: task
      })
    })

    // Sort: overdue first, then by time
    return items.sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) {
        return a.isOverdue ? -1 : 1
      }
      return a.rawTime - b.rawTime
    })
  }

  const sortedWorkItems = getSortedWorkItems()

  const getIconForType = (type: string) => {
    switch (type) {
      case 'task':
        return <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
      case 'job':
        return <Briefcase className="w-3.5 h-3.5 text-slate-400" />
      case 'appointment':
        return <Calendar className="w-3.5 h-3.5 text-slate-400" />
      case 'overdue':
        return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {/* Header with lightweight summary line */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground tracking-tight">
          Agenda
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {todayTasks.length + overdueTasks.length} Reminders • {todayJobs.length} Jobs • {todayAppointments.length} Appointments
          {overdueTasks.length > 0 && (
            <span className="text-red-600 dark:text-red-400 font-medium"> • {overdueTasks.length} Overdue</span>
          )}
        </p>
      </div>

      {/* Today - Premium Daily Summary Card */}
      <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/40 dark:border-blue-800/30 rounded-xl overflow-hidden sm:min-h-[180px] flex flex-col">
        {/* Header with Today label and current date */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-blue-200/30 dark:border-blue-800/20">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex-shrink-0">
              <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 leading-tight">
                Today
              </h3>
              <p className="text-xs text-blue-600/70 dark:text-blue-300/60 font-normal leading-tight mt-0.5">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
          {overdueTasks.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
              {overdueTasks.length} overdue
            </span>
          )}
        </div>

        {isLoadingTasks ? (
          <div className="px-3 pb-2.5 space-y-1.5">
            {[1, 2].map(i => (
              <div key={i} className="h-8 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : sortedWorkItems.length === 0 ? (
          <div className="px-3 pb-3 pt-1 flex-1 flex flex-col justify-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-0.5">
              Your day is clear
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Nothing scheduled for today.
            </p>
          </div>
        ) : (
          <div className="px-3 pb-2.5 space-y-0.5 flex-1">
            {sortedWorkItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-colors group"
              >
                <div className="flex-shrink-0">
                  {item.type === 'task' ? (
                    <button
                      onClick={() => toggleTaskComplete(item.id, item.data.completed)}
                      className="w-4 h-4 rounded border-2 border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 transition-colors flex items-center justify-center"
                    >
                      {item.data.completed && (
                        <CheckCircle2 className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                      )}
                    </button>
                  ) : (
                    <div className="w-4 h-4 flex items-center justify-center">
                      {getIconForType(item.type)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.title}
                    </p>
                    {item.isOverdue && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium flex-shrink-0">
                        Overdue
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {item.time && (
                      <span className={`text-xs ${item.isOverdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                        {item.time}
                      </span>
                    )}
                    {item.customer && (
                      <span className="text-xs text-muted-foreground">
                        • {item.customer}
                      </span>
                    )}
                  </div>
                </div>
                {item.type === 'task' && (
                  <div className="flex items-center gap-0.5">
                    {onEditTask && item.type === 'task' && (
                      <button
                        onClick={() => onEditTask(item.data)}
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors opacity-100"
                        aria-label="Edit reminder"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
                {item.type === 'job' && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => onJobClick?.(item.data)}
                      className="flex-shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View
                    </button>
                    {onEditJob && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditJob(item.data) }}
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors opacity-100"
                        aria-label="Edit job"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Needs Attention — compact cross-category highlights */}
      {overdueTasks.length > 0 && (
        <div className="bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/40 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-semibold text-foreground">
                Needs Attention
              </h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
              {overdueTasks.length} overdue
            </span>
          </div>
          <div className="p-3 space-y-0.5">
            {overdueTasks.slice(0, 5).map(task => (
              <div
                key={task.id}
                className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <button
                  onClick={() => toggleTaskComplete(task.id, task.completed)}
                  className="flex-shrink-0 w-5 h-5 rounded border-2 border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 transition-colors flex items-center justify-center"
                >
                  {task.completed && (
                    <CheckCircle2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    Overdue {task.due_date && `• ${formatDate(task.due_date)}`}
                  </p>
                </div>
                {onEditTask && (
                  <button
                    onClick={() => onEditTask(task)}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    aria-label="Edit reminder"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {overdueTasks.length > 5 && onNavigateTab && (
              <button
                onClick={() => onNavigateTab('reminders')}
                className="w-full text-left px-2 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                View all {overdueTasks.length} overdue →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compact category navigation links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Reminders summary card */}
        <button
          onClick={() => onNavigateTab?.('reminders')}
          className="text-left bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/40 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all sm:min-h-[110px] flex flex-col"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <CheckCircle2 className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-foreground">Reminders</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {todayTasks.length + overdueTasks.length} active
            {overdueTasks.length > 0 && (
              <span className="text-red-600 dark:text-red-400"> • {overdueTasks.length} overdue</span>
            )}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-auto pt-2 font-medium">View Reminders →</p>
        </button>

        {/* Jobs summary card */}
        <button
          onClick={() => onNavigateTab?.('jobs')}
          className="text-left bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/40 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all sm:min-h-[110px] flex flex-col"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Briefcase className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-foreground">Jobs</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {browseJobs.length} active
            {todayJobs.length > 0 && (
              <span className="text-blue-600 dark:text-blue-400"> • {todayJobs.length} today</span>
            )}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-auto pt-2 font-medium">View Jobs →</p>
        </button>

        {/* Appointments summary card */}
        <button
          onClick={() => onNavigateTab?.('appointments')}
          className="text-left bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/40 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all sm:min-h-[110px] flex flex-col"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-foreground">Appointments</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {todayAppointments.length} today
            {browseAppointments.length > 0 && (
              <span> • {browseAppointments.length} upcoming</span>
            )}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-auto pt-2 font-medium">View Appointments →</p>
        </button>
      </div>
    </div>
  )
}
