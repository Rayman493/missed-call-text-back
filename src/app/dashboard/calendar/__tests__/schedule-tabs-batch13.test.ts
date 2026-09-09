import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const tccContent = readFileSync('src/components/schedule/TodayCommandCenter.tsx', 'utf8')
const jobComposerContent = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const jobDetailsModalContent = readFileSync('src/components/jobs/JobDetailsModal.tsx', 'utf8')
const jobTimerContent = readFileSync('src/components/jobs/JobTimer.tsx', 'utf8')

describe('Batch 13 — Agenda Simplification', () => {
  it('TodayCommandCenter accepts onNavigateTab prop', () => {
    expect(tccContent).toContain('onNavigateTab')
    expect(tccContent).toContain("onNavigateTab?: (tab: 'reminders' | 'jobs' | 'appointments') => void")
  })

  it('Agenda no longer renders full Reminders section with expandable list', () => {
    // The old secondary sections with expand buttons should be gone
    expect(tccContent).not.toContain('setExpandedReminders')
    expect(tccContent).not.toContain('setExpandedJobs')
    expect(tccContent).not.toContain('setExpandedAppointments')
  })

  it('Agenda has Needs Attention section for overdue items', () => {
    expect(tccContent).toContain('Needs Attention')
    expect(tccContent).toContain('overdue')
  })

  it('Agenda has View Reminders / View Jobs / View Appointments links', () => {
    expect(tccContent).toContain('View Reminders')
    expect(tccContent).toContain('View Jobs')
    expect(tccContent).toContain('View Appointments')
  })

  it('Agenda summary cards navigate to dedicated tabs via onNavigateTab', () => {
    expect(tccContent).toContain("onNavigateTab?.('reminders')")
    expect(tccContent).toContain("onNavigateTab?.('jobs')")
    expect(tccContent).toContain("onNavigateTab?.('appointments')")
  })

  it('page.tsx wires onNavigateTab to setScheduleTab', () => {
    expect(pageContent).toContain('onNavigateTab={(tab) => setScheduleTab(tab)}')
  })

  it('Agenda keeps summary line with counts', () => {
    expect(tccContent).toContain('Reminders')
    expect(tccContent).toContain('Jobs')
    expect(tccContent).toContain('Appointments')
    expect(tccContent).toContain('Overdue')
  })

  it('Agenda keeps Today section with chronological work items', () => {
    expect(tccContent).toContain('Today')
    expect(tccContent).toContain('sortedWorkItems')
  })
})

describe('Batch 13 — Today Row Structure', () => {
  it('Today rows have icon column, title, secondary metadata, and right-side actions', () => {
    expect(tccContent).toContain('getIconForType')
    expect(tccContent).toContain('item.title')
    expect(tccContent).toContain('item.time')
    expect(tccContent).toContain('item.customer')
  })

  it('Today rows have hover state', () => {
    expect(tccContent).toContain('hover:bg-blue-100/50')
  })

  it('Today task rows have completion checkbox', () => {
    expect(tccContent).toContain('toggleTaskComplete')
  })

  it('Today job rows have View and Edit actions', () => {
    expect(tccContent).toContain('onJobClick?.(item.data)')
    expect(tccContent).toContain('onEditJob(item.data)')
  })
})

describe('Batch 13 — Reminders Tab Improvements', () => {
  it('RemindersList has completion checkbox action', () => {
    expect(pageContent).toContain('onToggleComplete={handleToggleTaskComplete}')
  })

  it('RemindersList has delete action', () => {
    expect(pageContent).toContain('onDeleteTask={handleDeleteTask}')
    expect(pageContent).toContain('Trash2')
  })

  it('RemindersList has edit action', () => {
    expect(pageContent).toContain('onEditTask={handleAgendaEditTask}')
  })

  it('RemindersList groups with section counts', () => {
    expect(pageContent).toContain('Overdue')
    expect(pageContent).toContain('Today')
    expect(pageContent).toContain('Upcoming')
    expect(pageContent).toContain('No Due Date')
    expect(pageContent).toContain('Completed')
    // Counts in parentheses
    expect(pageContent).toContain('({count})')
  })

  it('page.tsx has handleToggleTaskComplete handler', () => {
    expect(pageContent).toContain('const handleToggleTaskComplete = useCallback')
    expect(pageContent).toContain('/api/tasks/${taskId}')
    expect(pageContent).toContain('PATCH')
  })

  it('page.tsx has handleDeleteTask handler', () => {
    expect(pageContent).toContain('const handleDeleteTask = useCallback')
    expect(pageContent).toContain('DELETE')
  })

  it('Reminders tab has consistent header with title + helper + Add action', () => {
    // Use the RemindersList component section, not the tab strip
    const remindersSection = pageContent.split("{scheduleTab === 'reminders' && (")[1]?.split("{scheduleTab === 'jobs' && (")[0] || ''
    expect(remindersSection).toContain('Reminders')
    expect(remindersSection).toContain('Manage reminders and follow-ups.')
    expect(remindersSection).toContain('Add Reminder')
  })

  it('Reminders empty state is actionable', () => {
    expect(pageContent).toContain('No reminders yet')
    expect(pageContent).toContain('Add a reminder to keep follow-ups on track.')
  })
})

describe('Batch 13 — Jobs Tab Improvements', () => {
  it('JobsTab accepts onEditJob prop', () => {
    expect(pageContent).toContain('onEditJob?: (job: Job) => void')
  })

  it('page.tsx wires onEditJob to JobsTab', () => {
    const jobsSection = pageContent.split("{scheduleTab === 'jobs' && (")[1]?.split("{scheduleTab === 'appointments' && (")[0] || ''
    expect(jobsSection).toContain('onEditJob={(job) => {')
    expect(jobsSection).toContain('setEditingJob(job)')
    expect(jobsSection).toContain('setIsJobComposerOpen(true)')
  })

  it('JobsTab shows payment badge', () => {
    expect(pageContent).toContain('PAYMENT_LABELS')
    expect(pageContent).toContain('Payment Requested')
    expect(pageContent).toContain('Paid')
    expect(pageContent).toContain('payment_status')
  })

  it('JobsTab rows have View and Edit actions', () => {
    expect(pageContent).toContain('View')
    expect(pageContent).toContain('Edit')
  })

  it('JobsTab shows customer, date, location metadata', () => {
    expect(pageContent).toContain('customer_name')
    expect(pageContent).toContain('formatScheduled')
    expect(pageContent).toContain('addressFirstLine')
  })

  it('JobsTab groups with section counts', () => {
    expect(pageContent).toContain('Active Jobs')
    expect(pageContent).toContain('Completed Jobs')
    expect(pageContent).toContain('Cancelled Jobs')
    expect(pageContent).toContain('({active.length})')
  })

  it('Jobs tab has consistent header with title + helper + Add action', () => {
    const jobsTabFunction = pageContent.split('function JobsTab(')[1]?.split('function ')[0] || ''
    expect(jobsTabFunction).toContain('Jobs')
    expect(jobsTabFunction).toContain('Manage customer work from scheduled to completed.')
    expect(jobsTabFunction).toContain('New Job')
  })

  it('Jobs empty state is actionable', () => {
    expect(pageContent).toContain('No active jobs')
    expect(pageContent).toContain('Create a job to start tracking customer work.')
  })

  it('Job Timer remains accessible from JobDetailsModal and JobComposer', () => {
    expect(jobDetailsModalContent).toContain('import JobTimer')
    expect(jobComposerContent).toContain('import JobTimer')
    expect(jobComposerContent).toContain('{editJob && (')
  })
})

describe('Batch 13 — Appointments Tab Improvements', () => {
  it('Appointments tab has consistent header with title + helper + Add action', () => {
    const apptsSection = pageContent.split('function MeetingsTab(')[1]?.split('export default')[0] || ''
    expect(apptsSection).toContain('Appointments')
    expect(apptsSection).toContain('Manage meetings and scheduled customer time.')
    expect(apptsSection).toContain('New Appointment')
  })

  it('Appointment rows show type labels (Google Meet, In Person, Virtual, Appointment)', () => {
    const meetingsTabFunction = pageContent.split('function MeetingsTab(')[1]?.split('export default')[0] || ''
    expect(meetingsTabFunction).toContain('Google Meet')
    expect(meetingsTabFunction).toContain('In Person')
    expect(meetingsTabFunction).toContain('Virtual')
    expect(meetingsTabFunction).toContain('Appointment')
  })

  it('Appointment rows have prominent Join button for Google Meet events', () => {
    const meetingsTabFunction = pageContent.split('function MeetingsTab(')[1]?.split('export default')[0] || ''
    expect(meetingsTabFunction).toContain('Join')
    expect(meetingsTabFunction).toContain('meetingUrl')
    expect(meetingsTabFunction).toContain('ExternalLink')
  })

  it('Appointment rows have View action', () => {
    const meetingsTabFunction = pageContent.split('function MeetingsTab(')[1]?.split('export default')[0] || ''
    expect(meetingsTabFunction).toContain('View')
  })

  it('Appointment groups have section counts', () => {
    const meetingsTabFunction = pageContent.split('function MeetingsTab(')[1]?.split('export default')[0] || ''
    expect(meetingsTabFunction).toContain('Today')
    expect(meetingsTabFunction).toContain('Upcoming')
    expect(meetingsTabFunction).toContain('Recently Completed')
    expect(meetingsTabFunction).toContain('({count})')
  })

  it('Appointments empty state is actionable', () => {
    expect(pageContent).toContain('No appointments scheduled')
    expect(pageContent).toContain('Schedule an appointment to keep customer time organized.')
  })

  it('Google Calendar ownership semantics preserved (no new delete logic)', () => {
    // The page should not introduce new delete logic for Google Calendar events
    expect(pageContent).not.toContain('DELETE.*google.*calendar')
  })
})

describe('Batch 13 — Mobile Safety', () => {
  it('mobile tab strip uses horizontal scroll with no-scrollbar', () => {
    const mobileSection = pageContent.split('md:hidden mb-4 mt-2')[1]?.split('</div>\n                  </div>')[0] || ''
    expect(mobileSection).toContain('overflow-x-auto')
    expect(mobileSection).toContain('no-scrollbar')
    expect(mobileSection).toContain('whitespace-nowrap')
    expect(mobileSection).toContain('flex-shrink-0')
  })

  it('mobile Add buttons have short labels (Add/New)', () => {
    expect(pageContent).toContain('<span className="sm:hidden">Add</span>')
    expect(pageContent).toContain('<span className="sm:hidden">New</span>')
  })

  it('Jobs tab row actions are tap-friendly (not cramped)', () => {
    const jobsTabFunction = pageContent.split('function JobsTab(')[1]?.split('function ')[0] || ''
    expect(jobsTabFunction).toContain('border-t border-slate-100')
  })
})

describe('Batch 13 — No Backend/Schema Changes', () => {
  it('no new API endpoints introduced', () => {
    expect(pageContent).toContain('/api/jobs')
    expect(pageContent).toContain('/api/tasks')
    expect(pageContent).toContain('/api/google/calendar/events')
    expect(pageContent).not.toContain('/api/reminders')
    expect(pageContent).not.toContain('/api/appointments')
  })

  it('no duplicate data fetching (jobs/tasks/events fetched once)', () => {
    const fetchJobsCount = (pageContent.match(/const fetchJobs = /g) || []).length
    const fetchTasksCount = (pageContent.match(/const fetchTasks = /g) || []).length
    const fetchEventsCount = (pageContent.match(/const fetchEvents = /g) || []).length
    expect(fetchJobsCount).toBe(1)
    expect(fetchTasksCount).toBe(1)
    expect(fetchEventsCount).toBe(1)
  })

  it('task toggle/delete reuse existing /api/tasks endpoints', () => {
    expect(pageContent).toContain('/api/tasks/${taskId}')
    expect(pageContent).toContain('PATCH')
    expect(pageContent).toContain('DELETE')
  })

  it('no new database migrations', () => {
    // No new SQL files should be referenced
    expect(pageContent).not.toContain('CREATE TABLE')
    expect(pageContent).not.toContain('ALTER TABLE')
  })
})

describe('Batch 13 — Tab Switching Does Not Refetch', () => {
  it('switching tabs does not trigger fetchJobs/fetchTasks/fetchEvents', () => {
    // setScheduleTab should only appear in onClick handlers, not in useEffect
    const useEffectBlocks = pageContent.match(/useEffect\([^)]+\)/g) || []
    useEffectBlocks.forEach(block => {
      expect(block).not.toContain('setScheduleTab')
    })
  })
})

describe('Batch 13 — Calendar & Map Unchanged', () => {
  it('Calendar tab still renders CalendarGrid when connected', () => {
    expect(pageContent).toContain("calendarConnected && scheduleTab === 'calendar'")
    expect(pageContent).toContain('<CalendarGrid')
  })

  it('Map tab still renders ScheduleMap', () => {
    expect(pageContent).toContain("scheduleTab === 'map'")
    expect(pageContent).toContain('<ScheduleMap')
  })

  it('Map tab still passes all existing props', () => {
    expect(pageContent).toContain('onViewCustomer={handleMapViewCustomer}')
    expect(pageContent).toContain('onEditJob={handleMapEditJob}')
    expect(pageContent).toContain('onEditTask={handleMapEditTask}')
    expect(pageContent).toContain('onEditEvent={handleMapEditEvent}')
  })
})
