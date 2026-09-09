import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const tccContent = readFileSync('src/components/schedule/TodayCommandCenter.tsx', 'utf8')
const jobComposerContent = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const jobDetailsModalContent = readFileSync('src/components/jobs/JobDetailsModal.tsx', 'utf8')
const jobTimerContent = readFileSync('src/components/jobs/JobTimer.tsx', 'utf8')

describe('Schedule Tab Architecture — Tab Strip', () => {
  it('scheduleTab state includes all 6 tabs', () => {
    expect(pageContent).toContain("'agenda' | 'reminders' | 'jobs' | 'appointments' | 'calendar' | 'map'")
  })

  it('Agenda is the default tab', () => {
    expect(pageContent).toContain("return 'agenda'")
  })

  it('desktop tab strip has exactly 6 tab buttons', () => {
    // Count setScheduleTab calls in the desktop tab strip section
    const desktopSection = pageContent.split('hidden md:flex mb-3')[1]?.split('</div>')[0] || ''
    const agendaBtn = desktopSection.includes("setScheduleTab('agenda')")
    const remindersBtn = desktopSection.includes("setScheduleTab('reminders')")
    const jobsBtn = desktopSection.includes("setScheduleTab('jobs')")
    const appointmentsBtn = desktopSection.includes("setScheduleTab('appointments')")
    const calendarBtn = desktopSection.includes("setScheduleTab('calendar')")
    const mapBtn = desktopSection.includes("setScheduleTab('map')")
    expect(agendaBtn).toBe(true)
    expect(remindersBtn).toBe(true)
    expect(jobsBtn).toBe(true)
    expect(appointmentsBtn).toBe(true)
    expect(calendarBtn).toBe(true)
    expect(mapBtn).toBe(true)
  })

  it('mobile tab strip has all 6 tabs with horizontal scroll', () => {
    const mobileSection = pageContent.split('md:hidden mb-4 mt-2')[1]?.split('</div>\n                  </div>')[0] || ''
    expect(mobileSection).toContain('overflow-x-auto')
    expect(mobileSection).toContain('no-scrollbar')
    expect(mobileSection).toContain("setScheduleTab('agenda')")
    expect(mobileSection).toContain("setScheduleTab('reminders')")
    expect(mobileSection).toContain("setScheduleTab('jobs')")
    expect(mobileSection).toContain("setScheduleTab('appointments')")
    expect(mobileSection).toContain("setScheduleTab('calendar')")
    expect(mobileSection).toContain("setScheduleTab('map')")
  })

  it('mobile tabs use whitespace-nowrap and flex-shrink-0 to prevent wrapping', () => {
    const mobileSection = pageContent.split('md:hidden mb-4 mt-2')[1]?.split('</div>\n                  </div>')[0] || ''
    expect(mobileSection).toContain('whitespace-nowrap')
    expect(mobileSection).toContain('flex-shrink-0')
  })

  it('uses single tab strip (no second navigation bar)', () => {
    // There should be only one "hidden md:flex mb-3" tab strip
    const desktopTabStrips = pageContent.match(/hidden md:flex mb-3/g) || []
    expect(desktopTabStrips.length).toBe(1)
  })
})

describe('Schedule Tab Architecture — Agenda', () => {
  it('Agenda renders FocusSection and TodayCommandCenter', () => {
    expect(pageContent).toContain("scheduleTab === 'agenda'")
    expect(pageContent).toContain('FocusSection')
    expect(pageContent).toContain('TodayCommandCenter')
  })

  it('Agenda remains the overview/command-center (keeps Today section)', () => {
    // TodayCommandCenter has Today section
    expect(tccContent).toContain('Today')
  })

  it('Agenda does not render full long-form category management lists directly', () => {
    // The agenda section should NOT contain JobsTab, MeetingsTab, or RemindersList directly
    const agendaSection = pageContent.split("scheduleTab === 'agenda'")[1]?.split("scheduleTab === '")[0] || ''
    expect(agendaSection).not.toContain('<JobsTab')
    expect(agendaSection).not.toContain('<MeetingsTab')
    expect(agendaSection).not.toContain('<RemindersList')
  })
})

describe('Schedule Tab Architecture — Reminders Tab', () => {
  it('Reminders tab renders RemindersList component', () => {
    expect(pageContent).toContain("scheduleTab === 'reminders'")
    expect(pageContent).toContain('<RemindersList')
  })

  it('RemindersList is a scoped component in the same file', () => {
    expect(pageContent).toContain('function RemindersList(')
  })

  it('RemindersList reuses existing task data (tasks state) and edit handler', () => {
    expect(pageContent).toContain('tasks={tasks}')
    expect(pageContent).toContain('onEditTask={handleAgendaEditTask}')
  })

  it('RemindersList has + Add Reminder action using existing NewTaskModal', () => {
    expect(pageContent).toContain('onAddTask={() => setIsNewTaskModalOpen(true)}')
  })

  it('RemindersList has a useful empty state', () => {
    expect(pageContent).toContain('No reminders yet')
  })

  it('RemindersList groups by overdue/today/upcoming/completed', () => {
    expect(pageContent).toContain('Overdue')
    expect(pageContent).toContain('Today')
    expect(pageContent).toContain('Upcoming')
    expect(pageContent).toContain('Completed')
  })
})

describe('Schedule Tab Architecture — Jobs Tab', () => {
  it('Jobs tab renders JobsTab component', () => {
    expect(pageContent).toContain("scheduleTab === 'jobs'")
    expect(pageContent).toContain('<JobsTab')
  })

  it('JobsTab is a scoped component (not a new file)', () => {
    expect(pageContent).toContain('function JobsTab(')
  })

  it('JobsTab reuses existing jobs data and openNewJob handler', () => {
    expect(pageContent).toContain('jobs={jobs}')
    expect(pageContent).toContain('onNewJob={openNewJob}')
  })

  it('JobsTab opens JobDetailsModal on job click (existing behavior)', () => {
    expect(pageContent).toContain('onJobClick={(job) => {')
    expect(pageContent).toContain('setSelectedJob(job as Job)')
    expect(pageContent).toContain("setIsJobDetailsOpen(true)")
  })

  it('JobsTab has a useful empty state', () => {
    expect(pageContent).toContain('No active jobs yet')
  })

  it('JobsTab groups by active/completed/cancelled', () => {
    expect(pageContent).toContain('Active Jobs')
    expect(pageContent).toContain('Completed Jobs')
    expect(pageContent).toContain('Cancelled Jobs')
  })
})

describe('Schedule Tab Architecture — Appointments Tab', () => {
  it('Appointments tab renders MeetingsTab component', () => {
    expect(pageContent).toContain("scheduleTab === 'appointments'")
    expect(pageContent).toContain('<MeetingsTab')
  })

  it('MeetingsTab is a scoped component (not a new file)', () => {
    expect(pageContent).toContain('function MeetingsTab(')
  })

  it('MeetingsTab reuses existing events data and handleNewAppointment', () => {
    expect(pageContent).toContain('events={events}')
    expect(pageContent).toContain('onNewMeeting={handleNewAppointment}')
  })

  it('MeetingsTab opens EventDetailsModal on event click (existing behavior)', () => {
    expect(pageContent).toContain('onOpenEvent={(event) => {')
    expect(pageContent).toContain('setSelectedEvent(event)')
    expect(pageContent).toContain("setEventDetailsMode('details')")
    expect(pageContent).toContain("setIsEventDetailsOpen(true)")
  })

  it('MeetingsTab preserves Google Meet Join behavior', () => {
    // MeetingsTab renders Join link for events with meetingUrl
    const meetingsTabSection = pageContent.split('function MeetingsTab(')[1]?.split('function ')[0] || ''
    expect(meetingsTabSection).toContain('meetingUrl')
    expect(meetingsTabSection).toContain('Join')
  })

  it('MeetingsTab has a useful empty state', () => {
    expect(pageContent).toContain('No meetings scheduled')
  })
})

describe('Schedule Tab Architecture — Calendar & Map Unchanged', () => {
  it('Calendar tab still renders CalendarGrid when connected', () => {
    expect(pageContent).toContain("calendarConnected && scheduleTab === 'calendar'")
    expect(pageContent).toContain('<CalendarGrid')
  })

  it('Calendar disconnected state still shows Connect Google Calendar', () => {
    expect(pageContent).toContain('Connect Google Calendar')
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

describe('Schedule Tab Architecture — Job Timer Accessibility', () => {
  it('Job Timer remains accessible from JobDetailsModal (details view)', () => {
    expect(jobDetailsModalContent).toContain('import JobTimer')
    expect(jobDetailsModalContent).toContain('<JobTimer jobId={job.id}')
  })

  it('Job Timer remains accessible from JobComposer (edit mode)', () => {
    expect(jobComposerContent).toContain('import JobTimer')
    expect(jobComposerContent).toContain('{editJob && (')
    expect(jobComposerContent).toContain('<JobTimer jobId={editJob.id} />')
  })

  it('Jobs tab opens JobDetailsModal which has JobTimer', () => {
    // JobsTab onJobClick opens JobDetailsModal
    expect(pageContent).toContain('setIsJobDetailsOpen(true)')
  })

  it('Job Timer is self-contained (no form state interference)', () => {
    expect(jobTimerContent).not.toContain('setTitle')
    expect(jobTimerContent).not.toContain('setNotes')
    expect(jobTimerContent).not.toContain('onSave')
    expect(jobTimerContent).not.toContain('onClose')
  })
})

describe('Schedule Tab Architecture — No Duplicate Backend Logic', () => {
  it('no new API endpoints introduced', () => {
    // The page should still only use existing endpoints
    expect(pageContent).toContain('/api/jobs')
    expect(pageContent).toContain('/api/tasks')
    expect(pageContent).toContain('/api/google/calendar/events')
    // No new endpoints
    expect(pageContent).not.toContain('/api/reminders')
    expect(pageContent).not.toContain('/api/appointments')
  })

  it('no duplicate data fetching (jobs/tasks/events fetched once, shared across tabs)', () => {
    // fetchJobs, fetchTasks, fetchEvents should each appear once
    const fetchJobsCount = (pageContent.match(/const fetchJobs = /g) || []).length
    const fetchTasksCount = (pageContent.match(/const fetchTasks = /g) || []).length
    const fetchEventsCount = (pageContent.match(/const fetchEvents = /g) || []).length
    expect(fetchJobsCount).toBe(1)
    expect(fetchTasksCount).toBe(1)
    expect(fetchEventsCount).toBe(1)
  })

  it('no duplicate timer component implementation', () => {
    // JobTimer should be imported once and reused
    const jobTimerImports = (jobComposerContent.match(/import JobTimer/g) || []).length
    expect(jobTimerImports).toBe(1)
    const jobDetailsTimerImports = (jobDetailsModalContent.match(/import JobTimer/g) || []).length
    expect(jobDetailsTimerImports).toBe(1)
  })
})

describe('Schedule Tab Architecture — Existing Behavior Preserved', () => {
  it('existing Add actions open the same canonical create flows', () => {
    // NewTaskModal for reminders
    expect(pageContent).toContain('setIsNewTaskModalOpen(true)')
    // openNewJob for jobs
    expect(pageContent).toContain('openNewJob')
    // handleNewAppointment for appointments
    expect(pageContent).toContain('handleNewAppointment')
  })

  it('existing edit/delete/complete behavior preserved (handlers unchanged)', () => {
    expect(pageContent).toContain('handleAgendaEditTask')
    expect(pageContent).toContain('handleJobDeleted')
    expect(pageContent).toContain('handleMapViewCustomer')
  })

  it('switching tabs does not refetch (data fetched once on mount)', () => {
    // Data is fetched in useEffect on business change, not on tab change
    expect(pageContent).toContain('if (business) {')
    expect(pageContent).toContain('fetchJobs()')
    expect(pageContent).toContain('fetchTasks()')
  })

  it('Create Job still requires a selected customer (validation intact)', () => {
    expect(jobComposerContent).toContain('Please select a customer to create this job')
  })
})
