'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Briefcase, User } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import DatePicker from '@/components/ui/DatePicker'
import TimePicker from '@/components/ui/TimePicker'

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

interface NewTaskModalProps {
  isOpen: boolean
  onClose: () => void
  onTaskCreated: (isNew?: boolean) => void
  taskToEdit?: Task | null
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

export default function NewTaskModal({ isOpen, onClose, onTaskCreated, taskToEdit }: NewTaskModalProps) {
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
  const supabase = createBrowserClient()

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

      if (!token) return

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

      onTaskCreated(!taskToEdit)
      handleClose()
    } catch (error) {
      console.error('[NewTaskModal] Failed to save task:', error)
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
    if (lead.raw_metadata?.customer_name) {
      return lead.raw_metadata.customer_name
    }
    return lead.caller_phone
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
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

          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
              Customer (Optional)
            </label>
            <select
              value={selectedLeadId || ''}
              onChange={(e) => setSelectedLeadId(e.target.value || null)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground"
            >
              <option value="">No customer</option>
              {leads.map(lead => (
                <option key={lead.id} value={lead.id}>
                  {getLeadName(lead)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-foreground mb-1.5">
              Job (Optional)
            </label>
            <select
              value={selectedJobId || ''}
              onChange={(e) => setSelectedJobId(e.target.value || null)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/80 bg-white dark:bg-slate-800 text-slate-900 dark:text-foreground"
            >
              <option value="">No job</option>
              {jobs.map(job => (
                <option key={job.id} value={job.id}>
                  {job.title} {job.customer_name ? `- ${job.customer_name}` : ''}
                </option>
              ))}
            </select>
          </div>

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

          <div className="flex gap-3 pt-2">
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
