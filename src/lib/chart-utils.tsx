/**
 * Shared chart utilities for premium dashboard analytics
 *
 * Provides:
 * - Currency formatters for Y-axis labels (compact)
 * - Integer tick helpers for count-based metrics
 * - Premium tooltip component
 * - Common chart styling constants
 * - Mobile touch scroll protection wrapper
 */

import { formatCurrency as formatCanonicalCurrency } from './utils'

/**
 * Format currency value for display
 * Handles cents, thousands, and appropriate precision
 * COMPACT VERSION for chart axes only
 */
export function formatCurrency(value: number): string {
  if (value === 0) return '$0'
  if (value < 0.01) return '<$0.01'
  if (value < 1) return `$${value.toFixed(2)}`
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toLocaleString()}`
}

/**
 * Format currency for Y-axis ticks
 * Uses less precision for cleaner axis labels
 * COMPACT VERSION for chart axes only
 */
export function formatCurrencyAxis(value: number): string {
  if (value === 0) return '$0'
  if (value < 1) return `$${value.toFixed(2)}`
  if (value >= 1000) return `$${(value / 1000)}K`
  return `$${value.toLocaleString()}`
}

/**
 * Format integer value for display
 * Ensures no decimal places for count-based metrics
 */
export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString()
}

/**
 * Generate integer ticks for Y-axis
 * Ensures no fractional values for count-based metrics
 */
export function getIntegerTicks(maxValue: number): number[] {
  if (maxValue <= 0) return [0]
  if (maxValue <= 5) return [0, 1, 2, 3, 4, 5]
  if (maxValue <= 10) return [0, 2, 4, 6, 8, 10]
  if (maxValue <= 20) return [0, 5, 10, 15, 20]
  if (maxValue <= 50) return [0, 10, 20, 30, 40, 50]
  if (maxValue <= 100) return [0, 25, 50, 75, 100]
  if (maxValue <= 200) return [0, 50, 100, 150, 200]

  // For larger values, use 5-step increments
  const step = Math.ceil(maxValue / 5)
  return [0, step, step * 2, step * 3, step * 4, step * 5]
}

/**
 * Premium tooltip component for Recharts
 *
 * Features:
 * - Dark elevated surface
 * - Subtle border and shadow
 * - Rounded corners
 * - Strong primary label/date
 * - Aligned series/value rows
 * - Semantic indicator
 * - Proper currency/number formatting
 */
import React from 'react'

interface PremiumTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
}

export function PremiumTooltip({ active, payload, label }: PremiumTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  return (
    <div className="bg-card border border-border/50 rounded-lg shadow-lg px-3 py-2.5 min-w-[140px]">
      {label && (
        <p className="text-[11px] font-semibold text-foreground mb-1.5">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color || entry.payload?.fill || 'hsl(var(--primary))' }}
              />
              <span className="text-muted-foreground">{entry.name || entry.dataKey}</span>
            </div>
            <span className="font-medium text-foreground tabular-nums">
              {entry.value !== undefined ? formatNumber(entry.value, entry.name) : '-'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Format number based on context (currency, integer, or default)
 */
function formatNumber(value: number, name?: string): string {
  // Check if this is a currency metric
  const isCurrency = name?.toLowerCase().includes('revenue') ||
                     name?.toLowerCase().includes('payment') ||
                     name?.toLowerCase().includes('amount')

  if (isCurrency) {
    // Use canonical formatter for tooltips (exact currency with 2 decimals)
    return formatCanonicalCurrency(value)
  }

  // Check if this is a count-based metric
  const isCount = name?.toLowerCase().includes('customer') ||
                  name?.toLowerCase().includes('job') ||
                  name?.toLowerCase().includes('appointment') ||
                  name?.toLowerCase().includes('conversation') ||
                  name?.toLowerCase().includes('lead')

  if (isCount) {
    return formatInteger(value)
  }

  // Default: show with appropriate precision
  if (Number.isInteger(value)) {
    return value.toLocaleString()
  }
  return value.toFixed(1)
}

/**
 * Common chart styling constants
 */
export const CHART_STYLES = {
  // Margins
  margin: { top: 16, right: 12, bottom: 8, left: 12 },

  // Grid
  gridStroke: 'hsl(var(--border))',
  gridStrokeDasharray: '3 3',
  gridStrokeOpacity: 0.1,

  // Axis
  axisLine: false,
  tickLine: false,
  tickFontSize: 10,
  tickColor: 'hsl(var(--muted-foreground) / 0.6)',

  // Tooltip
  tooltipBackground: 'hsl(var(--card))',
  tooltipBorder: 'hsl(var(--border))',
  tooltipBorderRadius: 8,
  tooltipPadding: '8px 12px',
  tooltipFontSize: 11,
  tooltipFontColor: 'hsl(var(--foreground))',

  // Bar
  barRadius: [3, 3, 0, 0] as [number, number, number, number],
  barMaxSize: 40,
  barGap: 8,
  categoryGap: 16,

  // Line
  lineStrokeWidth: 2,
  activeDotRadius: 4,

  // Donut
  donutInnerRadius: 50,
  donutOuterRadius: 80,
  donutPaddingAngle: 2,

  // Legend
  legendFontSize: 11,
  legendIconSize: 10,
}

/**
 * ChartTouchWrapper - Mobile touch scroll protection for Recharts
 *
 * Wraps Recharts charts to prevent scroll gestures from activating chart
 * data (bar/dot/slice selection). Uses the canonical gesture model from
 * @/lib/gesture/tap-guard (same 10px threshold as all other surfaces).
 *
 * Behavior:
 * - Touch/pointer down: capture start X/Y
 * - Move: if movement exceeds 10px in ANY direction, mark as drag
 *   SYNCHRONOUSLY via ref + direct DOM style (not async React state)
 *   so Recharts stops receiving pointer events immediately
 * - End: if gesture was a drag, force Recharts to remount (clearing all
 *   transient activation state: activeDot, activeBar, tooltip, cursor)
 * - If gesture remained a tap, Recharts' own onClick handler fires normally
 *
 * Desktop (mouse/hover): Unchanged — pointer handlers only fire on
 * interaction; hover tooltips work because pointerEvents stay 'auto'.
 *
 * Usage:
 *   <ChartTouchWrapper>
 *     <ResponsiveContainer>
 *       <BarChart>...</BarChart>
 *     </ResponsiveContainer>
 *   </ChartTouchWrapper>
 */
import { useState, useRef } from 'react'
import { GESTURE_MOVEMENT_THRESHOLD, isDragGesture } from '@/lib/gesture/tap-guard'

export function ChartTouchWrapper({ children }: { children: React.ReactNode }) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const isDraggingRef = useRef(false)
  const innerRef = useRef<HTMLDivElement>(null)

  const disableChartPointerEvents = () => {
    // Disable pointer events on the chart container so Recharts does not
    // receive further touch-generated pointermove events that activate
    // bar/dot/tooltip state. This is called ONLY when a drag is detected
    // (movement beyond threshold), NOT on pointerdown/touchstart, so that
    // a clean tap's click event can still reach Recharts' datum handlers.
    if (innerRef.current) {
      innerRef.current.style.pointerEvents = 'none'
    }
  }

  const restoreChartPointerEvents = () => {
    if (innerRef.current) {
      innerRef.current.style.pointerEvents = 'auto'
    }
  }

  const clearRechartsState = () => {
    // Dispatch synthetic events on the Recharts surface to clear
    // activeDot/activeBar/activeShape/tooltip/cursor state.
    // Recharts v3.10.1 uses a Redux-based state architecture that responds
    // to both mouse and touch events. We dispatch both mouseleave and
    // touchend/touchcancel to ensure all activation paths are cleared.
    if (innerRef.current) {
      const surface = innerRef.current.querySelector('.recharts-surface') as Element | null
      if (surface) {
        // Clear mouse-based activation (activeDot, tooltip, cursor)
        surface.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
        // Clear touch-based activation (Recharts v3.10.1 touchEventsMiddleware)
        try {
          surface.dispatchEvent(new TouchEvent('touchend', { bubbles: true }))
        } catch {
          // TouchEvent constructor not available in all environments (JSDOM)
          // mouseleave is sufficient in those cases
        }
      }
      // Also dispatch mouseleave on the wrapper (RechartsWrapper listens here)
      const wrapper = innerRef.current.querySelector('.recharts-wrapper') as Element | null
      if (wrapper) {
        wrapper.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
      }
    }
  }

  // Touch handlers (fallback for Android WebView where pointer events
  // may not fire during native scroll).
  // KEY: Do NOT disable pointer events on touchstart. A clean tap must
  // reach Recharts' click handler so the tapped datum activates. Pointer
  // events are disabled ONLY when a drag is detected (touchmove beyond
  // threshold), which stops further pointermove from reaching Recharts.
  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX
    startYRef.current = e.touches[0].clientY
    isDraggingRef.current = false
    setIsDragging(false)
    // Do NOT disable pointer events — allow clean tap to reach Recharts
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const touchX = e.touches[0].clientX
    const touchY = e.touches[0].clientY

    if (isDragGesture(startXRef.current, startYRef.current, touchX, touchY)) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true
        setIsDragging(true)
        // Disable pointer events ONLY when drag is detected
        disableChartPointerEvents()
        // Clear Recharts active state IMMEDIATELY when drag is detected,
        // not just on touchend. This prevents the activeDot/activeBar
        // from remaining visible during the scroll.
        clearRechartsState()
      }
      // Stop propagation in bubble phase so Recharts doesn't process
      // further touchmove events during the drag
      e.stopPropagation()
    }
  }

  // Capture-phase touch handler: fires BEFORE Recharts' touchmove handler.
  // When a drag is detected, stop propagation in capture phase to prevent
  // the event from reaching Recharts at all.
  const handleTouchMoveCapture = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return
    // Drag already detected — prevent Recharts from receiving this touchmove
    e.stopPropagation()
  }

  const handleTouchEnd = () => {
    if (isDraggingRef.current) {
      // Was a drag — clear Recharts active state
      clearRechartsState()
    }
    // If it was a tap, do NOT clear Recharts state — the click event
    // will reach Recharts naturally and activate the tapped datum.
    isDraggingRef.current = false
    setIsDragging(false)
    // Restore pointer events for next interaction
    restoreChartPointerEvents()
  }

  // Pointer event handlers: on Android WebView, pointer events fire
  // BEFORE touch events. Recharts listens to pointermove for hover/activation.
  // KEY: Do NOT disable pointer events on pointerdown. Only disable when
  // a drag is detected (pointermove beyond threshold), so a clean tap's
  // click event can still reach Recharts' datum handlers.
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only track touch pointers — mouse pointers need hover/tooltip
    if (e.pointerType !== 'touch') return
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    isDraggingRef.current = false
    setIsDragging(false)
    // Do NOT disable pointer events — allow clean tap to reach Recharts
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if (isDragGesture(startXRef.current, startYRef.current, e.clientX, e.clientY)) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true
        setIsDragging(true)
        // Disable pointer events ONLY when drag is detected
        disableChartPointerEvents()
        // Clear Recharts active state IMMEDIATELY when drag is detected
        clearRechartsState()
      }
      // Stop propagation so Recharts doesn't process further pointermove
      e.stopPropagation()
    }
  }

  // Capture-phase pointer handler: fires BEFORE Recharts' pointermove handler.
  // When a drag is detected, stop propagation in capture phase to prevent
  // the event from reaching Recharts at all.
  const handlePointerMoveCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if (!isDraggingRef.current) return
    // Drag already detected — prevent Recharts from receiving this pointermove
    e.stopPropagation()
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if (isDraggingRef.current) {
      // Was a drag — clear Recharts active state
      clearRechartsState()
    }
    // If it was a tap, do NOT clear Recharts state — the click event
    // will reach Recharts naturally and activate the tapped datum.
    isDraggingRef.current = false
    setIsDragging(false)
    restoreChartPointerEvents()
  }

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    isDraggingRef.current = false
    setIsDragging(false)
    restoreChartPointerEvents()
  }

  return (
    <div
      // Keyboard focus: tabIndex={0} makes the chart keyboard-focusable.
      // focus:outline-none suppresses the outline for touch/mouse focus
      // (which some Android browsers incorrectly trigger as focus-visible).
      // focus-visible:outline-2 shows a thin blue outline for keyboard
      // navigation ONLY — this is a localized outline, not a giant ring
      // with offset (which caused the white rounded rectangle on Android).
      // The SVG surface also gets :focus-visible:outline for keyboard.
      tabIndex={0}
      className="w-full h-full select-none focus:outline-none focus-visible:outline-2 focus-visible:outline-blue-500/30 rounded-lg [&_.recharts-surface]:outline-none [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-blue-500/30 [&_.recharts-wrapper]:outline-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchMoveCapture={handleTouchMoveCapture}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      // Allow native scrolling in both axes. Chart pointer events are
      // disabled on the inner div ONLY when a drag is detected (not on
      // pointerdown), so clean taps can reach Recharts. The outer div
      // always receives touch/pointer events for gesture tracking.
      style={{
        touchAction: 'pan-y pan-x',
        pointerEvents: 'auto',
      }}
      data-chart-dragging={isDragging ? 'true' : undefined}
    >
      <div
        ref={innerRef}
        className="w-full h-full"
        style={{ pointerEvents: 'auto' }}
      >
        {children}
      </div>
    </div>
  )
}

export { useTouchDevice } from './use-touch-device'