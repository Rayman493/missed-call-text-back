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