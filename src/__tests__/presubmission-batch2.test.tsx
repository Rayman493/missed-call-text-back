/**
 * FINAL PRE-SUBMISSION BATCH 2 — Schedule / Booking / Navigation reliability
 *
 * Behavioral coverage for:
 * - Booking detail modal opening at top (Modal ResizeObserver bottom-pin bug)
 * - Canonical ?job= / ?event= Schedule deep-link params
 * - Today overview rows opening their exact record
 * - Virtual recurring-occurrence job IDs resolving through materialization
 *   instead of hitting /api/jobs/virtual:.../time-entries
 * - Non-physical locations ("Remote") never reaching the geocoder as addresses
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { readFileSync } from 'fs'
import { join } from 'path'

vi.mock('@/hooks/useBodyScrollLock', () => ({ useBodyScrollLock: () => {} }))
vi.mock('@/hooks/useModalBackButton', () => ({ useModalBackButton: () => {} }))
vi.mock('@/lib/supabase/browser', () => ({
  createBrowserClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
  }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

import Modal from '@/components/ui/Modal'
import TodayCommandCenter from '@/components/schedule/TodayCommandCenter'
import { parseVirtualId, makeVirtualId } from '@/lib/recurrence/service'
import { isNonPhysicalLocation } from '@/lib/geocoding'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  if (root) act(() => root.unmount())
  container.remove()
})

// ---------------------------------------------------------------------------
// Modal scroll behavior
// ---------------------------------------------------------------------------

class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  cb: ResizeObserverCallback
  el: Element | null = null
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb
    MockResizeObserver.instances.push(this)
  }
  observe(el: Element) { this.el = el }
  unobserve() {}
  disconnect() {}
  fire() { if (this.el) this.cb([{ target: this.el } as any], this as any) }
}

function setScrollMetrics(el: Element, m: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollTop', { value: m.scrollTop, writable: true, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: m.scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: m.clientHeight, configurable: true })
}

describe('Modal scroll container', () => {
  beforeEach(() => {
    MockResizeObserver.instances = []
    ;(globalThis as any).ResizeObserver = MockResizeObserver
  })

  function contentEl() {
    return document.querySelector('[data-scroll-lock-allow]') as HTMLElement
  }

  it('does not pin to bottom when async content grows before any user scroll', async () => {
    await act(async () => {
      root = createRoot(container)
      root.render(
        <Modal isOpen onClose={() => {}} title="Booking request">
          <div>loading</div>
        </Modal>
      )
    })

    const el = contentEl()
    expect(el).toBeTruthy()

    const ro = MockResizeObserver.instances[0]
    // Fresh open: loading content is shorter than the viewport.
    setScrollMetrics(el, { scrollTop: 0, scrollHeight: 100, clientHeight: 400 })
    ro.fire() // establishes baseline state

    // Detail loads — content now overflows. Regression: previously the
    // observer treated scrollTop=0 as "near bottom" and pinned the scroll to
    // the bottom of the loaded detail (modal "opened at the bottom").
    setScrollMetrics(el, { scrollTop: 0, scrollHeight: 2000, clientHeight: 400 })
    ro.fire()

    expect(el.scrollTop).toBe(0)
  })

  it('keeps pinning to the new bottom when the user was already at the bottom', async () => {
    await act(async () => {
      root = createRoot(container)
      root.render(
        <Modal isOpen onClose={() => {}} title="Booking request">
          <div>content</div>
        </Modal>
      )
    })

    const el = contentEl()
    const ro = MockResizeObserver.instances[0]

    // Content overflows and user has scrolled to the bottom.
    setScrollMetrics(el, { scrollTop: 1600, scrollHeight: 2000, clientHeight: 400 })
    ro.fire()

    // Content grows further — pinned to the new bottom.
    setScrollMetrics(el, { scrollTop: 1600, scrollHeight: 2600, clientHeight: 400 })
    ro.fire()

    expect(el.scrollTop).toBe(2200)
  })
})

// ---------------------------------------------------------------------------
// Today overview → exact record
// ---------------------------------------------------------------------------

async function renderCommandCenter(props: any) {
  await act(async () => {
    root = createRoot(container)
    root.render(<TodayCommandCenter {...props} />)
  })
  // Allow the tasks fetch effect to settle
  await act(async () => { await Promise.resolve() })
}

describe('TodayCommandCenter record navigation', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('/api/tasks')) {
        return { ok: true, json: async () => ({ tasks: [] }) } as any
      }
      return { ok: true, json: async () => ({}) } as any
    }) as any
  })

  const today = new Date().toLocaleDateString('en-CA')

  function clickRowWithText(text: string) {
    const nodes = Array.from(document.querySelectorAll('[role="button"]'))
    const row = nodes.find(n => n.textContent?.includes(text)) as HTMLElement | undefined
    expect(row, `clickable row containing "${text}"`).toBeTruthy()
    act(() => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  it('tapping a Today job row opens that exact job', async () => {
    const onJobClick = vi.fn()
    const job = {
      id: 'job-111', title: 'Mow lawn', status: 'scheduled',
      scheduled_date: today, scheduled_time: '09:00', customer_name: 'Amy',
    } as any

    await renderCommandCenter({ jobs: [job], calendarEvents: [], onJobClick })
    clickRowWithText('Mow lawn')
    expect(onJobClick).toHaveBeenCalledWith(job)
  })

  it('tapping a Today appointment row opens that exact event', async () => {
    const onEditAppointment = vi.fn()
    const event = {
      id: 'evt-222', summary: 'Site visit', description: null, location: null,
      htmlLink: null, start: { dateTime: `${today}T10:00:00` }, end: { dateTime: `${today}T11:00:00` },
    } as any

    await renderCommandCenter({ jobs: [], calendarEvents: [event], onEditAppointment })
    clickRowWithText('Site visit')
    expect(onEditAppointment).toHaveBeenCalledWith(event)
  })
})

// ---------------------------------------------------------------------------
// Canonical Schedule record deep-links
// ---------------------------------------------------------------------------

describe('Schedule record deep-link contract', () => {
  const pageSrc = src('src/app/dashboard/calendar/page.tsx')
  const bookingSrc = src('src/components/schedule/BookingRequestDetailModal.tsx')

  it('booking View Job carries the persisted job id', () => {
    expect(bookingSrc).toContain('tab=jobs&job=${detail.job_id}')
  })

  it('booking View Appointment carries the persisted event id', () => {
    expect(bookingSrc).toContain('tab=appointments&event=${detail.appointment_id}')
  })

  it('calendar page resolves ?job= into JobDetailsModal for the exact job', () => {
    expect(pageSrc).toContain("searchParams?.get('job')")
    expect(pageSrc).toContain('jobs.find(j => j.id === jobId)')
    expect(pageSrc).toContain('setIsJobDetailsOpen(true)')
  })

  it('calendar page resolves ?event= into EventDetailsModal for the exact event', () => {
    expect(pageSrc).toContain("searchParams?.get('event')")
    expect(pageSrc).toContain('events.find(e => e.id === eventId)')
    expect(pageSrc).toContain('setIsEventDetailsOpen(true)')
  })
})

// ---------------------------------------------------------------------------
// Virtual recurring occurrence → time entries
// ---------------------------------------------------------------------------

describe('virtual recurring occurrence timer', () => {
  it('parseVirtualId round-trips the production id shape', () => {
    const id = makeVirtualId('series-abc', '2026-11-25')
    expect(id).toBe('virtual:series-abc:2026-11-25')
    expect(parseVirtualId(id)).toEqual({ seriesId: 'series-abc', occurrenceDate: '2026-11-25' })
    expect(parseVirtualId('real-uuid-123')).toBeNull()
    expect(parseVirtualId('virtual:series-abc:not-a-date')).toBeNull()
  })

  it('time-entries POST materializes virtual occurrences before lookup', () => {
    const routeSrc = src('src/app/api/jobs/[id]/time-entries/route.ts')
    const postBody = routeSrc.slice(routeSrc.indexOf('export async function POST'))
    expect(postBody).toContain('parseVirtualId(jobId)')
    expect(postBody).toContain('materializeOccurrence(')
    expect(postBody).toContain('jobId = row.id')
  })

  it('time-entries GET resolves materialized exceptions instead of 404', () => {
    const routeSrc = src('src/app/api/jobs/[id]/time-entries/route.ts')
    const getBody = routeSrc.slice(
      routeSrc.indexOf('export async function GET'),
      routeSrc.indexOf('export async function POST')
    )
    expect(getBody).toContain('recurrence_exceptions')
    expect(getBody).toContain('materialized_id')
    expect(getBody).toContain('return NextResponse.json({ entries: [] })')
  })
})

// ---------------------------------------------------------------------------
// Non-physical locations never reach the geocoder
// ---------------------------------------------------------------------------

describe('non-physical location handling', () => {
  it('recognizes Remote and other non-physical values', () => {
    expect(isNonPhysicalLocation('Remote')).toBe(true)
    expect(isNonPhysicalLocation('remote')).toBe(true)
    expect(isNonPhysicalLocation('  Online  ')).toBe(true)
    expect(isNonPhysicalLocation('Phone call')).toBe(true)
    expect(isNonPhysicalLocation('TBD')).toBe(true)
  })

  it('does not flag real addresses', () => {
    expect(isNonPhysicalLocation('123 Main St, Springfield')).toBe(false)
    expect(isNonPhysicalLocation('Remote Rd, Austin TX')).toBe(false)
    expect(isNonPhysicalLocation('')).toBe(false)
    expect(isNonPhysicalLocation(null)).toBe(false)
  })

  it('/api/geocode/address returns non-physical semantics instead of 500', () => {
    const routeSrc = src('src/app/api/geocode/address/route.ts')
    expect(routeSrc).toContain('isNonPhysicalLocation(normalizedAddress)')
    expect(routeSrc).toContain("'non_physical_location'")
    // ZERO_RESULTS/NOT_FOUND must not surface as HTTP 500
    expect(routeSrc).toContain("'address_not_found'")
    expect(routeSrc).toContain('422')
  })

  it('/api/jobs geocode action applies the same guard', () => {
    const routeSrc = src('src/app/api/jobs/route.ts')
    expect(routeSrc).toContain('isNonPhysicalLocation(normalizedAddress)')
    expect(routeSrc).toContain("'non_physical_location'")
  })

  it('ScheduleMap skips geocoding non-physical locations', () => {
    const mapSrc = src('src/components/schedule/ScheduleMap.tsx')
    expect(mapSrc).toContain('isNonPhysicalLocation(normalizedLocation)')
    expect(mapSrc).toContain('isNonPhysicalLocation(serviceAddress)')
  })
})

// ---------------------------------------------------------------------------
// leads/[id] GET (405 fix)
// ---------------------------------------------------------------------------

describe('GET /api/leads/[id]', () => {
  it('route exports GET scoped by business', () => {
    const routeSrc = src('src/app/api/leads/[id]/route.ts')
    expect(routeSrc).toContain('export async function GET')
    expect(routeSrc).toContain(".eq('business_id', authResult.business.id!)")
  })
})
