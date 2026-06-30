'use client'

import { useState } from 'react'
import { X, Briefcase, User, Phone, MapPin, FileText, Calendar, Clock, Pencil, Trash2, Link as LinkIcon } from 'lucide-react'
import type { Job, JobStatus } from './JobComposer'

interface JobDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  job: Job
  onEdit: (job: Job) => void
  onStatusChange: (job: Job, status: JobStatus) => void
  onDelete: (job: Job) => void
}

const STATUS_OPTIONS: { value: JobStatus; label: string; color: string }[] = [
  { value: 'scheduled', label: 'Scheduled', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
]

const STATUS_BADGE: Record<JobStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

function formatDate(date: string | null) {
  if (!date) return null
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(time: string | null) {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function JobDetailsModal({
  isOpen,
  onClose,
  job,
  onEdit,
  onStatusChange,
  onDelete,
}: JobDetailsModalProps) {
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  if (!isOpen) return null

  const handleStatusChange = async (newStatus: JobStatus) => {
    if (newStatus === job.status) return
    setIsUpdatingStatus(true)
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!response.ok) throw new Error('Failed to update status')
      const data = await response.json()
      onStatusChange(data.job, newStatus)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete job')
      onDelete(job)
      onClose()
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const currentStatusOption = STATUS_OPTIONS.find(s => s.value === job.status)

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 dark:text-foreground leading-snug break-words">{job.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[job.status]}`}>
                    {currentStatusOption?.label}
                  </span>
                  {job.source === 'replyflow' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                      <LinkIcon className="w-2.5 h-2.5" />
                      ReplyFlow Lead
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0">
              <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Details */}
          <div className="p-5 space-y-5">
            {/* Customer */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Customer</p>
              <div className="space-y-2">
                {job.customer_name && (
                  <div className="flex items-center gap-3 text-sm text-slate-800 dark:text-slate-200">
                    <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="font-medium">{job.customer_name}</span>
                  </div>
                )}
                {job.customer_phone && (
                  <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <a href={`tel:${job.customer_phone}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      {job.customer_phone}
                    </a>
                  </div>
                )}
                {!job.customer_name && !job.customer_phone && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 italic">No customer information</p>
                )}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Schedule</p>
              <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>
                  {job.scheduled_date ? formatDate(job.scheduled_date) : 'No date set'}
                  {job.scheduled_time && ` at ${formatTime(job.scheduled_time)}`}
                </span>
              </div>
            </div>

            {/* Address */}
            {job.service_address && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Address</p>
                <div className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <span>{job.service_address}</span>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Notes</p>
              {job.notes ? (
                <div className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{job.notes}</span>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No notes added</p>
              )}
            </div>

            {/* Payment placeholder */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Payment</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Not requested</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Payment requests coming soon</p>
            </div>

            {/* Status Change */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                    disabled={isUpdatingStatus || opt.value === job.status}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:cursor-not-allowed ${
                      opt.value === job.status
                        ? `${opt.color} opacity-100 cursor-default`
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 opacity-70 hover:opacity-100'
                    }`}
                  >
                    {opt.label}
                    {opt.value === job.status && ' ✓'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-slate-200 dark:border-slate-700">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2 w-full">
                <span className="text-xs text-slate-600 dark:text-slate-400 flex-1">Delete this job?</span>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Delete job"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { onEdit(job); onClose() }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
