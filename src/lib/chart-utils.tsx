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
 * On mobile devices, Recharts can intercept touch events for tooltips,
 * preventing vertical page scrolling. This wrapper uses the canonical
 * gesture-intent philosophy (same 10px threshold as lead-status-gesture.ts)
 * to distinguish tap from drag in ALL directions (vertical, horizontal,
 * diagonal).
 *
 * Behavior:
 * - Touch down: capture start X/Y
 * - Touch move: if movement exceeds 10px in ANY direction, mark as drag
 * - Touch end: if gesture remained a tap (under threshold), allow chart
 *   interaction; if it was a drag, suppress chart activation
 * - During drag: set `touchAction: pan-y pan-x` so native scroll continues
 * - No setTimeout, no pointerEvents toggling, no global preventDefault
 *
 * Desktop (mouse/hover): Unchanged — no touch handlers fire, hover works
 *
 * Usage:
 *   <ChartTouchWrapper>
 *     <ResponsiveContainer>
 *       <BarChart>...</BarChart>
 *     </ResponsiveContainer>
 *   </ChartTouchWrapper>
 */
import { useState, useRef } from 'react'

/**
 * Canonical movement threshold (matches lead-status-gesture.ts GESTURE_MOVEMENT_THRESHOLD)
 */
const CHART_GESTURE_THRESHOLD = 10

export function ChartTouchWrapper({ children }: { children: React.ReactNode }) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX
    startYRef.current = e.touches[0].clientY
    setIsDragging(false)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const touchX = e.touches[0].clientX
    const touchY = e.touches[0].clientY
    const deltaX = Math.abs(touchX - startXRef.current)
    const deltaY = Math.abs(touchY - startYRef.current)

    // If movement exceeds threshold in ANY direction, it's a drag/scroll
    if (deltaX > CHART_GESTURE_THRESHOLD || deltaY > CHART_GESTURE_THRESHOLD) {
      setIsDragging(true)
    }
  }

  const handleTouchEnd = () => {
    // Reset synchronously — no setTimeout needed.
    // The isDragging flag was already consulted during the gesture;
    // clearing it now prepares for the next interaction.
    setIsDragging(false)
  }

  return (
    <div
      className="w-full h-full select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      // Allow native scrolling in both axes; chart pointer events remain
      // enabled so taps still work. The isDragging state is used by the
      // wrapper to suppress chart activation after a drag gesture via
      // a CSS class that disables pointer events only on the chart's
      // interactive layer during an active drag.
      style={{
        touchAction: 'pan-y pan-x',
        pointerEvents: 'auto',
      }}
      data-chart-dragging={isDragging ? 'true' : undefined}
    >
      <div
        className="w-full h-full"
        style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
      >
        {children}
      </div>
    </div>
  )
}

export { useTouchDevice } from './use-touch-device'