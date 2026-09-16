/**
 * RC Final — Details Modal Height / Viewport Sizing Contract
 *
 * Physical QA found Appointment/Event Details (all entry points incl.
 * Map -> marker -> View details) and Job Details rendered as near-full-screen
 * sheets on Android: the shared --modal-max-height token (calc(100dvh - 32px))
 * exceeded the safe-area-padded backdrop box, so the centered shell overflowed
 * into the status-bar/app-chrome zone at top and the OS navigation zone at
 * bottom, and the ~96dvh cap made moderate-length details content feel
 * full-height.
 *
 * Fix contract:
 * - Both details shells use the shared --details-modal-max-height token which
 *   subtracts the bottom app-chrome band (shared --bottom-nav-height), both
 *   OS safe-area insets, and breathing room -> always inside the padded box.
 * - Shell stays content-sized (max-h is a cap, not a height).
 * - Body scrolls internally only when content exceeds the cap.
 * - Header/footer are shrink-0; no mt-auto pinning.
 * - Shared Modal / Edit Customer / Request Details keep the unchanged
 *   --modal-max-height contract.
 * - Map "View details" delegates to the same components; ScheduleMap unchanged.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const globalsCss = readSrc('src/app/globals.css')
const eventDetailsModal = readSrc('src/components/calendar/EventDetailsModal.tsx')
const jobDetailsModal = readSrc('src/components/jobs/JobDetailsModal.tsx')
const sharedModal = readSrc('src/components/ui/Modal.tsx')
const scheduleMap = readSrc('src/components/schedule/ScheduleMap.tsx')
const calendarPage = readSrc('src/app/dashboard/calendar/page.tsx')
const editCustomerModal = readSrc('src/components/EditCustomerModal.tsx')
const requestDetailsModal = readSrc('src/components/RequestDetailsModal.tsx')

// ============================================================================
// 1-2. MODERATE CONTENT — no forced full/max height (content-sized shell)
// ============================================================================

describe('MODERATE CONTENT: shells are content-sized, not height-forced', () => {
  it('Event Details shell is capped, not height-forced', () => {
    // max-h is a cap; there is no h-full / min-h / height:100% forcing on the shell
    expect(eventDetailsModal).toContain('max-h-[var(--details-modal-max-height)]')
    expect(eventDetailsModal).not.toMatch(/w-full max-w-2xl[^>]*h-full/)
    expect(eventDetailsModal).not.toMatch(/max-h-\[var\(--details-modal-max-height\)\][^>]*min-h-/)
    // shell is a column flex so header/body/footer stack naturally
    expect(eventDetailsModal).toContain('flex-col overflow-hidden')
  })

  it('Event Details body is content-sized (shrink, not flex-1)', () => {
    // flex-1 on the body would grow the shell toward the cap even when short
    expect(eventDetailsModal).toContain('min-h-0 shrink min-w-0 overflow-y-auto')
    expect(eventDetailsModal).not.toContain('min-h-0 flex-1 overflow-y-auto')
    // no spacer pinning the footer down for short content
    expect(eventDetailsModal).not.toContain('mt-auto')
  })

  it('Job Details shell is capped, not height-forced', () => {
    expect(jobDetailsModal).toContain('max-h-[var(--details-modal-max-height)]')
    expect(jobDetailsModal).not.toMatch(/max-w-lg[^>]*h-full/)
    expect(jobDetailsModal).not.toContain('mt-auto')
  })

  it('Job Details body is content-sized (shrink, not flex-1)', () => {
    expect(jobDetailsModal).toContain('overflow-y-auto shrink min-h-0')
    expect(jobDetailsModal).not.toContain('overflow-y-auto flex-1 min-h-0')
  })
})

// ============================================================================
// 3-4. LONG CONTENT — capped height + internal body scroll
// ============================================================================

describe('LONG CONTENT: capped shell with internal body scroll', () => {
  it('Event Details body is the single internal scroll region', () => {
    expect(eventDetailsModal).toContain('overflow-y-auto overscroll-contain')
    expect(eventDetailsModal).toContain('min-h-0')
    // shell clips so the body scroll region is bounded by the cap
    expect(eventDetailsModal).toContain('overflow-hidden')
  })

  it('Job Details body is the single internal scroll region', () => {
    expect(jobDetailsModal).toContain('overflow-y-auto shrink min-h-0')
    expect(jobDetailsModal).toContain('overflow-hidden flex flex-col')
  })
})

// ============================================================================
// 5-6. HEADER / FOOTER remain visible and follow content
// ============================================================================

describe('HEADER/FOOTER: visible and reachable', () => {
  it('Event Details header and footer are shrink-0', () => {
    // header
    expect(eventDetailsModal).toContain('border-b border-border/60 dark:border-border/50 flex-shrink-0')
    // footer follows content naturally (no mt-auto pin)
    expect(eventDetailsModal).toContain('bg-muted/30 flex-shrink-0')
    expect(eventDetailsModal).not.toContain('mt-auto')
  })

  it('Job Details header and footer are shrink-0', () => {
    expect(jobDetailsModal).toContain('flex-shrink-0')
    expect(jobDetailsModal).not.toContain('mt-auto')
  })
})

// ============================================================================
// 7-8. SAFE-AREA / APP-CHROME reserves top and bottom
// ============================================================================

describe('SAFE-AREA / APP-CHROME reserves', () => {
  it('details token subtracts bottom app-chrome band and both OS safe areas', () => {
    expect(globalsCss).toContain(
      '--details-modal-max-height: calc(100dvh - var(--bottom-nav-height, 72px) - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px)'
    )
  })

  it('details token resolves to the standard modal cap on desktop', () => {
    expect(globalsCss).toMatch(/min-width: 768px[\s\S]*?--details-modal-max-height: var\(--modal-max-height\)/)
  })

  it('Event Details backdrop reserves top safe-area and bottom reserve', () => {
    expect(eventDetailsModal).toContain("paddingTop: 'max(16px, env(safe-area-inset-top))'")
    expect(eventDetailsModal).toContain('var(--modal-bottom-reserve)')
  })

  it('Job Details footer keeps safe-area bottom padding', () => {
    expect(jobDetailsModal).toContain("paddingBottom: 'max(12px, env(safe-area-inset-bottom))'")
  })
})

// ============================================================================
// 9-10. AI SUMMARY expand/collapse inside the capped shell
// ============================================================================

describe('AI SUMMARY expand/collapse', () => {
  it('expanded AI Summary renders inside the internal scroll body', () => {
    // The toggle is aria-expanded-bound and the expanded content is
    // conditionally rendered within the scrollable body region, so the
    // shell stays capped and the body scrolls if the summary is long.
    expect(eventDetailsModal).toContain('aria-expanded={isTranscriptOpen}')
    expect(eventDetailsModal).toContain('{isTranscriptOpen && (')
    // transcript text itself is bounded too
    expect(eventDetailsModal).toContain('max-h-48 overflow-y-auto')
  })

  it('collapsed AI Summary adds no height-forcing wrapper', () => {
    // Collapsed state renders only the toggle row; nothing in the section
    // imposes min-height that would pin the shell tall.
    const aiSection = eventDetailsModal.slice(
      eventDetailsModal.indexOf('AI Meeting Summary'),
      eventDetailsModal.indexOf('Meeting Complete Action')
    )
    expect(aiSection).not.toMatch(/min-h-\[(?!2\.5rem)/)
    expect(aiSection).not.toContain('h-full')
    expect(aiSection).not.toContain('flex-1')
  })
})

// ============================================================================
// 11. MAP-LAUNCHED Event Details uses the same component path
// ============================================================================

describe('MAP ENTRY POINT: same details component, no ScheduleMap changes', () => {
  it('ScheduleMap "View details" delegates to parent callbacks', () => {
    // handleViewItem -> onEditEvent(event) / onViewJob(jobId) — the page
    // renders EventDetailsModal / JobDetailsModal; the map owns no modal.
    expect(scheduleMap).toContain('onEditEvent(event)')
    expect(scheduleMap).toContain('onViewJob(item.jobId)')
    expect(scheduleMap).not.toContain('EventDetailsModal')
    expect(scheduleMap).not.toContain('JobDetailsModal')
    expect(scheduleMap).not.toContain('role="dialog"')
  })

  it('calendar page renders the shared details modals for all entry points', () => {
    expect(calendarPage).toContain('<EventDetailsModal')
    expect(calendarPage).toContain('onEditEvent')
  })
})

// ============================================================================
// 12. Shared Modal consumers unchanged (Edit Customer / Request Details)
// ============================================================================

describe('SHARED MODAL NON-REGRESSION', () => {
  it('shared Modal keeps the standard --modal-max-height cap', () => {
    expect(sharedModal).toContain('max-h-[var(--modal-max-height)]')
    expect(sharedModal).not.toContain('details-modal-max-height')
  })

  it('standard --modal-max-height contract is unchanged', () => {
    expect(globalsCss).toContain('--modal-max-height: calc(100dvh - 32px)')
    expect(globalsCss).toContain('--modal-max-height: calc(100dvh - 128px)')
  })

  it('Edit Customer and Request Details use the shared Modal', () => {
    expect(editCustomerModal).toContain("from '@/components/ui/Modal'")
    expect(requestDetailsModal).toContain("from '@/components/ui/Modal'")
    expect(requestDetailsModal).toContain('<Modal')
  })
})
