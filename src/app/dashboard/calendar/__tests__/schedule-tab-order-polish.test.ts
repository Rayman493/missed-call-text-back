import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const calendarPage = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')

// Extract desktop tab block (hidden md:flex) — ends before Mobile tab toggle comment
const desktopTabStart = calendarPage.indexOf('hidden md:flex mb-3')
const desktopTabEnd = calendarPage.indexOf('{/* Mobile tab toggle', desktopTabStart)
const desktopTabBlock = desktopTabStart >= 0 ? calendarPage.substring(desktopTabStart, desktopTabEnd) : ''

// Extract mobile tab block (md:hidden mb-4 mt-2) — ends before Agenda Tab comment
const mobileTabStart = calendarPage.indexOf('md:hidden mb-4 mt-2')
const mobileTabEnd = calendarPage.indexOf('{/* Agenda Tab */}', mobileTabStart)
const mobileTabBlock = mobileTabStart >= 0 ? calendarPage.substring(mobileTabStart, mobileTabEnd) : ''

// Helper: extract tab labels in order from a block
function extractTabOrder(block: string): string[] {
  const order: string[] = []
  // Match onClick={() => setScheduleTab('...')} followed by label text
  const regex = /setScheduleTab\('(\w+)'\)/g
  let match
  while ((match = regex.exec(block)) !== null) {
    order.push(match[1])
  }
  return order
}

describe('Schedule Tab Order Polish', () => {
  describe('Canonical order', () => {
    it('desktop tabs are in order: agenda, calendar, map, reminders, jobs, appointments', () => {
      const order = extractTabOrder(desktopTabBlock)
      expect(order).toEqual(['agenda', 'calendar', 'map', 'reminders', 'jobs', 'appointments'])
    })

    it('mobile tabs are in order: agenda, calendar, map, reminders, jobs, appointments', () => {
      const order = extractTabOrder(mobileTabBlock)
      expect(order).toEqual(['agenda', 'calendar', 'map', 'reminders', 'jobs', 'appointments'])
    })

    it('desktop and mobile share the same logical order', () => {
      const desktopOrder = extractTabOrder(desktopTabBlock)
      const mobileOrder = extractTabOrder(mobileTabBlock)
      expect(desktopOrder).toEqual(mobileOrder)
    })
  })

  describe('All six tabs remain', () => {
    it('all six tab IDs present in desktop block', () => {
      expect(desktopTabBlock).toContain("setScheduleTab('agenda')")
      expect(desktopTabBlock).toContain("setScheduleTab('calendar')")
      expect(desktopTabBlock).toContain("setScheduleTab('map')")
      expect(desktopTabBlock).toContain("setScheduleTab('reminders')")
      expect(desktopTabBlock).toContain("setScheduleTab('jobs')")
      expect(desktopTabBlock).toContain("setScheduleTab('appointments')")
    })

    it('all six tab IDs present in mobile block', () => {
      expect(mobileTabBlock).toContain("setScheduleTab('agenda')")
      expect(mobileTabBlock).toContain("setScheduleTab('calendar')")
      expect(mobileTabBlock).toContain("setScheduleTab('map')")
      expect(mobileTabBlock).toContain("setScheduleTab('reminders')")
      expect(mobileTabBlock).toContain("setScheduleTab('jobs')")
      expect(mobileTabBlock).toContain("setScheduleTab('appointments')")
    })

    it('six content rendering blocks exist for each tab', () => {
      expect(calendarPage).toContain("scheduleTab === 'agenda' && (")
      expect(calendarPage).toContain("scheduleTab === 'reminders' && (")
      expect(calendarPage).toContain("scheduleTab === 'jobs' && (")
      expect(calendarPage).toContain("scheduleTab === 'appointments' && (")
      expect(calendarPage).toContain("scheduleTab === 'calendar' && (")
      expect(calendarPage).toContain("scheduleTab === 'map' && (")
    })
  })

  describe('Mobile Appointments label', () => {
    it('mobile Appointments label remains "Appts"', () => {
      expect(mobileTabBlock).toContain('<span>Appts</span>')
    })

    it('desktop Appointments label remains "Appointments"', () => {
      // Desktop uses bare text "Appointments" (no span wrapper)
      // Verify it contains Appointments but not the mobile abbreviation
      const apptsIdx = desktopTabBlock.indexOf("setScheduleTab('appointments')")
      const apptsBlock = desktopTabBlock.substring(apptsIdx)
      expect(apptsBlock).toContain('Appointments')
    })
  })

  describe('Active state correctness', () => {
    it('each desktop tab checks its own scheduleTab value (not index)', () => {
      expect(desktopTabBlock).toContain("scheduleTab === 'agenda'")
      expect(desktopTabBlock).toContain("scheduleTab === 'calendar'")
      expect(desktopTabBlock).toContain("scheduleTab === 'map'")
      expect(desktopTabBlock).toContain("scheduleTab === 'reminders'")
      expect(desktopTabBlock).toContain("scheduleTab === 'jobs'")
      expect(desktopTabBlock).toContain("scheduleTab === 'appointments'")
    })

    it('each mobile tab checks its own scheduleTab value (not index)', () => {
      expect(mobileTabBlock).toContain("scheduleTab === 'agenda'")
      expect(mobileTabBlock).toContain("scheduleTab === 'calendar'")
      expect(mobileTabBlock).toContain("scheduleTab === 'map'")
      expect(mobileTabBlock).toContain("scheduleTab === 'reminders'")
      expect(mobileTabBlock).toContain("scheduleTab === 'jobs'")
      expect(mobileTabBlock).toContain("scheduleTab === 'appointments'")
    })

    it('no index-based tab matching exists', () => {
      expect(calendarPage).not.toContain('scheduleTab === 0')
      expect(calendarPage).not.toContain('scheduleTab === 1')
      expect(calendarPage).not.toContain('scheduleTab === 2')
      expect(calendarPage).not.toContain('scheduleTab === 3')
      expect(calendarPage).not.toContain('scheduleTab === 4')
      expect(calendarPage).not.toContain('scheduleTab === 5')
    })
  })

  describe('Horizontal scroll preserved on mobile', () => {
    it('mobile tab container has overflow-x-auto', () => {
      expect(mobileTabBlock).toContain('overflow-x-auto')
    })

    it('mobile tab container has no-scrollbar class', () => {
      expect(mobileTabBlock).toContain('no-scrollbar')
    })

    it('mobile tab buttons have whitespace-nowrap and flex-shrink-0', () => {
      expect(mobileTabBlock).toContain('whitespace-nowrap')
      expect(mobileTabBlock).toContain('flex-shrink-0')
    })
  })

  describe('No two-row wrapping', () => {
    it('mobile tabs use flex (not flex-wrap)', () => {
      expect(mobileTabBlock).toContain('flex gap-0.5')
      expect(mobileTabBlock).not.toContain('flex-wrap')
    })

    it('desktop tabs use inline-flex (not flex-wrap)', () => {
      expect(desktopTabBlock).toContain('inline-flex')
      expect(desktopTabBlock).not.toContain('flex-wrap')
    })
  })

  describe('Desktop/mobile visibility classes preserved', () => {
    it('desktop tabs hidden on mobile (hidden md:flex)', () => {
      expect(calendarPage).toContain('hidden md:flex mb-3')
    })

    it('mobile tabs hidden on desktop (md:hidden)', () => {
      expect(calendarPage).toContain('md:hidden mb-4 mt-2')
    })
  })

  describe('Tab IDs and state semantics unchanged', () => {
    it('scheduleTab state type includes all six IDs', () => {
      expect(calendarPage).toContain("'agenda' | 'reminders' | 'jobs' | 'appointments' | 'calendar' | 'map'")
    })

    it('default tab is agenda', () => {
      expect(calendarPage).toContain("return 'agenda'")
    })

    it('URL param validation includes all six tabs', () => {
      expect(calendarPage).toContain("tabParam === 'agenda'")
      expect(calendarPage).toContain("tabParam === 'reminders'")
      expect(calendarPage).toContain("tabParam === 'jobs'")
      expect(calendarPage).toContain("tabParam === 'appointments'")
      expect(calendarPage).toContain("tabParam === 'calendar'")
      expect(calendarPage).toContain("tabParam === 'map'")
    })
  })
})
