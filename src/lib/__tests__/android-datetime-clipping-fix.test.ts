/**
 * Android Date/Time Clipping Fix — Focused Tests
 *
 * Tests for:
 * 1. DatePicker has correct mobile width/min-width ownership
 * 2. TimePicker has correct mobile width/min-width ownership
 * 3. date value reserves adequate affordance space
 * 4. time value reserves adequate affordance space including AM/PM
 * 5. no duplicate calendar affordance
 * 6. no duplicate clock affordance
 * 7. New Appointment uses corrected control
 * 8. New Task uses corrected control
 * 9. Reminder path uses corrected control
 * 10. Job scheduling path uses corrected control
 * 11. active raw native date/time inputs are either justified or migrated
 * 12. narrow mobile parent layouts use min-w-0/flexible sizing correctly
 * 13. mobile input typography remains >=16px for iOS
 * 14. desktop behavior preserved
 * 15. no date/time data/API semantics changed
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Android Date/Time Clipping — Shared control width ownership', () => {
  const datePicker = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
  const timePicker = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')

  it('1. DatePicker has w-full min-w-0 on input', () => {
    expect(datePicker).toContain('w-full min-w-0')
  })

  it('1a. DatePicker wrapper has min-w-0', () => {
    expect(datePicker).toContain('relative min-w-0')
  })

  it('2. TimePicker has w-full min-w-0 on input', () => {
    expect(timePicker).toContain('w-full min-w-0')
  })

  it('2a. TimePicker wrapper has min-w-0', () => {
    expect(timePicker).toContain('relative min-w-0')
  })
})

describe('Android Date/Time Clipping — Affordance space', () => {
  const datePicker = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
  const timePicker = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')
  const globals = readFileSync('src/app/globals.css', 'utf8')

  it('3. DatePicker reserves 44px right padding for affordance (pr-[44px])', () => {
    expect(datePicker).toContain('pr-[44px]')
  })

  it('4. TimePicker reserves 44px right padding for affordance (pr-[44px])', () => {
    expect(timePicker).toContain('pr-[44px]')
  })

  it('4a. TimePicker uses step=60 (no seconds in display)', () => {
    expect(timePicker).toContain('step={60}')
  })

  it('3a/4a. CSS native indicator constrained to 44px slot', () => {
    expect(globals).toContain('width: 44px')
    expect(globals).toContain('height: 44px')
  })

  it('3b/4b. CSS datetime-edit uses overflow:visible (not hidden) to prevent clipping', () => {
    expect(globals).toContain('overflow: visible')
    expect(globals).not.toMatch(/::-webkit-datetime-edit[\s\S]*overflow: hidden/)
  })

  it('3c/4c. CSS datetime-edit fields-wrapper uses min-width: 0', () => {
    expect(globals).toContain('min-width: 0')
  })
})

describe('Android Date/Time Clipping — Icon ownership', () => {
  const datePicker = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
  const timePicker = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')
  const eventComposer = readFileSync('src/components/calendar/EventComposer.tsx', 'utf8')
  const globals = readFileSync('src/app/globals.css', 'utf8')

  it('5. DatePicker hides native indicator (hide-native-picker) and shows custom CalendarDays', () => {
    expect(datePicker).toContain('hide-native-picker')
    expect(datePicker).toContain('CalendarDays')
    expect(globals).toContain('.hide-native-picker::-webkit-calendar-picker-indicator')
    expect(globals).toContain('opacity: 0')
  })

  it('5a. DatePicker does not show BOTH native indicator and custom icon visibly', () => {
    // hide-native-picker makes native indicator opacity:0
    // custom CalendarDays icon is the only visible affordance
    expect(datePicker).toContain('appearance-none')
    expect(datePicker).toContain('hide-native-picker')
  })

  it('6. TimePicker hides native indicator (hide-native-picker) and shows custom Clock', () => {
    expect(timePicker).toContain('hide-native-picker')
    expect(timePicker).toContain('Clock')
  })

  it('6a. TimePicker does not show BOTH native indicator and custom icon visibly', () => {
    expect(timePicker).toContain('appearance-none')
    expect(timePicker).toContain('hide-native-picker')
  })

  it('6b. EventComposer raw time inputs do NOT duplicate Clock icon (native indicator only)', () => {
    // EventComposer uses raw type="time" without hide-native-picker
    // It should NOT have a custom Clock icon overlapping the native indicator
    expect(eventComposer).not.toMatch(/type="time"[\s\S]*?<Clock/)
  })

  it('6c. EventComposer raw date inputs do NOT duplicate Calendar icon (native indicator only)', () => {
    expect(eventComposer).not.toMatch(/type="date"[\s\S]*?<Calendar/)
  })
})

describe('Android Date/Time Clipping — Consumer screens use corrected controls', () => {
  const newAppointment = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
  const newTask = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
  const jobComposer = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')

  it('7. New Appointment uses shared DatePicker and TimePicker', () => {
    expect(newAppointment).toContain('import DatePicker')
    expect(newAppointment).toContain('import TimePicker')
    expect(newAppointment).toContain('<DatePicker')
    expect(newAppointment).toContain('<TimePicker')
  })

  it('7a. New Appointment start+end time grid is responsive (grid-cols-1 sm:grid-cols-2)', () => {
    expect(newAppointment).toContain('grid grid-cols-1 sm:grid-cols-2 gap-3')
  })

  it('8. New Task uses shared DatePicker and TimePicker', () => {
    expect(newTask).toContain('import DatePicker')
    expect(newTask).toContain('import TimePicker')
    expect(newTask).toContain('<DatePicker')
    expect(newTask).toContain('<TimePicker')
  })

  it('8a. New Task date+time grid is responsive (grid-cols-1 sm:grid-cols-2)', () => {
    expect(newTask).toContain('grid grid-cols-1 sm:grid-cols-2 gap-3')
  })

  it('9. Reminder path (NewTaskModal) uses shared DatePicker/TimePicker for due date/time', () => {
    // NewTaskModal is the reminder/task creation modal
    expect(newTask).toContain('label="Due Date"')
    expect(newTask).toContain('label="Due Time"')
  })

  it('10. Job scheduling path (JobComposer) uses shared DatePicker and TimePicker', () => {
    expect(jobComposer).toContain('import DatePicker')
    expect(jobComposer).toContain('import TimePicker')
    expect(jobComposer).toContain('<DatePicker')
    expect(jobComposer).toContain('<TimePicker')
  })

  it('10a. JobComposer date+time grid is responsive (grid-cols-1 sm:grid-cols-2)', () => {
    expect(jobComposer).toContain('grid grid-cols-1 sm:grid-cols-2 gap-3')
  })
})

describe('Android Date/Time Clipping — Raw native inputs audit', () => {
  const eventComposer = readFileSync('src/components/calendar/EventComposer.tsx', 'utf8')
  const eventDetails = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')
  const settings = readFileSync('src/components/SettingsContent.tsx', 'utf8')
  const adminSupport = readFileSync('src/app/dashboard/admin/support/page.tsx', 'utf8')

  it('11a. EventComposer uses raw date/time inputs (justified: Google Calendar event creation with different styling)', () => {
    expect(eventComposer).toContain('type="date"')
    expect(eventComposer).toContain('type="time"')
    // EventComposer uses dark slate styling that differs from shared controls
    // It uses native indicator only (no hide-native-picker, no custom icon)
    expect(eventComposer).not.toContain('hide-native-picker')
  })

  it('11b. EventComposer raw inputs have min-w-0 for flex/grid safety', () => {
    expect(eventComposer).toContain('min-w-0')
  })

  it('11c. EventComposer time grid is responsive (grid-cols-1 sm:grid-cols-2)', () => {
    expect(eventComposer).toContain('grid grid-cols-1 sm:grid-cols-2 gap-3')
  })

  it('11d. EventDetailsModal uses raw date/time inputs in flex-wrap layout (justified: inline edit mode)', () => {
    expect(eventDetails).toContain('type="date"')
    expect(eventDetails).toContain('type="time"')
    // Uses flex-wrap which handles narrow screens
    expect(eventDetails).toContain('flex-wrap')
  })

  it('11e. SettingsContent uses raw time inputs (justified: business hours with showPicker API)', () => {
    expect(settings).toContain('type="time"')
    // Uses showPicker() API for programmatic opening
    expect(settings).toContain('showPicker')
  })

  it('11f. SettingsContent time grid is responsive (grid-cols-1 sm:grid-cols-2)', () => {
    expect(settings).toContain('grid grid-cols-1 sm:grid-cols-2')
  })

  it('11g. admin/support uses raw date input (justified: standalone full-width, not in grid)', () => {
    expect(adminSupport).toContain('type="date"')
    expect(adminSupport).toContain('w-full')
  })
})

describe('Android Date/Time Clipping — Narrow mobile parent layouts', () => {
  const newTask = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
  const jobComposer = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
  const newAppointment = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
  const eventComposer = readFileSync('src/components/calendar/EventComposer.tsx', 'utf8')
  const settings = readFileSync('src/components/SettingsContent.tsx', 'utf8')

  it('12a. NewTaskModal date+time uses responsive grid (stacks on mobile, side-by-side on sm+)', () => {
    expect(newTask).toContain('grid grid-cols-1 sm:grid-cols-2 gap-3')
  })

  it('12b. JobComposer date+time uses responsive grid', () => {
    expect(jobComposer).toContain('grid grid-cols-1 sm:grid-cols-2 gap-3')
  })

  it('12c. NewAppointmentModal start+end time uses responsive grid', () => {
    expect(newAppointment).toContain('grid grid-cols-1 sm:grid-cols-2 gap-3')
  })

  it('12d. EventComposer start+end time uses responsive grid', () => {
    expect(eventComposer).toContain('grid grid-cols-1 sm:grid-cols-2 gap-3')
  })

  it('12e. SettingsContent open+close time uses responsive grid', () => {
    expect(settings).toContain('grid grid-cols-1 sm:grid-cols-2')
  })

  it('12f. DatePicker/TimePicker inputs have min-w-0 for flex/grid shrink safety', () => {
    const datePicker = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
    const timePicker = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')
    expect(datePicker).toContain('min-w-0')
    expect(timePicker).toContain('min-w-0')
  })
})

describe('Android Date/Time Clipping — iOS >=16px typography preserved', () => {
  const datePicker = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
  const timePicker = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')
  const eventComposer = readFileSync('src/components/calendar/EventComposer.tsx', 'utf8')
  const eventDetails = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')
  const settings = readFileSync('src/components/SettingsContent.tsx', 'utf8')
  const adminSupport = readFileSync('src/app/dashboard/admin/support/page.tsx', 'utf8')

  it('13a. DatePicker uses text-base on mobile (sm:text-sm on desktop)', () => {
    expect(datePicker).toContain('text-base sm:text-sm')
  })

  it('13b. TimePicker uses text-base on mobile (sm:text-sm on desktop)', () => {
    expect(timePicker).toContain('text-base sm:text-sm')
  })

  it('13c. EventComposer raw date/time inputs use text-base on mobile', () => {
    expect(eventComposer).toContain('text-base sm:text-sm')
  })

  it('13d. SettingsContent raw time inputs use text-base on mobile', () => {
    expect(settings).toContain('text-base sm:text-sm')
  })

  it('13e. admin/support raw date input uses text-base on mobile', () => {
    expect(adminSupport).toContain('text-base sm:text-sm')
  })

  it('13f. EventDetailsModal raw date input uses text-base on mobile (inline edit)', () => {
    // The date input in the inline edit path must use text-base sm:text-sm
    // to prevent iOS auto-zoom — context (inline vs primary) does not matter
    const dateInputMatch = eventDetails.match(/type="date"[\s\S]*?className="([^"]*)"/)
    expect(dateInputMatch).not.toBeNull()
    expect(dateInputMatch![1]).toContain('text-base sm:text-sm')
  })

  it('13g. EventDetailsModal raw time inputs use text-base on mobile (inline edit)', () => {
    // Both start and end time inputs in the inline edit path must use text-base sm:text-sm
    const timeInputMatches = eventDetails.match(/type="time"[\s\S]*?className="([^"]*)"/g)
    expect(timeInputMatches).not.toBeNull()
    expect(timeInputMatches!.length).toBeGreaterThanOrEqual(2)
    timeInputMatches!.forEach((match, i) => {
      expect(match, `Time input ${i} must have text-base sm:text-sm`).toContain('text-base sm:text-sm')
    })
  })

  it('13h. No active date/time input in the codebase uses text-sm without text-base on mobile', () => {
    // Verify no active raw date/time input uses bare text-sm (without text-base prefix)
    // This catches any remaining iOS auto-zoom risk
    const allFiles = [
      datePicker, timePicker, eventComposer, eventDetails, settings, adminSupport,
    ]
    allFiles.forEach((content, i) => {
      // Find all date/time input className attributes
      const inputMatches = content.match(/type="(date|time)"[\s\S]*?className="([^"]*)"/g)
      if (!inputMatches) return
      inputMatches.forEach((match) => {
        // If it has text-sm, it must also have text-base before it
        if (match.includes('text-sm')) {
          expect(match, 'Input with text-sm must also have text-base for iOS').toContain('text-base')
        }
      })
    })
  })
})

describe('Android Date/Time Clipping — Desktop behavior preserved', () => {
  const datePicker = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
  const timePicker = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')
  const newTask = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
  const jobComposer = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')

  it('14a. DatePicker uses sm:text-sm for desktop typography', () => {
    expect(datePicker).toContain('sm:text-sm')
  })

  it('14b. TimePicker uses sm:text-sm for desktop typography', () => {
    expect(timePicker).toContain('sm:text-sm')
  })

  it('14c. Grids use sm:grid-cols-2 for desktop side-by-side layout', () => {
    expect(newTask).toContain('sm:grid-cols-2')
    expect(jobComposer).toContain('sm:grid-cols-2')
  })

  it('14d. DatePicker preserves Today shortcut button', () => {
    expect(datePicker).toContain('selectToday')
    expect(datePicker).toContain('Today')
  })

  it('14e. TimePicker preserves step=60 (minute precision)', () => {
    expect(timePicker).toContain('step={60}')
  })
})

describe('Android Date/Time Clipping — No data/API semantics changed', () => {
  const datePicker = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
  const timePicker = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')

  it('15a. DatePicker value format remains YYYY-MM-DD', () => {
    expect(datePicker).toContain('value: string // YYYY-MM-DD format')
  })

  it('15b. TimePicker value format remains HH:MM (24-hour)', () => {
    expect(timePicker).toContain('value: string // HH:MM format (24-hour)')
  })

  it('15c. DatePicker onChange passes string value (not event)', () => {
    expect(datePicker).toContain('onChange: (value: string) => void')
  })

  it('15d. TimePicker onChange passes string value (not event)', () => {
    expect(timePicker).toContain('onChange: (value: string) => void')
  })

  it('15e. DatePicker preserves required/disabled props', () => {
    expect(datePicker).toContain('required?: boolean')
    expect(datePicker).toContain('disabled?: boolean')
  })

  it('15f. TimePicker preserves required/disabled props', () => {
    expect(timePicker).toContain('required?: boolean')
    expect(timePicker).toContain('disabled?: boolean')
  })

  it('15g. DatePicker preserves label/placeholder props', () => {
    expect(datePicker).toContain('label?: string')
    expect(datePicker).toContain('placeholder?: string')
  })

  it('15h. TimePicker preserves label/placeholder props', () => {
    expect(timePicker).toContain('label?: string')
    expect(timePicker).toContain('placeholder?: string')
  })
})
