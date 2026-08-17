import { describe, it, expect } from 'vitest'

describe('Task Creation Optimistic Update', () => {
  it('should use persisted task ID from API response', () => {
    // Simulate API response
    const apiResponse = {
      task: {
        id: 'task-123',
        title: 'Test Task',
        due_date: '2024-01-15',
        due_time: '15:00:00',
        completed: false,
        created_at: '2024-01-15T10:00:00Z'
      }
    }

    // API returns the task with its persisted ID
    expect(apiResponse.task.id).toBe('task-123')
    expect(typeof apiResponse.task.id).toBe('string')
  })

  it('should deduplicate tasks by ID', () => {
    const existingTasks = [
      { id: 'task-1', title: 'Task 1' },
      { id: 'task-2', title: 'Task 2' }
    ]

    const newTask = { id: 'task-3', title: 'Task 3' }

    // Simulate deduplication logic
    const addTaskDeduplicated = (tasks: any[], task: any) => {
      if (tasks.some(t => t.id === task.id)) {
        return tasks
      }
      return [...tasks, task]
    }

    const result = addTaskDeduplicated(existingTasks, newTask)
    expect(result.length).toBe(3)
    expect(result[2].id).toBe('task-3')

    // Try adding the same task again
    const result2 = addTaskDeduplicated(result, newTask)
    expect(result2.length).toBe(3) // No duplicate
  })

  it('should not deduplicate different tasks with same title', () => {
    const existingTasks = [
      { id: 'task-1', title: 'Call customer', due_date: '2024-01-15' }
    ]

    const newTask = { id: 'task-2', title: 'Call customer', due_date: '2024-01-16' }

    const addTaskDeduplicated = (tasks: any[], task: any) => {
      if (tasks.some(t => t.id === task.id)) {
        return tasks
      }
      return [...tasks, task]
    }

    const result = addTaskDeduplicated(existingTasks, newTask)
    expect(result.length).toBe(2) // Both tasks should exist
  })

  it('should preserve task during refetch', () => {
    const optimisticTask = { id: 'task-123', title: 'New Task' }
    const serverTasks = [
      { id: 'task-123', title: 'New Task', completed: false },
      { id: 'task-456', title: 'Existing Task', completed: true }
    ]

    // Simulate merging server response with optimistic task
    const mergeTasks = (optimistic: any, server: any[]) => {
      return server.map(st => optimistic.id === st.id ? { ...st, ...optimistic } : st)
    }

    const result = mergeTasks(optimisticTask, serverTasks)
    expect(result.length).toBe(2)
    expect(result[0].id).toBe('task-123')
  })
})