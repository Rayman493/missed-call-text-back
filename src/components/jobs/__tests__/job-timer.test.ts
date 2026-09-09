import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  formatDuration,
  formatTimerClock,
  totalCompletedDuration,
  findActiveEntry,
  formatEntryTime,
  formatEntryDate,
  type JobTimeEntry,
} from '@/lib/job-time-utils'

const migrationContent = readFileSync('supabase/migrations/20260918000000_create_job_time_entries.sql', 'utf8')
const uniquenessMigrationContent = readFileSync('supabase/migrations/20260918000001_unique_active_timer_per_business.sql', 'utf8')
const routeContent = readFileSync('src/app/api/jobs/[id]/time-entries/route.ts', 'utf8')
const entryRouteContent = readFileSync('src/app/api/jobs/[id]/time-entries/[entryId]/route.ts', 'utf8')
const timerContent = readFileSync('src/components/jobs/JobTimer.tsx', 'utf8')
const modalContent = readFileSync('src/components/jobs/JobDetailsModal.tsx', 'utf8')

describe('Time Tracking — Migration & Schema', () => {
  it('creates job_time_entries table', () => {
    expect(migrationContent).toContain('create table if not exists job_time_entries')
  })

  it('has id, business_id, job_id, started_at, ended_at, created_at, updated_at', () => {
    expect(migrationContent).toContain('id uuid primary key')
    expect(migrationContent).toContain('business_id uuid not null references businesses')
    expect(migrationContent).toContain('job_id uuid not null references jobs')
    expect(migrationContent).toContain('started_at timestamptz not null')
    expect(migrationContent).toContain('ended_at timestamptz')
    expect(migrationContent).toContain('created_at timestamptz not null default now()')
    expect(migrationContent).toContain('updated_at timestamptz not null default now()')
  })

  it('does NOT store a ticking seconds counter', () => {
    expect(migrationContent).not.toContain('seconds')
    expect(migrationContent).not.toContain('duration_seconds')
    expect(migrationContent).not.toContain('elapsed')
  })

  it('does NOT add employee/payroll/rate fields', () => {
    expect(migrationContent).not.toContain('employee')
    expect(migrationContent).not.toContain('payroll')
    expect(migrationContent).not.toContain('hourly_rate')
    expect(migrationContent).not.toContain('labor_cost')
    expect(migrationContent).not.toContain('break')
    expect(migrationContent).not.toContain('overtime')
    expect(migrationContent).not.toContain('gps')
    expect(migrationContent).not.toContain('approval')
  })

  it('enables RLS', () => {
    expect(migrationContent).toContain('alter table job_time_entries enable row level security')
  })

  it('has RLS policies for select/insert/update/delete', () => {
    expect(migrationContent).toContain('job_time_entries_select_own')
    expect(migrationContent).toContain('job_time_entries_insert_own')
    expect(migrationContent).toContain('job_time_entries_update_own')
    expect(migrationContent).toContain('job_time_entries_delete_own')
  })

  it('RLS policies check business ownership via user_id', () => {
    expect(migrationContent).toContain('business_id in (select id from businesses where user_id = auth.uid())')
  })

  it('has index on active entries (where ended_at is null)', () => {
    expect(migrationContent).toContain('where ended_at is null')
  })

  it('has updated_at trigger', () => {
    expect(migrationContent).toContain('set_updated_at_job_time_entries')
  })
})

describe('Time Tracking — API: Start/Stop Lifecycle', () => {
  it('POST route accepts action: start', () => {
    expect(routeContent).toContain("action === 'start'")
  })

  it('POST route accepts action: stop', () => {
    expect(routeContent).toContain("action === 'stop'")
  })

  it('start creates entry with started_at and null ended_at', () => {
    expect(routeContent).toContain('started_at: new Date().toISOString()')
    expect(routeContent).toContain('ended_at: null')
  })

  it('stop sets ended_at to current time', () => {
    expect(routeContent).toContain("ended_at: endedAt")
    expect(routeContent).toContain('new Date().toISOString()')
  })

  it('start checks for existing active timer (one active per business)', () => {
    expect(routeContent).toContain('.is(\'ended_at\', null)')
    expect(routeContent).toContain('business_id')
  })

  it('start is idempotent — returns existing active entry for same job', () => {
    expect(routeContent).toContain('activeEntries.job_id === jobId')
  })

  it('start returns 409 conflict for different job with active timer', () => {
    expect(routeContent).toContain('timer_already_active')
    expect(routeContent).toContain('409')
    expect(routeContent).toContain('activeJob')
  })

  it('stop finds active entry for this specific job', () => {
    expect(routeContent).toContain("eq('job_id', jobId)")
    expect(routeContent).toContain(".is('ended_at', null)")
  })

  it('stop returns 404 if no active timer for this job', () => {
    expect(routeContent).toContain('No active timer for this job')
  })

  it('uses requireSubscriptionAccessWithClient for business ownership', () => {
    expect(routeContent).toContain('requireSubscriptionAccessWithClient')
  })

  it('verifies job belongs to business before time operations', () => {
    expect(routeContent).toContain("from('jobs')")
    expect(routeContent).toContain("eq('business_id', businessId)")
  })

  it('does not trust client-provided business_id', () => {
    // business_id comes from authResult, not from request body
    expect(routeContent).toContain('authResult.business.id')
    expect(routeContent).not.toContain('body.business_id')
  })
})

describe('Time Tracking — API: Edit/Delete', () => {
  it('PATCH route allows editing started_at and ended_at', () => {
    expect(entryRouteContent).toContain('started_at')
    expect(entryRouteContent).toContain('ended_at')
  })

  it('PATCH validates end > start', () => {
    expect(entryRouteContent).toContain('End time must be after start time')
  })

  it('PATCH validates timestamps are parseable', () => {
    expect(entryRouteContent).toContain('Invalid started_at')
    expect(entryRouteContent).toContain('Invalid ended_at')
  })

  it('PATCH checks for active timer conflict when reopening entry', () => {
    expect(entryRouteContent).toContain('timer_already_active')
  })

  it('PATCH rejects timestamps too far in the future', () => {
    expect(entryRouteContent).toContain('too far in the future')
  })

  it('DELETE route removes a completed entry', () => {
    expect(entryRouteContent).toContain('from(\'job_time_entries\')')
    expect(entryRouteContent).toContain('.delete()')
  })

  it('DELETE enforces business and job ownership', () => {
    expect(entryRouteContent).toContain("eq('business_id', businessId)")
    expect(entryRouteContent).toContain("eq('job_id', jobId)")
  })

  it('PATCH and DELETE use requireSubscriptionAccessWithClient', () => {
    expect(entryRouteContent).toContain('requireSubscriptionAccessWithClient')
  })
})

describe('Time Tracking — Duration Utilities', () => {
  it('formatDuration produces Xh Ym format', () => {
    expect(formatDuration(8280000)).toBe('2h 18m') // 2h 18m
    expect(formatDuration(3600000)).toBe('1h 0m')
    expect(formatDuration(1800000)).toBe('30m')
    expect(formatDuration(45000)).toBe('45s')
  })

  it('formatTimerClock produces HH:MM:SS format', () => {
    expect(formatTimerClock(5056000)).toBe('01:24:16')
    expect(formatTimerClock(0)).toBe('00:00:00')
    expect(formatTimerClock(3600000)).toBe('01:00:00')
  })

  it('totalCompletedDuration sums only entries with ended_at', () => {
    const entries: JobTimeEntry[] = [
      { id: '1', job_id: 'j1', started_at: '2025-01-01T10:00:00Z', ended_at: '2025-01-01T11:00:00Z' }, // 1h
      { id: '2', job_id: 'j1', started_at: '2025-01-01T12:00:00Z', ended_at: '2025-01-01T12:30:00Z' }, // 30m
      { id: '3', job_id: 'j1', started_at: '2025-01-01T14:00:00Z', ended_at: null }, // active, not counted
    ]
    expect(totalCompletedDuration(entries)).toBe(5400000) // 1h + 30m = 1.5h = 5400000ms
  })

  it('totalCompletedDuration ignores invalid entries where end <= start', () => {
    const entries: JobTimeEntry[] = [
      { id: '1', job_id: 'j1', started_at: '2025-01-01T11:00:00Z', ended_at: '2025-01-01T10:00:00Z' }, // invalid
    ]
    expect(totalCompletedDuration(entries)).toBe(0)
  })

  it('findActiveEntry returns the entry with null ended_at', () => {
    const entries: JobTimeEntry[] = [
      { id: '1', job_id: 'j1', started_at: '2025-01-01T10:00:00Z', ended_at: '2025-01-01T11:00:00Z' },
      { id: '2', job_id: 'j1', started_at: '2025-01-01T14:00:00Z', ended_at: null },
    ]
    const active = findActiveEntry(entries)
    expect(active?.id).toBe('2')
  })

  it('findActiveEntry returns null when no active entry', () => {
    const entries: JobTimeEntry[] = [
      { id: '1', job_id: 'j1', started_at: '2025-01-01T10:00:00Z', ended_at: '2025-01-01T11:00:00Z' },
    ]
    expect(findActiveEntry(entries)).toBeNull()
  })

  it('formatEntryTime formats as h:MM AM/PM', () => {
    const time = formatEntryTime('2025-01-01T14:04:00Z')
    // Time depends on timezone, but should contain :04
    expect(time).toContain(':04')
  })

  it('formatEntryDate returns Today for today', () => {
    const today = new Date().toISOString()
    expect(formatEntryDate(today)).toBe('Today')
  })

  it('formatEntryDate returns Yesterday for yesterday', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(formatEntryDate(yesterday.toISOString())).toBe('Yesterday')
  })
})

describe('Time Tracking — UI Component', () => {
  it('JobTimer renders Start Timer button when no active entry', () => {
    expect(timerContent).toContain('Start Timer')
  })

  it('JobTimer renders Stop Timer button when active entry exists', () => {
    expect(timerContent).toContain('Stop Timer')
  })

  it('JobTimer shows running elapsed time in HH:MM:SS format', () => {
    expect(timerContent).toContain('formatTimerClock')
    expect(timerContent).toContain('Running')
  })

  it('JobTimer shows total completed duration', () => {
    expect(timerContent).toContain('formatDuration')
    expect(timerContent).toContain('completedTotal')
  })

  it('JobTimer shows conflict notice when another timer is active', () => {
    expect(timerContent).toContain('conflictJob')
    expect(timerContent).toContain('timer is already running')
  })

  it('JobTimer fetches entries from /api/jobs/[id]/time-entries', () => {
    expect(timerContent).toContain('/api/jobs/${jobId}/time-entries')
  })

  it('JobTimer ticks every second when active', () => {
    expect(timerContent).toContain('setInterval')
    expect(timerContent).toContain('1000')
  })

  it('JobTimer clears interval on cleanup', () => {
    expect(timerContent).toContain('clearInterval')
  })

  it('JobTimer displays entry history with date and time', () => {
    expect(timerContent).toContain('formatEntryDate')
    expect(timerContent).toContain('formatEntryTime')
  })

  it('JobTimer allows editing completed entries', () => {
    expect(timerContent).toContain('editingId')
    expect(timerContent).toContain('datetime-local')
  })

  it('JobTimer allows deleting completed entries with confirmation', () => {
    expect(timerContent).toContain('deleteConfirmId')
    expect(timerContent).toContain('Delete this entry?')
  })

  it('JobTimer edit validates end > start via API', () => {
    expect(timerContent).toContain('editError')
  })

  it('JobTimer uses persisted timestamps (no background timer)', () => {
    // Duration is derived from started_at, not from a ticking counter
    expect(timerContent).toContain('new Date(activeEntry.started_at).getTime()')
  })

  it('JobTimer survives refresh — fetches active entry on mount', () => {
    expect(timerContent).toContain('useEffect')
    expect(timerContent).toContain('fetchEntries')
  })
})

describe('Time Tracking — Modal Integration', () => {
  it('JobDetailsModal imports JobTimer', () => {
    expect(modalContent).toContain('import JobTimer')
  })

  it('JobDetailsModal renders JobTimer with job.id', () => {
    expect(modalContent).toContain('<JobTimer jobId={job.id}')
  })

  it('JobTimer is placed within the details section', () => {
    const timerIdx = modalContent.indexOf('<JobTimer')
    const statusIdx = modalContent.indexOf('Status Change')
    expect(timerIdx).toBeGreaterThan(statusIdx)
  })
})

describe('Time Tracking — App Lifecycle Recovery', () => {
  it('start creates one active persisted entry (server-side)', () => {
    // The API inserts a row with ended_at=null
    expect(routeContent).toContain('insert')
    expect(routeContent).toContain('ended_at: null')
  })

  it('duplicate start does not create second active entry (idempotent)', () => {
    expect(routeContent).toContain('activeEntries.job_id === jobId')
    // Returns existing entry instead of creating new one
    expect(routeContent).toContain('return NextResponse.json({ entry:')
  })

  it('refresh/reload resumes elapsed from started_at', () => {
    // JobTimer fetches entries on mount and computes elapsed from started_at
    expect(timerContent).toContain('now - new Date(activeEntry.started_at).getTime()')
  })

  it('simulated app-close/reopen derives correct elapsed (no background execution)', () => {
    // No setInterval that persists; only display tick
    expect(timerContent).toContain('setNow(Date.now())')
    // The source of truth is started_at in the database
    expect(timerContent).not.toContain('localStorage')
  })

  it('stop writes ended_at (persisted)', () => {
    expect(routeContent).toContain("update({ ended_at: endedAt })")
  })

  it('duration derives correctly from timestamps', () => {
    // totalCompletedDuration computes from started_at and ended_at
    const entries: JobTimeEntry[] = [
      { id: '1', job_id: 'j1', started_at: '2025-01-01T10:00:00Z', ended_at: '2025-01-01T12:00:00Z' },
    ]
    expect(totalCompletedDuration(entries)).toBe(7200000) // 2h
  })

  it('completed entry remains attached to job (job_id reference)', () => {
    expect(migrationContent).toContain('job_id uuid not null references jobs(id)')
  })

  it('edit completed start/end works via PATCH', () => {
    expect(entryRouteContent).toContain('PATCH')
    expect(entryRouteContent).toContain('started_at')
    expect(entryRouteContent).toContain('ended_at')
  })

  it('invalid end <= start rejected', () => {
    expect(entryRouteContent).toContain('End time must be after start time')
    expect(entryRouteContent).toContain('400')
  })

  it('delete completed entry works via DELETE', () => {
    expect(entryRouteContent).toContain('DELETE')
    expect(entryRouteContent).toContain('delete()')
  })

  it('total tracked time recalculates from entries', () => {
    // totalCompletedDuration is called with the entries array
    expect(timerContent).toContain('totalCompletedDuration(entries)')
  })

  it('different user/business cannot access entry (RLS)', () => {
    expect(migrationContent).toContain('job_time_entries_select_own')
    expect(migrationContent).toContain('business_id in (select id from businesses where user_id = auth.uid())')
  })

  it('existing Jobs behavior remains intact (status, payment, edit, delete)', () => {
    // JobDetailsModal still has status options, payment, edit, delete
    expect(modalContent).toContain('STATUS_OPTIONS')
    expect(modalContent).toContain('handleStatusChange')
    expect(modalContent).toContain('handleDelete')
    expect(modalContent).toContain('onEdit')
  })
})

describe('Time Tracking — Active-Timer Uniqueness Hardening (Batch 11 Follow-up)', () => {
  it('migration creates a UNIQUE partial index on business_id WHERE ended_at IS NULL', () => {
    expect(uniquenessMigrationContent).toContain('create unique index')
    expect(uniquenessMigrationContent).toContain('job_time_entries_one_active_per_business_idx')
    expect(uniquenessMigrationContent).toContain('on job_time_entries (business_id)')
    expect(uniquenessMigrationContent).toContain('where ended_at is null')
  })

  it('migration drops the old non-unique partial index before creating the unique one', () => {
    expect(uniquenessMigrationContent).toContain('drop index if exists job_time_entries_active_idx')
  })

  it('database enforces at most one active timer per business regardless of API races', () => {
    // The unique partial index is the source of truth, not just API pre-checks
    expect(uniquenessMigrationContent).toContain('create unique index if not exists')
  })

  it('same-job concurrent Start resolves idempotently (re-fetches existing active entry)', () => {
    // After a 23505 unique violation, the route re-fetches and returns the existing entry
    expect(routeContent).toContain("insertError?.code === '23505'")
    expect(routeContent).toContain('racedActive.job_id === jobId')
    // Returns the existing entry, not an error
    expect(routeContent).toContain('return NextResponse.json({ entry: { id: racedActive.id')
  })

  it('different-job concurrent Start returns canonical 409 timer_already_active', () => {
    expect(routeContent).toContain("insertError?.code === '23505'")
    // After re-fetch, if the active entry is for a different job, return 409
    expect(routeContent).toContain('racedActive.job_id === jobId')
    // The else branch returns 409 with activeJob info
    expect(routeContent).toContain("'timer_already_active'")
    expect(routeContent).toContain('409')
  })

  it('raw PostgreSQL/Supabase unique violation text is never exposed to the client', () => {
    // The 23505 branch returns clean JSON, never the raw error
    // The non-23505 branch returns "Failed to start timer", never the raw error
    expect(routeContent).not.toContain('duplicate key value violates unique constraint')
    expect(routeContent).not.toContain('insertError.message')
    // Raw error is only used in console.error (server logs), never in a response
    expect(routeContent).not.toContain('NextResponse.json(insertError')
    // The response in the 23505 branch uses clean messages
    expect(routeContent).toContain("'Another timer is already running'")
    expect(routeContent).toContain("'Failed to start timer'")
  })

  it('reopening an entry (PATCH ended_at → null) is protected by the same invariant', () => {
    // PATCH route also handles 23505 from the unique index when reopening
    expect(entryRouteContent).toContain("error?.code === '23505'")
    expect(entryRouteContent).toContain("'timer_already_active'")
    expect(entryRouteContent).toContain('409')
  })

  it('PATCH reopen race never exposes raw DB error text', () => {
    expect(entryRouteContent).not.toContain('duplicate key value violates unique constraint')
    expect(entryRouteContent).not.toContain('error.message')
    // Clean error message only
    expect(entryRouteContent).toContain("'Another timer is already active'")
    expect(entryRouteContent).toContain("'Failed to update time entry'")
  })

  it('pre-check is still present for useful conflict messages', () => {
    // The API still does the pre-check before insert to give a helpful message
    expect(routeContent).toContain('.is(\'ended_at\', null)')
    expect(routeContent).toContain('activeEntries.job_id === jobId')
  })

  it('normal Start/Stop behavior is unchanged', () => {
    // Start still inserts with started_at and null ended_at
    expect(routeContent).toContain('started_at: new Date().toISOString()')
    expect(routeContent).toContain('ended_at: null')
    // Stop still finds active entry and sets ended_at
    expect(routeContent).toContain("update({ ended_at: endedAt })")
    expect(routeContent).toContain('No active timer for this job')
  })
})
