/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..', '..')

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

describe('Batch 4 — Jobs / Schedule / Nested Customer Flows', () => {
  const jobComposer = readSrc('components/jobs/JobComposer.tsx')
  const customerSelect = readSrc('components/customers/SearchableCustomerSelect.tsx')
  const calendarPage = readSrc('app/dashboard/calendar/page.tsx')
  const tasksTab = readSrc('components/schedule/TasksTab.tsx')
  const eventModal = readSrc('components/calendar/EventDetailsModal.tsx')

  describe('A. Nested Add Customer handoff', () => {
    it('JobComposer derives canonical name from all lead data sources', () => {
      expect(jobComposer).toContain('leadData?.name')
      expect(jobComposer).toContain('leadData?.contact_name')
      expect(jobComposer).toContain('extracted.customerName')
      expect(jobComposer).toContain('extracted.callerName')
      expect(jobComposer).toContain('canonicalName')
      expect(jobComposer).toContain('customerPhone')
    })

    it('JobComposer passes the new customer object into SearchableCustomerSelect as prefill', () => {
      expect(jobComposer).toContain('setNewlyCreatedCustomer(newCustomer)')
      expect(jobComposer).toContain('prefillCustomer={newlyCreatedCustomer || prefill?.prefillCustomer}')
    })

    it('SearchableCustomerSelect reconciles prefillCustomer into the option list', () => {
      expect(customerSelect).toContain('const mergedCustomers = useMemo(() => {')
      expect(customerSelect).toContain('[prefillCustomer, ...filtered]')
      expect(customerSelect).toContain('mergedCustomers.find(c => c.id === value)')
    })

    it('SearchableCustomerSelect closes and resets query when prefillCustomer appears', () => {
      expect(customerSelect).toContain('if (prefillCustomer) {')
      expect(customerSelect).toContain('setIsOpen(false)')
      expect(customerSelect).toContain('setSearchQuery(\'\')')
    })

    it('SearchableCustomerSelect display never collapses to empty', () => {
      expect(customerSelect).toContain('const display = getCustomerDisplayName(customer)')
      expect(customerSelect).toContain('if (display && display.trim()) return display')
      expect(customerSelect).toContain("return 'Customer'")
    })
  })

  describe('B. iOS customer picker tap selection', () => {
    it('customer option button uses onPointerDown to commit before blur dismisses', () => {
      expect(customerSelect).toContain('onPointerDown={(e) => { e.preventDefault(); handleSelect(customer.id) }}')
    })

    it('No customer option button uses onPointerDown', () => {
      expect(customerSelect).toContain('onPointerDown={(e) => { e.preventDefault(); handleSelect(null) }}')
    })

    it('pointerdown inside dropdown sets pointerDownInsideRef to avoid focusout dismissal', () => {
      expect(customerSelect).toContain('pointerDownInsideRef.current = true')
    })

    it('focusout skips dismissal when pointerDownInsideRef is true', () => {
      expect(customerSelect).toContain('if (pointerDownInsideRef.current) return')
    })
  })

  describe('C. Job / Reminder / Appointment action alignment', () => {
    it('reminder/job/appointment cards use items-center on the main row', () => {
      const matches = (calendarPage.match(/flex items-center justify-between gap-3/g) || [])
      expect(matches.length).toBeGreaterThanOrEqual(3)
    })

    it('task card in TasksTab uses items-center', () => {
      const matches = (tasksTab.match(/flex items-center gap-3/g) || [])
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('action buttons remain w-8 h-8 touch targets', () => {
      expect(calendarPage).toContain('w-8 h-8 flex items-center justify-center')
    })
  })

  describe('D. Appointment detail modal height', () => {
    it('modal container caps height at 80dvh on mobile and uses flex column', () => {
      expect(eventModal).toContain('max-h-[80dvh]')
      expect(eventModal).toContain('flex-col overflow-hidden')
    })

    it('modal body is the scrollable region, not the header or footer', () => {
      expect(eventModal).toContain('min-h-0 shrink min-w-0 overflow-y-auto overscroll-contain')
    })

    it('safe-area padding is used for top/bottom', () => {
      expect(eventModal).toContain('env(safe-area-inset-top)')
      expect(eventModal).toContain('var(--modal-bottom-reserve)')
    })
  })
})
