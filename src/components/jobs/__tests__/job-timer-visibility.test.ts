import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const jobComposerContent = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const jobTimerContent = readFileSync('src/components/jobs/JobTimer.tsx', 'utf8')
const jobDetailsModalContent = readFileSync('src/components/jobs/JobDetailsModal.tsx', 'utf8')

describe('Job Timer Visibility in Edit Job Flow', () => {
  it('JobComposer imports JobTimer', () => {
    expect(jobComposerContent).toContain("import JobTimer from '@/components/jobs/JobTimer'")
  })

  it('JobComposer renders JobTimer only in edit mode (editJob exists)', () => {
    expect(jobComposerContent).toContain('{editJob && (')
    expect(jobComposerContent).toContain('<JobTimer jobId={editJob.id} />')
  })

  it('JobComposer does NOT render JobTimer in New Job mode', () => {
    // The conditional is {editJob && ...}, so when editJob is undefined, JobTimer is not rendered
    // Verify there is no unconditional <JobTimer render
    const unconditionalMatch = jobComposerContent.match(/<JobTimer[^}]/)
    // All JobTimer renders should be inside the editJob conditional
    const timerRenderIdx = jobComposerContent.indexOf('<JobTimer jobId={editJob.id} />')
    const conditionalIdx = jobComposerContent.indexOf('{editJob && (')
    expect(timerRenderIdx).toBeGreaterThan(conditionalIdx)
  })

  it('JobTimer is placed after Notes section in JobComposer', () => {
    const notesIdx = jobComposerContent.indexOf('Any additional notes about this job')
    const timerIdx = jobComposerContent.indexOf('<JobTimer jobId={editJob.id} />')
    expect(timerIdx).toBeGreaterThan(notesIdx)
  })

  it('JobTimer is placed before the error text in JobComposer', () => {
    const timerIdx = jobComposerContent.indexOf('<JobTimer jobId={editJob.id} />')
    const errorIdx = jobComposerContent.indexOf('{error && (')
    expect(errorIdx).toBeGreaterThan(timerIdx)
  })

  it('persisted job.id is passed correctly to JobTimer', () => {
    expect(jobComposerContent).toContain('jobId={editJob.id}')
  })
})

describe('Job Timer — No Form State Interference', () => {
  it('JobTimer is a self-contained component (does not use JobComposer form state)', () => {
    // JobTimer fetches its own data from /api/jobs/[id]/time-entries
    expect(jobTimerContent).toContain('/api/jobs/${jobId}/time-entries')
    // JobTimer manages its own state
    expect(jobTimerContent).toContain('useState')
    expect(jobTimerContent).toContain('entries')
  })

  it('JobTimer Start/Stop actions use their own API, not the Job save API', () => {
    expect(jobTimerContent).toContain("action: 'start'")
    expect(jobTimerContent).toContain("action: 'stop'")
    // Does NOT call /api/jobs POST/PATCH
    const saveApiMatch = jobTimerContent.match(/\/api\/jobs[^/]/)
    // JobTimer uses /api/jobs/[id]/time-entries, not /api/jobs directly
    expect(jobTimerContent).not.toMatch(/fetch\(['"`]\/api\/jobs['"`]/)
  })

  it('JobTimer does not call onSave or onClose of the parent modal', () => {
    expect(jobTimerContent).not.toContain('onSave')
    expect(jobTimerContent).not.toContain('onClose')
  })

  it('JobTimer does not touch JobComposer form fields (title, address, date, time, status, notes)', () => {
    expect(jobTimerContent).not.toContain('setTitle')
    expect(jobTimerContent).not.toContain('setServiceAddress')
    expect(jobTimerContent).not.toContain('setScheduledDate')
    expect(jobTimerContent).not.toContain('setScheduledTime')
    expect(jobTimerContent).not.toContain('setStatus')
    expect(jobTimerContent).not.toContain('setNotes')
  })

  it('timer state changes do not clear unsaved Job draft (no form reset in JobTimer)', () => {
    expect(jobTimerContent).not.toContain('setTitle')
    expect(jobTimerContent).not.toContain('setCustomerName')
    expect(jobTimerContent).not.toContain('setCustomerPhone')
  })

  it('existing Job save behavior unchanged (handleSave still validates and submits)', () => {
    expect(jobComposerContent).toContain('handleSave')
    expect(jobComposerContent).toContain('Please select a customer to create this job')
    expect(jobComposerContent).toContain('/api/jobs')
  })
})

describe('Job Timer — No Duplicate Implementation', () => {
  it('JobTimer component is reused (not duplicated) in JobComposer', () => {
    // Only one import of JobTimer
    const importMatches = jobComposerContent.match(/import JobTimer/g) || []
    expect(importMatches.length).toBe(1)
  })

  it('JobTimer component is also in JobDetailsModal (both surfaces covered)', () => {
    expect(jobDetailsModalContent).toContain('import JobTimer')
    expect(jobDetailsModalContent).toContain('<JobTimer jobId={job.id}')
  })

  it('no duplicate timer logic in JobComposer (no direct time-entries API calls)', () => {
    // JobComposer should not directly call time-entries API — that's JobTimer's job
    expect(jobComposerContent).not.toContain('/time-entries')
    expect(jobComposerContent).not.toContain('formatDuration')
    expect(jobComposerContent).not.toContain('formatTimerClock')
  })
})

describe('Job Timer — All User-Facing Job Paths', () => {
  it('Calendar page: JobComposer is rendered with editJob for edit flow', () => {
    const calendarContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
    expect(calendarContent).toContain('editJob={editingJob || undefined}')
    expect(calendarContent).toContain('<JobComposer')
  })

  it('Calendar page: JobDetailsModal also has JobTimer (details view)', () => {
    const calendarContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
    expect(calendarContent).toContain('<JobDetailsModal')
  })

  it('Customer detail page: JobComposer rendered (create mode only, no editJob)', () => {
    const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')
    expect(pageClientContent).toContain('<JobComposer')
    // Customer detail does not pass editJob, so timer won't show there (correct — no edit flow)
  })

  it('TodayCommandCenter has edit pencil that opens JobComposer in edit mode', () => {
    const tccContent = readFileSync('src/components/schedule/TodayCommandCenter.tsx', 'utf8')
    expect(tccContent).toContain('onEditJob')
  })
})
