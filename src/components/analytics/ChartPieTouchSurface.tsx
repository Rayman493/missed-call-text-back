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
 * - A vertical drag is identified by movement > DRAG_THRESHOLD and is stopped
 *   in the capture phase before Recharts' touch middleware sees it, so the
 *   page scrolls normally.
 * - No preventDefault, no pointer capture, no global tap-to-filter.
 */
export function ChartPieTouchSurface({ children, className }: ChartPieTouchSurfaceProps) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)

  const handleTouchStartCapture = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    startRef.current = { x: t.clientX, y: t.clientY }
    isDraggingRef.current = false
  }, [])

  const handleTouchMoveCapture = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return
    const t = e.touches[0]
    if (!t) return
    const dy = Math.abs(t.clientY - startRef.current.y)
    if (dy > 12 && !isDraggingRef.current) {
      isDraggingRef.current = true
    }
    if (isDraggingRef.current) {
      // Stop the event before Recharts' middleware can intercept the scroll.
      e.stopPropagation()
    }
  }, [])

  const handleTouchEndCapture = useCallback((e: React.TouchEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      startRef.current = null
      e.stopPropagation()
      return
    }
    startRef.current = null
    // Clean tap: let the synthetic click reach the slice.
  }, [])

  return (
    <div
      className={className}
      style={{ touchAction: 'pan-y' }}
      onTouchStartCapture={handleTouchStartCapture}
      onTouchMoveCapture={handleTouchMoveCapture}
      onTouchEndCapture={handleTouchEndCapture}
    >
      {children}
    </div>
  )
}
