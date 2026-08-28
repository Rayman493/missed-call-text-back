import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import TestYourSetupModal from '../TestYourSetupModal'

describe('TestYourSetupModal', () => {
  afterEach(() => {
    cleanup()
  })

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <TestYourSetupModal
        isOpen={false}
        onClose={() => {}}
        businessPhoneNumber="(412) 555-1234"
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('should render when isOpen is true', () => {
    render(
      <TestYourSetupModal
        isOpen={true}
        onClose={() => {}}
        businessPhoneNumber="(412) 555-1234"
      />
    )
    expect(screen.getByText('Test Your Setup')).toBeTruthy()
  })

  it('should display business phone number when provided', () => {
    render(
      <TestYourSetupModal
        isOpen={true}
        onClose={() => {}}
        businessPhoneNumber="4125551234"
      />
    )
    expect(screen.getByText('(412) 555-1234')).toBeTruthy()
  })

  it('should not display phone number row when not provided', () => {
    render(
      <TestYourSetupModal
        isOpen={true}
        onClose={() => {}}
        businessPhoneNumber={null}
      />
    )
    expect(screen.queryByText(/Call your business number:/i)).toBeNull()
  })

  it('should display test instructions', () => {
    render(
      <TestYourSetupModal
        isOpen={true}
        onClose={() => {}}
        businessPhoneNumber="(412) 555-1234"
      />
    )
    expect(screen.getByText(/Call your business number from another phone/)).toBeTruthy()
    expect(screen.getByText(/Don't answer the call/)).toBeTruthy()
    expect(screen.getByText(/Check ReplyFlow/)).toBeTruthy()
  })

  it('should call onClose when Got It button is clicked', () => {
    const onClose = vi.fn()
    render(
      <TestYourSetupModal
        isOpen={true}
        onClose={onClose}
        businessPhoneNumber="(412) 555-1234"
      />
    )

    const gotItButton = screen.getByText('Got It')
    fireEvent.click(gotItButton)
    expect(onClose).toHaveBeenCalled()
  })

  it('should call onClose when first X button is clicked', () => {
    const onClose = vi.fn()
    render(
      <TestYourSetupModal
        isOpen={true}
        onClose={onClose}
        businessPhoneNumber="(412) 555-1234"
      />
    )

    const closeButton = screen.getAllByLabelText('Close modal')[0]
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalled()
  })

  it('should call onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <TestYourSetupModal
        isOpen={true}
        onClose={onClose}
        businessPhoneNumber="(412) 555-1234"
      />
    )

    // Click the backdrop (first div with fixed inset-0)
    const backdrop = container.querySelector('.fixed.inset-0')
    expect(backdrop).toBeTruthy()
    if (backdrop) {
      fireEvent.click(backdrop)
      expect(onClose).toHaveBeenCalled()
    }
  })

  it('should call onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(
      <TestYourSetupModal
        isOpen={true}
        onClose={onClose}
        businessPhoneNumber="(412) 555-1234"
      />
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('should not call onClose when other keys are pressed', () => {
    const onClose = vi.fn()
    render(
      <TestYourSetupModal
        isOpen={true}
        onClose={onClose}
        businessPhoneNumber="(412) 555-1234"
      />
    )

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('should be able to reopen after closing', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <TestYourSetupModal
        isOpen={false}
        onClose={onClose}
        businessPhoneNumber="(412) 555-1234"
      />
    )

    // Open
    rerender(
      <TestYourSetupModal
        isOpen={true}
        onClose={onClose}
        businessPhoneNumber="(412) 555-1234"
      />
    )
    expect(screen.getByText('Test Your Setup')).toBeTruthy()

    // Close
    onClose.mockClear()
    rerender(
      <TestYourSetupModal
        isOpen={false}
        onClose={onClose}
        businessPhoneNumber="(412) 555-1234"
      />
    )

    // Reopen
    rerender(
      <TestYourSetupModal
        isOpen={true}
        onClose={onClose}
        businessPhoneNumber="(412) 555-1234"
      />
    )
    expect(screen.getByText('Test Your Setup')).toBeTruthy()
  })
})