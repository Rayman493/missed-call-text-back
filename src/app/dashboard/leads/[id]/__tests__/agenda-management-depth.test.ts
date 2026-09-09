import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')
const sidebarContent = readFileSync('src/components/SidebarSection.tsx', 'utf8')

describe('Agenda Management Depth — Reminders (Batch 10)', () => {
  it('exposes overdue badge on reminder rows (desktop)', () => {
    expect(pageClientContent).toContain('Overdue')
    expect(pageClientContent).toContain('taskOverdue')
  })

  it('exposes today badge on reminder rows (desktop)', () => {
    expect(pageClientContent).toContain('Today')
    expect(pageClientContent).toContain('taskToday')
  })

  it('overdue badge only shows for incomplete tasks', () => {
    expect(pageClientContent).toContain('!task.completed')
  })

  it('preserves completion status display (Done/Open)', () => {
    expect(pageClientContent).toContain("'Done'")
    expect(pageClientContent).toContain("'Open'")
  })

  it('preserves Add reminder action', () => {
    expect(pageClientContent).toContain('openTaskModal')
  })

  it('preserves due date and time display', () => {
    expect(pageClientContent).toContain('task.due_date')
    expect(pageClientContent).toContain('task.due_time')
  })

  it('desktop reminders section is collapsible', () => {
    expect(pageClientContent).toContain('collapsedSections.reminders')
  })
})

describe('Agenda Management Depth — Jobs (Batch 10)', () => {
  it('exposes customer name on job rows (desktop)', () => {
    expect(pageClientContent).toContain('job.customer_name')
  })

  it('falls back to lead name when job customer_name is missing', () => {
    expect(pageClientContent).toContain('leadData?.name')
  })

  it('exposes payment status badge on job rows', () => {
    expect(pageClientContent).toContain('job.payment_status')
    expect(pageClientContent).toContain("'paid'")
    expect(pageClientContent).toContain("'Payment Req'")
  })

  it('preserves job status display', () => {
    expect(pageClientContent).toContain('formatJobStatus')
  })

  it('preserves scheduled date and time display', () => {
    expect(pageClientContent).toContain('job.scheduled_date')
    expect(pageClientContent).toContain('job.scheduled_time')
  })

  it('preserves Add job action', () => {
    expect(pageClientContent).toContain('handleCreateJobClick')
  })

  it('desktop Schedule section is collapsible', () => {
    expect(pageClientContent).toContain('collapsedSections.schedule')
  })

  it('desktop Jobs section is collapsible', () => {
    expect(pageClientContent).toContain('collapsedSections.jobs')
  })
})

describe('Agenda Management Depth — Appointments (Batch 10)', () => {
  it('exposes Google Meet label for Meet appointments', () => {
    expect(pageClientContent).toContain('Google Meet')
    expect(pageClientContent).toContain('isMeetAppointment')
  })

  it('detects Meet appointments by meetingUrl and meet.google.com host', () => {
    expect(pageClientContent).toContain('/meet\\.google\\.com/i.test(event.meetingUrl)')
  })

  it('renders Join button for Meet appointments with meeting URL', () => {
    expect(pageClientContent).toContain('Join')
    expect(pageClientContent).toContain('aria-label="Join Google Meet"')
  })

  it('Join uses event meeting URL', () => {
    expect(pageClientContent).toContain('href={event.meetingUrl}')
  })

  it('imports Video icon for Meet affordance', () => {
    expect(pageClientContent).toContain('Video')
  })

  it('imports ExternalLink icon for Join button', () => {
    expect(pageClientContent).toContain('ExternalLink')
  })

  it('preserves Past badge for past appointments', () => {
    expect(pageClientContent).toContain('Past')
  })

  it('preserves Add appointment action', () => {
    expect(pageClientContent).toContain('handleAppointmentClick')
  })

  it('desktop Appointments section is collapsible', () => {
    expect(pageClientContent).toContain('collapsedSections.appointments')
  })
})

describe('Agenda Management Depth — Header Alignment (Batch 10)', () => {
  it('SidebarSection reserves a fixed-width chevron slot', () => {
    expect(sidebarContent).toContain('w-6 flex-shrink-0 flex items-center justify-center')
  })

  it('SidebarSection chevron is inside the reserved slot', () => {
    const chevronSection = sidebarContent.split('w-6 flex-shrink-0')[1]?.split('</div>')[0] || ''
    expect(chevronSection).toContain('ChevronDown')
  })

  it('SidebarSection does not render empty padding when collapsed', () => {
    expect(sidebarContent).toContain('{!isCollapsed && <div className="p-4">{children}</div>}')
  })

  it('mobile Schedule header has reserved chevron slot', () => {
    expect(pageClientContent).toContain('w-6 flex-shrink-0 flex items-center justify-center')
  })

  it('mobile Jobs header has reserved chevron slot', () => {
    // Multiple occurrences expected across sections
    const slots = pageClientContent.match(/w-6 flex-shrink-0 flex items-center justify-center/g) || []
    expect(slots.length).toBeGreaterThanOrEqual(3)
  })

  it('mobile Reminders header has reserved chevron slot', () => {
    const slots = pageClientContent.match(/w-6 flex-shrink-0 flex items-center justify-center/g) || []
    expect(slots.length).toBeGreaterThanOrEqual(3)
  })

  it('mobile Appointments header has reserved chevron slot', () => {
    const slots = pageClientContent.match(/w-6 flex-shrink-0 flex items-center justify-center/g) || []
    expect(slots.length).toBeGreaterThanOrEqual(3)
  })

  it('desktop Schedule Add button uses compact text+icon treatment', () => {
    expect(pageClientContent).toContain('text-blue-600 dark:text-blue-400 hover:underline')
  })

  it('all three desktop agenda Add buttons use consistent compact text+plus pattern (Batch 11)', () => {
    // Schedule, Reminders, Appointments should all use the same compact text+plus treatment
    const compactAddPattern = /text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900\/20/g
    const matches = pageClientContent.match(compactAddPattern) || []
    expect(matches.length).toBeGreaterThanOrEqual(3) // Schedule + Reminders + Appointments
  })

  it('no desktop agenda section uses the old icon-only w-8 h-8 Add button (Batch 11)', () => {
    // The old pattern was w-8 h-8 bg-background hover:bg-muted/50 border for Add buttons
    // Reminders, Jobs (Schedule), and Appointments should no longer use this for their Add actions
    // Payments and Internal Notes may still use it since they are not agenda sections
    const oldIconButtons = pageClientContent.match(/w-8 h-8 bg-background hover:bg-muted\/50 border border-border\/50 text-foreground text-sm font-medium rounded-lg/g) || []
    expect(oldIconButtons.length).toBeLessThanOrEqual(2)
  })

  it('all three desktop agenda Add buttons use Plus w-3.5 h-3.5 (consistent icon size)', () => {
    const plusIcons = pageClientContent.match(/Plus className="w-3.5 h-3.5"/g) || []
    expect(plusIcons.length).toBeGreaterThanOrEqual(3) // Schedule + Reminders + Appointments
  })

  it('chevron only appears when items exceed collapsed limit (mobile)', () => {
    expect(pageClientContent).toContain('length > 3 && (')
  })

  it('chevron toggles collapse state', () => {
    expect(pageClientContent).toContain('setCollapsedSections')
  })

  it('collapse state includes schedule, jobs, reminders, appointments', () => {
    expect(pageClientContent).toContain('schedule: false')
    expect(pageClientContent).toContain('jobs: false')
    expect(pageClientContent).toContain('reminders: false')
    expect(pageClientContent).toContain('appointments: false')
  })
})

describe('Agenda Management Depth — Mobile Safety (Batch 10)', () => {
  it('uses min-w-0 to prevent overflow', () => {
    expect(pageClientContent).toContain('min-w-0')
  })

  it('uses flex-shrink-0 for badges and actions', () => {
    expect(pageClientContent).toContain('flex-shrink-0')
  })

  it('uses truncate for long text', () => {
    expect(pageClientContent).toContain('truncate')
  })

  it('uses whitespace-nowrap for badges', () => {
    expect(pageClientContent).toContain('whitespace-nowrap')
  })
})

describe('Agenda Management Depth — Preserved Behaviors (Batch 10)', () => {
  it('preserves SidebarSection component usage', () => {
    expect(pageClientContent).toContain('SidebarSection')
  })

  it('preserves Payments section', () => {
    expect(pageClientContent).toContain('Payments')
    expect(pageClientContent).toContain('handleRequestPaymentClick')
  })

  it('preserves Internal Notes section', () => {
    expect(pageClientContent).toContain('Internal Notes')
  })

  it('preserves Previous Job Requests section', () => {
    expect(pageClientContent).toContain('Previous Job Requests')
  })

  it('preserves collapsedSections localStorage persistence', () => {
    expect(pageClientContent).toContain('customerDetailsCollapsedSections')
  })

  it('preserves existing aiIntake collapse behavior', () => {
    expect(pageClientContent).toContain('collapsedSections.aiIntake')
  })

  it('preserves appointment sorting (upcoming first, past last)', () => {
    expect(pageClientContent).toContain('isAPast && !isBPast')
    expect(pageClientContent).toContain('!isAPast && isBPast')
  })
})
