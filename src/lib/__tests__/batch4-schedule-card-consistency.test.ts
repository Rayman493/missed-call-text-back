/**
 * Batch 4 — Schedule/Calendar Interaction + Card Consistency
 *
 * Focused tests for:
 * 1. Agenda TODAY empty state remains visible
 * 2. Needs Attention excludes not-yet-due today's tasks
 * 3. Consistent actionable card controls
 * 4. Task time rendering uses AM/PM with no seconds
 * 5. Modal structure uses bounded content scroll + reachable footer
 * 6. Date/time input does not render duplicate custom/native indicators
 * 7. Weekend cell styling exists without disabling interaction
 * 8. No separate Tasks tab/route introduced
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const calendarPageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const todayCommandCenterContent = readFileSync('src/components/schedule/TodayCommandCenter.tsx', 'utf8')
const calendarDayCellContent = readFileSync('src/components/calendar/CalendarDayCell.tsx', 'utf8')
const calendarGridContent = readFileSync('src/components/calendar/CalendarGrid.tsx', 'utf8')
const modalContent = readFileSync('src/components/ui/Modal.tsx', 'utf8')
const eventDetailsModalContent = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')
const jobDetailsModalContent = readFileSync('src/components/jobs/JobDetailsModal.tsx', 'utf8')
const datePickerControllerContent = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
const timePickerControllerContent = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')
const globalsCssContent = readFileSync('src/app/globals.css', 'utf8')
const agendaClassificationContent = readFileSync('src/lib/agenda-classification.ts', 'utf8')
const timeFormatContent = readFileSync('src/lib/time-format.ts', 'utf8')
const calendarDateUtilsContent = readFileSync('src/lib/calendar-date-utils.ts', 'utf8')
const newTaskModalContent = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
const newAppointmentModalContent = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')

// ============================================================================
// 1. AGENDA TODAY EMPTY STATE REMAINS VISIBLE
// ============================================================================
describe('1. Agenda TODAY empty state remains visible', () => {
  it('TodayCommandCenter renders an empty state when there are zero today items', () => {
    // Lines 442-450: empty state with "Your day is clear" and "Nothing scheduled for today."
    expect(todayCommandCenterContent).toContain('Your day is clear')
    expect(todayCommandCenterContent).toContain('Nothing scheduled for today')
  })

  it('Today section is always rendered (not conditionally hidden when empty)', () => {
    // The Today card is always rendered; only the inner content switches
    // between loading, empty, and items. The card itself is not hidden.
    expect(todayCommandCenterContent).toContain('Today')
    // The empty state is inside the card, not a conditional that hides the card
    expect(todayCommandCenterContent).toMatch(/sortedWorkItems\.length === 0/)
  })

  it('Today card has a visible header with date even when empty', () => {
    // The header with "Today" label and current date is always rendered
    expect(todayCommandCenterContent).toContain('text-blue-900 dark:text-blue-100')
    expect(todayCommandCenterContent).toMatch(/new Date\(\)\.toLocaleDateString/)
  })
})

// ============================================================================
// 2. NEEDS ATTENTION EXCLUDES NOT-YET-DUE TODAY'S TASKS
// ============================================================================
describe('2. Needs Attention excludes not-yet-due today tasks', () => {
  it('partitionAgendaItems classifies today items as "today", not "needs_attention"', () => {
    // classifyAgendaItem: date === businessToday → 'today'
    expect(agendaClassificationContent).toMatch(/if \(itemDate === businessToday\)/)
    expect(agendaClassificationContent).toMatch(/return 'today'/)
  })

  it('classifyAgendaItem: date < businessToday → needs_attention (strict overdue only)', () => {
    expect(agendaClassificationContent).toMatch(/if \(itemDate < businessToday\)/)
    expect(agendaClassificationContent).toMatch(/return 'needs_attention'/)
  })

  it('TodayCommandCenter uses partitionAgendaItems for mutually exclusive classification', () => {
    expect(todayCommandCenterContent).toContain('partitionAgendaItems')
  })

  it('Needs Attention section only renders when overdueTasks.length > 0', () => {
    expect(todayCommandCenterContent).toMatch(/overdueTasks\.length > 0/)
  })

  it('completed items are excluded from both Today and Needs Attention', () => {
    expect(agendaClassificationContent).toMatch(/if \(item\.completed\) continue/)
  })

  it('undated items are excluded from both Today and Needs Attention', () => {
    expect(agendaClassificationContent).toMatch(/return 'undated'/)
  })
})

// ============================================================================
// 3. CONSISTENT ACTIONABLE CARD CONTROLS
// ============================================================================
describe('3. Consistent actionable card controls', () => {
  it('RemindersList task cards expose complete, edit, and delete actions', () => {
    expect(calendarPageContent).toContain('onToggleComplete')
    expect(calendarPageContent).toContain('onEditTask')
    expect(calendarPageContent).toContain('onDeleteTask')
  })

  it('RemindersList edit and delete use consistent w-8 h-8 icon buttons', () => {
    // Edit button: w-8 h-8 with Pencil w-4 h-4
    expect(calendarPageContent).toMatch(/w-8 h-8[\s\S]*?Pencil className="w-4 h-4"/)
    // Delete button: w-8 h-8 with Trash2 w-4 h-4
    expect(calendarPageContent).toMatch(/w-8 h-8[\s\S]*?Trash2 className="w-4 h-4"/)
  })

  it('JobCard edit uses the same w-8 h-8 icon button pattern', () => {
    // The JobCard edit button should use w-8 h-8 with Pencil w-4 h-4
    // matching the RemindersList pattern
    expect(calendarPageContent).toMatch(/onEditJob[\s\S]*?w-8 h-8[\s\S]*?Pencil className="w-4 h-4"/)
  })

  it('MeetingsTab appointment edit uses the same w-8 h-8 icon button pattern', () => {
    expect(calendarPageContent).toMatch(/isEditable[\s\S]*?w-8 h-8[\s\S]*?Pencil className="w-4 h-4"/)
  })

  it('all card edit buttons have aria-label for accessibility', () => {
    expect(calendarPageContent).toContain('aria-label="Edit reminder"')
    expect(calendarPageContent).toContain('aria-label="Edit job"')
    expect(calendarPageContent).toContain('aria-label="Edit appointment"')
  })

  it('all card edit buttons have hover states', () => {
    expect(calendarPageContent).toMatch(/hover:text-blue-600.*?Edit/s)
  })

  it('TodayCommandCenter is intentionally view-only (no edit pencil on agenda cards)', () => {
    // The Agenda view is intentionally view-only — documented in comments
    expect(todayCommandCenterContent).toContain('Agenda is view-only')
  })

  it('destructive actions (delete) retain confirmation', () => {
    // JobDetailsModal has showDeleteConfirm
    expect(jobDetailsModalContent).toContain('showDeleteConfirm')
    expect(jobDetailsModalContent).toContain('Delete this job?')
  })
})

// ============================================================================
// 4. TASK TIME RENDERING USES AM/PM WITH NO SECONDS
// ============================================================================
describe('4. Task time rendering uses AM/PM with no seconds', () => {
  it('formatTime12Hour in time-format.ts uses hour12: true', () => {
    expect(timeFormatContent).toContain('hour12: true')
  })

  it('formatTime12Hour in calendar-date-utils.ts strips seconds', () => {
    // The function splits by ':' and takes only first 2 elements (hours, minutes)
    expect(calendarDateUtilsContent).toMatch(/split\(':'\)\.slice\(0, 2\)/)
  })

  it('formatTime12Hour in calendar-date-utils.ts returns AM/PM format', () => {
    expect(calendarDateUtilsContent).toMatch(/ampm = hour >= 12 \? 'PM' : 'AM'/)
    expect(calendarDateUtilsContent).toMatch(/hour12 = hour % 12 \|\| 12/)
  })

  it('TodayCommandCenter uses formatTime12Hour for task times', () => {
    expect(todayCommandCenterContent).toContain('formatTime12Hour')
  })

  it('RemindersList formatDue uses manual 12-hour conversion (not raw)', () => {
    // formatDue in RemindersList manually converts to 12-hour
    expect(calendarPageContent).toMatch(/ampm = h >= 12 \? 'PM' : 'AM'/)
    expect(calendarPageContent).toMatch(/hour = h % 12 \|\| 12/)
  })

  it('no raw HH:MM:SS pattern in user-facing display code', () => {
    // The formatters should not output seconds
    // formatTime12Hour in calendar-date-utils returns "H:MM AM/PM" (no seconds)
    const formatTimeMatch = calendarDateUtilsContent.match(/return `\$\{hour12\}:\$\{minutes\} \$\{ampm\}`/)
    expect(formatTimeMatch).toBeTruthy()
  })
})

// ============================================================================
// 5. MODAL STRUCTURE USES BOUNDED CONTENT SCROLL + REACHABLE FOOTER
// ============================================================================
describe('5. Modal structure uses bounded content scroll + reachable footer', () => {
  it('shared Modal uses max-h with CSS variable for bounded height', () => {
    expect(modalContent).toContain('max-h-[var(--modal-max-height)]')
  })

  it('shared Modal content area uses overflow-y-auto for internal scroll', () => {
    expect(modalContent).toContain('overflow-y-auto')
    expect(modalContent).toContain('overscroll-contain')
  })

  it('shared Modal footer is flex-shrink-0 (stays visible)', () => {
    // Footer container uses shrink-0 (Tailwind) which is equivalent to flex-shrink-0
    expect(modalContent).toMatch(/shrink-0/)
  })

  it('shared Modal footer respects safe-area-inset-bottom', () => {
    expect(modalContent).toContain('env(safe-area-inset-bottom)')
  })

  it('globals.css --modal-max-height accounts for bottom nav on mobile', () => {
    // Mobile: must subtract bottom-nav-height from 100dvh
    expect(globalsCssContent).toMatch(/--modal-max-height: calc\(100dvh - var\(--bottom-nav-height/)
  })

  it('globals.css --modal-bottom-reserve includes bottom nav on mobile', () => {
    expect(globalsCssContent).toMatch(/--modal-bottom-reserve: calc\(env\(safe-area-inset-bottom\) \+ var\(--bottom-nav-height/)
  })

  it('globals.css desktop modal reserves 128px (no bottom nav)', () => {
    expect(globalsCssContent).toMatch(/min-width: 768px[\s\S]*?--modal-max-height: calc\(100dvh - 128px\)/)
  })

  it('EventDetailsModal uses bottom-nav-aware max-height on mobile', () => {
    expect(eventDetailsModalContent).toContain('max-h-[calc(100dvh-var(--bottom-nav-height,72px)-32px)]')
  })

  it('EventDetailsModal uses var(--modal-max-height) on desktop', () => {
    expect(eventDetailsModalContent).toContain('sm:max-h-[var(--modal-max-height)]')
  })

  it('EventDetailsModal outer container reserves bottom-nav space', () => {
    expect(eventDetailsModalContent).toMatch(/paddingBottom.*bottom-nav-height/)
  })

  it('EventDetailsModal content area uses overflow-y-auto for internal scroll', () => {
    expect(eventDetailsModalContent).toContain('overflow-y-auto')
  })

  it('EventDetailsModal footer is flex-shrink-0 (stays visible)', () => {
    expect(eventDetailsModalContent).toMatch(/Footer[\s\S]*?flex-shrink-0/s)
  })

  it('JobDetailsModal uses bottom-nav-aware max-height', () => {
    expect(jobDetailsModalContent).toContain('max-h-[calc(100dvh-var(--bottom-nav-height,80px)-32px)]')
  })

  it('JobDetailsModal content area uses overflow-y-auto for internal scroll', () => {
    expect(jobDetailsModalContent).toContain('overflow-y-auto')
  })

  it('JobDetailsModal footer respects safe-area-inset-bottom', () => {
    expect(jobDetailsModalContent).toContain('env(safe-area-inset-bottom)')
  })
})

// ============================================================================
// 6. DATE/TIME INPUT DOES NOT RENDER DUPLICATE CUSTOM/NATIVE INDICATORS
// ============================================================================
describe('6. Date/time input does not render duplicate indicators', () => {
  it('DatePicker uses hide-native-picker class to hide native indicator', () => {
    expect(datePickerControllerContent).toContain('hide-native-picker')
  })

  it('DatePicker renders custom CalendarDays icon (not native indicator)', () => {
    expect(datePickerControllerContent).toContain('CalendarDays')
  })

  it('DatePicker shows EITHER clear-X OR calendar icon (not both)', () => {
    // When value exists: show X (clear). When empty: show CalendarDays.
    // They are in a ternary — only one is rendered at a time.
    expect(datePickerControllerContent).toMatch(/value \?[\s\S]*?<X[\s\S]*?:[\s\S]*?<CalendarDays/)
  })

  it('TimePicker uses hide-native-picker class to hide native indicator', () => {
    expect(timePickerControllerContent).toContain('hide-native-picker')
  })

  it('TimePicker renders custom Clock icon (not native indicator)', () => {
    expect(timePickerControllerContent).toContain('Clock')
  })

  it('TimePicker shows EITHER clear-X OR clock icon (not both)', () => {
    expect(timePickerControllerContent).toMatch(/value \?[\s\S]*?<X[\s\S]*?:[\s\S]*?<Clock/)
  })

  it('CSS hides native calendar-picker-indicator with opacity: 0', () => {
    expect(globalsCssContent).toMatch(/hide-native-picker::-webkit-calendar-picker-indicator[\s\S]*?opacity: 0/)
  })

  it('CSS constrains native indicator to right 44px slot (not overlapping text)', () => {
    expect(globalsCssContent).toMatch(/hide-native-picker::-webkit-calendar-picker-indicator[\s\S]*?width: 44px/)
  })

  it('NewTaskModal uses DatePicker and TimePicker (not raw native inputs)', () => {
    expect(newTaskModalContent).toContain('DatePicker')
    expect(newTaskModalContent).toContain('TimePicker')
  })

  it('NewAppointmentModal uses DatePicker and TimePicker (not raw native inputs)', () => {
    expect(newAppointmentModalContent).toContain('DatePicker')
    expect(newAppointmentModalContent).toContain('TimePicker')
  })
})

// ============================================================================
// 7. WEEKEND CELL STYLING EXISTS WITHOUT DISABLING INTERACTION
// ============================================================================
describe('7. Weekend cell styling without disabling interaction', () => {
  it('CalendarDayCell has isWeekend prop', () => {
    expect(calendarDayCellContent).toContain('isWeekend')
  })

  it('CalendarDayCell weekend has distinct background (not disabled)', () => {
    // Weekend cells get a slightly darker background but remain clickable
    expect(calendarDayCellContent).toMatch(/isWeekend[\s\S]*?bg-slate-100\/80/)
  })

  it('CalendarDayCell weekend day numbers have distinct text color', () => {
    // Weekend day numbers get slightly muted text color (not disabled)
    expect(calendarDayCellContent).toMatch(/isWeekend && !isToday[\s\S]*?text-slate-500/)
  })

  it('CalendarDayCell remains cursor-pointer on weekends (not disabled)', () => {
    // The cursor-pointer class is on the cell regardless of weekend status
    expect(calendarDayCellContent).toMatch(/cursor-pointer active:scale-95/)
  })

  it('CalendarDayCell weekend has hover state (not disabled)', () => {
    expect(calendarDayCellContent).toMatch(/isWeekend[\s\S]*?hover:bg-slate-200/)
  })

  it('CalendarGrid passes isWeekend to CalendarDayCell', () => {
    expect(calendarGridContent).toContain('isWeekend')
    expect(calendarGridContent).toMatch(/isWeekend=\{isWeekend\}/)
  })

  it('CalendarGrid computes isWeekend for Sunday (index 0) and Saturday (index 6)', () => {
    expect(calendarGridContent).toMatch(/index % 7 === 0 \|\| index % 7 === 6/)
  })

  it('CalendarGrid weekend day-of-week headers have distinct color', () => {
    // Weekend headers (Sun, Sat) should have slightly different color
    expect(calendarGridContent).toMatch(/isWeekendHeader[\s\S]*?text-slate-400/)
  })

  it('Today cell overrides weekend styling (isToday takes priority)', () => {
    // isToday gets bg-blue-500 and text-white regardless of weekend
    expect(calendarDayCellContent).toMatch(/isToday[\s\S]*?bg-blue-500/)
    expect(calendarDayCellContent).toMatch(/isToday[\s\S]*?text-white/)
  })
})

// ============================================================================
// 8. NO SEPARATE TASKS TAB/ROUTE INTRODUCED
// ============================================================================
describe('8. No separate Tasks tab/route introduced', () => {
  it('scheduleTab union does NOT include "tasks"', () => {
    // The tab type should be 'agenda' | 'reminders' | 'jobs' | 'appointments' | 'calendar' | 'map'
    expect(calendarPageContent).toMatch(/'agenda' \| 'reminders' \| 'jobs' \| 'appointments' \| 'calendar' \| 'map'/)
  })

  it('scheduleTab does NOT include a "tasks" value', () => {
    // Should not have 'tasks' as a tab value
    const tabTypeMatch = calendarPageContent.match(/useState<('agenda' \| 'reminders' \| 'jobs' \| 'appointments' \| 'calendar' \| 'map')>/)
    expect(tabTypeMatch).toBeTruthy()
    expect(tabTypeMatch![0]).not.toContain('tasks')
  })

  it('Reminders tab is the canonical place for task management (not a Tasks tab)', () => {
    // The reminders tab renders RemindersList which manages tasks
    expect(calendarPageContent).toContain("scheduleTab === 'reminders'")
    expect(calendarPageContent).toContain('RemindersList')
  })

  it('Agenda Today section is the canonical view for today tasks', () => {
    expect(calendarPageContent).toContain('TodayCommandCenter')
  })

  it('TasksTab.tsx is NOT imported by the schedule page', () => {
    expect(calendarPageContent).not.toContain('TasksTab')
  })
})

// ============================================================================
// 9. MAP REGRESSION GUARD
// ============================================================================
describe('9. Map regression guard', () => {
  it('ScheduleMap is still mounted in the calendar page', () => {
    expect(calendarPageContent).toContain('ScheduleMap')
  })

  it('ScheduleMap container uses bottom-nav-aware height', () => {
    expect(calendarPageContent).toContain('var(--bottom-nav-height,80px)')
  })

  it('map tab still exists in the tab union', () => {
    expect(calendarPageContent).toMatch(/'agenda' \| 'reminders' \| 'jobs' \| 'appointments' \| 'calendar' \| 'map'/)
  })
})
