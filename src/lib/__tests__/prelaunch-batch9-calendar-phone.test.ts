/**
 * Batch 9 — selected-day delete + missing-phone safety contracts.
 *
 * A: selected-day list already exposes metadata-driven delete for
 *    ReplyFlow-owned events (isReplyFlowOwnedEvent), jobs, and reminders via
 *    canonical endpoints with confirm modals; reminders had a silent-failure
 *    gap (no toast on !ok) — now surfaces an error.
 * B: phoneless customers — leads.caller_phone is nullable with a partial
 *    unique index; manual-create + LeadService dedupe only on real phones;
 *    phone-dependent actions gate with clear copy; the booking-request
 *    detail modal no longer renders tel:null.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../..')
const readSrc = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

const CAL = readSrc('src/app/dashboard/calendar/page.tsx')
const OWNERSHIP = readSrc('src/lib/calendar-ownership.ts')
const TASKS_API = readSrc('src/app/api/tasks/[id]/route.ts')
const MANUAL_CREATE = readSrc('src/app/api/leads/manual-create/route.ts')
const LEAD_SERVICE = readSrc('src/lib/services/LeadService.ts')
const ADD_CUSTOMER = readSrc('src/components/AddCustomerModal.tsx')
const EDIT_CUSTOMER = readSrc('src/components/EditCustomerModal.tsx')
const LEAD_PAGE = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
const BOOKING_DETAIL = readSrc('src/components/schedule/BookingRequestDetailModal.tsx')
const MIGRATION = readSrc('supabase/migrations/20260903000000_allow_null_phone_for_manual_customers.sql')
const BILLING_SEND = readSrc('src/app/api/billing-documents/[id]/send/route.ts')

describe('A. Selected-day delete eligibility', () => {
  it('delete affordance is gated on metadata ownership, not appearance', () => {
    expect(CAL).toContain('isReplyFlowOwnedEvent(event as any, { linkedJob: job })')
    expect(CAL).toContain("event.source !== 'holiday'")
    expect(OWNERSHIP).toContain('replyflow_created')
    expect(OWNERSHIP).toContain('google_calendar_event_id === event.id')
  })

  it('non-owned (Google/holiday) events get an external link, not delete', () => {
    const dayList = CAL.slice(CAL.indexOf('Events for selected day'))
    const googleBranch = dayList.indexOf('Open in Google Calendar')
    const deleteBranch = dayList.indexOf('setAppointmentToDelete(event)')
    expect(googleBranch).toBeGreaterThan(-1)
    expect(deleteBranch).toBeGreaterThan(-1)
    // delete button lives inside the isEditable branch, link in the else
    expect(dayList.indexOf('isEditable ?')).toBeLessThan(deleteBranch)
  })

  it('reuses canonical delete endpoints for events, jobs, and reminders', () => {
    expect(CAL).toContain('`/api/google/calendar/events/${appointmentToDelete.id}`')
    expect(CAL).toContain('`/api/jobs/${jobToDelete.id}`')
    expect(CAL).toContain('`/api/tasks/${taskId}`')
  })

  it('confirm modals gate job and appointment deletion', () => {
    expect(CAL).toContain('appointmentToDelete !== null')
    expect(CAL).toContain('jobToDelete !== null')
    expect(CAL).toContain('Delete Appointment?')
    expect(CAL).toContain('Delete Job?')
  })

  it('successful deletes update local state immediately', () => {
    expect(CAL).toContain('setEvents(prev => prev.filter(e => e.id !== appointmentToDelete.id))')
    expect(CAL).toContain('setJobs(prev => prev.filter(j => j.id !== job.id))')
    expect(CAL).toContain('setTasks(prev => prev.filter(t => t.id !== taskId))')
  })

  it('reminder delete is no longer silent on failure', () => {
    const fn = CAL.slice(CAL.indexOf('const handleDeleteTask'))
    expect(fn).toContain("showToast('Failed to delete reminder', 'error')")
    // no bare silent returns remain in the handler
    const body = fn.slice(0, fn.indexOf('}, [])'))
    expect(body.match(/if \(!response\.ok\) return/g)).toBeNull()
  })

  it('recurrence-safe: task/job DELETE API defaults to occurrence scope', () => {
    expect(TASKS_API).toContain("searchParams.get('scope') || 'occurrence'")
    expect(TASKS_API).toContain('skipOccurrence')
    expect(CAL).not.toContain("scope=series")
  })
})

describe('B. Missing-phone customer safety', () => {
  it('schema: caller_phone nullable with partial unique index', () => {
    expect(MIGRATION).toContain('caller_phone DROP NOT NULL')
    expect(MIGRATION).toContain('WHERE caller_phone IS NOT NULL')
  })

  it('manual-create treats phone as optional and dedupes only on real phone', () => {
    expect(MANUAL_CREATE).toContain('phoneNumber ? normalizePhoneNumberForStorage(phoneNumber) : null')
    expect(MANUAL_CREATE).toContain('if (normalizedPhone)')
  })

  it('LeadService never dedupes on missing phone', () => {
    expect(LEAD_SERVICE).toContain('if (!caller_phone)')
    expect(LEAD_SERVICE).toContain('caller_phone ? normalizePhoneNumberForStorage(caller_phone) : null')
  })

  it('AddCustomerModal requires name only; phone validated only when present', () => {
    expect(ADD_CUSTOMER).toContain('Customer name is required')
    expect(ADD_CUSTOMER).toContain('if (formData.phoneNumber.trim())')
    expect(ADD_CUSTOMER).not.toContain('Phone number is required')
  })

  it('EditCustomerModal writes null, not empty string, for blank phone', () => {
    expect(EDIT_CUSTOMER).toContain('formData.phoneNumber.trim() || null')
  })

  it('phone-dependent actions gate with clear copy on the lead page', () => {
    expect(LEAD_PAGE).toContain('hasPhoneNumber')
    expect(LEAD_PAGE).toContain('Add a phone number to this customer before calling.')
    expect(LEAD_PAGE).toContain('Add a phone number to this customer before sending a text.')
    expect(LEAD_PAGE).toContain('Add a phone number to this customer before sending a payment request.')
  })

  it('document send API rejects phoneless sends with a clear 400', () => {
    expect(BILLING_SEND).toContain('Customer has no phone number')
  })

  it('booking detail no longer renders tel:null — phone row is gated', () => {
    expect(BOOKING_DETAIL).toContain('detail.customer_phone ? (')
    expect(BOOKING_DETAIL).toContain('No phone on file')
    expect(BOOKING_DETAIL).not.toContain('tel:${detail.customer_phone}`} className="font-medium text-foreground hover:text-primary-600">\n                        {formatPhoneNumber(detail.customer_phone)}\n                      </a>\n                    </div>\n                  </div>\n                  {detail.customer_email')
  })

  it('formatPhoneNumber is null-safe', () => {
    const utils = readSrc('src/lib/utils.ts')
    expect(utils).toContain('formatPhoneNumber(phone: string | null | undefined)')
    expect(utils).toContain("if (!phone) return 'Unknown Caller'")
  })
})
