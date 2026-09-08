import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Calendar ownership and edit routing', () => {
  const grid = readFileSync('src/components/calendar/CalendarGrid.tsx', 'utf8')
  const cell = readFileSync('src/components/calendar/CalendarDayCell.tsx', 'utf8')
  const page = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')

  it('CalendarGrid accepts tasks and forwards an onEventClick handler', () => {
    expect(grid).toContain('tasks?:')
    expect(grid).toContain('onEventClick?:')
    expect(grid).toContain('onEventClick={onEventClick}')
  })

  it('CalendarGrid includes task reminders in daily event list', () => {
    expect(grid).toContain('tasks.filter(task => task.due_date === dayKey && !task.completed)')
    expect(grid).toContain("type: 'task'")
  })

  it('CalendarDayCell exposes per-event click with stopPropagation', () => {
    expect(cell).toContain('onEventClick?:')
    expect(cell).toContain('onEventClick?.(event)')
    expect(cell).toContain('e.stopPropagation()')
  })

  it('Schedule page routes calendar items to the canonical editor', () => {
    expect(page).toContain('const handleCalendarItemClick')
    expect(page).toContain('setIsJobDetailsOpen(true)')
    expect(page).toContain('setIsNewTaskModalOpen(true)')
    expect(page).toContain('setIsEventDetailsOpen(true)')
    expect(page).toContain('getTasksForDay')
  })

  it('selected-day panel combines events, jobs, and reminders', () => {
    expect(page).toContain('const dayTasks = getTasksForDay(selectedDay)')
    expect(page).toContain('...dayTasks.map')
    expect(page).toContain("type: 'task' as const")
  })

  it('selected-day panel distinguishes ReplyFlow appointments from external Google events', () => {
    expect(page).toContain('const isReplyFlow = !!rfLead')
    expect(page).toContain('ReplyFlow')
    expect(page).toContain('Open in Google Calendar')
  })
})

describe('Date/Time picker duplicate icon prevention', () => {
  const datePicker = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
  const timePicker = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')
  const eventComposer = readFileSync('src/components/calendar/EventComposer.tsx', 'utf8')
  const globals = readFileSync('src/app/globals.css', 'utf8')

  it('DatePicker and TimePicker hide the native picker indicator while keeping the custom icon', () => {
    expect(datePicker).toContain('hide-native-picker')
    expect(timePicker).toContain('hide-native-picker')
    expect(globals).toContain('.hide-native-picker::-webkit-calendar-picker-indicator')
  })

  it('EventComposer time inputs rely on the native indicator (no duplicate Clock icon)', () => {
    expect(eventComposer).not.toMatch(/type=\"time\"[\s\S]*?<Clock/)
  })
})

describe('Payment row clickability', () => {
  const paymentsPage = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8')

  it('makes desktop payment rows clickable to open edit details while preserving action buttons', () => {
    expect(paymentsPage).toContain('cursor-pointer')
    expect(paymentsPage).toContain('onClick={() => handleOpenEditModal(payment)}')
    expect(paymentsPage).toContain('onClick={(e) => e.stopPropagation()}')
  })
})
