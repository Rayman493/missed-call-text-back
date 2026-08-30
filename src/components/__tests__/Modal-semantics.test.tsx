import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('Modal - Dismissal Semantics', () => {
  it('closes on backdrop click (pointerdown and pointerup on backdrop)', () => {
    const handleClose = vi.fn()
    const { unmount } = render(
      <Modal isOpen={true} onClose={handleClose}>
        <div>Content</div>
      </Modal>
    )

    const backdrop = document.querySelector('.fixed.inset-0')
    expect(backdrop).toBeTruthy()

    if (backdrop) {
      // Simulate pointerDown on backdrop to track origin
      fireEvent.pointerDown(backdrop)
      // Simulate pointerUp on backdrop
      fireEvent.pointerUp(backdrop)
      // Click to trigger dismissal
      fireEvent.click(backdrop)
      expect(handleClose).toHaveBeenCalledTimes(1)
    }
    unmount()
  })

  it('does not close when pointerdown inside dialog and pointerup on backdrop', () => {
    const handleClose = vi.fn()
    const { unmount } = render(
      <Modal isOpen={true} onClose={handleClose}>
        <div>Content</div>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    const backdrop = document.querySelector('.fixed.inset-0')
    expect(dialog).toBeTruthy()
    expect(backdrop).toBeTruthy()

    if (dialog && backdrop) {
      // Simulate pointerDown inside dialog (text selection start)
      fireEvent.pointerDown(dialog)
      // Simulate pointerUp on backdrop (drag ends outside)
      fireEvent.pointerUp(backdrop)
      // Click to trigger potential dismissal
      fireEvent.click(backdrop)
      // Should NOT close because pointerdown was not on backdrop
      expect(handleClose).not.toHaveBeenCalled()
    }
    unmount()
  })

  it('does not close when pointerdown on backdrop and pointerup inside dialog', () => {
    const handleClose = vi.fn()
    const { unmount } = render(
      <Modal isOpen={true} onClose={handleClose}>
        <div>Content</div>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    const backdrop = document.querySelector('.fixed.inset-0')
    expect(dialog).toBeTruthy()
    expect(backdrop).toBeTruthy()

    if (dialog && backdrop) {
      // Simulate pointerDown on backdrop
      fireEvent.pointerDown(backdrop)
      // Simulate pointerUp inside dialog
      fireEvent.pointerUp(dialog)
      // Click on dialog (target will be dialog, not backdrop)
      fireEvent.click(dialog)
      // Should NOT close because pointerup was not on backdrop
      expect(handleClose).not.toHaveBeenCalled()
    }
    unmount()
  })

  it('does not close when clicking inside dialog', () => {
    const handleClose = vi.fn()
    const { unmount } = render(
      <Modal isOpen={true} onClose={handleClose}>
        <div>Content</div>
      </Modal>
    )

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()

    if (dialog) {
      fireEvent.click(dialog)
      expect(handleClose).not.toHaveBeenCalled()
    }
    unmount()
  })

  it('resets tracking after pointercancel', () => {
    const handleClose = vi.fn()
    const { unmount } = render(
      <Modal isOpen={true} onClose={handleClose}>
        <div>Content</div>
      </Modal>
    )

    const backdrop = document.querySelector('.fixed.inset-0')
    expect(backdrop).toBeTruthy()

    if (backdrop) {
      // Simulate pointerDown on backdrop
      fireEvent.pointerDown(backdrop)
      // Simulate pointerCancel (e.g., system gesture, incoming call)
      fireEvent.pointerCancel(backdrop)
      // Click should NOT close because tracking was reset
      fireEvent.click(backdrop)
      expect(handleClose).not.toHaveBeenCalled()
    }
    unmount()
  })

  it('closes on X button', () => {
    const handleClose = vi.fn()
    const { unmount } = render(
      <Modal isOpen={true} onClose={handleClose} title="Title">
        <div>Content</div>
      </Modal>
    )

    const closeButton = screen.getByLabelText('Close')
    fireEvent.click(closeButton)
    expect(handleClose).toHaveBeenCalledTimes(1)
    unmount()
  })
})