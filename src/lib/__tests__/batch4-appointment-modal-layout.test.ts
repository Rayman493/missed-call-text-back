import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const eventDetailsModal = readSrc('src/components/calendar/EventDetailsModal.tsx')
const newAppointmentModal = readSrc('src/components/calendar/NewAppointmentModal.tsx')
const calendarPage = readSrc('src/app/dashboard/calendar/page.tsx')
const createEventRoute = readSrc('src/app/api/google/calendar/create-event/route.ts')

describe('Batch 4 — Appointment modal layout + creation status cleanup', () => {
  describe('A. Phantom bottom spacing removed', () => {
    it('1. EventDetailsModal uses shared --modal-max-height for all sizes', () => {
      expect(eventDetailsModal).toContain('max-h-[var(--modal-max-height)]')
    })

    it('2. EventDetailsModal uses --modal-bottom-reserve for outer positioning', () => {
      expect(eventDetailsModal).toContain('var(--modal-bottom-reserve)')
    })

    it('3. EventDetailsModal footer does not reserve app-nav height', () => {
      expect(eventDetailsModal).not.toContain('var(--bottom-nav-height, 72px)')
    })

    it('4. EventDetailsModal footer does not add extra env(safe-area) padding', () => {
      expect(eventDetailsModal).not.toContain('env(safe-area-inset-bottom)')
    })

    it('5. EventDetailsModal body scrolls independently of footer', () => {
      expect(eventDetailsModal).toContain('overflow-y-auto')
      expect(eventDetailsModal).toContain('flex-shrink-0')
    })
  })

  describe('B. Action footer layout', () => {
    it('6. actions are grouped into a deliberate column on mobile', () => {
      expect(eventDetailsModal).toContain('flex flex-col gap-2 sm:flex-row')
    })

    it('7. primary row contains Join and Text Details', () => {
      expect(eventDetailsModal).toContain('>Join<')
      expect(eventDetailsModal).toContain('>Text Details<')
    })

    it('8. secondary row contains Calendar, Edit and Delete', () => {
      expect(eventDetailsModal).toContain('>Calendar<')
      expect(eventDetailsModal).toContain('>Edit<')
      expect(eventDetailsModal).toContain('aria-label="Delete appointment"')
    })

    it('9. Join uses primary blue styling', () => {
      expect(eventDetailsModal).toContain('bg-blue-600')
      expect(eventDetailsModal).toContain('>Join<')
    })

    it('10. Text Details uses strong secondary emerald styling', () => {
      expect(eventDetailsModal).toContain('bg-emerald-600')
      expect(eventDetailsModal).toContain('>Text Details<')
    })

    it('11. Delete remains destructive and visually separated', () => {
      expect(eventDetailsModal).toContain('text-red-600')
      expect(eventDetailsModal).toContain('border-red-200')
      expect(eventDetailsModal).toContain('aria-label="Delete appointment"')
    })
  })

  describe('C. Creation auto-send removal', () => {
    it('12. NewAppointmentModal no longer reads customerConfirmation', () => {
      expect(newAppointmentModal).not.toContain('customerConfirmation')
    })

    it('13. calendar page does not toast confirmation success or failure on create', () => {
      expect(calendarPage).not.toContain('customerConfirmation')
      expect(calendarPage).not.toContain('confirmation could not be sent')
      expect(calendarPage).not.toContain('confirmation sent to customer')
    })

    it('14. create-event route does not send automatic customer SMS', () => {
      expect(createEventRoute).not.toContain('sendSms')
      expect(createEventRoute).not.toContain('customerConfirmationSent')
    })

    it('15. create-event route does not return customerConfirmation', () => {
      expect(createEventRoute).not.toContain('customerConfirmation:')
    })

    it('16. explicit Text Details action remains in EventDetailsModal', () => {
      expect(eventDetailsModal).toContain('>Text Details<')
      expect(eventDetailsModal).toContain('setIsSmsOpen(true)')
    })

    it('17. successful creation toasts only calendar creation', () => {
      expect(calendarPage).toContain('Appointment added to calendar')
    })
  })
})
