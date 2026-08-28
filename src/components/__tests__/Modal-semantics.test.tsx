import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import Modal from '@/components/ui/Modal'

describe('Modal - Dialog Semantics', () => {
  it('has role="dialog"', () => {
    const { unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Content</div>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    unmount()
  })

  it('has aria-modal="true"', () => {
    const { unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Content</div>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    unmount()
  })

  it('has aria-labelledby when title is provided', () => {
    const { unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()} title="Test Title">
        <div>Content</div>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy()
    unmount()
  })

  it('does not have aria-labelledby when title is not provided', () => {
    const { unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Content</div>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby')).toBeNull()
    unmount()
  })

  it('close button still has aria-label="Close"', () => {
    const { unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()} title="Title">
        <div>Content</div>
      </Modal>
    )

    const closeButtons = screen.getAllByLabelText('Close')
    expect(closeButtons.length).toBeGreaterThan(0)
    unmount()
  })
})