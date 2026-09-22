'use client'

import React, { useRef, useCallback } from 'react'

interface ChartPieTouchSurfaceProps {
  children: React.ReactNode
  className?: string
}

/**
 * Touch-safe wrapper for Pie/Donut charts.
 *
 * Contract:
 * - A clean tap reaches Recharts so individual slices can be inspected locally.
 * - A vertical drag is identified by movement > 12px and is stopped
 *   in the capture phase before Recharts' touch middleware sees it, so the
 *   page scrolls normally.
 * - The trailing synthetic click after a drag is suppressed so a scroll ending
 *   over a slice does not select it.
 * - No preventDefault, no pointer capture, no global tap-to-filter.
 */
export function ChartPieTouchSurface({ children, className }: ChartPieTouchSurfaceProps) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)
  const justDraggedRef = useRef(false)
  const lastPointerTypeRef = useRef<string>('mouse')

  const handleTouchStartCapture = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    startRef.current = { x: t.clientX, y: t.clientY }
    isDraggingRef.current = false
    justDraggedRef.current = false
    lastPointerTypeRef.current = 'touch'
  }, [])

  const handleTouchMoveCapture = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return
    const t = e.touches[0]
    if (!t) return
    const dx = Math.abs(t.clientX - startRef.current.x)
    const dy = Math.abs(t.clientY - startRef.current.y)
    // 12px vertical threshold is retained for test compatibility; vertical must
    // dominate horizontal before we treat the gesture as a page scroll.
    if (dy > 12 && dy > dx && !isDraggingRef.current) {
      isDraggingRef.current = true
    }
    if (isDraggingRef.current) {
      // Stop the event before Recharts' middleware can intercept the scroll.
      e.stopPropagation()
    }
  }, [])

  const handleTouchEndCapture = useCallback((e: React.TouchEvent) => {
    if (isDraggingRef.current) {
      justDraggedRef.current = true
      isDraggingRef.current = false
      startRef.current = null
      e.stopPropagation()
      return
    }
    startRef.current = null
    // Clean tap: let the synthetic click reach the slice.
  }, [])

  const handleClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (lastPointerTypeRef.current === 'touch' && justDraggedRef.current) {
      justDraggedRef.current = false
      e.stopPropagation()
    }
  }, [])

  return (
    <div
      className={className}
      style={{ touchAction: 'pan-y' }}
      onTouchStartCapture={handleTouchStartCapture}
      onTouchMoveCapture={handleTouchMoveCapture}
      onTouchEndCapture={handleTouchEndCapture}
      onClickCapture={handleClickCapture}
    >
      {children}
    </div>
  )
}
