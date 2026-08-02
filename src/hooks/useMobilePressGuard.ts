'use client'

import { useRef, useCallback, useState, PointerEvent } from 'react'

interface UseMobilePressGuardOptions {
  onActivate: () => void
  threshold?: number // Movement threshold in pixels (default: 10)
}

interface UseMobilePressGuardReturn {
  onPointerDown: (e: PointerEvent) => void
  onPointerMove: (e: PointerEvent) => void
  onPointerUp: (e: PointerEvent) => void
  onPointerCancel: (e: PointerEvent) => void
  isPressed: boolean
}

/**
 * Mobile press guard hook to distinguish between deliberate taps and scroll gestures
 * 
 * This prevents accidental activation of interactive elements during scrolling
 * by tracking pointer movement and only triggering activation when movement is below threshold.
 * 
 * @param options Configuration options
 * @param options.onActivate Callback to execute when a deliberate tap is detected
 * @param options.threshold Movement threshold in pixels (default: 10)
 * @returns Event handlers and pressed state
 * 
 * @example
 * ```tsx
 * const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, isPressed } = useMobilePressGuard({
 *   onActivate: () => handleClick(),
 *   threshold: 10
 * })
 * 
 * <button
 *   onPointerDown={onPointerDown}
 *   onPointerMove={onPointerMove}
 *   onPointerUp={onPointerUp}
 *   onPointerCancel={onPointerCancel}
 *   className={isPressed ? 'pressed' : ''}
 * >
 *   Click me
 * </button>
 * ```
 */
export function useMobilePressGuard({
  onActivate,
  threshold = 10
}: UseMobilePressGuardOptions): UseMobilePressGuardReturn {
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const isPressed = useRef(false)
  const [pressedState, setPressedState] = useState(false)
  
  const onPointerDown = useCallback((e: PointerEvent) => {
    // Only handle primary pointer (left mouse button or touch)
    if (e.button !== 0 && e.pointerType === 'mouse') return
    
    startPos.current = { x: e.clientX, y: e.clientY }
    isPressed.current = true
    setPressedState(true)
  }, [])
  
  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!startPos.current || !isPressed.current) return
    
    const deltaX = Math.abs(e.clientX - startPos.current.x)
    const deltaY = Math.abs(e.clientY - startPos.current.y)
    
    // If movement exceeds threshold, cancel the press
    if (deltaX > threshold || deltaY > threshold) {
      isPressed.current = false
      setPressedState(false)
      startPos.current = null
    }
  }, [threshold])
  
  const onPointerUp = useCallback((e: PointerEvent) => {
    // Only handle primary pointer (left mouse button or touch)
    if (e.button !== 0 && e.pointerType === 'mouse') return
    
    const wasPressed = isPressed.current
    const start = startPos.current
    
    // Reset state
    isPressed.current = false
    setPressedState(false)
    startPos.current = null
    
    // Only activate if we were still pressed (movement was below threshold)
    if (wasPressed && start) {
      onActivate()
    }
  }, [onActivate])
  
  const onPointerCancel = useCallback(() => {
    isPressed.current = false
    setPressedState(false)
    startPos.current = null
  }, [])
  
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    isPressed: pressedState
  }
}