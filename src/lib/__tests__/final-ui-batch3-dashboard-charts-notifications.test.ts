/**
 * FINAL UI/UX BURN-DOWN — BATCH 3
 * Dashboard + Charts + Notifications Polish
 *
 * Covers the six physically reproduced issues:
 *   A. Dashboard Activity icon tiles washed out in light mode
 *   B. Chart selection popup indicator must match selected data color
 *   C. Notification preview sentence casing (display-only)
 *   D. Notifications page action button semantic colors
 *   E. Desktop Dashboard main scrollbar ~2x thicker
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { capitalizeFirstAlpha } from '@/lib/utils'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const activitySrc = readSrc('src/components/RecentActivityCard.tsx')
const chartUtilsSrc = readSrc('src/lib/chart-utils.tsx')
const pipelineSrc = readSrc('src/components/analytics/CustomerPipelineGraph.tsx')
const statusGraphSrc = readSrc('src/components/analytics/CustomersStatusGraph.tsx')
const newCustomersSrc = readSrc('src/components/analytics/NewCustomersGraph.tsx')
const activityGraphSrc = readSrc('src/components/analytics/BusinessActivityGraph.tsx')
const analyticsContentSrc = readSrc('src/app/analytics/AnalyticsContent.tsx')
const notifPageSrc = readSrc('src/app/dashboard/notifications/page.tsx')
const navbarNotifSrc = readSrc('src/components/NavbarNotifications.tsx')
const globalsCss = readSrc('src/app/globals.css')

const SEMANTIC_COLORS = ['blue', 'teal', 'emerald', 'amber', 'red', 'violet', 'green', 'purple']

// ============================================================================
// A. ACTIVITY ICON TILES — LIGHT-MODE CONTRAST
// ============================================================================
describe('A. Activity icon tiles — stronger light-mode treatment, dark preserved', () => {
  it('every semantic tile uses a light-mode tinted background', () => {
    for (const c of SEMANTIC_COLORS) {
      expect(activitySrc).toContain(`bg-${c}-100 dark:bg-${c}-500/20`)
    }
  })

  it('every semantic tile uses a stronger light-mode foreground', () => {
    for (const c of SEMANTIC_COLORS) {
      expect(activitySrc).toContain(`text-${c}-600 dark:text-${c}-400`)
    }
  })

  it('dark mode treatment preserved (500/20 bg + 400 fg under dark:)', () => {
    for (const c of SEMANTIC_COLORS) {
      expect(activitySrc).toContain(`dark:bg-${c}-500/20`)
      expect(activitySrc).toContain(`dark:text-${c}-400`)
    }
  })

  it('no leftover single-mode washed-out tile classes', () => {
    const tileLines = activitySrc.split('\n').filter(l => /iconBgColor:|iconTextColor:/.test(l) && !/: string/.test(l))
    expect(tileLines.length).toBeGreaterThan(0)
    for (const line of tileLines) {
      if (/iconBgColor/.test(line)) expect(line).toMatch(/dark:bg-/)
      if (/iconTextColor/.test(line)) expect(line).toMatch(/dark:text-/)
    }
  })

  it('semantic type→icon/color mapping unchanged (same icon component count)', () => {
    // Icon tiles still render w-4 h-4 lucide icons inside a 9x9 rounded tile
    expect(activitySrc).toContain('w-9 h-9 rounded-lg')
    expect((activitySrc.match(/iconBgColor:/g) || []).length).toBeGreaterThanOrEqual(15)
  })
})

// ============================================================================
// B. CHART POPUP COLOR MATCHES SELECTED DATA
// ============================================================================
describe('B. Popup indicator inherits canonical selected color', () => {
  it('PremiumTooltip falls back to the datum color before generic primary', () => {
    expect(chartUtilsSrc).toContain("entry.color || entry.payload?.color || entry.payload?.fill || 'hsl(var(--primary))'")
  })

  it('Customer Workflow (pipeline) passes the selected bar color', () => {
    expect(pipelineSrc).toContain('color: selectedDatum.color')
  })

  it('Customers by Status passes the selected bar color', () => {
    expect(statusGraphSrc).toContain('color: selectedDatum.color')
  })

  it('Active/Scheduled/Completed statuses own canonical hex colors', () => {
    const statusSrc = readSrc('src/lib/customer-status.ts')
    expect(statusSrc).toContain("'#22C55E'") // active → green
    expect(statusSrc).toContain("'#A855F7'") // scheduled → purple
    expect(statusSrc).toContain("'#94A3B8'") // completed → gray
  })

  it('multi-series engagement chart plumbs the clicked SERIES color', () => {
    // toggleDatum payload uses SERIES_COLORS[seriesKey] for exact-hit dots
    expect(activityGraphSrc).toContain('color: SERIES_COLORS[seriesKey]')
    expect(activityGraphSrc).toContain('color: SERIES_COLORS[key]')
  })

  it('New Customers popup indicator matches its bar fill', () => {
    expect(newCustomersSrc).toContain('fill="hsl(var(--primary))"')
    expect(newCustomersSrc).toContain("color: 'hsl(var(--primary))'")
  })

  it('Analytics trend popups carry the rendered bar color', () => {
    expect(analyticsContentSrc).toContain('const selectionColor = color === \'blue\' ? \'#3b82f6\' : \'#22c55e\'')
    expect(analyticsContentSrc).toContain('color: selectionColor')
  })

  it('popup surface remains neutral (card background, no data color)', () => {
    const popupIdx = chartUtilsSrc.indexOf('export function ChartSelectionPopup')
    const popupBlock = chartUtilsSrc.substring(popupIdx, popupIdx + 2500)
    expect(popupBlock).toContain('bg-card/95')
    expect(popupBlock).not.toContain('backgroundColor: v.color }\n      className="absolute')
  })

  it('popup validity guard preserved (label + meaningful value required)', () => {
    const popupIdx = chartUtilsSrc.indexOf('export function ChartSelectionPopup')
    const popupBlock = chartUtilsSrc.substring(popupIdx, popupIdx + 1500)
    expect(popupBlock).toContain('if (!label || !values.some((v) => v.label && v.value != null))')
  })

  it('whitespace dismiss + exact-hit selection preserved', () => {
    // Pipeline/status whitespace dismiss via .recharts-bar-rectangle check
    expect(pipelineSrc).toContain("closest?.('.recharts-bar-rectangle')")
    expect(statusGraphSrc).toContain("closest?.('.recharts-bar-rectangle')")
    // Exact per-datum hit dots in the multi-series chart
    expect(activityGraphSrc).toContain('dataKey: seriesKey')
    expect(activityGraphSrc).toContain('ChartHitDot')
    // Tap tolerance constant still drives whitespace rejection
    expect(chartUtilsSrc).toContain('tapHitTolerance: 18')
  })
})

// ============================================================================
// C. NOTIFICATION SENTENCE CASING — DISPLAY-ONLY
// ============================================================================
describe('C. Notification message sentence casing', () => {
  it('lowercase message capitalizes first alphabetical character', () => {
    expect(capitalizeFirstAlpha('fix a broken bathroom faucet')).toBe('Fix a broken bathroom faucet')
  })

  it('first alpha char capitalizes even after leading digits', () => {
    expect(capitalizeFirstAlpha('123 main st')).toBe('123 Main st')
  })

  it('already-capitalized message unchanged', () => {
    expect(capitalizeFirstAlpha('Fix a faucet')).toBe('Fix a faucet')
  })

  it('internal casing / brand names preserved', () => {
    expect(capitalizeFirstAlpha('iPhone repair')).toBe('iPhone repair')
    expect(capitalizeFirstAlpha('HVAC repair')).toBe('HVAC repair')
  })

  it('nullish values safe', () => {
    expect(capitalizeFirstAlpha('')).toBe('')
    expect(capitalizeFirstAlpha(null)).toBe('')
    expect(capitalizeFirstAlpha(undefined)).toBe('')
  })

  it('notifications page applies the formatter at the display layer', () => {
    expect(notifPageSrc).toContain("import { capitalizeFirstAlpha } from '@/lib/utils'")
    const fnIdx = notifPageSrc.indexOf('const getDisplayMessage')
    const fnBlock = notifPageSrc.substring(fnIdx, fnIdx + 900)
    expect(fnBlock).toContain('capitalizeFirstAlpha')
    // Source object not mutated — no assignment back to notification.message
    expect(fnBlock).not.toContain('notification.message =')
  })

  it('dropdown preview applies the same formatter', () => {
    expect(navbarNotifSrc).toContain('capitalizeFirstAlpha(notification.message)')
  })
})

// ============================================================================
// D. NOTIFICATION ACTION BUTTON SEMANTIC COLORS
// ============================================================================
describe('D. Mark all as read / Clear all semantic styling', () => {
  it('Mark all as read uses blue secondary tint (desktop + mobile pairs)', () => {
    const occurrences = notifPageSrc.split('bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400').length - 1
    expect(occurrences).toBe(2) // desktop row + mobile row
  })

  it('Clear all uses restrained destructive tint (desktop + mobile pairs)', () => {
    const occurrences = notifPageSrc.split('bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400').length - 1
    expect(occurrences).toBe(2)
  })

  it('both buttons keep hover + focus-visible states', () => {
    expect(notifPageSrc).toContain('hover:bg-blue-100 dark:hover:bg-blue-500/20')
    expect(notifPageSrc).toContain('focus-visible:ring-2 focus-visible:ring-blue-500/40')
    expect(notifPageSrc).toContain('hover:bg-red-100 dark:hover:bg-red-500/20')
    expect(notifPageSrc).toContain('focus-visible:ring-2 focus-visible:ring-red-500/40')
  })

  it('disabled states and handlers unchanged', () => {
    expect(notifPageSrc).toContain('disabled:opacity-40 disabled:cursor-not-allowed')
    expect(notifPageSrc).toContain('disabled={notificationCount.unread === 0}')
    expect(notifPageSrc).toContain('disabled={notifications.length === 0}')
    expect(notifPageSrc).toContain('onClick={handleMarkAllAsRead}')
    expect(notifPageSrc).toContain('onClick={handleClearAll}')
  })

  it('dark mode variants present on both actions', () => {
    expect(notifPageSrc).toContain('dark:bg-blue-500/10')
    expect(notifPageSrc).toContain('dark:text-blue-400')
    expect(notifPageSrc).toContain('dark:bg-red-500/10')
    expect(notifPageSrc).toContain('dark:text-red-400')
  })

  it('dropdown Mark all as read uses blue accent', () => {
    expect(navbarNotifSrc).toContain('text-blue-600 dark:text-blue-400 hover:text-blue-700')
    expect(navbarNotifSrc).toContain('hover:bg-blue-500/10')
  })
})

// ============================================================================
// E. DESKTOP DASHBOARD SCROLLBAR WIDTH
// ============================================================================
describe('E. Desktop main scrollbar ~2x wider, scoped to fine pointers', () => {
  const finePointerIdx = globalsCss.indexOf('@media (hover: hover) and (pointer: fine)')
  const coarsePointerIdx = globalsCss.indexOf('@media (hover: none) and (pointer: coarse)')
  const desktopBlock = globalsCss.substring(finePointerIdx, coarsePointerIdx)

  it('desktop body scrollbar width increased from 11px to ~2x', () => {
    const bodyIdx = desktopBlock.indexOf('body::-webkit-scrollbar')
    const bodyBlock = desktopBlock.substring(bodyIdx, bodyIdx + 120)
    expect(bodyBlock).toContain('width: 20px')
    expect(bodyBlock).not.toContain('width: 11px')
  })

  it('light-mode desktop scrollbar matches the new width', () => {
    const lightIdx = desktopBlock.indexOf('html.light body::-webkit-scrollbar')
    const lightBlock = desktopBlock.substring(lightIdx, lightIdx + 120)
    expect(lightBlock).toContain('width: 20px')
  })

  it('increase is scoped to the fine-pointer (desktop) media query', () => {
    expect(finePointerIdx).toBeGreaterThan(-1)
    expect(coarsePointerIdx).toBeGreaterThan(finePointerIdx)
    // The 20px width only exists inside the fine-pointer block
    expect(desktopBlock).toContain('width: 20px')
  })

  it('mobile/coarse-pointer scrollbar unaffected (still 6px thin)', () => {
    const mobileBlock = globalsCss.substring(coarsePointerIdx, coarsePointerIdx + 1500)
    expect(mobileBlock).toContain('width: 6px')
    expect(mobileBlock).not.toContain('width: 20px')
  })

  it('generic *::-webkit-scrollbar (modals/dropdowns) untouched at 12px', () => {
    const genericIdx = globalsCss.indexOf('*::-webkit-scrollbar')
    const genericBlock = globalsCss.substring(genericIdx, genericIdx + 120)
    expect(genericBlock).toContain('width: 12px')
  })

  it('rounded thumb + understated track preserved', () => {
    expect(desktopBlock).toContain('border-radius: 999px')
    expect(desktopBlock).toContain('linear-gradient(180deg, rgba(96, 165, 250, 0.6), rgba(34, 211, 238, 0.45))')
    expect(desktopBlock).toContain('scrollbar-width: auto')
  })
})
