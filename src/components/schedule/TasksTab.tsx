'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, Clock, AlertCircle, Plus, X, Edit2, Trash2 } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import NewTaskModal from './NewTaskModal'

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
}

interface TasksTabProps {
  onNewJob: () => void
}

type TaskFilter = 'all' | 'active' | 'overdue' | 'future' | 'completed'

export default function TasksTab({ onNewJob }: TasksTabProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<TaskFilter>('active')
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const supabase = createBrowserClient()

  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchTasks = async () => {
    setIsLoading(true)
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
      console.error('[TasksTab] Failed to fetch tasks:', error)
    } finally {
      setIsLoading(false)
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
      console.error('[TasksTab] Failed to toggle task:', error)
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
      console.error('[TasksTab] Failed to delete task:', error)
    }
  }

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false
    return dueDate < todayStr
  }

  const isFuture = (dueDate: string | null) => {
    if (!dueDate) return false
    return dueDate > todayStr
  }

  const isNoDueDate = (dueDate: string | null) => {
    return !dueDate
  }

  const filteredTasks = tasks.filter(task => {
    switch (filter) {
      case 'active':
        return !task.completed && !isOverdue(task.due_date) && !isFuture(task.due_date)
      case 'overdue':
        return !task.completed && isOverdue(task.due_date)
      case 'future':
        return !task.completed && isFuture(task.due_date)
      case 'completed':
        return task.completed
      case 'all':
      default:
        return true
    }
  })

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
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getTaskStatusBadge = (task: Task) => {
    if (task.completed) {
      return <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-full">Completed</span>
    }
    if (isOverdue(task.due_date)) {
      return <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">Overdue</span>
    }
    if (isFuture(task.due_date)) {
      return <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">Future</span>
    }
    return <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-full">Active</span>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
          Tasks
        </h2>
        <button
          onClick={() => setIsNewTaskModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        <button
          onClick={() => setFilter('active')}
          className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            filter === 'active'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilter('overdue')}
          className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            filter === 'overdue'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
        >
          Overdue
        </button>
        <button
          onClick={() => setFilter('future')}
          className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            filter === 'future'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
        >
          Future
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            filter === 'completed'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
        >
          Completed
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            filter === 'all'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
        >
          All
        </button>
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">
            No tasks found
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {filter === 'active' && 'No active tasks. Great job!'}
            {filter === 'overdue' && 'No overdue tasks. You\'re on track!'}
            {filter === 'future' && 'No future tasks scheduled.'}
            {filter === 'completed' && 'No completed tasks yet.'}
            {filter === 'all' && 'Create your first task to get started.'}
          </p>
          <button
            onClick={() => setIsNewTaskModalOpen(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Create a task
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map(task => (
            <div
              key={task.id}
              className={`p-4 rounded-lg border transition-all ${
                task.completed
                  ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200/50 dark:border-slate-700/30 opacity-70'
                  : isOverdue(task.due_date)
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-900/20'
                    : 'bg-white dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-700/50 hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleTaskComplete(task.id, task.completed)}
                  className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 transition-colors flex items-center justify-center ${
                    task.completed
                      ? 'border-green-500 bg-green-500'
                      : isOverdue(task.due_date)
                        ? 'border-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/30'
                        : 'border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400'
                  }`}
                >
                  {task.completed && (
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className={`text-sm font-medium ${task.completed ? 'line-through text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-foreground'}`}>
                      {task.title}
                    </p>
                    {getTaskStatusBadge(task)}
                  </div>
                  {task.notes && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">
                      {task.notes}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {task.due_date && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(task.due_date)}
                        {task.due_time && ` at ${formatTime(task.due_time)}`}
                      </span>
                    )}
                    {task.lead_id && (
                      <span className="flex items-center gap-1">
                        <span>• Customer linked</span>
                      </span>
                    )}
                    {task.job_id && (
                      <span className="flex items-center gap-1">
                        <span>• Job linked</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingTask(task)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    title="Edit task"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title="Delete task"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Task Modal */}
      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        onTaskCreated={() => {
          fetchTasks()
          setIsNewTaskModalOpen(false)
        }}
      />

      {/* Edit Task Modal */}
      {editingTask && (
        <NewTaskModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          onTaskCreated={() => {
            fetchTasks()
            setEditingTask(null)
          }}
          taskToEdit={editingTask}
        />
      )}
    </div>
  )
}
