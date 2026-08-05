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
}

export default function TodayCommandCenter({
  jobs,
  calendarEvents,
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

  return (
    <div className="space-y-4">
      {/* Header with lightweight summary line */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
          Agenda
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {todayTasks.length} Tasks • {todayJobs.length} Jobs • {todayAppointments.length} Appointments
          {overdueTasks.length > 0 && ` • ${overdueTasks.length} Overdue`}
        </p>
      </div>

      {/* Today's Tasks */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground uppercase tracking-wider">
            Today's Tasks
          </h3>
          <Link
            href="/dashboard/tasks"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            View all →
          </Link>
        </div>
        {isLoadingTasks ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : todayTasks.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No tasks for today
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayTasks.slice(0, 5).map(task => (
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
                  {(task.lead_id || task.job_id) && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Related to {task.job_id ? 'Job' : 'Customer'}
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

      {/* Jobs */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground uppercase tracking-wider">
            Jobs
          </h3>
          <Link
            href="/dashboard/leads"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            View all →
          </Link>
        </div>
        {todayJobs.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No jobs scheduled for today
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayJobs.slice(0, 5).map(job => (
              <Link
                key={job.id}
                href={`/dashboard/leads/${job.lead_id || ''}`}
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
                <div className="flex-shrink-0 text-right">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {job.status.replace('_', ' ')}
                  </span>
                  {job.scheduled_time && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatTime(job.scheduled_time)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Appointments */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground uppercase tracking-wider">
            Appointments
          </h3>
          <Link
            href="/dashboard/calendar"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            View calendar →
          </Link>
        </div>
        {todayAppointments.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No appointments for today
            </p>
          </div>
        ) : (
          <div className="space-y-2">
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

      {/* Overdue - only render if something is overdue */}
      {overdueTasks.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground uppercase tracking-wider">
              Overdue
            </h3>
          </div>
          <div className="space-y-2">
            {overdueTasks.map(task => (
              <div
                key={task.id}
                className="flex items-start gap-3 p-2 rounded-lg bg-white dark:bg-slate-900/40 border border-amber-200 dark:border-amber-900/20"
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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-foreground">
                      {task.title}
                    </p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                      Task
                    </span>
                  </div>
                  {task.due_date && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Due {formatDate(task.due_date)}
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
    </div>
  )
}
