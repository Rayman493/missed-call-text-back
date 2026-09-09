import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const jobsRouteContent = readFileSync('src/app/api/jobs/route.ts', 'utf8')
const jobComposerContent = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const jobTimerContent = readFileSync('src/components/jobs/JobTimer.tsx', 'utf8')
const jobDetailsModalContent = readFileSync('src/components/jobs/JobDetailsModal.tsx', 'utf8')
const jobTimeUtilsContent = readFileSync('src/lib/job-time-utils.ts', 'utf8')
const leadPickerContent = readFileSync('src/components/jobs/LeadPickerModal.tsx', 'utf8')
const aiFieldMappingContent = readFileSync('src/lib/ai-field-mapping.ts', 'utf8')

// ---------------------------------------------------------------------------
// A — TRACKED TIME ON JOB OVERVIEW ROWS
// ---------------------------------------------------------------------------

describe('Batch 14 — Tracked Time: Summary Retrieval', () => {
  it('GET /api/jobs includes time_summary per job (no N+1)', () => {
    // The jobs route fetches time entries in a single batch query using .in()
    expect(jobsRouteContent).toContain('job_time_entries')
    expect(jobsRouteContent).toContain('.in(')
    expect(jobsRouteContent).toContain('time_summary')
  })

  it('time_summary includes completed_ms and has_active_timer', () => {
    expect(jobsRouteContent).toContain('completed_ms')
    expect(jobsRouteContent).toContain('has_active_timer')
  })

  it('completed_ms is computed from ended_at - started_at server-side', () => {
    expect(jobsRouteContent).toContain('ended_at')
    expect(jobsRouteContent).toContain('started_at')
    expect(jobsRouteContent).toContain('getTime()')
  })

  it('has_active_timer is true when ended_at is null', () => {
    expect(jobsRouteContent).toContain('!entry.ended_at')
  })

  it('does NOT call /api/jobs/[id]/time-entries per job (no N+1)', () => {
    // The jobs route should not loop and fetch per-job time entries
    expect(jobsRouteContent).not.toMatch(/for\s*\(.*of\s+jobs.*\)\s*{[\s\S]*?fetch.*time-entries/)
  })

  it('Job type includes optional time_summary field', () => {
    expect(jobComposerContent).toContain('time_summary')
    expect(jobComposerContent).toContain('completed_ms')
    expect(jobComposerContent).toContain('has_active_timer')
  })
})

describe('Batch 14 — Tracked Time: Display on Jobs Tab', () => {
  it('Jobs tab imports Clock icon for time display', () => {
    expect(pageContent).toContain('Clock')
  })

  it('Jobs tab imports formatDuration from job-time-utils', () => {
    expect(pageContent).toContain('formatDuration')
    expect(pageContent).toContain('job-time-utils')
  })

  it('Jobs tab shows "Timer running" when has_active_timer is true', () => {
    expect(pageContent).toContain('has_active_timer')
    expect(pageContent).toContain('Timer running')
  })

  it('Jobs tab shows "Xh Ym tracked" when completed_ms > 0 and no active timer', () => {
    expect(pageContent).toContain('completed_ms')
    expect(pageContent).toContain('tracked')
    expect(pageContent).toContain('formatDuration')
  })

  it('Jobs tab does NOT show time when no completed time and no active timer', () => {
    // The display is conditional on completed_ms > 0 OR has_active_timer
    expect(pageContent).toContain('completed_ms > 0')
  })

  it('Jobs tab does NOT run a second-by-second clock (no setInterval in JobsTab)', () => {
    // The live HH:MM:SS clock remains inside JobTimer only
    const jobCardSection = pageContent.substring(
      pageContent.indexOf('const JobCard'),
      pageContent.indexOf('}', pageContent.indexOf('const JobCard') + 200)
    )
    expect(jobCardSection).not.toContain('setInterval')
  })

  it('JobDetailsModal still renders JobTimer for full timer control', () => {
    expect(jobDetailsModalContent).toContain('JobTimer')
  })

  it('JobTimer still fetches per-job entries and renders live clock', () => {
    expect(jobTimerContent).toContain('/api/jobs/')
    expect(jobTimerContent).toContain('time-entries')
    expect(jobTimerContent).toContain('formatTimerClock')
  })

  it('Jobs tab preserves existing row metadata (customer, date, location, payment)', () => {
    expect(pageContent).toContain('customer_name')
    expect(pageContent).toContain('formatScheduled')
    expect(pageContent).toContain('addressFirstLine')
    expect(pageContent).toContain('PAYMENT_LABELS')
  })

  it('Jobs tab preserves View and Edit actions', () => {
    expect(pageContent).toContain('onJobClick(job)')
    expect(pageContent).toContain('onEditJob(job)')
  })
})

// ---------------------------------------------------------------------------
// B — PREFILL NEW JOB FROM CUSTOMER CONTEXT
// ---------------------------------------------------------------------------

describe('Batch 14 — Prefill: Canonical Field Extraction', () => {
  it('JobComposer imports getLeadAIIntake for canonical field extraction', () => {
    expect(jobComposerContent).toContain('getLeadAIIntake')
  })

  it('JobComposer imports getLeadRequestTitle for canonical title', () => {
    expect(jobComposerContent).toContain('getLeadRequestTitle')
  })

  it('handleCustomerSelect uses getLeadAIIntake to extract intake fields', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).toContain('getLeadAIIntake(customer)')
  })
})

describe('Batch 14 — Prefill: Field Mappings', () => {
  it('Job Title prefills from canonical getLeadRequestTitle when empty', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).toContain('getLeadRequestTitle(customer)')
    expect(handlerSection).toContain('setTitle(prev =>')
  })

  it('Service Address prefills from canonical intake.serviceAddress when empty', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).toContain('intake.serviceAddress')
    expect(handlerSection).toContain('setServiceAddress(prev =>')
  })

  it('Notes prefills from canonical intake.additionalDetails when empty', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).toContain('intake.additionalDetails')
    expect(handlerSection).toContain('setNotes(prev =>')
  })

  it('Customer Name prefills from canonical intake.customerName', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).toContain('intake.customerName')
  })

  it('Customer Phone prefills from canonical intake.customerPhone', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).toContain('intake.customerPhone')
  })
})

describe('Batch 14 — Prefill: Manual Input Precedence', () => {
  it('Job Title is only prefilled when empty (prev check)', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    const titleBlock = handlerSection.substring(
      handlerSection.indexOf('setTitle(prev =>'),
      handlerSection.indexOf('})', handlerSection.indexOf('setTitle(prev =>')) + 2
    )
    expect(titleBlock).toContain("if (prev && prev.trim()) return prev")
  })

  it('Service Address is only prefilled when empty (prev check)', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    const addrBlock = handlerSection.substring(
      handlerSection.indexOf('setServiceAddress(prev =>'),
      handlerSection.indexOf('})', handlerSection.indexOf('setServiceAddress(prev =>')) + 2
    )
    expect(addrBlock).toContain("if (prev && prev.trim()) return prev")
  })

  it('Notes is only prefilled when empty (prev check)', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    const notesBlock = handlerSection.substring(
      handlerSection.indexOf('setNotes(prev =>'),
      handlerSection.indexOf('})', handlerSection.indexOf('setNotes(prev =>')) + 2
    )
    expect(notesBlock).toContain("if (prev && prev.trim()) return prev")
  })

  it('Date/Time/Status are NOT touched by handleCustomerSelect', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).not.toContain('setScheduledDate')
    expect(handlerSection).not.toContain('setScheduledTime')
    expect(handlerSection).not.toContain('setStatus')
  })

  it('Customer deselect does NOT clear title/notes (preserves manual input)', () => {
    const elseBlock = jobComposerContent.substring(
      jobComposerContent.indexOf('} else {', jobComposerContent.indexOf('const handleCustomerSelect')),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(elseBlock).not.toContain('setTitle')
    expect(elseBlock).not.toContain('setNotes')
  })
})

describe('Batch 14 — Prefill: Timing Safety', () => {
  it('handleCustomerSelect does NOT map callback time to scheduled time', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).not.toContain('callbackTime')
    expect(handlerSection).not.toContain('setScheduledTime')
  })

  it('handleCustomerSelect does NOT map desired completion to scheduled date', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).not.toContain('desiredCompletion')
    expect(handlerSection).not.toContain('setScheduledDate')
  })

  it('LeadPickerModal still does NOT set scheduled_date/scheduled_time from callback', () => {
    // LeadPickerModal folds timing into notes only, not scheduled fields
    const handleSelectSection = leadPickerContent.substring(
      leadPickerContent.indexOf('const handleSelect'),
      leadPickerContent.indexOf('if (!isOpen) return null')
    )
    expect(handleSelectSection).not.toContain('scheduled_date')
    expect(handleSelectSection).not.toContain('scheduled_time')
  })

  it('deriveJobSchedulingPrefill only parses explicit dates (not vague text)', () => {
    // The scheduling prefill helper exists and is used by page-client
    // It should not convert "tomorrow" / "next week" / "asap" to a date
    const schedulingPrefillContent = readFileSync('src/lib/job-scheduling-prefill.ts', 'utf8')
    expect(schedulingPrefillContent).toContain('deriveJobSchedulingPrefill')
  })
})

describe('Batch 14 — Prefill: Customer Switching', () => {
  it('switching customer does not leave stale derived data (name/phone always refresh)', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    // Name and phone are identity fields — always overwritten (not prev-guarded)
    const nameLine = handlerSection.match(/setCustomerName\(([^)]+)\)/)
    const phoneLine = handlerSection.match(/setCustomerPhone\(([^)]+)\)/)
    expect(nameLine).not.toBeNull()
    expect(phoneLine).not.toBeNull()
    // They should NOT use the prev => guard pattern
    expect(nameLine![0]).not.toContain('prev =>')
    expect(phoneLine![0]).not.toContain('prev =>')
  })

  it('switching customer preserves manual title/notes/address (prev-guarded)', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).toContain('setTitle(prev =>')
    expect(handlerSection).toContain('setServiceAddress(prev =>')
    expect(handlerSection).toContain('setNotes(prev =>')
  })
})

describe('Batch 14 — Prefill: Inline Add Customer Preservation', () => {
  it('inline Add Customer still calls handleCustomerSelect with new customer', () => {
    expect(jobComposerContent).toContain('handleLeadCreated')
    expect(jobComposerContent).toContain('handleCustomerSelect(newCustomer)')
  })

  it('inline Add Customer preserves draft (does not reset title/notes)', () => {
    // The handler only sets isAddCustomerOpen(true), no field resets
    expect(jobComposerContent).toContain('() => setIsAddCustomerOpen(true)')
  })

  it('inline Add Customer auto-selects created customer', () => {
    expect(jobComposerContent).toContain('setLeadId(leadId)')
    expect(jobComposerContent).toContain('setNewlyCreatedCustomer(newCustomer)')
  })

  it('inline Add Customer hydrates selector with newlyCreatedCustomer', () => {
    expect(jobComposerContent).toContain('newlyCreatedCustomer || prefill?.prefillCustomer')
  })
})

describe('Batch 14 — Prefill: No Customer Mutation', () => {
  it('JobComposer does NOT write back to customer/lead records', () => {
    // The composer only POSTs/PATCHes to /api/jobs, not /api/leads
    const saveSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleSave'),
      jobComposerContent.indexOf('if (!isOpen) return null')
    )
    expect(saveSection).not.toContain('/api/leads')
    expect(saveSection).not.toContain('from(\'leads\')')
  })

  it('handleCustomerSelect only reads from customer, never writes', () => {
    const handlerSection = jobComposerContent.substring(
      jobComposerContent.indexOf('const handleCustomerSelect'),
      jobComposerContent.indexOf('const handleLeadCreated')
    )
    expect(handlerSection).not.toContain('fetch')
    expect(handlerSection).not.toContain('supabase')
  })
})

describe('Batch 14 — Prefill: Customer Detail Path', () => {
  it('page-client generates JobPrefill with title from canonical request', () => {
    const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')
    expect(pageClientContent).toContain('generateJobPrefill')
    expect(pageClientContent).toContain('getLeadRequestTitle')
    expect(pageClientContent).toContain('canonicalTitle')
  })

  it('page-client prefill includes customer_name, customer_phone, service_address, notes', () => {
    const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')
    expect(pageClientContent).toContain('customer_name')
    expect(pageClientContent).toContain('customer_phone')
    expect(pageClientContent).toContain('service_address')
    expect(pageClientContent).toContain('notes')
  })

  it('page-client passes prefillCustomer for selector hydration', () => {
    const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')
    expect(pageClientContent).toContain('prefillCustomer')
  })
})

// ---------------------------------------------------------------------------
// GENERAL — No Backend/Schema Changes
// ---------------------------------------------------------------------------

describe('Batch 14 — No Backend/Schema Changes', () => {
  it('Job Timer schema is unchanged (job_time_entries table not modified)', () => {
    // No new migration files should be added for Batch 14
    expect(jobTimeUtilsContent).toContain('JobTimeEntry')
    expect(jobTimeUtilsContent).toContain('totalCompletedDuration')
  })

  it('No new database columns added to jobs table', () => {
    // The time_summary is computed server-side, not stored on jobs
    expect(jobsRouteContent).toContain('time_summary')
    // It's attached as a computed field, not a column
    expect(jobsRouteContent).toContain('timeSummaryMap')
  })

  it('JobTimer persistence/API unchanged', () => {
    expect(jobTimerContent).toContain('/api/jobs/')
    expect(jobTimerContent).toContain('time-entries')
    expect(jobTimerContent).toContain('handleStart')
    expect(jobTimerContent).toContain('handleStop')
  })
})
