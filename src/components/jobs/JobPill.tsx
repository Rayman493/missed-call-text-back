'use client'

import { Briefcase } from 'lucide-react'
import type { Job, JobStatus } from './JobComposer'

interface JobPillProps {
  job: Job
  onClick: (job: Job) => void
}

const STATUS_COLORS: Record<JobStatus, string> = {
  scheduled: 'bg-blue-500 hover:bg-blue-600',
  in_progress: 'bg-amber-500 hover:bg-amber-600',
  completed: 'bg-green-600 hover:bg-green-700',
  cancelled: 'bg-slate-500 hover:bg-slate-600',
}

const STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default function JobPill({ job, onClick }: JobPillProps) {
  const colorClass = STATUS_COLORS[job.status] ?? 'bg-blue-500 hover:bg-blue-600'
  const timeLabel = job.scheduled_time
    ? job.scheduled_time.slice(0, 5)
    : null

  const tooltip = `${STATUS_LABELS[job.status]}: ${timeLabel ? `${timeLabel} ` : ''}${job.title}${job.customer_name ? ` — ${job.customer_name}` : ''}`

  return (
    <button
      onClick={() => onClick(job)}
      title={tooltip}
      className={`w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-white text-[11px] font-medium truncate ${colorClass} transition-colors shadow-sm`}
    >
      <Briefcase className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">
        {timeLabel ? `${timeLabel} ` : ''}{job.title}
      </span>
    </button>
  )
}
