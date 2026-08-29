'use client'

import { useState, useEffect } from 'react'
import { X, Briefcase, User, Plus } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import DatePicker from '@/components/ui/DatePicker'
import TimePicker from '@/components/ui/TimePicker'
import SelectPicker from '@/components/ui/SelectPicker'
import Modal from '@/components/ui/Modal'
import { getLeadDisplayName } from '@/lib/utils'
import { useModalBackButton } from '@/hooks/useModalBackButton'

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
  preselectedLeadId?: string | null
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

export default function NewTaskModal({ isOpen, onClose, onTaskCreated, taskToEdit, onShowToast, onTaskDeleted, preselectedLeadId }: NewTaskModalProps) {
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

  // Handle Android back button and browser back to close modal
  useModalBackButton({ isOpen, onClose })

  // Handle Escape key to close modal

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
        setSelectedLeadId(preselectedLeadId || null)
        setSelectedJobId(null)
      }
    }
  }, [isOpen, taskToEdit, preselectedLeadId])

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

  // Early return if modal is closed to prevent rendering
  // Must be after all hooks to satisfy React's Rules of Hooks
  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={taskToEdit ? 'Edit Task' : 'New Task'}
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="px-4 py-2.5 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || !title.trim()}
            className="px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                <span>{taskToEdit ? 'Saving...' : 'Creating...'}</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>{taskToEdit ? 'Save Changes' : 'Create Task'}</span>
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Call customer about quote"
              className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background dark:bg-slate-900/60 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              required
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
            label="Customer"
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
            label="Job"
            searchable={jobs.length > 10}
            emptyMessage="No jobs available"
          />

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

          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any details about this task..."
              rows={3}
              className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background dark:bg-slate-900/60 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y"
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck={true}
            />
          </div>

          {/* Completion Toggle - Only in Edit Mode */}
          {taskToEdit && (
            <button
              type="button"
              onClick={handleToggleComplete}
              disabled={isTogglingComplete}
              className="w-full px-4 py-2.5 border border-border rounded-lg text-foreground bg-muted hover:bg-muted/80 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTogglingComplete ? 'Updating...' : (taskToEdit.completed ? 'Reopen Task' : 'Mark as Complete')}
            </button>
          )}

          {/* Delete Button - Only in Edit Mode */}
          {taskToEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full px-4 py-2.5 border border-red-200 dark:border-red-900/30 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Deleting...' : 'Delete Task'}
            </button>
          )}
        </form>
      </div>
    </Modal>
  )
}
