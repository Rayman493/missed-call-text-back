'use client'

import { useState, useEffect } from 'react'
import { X, Briefcase, User } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import DatePicker from '@/components/ui/DatePicker'
import TimePicker from '@/components/ui/TimePicker'
import SelectPicker from '@/components/ui/SelectPicker'
import { getLeadDisplayName } from '@/lib/utils'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

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

interface NewTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onTaskCreated: (isNew?: boolean, task?: Task | null) => void
  taskToEdit?: Task | null
  onShowToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
  onTaskDeleted?: () => void
}

interface Lead {
  id: string
  caller_phone: string
  raw_metadata: any
}

interface Job {
  id: string
  title: string
  customer_name: string | null
}

export default function NewTaskModal({ isOpen, onClose, onTaskCreated, taskToEdit, onShowToast, onTaskDeleted }: NewTaskModalProps) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTogglingComplete, setIsTogglingComplete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const supabase = createBrowserClient()

  // Use shared body scroll lock hook
  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (isOpen) {
      fetchLeads()
      fetchJobs()
      if (taskToEdit) {
        setTitle(taskToEdit.title)
        setNotes(taskToEdit.notes || '')
        setDueDate(taskToEdit.due_date || '')
        setDueTime(taskToEdit.due_time || '')
        setSelectedLeadId(taskToEdit.lead_id)
        setSelectedJobId(taskToEdit.job_id)
      } else {
        setTitle('')
        setNotes('')
        setDueDate('')
        setDueTime('')
        setSelectedLeadId(null)
        setSelectedJobId(null)
      }
    }
  }, [isOpen, taskToEdit])

  const fetchLeads = async () => {
    setIsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) return

      const response = await fetch('/api/leads', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) return

      const data = await response.json()
      setLeads(data.leads || [])
    } catch (error) {
      console.error('[NewTaskModal] Failed to fetch leads:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/jobs')
      if (!response.ok) return

      const data = await response.json()
      setJobs(data.jobs || [])
    } catch (error) {
      console.error('[NewTaskModal] Failed to fetch jobs:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        onShowToast?.('Authentication error. Please try again.', 'error')
        return
      }

      const url = taskToEdit ? `/api/tasks/${taskToEdit.id}` : '/api/tasks'
      const method = taskToEdit ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          notes: notes.trim() || null,
          due_date: dueDate || null,
          due_time: dueTime || null,
          lead_id: selectedLeadId || null,
          job_id: selectedJobId || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save task')
      }

      const result = await response.json()
      onShowToast?.(taskToEdit ? 'Task updated' : 'Task created', 'success')
      // Pass the created/updated task to parent for optimistic update
      onTaskCreated(!taskToEdit, result.task || null)
      handleClose()
    } catch (error) {
      console.error('[NewTaskModal] Failed to save task:', error)
      onShowToast?.('Failed to save task. Please try again.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleComplete = async () => {
    if (!taskToEdit) return

    setIsTogglingComplete(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) return

      const response = await fetch(`/api/tasks/${taskToEdit.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          completed: !taskToEdit.completed,
          completed_at: !taskToEdit.completed ? new Date().toISOString() : null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update task')
      }

      onTaskCreated(false)
      handleClose()
    } catch (error) {
      console.error('[NewTaskModal] Failed to toggle task completion:', error)
    } finally {
      setIsTogglingComplete(false)
    }
  }

  const handleDelete = async () => {
    if (!taskToEdit) return

    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        onShowToast?.('Authentication error. Please try again.', 'error')
        return
      }

      const response = await fetch(`/api/tasks/${taskToEdit.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete task')
      }

      onShowToast?.('Task deleted successfully', 'success')
      onTaskDeleted?.()
      handleClose()
    } catch (error) {
      console.error('[NewTaskModal] Failed to delete task:', error)
      onShowToast?.('Failed to delete task. Please try again.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    setTitle('')
    setNotes('')
    setDueDate('')
    setDueTime('')
    setSelectedLeadId(null)
    setSelectedJobId(null)
    onClose()
  }

  const getLeadName = (lead: Lead) => {
    return getLeadDisplayName(lead)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md max-h-[calc(90vh-env(safe-area-inset-bottom)-80px)] overflow-y-auto mb-safe-bottom sm:mb-0">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
            {taskToEdit ? 'Edit Task' : 'New Task'}
          </h2>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
              Task Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Call customer about quote"
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any details about this task..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground resize-none"
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck={true}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              label="Due Date"
              placeholder="Select date"
            />
            <TimePicker
              value={dueTime}
              onChange={setDueTime}
              label="Due Time"
              placeholder="Select time"
            />
          </div>

          <SelectPicker
            value={selectedLeadId}
            onChange={setSelectedLeadId}
            options={[
              { value: '', label: 'No customer' },
              ...leads.map(lead => ({ value: lead.id, label: getLeadName(lead) }))
            ]}
            placeholder="No customer"
            label="Customer (Optional)"
            searchable={leads.length > 10}
            emptyMessage="No customers available"
          />

          <SelectPicker
            value={selectedJobId}
            onChange={setSelectedJobId}
            options={[
              { value: '', label: 'No job' },
              ...jobs.map(job => ({
                value: job.id,
                label: job.title + (job.customer_name ? ` - ${job.customer_name}` : '')
              }))
            ]}
            placeholder="No job"
            label="Job (Optional)"
            searchable={jobs.length > 10}
            emptyMessage="No jobs available"
          />

          {/* Completion Toggle - Only in Edit Mode */}
          {taskToEdit && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleToggleComplete}
                disabled={isTogglingComplete}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTogglingComplete ? 'Updating...' : (taskToEdit.completed ? 'Reopen Task' : 'Mark as Complete')}
              </button>
            </div>
          )}

          {/* Delete Button - Only in Edit Mode */}
          {taskToEdit && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full px-4 py-2 border border-red-200 dark:border-red-900/30 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete Task'}
              </button>
            </div>
          )}

          <div className="flex gap-3 pt-2 pb-safe-bottom">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (taskToEdit ? 'Saving...' : 'Creating...') : (taskToEdit ? 'Save Changes' : 'Create Task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
