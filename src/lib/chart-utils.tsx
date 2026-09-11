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
    // Immediately disable pointer events on the chart container so Recharts
    // does not receive touch-generated pointermove events that activate
    // bar/dot/tooltip state. This must happen on BOTH pointerdown AND
    // touchstart because Android WebView fires pointer events before touch
    // events, and Recharts listens to pointer events.
    if (innerRef.current) {
      innerRef.current.style.pointerEvents = 'none'
    }
  }

  const restoreChartPointerEvents = () => {
    if (innerRef.current) {
      innerRef.current.style.pointerEvents = 'auto'
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX
    startYRef.current = e.touches[0].clientY
    isDraggingRef.current = false
    setIsDragging(false)
    // Disable immediately on touchstart (before any move)
    disableChartPointerEvents()
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const touchX = e.touches[0].clientX
    const touchY = e.touches[0].clientY

    if (isDragGesture(startXRef.current, startYRef.current, touchX, touchY)) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true
        setIsDragging(true)
      }
    }
  }

  const handleTouchEnd = () => {
    if (isDraggingRef.current) {
      // Was a drag — clear Recharts active state WITHOUT remounting.
      // Dispatch a synthetic mouseleave on the Recharts surface to
      // clear activeDot/activeBar/tooltip/cursor. This avoids the
      // visual regeneration/reanimation caused by key-based remount.
      if (innerRef.current) {
        const surface = innerRef.current.querySelector('.recharts-surface') as Element | null
        if (surface) {
          surface.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
        }
      }
    }
    isDraggingRef.current = false
    setIsDragging(false)
    // Restore pointer events for next interaction (desktop hover, or
    // future tap if a chart adds onClick support).
    restoreChartPointerEvents()
  }

  // Pointer event handlers: on Android WebView, pointer events fire BEFORE
  // touch events. Recharts listens to pointermove for hover/activation.
  // We must disable pointer events on pointerdown (for touch pointers)
  // to prevent Recharts from receiving pointermove during scroll.
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only disable for touch pointers — mouse pointers need hover/tooltip
    if (e.pointerType === 'touch') {
      startXRef.current = e.clientX
      startYRef.current = e.clientY
      isDraggingRef.current = false
      setIsDragging(false)
      disableChartPointerEvents()
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if (isDragGesture(startXRef.current, startYRef.current, e.clientX, e.clientY)) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true
        setIsDragging(true)
      }
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if (isDraggingRef.current) {
      if (innerRef.current) {
        const surface = innerRef.current.querySelector('.recharts-surface') as Element | null
        if (surface) {
          surface.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
        }
      }
    }
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
      className="w-full h-full select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 rounded-lg [&_.recharts-surface]:outline-none [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-blue-500/30 [&_.recharts-wrapper]:outline-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      // Allow native scrolling in both axes; chart pointer events are
      // disabled on touchstart/pointerdown (inner div) to prevent drag-activated datum,
      // and restored on touchend/pointerup. The outer div still receives touch/pointer
      // events for scroll tracking.
      // Touch focus uses :focus (outline suppressed via class); keyboard
      // focus uses :focus-visible (ring shown) — preserving keyboard
      // accessibility. The [&_.recharts-surface] selector suppresses the
      // SVG outline on touch/mouse tap while preserving :focus-visible
      // for keyboard navigation.
      style={{
        touchAction: 'pan-y pan-x',
        pointerEvents: 'auto',
      }}
      data-chart-dragging={isDragging ? 'true' : undefined}
    >
      <div
        ref={innerRef}
        className="w-full h-full focus:outline-none"
        style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
      >
        {children}
      </div>
    </div>
  )
}

export { useTouchDevice } from './use-touch-device'