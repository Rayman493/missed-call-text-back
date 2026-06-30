'use client'

import { Briefcase } from 'lucide-react'
import type { Job, JobStatus } from './JobComposer'

interface JobPillProps {
  job: Job
  onClick: (job: Job) => void
}

const STATUS_COLORS: Record<JobStatus, string> = {
  scheduled: 'bg-blue-600',
  in_progress: 'bg-amber-500',
  completed: 'bg-green-600',
  cancelled: 'bg-slate-500',
}

export default function JobPill({ job, onClick }: JobPillProps) {
  const colorClass = STATUS_COLORS[job.status] ?? 'bg-blue-600'
  const timeLabel = job.scheduled_time
    ? job.scheduled_time.slice(0, 5)
    : null

  return (
    <button
      onClick={() => onClick(job)}
      className={`w-full text-left flex items-center gap-1 px-1.5 py-0.5 rounded text-white text-[10px] font-medium truncate ${colorClass} hover:opacity-90 transition-opacity`}
    >
      <Briefcase className="w-2.5 h-2.5 flex-shrink-0" />
      <span className="truncate">
        {timeLabel ? `${timeLabel} ` : ''}{job.title}
      </span>
    </button>
  )
}
