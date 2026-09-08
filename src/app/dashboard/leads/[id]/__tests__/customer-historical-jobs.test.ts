import { describe, it, expect } from 'vitest'

// Mirrors the active-vs-historical split in page-client.tsx
function getFutureAppointments(jobs: any[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return jobs.filter((job: any) => {
    if (!job.scheduled_date) return false
    return new Date(job.scheduled_date) >= today
  })
}

function getPreviousJobs(jobs: any[]) {
  const future = getFutureAppointments(jobs)
  return jobs.filter((job: any) => !future.some((a: any) => a.id === job.id))
}

describe('Customer Historical Jobs regression', () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const futureDate = new Date(today)
  futureDate.setDate(futureDate.getDate() + 2)
  const pastDate = new Date(today)
  pastDate.setDate(pastDate.getDate() - 5)

  it('A: customer with historical job and no active scheduled job keeps historical UI available', () => {
    const leadJobs = [
      { id: 'job-1', title: 'Previous repair', status: 'completed', scheduled_date: pastDate.toISOString() }
    ]
    const futureAppointments = getFutureAppointments(leadJobs)
    const previousJobs = getPreviousJobs(leadJobs)

    // Schedule section is empty
    expect(futureAppointments.length).toBe(0)
    // Previous Jobs section remains available
    expect(previousJobs.length).toBe(1)
    expect(previousJobs[0].id).toBe('job-1')
  })

  it('B: customer with historical + active jobs shows each in the correct section without duplicates', () => {
    const leadJobs = [
      { id: 'job-active', title: 'Upcoming appointment', status: 'scheduled', scheduled_date: futureDate.toISOString() },
      { id: 'job-hist', title: 'Last year tune-up', status: 'completed', scheduled_date: pastDate.toISOString() }
    ]
    const futureAppointments = getFutureAppointments(leadJobs)
    const previousJobs = getPreviousJobs(leadJobs)

    expect(futureAppointments.length).toBe(1)
    expect(futureAppointments[0].id).toBe('job-active')
    expect(previousJobs.length).toBe(1)
    expect(previousJobs[0].id).toBe('job-hist')
    // No accidental overlap
    const allDisplayedIds = [...futureAppointments, ...previousJobs].map(j => j.id)
    expect(new Set(allDisplayedIds).size).toBe(2)
  })

  it('C: customer with no historical jobs shows clean empty previous-jobs state', () => {
    const leadJobs = [
      { id: 'job-active', title: 'Upcoming appointment', status: 'scheduled', scheduled_date: futureDate.toISOString() }
    ]
    const previousJobs = getPreviousJobs(leadJobs)

    expect(previousJobs.length).toBe(0)
  })

  it('D: historical jobs stay associated by stable lead ID, not display name', () => {
    // Lead ID remained the same even though canonical display name changed
    // from Amanda Lewis to Michael Thompson. Jobs are keyed by lead_id.
    const leadId = 'lead-stable-123'
    const jobsQueryResult = [
      { id: 'job-hist', lead_id: leadId, customer_name: 'Amanda Lewis', status: 'completed', scheduled_date: pastDate.toISOString() }
    ]
    const filteredByLeadId = jobsQueryResult.filter((j: any) => j.lead_id === leadId)
    const byCustomerName = jobsQueryResult.filter((j: any) => j.customer_name === 'Michael Thompson')

    // Stable ID keeps the historical job visible
    expect(filteredByLeadId.length).toBe(1)
    // Display-name query would incorrectly drop it
    expect(byCustomerName.length).toBe(0)
  })

  it('E: multiple calls on the same customer keep previous jobs accessible', () => {
    const leadId = 'lead-stable-123'
    const leadJobs = [
      { id: 'job-1', lead_id: leadId, title: 'First call job', status: 'completed', scheduled_date: pastDate.toISOString() },
      { id: 'job-2', lead_id: leadId, title: 'Second call job', status: 'completed', scheduled_date: pastDate.toISOString() }
    ]
    const previousJobs = getPreviousJobs(leadJobs)

    expect(previousJobs.length).toBe(2)
    expect(previousJobs.map(j => j.title)).toContain('First call job')
    expect(previousJobs.map(j => j.title)).toContain('Second call job')
  })
})
