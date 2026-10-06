import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

/**
 * Jobs UX polish regressions:
 *  1. Submit-blocking validation errors in JobComposer render inline at the
 *     bottom of a scrollable modal — they must ALSO fire the app's toast so
 *     the feedback is visible regardless of scroll position.
 *  2. The Schedule > Jobs Time Tracked card must explain (only when the
 *     business genuinely has zero jobs) that a job is needed before time
 *     can be tracked.
 */

const jobComposerContent = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const toastContent = readFileSync('src/components/Toast.tsx', 'utf8')
const calendarPageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')

describe('JobComposer — validation errors surface a toast', () => {
  it('missing customer still sets the inline error (unchanged)', () => {
    expect(jobComposerContent).toContain("setError('Please select a customer to create this job')")
  })

  it('missing customer fires an error toast with the customer-required message', () => {
    expect(jobComposerContent).toContain("notifyValidationError('Please select a customer to create this job.')")
  })

  it('missing title (directly equivalent submit blocker) also fires an error toast', () => {
    expect(jobComposerContent).toContain("setError('Job title is required')")
    expect(jobComposerContent).toContain("notifyValidationError('Job title is required.')")
  })

  it('toast prefers the host onShowToast channel and falls back to the DOM toast util', () => {
    expect(jobComposerContent).toContain('if (onShowToast) onShowToast(message,')
    expect(jobComposerContent).toContain("import { showToast as showDomToast } from '@/lib/toast'")
    expect(jobComposerContent).toContain('else showDomToast(message,')
  })

  it('validation still returns early — no job is created on validation failure', () => {
    // Both guards must still return before the fetch to /api/jobs
    const customerGuard = jobComposerContent.indexOf("notifyValidationError('Please select a customer to create this job.')")
    const fetchIdx = jobComposerContent.indexOf("const response = await fetch(url")
    const customerReturn = jobComposerContent.indexOf('return', customerGuard)
    expect(customerReturn).toBeGreaterThan(customerGuard)
    expect(customerReturn).toBeLessThan(fetchIdx)
  })

  it('does not auto-select a customer (no setLeadId in the validation path)', () => {
    const saveStart = jobComposerContent.indexOf('const handleSave = async')
    const fetchIdx = jobComposerContent.indexOf('const response = await fetch(url')
    const validationRegion = jobComposerContent.slice(saveStart, fetchIdx)
    expect(validationRegion).not.toContain('setLeadId(')
    expect(validationRegion).not.toContain('setSelectedCustomer(')
  })
})

describe('Toast — accessible announcement', () => {
  it('Toast container announces politely (role=status + aria-live) so there is a single announcement surface', () => {
    expect(toastContent).toContain('role="status"')
    expect(toastContent).toContain('aria-live="polite"')
  })

  it('inline JobComposer error stays a plain paragraph — no double live region', () => {
    const errorIdx = jobComposerContent.indexOf('{error && (')
    const errorRegion = jobComposerContent.slice(errorIdx, errorIdx + 200)
    expect(errorRegion).not.toContain('role=')
    expect(errorRegion).not.toContain('aria-live')
  })
})

describe('Time Tracked card — zero-job helper', () => {
  it('shows helper only when the jobs list is genuinely empty (not active-filtered)', () => {
    expect(calendarPageContent).toContain('{!isLoading && jobs.length === 0 && (')
    // Must key on jobs (all jobs), never the active-only subset
    expect(calendarPageContent).not.toContain('active.length === 0 && (\n          <p className="mt-3 pt-3')
  })

  it('helper copy explains a job is required before time tracking', () => {
    expect(calendarPageContent).toContain('Create a job first to start tracking time.')
  })

  it('helper renders inside the Time Tracked card (below the totals, above card close)', () => {
    const cardStart = calendarPageContent.indexOf('Time Tracked')
    const helperIdx = calendarPageContent.indexOf('Create a job first to start tracking time.')
    const timerErrorIdx = calendarPageContent.indexOf('{timerError &&')
    expect(cardStart).toBeGreaterThan(-1)
    expect(helperIdx).toBeGreaterThan(cardStart)
    expect(helperIdx).toBeLessThan(timerErrorIdx) // still inside the card, before card close
  })

  it('existing totals display is unchanged (Today / This Week still render)', () => {
    expect(calendarPageContent).toContain('>Today</p>')
    expect(calendarPageContent).toContain('>This Week</p>')
    expect(calendarPageContent).toContain('formatDuration(timeSummary.today_ms)')
    expect(calendarPageContent).toContain('formatDuration(timeSummary.week_ms)')
  })
})
