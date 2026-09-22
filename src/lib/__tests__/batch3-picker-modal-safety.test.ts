import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const jobComposer = readSrc('src/components/jobs/JobComposer.tsx')
const newTaskModal = readSrc('src/components/schedule/NewTaskModal.tsx')
const newAppointmentModal = readSrc('src/components/calendar/NewAppointmentModal.tsx')
const searchableCustomerSelect = readSrc('src/components/customers/SearchableCustomerSelect.tsx')
const leadPickerModal = readSrc('src/components/jobs/LeadPickerModal.tsx')

describe('Batch 3 — customer pickers / modal safety / remove nested customer creation', () => {
  describe('A. Remove nested Add Customer flows', () => {
    it('1. JobComposer has no AddCustomerModal import', () => {
      expect(jobComposer).not.toContain("from '@/components/AddCustomerModal'")
    })

    it('2. NewTaskModal has no AddCustomerModal import', () => {
      expect(newTaskModal).not.toContain("from '@/components/AddCustomerModal'")
    })

    it('3. NewAppointmentModal has no AddCustomerModal import', () => {
      expect(newAppointmentModal).not.toContain("from '@/components/AddCustomerModal'")
    })

    it('4. JobComposer does not pass onAddCustomerClick', () => {
      expect(jobComposer).not.toContain('onAddCustomerClick')
    })

    it('5. NewTaskModal does not pass onAddCustomerClick', () => {
      expect(newTaskModal).not.toContain('onAddCustomerClick')
    })

    it('6. NewAppointmentModal does not pass onAddCustomerClick', () => {
      expect(newAppointmentModal).not.toContain('onAddCustomerClick')
    })

    it('7. no stale newlyCreatedCustomer state remains in the three modals', () => {
      expect(jobComposer).not.toContain('newlyCreatedCustomer')
      expect(newTaskModal).not.toContain('newlyCreatedCustomer')
      expect(newAppointmentModal).not.toContain('newlyCreatedCustomer')
    })
  })

  describe('B. Customer picker geometry and scroll protection', () => {
    it('8. SearchableCustomerSelect dropdown has bounded max height', () => {
      expect(searchableCustomerSelect).toContain('max-h-[300px]')
      // Batch C: mobile below-only positioning clamps to the real available
      // space below the trigger (min 0 — the list shrinks instead of flipping).
      expect(searchableCustomerSelect).toMatch(/setMaxDropdownHeight\(Math\.min\(desiredMax, Math\.max\(available, 0\)\)\)/)
    })

    it('9. SearchableCustomerSelect results area is scrollable with min-h-0', () => {
      expect(searchableCustomerSelect).toContain('overflow-y-auto')
      expect(searchableCustomerSelect).toContain('min-h-0')
      expect(searchableCustomerSelect).toContain('overscroll-contain')
    })

    it('10. SearchableCustomerSelect uses visualViewport for keyboard-aware sizing', () => {
      expect(searchableCustomerSelect).toContain('window.visualViewport')
      expect(searchableCustomerSelect).toContain("vv.addEventListener('resize', measure)")
    })

    it('11. LeadPickerModal list is bounded and scrollable', () => {
      expect(leadPickerModal).toContain('max-h-[var(--modal-max-height)]')
      expect(leadPickerModal).toMatch(/Lead list[\s\S]{0,100}?min-h-0/)
      expect(leadPickerModal).toContain('overflow-y-auto')
      expect(leadPickerModal).toContain('overscroll-contain')
    })

    it('12. SearchableCustomerSelect header/search stays fixed while results scroll', () => {
      expect(searchableCustomerSelect).toContain('flex-shrink-0')
    })
  })

  describe('C. Tap / click bleed-through protection', () => {
    it('13. customer row selection uses onClick via shared PickerListRow', () => {
      // Rows are the shared PickerListRow primitive; click-bleed protection
      // lives in the markDropdownDismissed / pointerDownInsideRef infra rather
      // than inline e.preventDefault on each row.
      expect(searchableCustomerSelect).toMatch(/<PickerListRow[\s\S]*?onClick=\{\(\) => handleSelect\(customer\.id\)\}/)
      expect(searchableCustomerSelect).toContain('markDropdownDismissed')
      expect(searchableCustomerSelect).toContain('pointerDownInsideRef')
    })

    it('14. No customer row uses onClick with stopPropagation and preventDefault', () => {
      expect(searchableCustomerSelect).toMatch(/onClick=\{\(e\) => \{ e\.preventDefault\(\); e\.stopPropagation\(\); handleSelect\(null\) \}\}/)
    })

    it('15. customer row no longer triggers selection on pointerdown', () => {
      expect(searchableCustomerSelect).not.toMatch(/onPointerDown=\{\(e\) => \{ e\.preventDefault\(\); handleSelect\(customer\.id\) \}\}/)
    })

    it('16. selecting a customer closes the dropdown', () => {
      expect(searchableCustomerSelect).toContain('setIsOpen(false)')
      expect(searchableCustomerSelect).toContain('handleSelect')
    })

    it('17. desktop mouse selection still works via onClick', () => {
      // PickerListRow renders a <button onClick> — mouse and keyboard select
      // both reach handleSelect.
      expect(searchableCustomerSelect).toContain('onClick={() => handleSelect(customer.id)}')
    })
  })

  describe('D. Preselected customer and Payment Request preservation', () => {
    it('18. Job, Reminder, Appointment still support preselected customer prefill', () => {
      expect(jobComposer).toContain('prefillCustomer={prefill?.prefillCustomer}')
      expect(newTaskModal).toContain('prefillCustomer={preselectedLeadCustomer}')
      expect(newAppointmentModal).toContain('prefillCustomer={preselectedLeadCustomer}')
    })

    it('19. Payment Request LeadPickerModal keeps + Create New Customer', () => {
      expect(leadPickerModal).toContain('+ Create New Customer')
      expect(leadPickerModal).toContain('onAddNew')
    })
  })
})
