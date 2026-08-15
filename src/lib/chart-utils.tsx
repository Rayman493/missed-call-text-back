/**
 * Shared chart utilities for premium dashboard analytics
 *
 * Provides:
 * - Currency formatters for Y-axis labels
 * - Integer tick helpers for count-based metrics
 * - Premium tooltip component
 * - Common chart styling constants
 */

/**
 * Format currency value for display
 * Handles cents, thousands, and appropriate precision
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
    return formatCurrency(value)
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