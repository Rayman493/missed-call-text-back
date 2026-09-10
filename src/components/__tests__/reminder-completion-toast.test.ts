import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')

// Extract the handleToggleTaskComplete handler (wide window to capture full handler)
const handlerStart = pageContent.indexOf('const handleToggleTaskComplete')
const handlerBlock = handlerStart >= 0 ? pageContent.substring(handlerStart, handlerStart + 1200) : ''

describe('Reminder Completion Success Message', () => {
  it('handler exists', () => {
    expect(handlerBlock.length).toBeGreaterThan(0)
  })

  it('fires exactly one success toast on completion', () => {
    // Should contain exactly one showToast call with 'success' type
    const successToastMatches = handlerBlock.match(/showToast\([^)]*,\s*'success'\)/g)
    expect(successToastMatches).not.toBeNull()
    expect(successToastMatches!.length).toBe(1)
  })

  it('uses "Reminder completed" copy when completing', () => {
    // !completed means we are completing (completed param is the OLD state)
    expect(handlerBlock).toContain("'Reminder completed'")
  })

  it('uses "Reminder reopened" copy when uncompleting', () => {
    expect(handlerBlock).toContain("'Reminder reopened'")
  })

  it('success toast fires only after response.ok', () => {
    // The showToast should come AFTER the !response.ok guard
    const okGuardIndex = handlerBlock.indexOf('if (!response.ok) return')
    const showToastIndex = handlerBlock.indexOf('showToast')
    expect(okGuardIndex).toBeGreaterThan(-1)
    expect(showToastIndex).toBeGreaterThan(okGuardIndex)
  })

  it('success toast fires after state update (not before)', () => {
    // The setTasks and setTaskRefreshTrigger should come before showToast
    const setTasksIndex = handlerBlock.indexOf('setTasks(prev => prev.map')
    const showToastIndex = handlerBlock.indexOf('showToast')
    expect(setTasksIndex).toBeGreaterThan(-1)
    expect(showToastIndex).toBeGreaterThan(setTasksIndex)
  })

  it('does not fire success toast on API failure', () => {
    // The catch block should NOT contain showToast with 'success'
    const catchIndex = handlerBlock.indexOf('catch (error)')
    const catchBlock = handlerBlock.substring(catchIndex)
    expect(catchBlock).not.toContain("'success'")
  })

  it('does not fire success toast when response is not ok', () => {
    // The early return guard should come before showToast
    const returnIndex = handlerBlock.indexOf('if (!response.ok) return')
    const showToastIndex = handlerBlock.indexOf('showToast')
    // The return guard is before showToast, so on !response.ok we never reach showToast
    expect(returnIndex).toBeLessThan(showToastIndex)
  })

  it('does not fire success toast when token is missing', () => {
    // The !token return guard should come before showToast
    const tokenGuardIndex = handlerBlock.indexOf("if (!token) return")
    const showToastIndex = handlerBlock.indexOf('showToast')
    expect(tokenGuardIndex).toBeGreaterThan(-1)
    expect(showToastIndex).toBeGreaterThan(tokenGuardIndex)
  })

  it('preserves error logging on failure', () => {
    expect(handlerBlock).toContain("console.error('[Schedule] Failed to toggle task:'")
  })

  it('preserves state update on success', () => {
    expect(handlerBlock).toContain('setTasks(prev => prev.map')
    expect(handlerBlock).toContain('completed: !completed')
  })

  it('preserves refresh trigger on success', () => {
    expect(handlerBlock).toContain('setTaskRefreshTrigger(prev => prev + 1)')
  })

  it('uses success type (not info or warning)', () => {
    // The toast should be 'success' type, not 'info' or 'warning'
    expect(handlerBlock).toContain("'success'")
    expect(handlerBlock).not.toContain("'info'")
    expect(handlerBlock).not.toContain("'warning'")
  })

  it('completion message is conditional on !completed (completing, not reopening)', () => {
    // The ternary should check !completed for the completion message
    expect(handlerBlock).toContain("!completed ? 'Reminder completed' : 'Reminder reopened'")
  })
})

describe('No Duplicate Toast Ownership', () => {
  it('RemindersList passes onToggleComplete from page handler (not its own toast)', () => {
    // The Reminders tab should pass handleToggleTaskComplete, not a local toast emitter
    // Search for the RemindersList component usage
    const remindersListStart = pageContent.indexOf('<RemindersList')
    const remindersListBlock = remindersListStart >= 0 ? pageContent.substring(remindersListStart, remindersListStart + 500) : ''
    expect(remindersListBlock).toContain('onToggleComplete={handleToggleTaskComplete}')
  })

  it('showToast is defined exactly once in the component', () => {
    // There should be exactly one definition of showToast
    const showToastDefs = pageContent.match(/const showToast\s*=/g)
    expect(showToastDefs).not.toBeNull()
    expect(showToastDefs!.length).toBe(1)
  })

  it('handleToggleTaskComplete has exactly one showToast call', () => {
    // Only one showToast in the handler — no duplicates
    const showToastCalls = handlerBlock.match(/showToast\(/g)
    expect(showToastCalls).not.toBeNull()
    expect(showToastCalls!.length).toBe(1)
  })
})

describe('Reminder Still Moves to Completed Section', () => {
  it('handler updates task completed state', () => {
    expect(handlerBlock).toContain('completed: !completed')
  })

  it('handler updates completed_at timestamp', () => {
    expect(handlerBlock).toContain('completed_at: !completed ? new Date().toISOString() : null')
  })

  it('handler triggers refresh', () => {
    expect(handlerBlock).toContain('setTaskRefreshTrigger')
  })
})
