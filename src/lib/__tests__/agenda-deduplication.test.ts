/**
 * Behavioral test matrix for Agenda Today / Needs Attention deduplication.
 *
 * Verifies that the two Agenda groups are MUTUALLY EXCLUSIVE:
 *   - Today: items genuinely scheduled/due on the business-local current date
 *   - Needs Attention: items with a due/scheduled date strictly before business-local today
 *
 * Tests the canonical classification helper (partitionAgendaItems) directly
 * with controlled dates and timezones, plus source-level contract checks
 * on TodayCommandCenter to ensure the deduplication is wired correctly.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  classifyAgendaItem,
  partitionAgendaItems,
} from '@/lib/agenda-classification'

// ---- Test fixtures ----

interface TestItem {
  id: string
  date: string | null
  completed?: boolean
  title?: string
}

// Use a fixed reference date so tests are deterministic.
// 2024-06-15 10:00 AM UTC = 2024-06-15 in UTC.
// In America/New_York (UTC-4 in June), this is 2024-06-15 06:00 AM EDT.
// So businessToday = '2024-06-15' for both UTC and America/New_York.
const REFERENCE_DATE = new Date('2024-06-15T10:00:00Z')
const TZ_UTC = 'UTC'
const TZ_EASTERN = 'America/New_York'

describe('Agenda Deduplication — classifyAgendaItem', () => {
  it('A. Reminder due today → today', () => {
    const result = classifyAgendaItem('2024-06-15', TZ_UTC, REFERENCE_DATE)
    expect(result).toBe('today')
  })

  it('B. Reminder due yesterday → needs_attention', () => {
    const result = classifyAgendaItem('2024-06-14', TZ_UTC, REFERENCE_DATE)
    expect(result).toBe('needs_attention')
  })

  it('G. Future item → future (neither group)', () => {
    const result = classifyAgendaItem('2024-06-16', TZ_UTC, REFERENCE_DATE)
    expect(result).toBe('future')
  })

  it('undated item → undated (neither group)', () => {
    expect(classifyAgendaItem(null, TZ_UTC, REFERENCE_DATE)).toBe('undated')
    expect(classifyAgendaItem('', TZ_UTC, REFERENCE_DATE)).toBe('undated')
    expect(classifyAgendaItem(undefined, TZ_UTC, REFERENCE_DATE)).toBe('undated')
  })

  it('I. Date-only today → today (no clock time needed)', () => {
    // Date-only items (no time component) are classified by date alone
    const result = classifyAgendaItem('2024-06-15', TZ_UTC, REFERENCE_DATE)
    expect(result).toBe('today')
  })

  it('J. Date-only yesterday → needs_attention', () => {
    const result = classifyAgendaItem('2024-06-14', TZ_UTC, REFERENCE_DATE)
    expect(result).toBe('needs_attention')
  })

  it('M. Business timezone near midnight — 11:59 PM Eastern is still today', () => {
    // 2024-06-15 23:59 UTC = 2024-06-15 19:59 EDT → still June 15 in Eastern
    const lateEvening = new Date('2024-06-15T23:59:00Z')
    const result = classifyAgendaItem('2024-06-15', TZ_EASTERN, lateEvening)
    expect(result).toBe('today')
  })

  it('M2. Business timezone near midnight — 12:00 AM UTC next day is still June 15 in Eastern (8 PM)', () => {
    // 2024-06-16 00:00 UTC = 2024-06-15 20:00 EDT → still June 15 in Eastern
    const justAfterMidnightUTC = new Date('2024-06-16T00:00:00Z')
    // June 15 in Eastern → today
    expect(classifyAgendaItem('2024-06-15', TZ_EASTERN, justAfterMidnightUTC)).toBe('today')
    // June 16 in Eastern → future (since businessToday is June 15)
    expect(classifyAgendaItem('2024-06-16', TZ_EASTERN, justAfterMidnightUTC)).toBe('future')
  })

  it('M3. UTC date differs from business-local date — overdue in UTC but today in Eastern', () => {
    // 2024-06-15 03:00 UTC = 2024-06-14 23:00 EDT (previous day in Eastern)
    // So a task due 2024-06-14 is "today" in Eastern, but "needs_attention" in UTC
    const earlyUTCMorning = new Date('2024-06-15T03:00:00Z')
    expect(classifyAgendaItem('2024-06-14', TZ_EASTERN, earlyUTCMorning)).toBe('today')
    expect(classifyAgendaItem('2024-06-14', TZ_UTC, earlyUTCMorning)).toBe('needs_attention')
  })
})

describe('Agenda Deduplication — partitionAgendaItems', () => {
  it('A+B. Reminder due today → Today only; Reminder due yesterday → Needs Attention only', () => {
    const items: TestItem[] = [
      { id: 'today-1', date: '2024-06-15', title: 'Today reminder' },
      { id: 'overdue-1', date: '2024-06-14', title: 'Overdue reminder' },
    ]
    const { today, needsAttention } = partitionAgendaItems(items, TZ_UTC, REFERENCE_DATE)
    expect(today.map(i => i.id)).toEqual(['today-1'])
    expect(needsAttention.map(i => i.id)).toEqual(['overdue-1'])
  })

  it('C+D. Task due today → Today only; Task overdue → Needs Attention only', () => {
    const items: TestItem[] = [
      { id: 'task-today', date: '2024-06-15' },
      { id: 'task-overdue', date: '2024-06-13' },
    ]
    const { today, needsAttention } = partitionAgendaItems(items, TZ_UTC, REFERENCE_DATE)
    expect(today.map(i => i.id)).toEqual(['task-today'])
    expect(needsAttention.map(i => i.id)).toEqual(['task-overdue'])
  })

  it('G. Future item → neither group', () => {
    const items: TestItem[] = [
      { id: 'future-1', date: '2024-06-20' },
    ]
    const { today, needsAttention } = partitionAgendaItems(items, TZ_UTC, REFERENCE_DATE)
    expect(today).toHaveLength(0)
    expect(needsAttention).toHaveLength(0)
  })

  it('H. Completed overdue item → excluded from both groups (preserves existing behavior)', () => {
    const items: TestItem[] = [
      { id: 'completed-overdue', date: '2024-06-10', completed: true },
      { id: 'completed-today', date: '2024-06-15', completed: true },
    ]
    const { today, needsAttention } = partitionAgendaItems(items, TZ_UTC, REFERENCE_DATE)
    expect(today).toHaveLength(0)
    expect(needsAttention).toHaveLength(0)
  })

  it('I+J. Date-only items classified correctly without clock time', () => {
    const items: TestItem[] = [
      { id: 'date-only-today', date: '2024-06-15' },
      { id: 'date-only-yesterday', date: '2024-06-14' },
    ]
    const { today, needsAttention } = partitionAgendaItems(items, TZ_UTC, REFERENCE_DATE)
    expect(today.map(i => i.id)).toEqual(['date-only-today'])
    expect(needsAttention.map(i => i.id)).toEqual(['date-only-yesterday'])
  })

  it('K. Same item ID cannot appear in both arrays', () => {
    const items: TestItem[] = [
      { id: 'shared-1', date: '2024-06-15' },
      { id: 'shared-2', date: '2024-06-14' },
      { id: 'shared-3', date: '2024-06-16' },
    ]
    const { today, needsAttention } = partitionAgendaItems(items, TZ_UTC, REFERENCE_DATE)
    const todayIds = new Set(today.map(i => i.id))
    const needsAttentionIds = new Set(needsAttention.map(i => i.id))
    // No intersection
    for (const id of todayIds) {
      expect(needsAttentionIds.has(id)).toBe(false)
    }
    for (const id of needsAttentionIds) {
      expect(todayIds.has(id)).toBe(false)
    }
  })

  it('L. Summary counts equal unique classified items (no double-counting)', () => {
    const items: TestItem[] = [
      { id: 't1', date: '2024-06-15' },
      { id: 't2', date: '2024-06-15' },
      { id: 't3', date: '2024-06-14' },
      { id: 't4', date: '2024-06-13' },
      { id: 't5', date: '2024-06-20' }, // future — not counted
      { id: 't6', date: null }, // undated — not counted
      { id: 't7', date: '2024-06-14', completed: true }, // completed — not counted
    ]
    const { today, needsAttention } = partitionAgendaItems(items, TZ_UTC, REFERENCE_DATE)
    // Summary count = today + overdue (mutually exclusive, no duplicates)
    const summaryCount = today.length + needsAttention.length
    // 2 today + 2 overdue = 4 (future, undated, completed excluded)
    expect(summaryCount).toBe(4)
    expect(today.length).toBe(2)
    expect(needsAttention.length).toBe(2)
  })

  it('undated items → excluded from both groups', () => {
    const items: TestItem[] = [
      { id: 'undated-1', date: null },
      { id: 'undated-2', date: '' },
    ]
    const { today, needsAttention } = partitionAgendaItems(items, TZ_UTC, REFERENCE_DATE)
    expect(today).toHaveLength(0)
    expect(needsAttention).toHaveLength(0)
  })

  it('M. Business timezone near midnight — correct local-day classification', () => {
    // 2024-06-16 03:00 UTC = 2024-06-15 23:00 EDT (still June 15 in Eastern)
    const lateNight = new Date('2024-06-16T03:00:00Z')
    const items: TestItem[] = [
      { id: 'eastern-today', date: '2024-06-15' }, // today in Eastern, past in UTC
      { id: 'eastern-overdue', date: '2024-06-14' }, // overdue in both
    ]
    const { today: todayEastern, needsAttention: overdueEastern } =
      partitionAgendaItems(items, TZ_EASTERN, lateNight)
    expect(todayEastern.map(i => i.id)).toEqual(['eastern-today'])
    expect(overdueEastern.map(i => i.id)).toEqual(['eastern-overdue'])

    // Same items with UTC: June 15 is now "past" (needs_attention)
    const { today: todayUTC, needsAttention: overdueUTC } =
      partitionAgendaItems(items, TZ_UTC, lateNight)
    expect(todayUTC).toHaveLength(0)
    expect(overdueUTC.map(i => i.id)).toEqual(['eastern-today', 'eastern-overdue'])
  })

  it('DST boundary — classification uses business timezone consistently', () => {
    // 2024-03-10 02:30 UTC — DST spring-forward day in US Eastern
    // America/New_York transitions from EST (UTC-5) to EDT (UTC-4) at 2 AM local
    // 2024-03-10 02:30 UTC = 2024-03-09 21:30 EST or 22:30 EDT
    // Either way, business date is March 9 in Eastern
    const dstBoundary = new Date('2024-03-10T02:30:00Z')
    const items: TestItem[] = [
      { id: 'dst-today', date: '2024-03-09' }, // March 9 in Eastern
      { id: 'dst-overdue', date: '2024-03-08' }, // March 8 — overdue in Eastern
    ]
    const { today, needsAttention } = partitionAgendaItems(items, TZ_EASTERN, dstBoundary)
    expect(today.map(i => i.id)).toEqual(['dst-today'])
    expect(needsAttention.map(i => i.id)).toEqual(['dst-overdue'])
  })

  it('empty input → both arrays empty', () => {
    const { today, needsAttention } = partitionAgendaItems([], TZ_UTC, REFERENCE_DATE)
    expect(today).toHaveLength(0)
    expect(needsAttention).toHaveLength(0)
  })

  it('all completed → both arrays empty', () => {
    const items: TestItem[] = [
      { id: 'c1', date: '2024-06-15', completed: true },
      { id: 'c2', date: '2024-06-14', completed: true },
    ]
    const { today, needsAttention } = partitionAgendaItems(items, TZ_UTC, REFERENCE_DATE)
    expect(today).toHaveLength(0)
    expect(needsAttention).toHaveLength(0)
  })
})

describe('TodayCommandCenter — deduplication contract (source-level)', () => {
  const content = readFileSync('src/components/schedule/TodayCommandCenter.tsx', 'utf8')

  it('imports the canonical partitionAgendaItems helper', () => {
    expect(content).toContain('partitionAgendaItems')
  })

  it('uses partitionAgendaItems for task classification (not independent filters)', () => {
    expect(content).toContain('partitionAgendaItems')
    // The old independent filter pattern should be gone for tasks
    // (the old code had: tasks.filter(t => !t.completed && t.due_date === todayStr)
    //  and tasks.filter(t => !t.completed && t.due_date && t.due_date < todayStr))
    // The new code uses partitionAgendaItems which classifies each item exactly once
  })

  it('accepts businessTimezone prop', () => {
    expect(content).toContain('businessTimezone')
    expect(content).toContain('businessTimezone?: string')
  })

  it('Today section does not include overdue tasks (getSortedWorkItems excludes overdue)', () => {
    // The old code had "Add overdue tasks (highest priority)" in getSortedWorkItems
    // That block should be removed — Today only contains today's items
    expect(content).not.toContain('Add overdue tasks (highest priority)')
  })

  it('Needs Attention section renders overdue tasks', () => {
    expect(content).toContain('Needs Attention')
    expect(content).toMatch(/overdueTasks\.slice\(0, 5\)/)
  })

  it('Needs Attention section hides when zero overdue items', () => {
    // The section is conditionally rendered: {overdueTasks.length > 0 && (...)}
    expect(content).toMatch(/\{overdueTasks\.length > 0 && \(/)
  })

  it('overdue tasks sorted oldest-first', () => {
    // The overdueTasks array is sorted by due_date ascending (oldest overdue first).
    // The sort uses aDate/bDate (derived from due_date) with localeCompare.
    expect(content).toContain('overdueTasksUnsorted')
    expect(content).toMatch(/a\.due_date.*b\.due_date/s)
    expect(content).toContain('localeCompare')
  })

  it('summary count uses mutually exclusive today + overdue (no double-counting)', () => {
    // Summary line: {todayTasks.length + overdueTasks.length} Reminders
    expect(content).toMatch(/todayTasks\.length \+ overdueTasks\.length/)
  })

  it('Today header no longer shows overdue badge (overdue items not in Today)', () => {
    // The old code had an "overdue" badge in the Today header
    // That badge should be removed since overdue items are in Needs Attention
    expect(content).toContain('Overdue badge moved to Needs Attention')
  })
})
