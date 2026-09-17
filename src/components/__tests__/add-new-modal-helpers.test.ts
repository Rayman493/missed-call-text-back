import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const appointment = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
const reminder = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
const job = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const payment = readFileSync('src/components/payments/PaymentsNewRequestModal.tsx', 'utf8')

describe('Add/New modal helper descriptions', () => {
  it('New Appointment has a muted helper sentence under the title', () => {
    expect(appointment).toContain('Add an appointment to this customer')
    expect(appointment).toContain('text-sm text-muted-foreground')
  })

  it('New Reminder has a muted helper sentence under the title', () => {
    expect(reminder).toContain('Set a reminder for this customer or job')
  })

  it('New Job has a muted helper sentence under the title', () => {
    expect(job).toContain('Create and schedule work for this customer')
  })

  it('New Payment Request has a short plain-language helper', () => {
    expect(payment).toMatch(/Send a secure payment link by text|Request a payment|Send a payment/)
  })

  it('uses muted helper sentence styling across the family', () => {
    expect(appointment).toMatch(/text-sm text-muted-foreground/)
    expect(reminder).toMatch(/text-sm text-muted-foreground/)
    expect(job).toMatch(/text-sm text-muted-foreground/)
    expect(payment).toMatch(/text-muted-foreground/)
  })
})
