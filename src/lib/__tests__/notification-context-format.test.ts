import { describe, it, expect } from 'vitest'
import {
  formatAppointmentWhen,
  joinNotificationParts,
  usefulAppointmentTitle,
  appointmentNotificationMessage,
} from '@/lib/notification-format'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('formatAppointmentWhen', () => {
  it('formats date+time in the business timezone', () => {
    // 2026-09-29T18:00:00Z = 2:00 PM in New York (EDT)
    expect(formatAppointmentWhen('2026-09-29T18:00:00Z', 'America/New_York')).toBe('Sep 29, 2:00 PM')
  })

  it('omits time for all-day (date-only) events', () => {
    expect(formatAppointmentWhen('2026-09-29', 'America/New_York')).toBe('Sep 29')
  })

  it('returns empty string for missing or invalid dates', () => {
    expect(formatAppointmentWhen('')).toBe('')
    expect(formatAppointmentWhen(null)).toBe('')
    expect(formatAppointmentWhen('not-a-date')).toBe('')
  })
})

describe('joinNotificationParts', () => {
  it('joins with separator and drops empty parts', () => {
    expect(joinNotificationParts('John Smith', 'Water heater', 'Sep 29, 2:00 PM')).toBe('John Smith · Water heater · Sep 29, 2:00 PM')
    expect(joinNotificationParts('', 'Water heater', null)).toBe('Water heater')
    expect(joinNotificationParts(undefined, null, '')).toBe('')
  })
})

describe('usefulAppointmentTitle', () => {
  it('drops the generic "Appointment" placeholder', () => {
    expect(usefulAppointmentTitle('Appointment')).toBe('')
    expect(usefulAppointmentTitle('appointment')).toBe('')
  })
  it('keeps real summaries', () => {
    expect(usefulAppointmentTitle('Water heater installation')).toBe('Water heater installation')
  })
})

describe('appointmentNotificationMessage', () => {
  it('produces customer · service · when', () => {
    expect(appointmentNotificationMessage('Water heater installation', '2026-09-29T18:00:00Z', 'John Smith', 'America/New_York'))
      .toBe('John Smith · Water heater installation · Sep 29, 2:00 PM')
  })

  it('skips the customer name when the summary already contains it', () => {
    expect(appointmentNotificationMessage('John Smith — Water heater', '2026-09-29T18:00:00Z', 'John Smith', 'America/New_York'))
      .toBe('John Smith — Water heater · Sep 29, 2:00 PM')
  })

  it('falls back gracefully when metadata is missing', () => {
    expect(appointmentNotificationMessage('Appointment', undefined, null)).toBe('')
    expect(appointmentNotificationMessage(null, '2026-09-29', 'Jane')).toBe('Jane · Sep 29')
  })

  it('handles long names without breaking (truncation is downstream)', () => {
    const long = 'Alexandra Konstantinopolous-Weatherington III'
    const msg = appointmentNotificationMessage('Repair', '2026-09-29T18:00:00Z', long, 'America/New_York')
    expect(msg.startsWith(long)).toBe(true)
    expect(msg).not.toContain('undefined')
    expect(msg).not.toContain('null')
  })
})

describe('server + client notification templates wire the shared formatter', () => {
  const serverSrc = readFileSync(join(__dirname, '..', 'notifications-server.ts'), 'utf8')
  const clientSrc = readFileSync(join(__dirname, '..', 'notifications.ts'), 'utf8')

  it('server appointment templates use appointmentNotificationMessage', () => {
    expect(serverSrc).toContain("import { appointmentNotificationMessage } from '@/lib/notification-format'")
    // Both appointment templates now build contextual messages
    const createdIdx = serverSrc.indexOf('appointment_created:')
    const deletedIdx = serverSrc.indexOf('appointment_deleted:')
    const block = serverSrc.slice(createdIdx, deletedIdx + 800)
    expect(block.match(/appointmentNotificationMessage/g)?.length).toBe(2)
  })

  it('client templates mirror the same formatter for in-app parity', () => {
    expect(clientSrc).toContain("import { appointmentNotificationMessage } from '@/lib/notification-format'")
  })

  it('no template still emits a bare "Appointment" message', () => {
    const createdIdx = serverSrc.indexOf('appointment_created:')
    const deletedIdx = serverSrc.indexOf('appointment_deleted:')
    const block = serverSrc.slice(createdIdx, deletedIdx + 800)
    expect(block).not.toContain("message: data.title")
  })

  it('payment templates resolve a real customer name before the Customer fallback', () => {
    const idx = serverSrc.indexOf('payment_completed:')
    const block = serverSrc.slice(idx, idx + 500)
    expect(block).toContain('resolveCustomerDisplayName(data.leadName, data.leadPhone)')
  })
})
