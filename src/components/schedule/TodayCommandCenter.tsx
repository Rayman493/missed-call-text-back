'use client'

import { useState, useEffect } from 'react'
import { Calendar, Briefcase, CheckCircle2, Clock, Plus, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/browser'

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

interface Job {
  id: string
  title: string
  customer_name: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  status: string
  google_calendar_event_id: string | null
  lead_id: string | null
}

interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
}

interface TodayCommandCenterProps {
  jobs: Job[]
  calendarEvents: CalendarEvent[]
  onAddTask?: () => void
  onAddJob?: () => void
  onAddAppointment?: () => void
  onJobClick?: (job: Job) => void
  taskRefreshTrigger?: number
  onViewAllTasks?: () => void
}

export default function TodayCommandCenter({
  jobs,
  calendarEvents,
  onAddTask,
  onAddJob,
  onAddAppointment,
  onJobClick,
  taskRefreshTrigger,
  onViewAllTasks,
}: TodayCommandCenterProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const supabase = createBrowserClient()

  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone

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

  const upcomingJobs = jobs
    .filter(j => j.scheduled_date && j.scheduled_date > todayStr && j.status !== 'cancelled')
    .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''))
    .slice(0, 5)

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return ''
    // Handle time strings with or without seconds (e.g., "15:30:00" or "15:30")
    const [hours, minutes] = timeStr.split(':').slice(0, 2)
    const hour = parseInt(hours, 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

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
        time: task.due_time ? formatTime(task.due_time) : null,
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
      items.push({
        type: 'appointment',
        id: event.id,
        title: event.summary,
        customer: null,
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
        time: job.scheduled_time ? formatTime(job.scheduled_time) : null,
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
        time: task.due_time ? formatTime(task.due_time) : null,
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
    <div className="space-y-6">
      {/* Header with lightweight summary line */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
          Agenda
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {todayTasks.length + overdueTasks.length} Tasks • {todayJobs.length} Jobs • {todayAppointments.length} Appointments
          {overdueTasks.length > 0 && ` • ${overdueTasks.length} Overdue`}
        </p>
      </div>

      {/* Needs Done Today - Primary Section */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-lg">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/25">
          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground">
            Needs Done Today
          </h3>
        </div>
        
        {isLoadingTasks ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : sortedWorkItems.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              No work scheduled for today
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onAddTask && (
                <button
                  onClick={onAddTask}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
                >
                  Create Task
                </button>
              )}
              {onAddJob && (
                <button
                  onClick={onAddJob}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
                >
                  Create Job
                </button>
              )}
              {onAddAppointment && (
                <button
                  onClick={onAddAppointment}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
                >
                  Schedule Appointment
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-1">
            {sortedWorkItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex-shrink-0">
                  {item.type === 'task' ? (
                    <button
                      onClick={() => toggleTaskComplete(item.id, item.data.completed)}
                      className="w-5 h-5 rounded border-2 border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 transition-colors flex items-center justify-center"
                    >
                      {item.data.completed && (
                        <CheckCircle2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      )}
                    </button>
                  ) : (
                    <div className="w-5 h-5 flex items-center justify-center">
                      {getIconForType(item.type)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.title}
                    </p>
                    {item.isOverdue && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium flex-shrink-0">
                        Overdue
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
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
                  <button
                    onClick={() => deleteTask(item.id)}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                )}
                {item.type === 'job' && (
                  <Link
                    href={`/dashboard/leads/${item.data.lead_id || ''}`}
                    className="flex-shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Browse by Type - Secondary Sections */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Browse by Type
          </h3>
          <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1" />
        </div>

        {/* Tasks */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/25">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-foreground">
                Tasks
              </h3>
            </div>
            <div className="flex items-center gap-1">
              {onAddTask && (
                <button
                  onClick={onAddTask}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  + Task
                </button>
              )}
              <button
                onClick={onViewAllTasks}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                View all →
              </button>
            </div>
          </div>
          <div className="p-4">
            {sortedBrowseTasks.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                  No open tasks
                </p>
                {onAddTask && (
                  <button
                    onClick={onAddTask}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
                  >
                    + Add Task
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {sortedBrowseTasks.slice(0, 5).map(task => {
                  const taskOverdue = task.due_date && task.due_date < todayStr
                  const taskToday = task.due_date === todayStr
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
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
                        <p className="text-sm font-medium text-foreground truncate">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {taskOverdue && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
                              Overdue
                            </span>
                          )}
                          {taskToday && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                              Today
                            </span>
                          )}
                          {task.due_date && !taskToday && !taskOverdue && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(task.due_date)}
                            </span>
                          )}
                          {task.due_time && (
                            <span className="text-xs text-muted-foreground">
                              {formatTime(task.due_time)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Jobs */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/25">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-foreground">
                Jobs
              </h3>
            </div>
            <div className="flex items-center gap-1">
              {onAddJob && (
                <button
                  onClick={onAddJob}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  + Job
                </button>
              )}
              <Link
                href="/dashboard/leads"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                View all →
              </Link>
            </div>
          </div>
          <div className="p-4">
            {sortedBrowseJobs.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                  No upcoming jobs
                </p>
                {onAddJob && (
                  <button
                    onClick={onAddJob}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
                  >
                    + Create Job
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {sortedBrowseJobs.slice(0, 5).map(job => {
                  const jobToday = job.scheduled_date === todayStr
                  return (
                    <button
                      key={job.id}
                      onClick={() => onJobClick?.(job)}
                      className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors w-full text-left group"
                    >
                      <Briefcase className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {job.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate">
                            {job.customer_name || 'No customer'}
                          </p>
                          {jobToday && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                              Today
                            </span>
                          )}
                          {job.scheduled_date && !jobToday && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(job.scheduled_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {job.scheduled_time && (
                          <span className="text-xs text-muted-foreground">
                            {formatTime(job.scheduled_time)}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Appointments */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/25">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-foreground">
                Appointments
              </h3>
            </div>
            <div className="flex items-center gap-1">
              {onAddAppointment && (
                <button
                  onClick={onAddAppointment}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  + Appointment
                </button>
              )}
              <Link
                href="/dashboard/calendar"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                Calendar →
              </Link>
            </div>
          </div>
          <div className="p-4">
            {sortedBrowseAppointments.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                  No upcoming appointments
                </p>
                {onAddAppointment && (
                  <button
                    onClick={onAddAppointment}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors active:scale-[0.98]"
                  >
                    + Schedule Appointment
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {sortedBrowseAppointments.slice(0, 5).map(event => {
                  const eventDateRaw = event.start?.dateTime || event.start?.date
                  const eventDate = eventDateRaw ? new Date(eventDateRaw) : null
                  const eventDateOnly = eventDateRaw?.split('T')[0]
                  const isToday = eventDateOnly === todayStr
                  return (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {event.summary}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {isToday && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                              Today
                            </span>
                          )}
                          {eventDate && !isToday && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(eventDateOnly || '')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {event.start.dateTime && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
