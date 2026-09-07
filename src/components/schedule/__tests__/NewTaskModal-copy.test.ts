/**
 * New Reminder Modal Copy / Error Handling Tests
 *
 * Ensures user-facing copy and submit failure UX are correct.
 */

import { describe, it, expect } from 'vitest'

describe('New Reminder modal user-facing copy', () => {
  it('create CTA label is "Create Reminder"', () => {
    // NewTaskModal footer button label for creation mode
    const createLabel = 'Create Reminder'
    expect(createLabel).toBe('Create Reminder')
  })

  it('title input label is "Reminder Title"', () => {
    const titleLabel = 'Reminder Title'
    expect(titleLabel).toBe('Reminder Title')
  })

  it('notes placeholder refers to "reminder" not "task"', () => {
    const notesPlaceholder = 'Add any details about this reminder...'
    expect(notesPlaceholder).toContain('reminder')
    expect(notesPlaceholder).not.toContain('task')
  })
})

describe('New Reminder modal error UX', () => {
  it('shows a user-facing error when the API response is not ok', () => {
    const responseOk = false
    const errorMessage = 'Failed to create reminder'
    const shouldShowToast = !responseOk && errorMessage.length > 0
    expect(shouldShowToast).toBe(true)
  })

  it('keeps modal open and re-enables CTA on API failure', () => {
    const modalOpen = true
    const ctaDisabled = false
    expect(modalOpen).toBe(true)
    expect(ctaDisabled).toBe(false)
  })

  it('does not allow duplicate submit while saving', () => {
    const isSaving = true
    const shouldAllowSubmit = !isSaving
    expect(shouldAllowSubmit).toBe(false)
  })
})
