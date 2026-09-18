/**
 * Shared chart utilities for premium dashboard analytics
 *
 * Provides:
 * - Currency formatters for Y-axis labels (compact)
 * - Integer tick helpers for count-based metrics
 * - Premium tooltip component
 * - Common chart styling constants
 * - Mobile touch scroll protection + horizontal scrub wrapper
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
    <div className="bg-card border border-border/50 rounded-lg shadow-lg px-2 py-1.5 w-fit max-w-[min(70vw,220px)]">
      {label && (
        <p className="text-[11px] font-semibold text-foreground mb-1">{label}</p>
      )}
      <div className="space-y-0.5">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color || entry.payload?.fill || 'hsl(var(--primary))' }}
              />
              <span className="text-muted-foreground truncate max-w-[120px]" title={entry.name || entry.dataKey}>{entry.name || entry.dataKey}</span>
            </div>
            <span className="font-medium text-foreground tabular-nums pl-1">
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
 * Floating contextual popup for a selected chart datum.
 * Appears inside the chart area and is dismissed by clearing the selection.
 */
export function ChartDatumPopup({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      style={style}
      className={
        "absolute top-2 z-10 bg-card border border-border/50 rounded-lg shadow-lg px-3 py-2 max-w-[min(70vw,220px)] " +
        (className || '')
      }
    >
      {children}
    </div>
  )
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
 * ChartTouchWrapper - Mobile touch interaction for Recharts
 *
 * Axis-aware gesture detection:
 * - VERTICAL movement → page scroll (native, no datum selection)
 * - HORIZONTAL movement → chart scrub (nearest datum follows finger)
 * - LOW movement → tap (select nearest datum)
 *
 * The wrapper does NOT use tabIndex (removes the giant white focus rectangle
 * on Android). Keyboard accessibility is preserved on individual data
 * elements (bars, dots, slices) via globals.css :focus-visible rules.
 *
 * Desktop (mouse/hover): Unchanged — pointer handlers only fire on touch
 * pointers; hover tooltips work normally.
 *
 * Usage:
 *   <ChartTouchWrapper data={data} onActiveIndex={setActiveIndex}>
 *     <ResponsiveContainer>
 *       <LineChart>...</LineChart>
 *     </ResponsiveContainer>
 *   </ChartTouchWrapper>
 */
import { useState, useRef, useCallback } from 'react'
import { GESTURE_MOVEMENT_THRESHOLD } from '@/lib/gesture/tap-guard'

/**
 * Mobile-safe chart body wrapper.
 *
 * Recharts v3 installs a global touch-events middleware that intercepts
 * touchstart/touchmove/touchend on every chart surface, even when no tooltip or
 * touch interaction is desired. On mobile WebKit/WebView this middleware can
 * hijack native page scrolling, producing the "sticky" vertical-swipe
 * regression reported on Android QA.
 *
 * ChartPassiveTouchSurface stops those synthetic events in the capture phase
 * before they reach Recharts, while declaring `touch-action: pan-y` on the
 * wrapper so the browser continues to scroll the page. Mouse/pointer events are
 * untouched, so desktop hover tooltips remain fully functional.
 */
export function ChartPassiveTouchSurface({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const stopTouchPropagation = useCallback((e: React.TouchEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <div
      className={className}
      style={{ touchAction: 'pan-y' }}
      onTouchStartCapture={stopTouchPropagation}
      onTouchMoveCapture={stopTouchPropagation}
      onTouchEndCapture={stopTouchPropagation}
    >
      {children}
    </div>
  )
}

/**
 * Per-datum touch target for tap-to-inspect selection on line charts.
 *
 * ChartPassiveTouchSurface deliberately stops Recharts' touch middleware, so
 * chart-level `onClick`/`activeTooltipIndex` never resolves on Android. The
 * synthesized click event still reaches SVG children, so each datum renders an
 * invisible 14px-radius hit circle that owns its own click — no reliance on
 * Recharts touch tracking, no overlay that would block vertical scrolling.
 */
export function ChartHitDot({
  cx,
  cy,
  index,
  onSelect,
  fill = 'transparent',
  visible = false,
}: {
  cx?: number
  cy?: number
  index: number
  onSelect: (index: number) => void
  fill?: string
  visible?: boolean
}) {
  if (typeof cx !== 'number' || typeof cy !== 'number') return null
  return (
    <g
      onClick={(e) => {
        e.stopPropagation()
        onSelect(index)
      }}
      style={{ cursor: 'pointer' }}
    >
      <circle cx={cx} cy={cy} r={14} fill="transparent" />
      {visible && <circle cx={cx} cy={cy} r={4} fill={fill} />}
    </g>
  )
}

type GestureMode = 'idle' | 'vertical' | 'horizontal'

/**
 * Axis dominance margin (px). The leading axis must outpace the other by at
 * least this much before the chart claims horizontal ownership. First-move
 * touch deltas are noisy near the 10px threshold — without a dominance margin,
 * a vertical-intent scroll that crosses the threshold lateral-first gets
 * locked into chart mode for the whole gesture (pointer-events flip, datum
 * activation, suppressed follow-up click).
 */
const GESTURE_AXIS_MARGIN = 4

/**
 * If a gesture travels this far without a dominant axis, ownership resolves
 * to vertical (page scroll). A long ambiguous diagonal drag must never claim
 * the chart or activate a datum.
 */
const GESTURE_AMBIGUOUS_DISTANCE = GESTURE_MOVEMENT_THRESHOLD * 2

/**
 * Classify a touch gesture by dominant axis.
 * Returns null while undecided (below threshold or within the ambiguity band)
 * — an undecided gesture must never preventDefault, capture, or activate.
 */
function classifyGestureAxis(deltaX: number, deltaY: number): GestureMode | null {
  if (deltaX <= GESTURE_MOVEMENT_THRESHOLD && deltaY <= GESTURE_MOVEMENT_THRESHOLD) {
    return null
  }
  const dominance = deltaX - deltaY
  if (dominance >= GESTURE_AXIS_MARGIN) return 'horizontal'
  if (dominance <= -GESTURE_AXIS_MARGIN) return 'vertical'
  return Math.max(deltaX, deltaY) > GESTURE_AMBIGUOUS_DISTANCE ? 'vertical' : null
}

interface ChartTouchWrapperProps {
  children: React.ReactNode
  /** Chart data array (used to map X position → nearest datum index) */
  data?: any[]
  /** Called when the active datum index changes (tap or scrub) */
  onActiveIndexChange?: (index: number | null) => void
  /**
   * Chart type determines how clean taps are interpreted:
   * - 'line' (default): synthetic mousemove + nearest-index selection
   * - 'bar' / 'pie': rely on Recharts' own onClick handlers for datum selection;
   *                  wrapper only handles scroll ownership and post-drag click suppression
   */
  chartType?: 'line' | 'bar' | 'pie'
}

export function ChartTouchWrapper({ children, data, onActiveIndexChange, chartType = 'line' }: ChartTouchWrapperProps) {
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const gestureModeRef = useRef<GestureMode>('idle')
  const innerRef = useRef<HTMLDivElement>(null)
  const justDraggedRef = useRef(false)
  const lastPointerTypeRef = useRef<string>('mouse')
  const [isScrubbing, setIsScrubbing] = useState(false)

  /**
   * Map a client X coordinate to the nearest data index by measuring
   * the actual rendered plot area bounds. This avoids requiring exact
   * dot hit-testing — the user can tap anywhere on the chart.
   */
  const getNearestIndex = useCallback((clientX: number, clamp = true): number | null => {
    if (!data || data.length === 0 || !innerRef.current) return null

    const surface = innerRef.current.querySelector('.recharts-surface') as SVGElement | null
    if (!surface) return null

    const rect = surface.getBoundingClientRect()
    // Recharts plot area has internal margins (CHART_STYLES.margin). The
    // actual plotting region is inset from the surface bounds. We use
    // the surface rect and account for the left margin to map X → index.
    const marginLeft = 12 // CHART_STYLES.margin.left
    const marginRight = 12 // CHART_STYLES.margin.right
    const plotLeft = rect.left + marginLeft
    const plotWidth = rect.width - marginLeft - marginRight

    if (plotWidth <= 0) return null

    const relativeX = clientX - plotLeft
    if (!clamp) {
      if (relativeX < 0 || relativeX > plotWidth) return null
    }
    // Clamp to plot bounds
    const clampedX = Math.max(0, Math.min(plotWidth, relativeX))
    const ratio = clampedX / plotWidth
    const index = Math.round(ratio * (data.length - 1))
    return Math.max(0, Math.min(data.length - 1, index))
  }, [data])

  /**
   * Activate a datum by dispatching a synthetic mousemove + mouseleave cycle
   * on the Recharts surface. Recharts' Tooltip responds to mousemove events
   * with clientX/clientY coordinates. We compute the pixel position of the
   * target datum and dispatch a mousemove at that location.
   */
  const activateDatum = useCallback((index: number) => {
    if (!innerRef.current || !data || index < 0 || index >= data.length) return

    const surface = innerRef.current.querySelector('.recharts-surface') as SVGElement | null
    if (!surface) return

    const rect = surface.getBoundingClientRect()
    const marginLeft = 12
    const marginRight = 12
    const plotWidth = rect.width - marginLeft - marginRight
    const ratio = data.length > 1 ? index / (data.length - 1) : 0.5
    const targetX = rect.left + marginLeft + ratio * plotWidth
    const targetY = rect.top + rect.height / 2

    // Dispatch mousemove to activate Recharts tooltip at the computed position
    const mouseMove = new MouseEvent('mousemove', {
      bubbles: true,
      clientX: targetX,
      clientY: targetY,
    })
    surface.dispatchEvent(mouseMove)
  }, [data])

  const clearRechartsState = useCallback(() => {
    if (!innerRef.current) return
    const surface = innerRef.current.querySelector('.recharts-surface') as Element | null
    if (surface) {
      surface.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
      try {
        surface.dispatchEvent(new TouchEvent('touchend', { bubbles: true }))
      } catch {
        // TouchEvent constructor not available in all environments (JSDOM)
      }
    }
    const wrapper = innerRef.current.querySelector('.recharts-wrapper') as Element | null
    if (wrapper) {
      wrapper.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    }
  }, [])

  // --- Touch handlers (primary on Android WebView) ---

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    lastPointerTypeRef.current = 'touch'
    startXRef.current = e.touches[0].clientX
    startYRef.current = e.touches[0].clientY
    gestureModeRef.current = 'idle'
    setIsScrubbing(false)
    justDraggedRef.current = false
  }

  const handleTouchMoveCapture = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const touchX = e.touches[0].clientX
    const touchY = e.touches[0].clientY
    const deltaX = Math.abs(touchX - startXRef.current)
    const deltaY = Math.abs(touchY - startYRef.current)

    // Classify gesture once movement exceeds threshold — but only when one
    // axis clearly dominates. Ambiguous deltas stay unowned so the browser's
    // native scroll is never contested.
    if (gestureModeRef.current === 'idle') {
      const mode = classifyGestureAxis(deltaX, deltaY)
      if (!mode) return
      gestureModeRef.current = mode
      if (mode === 'horizontal') {
        setIsScrubbing(true)
        // Disable pointer events on the chart so Recharts doesn't fight
        // our scrub with its own touch handlers
        if (innerRef.current) {
          innerRef.current.style.pointerEvents = 'none'
        }
      } else {
        // Vertical scroll — clear any transient Recharts state once, then
        // stop propagation so Recharts' own touch handlers cannot claim the
        // gesture. We never preventDefault; the page scrolls natively.
        clearRechartsState()
        e.stopPropagation()
      }
    }

    if (gestureModeRef.current === 'vertical') {
      // Page owns this gesture — no preventDefault, no pointer capture,
      // no datum selection. Stop propagation on every vertical move so
      // Recharts never sees it while we remain in this mode.
      e.stopPropagation()
      return
    }

    if (gestureModeRef.current === 'horizontal') {
      // Horizontal scrub — map finger X to nearest datum
      e.preventDefault()
      e.stopPropagation()
      const idx = getNearestIndex(touchX)
      if (idx !== null) {
        activateDatum(idx)
        onActiveIndexChange?.(idx)
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const mode = gestureModeRef.current

    if (mode === 'horizontal') {
      // Scrub ended — keep the last datum active (do not clear tooltip)
      justDraggedRef.current = true
      setIsScrubbing(false)
      if (innerRef.current) {
        innerRef.current.style.pointerEvents = 'auto'
      }
    } else if (mode === 'vertical') {
      // Vertical scroll ended — clear any Recharts state
      clearRechartsState()
      justDraggedRef.current = true
    } else {
      // idle = tap. Let Recharts' own click handler fire to select the
      // nearest datum. Do NOT suppress the click.
      // We do NOT set justDraggedRef so the click reaches Recharts.
    }

    gestureModeRef.current = 'idle'
  }

  const handleTouchCancel = () => {
    // Browser took over the gesture (native scroll or interruption): reset all
    // ownership state so a later touch starts clean and the inner chart never
    // stays pointer-events:none, which would eat subsequent taps/scrubs.
    gestureModeRef.current = 'idle'
    setIsScrubbing(false)
    justDraggedRef.current = false
    if (innerRef.current) {
      innerRef.current.style.pointerEvents = 'auto'
    }
  }

  // --- Pointer handlers (fire before touch on some Android WebViews) ---

  const handlePointerDown = (e: React.PointerEvent) => {
    lastPointerTypeRef.current = e.pointerType
    if (e.pointerType !== 'touch') return
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    gestureModeRef.current = 'idle'
    setIsScrubbing(false)
    justDraggedRef.current = false
  }

  const handlePointerMoveCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if (gestureModeRef.current === 'vertical') {
      // Page owns this gesture — stop propagation so Recharts cannot claim it,
      // but never preventDefault; the page scrolls natively.
      e.stopPropagation()
      return
    }
    if (gestureModeRef.current === 'horizontal') {
      e.preventDefault()
      e.stopPropagation()
      const idx = getNearestIndex(e.clientX)
      if (idx !== null) {
        activateDatum(idx)
        onActiveIndexChange?.(idx)
      }
      return
    }

    // idle — classify by dominant axis; ambiguous stays unowned
    const deltaX = Math.abs(e.clientX - startXRef.current)
    const deltaY = Math.abs(e.clientY - startYRef.current)
    const mode = classifyGestureAxis(deltaX, deltaY)
    if (!mode) return
    gestureModeRef.current = mode
    if (mode === 'vertical') {
      // Stop this move from reaching Recharts; subsequent vertical moves are
      // also stopped above. Browser scroll remains unaffected.
      clearRechartsState()
      e.stopPropagation()
    } else {
      setIsScrubbing(true)
      if (innerRef.current) {
        innerRef.current.style.pointerEvents = 'none'
      }
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    const mode = gestureModeRef.current

    if (mode === 'horizontal') {
      justDraggedRef.current = true
      setIsScrubbing(false)
      if (innerRef.current) {
        innerRef.current.style.pointerEvents = 'auto'
      }
    } else if (mode === 'vertical') {
      clearRechartsState()
      justDraggedRef.current = true
    }
    // idle = tap → let click reach Recharts

    gestureModeRef.current = 'idle'
  }

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    gestureModeRef.current = 'idle'
    setIsScrubbing(false)
    justDraggedRef.current = false
    if (innerRef.current) {
      innerRef.current.style.pointerEvents = 'auto'
    }
    clearRechartsState()
    onActiveIndexChange?.(null)
  }

  // Capture-phase click handler:
  // - Suppresses exactly ONE synthesized click after a touch drag/scrub.
  // - Lets a clean touch tap continue to Recharts' own onClick handlers (so
  //   pie/bar segments can toggle selection).
  // - For line charts, also activates the hover-based tooltip/activeDot via a
  //   synthetic mousemove. Bar/pie charts rely on their own onClick handlers.
  // - Desktop mouse input is left untouched.
  const handleClickCapture = (e: React.MouseEvent) => {
    if (lastPointerTypeRef.current !== 'touch') {
      // Desktop: never suppress; Recharts hover/click works normally.
      if (justDraggedRef.current) {
        justDraggedRef.current = false
      }
      return
    }

    if (justDraggedRef.current) {
      // Scrub/scroll just finished — suppress the single post-gesture click.
      e.preventDefault()
      e.stopPropagation()
      justDraggedRef.current = false
      return
    }

    if (chartType === 'bar' || chartType === 'pie') {
      // Bar/pie selection is handled by Recharts' own onClick handlers. The
      // wrapper only clears state when tapping on a non-data target (so the
      // consumer's outer clear handler can deselect if desired).
      return
    }

    // Clean touch tap on a line chart: map to nearest datum and activate tooltip.
    const idx = getNearestIndex(e.clientX, false)
    if (idx === null) {
      // Whitespace or outside the plottable area: clear any active tooltip.
      clearRechartsState()
      onActiveIndexChange?.(null)
      return
    }

    onActiveIndexChange?.(idx)
    activateDatum(idx)
  }

  return (
    <div
      // NO tabIndex — removes the giant white focus rectangle on Android.
      // Keyboard accessibility is preserved on individual data elements
      // (bars, dots, slices) via globals.css :focus-visible rules.
      className="w-full h-full select-none rounded-lg [-webkit-tap-highlight-color:transparent] [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-bar-rectangles]:outline-none [&_.recharts-bar-rectangle]:outline-none [&_.recharts-bar]:outline-none [&_.recharts-pie-sector]:outline-none [&_.recharts-line-dot]:outline-none [&_.recharts-surface]:[-webkit-tap-highlight-color:transparent] [&_.recharts-wrapper]:[-webkit-tap-highlight-color:transparent]"
      onTouchStart={handleTouchStart}
      onTouchMoveCapture={handleTouchMoveCapture}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onPointerDown={handlePointerDown}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClickCapture={handleClickCapture}
      style={{
        touchAction: 'pan-y',
        pointerEvents: 'auto',
        WebkitTapHighlightColor: 'transparent',
      }}
      data-chart-scrubbing={isScrubbing ? 'true' : undefined}
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
