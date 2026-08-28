import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useModalBackButton } from '../useModalBackButton'
import { registerModal, unregisterModal, hasOpenModal, handleCapacitorBackButton, getModalStack } from '@/lib/modalBackButton'

// Mock window.history
const originalPushState = window.history.pushState
const originalBack = window.history.back
const originalAddEventListener = window.history.addEventListener
const originalRemoveEventListener = window.history.removeEventListener

describe('useModalBackButton - Behavioral Tests', () => {
  const mockOnClose1 = vi.fn()
  const mockOnClose2 = vi.fn()
  const mockOnClose3 = vi.fn()

  beforeEach(() => {
    mockOnClose1.mockReset()
    mockOnClose2.mockReset()
    mockOnClose3.mockReset()
    
    // Clear modal stack
    while (getModalStack().length > 0) {
      getModalStack().pop()
    }
    
    window.history.pushState = vi.fn()
    window.history.back = vi.fn()
    window.history.addEventListener = vi.fn()
    window.history.removeEventListener = vi.fn()
  })

  afterEach(() => {
    // Clear modal stack
    while (getModalStack().length > 0) {
      getModalStack().pop()
    }
    
    window.history.pushState = originalPushState
    window.history.back = originalBack
    window.history.addEventListener = originalAddEventListener
    window.history.removeEventListener = originalRemoveEventListener
  })

  it('TEST 1 — single modal: Back closes modal', () => {
    registerModal(mockOnClose1)
    
    const consumed = handleCapacitorBackButton()
    
    expect(consumed).toBe(true)
    expect(mockOnClose1).toHaveBeenCalledTimes(1)
    
    unregisterModal(mockOnClose1)
  })

  it('TEST 2 — stacked modals: Back closes top only', () => {
    registerModal(mockOnClose1)
    registerModal(mockOnClose2)
    
    const consumed = handleCapacitorBackButton()
    
    expect(consumed).toBe(true)
    expect(mockOnClose2).toHaveBeenCalledTimes(1)
    expect(mockOnClose1).toHaveBeenCalledTimes(0)
    
    unregisterModal(mockOnClose1)
    unregisterModal(mockOnClose2)
  })

  it('TEST 3 — second Back: closes underlying modal', () => {
    registerModal(mockOnClose1)
    registerModal(mockOnClose2)
    
    // First Back closes B
    handleCapacitorBackButton()
    unregisterModal(mockOnClose2)
    
    mockOnClose1.mockReset()
    
    // Second Back should close A
    const consumed = handleCapacitorBackButton()
    
    expect(consumed).toBe(true)
    expect(mockOnClose1).toHaveBeenCalledTimes(1)
    
    unregisterModal(mockOnClose1)
  })

  it('TEST 4 — cleanup: unregistered modal does not fire', () => {
    registerModal(mockOnClose1)
    unregisterModal(mockOnClose1)
    
    const consumed = handleCapacitorBackButton()
    
    expect(consumed).toBe(false)
    expect(mockOnClose1).toHaveBeenCalledTimes(0)
  })

  it('TEST 5 — repeated open/close: no duplicate registration', () => {
    registerModal(mockOnClose1)
    unregisterModal(mockOnClose1)
    registerModal(mockOnClose1)
    unregisterModal(mockOnClose1)
    
    const consumed = handleCapacitorBackButton()
    
    expect(consumed).toBe(false)
    expect(mockOnClose1).toHaveBeenCalledTimes(0)
  })

  it('TEST 6 — no modal: infrastructure does nothing', () => {
    const consumed = handleCapacitorBackButton()
    
    expect(consumed).toBe(false)
    expect(hasOpenModal()).toBe(false)
  })

  it('TEST 7 — NestedCancelConfirm: nested closes first', () => {
    registerModal(mockOnClose1) // JobDetailsModal
    registerModal(mockOnClose2) // NestedCancelConfirm
    
    const consumed = handleCapacitorBackButton()
    
    expect(consumed).toBe(true)
    expect(mockOnClose2).toHaveBeenCalledTimes(1)
    expect(mockOnClose1).toHaveBeenCalledTimes(0)
    
    unregisterModal(mockOnClose1)
    unregisterModal(mockOnClose2)
  })

  it('TEST 8 — UI close: removes from stack', () => {
    registerModal(mockOnClose1)
    registerModal(mockOnClose2)
    
    expect(hasOpenModal()).toBe(true)
    expect(getModalStack().length).toBe(2)
    
    // Close B via UI (unregister)
    unregisterModal(mockOnClose2)
    
    expect(hasOpenModal()).toBe(true)
    expect(getModalStack().length).toBe(1)
    
    unregisterModal(mockOnClose1)
    
    expect(hasOpenModal()).toBe(false)
    expect(getModalStack().length).toBe(0)
  })

  it('TEST 9 — UI close history: A remains after B closes', () => {
    registerModal(mockOnClose1)
    registerModal(mockOnClose2)
    
    // Close B via UI
    unregisterModal(mockOnClose2)
    
    // A should still be in stack
    expect(getModalStack().length).toBe(1)
    expect(getModalStack()[0]).toBe(mockOnClose1)
    
    unregisterModal(mockOnClose1)
  })

  it('TEST 10 — Open A, Open B, close B via X, Back closes A', () => {
    registerModal(mockOnClose1)
    registerModal(mockOnClose2)
    
    // Close B via UI
    unregisterModal(mockOnClose2)
    
    // Back should close A
    const consumed = handleCapacitorBackButton()
    
    expect(consumed).toBe(true)
    expect(mockOnClose1).toHaveBeenCalledTimes(1)
    expect(mockOnClose2).toHaveBeenCalledTimes(0)
    
    unregisterModal(mockOnClose1)
  })

  it('TEST 11 — Open A, Open B, close both via X: no stale history entries', () => {
    registerModal(mockOnClose1)
    registerModal(mockOnClose2)
    
    // Close both via UI
    unregisterModal(mockOnClose2)
    unregisterModal(mockOnClose1)
    
    // Stack should be empty
    expect(hasOpenModal()).toBe(false)
    expect(getModalStack().length).toBe(0)
    
    // Back should do nothing
    const consumed = handleCapacitorBackButton()
    expect(consumed).toBe(false)
  })

  it('Module Import Safety — should import without throwing errors', () => {
    expect(typeof useModalBackButton).toBe('function')
  })
})

describe('useModalBackButton - React Hook Regression Tests', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    mockOnClose.mockReset()

    // Clear modal stack
    while (getModalStack().length > 0) {
      getModalStack().pop()
    }

    window.history.pushState = vi.fn()
    window.history.back = vi.fn()
    window.history.addEventListener = vi.fn()
    window.history.removeEventListener = vi.fn()
  })

  afterEach(() => {
    // Clear modal stack
    while (getModalStack().length > 0) {
      getModalStack().pop()
    }

    window.history.pushState = originalPushState
    window.history.back = originalBack
    window.history.addEventListener = originalAddEventListener
    window.history.removeEventListener = originalRemoveEventListener
  })

  it('REGRESSION TEST 1 — immediate modal open: history.back NOT called on mount', () => {
    const { unmount } = renderHook(() => useModalBackButton({ isOpen: true, onClose: mockOnClose }))

    // history.back should NOT be called during mount
    expect(window.history.back).not.toHaveBeenCalled()

    // history.pushState should be called
    expect(window.history.pushState).toHaveBeenCalledWith({ modalOpen: true }, '')

    // Modal should be registered
    expect(getModalStack().length).toBe(1)

    unmount()
  })

  it('REGRESSION TEST 2 — changed onClose identity while open: no cleanup, no history.back', () => {
    const onCloseA = vi.fn()
    const onCloseB = vi.fn()

    const { rerender, unmount } = renderHook(() => useModalBackButton({ isOpen: true, onClose: onCloseA }))

    // Initial mount with onCloseA
    expect(window.history.pushState).toHaveBeenCalledTimes(1)
    expect(window.history.back).not.toHaveBeenCalled()
    expect(getModalStack().length).toBe(1)

    // Rerender with DIFFERENT onClose identity (onCloseB)
    rerender(() => useModalBackButton({ isOpen: true, onClose: onCloseB }))

    // Should NOT call history.back on callback identity change
    expect(window.history.back).not.toHaveBeenCalled()
    expect(window.history.pushState).toHaveBeenCalledTimes(1) // Still 1, not 2
    expect(getModalStack().length).toBe(1) // Modal still registered

    // Invoke the registered modal close (simulating native Back or popstate)
    handleCapacitorBackButton()

    // Should invoke the LATEST callback (onCloseB), not the original (onCloseA)
    expect(onCloseB).toHaveBeenCalledTimes(1)
    expect(onCloseA).not.toHaveBeenCalled()

    unmount()
  })

  it('REGRESSION TEST 3 — programmatic close: no unintended route navigation', () => {
    const { unmount } = renderHook(() => useModalBackButton({ isOpen: true, onClose: mockOnClose }))

    // Close programmatically
    const { rerender } = renderHook(() => useModalBackButton({ isOpen: false, onClose: mockOnClose }))

    // history.back should be called to cleanup the synthetic history entry
    expect(window.history.back).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('REGRESSION TEST 4 — unmount while open: cleanup does not call history.back if modal was consumed', () => {
    // Simulate modal being consumed by popstate before unmount
    registerModal(mockOnClose)

    const { unmount } = renderHook(() => useModalBackButton({ isOpen: true, onClose: mockOnClose }))

    // Manually simulate popstate consumption (modal closed before unmount)
    unregisterModal(mockOnClose)

    // Unmount the component
    unmount()

    // history.back should NOT be called because stack is now empty and we already consumed the state
    // (In reality, the history entry was consumed by the popstate that closed the modal)
    expect(window.history.back).not.toHaveBeenCalled()
  })

  it('REGRESSION TEST 5 — modal stack: register/unregister maintains correct state', () => {
    const mockOnClose1 = vi.fn()
    const mockOnClose2 = vi.fn()

    const { unmount: unmount1 } = renderHook(() => useModalBackButton({ isOpen: true, onClose: mockOnClose1 }))

    expect(getModalStack().length).toBe(1)

    const { unmount: unmount2 } = renderHook(() => useModalBackButton({ isOpen: true, onClose: mockOnClose2 }))

    expect(getModalStack().length).toBe(2)

    unmount1()

    expect(getModalStack().length).toBe(1)
    expect(getModalStack()[0]).toBe(mockOnClose2)

    unmount2()

    expect(getModalStack().length).toBe(0)
  })
})