'use client'

import { useState } from 'react'
import { Plus, ChevronDown, ChevronUp, CheckCircle2, Loader2, Circle, XCircle } from 'lucide-react'
import type { Job, JobStatus } from './JobComposer'

interface TodayScheduleProps {
  jobs: Job[]
  isLoading: boolean
  onJobClick: (job: Job) => void
  onNewJob: () => void
  onStatusChange: (job: Job, status: JobStatus) => void
}

const STATUS_ORDER: JobStatus[] = ['in_progress', 'scheduled', 'completed', 'cancelled']

const STATUS_CONFIG: Record<JobStatus, {
  label: string
  pill: string
  row: string
  icon: React.FC<{ className?: string }>
  nextStatus: JobStatus | null
  nextLabel: string | null
}> = {
  in_progress: {
    label: 'In Progress',
    pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    row: 'border-l-amber-400',
    icon: ({ className }) => <Loader2 className={`${className} animate-spin`} />,
    nextStatus: 'completed',
    nextLabel: 'Mark Complete',
  },
  scheduled: {
    label: 'Scheduled',
    pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    row: 'border-l-blue-400',
    icon: ({ className }) => <Circle className={className} />,
    nextStatus: 'in_progress',
    nextLabel: 'Start',
  },
  completed: {
    label: 'Completed',
    pill: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    row: 'border-l-green-400',
    icon: ({ className }) => <CheckCircle2 className={className} />,
    nextStatus: null,
    nextLabel: null,
  },
  cancelled: {
    label: 'Cancelled',
    pill: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    row: 'border-l-slate-400',
    icon: ({ className }) => <XCircle className={className} />,
    nextStatus: null,
    nextLabel: null,
  },
}

function formatTime(time: string | null): string | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function getTodayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function TodaySchedule({
  jobs,
  isLoading,
  onJobClick,
  onNewJob,
  onStatusChange,
}: TodayScheduleProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)

  const todayKey = getTodayKey()
  const todayJobs = jobs.filter(j => j.scheduled_date === todayKey)

  // Sort by status priority, then by time
  const sorted = [...todayJobs].sort((a, b) => {
    const statusDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    if (statusDiff !== 0) return statusDiff
    if (!a.scheduled_time) return 1
    if (!b.scheduled_time) return -1
    return a.scheduled_time.localeCompare(b.scheduled_time)
  })

  const visible = sorted.filter(j => j.status !== 'cancelled')
  const cancelled = sorted.filter(j => j.status === 'cancelled')

  const inProgress = sorted.filter(j => j.status === 'in_progress').length
  const remaining = sorted.filter(j => j.status === 'scheduled').length
  const completed = sorted.filter(j => j.status === 'completed').length

  const handleQuickStatus = async (e: React.MouseEvent, job: Job, newStatus: JobStatus) => {
    e.stopPropagation()
    setUpdatingId(job.id)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      onStatusChange(data.job, newStatus)
    } catch {
      // silent — user can use details modal as fallback
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground leading-none">Today's Schedule</h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{getTodayLabel()}</p>
        </div>
        <button
          onClick={onNewJob}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors active:scale-95"
        >
          <Plus className="w-3 h-3" />
          New Job
        </button>
      </div>

      {/* Summary chips — only when there are jobs */}
      {todayJobs.length > 0 && (
        <div className="flex items-center gap-2 px-4 pt-2.5 pb-1 flex-wrap">
          {inProgress > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              {inProgress} in progress
            </span>
          )}
          {remaining > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              <Circle className="w-2.5 h-2.5" />
              {remaining} upcoming
            </span>
          )}
          {completed > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              <CheckCircle2 className="w-2.5 h-2.5" />
              {completed} done
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <div className="px-3 py-2">
        {isLoading ? (
          <div className="space-y-2 py-1">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : todayJobs.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">No jobs scheduled today.</p>
            <button
              onClick={onNewJob}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Plus className="w-3 h-3" />
              Create a job
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 py-1">
            {visible.map(job => {
              const cfg = STATUS_CONFIG[job.status]
              const Icon = cfg.icon
              const isUpdating = updatingId === job.id

              return (
                <div
                  key={job.id}
                  onClick={() => onJobClick(job)}
                  className={`group flex items-center gap-3 pl-3 pr-2 py-2.5 rounded-lg border-l-2 ${cfg.row} bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors`}
                >
                  {/* Status icon */}
                  <Icon className={`w-4 h-4 flex-shrink-0 ${
                    job.status === 'in_progress' ? 'text-amber-500' :
                    job.status === 'completed' ? 'text-green-500' :
                    'text-blue-400'
                  }`} />

                  {/* Time + info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      {job.scheduled_time && (
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums flex-shrink-0">
                          {formatTime(job.scheduled_time)}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-900 dark:text-foreground truncate">{job.title}</span>
                    </div>
                    {job.customer_name && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{job.customer_name}</p>
                    )}
                  </div>

                  {/* Quick action button */}
                  {cfg.nextStatus && (
                    <button
                      onClick={(e) => handleQuickStatus(e, job, cfg.nextStatus!)}
                      disabled={isUpdating}
                      className={`flex-shrink-0 px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all active:scale-95 disabled:opacity-50 ${
                        cfg.nextStatus === 'in_progress'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                      }`}
                      title={cfg.nextLabel ?? ''}
                    >
                      {isUpdating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        cfg.nextLabel
                      )}
                    </button>
                  )}

                  {/* Completed — just the pill */}
                  {!cfg.nextStatus && job.status !== 'cancelled' && (
                    <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.pill}`}>
                      {cfg.label}
                    </span>
                  )}
                </div>
              )
            })}

            {/* Cancelled — collapsed by default */}
            {cancelled.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCancelled(v => !v)}
                  className="w-full flex items-center gap-1.5 py-1.5 px-1 text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showCancelled ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {cancelled.length} cancelled
                </button>
                {showCancelled && (
                  <div className="space-y-1.5">
                    {cancelled.map(job => (
                      <div
                        key={job.id}
                        onClick={() => onJobClick(job)}
                        className="flex items-center gap-3 pl-3 pr-2 py-2.5 rounded-lg border-l-2 border-l-slate-300 bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors opacity-60"
                      >
                        <XCircle className="w-4 h-4 flex-shrink-0 text-slate-400" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            {job.scheduled_time && (
                              <span className="text-[11px] font-semibold text-slate-400 tabular-nums flex-shrink-0">
                                {formatTime(job.scheduled_time)}
                              </span>
                            )}
                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate line-through">{job.title}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
