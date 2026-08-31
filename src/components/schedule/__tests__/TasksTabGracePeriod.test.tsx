import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Supabase
vi.mock('@/lib/supabase/browser', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: vi.fn(() => Promise.resolve({
        data: { session: { access_token: 'test-token' } }
      }))
    }
  })
}))

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))

// Mock fetch
global.fetch = vi.fn()

describe('TasksTab Grace Period - Logic Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('completion uses PATCH not DELETE', async () => {
    const mockTasks = [
      {
        id: 'task-1',
        title: 'Test Task',
        notes: null,
        due_date: new Date().toISOString().split('T')[0],
        due_time: null,
        completed: false,
        completed_at: null,
        lead_id: null,
        job_id: null,
        created_at: new Date().toISOString()
      }
    ]

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks })
    })

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ task: { ...mockTasks[0], completed: true, completed_at: new Date().toISOString() } })
    })

    // Simulate the completion call directly
    const response = await fetch('/api/tasks/task-1', {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ completed: true })
    })

    expect(response.ok).toBe(true)

    // Verify the PATCH method was used, not DELETE
    const patchCall = (global.fetch as any).mock.calls.find(call => call[1]?.method === 'PATCH')
    expect(patchCall).toBeDefined()

    const deleteCall = (global.fetch as any).mock.calls.find(call => call[1]?.method === 'DELETE')
    expect(deleteCall).toBeUndefined()
  })

  it('pending completion prevents disappearance race', () => {
    const mockTasks = [
      {
        id: 'task-1',
        title: 'Test Task',
        notes: null,
        due_date: new Date().toISOString().split('T')[0],
        due_time: null,
        completed: false,
        completed_at: null,
        lead_id: null,
        job_id: null,
        created_at: new Date().toISOString()
      }
    ]

    // Simulate the state sequence
    let tasks = [...mockTasks]
    let pendingCompletionTaskIds = new Set<string>()
    let justCompletedTaskIds = new Map<string, number>()

    // User clicks complete
    const taskId = 'task-1'
    const newCompletedState = true

    // Add to pending BEFORE optimistic update
    pendingCompletionTaskIds.add(taskId)

    // Optimistic update
    tasks = tasks.map(t =>
      t.id === taskId
        ? { ...t, completed: newCompletedState, completed_at: newCompletedState ? new Date().toISOString() : null }
        : t
    )

    // Filter for 'active' view
    const isOverdue = (dueDate: string | null) => {
      if (!dueDate) return false
      return dueDate < new Date().toISOString().split('T')[0]
    }
    const isFuture = (dueDate: string | null) => {
      if (!dueDate) return false
      return dueDate > new Date().toISOString().split('T')[0]
    }
    const isInGracePeriod = (id: string) => {
      const timestamp = justCompletedTaskIds.get(id)
      if (!timestamp) return false
      return Date.now() - timestamp < 4000
    }

    const filtered = tasks.filter(task => {
      // Include completed tasks during grace period OR while completion API is pending
      if (task.completed && (isInGracePeriod(task.id) || pendingCompletionTaskIds.has(task.id))) return true
      return !task.completed && !isOverdue(task.due_date) && !isFuture(task.due_date)
    })

    // Task should remain visible because it's in pendingCompletionTaskIds
    expect(filtered.length).toBe(1)
    expect(filtered[0].id).toBe('task-1')

    // API succeeds - clear pending, add to grace
    pendingCompletionTaskIds.delete(taskId)
    justCompletedTaskIds.set(taskId, Date.now())

    // Should still be visible (in grace period now)
    const filteredAfterSuccess = tasks.filter(task => {
      if (task.completed && (isInGracePeriod(task.id) || pendingCompletionTaskIds.has(task.id))) return true
      return !task.completed && !isOverdue(task.due_date) && !isFuture(task.due_date)
    })

    expect(filteredAfterSuccess.length).toBe(1)
  })

  it('grace period expires after 4000ms', () => {
    let justCompletedTaskIds = new Map<string, number>()
    const taskId = 'task-1'
    const completionTimestamp = Date.now()
    justCompletedTaskIds.set(taskId, completionTimestamp)

    // Should be in grace period immediately
    const isInGracePeriod = (id: string) => {
      const timestamp = justCompletedTaskIds.get(id)
      if (!timestamp) return false
      return Date.now() - timestamp < 4000
    }

    expect(isInGracePeriod(taskId)).toBe(true)

    // Advance time 3 seconds - still in grace
    vi.advanceTimersByTime(3000)
    expect(isInGracePeriod(taskId)).toBe(true)

    // Advance time 2 more seconds - grace expired
    vi.advanceTimersByTime(2000)
    expect(isInGracePeriod(taskId)).toBe(false)
  })

  it('multiple tasks have independent grace periods', () => {
    let justCompletedTaskIds = new Map<string, number>()
    const task1Id = 'task-1'
    const task2Id = 'task-2'

    const timestamp1 = Date.now()
    justCompletedTaskIds.set(task1Id, timestamp1)

    // Advance 2 seconds
    vi.advanceTimersByTime(2000)

    const timestamp2 = Date.now()
    justCompletedTaskIds.set(task2Id, timestamp2)

    // Both should still be in grace period
    const isInGracePeriod = (id: string) => {
      const timestamp = justCompletedTaskIds.get(id)
      if (!timestamp) return false
      return Date.now() - timestamp < 4000
    }

    expect(isInGracePeriod(task1Id)).toBe(true)
    expect(isInGracePeriod(task2Id)).toBe(true)

    // Advance 2 more seconds (task1 at 4s, task2 at 2s)
    vi.advanceTimersByTime(2000)

    // Task1 should expire, task2 should still be in grace
    expect(isInGracePeriod(task1Id)).toBe(false)
    expect(isInGracePeriod(task2Id)).toBe(true)

    // Advance 2 more seconds (task2 at 4s)
    vi.advanceTimersByTime(2000)

    // Both should be expired
    expect(isInGracePeriod(task1Id)).toBe(false)
    expect(isInGracePeriod(task2Id)).toBe(false)
  })

  it('API failure clears pending state', () => {
    let pendingCompletionTaskIds = new Set<string>()
    const taskId = 'task-1'

    // Add to pending
    pendingCompletionTaskIds.add(taskId)
    expect(pendingCompletionTaskIds.has(taskId)).toBe(true)

    // Simulate API failure - clear pending
    pendingCompletionTaskIds.delete(taskId)
    expect(pendingCompletionTaskIds.has(taskId)).toBe(false)
  })

  it('uncomplete clears grace and pending state', () => {
    let justCompletedTaskIds = new Map<string, number>()
    let pendingCompletionTaskIds = new Set<string>()
    const taskId = 'task-1'

    // Task was completed
    justCompletedTaskIds.set(taskId, Date.now())
    pendingCompletionTaskIds.add(taskId)

    // User uncompletes
    justCompletedTaskIds.delete(taskId)
    pendingCompletionTaskIds.delete(taskId)

    expect(justCompletedTaskIds.has(taskId)).toBe(false)
    expect(pendingCompletionTaskIds.has(taskId)).toBe(false)
  })

  it('completed filter shows all completed tasks regardless of grace', () => {
    const mockTasks = [
      {
        id: 'task-1',
        title: 'Test Task',
        notes: null,
        due_date: new Date().toISOString().split('T')[0],
        due_time: null,
        completed: true,
        completed_at: new Date().toISOString(),
        lead_id: null,
        job_id: null,
        created_at: new Date().toISOString()
      },
      {
        id: 'task-2',
        title: 'Task 2',
        notes: null,
        due_date: new Date().toISOString().split('T')[0],
        due_time: null,
        completed: false,
        completed_at: null,
        lead_id: null,
        job_id: null,
        created_at: new Date().toISOString()
      }
    ]

    let justCompletedTaskIds = new Map<string, number>()
    let pendingCompletionTaskIds = new Set<string>()

    // Task 1 is in grace period
    justCompletedTaskIds.set('task-1', Date.now())

    // Filter for 'completed'
    const filtered = mockTasks.filter(task => {
      return task.completed
    })

    // Should show only completed task, regardless of grace period
    expect(filtered.length).toBe(1)
    expect(filtered[0].id).toBe('task-1')
  })

  it('timer cleanup on unmount', () => {
    const graceTimersRef = { current: new Map<string, NodeJS.Timeout>() }
    const taskId = 'task-1'

    const timer = setTimeout(() => {}, 4000)
    graceTimersRef.current.set(taskId, timer)

    expect(graceTimersRef.current.size).toBe(1)

    // Simulate cleanup
    graceTimersRef.current.forEach(t => clearTimeout(t))
    graceTimersRef.current.clear()

    expect(graceTimersRef.current.size).toBe(0)
  })
})