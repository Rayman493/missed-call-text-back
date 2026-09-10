'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Clock, Play, Square, Pencil, Trash2, Check, X } from 'lucide-react'
import {
  formatDuration,
  formatTimerClock,
  totalCompletedDuration,
  findActiveEntry,
  formatEntryTime,
  formatEntryDate,
  type JobTimeEntry,
} from '@/lib/job-time-utils'

interface JobTimerProps {
  jobId: string
}

export default function JobTimer({ jobId }: JobTimerProps) {
  const [entries, setEntries] = useState<JobTimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actionInFlight, setActionInFlight] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [conflictJob, setConflictJob] = useState<{ id: string; title: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStartedAt, setEditStartedAt] = useState('')
  const [editEndedAt, setEditEndedAt] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  // Tick every second when there's an active timer
  useEffect(() => {
    const active = findActiveEntry(entries)
    if (!active) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [entries])

  // Fetch entries on mount and when jobId changes
  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/time-entries`)
      if (!res.ok) return
      const data = await res.json()
      setEntries(data.entries || [])
    } catch (err) {
      console.error('[JobTimer] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    setLoading(true)
    fetchedRef.current = false
    fetchEntries()
  }, [jobId, fetchEntries])

  const activeEntry = findActiveEntry(entries)
  const completedTotal = totalCompletedDuration(entries)
  const elapsed = activeEntry ? now - new Date(activeEntry.started_at).getTime() : 0

  const handleStart = async () => {
    if (actionInFlight) return
    setActionInFlight(true)
    setConflictJob(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/time-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const data = await res.json()
      if (res.status === 409 && data?.activeJob) {
        setConflictJob(data.activeJob)
        return
      }
      if (!res.ok) return
      await fetchEntries()
    } catch (err) {
      console.error('[JobTimer] start error:', err)
    } finally {
      setActionInFlight(false)
    }
  }

  const handleStop = async () => {
    if (actionInFlight || !activeEntry) return
    setActionInFlight(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/time-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      if (!res.ok) return
      await fetchEntries()
    } catch (err) {
      console.error('[JobTimer] stop error:', err)
    } finally {
      setActionInFlight(false)
    }
  }

  const startEdit = (entry: JobTimeEntry) => {
    setEditingId(entry.id)
    setEditStartedAt(toLocalInputValue(entry.started_at))
    setEditEndedAt(entry.ended_at ? toLocalInputValue(entry.ended_at) : '')
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditError(null)
  }

  const saveEdit = async (entryId: string) => {
    setEditError(null)
    const body: Record<string, any> = {}
    if (editStartedAt) body.started_at = new Date(editStartedAt).toISOString()
    if (editEndedAt) body.ended_at = new Date(editEndedAt).toISOString()
    else body.ended_at = null

    try {
      const res = await fetch(`/api/jobs/${jobId}/time-entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditError(data?.error || 'Failed to update entry')
        return
      }
      setEditingId(null)
      await fetchEntries()
    } catch (err) {
      setEditError('Failed to update entry')
    }
  }

  const handleDelete = async (entryId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/time-entries/${entryId}`, { method: 'DELETE' })
      if (!res.ok) return
      setDeleteConfirmId(null)
      await fetchEntries()
    } catch (err) {
      console.error('[JobTimer] delete error:', err)
    }
  }

  if (loading) {
    return (
      <div className="p-3 rounded-lg bg-muted/30 dark:bg-slate-800/60 border border-border/40 dark:border-border/30">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Time Tracked</p>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="p-3 rounded-lg bg-muted/30 dark:bg-slate-800/60 border border-border/40 dark:border-border/30">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Time Tracked</p>
        {activeEntry && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Running
          </span>
        )}
      </div>

      {/* Total + Active Timer */}
      <div className="flex items-center gap-3 mb-2">
        <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        {completedTotal > 0 && (
          <span className="text-sm font-medium text-foreground">{formatDuration(completedTotal)}</span>
        )}
        {completedTotal === 0 && !activeEntry && (
          <span className="text-sm text-muted-foreground">No time tracked yet</span>
        )}
        {activeEntry && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm font-mono font-medium text-foreground tabular-nums">{formatTimerClock(elapsed)}</span>
          </div>
        )}
      </div>

      {/* Conflict notice */}
      {conflictJob && !activeEntry && (
        <div className="mb-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-700 dark:text-amber-300">
          A timer is already running for <span className="font-medium">{conflictJob.title}</span>. Stop it before starting a new one.
        </div>
      )}

      {/* Start/Stop button */}
      <div className="flex items-center gap-2">
        {!activeEntry ? (
          <button
            onClick={handleStart}
            disabled={actionInFlight}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 text-foreground border border-border/50 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            Start Timer
          </button>
        ) : (
          <button
            onClick={handleStop}
            disabled={actionInFlight}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Square className="w-3.5 h-3.5" />
            Stop Timer
          </button>
        )}
      </div>

      {/* Entry History */}
      {entries.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 space-y-2">
          {entries.map((entry) => {
            const isEditing = editingId === entry.id
            const isDeleteConfirm = deleteConfirmId === entry.id
            const duration = entry.ended_at
              ? new Date(entry.ended_at).getTime() - new Date(entry.started_at).getTime()
              : 0

            if (isEditing) {
              return (
                <div key={entry.id} className="p-3 rounded-lg bg-muted/30 dark:bg-slate-800/60 border border-blue-200 dark:border-blue-700/40 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Start</label>
                      <input
                        type="datetime-local"
                        value={editStartedAt}
                        onChange={(e) => setEditStartedAt(e.target.value)}
                        className="w-full text-xs px-2 py-1.5 rounded-md border border-border/50 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">End</label>
                      <input
                        type="datetime-local"
                        value={editEndedAt}
                        onChange={(e) => setEditEndedAt(e.target.value)}
                        className="w-full text-xs px-2 py-1.5 rounded-md border border-border/50 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  </div>
                  {editError && <p className="text-[10px] text-red-600 dark:text-red-400">{editError}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => saveEdit(entry.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }

            if (isDeleteConfirm) {
              return (
                <div key={entry.id} className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 flex items-center gap-2">
                  <span className="text-[11px] text-red-700 dark:text-red-300 flex-1 font-medium">Delete this entry?</span>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="text-[11px] font-medium px-2.5 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="text-[11px] font-medium px-2.5 py-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )
            }

            return (
              <div key={entry.id} className="flex items-center gap-2 text-xs py-1 px-1 -mx-1 rounded-md hover:bg-muted/30 dark:hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-muted-foreground">{formatEntryDate(entry.started_at)}</span>
                  <span className="text-foreground ml-1.5">
                    {formatEntryTime(entry.started_at)}
                    {entry.ended_at && ` – ${formatEntryTime(entry.ended_at)}`}
                  </span>
                  {!entry.ended_at && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-1.5 font-medium">Running</span>
                  )}
                </div>
                {entry.ended_at && (
                  <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(duration)}</span>
                )}
                {entry.ended_at && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => startEdit(entry)}
                      className="p-1.5 rounded text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      aria-label="Edit time entry"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(entry.id)}
                      className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      aria-label="Delete time entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Helper: convert ISO string to local datetime-local input value
function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}
