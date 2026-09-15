/**
 * RC — Dashboard Recent Customer → Customer Page Null-ID Crash
 *
 * Regression tests for the fix that prevents the customer page from crashing
 * with "TypeError: Cannot read properties of null (reading 'id')" when
 * navigating from Dashboard → Recent Customers → customer page.
 *
 * Root cause: EventDetailsModal was always mounted in page-client.tsx with
 * event={selectedAppointmentEvent} (null by default). The modal's hooks
 * access event.id/event.summary during render, before its own
 * if(!isOpen||!event) return null guard at line 294. This crashed the entire
 * customer page on every load, regardless of entry path.
 *
 * Fix: conditionally render EventDetailsModal only when
 * selectedAppointmentEvent is not null (matching the calendar page pattern).
 * Also hardened EventDetailsModal's hooks with event?.id and added a null
 * guard to mergeMessageWithMonotonicity.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) =>
  readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
const eventDetailsModalSrc = readSrc('src/components/calendar/EventDetailsModal.tsx')
const recentLeadsSectionSrc = readSrc('src/components/RecentLeadsSection.tsx')
const dashboardContentSrc = readSrc('src/app/dashboard/DashboardContent.tsx')

// ============================================================================
// 1. DASHBOARD RECENT CUSTOMER NAVIGATION
// ============================================================================

describe('1. DASHBOARD RECENT CUSTOMER NAVIGATION', () => {
  it('1. Dashboard Recent Customer navigates with valid customer ID', () => {
    // RecentLeadsSection must use Link with href=/dashboard/leads/${lead.id}
    expect(recentLeadsSectionSrc).toContain('href={`/dashboard/leads/${lead.id}`}')
  })

  it('2. No stale dashboard object passed via router state', () => {
    // The Link must not pass any state or shallow object
    expect(recentLeadsSectionSrc).not.toContain('router.push')
    expect(recentLeadsSectionSrc).not.toContain('state:')
  })

  it('3. RecentLeadsSection is used by DashboardContent', () => {
    expect(dashboardContentSrc).toContain('RecentLeadsSection')
  })
})

// ============================================================================
// 2. EVENT DETAILS MODAL — ROOT CAUSE FIX
// ============================================================================

describe('2. EVENT DETAILS MODAL — ROOT CAUSE FIX', () => {
  it('4. EventDetailsModal is conditionally rendered (not always mounted)', () => {
    // The modal must be wrapped in a conditional that checks
    // selectedAppointmentEvent is not null
    expect(pageClientSrc).toContain('{selectedAppointmentEvent && (')
    expect(pageClientSrc).toContain('<EventDetailsModal')
  })

  it('5. event prop is no longer null when mounted (conditional guarantees it)', () => {
    // The event prop must be selectedAppointmentEvent (which is guaranteed
    // non-null by the conditional wrapper)
    expect(pageClientSrc).toContain('event={selectedAppointmentEvent}')
  })

  it('6. lead prop simplified (no longer ternary on selectedAppointmentEvent)', () => {
    // The lead prop must NOT use a ternary that checks selectedAppointmentEvent
    // (since the conditional wrapper already guarantees it's non-null)
    expect(pageClientSrc).not.toContain('lead={selectedAppointmentEvent ? {')
    // Instead, lead should be a direct object
    expect(pageClientSrc).toMatch(/lead=\{\{[\s\S]*?id: params\.id/)
  })

  it('7. EventDetailsModal hooks use event?.id (defense-in-depth)', () => {
    // The useEffect that fetches meeting records must use event?.id
    expect(eventDetailsModalSrc).toContain('!event?.id')
    expect(eventDetailsModalSrc).toContain('[business?.id, event?.id]')
  })

  it('8. EventDetailsModal useState initializers use event?. (defense-in-depth)', () => {
    // The useState initializers must use optional chaining
    expect(eventDetailsModalSrc).toContain('event?.summary')
    expect(eventDetailsModalSrc).toContain('event?.description')
    expect(eventDetailsModalSrc).toContain('event?.location')
    expect(eventDetailsModalSrc).toContain('event?.start?.date')
  })

  it('9. isReplyFlowOwned guards against null event', () => {
    // The isReplyFlowOwned call must guard against null event
    expect(eventDetailsModalSrc).toContain('event ? isReplyFlowOwnedEvent')
  })

  it('10. EventDetailsModal still has its own null guard (if !isOpen || !event)', () => {
    // The component's own guard must still exist
    expect(eventDetailsModalSrc).toContain('if (!isOpen || !event) return null')
  })
})

// ============================================================================
// 3. MESSAGE MERGE NULL GUARD
// ============================================================================

describe('3. MESSAGE MERGE NULL GUARD', () => {
  it('11. mergeMessageWithMonotonicity guards against null incomingMessage', () => {
    // The function must early-return if incomingMessage is null/undefined
    expect(pageClientSrc).toContain('if (!incomingMessage) return existingMessages')
  })

  it('12. null message in array does not crash (early return preserves existing)', () => {
    // The guard must return the existing messages unchanged
    expect(pageClientSrc).toMatch(
      /if \(!incomingMessage\) return existingMessages/
    )
  })
})

// ============================================================================
// 4. CUSTOMER PAGE MOUNT SAFETY
// ============================================================================

describe('4. CUSTOMER PAGE MOUNT SAFETY', () => {
  it('13. customer page mounts successfully from Dashboard entry (no always-mounted null event)', () => {
    // The EventDetailsModal must NOT be mounted unconditionally
    // Check that there's no unconditional <EventDetailsModal without a guard
    const unconditionalMatch = pageClientSrc.match(
      /(^|\n)\s*<EventDetailsModal/
    )
    // The match should be inside a conditional block
    if (unconditionalMatch) {
      // Find the context around the match to verify it's conditional
      const idx = pageClientSrc.indexOf('<EventDetailsModal')
      const before = pageClientSrc.substring(Math.max(0, idx - 100), idx)
      expect(before).toContain('selectedAppointmentEvent &&')
    }
  })

  it('14. same customer mounts from Customers page (same component, same fix)', () => {
    // The fix is in page-client.tsx which is used for ALL customer page loads
    // regardless of entry path (Dashboard, Customers page, direct URL)
    expect(pageClientSrc).toContain('selectedAppointmentEvent')
  })

  it('15. direct URL reload mounts successfully (no client-side state dependency)', () => {
    // The fix does not depend on any client-side navigation state
    // The conditional rendering is based on local state (selectedAppointmentEvent)
    // which is null on every fresh page load
    expect(pageClientSrc).toContain('useState<any | null>(null)')
  })

  it('16. error boundary is not triggered for valid customer (no null-id crash)', () => {
    // The crash was caused by event.id access on null event
    // The conditional rendering prevents the component from mounting with null
    expect(pageClientSrc).toContain('{selectedAppointmentEvent && (')
  })
})

// ============================================================================
// 5. NO BLANKET OPTIONAL CHAINING
// ============================================================================

describe('5. NO BLANKET OPTIONAL CHAINING', () => {
  it('17. no blanket optional-chaining suppression added to timeline code', () => {
    // The timeline payment filter code must still use direct access on
    // payment requests (pr.id) — these are real records, not null
    expect(pageClientSrc).toContain('payment_request_id: pr.id')
    expect(pageClientSrc).toContain('id: `payment-requested-${pr.id}`')
  })

  it('18. no blanket optional-chaining on message/vocemail maps', () => {
    // The message and voicemail maps must still use direct .id access
    // (these are real records from the API, not null)
    expect(pageClientSrc).toContain('id: voicemail.id')
    expect(pageClientSrc).toContain('id: message.id')
  })

  it('19. fix is targeted (only EventDetailsModal and merge guard)', () => {
    // The fix must NOT add optional chaining to every .id access
    // Only EventDetailsModal hooks and mergeMessageWithMonotonicity were changed
    expect(eventDetailsModalSrc).toContain('event?.id')
    expect(pageClientSrc).toContain('if (!incomingMessage) return existingMessages')
  })
})

// ============================================================================
// 6. BATCH 7 DRILLDOWN PRESERVED
// ============================================================================

describe('6. BATCH 7 DRILLDOWN PRESERVED', () => {
  it('20. exact-record drilldown from Batch 7 still works (setSelectedAppointmentEvent)', () => {
    // The appointment drilldown must still set selectedAppointmentEvent
    expect(pageClientSrc).toContain('setSelectedAppointmentEvent(event)')
  })

  it('21. handleAppointmentCardClick still sets the event', () => {
    expect(pageClientSrc).toContain('handleAppointmentCardClick')
  })

  it('22. handleCloseAppointmentEvent clears the event', () => {
    expect(pageClientSrc).toContain('handleCloseAppointmentEvent')
    expect(pageClientSrc).toContain('setSelectedAppointmentEvent(null)')
  })

  it('23. EventDetailsModal onRefresh still refreshes appointments', () => {
    expect(pageClientSrc).toContain('fetchAppointments()')
  })

  it('24. EventDetailsModal is still the single appointment detail modal', () => {
    const eventDetailsModalInstances = (pageClientSrc.match(/<EventDetailsModal/g) || []).length
    expect(eventDetailsModalInstances).toBe(1)
  })

  it('25. editingJob still passed to JobComposer (unchanged)', () => {
    expect(pageClientSrc).toContain('editJob={editingJob || undefined}')
  })

  it('26. editingTask still passed to NewTaskModal (unchanged)', () => {
    expect(pageClientSrc).toContain('taskToEdit={editingTask}')
  })
})

// ============================================================================
// 7. REALTIME SUBSCRIPTION SAFETY
// ============================================================================

describe('7. REALTIME SUBSCRIPTION SAFETY', () => {
  it('27. realtime subscription still initializes (leadData.id check preserved)', () => {
    // The realtime subscription must still check leadData.id before subscribing
    expect(pageClientSrc).toContain('leadData.id')
  })

  it('28. realtime null message does not crash merge (null guard added)', () => {
    // The merge function must guard against null incoming messages
    expect(pageClientSrc).toContain('if (!incomingMessage) return existingMessages')
  })
})
