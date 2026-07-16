'use client'

import { useState, useEffect } from 'react'
import { Calendar, Briefcase, CheckCircle2, Clock, Plus, AlertCircle } from 'lucide-react'
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
}

interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
}

interface TodayCommandCenterProps {
  jobs: Job[]
  calendarEvents: CalendarEvent[]
  onNewTask: () => void
  onNewJob: () => void
  onNewAppointment: () => void
}

export default function TodayCommandCenter({
  jobs,
  calendarEvents,
  onNewTask,
  onNewJob,
  onNewAppointment,
}: TodayCommandCenterProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoadingTasks, setIsLoadingTasks] = useState(true)
  const supabase = createBrowserClient()

  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone

  useEffect(() => {
    fetchTasks()
  }, [])

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

  const todayJobs = jobs.filter(j => 
    j.scheduled_date === todayStr && j.status !== 'cancelled'
  )

  const todayAppointments = calendarEvents.filter(event => {
    const eventDateRaw = event.start?.dateTime || event.start?.date
    if (!eventDateRaw) return false
    const eventDate = eventDateRaw.split('T')[0]
    if (eventDate !== todayStr) return false
    
    // Deduplicate: exclude calendar events that are linked to today's jobs
    const isLinkedToJob = todayJobs.some(job => job.google_calendar_event_id === event.id)
    return !isLinkedToJob
  })

  const upcomingJobs = jobs
    .filter(j => j.scheduled_date && j.scheduled_date > todayStr && j.status !== 'cancelled')
    .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''))
    .slice(0, 5)

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return ''
    const [hours, minutes] = timeStr.split(':')
    const hour = parseInt(hours, 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false
    return dueDate < todayStr
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
            Today
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Your daily overview of what needs attention and what's coming up.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onNewTask}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg border border-slate-200/70 dark:border-slate-700/50 p-3">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-medium">Today's Tasks</span>
          </div>
          <p className="text-2xl font-semibold text-slate-900 dark:text-foreground">
            {todayTasks.length}
          </p>
        </div>
        <div className="bg-card rounded-lg border border-slate-200/70 dark:border-slate-700/50 p-3">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-1">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs font-medium">Overdue</span>
          </div>
          <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
            {overdueTasks.length}
          </p>
        </div>
        <div className="bg-card rounded-lg border border-slate-200/70 dark:border-slate-700/50 p-3">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-1">
            <Briefcase className="w-4 h-4" />
            <span className="text-xs font-medium">Jobs</span>
          </div>
          <p className="text-2xl font-semibold text-slate-900 dark:text-foreground">
            {todayJobs.length}
          </p>
        </div>
        <div className="bg-card rounded-lg border border-slate-200/70 dark:border-slate-700/50 p-3">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-1">
            <Calendar className="w-4 h-4" />
            <span className="text-xs font-medium">Appointments</span>
          </div>
          <p className="text-2xl font-semibold text-slate-900 dark:text-foreground">
            {todayAppointments.length}
          </p>
        </div>
      </div>

      {/* Overdue Tasks */}
      {overdueTasks.length > 0 && (
        <div className="bg-card rounded-lg border border-amber-200/70 dark:border-amber-900/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">
              Overdue Tasks
            </h3>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              ({overdueTasks.length})
            </span>
          </div>
          <div className="space-y-2">
            {overdueTasks.map(task => (
              <div
                key={task.id}
                className="flex items-start gap-3 p-2 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/20"
              >
                <button
                  onClick={() => toggleTaskComplete(task.id, task.completed)}
                  className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 border-amber-400 dark:border-amber-500 hover:bg-amber-200 dark:hover:bg-amber-900/30 transition-colors flex items-center justify-center"
                >
                  {task.completed && (
                    <CheckCircle2 className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-foreground">
                    {task.title}
                  </p>
                  {task.due_date && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {task.due_time && ` at ${formatTime(task.due_time)}`}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="flex-shrink-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Tasks */}
      <div className="bg-card rounded-lg border border-slate-200/70 dark:border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">
              Today's Tasks
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ({todayTasks.length})
            </span>
          </div>
        </div>
        {isLoadingTasks ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : todayTasks.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
              No tasks for today
            </p>
            <button
              onClick={onNewTask}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Add your first task
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {todayTasks.map(task => (
              <div
                key={task.id}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <button
                  onClick={() => toggleTaskComplete(task.id, task.completed)}
                  className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 transition-colors flex items-center justify-center"
                >
                  {task.completed && (
                    <CheckCircle2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-foreground">
                    {task.title}
                  </p>
                  {task.due_time && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatTime(task.due_time)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="flex-shrink-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Today's Schedule */}
      <div className="bg-card rounded-lg border border-slate-200/70 dark:border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">
              Today's Schedule
            </h3>
          </div>
          <button
            onClick={onNewAppointment}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Add Appointment
          </button>
        </div>
        {todayJobs.length === 0 && todayAppointments.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
              No schedule for today
            </p>
            <button
              onClick={onNewAppointment}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Schedule an appointment
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {todayJobs.map(job => (
              <div
                key={job.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <Briefcase className="w-4 h-4 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-foreground">
                    {job.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {job.customer_name || 'No customer'}
                  </p>
                </div>
                {job.scheduled_time && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatTime(job.scheduled_time)}
                  </span>
                )}
              </div>
            ))}
            {todayAppointments.map(event => (
              <div
                key={event.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <Calendar className="w-4 h-4 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-foreground">
                    {event.summary}
                  </p>
                </div>
                {event.start.dateTime && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Jobs */}
      {upcomingJobs.length > 0 && (
        <div className="bg-card rounded-lg border border-slate-200/70 dark:border-slate-700/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">
              Upcoming Jobs
            </h3>
          </div>
          <div className="space-y-2">
            {upcomingJobs.map(job => (
              <div
                key={job.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <Briefcase className="w-4 h-4 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-foreground">
                    {job.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {job.customer_name || 'No customer'}
                  </p>
                </div>
                {job.scheduled_date && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
