'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Clock, AlertCircle, Plus, X, Edit2, Trash2 } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import NewTaskModal from './NewTaskModal'
import Toast from '@/components/Toast'
import { useRouter } from 'next/navigation'
import { getLeadDisplayName, formatPhoneNumber } from '@/lib/utils'

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
  leads?: {
    id: string
    caller_phone: string
    raw_metadata: any
  } | null
  jobs?: {
    id: string
    title: string
    customer_name: string | null
  } | null
}

interface TasksTabProps {
  onNewJob?: () => void
  taskRefreshTrigger?: number
  onAddTask?: () => void
  onEditTask?: (task: Task) => void
  showBackButton?: boolean
  onBack?: () => void
}

type TaskFilter = 'all' | 'active' | 'overdue' | 'future' | 'completed'

export default function TasksTab({ onNewJob, taskRefreshTrigger, onAddTask, onEditTask, showBackButton, onBack }: TasksTabProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const hasLoadedOnceRef = useRef(false)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // Use parent modal if available, otherwise use local state
  const useParentModal = !!onAddTask && !!onEditTask
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info'; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  })
  const [togglingTaskIds, setTogglingTaskIds] = useState<Set<string>>(new Set())
  const router = useRouter()
  const supabase = createBrowserClient()

  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    setToast({ message, type, isVisible: true })
  }

  useEffect(() => {
    fetchTasks()
  }, [taskRefreshTrigger])

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

  useEffect(() => {
    if (!isLoading) {
      hasLoadedOnceRef.current = true
    }
  }, [isLoading])

  const toggleTaskComplete = async (taskId: string, completed: boolean) => {
    // Prevent duplicate toggles
    if (togglingTaskIds.has(taskId)) return

    const newCompletedState = !completed

    // Optimistic UI update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, completed: newCompletedState, completed_at: newCompletedState ? new Date().toISOString() : null }
        : t
    ))

    // Add to loading state
    setTogglingTaskIds(prev => new Set(prev).add(taskId))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        // Revert on auth error
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, completed, completed_at: completed ? t.completed_at : null }
            : t
        ))
        showToast('Authentication error. Please try again.', 'error')
        return
      }

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: newCompletedState }),
      })

      if (!response.ok) {
        // Revert on API error
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, completed, completed_at: completed ? t.completed_at : null }
            : t
        ))
        showToast('Failed to update task. Please try again.', 'error')
        return
      }

      // Success: keep the optimistic state
    } catch (error) {
      console.error('[TasksTab] Failed to toggle task:', error)
      // Revert on network error
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, completed, completed_at: completed ? t.completed_at : null }
          : t
      ))
      showToast('Failed to update task. Please try again.', 'error')
    } finally {
      // Remove from loading state
      setTogglingTaskIds(prev => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
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
    // Parse YYYY-MM-DD as local date to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getTaskStatusBadge = (task: Task) => {
    if (task.completed) {
      return <span className="px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-full">Completed</span>
    }
    if (isOverdue(task.due_date)) {
      return <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">Overdue</span>
    }
    if (isFuture(task.due_date)) {
      return <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">Tomorrow</span>
    }
    if (task.due_date === todayStr) {
      return <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-600 text-white dark:bg-blue-500 dark:text-white rounded-full">Due Today</span>
    }
    return <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-full">Active</span>
  }

  const getLeadName = (task: Task) => {
    if (task.leads) {
      return getLeadDisplayName(task.leads)
    }
    return 'Unknown'
  }

  const handleLeadClick = (e: React.MouseEvent, leadId: string) => {
    e.stopPropagation()
    router.push(`/dashboard/leads/${leadId}`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-foreground flex items-center gap-2">
            Tasks
            {isLoading && hasLoadedOnceRef.current && (
              <span className="inline-flex items-center justify-center w-4 h-4">
                <span className="w-3.5 h-3.5 border-2 border-slate-300 dark:border-slate-600 border-t-transparent rounded-full animate-spin" />
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Keep track of smaller to-dos, reminders, and follow-ups.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showBackButton && onBack && (
            <button
              onClick={onBack}
              className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground transition-colors"
            >
              ← Back to Agenda
            </button>
          )}
          <button
            onClick={() => useParentModal ? onAddTask!() : setIsNewTaskModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 gap-1">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all text-center ${
            filter === 'all'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('active')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all text-center ${
            filter === 'active'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilter('overdue')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all text-center ${
            filter === 'overdue'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
        >
          Overdue
        </button>
        <button
          onClick={() => setFilter('future')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all text-center ${
            filter === 'future'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
        >
          Future
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all text-center ${
            filter === 'completed'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-foreground shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground'
          }`}
        >
          Completed
        </button>
      </div>

      {/* Task List */}
      {isLoading && !hasLoadedOnceRef.current ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground mb-2">
            {filter === 'all' ? "You're all caught up." : `No ${filter} tasks.`}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
            {filter === 'active' && 'No tasks scheduled for today.'}
            {filter === 'overdue' && 'No overdue tasks. Great job!'}
            {filter === 'future' && 'No tasks scheduled for later.'}
            {filter === 'completed' && 'No completed tasks yet.'}
            {filter === 'all' && 'Create your first task to get started.'}
          </p>
          <button
            onClick={() => useParentModal ? onAddTask!() : setIsNewTaskModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map(task => (
            <div
              key={task.id}
              className={`p-4 rounded-lg border transition-all ${
                task.completed
                  ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200/50 dark:border-slate-700/30 opacity-70'
                  : isOverdue(task.due_date)
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-900/20'
                    : isFuture(task.due_date)
                      ? 'bg-blue-50/30 dark:bg-blue-950/10 border-blue-200/30 dark:border-blue-900/20'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-700/50 hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleTaskComplete(task.id, task.completed)}
                  disabled={togglingTaskIds.has(task.id)}
                  className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                    task.completed
                      ? 'border-green-500 bg-green-500'
                      : isOverdue(task.due_date)
                        ? 'border-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/30'
                        : isFuture(task.due_date)
                          ? 'border-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/30'
                          : 'border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400'
                  } ${togglingTaskIds.has(task.id) ? 'opacity-50 cursor-not-allowed' : ''} ${
                    togglingTaskIds.has(task.id) ? 'scale-95' : 'hover:scale-105'
                  }`}
                >
                  {task.completed && (
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium mb-1 ${task.completed ? 'line-through text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-sforeground'}`}>
                    {task.title}
                  </p>
                  {task.notes && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 line-clamp-2">
                      {task.notes}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    {task.due_date && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(task.due_date)}</span>
                        {task.due_time && <span>· {formatTime(task.due_time)}</span>}
                      </div>
                    )}
                    {task.lead_id && (
                      <>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <button
                          onClick={(e) => handleLeadClick(e, task.lead_id!)}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                          {getLeadName(task)}
                        </button>
                      </>
                    )}
                    {task.job_id && task.jobs && (
                      <>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-slate-700 dark:text-slate-300">{task.jobs.title}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 pl-2">
                  {getTaskStatusBadge(task)}
                  <button
                    onClick={() => useParentModal ? onEditTask!(task) : setEditingTask(task)}
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

      {/* New Task Modal - only render if not using parent modal */}
      {!useParentModal && (
        <NewTaskModal
          isOpen={isNewTaskModalOpen}
          onClose={() => setIsNewTaskModalOpen(false)}
          onTaskCreated={(isNew) => {
            fetchTasks()
            setIsNewTaskModalOpen(false)
          }}
          onShowToast={showToast}
        />
      )}

      {/* Edit Task Modal - only render if not using parent modal */}
      {!useParentModal && editingTask && (
        <NewTaskModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          onTaskCreated={(isNew) => {
            fetchTasks()
            setEditingTask(null)
          }}
          taskToEdit={editingTask}
          onShowToast={showToast}
        />
      )}

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />
    </div>
  )
}
