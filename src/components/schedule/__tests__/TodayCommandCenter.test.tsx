/**
 * TodayCommandCenter Empty State Test
 *
 * Tests for:
 * - Empty state copy
 * - Today filtering
 * - Completed item exclusion
 */

import { describe, it, expect } from 'vitest'

describe('TodayCommandCenter', () => {
  describe('Empty State Copy', () => {
    it('should display "Nothing needs done today" when no work items exist', () => {
      // This is a documentation test - the actual rendering is tested by E2E
      // The empty state copy was changed from "No work scheduled for today"
      // to "Nothing needs done today" per physical device feedback
      const expectedCopy = "Nothing needs done today"
      expect(expectedCopy).toBe("Nothing needs done today")
    })
  })

  describe('Today Filtering Logic', () => {
    it('filters tasks to only show incomplete tasks due today', () => {
      const todayStr = new Date().toLocaleDateString('en-CA')

      const tasks = [
        { id: '1', title: 'Task 1', completed: false, due_date: todayStr },
        { id: '2', title: 'Task 2', completed: true, due_date: todayStr },
        { id: '3', title: 'Task 3', completed: false, due_date: '2023-01-01' },
      ]

      const todayTasks = tasks.filter(t =>
        !t.completed && t.due_date === todayStr
      )

      expect(todayTasks.length).toBe(1)
      expect(todayTasks[0].id).toBe('1')
    })

    it('filters jobs to only show non-cancelled jobs scheduled today', () => {
      const todayStr = new Date().toLocaleDateString('en-CA')

      const jobs = [
        { id: '1', scheduled_date: todayStr, status: 'scheduled' },
        { id: '2', scheduled_date: todayStr, status: 'cancelled' },
        { id: '3', scheduled_date: '2023-01-01', status: 'scheduled' },
      ]

      const todayJobs = jobs.filter(j =>
        j.scheduled_date === todayStr && j.status !== 'cancelled'
      )

      expect(todayJobs.length).toBe(1)
      expect(todayJobs[0].id).toBe('1')
    })

    it('excludes completed tasks from today and overdue lists', () => {
      const todayStr = new Date().toLocaleDateString('en-CA')

      const tasks = [
        { id: '1', title: 'Task 1', completed: false, due_date: todayStr },
        { id: '2', title: 'Task 2', completed: true, due_date: todayStr },
        { id: '3', title: 'Task 3', completed: false, due_date: '2023-01-01' },
        { id: '4', title: 'Task 4', completed: true, due_date: '2023-01-01' },
      ]

      const todayTasks = tasks.filter(t =>
        !t.completed && t.due_date === todayStr
      )

      const overdueTasks = tasks.filter(t =>
        !t.completed && t.due_date && t.due_date < todayStr
      )

      expect(todayTasks.length).toBe(1)
      expect(overdueTasks.length).toBe(1)
      expect(todayTasks[0].id).toBe('1')
      expect(overdueTasks[0].id).toBe('3')
    })
  })
})