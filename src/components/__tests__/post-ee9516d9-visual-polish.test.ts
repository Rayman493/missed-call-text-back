import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const calendarPage = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const scheduleMap = readFileSync('src/components/schedule/ScheduleMap.tsx', 'utf8')
const todayCommandCenter = readFileSync('src/components/schedule/TodayCommandCenter.tsx', 'utf8')

// Extract the createNumberedMarkerIcon function definition
const markerFnStart = scheduleMap.indexOf('const createNumberedMarkerIcon = (stopNumber')
const markerFnEnd = scheduleMap.indexOf('const createMarkerShape = (iconSize')
const markerFn = markerFnStart >= 0 ? scheduleMap.substring(markerFnStart, markerFnEnd) : ''

// Extract the JobCard component from calendar page
const jobCardStart = calendarPage.indexOf('const JobCard = ({ job, variant }')
const jobCardEnd = calendarPage.indexOf('if (isLoading && !hasLoadedOnceRef.current)', jobCardStart)
const jobCardBlock = jobCardStart >= 0 ? calendarPage.substring(jobCardStart, jobCardEnd) : ''

// Extract PREMIUM_STOP_PALETTE from the full scheduleMap (it's defined outside markerFn)
const paletteStart = scheduleMap.indexOf('PREMIUM_STOP_PALETTE = [')
const paletteEnd = scheduleMap.indexOf(']', paletteStart)
const paletteBlock = paletteStart >= 0 ? scheduleMap.substring(paletteStart, paletteEnd + 1) : ''
const paletteColors = paletteBlock.match(/#[0-9A-Fa-f]{6}/g) || []

describe('Part 1 — Job Card Compact Edit Action', () => {
  it('JobCard receives onEditJob prop', () => {
    expect(jobCardBlock).toContain('onEditJob')
  })

  it('Edit button renders with Pencil icon', () => {
    expect(jobCardBlock).toContain('Pencil')
    expect(jobCardBlock).toContain('aria-label="Edit job"')
  })

  it('Edit button uses stopPropagation on click', () => {
    expect(jobCardBlock).toContain('e.stopPropagation()')
    expect(jobCardBlock).toContain('onEditJob(job)')
  })

  it('Edit button uses stopPropagation on keydown', () => {
    expect(jobCardBlock).toContain('e.stopPropagation(); onEditJob(job)')
  })

  it('card click still opens detail mode (onJobClick)', () => {
    expect(jobCardBlock).toContain("onClick={() => onJobClick(job)}")
  })

  it('card keyboard activation preserved (Enter and Space)', () => {
    expect(jobCardBlock).toContain("e.key === 'Enter' || e.key === ' '")
    expect(jobCardBlock).toContain('onJobClick(job)')
  })

  it('no View button restored', () => {
    expect(jobCardBlock).not.toContain('>View<')
  })

  it('status badge remains present', () => {
    expect(jobCardBlock).toContain('STATUS_COLORS[job.status]')
    expect(jobCardBlock).toContain('STATUS_LABELS[job.status]')
  })

  it('Edit is compact (text-[11px], no primary blue fill)', () => {
    expect(jobCardBlock).toContain('text-[11px]')
    expect(jobCardBlock).not.toContain('bg-blue-600')
  })

  it('Edit label hidden on mobile, icon-only on narrow widths', () => {
    expect(jobCardBlock).toContain('hidden sm:inline')
  })

  it('Edit is guarded by onEditJob existence', () => {
    expect(jobCardBlock).toContain('{onEditJob && (')
  })
})

describe('Part 2 — Premium Map Markers', () => {
  it('PREMIUM_STOP_PALETTE exists with at least 8 colors', () => {
    expect(paletteColors.length).toBeGreaterThanOrEqual(8)
  })

  it('Stop 1 and Stop 2 receive different colors', () => {
    const color1 = paletteColors[0]
    const color2 = paletteColors[1]
    expect(color1).not.toBe(color2)
  })

  it('adjacent palette entries differ', () => {
    for (let i = 0; i < paletteColors.length - 1; i++) {
      expect(paletteColors[i]).not.toBe(paletteColors[i + 1])
    }
  })

  it('palette cycles safely beyond palette length (modulo)', () => {
    expect(markerFn).toContain('% PREMIUM_STOP_PALETTE.length')
  })

  it('palette colors are deterministic (no random generation)', () => {
    expect(markerFn).not.toContain('Math.random()')
  })

  it('Job vs Appointment type distinction via subtle inner ring (not dashed)', () => {
    expect(markerFn).toContain('isAppointment')
    expect(markerFn).toContain('rgba(255,255,255,0.45)')
    expect(markerFn).not.toContain('setLineDash')
  })

  it('Jobs use solid white ring (inner ring only for appointments)', () => {
    expect(markerFn).toContain("if (isAppointment && !isBusiness)")
  })

  it('business marker remains distinct with green color', () => {
    expect(markerFn).toContain("#059669")
    expect(markerFn).toContain("isBusiness")
  })

  it('business marker uses vector home icon (not emoji)', () => {
    expect(markerFn).not.toContain('🏠')
    expect(markerFn).toContain('moveTo')
    expect(markerFn).toContain('lineTo')
  })

  it('selected marker is ~15% larger (42px vs 36px)', () => {
    expect(markerFn).toContain('isSelected ? 42 : 36')
  })

  it('selected marker has amber emphasis ring', () => {
    expect(markerFn).toContain('#F59E0B')
  })

  it('has white outer ring for satellite/map readability', () => {
    expect(markerFn).toContain("'#FFFFFF'")
  })

  it('has drop shadow for premium depth', () => {
    expect(markerFn).toContain('shadowColor')
    expect(markerFn).toContain('shadowBlur')
  })

  it('has inner highlight gradient for premium feel', () => {
    expect(markerFn).toContain('createLinearGradient')
    expect(markerFn).toContain('rgba(255,255,255,0.18)')
  })

  it('handles >99 stops with "99+" label', () => {
    expect(markerFn).toContain('99+')
  })

  it('number is bold and centered', () => {
    expect(markerFn).toContain('bold')
    expect(markerFn).toContain('textAlign')
    expect(markerFn).toContain('textBaseline')
  })

  it('STOP_COLOR_PALETTE still exists as fallback', () => {
    expect(scheduleMap).toContain('STOP_COLOR_PALETTE')
  })

  it('local-date marker fix preserved', () => {
    expect(scheduleMap).toContain("toLocaleDateString('en-CA')")
  })

  it('fitBounds preserved', () => {
    expect(scheduleMap).toContain('fitBounds')
  })

  it('markerIconCache preserved', () => {
    expect(scheduleMap).toContain('markerIconCache')
  })

  it('DPR-aware canvas rendering preserved', () => {
    expect(markerFn).toContain('devicePixelRatio')
    expect(markerFn).toContain('ctx.scale(dpr, dpr)')
  })

  it('marker shape scales with icon size', () => {
    const shapeFnStart = scheduleMap.indexOf('const createMarkerShape = (iconSize')
    const shapeFn = shapeFnStart >= 0 ? scheduleMap.substring(shapeFnStart, shapeFnStart + 500) : ''
    expect(shapeFn).toContain('iconSize / 2')
  })
})

describe('Part 3 — Agenda Typography Consistency', () => {
  it('Today card section title uses text-sm font-semibold', () => {
    expect(todayCommandCenter).toContain('text-sm font-semibold text-blue-900 dark:text-blue-100 leading-tight')
  })

  it('Today card date metadata uses text-xs (not text-[10px])', () => {
    expect(todayCommandCenter).toContain('text-xs text-blue-600/70 dark:text-blue-300/60 font-normal leading-tight')
  })

  it('Today card item title uses text-sm font-medium (not text-xs)', () => {
    expect(todayCommandCenter).toContain('text-sm font-medium text-foreground truncate')
  })

  it('Today card item time uses text-xs (not text-[10px])', () => {
    // The item time span uses text-xs with conditional overdue color
    expect(todayCommandCenter).toContain("item.isOverdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'")
    // Verify the surrounding span uses text-xs
    const timeIdx = todayCommandCenter.indexOf('{item.time}')
    const block = todayCommandCenter.substring(timeIdx - 120, timeIdx + 20)
    expect(block).toContain('text-xs')
  })

  it('Today card item customer uses text-xs (not text-[10px])', () => {
    expect(todayCommandCenter).toContain('text-xs text-muted-foreground')
  })

  it('Today card inline overdue badge uses text-[10px] (not text-[9px])', () => {
    // The overdue badge in Today items
    expect(todayCommandCenter).toContain('text-[10px] px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium flex-shrink-0')
  })

  it('no text-[9px] remains in TodayCommandCenter', () => {
    expect(todayCommandCenter).not.toContain('text-[9px]')
  })

  it('Today card edit icon uses w-3.5 h-3.5 (consistent with Needs Attention)', () => {
    // The Pencil icon size is after the aria-label (CRLF line endings need wider window)
    const editReminderIdx = todayCommandCenter.indexOf('aria-label="Edit reminder"')
    const block = todayCommandCenter.substring(editReminderIdx, editReminderIdx + 150)
    expect(block).toContain('w-3.5 h-3.5')
  })

  it('Today card job edit icon uses w-3.5 h-3.5', () => {
    const editJobIdx = todayCommandCenter.indexOf('aria-label="Edit job"')
    const block = todayCommandCenter.substring(editJobIdx, editJobIdx + 150)
    expect(block).toContain('w-3.5 h-3.5')
  })

  it('Today card "View" link uses text-xs (not text-[10px])', () => {
    expect(todayCommandCenter).toContain('text-xs text-blue-600 dark:text-blue-400 hover:underline')
  })

  it('Needs Attention section title uses text-sm font-semibold', () => {
    // First occurrence is in a comment; second is the h3 text content
    const firstIdx = todayCommandCenter.indexOf('Needs Attention')
    const secondIdx = todayCommandCenter.indexOf('Needs Attention', firstIdx + 1)
    expect(secondIdx).toBeGreaterThan(-1)
    const block = todayCommandCenter.substring(secondIdx - 120, secondIdx + 20)
    expect(block).toContain('text-sm font-semibold text-foreground')
  })

  it('Needs Attention item title uses text-sm font-medium', () => {
    // The task title in Needs Attention section
    expect(todayCommandCenter).toContain('text-sm font-medium text-foreground truncate">{task.title}')
  })

  it('Needs Attention overdue meta uses text-xs', () => {
    expect(todayCommandCenter).toContain('text-xs text-red-600 dark:text-red-400 mt-0.5')
  })

  it('Needs Attention overdue count badge uses text-[10px]', () => {
    // The overdue count badge in Needs Attention header
    expect(todayCommandCenter).toContain('text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium')
  })

  it('summary card titles all use text-sm font-semibold', () => {
    expect(todayCommandCenter).toContain('text-sm font-semibold text-foreground">Reminders')
    expect(todayCommandCenter).toContain('text-sm font-semibold text-foreground">Jobs')
    expect(todayCommandCenter).toContain('text-sm font-semibold text-foreground">Appointments')
  })

  it('summary card count text all use text-xs', () => {
    // All three summary cards use text-xs for their count/status line
    const countMatches = todayCommandCenter.match(/text-xs text-slate-500 dark:text-slate-400/g)
    expect(countMatches).not.toBeNull()
    expect(countMatches!.length).toBeGreaterThanOrEqual(3)
  })

  it('summary card View links all use text-xs font-medium', () => {
    expect(todayCommandCenter).toContain('text-xs text-blue-600 dark:text-blue-400 mt-auto pt-2 font-medium">View Reminders')
    expect(todayCommandCenter).toContain('text-xs text-blue-600 dark:text-blue-400 mt-auto pt-2 font-medium">View Jobs')
    expect(todayCommandCenter).toContain('text-xs text-blue-600 dark:text-blue-400 mt-auto pt-2 font-medium">View Appointments')
  })

  it('empty state uses text-sm for primary and text-xs for secondary', () => {
    expect(todayCommandCenter).toContain('text-sm font-medium text-slate-600 dark:text-slate-300 mb-0.5')
    expect(todayCommandCenter).toContain('text-xs text-slate-400 dark:text-slate-500')
  })
})

describe('Part 5 — Regression Safety', () => {
  it('six schedule tabs preserved', () => {
    expect(calendarPage).toContain("scheduleTab === 'agenda'")
    expect(calendarPage).toContain("scheduleTab === 'reminders'")
    expect(calendarPage).toContain("scheduleTab === 'jobs'")
    expect(calendarPage).toContain("scheduleTab === 'appointments'")
    expect(calendarPage).toContain("scheduleTab === 'calendar'")
    expect(calendarPage).toContain("scheduleTab === 'map'")
  })

  it('JobsTab onEditJob wired at page level', () => {
    expect(calendarPage).toContain('onEditJob={(job) => {')
    expect(calendarPage).toContain('setEditingJob(job)')
    expect(calendarPage).toContain('setIsJobComposerOpen(true)')
  })

  it('JobDetailsModal onEdit preserved', () => {
    expect(calendarPage).toContain('onEdit={(job) => { setEditingJob(job)')
  })

  it('Job Timer / time tracked display preserved', () => {
    expect(jobCardBlock).toContain('has_active_timer')
    expect(jobCardBlock).toContain('completed_ms')
    expect(jobCardBlock).toContain('formatDuration')
  })

  it('payment status badge preserved', () => {
    expect(jobCardBlock).toContain('PAYMENT_LABELS')
    expect(jobCardBlock).toContain('PAYMENT_COLORS')
    expect(jobCardBlock).toContain('paymentLabel')
  })

  it('Jobs grouping (active/completed/cancelled) preserved', () => {
    expect(calendarPage).toContain('variant="active"')
    expect(calendarPage).toContain('variant="completed"')
    expect(calendarPage).toContain('variant="cancelled"')
  })
})
