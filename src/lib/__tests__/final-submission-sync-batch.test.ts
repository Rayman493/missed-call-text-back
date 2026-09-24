/**
 * Final pre-submission reliability batch — regression tests
 *
 * Confirmed defects covered:
 *
 * PART 4 — Job address change did not move the map marker:
 *   PATCH /api/jobs/[id] wrote service_address but left latitude/longitude/
 *   geocoded_address intact, and ScheduleMap trusts persisted coords — the
 *   marker stayed at the old location forever. The PATCH now clears the
 *   coordinate cache when (and only when) the address actually changes.
 *
 * SYNC GAPS (Part 1/6 audit):
 *   - Schedule page had no `tasks` realtime channel — reminders changed on
 *     another device never appeared without remount.
 *   - StatsCards "Forwarded Missed Calls" derives from call_events but was
 *     not subscribed to it — the stat stayed stale.
 *   - Customers list and notifications had no foreground reconcile —
 *     postgres_changes events dropped while suspended were never replayed.
 *
 * PART 3 — customer-edit propagation (already fixed in ff45bcb5):
 *   Verified here: merging the persisted PATCH row into leadData makes
 *   getCurrentCustomerContext return the edited values immediately.
 *
 * PART 5 — "+ Add customer" in customer-required forms:
 *   JobComposer, NewAppointmentModal, NewTaskModal, BillingEditorModal wire
 *   the shared AddCustomerModal, inject the created customer into the picker
 *   and auto-select it without losing parent form state.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const jobsRoute = readFileSync('src/app/api/jobs/[id]/route.ts', 'utf8').replace(/\r\n/g, '\n')
const calendarPage = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8').replace(/\r\n/g, '\n')
const statsCards = readFileSync('src/components/StatsCards.tsx', 'utf8').replace(/\r\n/g, '\n')
const leadsPage = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8').replace(/\r\n/g, '\n')
const notifCtx = readFileSync('src/contexts/NotificationContext.tsx', 'utf8').replace(/\r\n/g, '\n')
const jobComposer = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8').replace(/\r\n/g, '\n')
const apptModal = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8').replace(/\r\n/g, '\n')
const taskModal = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8').replace(/\r\n/g, '\n')
const billingModal = readFileSync('src/components/billing/BillingEditorModal.tsx', 'utf8').replace(/\r\n/g, '\n')

// ---------------------------------------------------------------------------
// PART 4 — coordinate invalidation on service_address change
// ---------------------------------------------------------------------------

describe('Part 4: PATCH /api/jobs/[id] invalidates stale coordinates', () => {
  it('fetches the persisted service_address for change detection', () => {
    expect(jobsRoute).toContain("'scheduled_date, scheduled_time, scheduled_end_time, series_id, service_address'")
  })

  it('clears latitude/longitude/geocoded_at/geocoded_address only when the address actually changed', () => {
    const start = jobsRoute.indexOf("if ('service_address' in updates)")
    const end = jobsRoute.indexOf('.update(updates)')
    expect(start).toBeGreaterThan(-1)
    const block = jobsRoute.substring(start, end)
    // Compares trimmed new vs persisted old value — same-value saves skip invalidation
    expect(block).toContain('updates.service_address.trim()')
    expect(block).toContain('existing.service_address')
    expect(block).toContain('nextAddress !== prevAddress')
    for (const field of ['latitude = null', 'longitude = null', 'geocoded_at = null', 'geocoded_address = null']) {
      expect(block).toContain(`updates.${field}`)
    }
    // Invalidation happens before the row update so the returned row carries nulls
    expect(jobsRoute.indexOf('updates.latitude = null')).toBeLessThan(jobsRoute.indexOf('.update(updates)'))
  })

  it('replicated predicate: changed/added/cleared address invalidates; identical address does not', () => {
    const invalidates = (next: any, prev: string | null) => {
      const nextAddress = typeof next === 'string' ? next.trim() : ''
      const prevAddress = (prev || '').trim()
      return nextAddress !== prevAddress
    }
    expect(invalidates('456 New St', '123 Old St')).toBe(true)
    expect(invalidates('123 Old St', '123 Old St')).toBe(false)
    expect(invalidates('  123 Old St  ', '123 Old St')).toBe(false) // whitespace-only edit
    expect(invalidates(null, '123 Old St')).toBe(true)             // cleared address drops marker
    expect(invalidates('123 Main St', null)).toBe(true)            // added address geocodes fresh
  })
})

// ---------------------------------------------------------------------------
// SYNC GAPS — cross-surface realtime + foreground reconcile
// ---------------------------------------------------------------------------

describe('Schedule page subscribes to tasks for cross-device reminder sync', () => {
  it('opens a tasks postgres_changes channel with the business guard', () => {
    expect(calendarPage).toContain('schedule-tasks-list:${businessId}')
    expect(calendarPage).toContain("table: 'tasks'")
  })

  it('debounced refetch updates parent tasks AND bumps taskRefreshTrigger for TasksTab/TodayCommandCenter', () => {
    const block = calendarPage.substring(
      calendarPage.indexOf('schedule-tasks-list:${businessId}'),
      calendarPage.indexOf('// Resolve job and customer for selected event')
    )
    expect(block).toContain('fetchTasks()')
    expect(block).toContain('setTaskRefreshTrigger(prev => prev + 1)')
    expect(block).toContain('row?.business_id !== businessId')
    expect(block).toContain('removeChannel(channel)')
  })
})

describe('StatsCards subscribes to call_events so missed-call count stays live', () => {
  it('has a call_events postgres_changes binding that refetches stats', () => {
    const idx = statsCards.indexOf("table: 'call_events'")
    expect(idx).toBeGreaterThan(-1)
    expect(statsCards.substring(idx, idx + 400)).toContain('fetchStats()')
  })
})

describe('Foreground reconcile after app resume / reconnect', () => {
  it('Customers list silently refetches on window focus and visibilitychange', () => {
    expect(leadsPage).toContain("window.addEventListener('focus', reconcile)")
    expect(leadsPage).toContain("document.addEventListener('visibilitychange', handleVisibility)")
    expect(leadsPage).toContain('fetchLeads({ silent: true })')
    // listeners removed on cleanup — no leaks
    expect(leadsPage).toContain("window.removeEventListener('focus', reconcile)")
    expect(leadsPage).toContain("document.removeEventListener('visibilitychange', handleVisibility)")
  })

  it('NotificationContext refetches on foreground return', () => {
    expect(notifCtx).toContain("window.addEventListener('focus', reconcile)")
    expect(notifCtx).toContain("document.addEventListener('visibilitychange', handleVisibility)")
    expect(notifCtx).toContain('refreshNotifications()')
    expect(notifCtx).toContain('clearTimeout(timeout)')
  })
})

// ---------------------------------------------------------------------------
// PART 3 — customer edit propagation (logic test on the real merge + resolver)
// ---------------------------------------------------------------------------

describe('Part 3: edited customer fields reach current Customer Context', async () => {
  const { mergeLeadRealtimeUpdate } = await import('@/lib/lead-merge')
  const { getCurrentCustomerContext } = await import('@/lib/customer-context')

  it('merging the persisted PATCH row updates the resolved context immediately', () => {
    const prev = {
      id: 'lead-1',
      contact_name: 'Old Name',
      caller_phone: '14125550100',
      raw_metadata: {
        extracted_info: {
          callerName: 'Old Name',
          reasonForCalling: 'Leaky faucet',
          addressOrLocation: '123 Old St',
          desiredCompletionTime: 'Next week',
        },
      },
      aiCallRecords: [{ id: 'r1', extracted_info: { callerName: 'Old Name', reasonForCalling: 'Leaky faucet' }, created_at: '2026-09-20T10:00:00Z' }],
      messages: [{ id: 'm1' }],
    }
    // The PATCH response row: canonical column + corrected_fields + timestamp
    const persistedRow = {
      id: 'lead-1',
      contact_name: 'New Name',
      caller_phone: '14125550199',
      raw_metadata: {
        extracted_info: prev.raw_metadata.extracted_info,
        corrected_fields: {
          name: 'New Name', callerName: 'New Name', customerName: 'New Name', caller_name: 'New Name', customer_name: 'New Name',
          serviceRequested: 'Water heater install', reasonForCalling: 'Water heater install', reason: 'Water heater install', service_requested: 'Water heater install',
          address: '789 New Ave', addressOrLocation: '789 New Ave', serviceAddress: '789 New Ave', service_address: '789 New Ave',
          email: 'new@example.com',
        },
        corrected_fields_updated_at: { callerName: '2026-09-24T12:00:00Z' },
        last_correction_at: '2026-09-24T12:00:00Z',
      },
    }
    const merged = mergeLeadRealtimeUpdate(prev, persistedRow)
    const context = getCurrentCustomerContext(merged)
    expect(context.customerName).toBe('New Name')
    expect(context.reasonForCalling).toBe('Water heater install')
    expect(context.location).toBe('789 New Ave')
    expect(context.phoneNumber).toBe('14125550199')
    expect(context.email).toBe('new@example.com')
    // Child lists preserved — messages/aiCallRecords not wiped by the merge
    expect(merged.messages).toHaveLength(1)
    expect(merged.aiCallRecords).toHaveLength(1)
  })

  it('historical ai_call_record extracted_info is untouched by the edit merge', () => {
    const prev = {
      id: 'lead-2',
      raw_metadata: { extracted_info: { callerName: 'Caller A' } },
      aiCallRecords: [{ id: 'r1', extracted_info: { callerName: 'Caller A' }, created_at: '2026-09-20T10:00:00Z' }],
    }
    const merged = mergeLeadRealtimeUpdate(prev, {
      id: 'lead-2',
      raw_metadata: { corrected_fields: { callerName: 'Corrected Name' } },
    })
    expect(merged.aiCallRecords[0].extracted_info.callerName).toBe('Caller A')
    expect(merged.raw_metadata.extracted_info.callerName).toBe('Caller A')
    expect(merged.raw_metadata.corrected_fields.callerName).toBe('Corrected Name')
  })
})

// ---------------------------------------------------------------------------
// PART 5 — "+ Add customer" links in customer-required forms
// ---------------------------------------------------------------------------

describe('Part 5: customer-required modals offer inline Add customer', () => {
  const cases: [string, string][] = [
    ['JobComposer', jobComposer],
    ['NewAppointmentModal', apptModal],
    ['NewTaskModal', taskModal],
  ]

  for (const [name, src] of cases) {
    describe(name, () => {
      it('passes onAddCustomerClick to SearchableCustomerSelect', () => {
        expect(src).toContain('onAddCustomerClick')
        expect(src).toContain('setIsAddCustomerOpen(true)')
      })
      it('injects the created customer via prefillCustomer and renders AddCustomerModal', () => {
        expect(src).toContain('newlyCreatedCustomer ||')
        expect(src).toContain('AddCustomerModal')
        expect(src).toContain('onLeadCreated=')
      })
      it('auto-selects the created customer and preserves parent form state', () => {
        // JobComposer uses a named handleLeadCreated; the other modals use an
        // inline onLeadCreated prop. Extract whichever applies.
        const named = src.match(/const handleLeadCreated[\s\S]*?\n  \}/)
        const handler = named
          ? named[0]
          : src.substring(src.indexOf('onLeadCreated={'), src.indexOf('/>', src.indexOf('onLeadCreated={')))
        expect(handler).toContain('caller_phone')
        expect(handler).toContain('raw_metadata')
        // Auto-select: lead id state set + customer select handler invoked
        expect(handler).toMatch(/setLeadId\(|setSelectedLeadId\(/)
      })
    })
  }

  it('NewAppointmentModal only shows the link when allowed and the customer is not locked', () => {
    expect(apptModal).toContain('(allowAddCustomer ?? !isCustomerLocked)')
  })

  describe('BillingEditorModal (quotes/invoices)', () => {
    it('renders an Add customer link beside the Customer label', () => {
      expect(billingModal).toContain('setIsAddCustomerOpen(true)')
      expect(billingModal).toContain('Add customer')
    })
    it('selects the created customer into the document and adds it to the picker list', () => {
      const handler = billingModal.substring(billingModal.indexOf('onLeadCreated={'), billingModal.indexOf('/>', billingModal.indexOf('onLeadCreated={')))
      expect(handler).toContain('selectCustomer(option)')
      expect(handler).toContain('setLeads(prev => [option, ...prev.filter')
    })
  })
})

// ---------------------------------------------------------------------------
// REALTIME PUBLICATION — subscribed tables must actually be published
// ---------------------------------------------------------------------------

describe('Realtime publication covers every subscribed table', () => {
  const migrations = [
    '20260712000001_enable_realtime_for_messages.sql',
    '20260919000100_billing_conversion_lifecycle.sql',
    '20260928000000_team_access_foundation.sql',
    '20261001000000_recurrence_series.sql',
    '20261002000000_final_submission_realtime_publication.sql',
  ].map(f => {
    try { return readFileSync(`supabase/migrations/${f}`, 'utf8') } catch { return '' }
  }).join('\n')

  // A postgres_changes channel on an unpublished table reports SUBSCRIBED but
  // delivers zero events — the subscription is dead code without this.
  it.each([
    'messages', 'leads', 'conversations', 'payment_requests', 'jobs',
    'billing_documents', 'business_memberships',
    'tasks', 'call_events', 'notifications', 'ai_call_records',
  ])('supabase_realtime publishes %s', (table) => {
    expect(migrations).toMatch(new RegExp(`ADD TABLE (public\\.)?${table}\\b`, 'i'))
  })

  it('new publication statements are idempotent (pg_publication_tables guard)', () => {
    const migration = readFileSync(
      'supabase/migrations/20261002000000_final_submission_realtime_publication.sql', 'utf8'
    )
    expect(migration.match(/pg_publication_tables/g)?.length).toBeGreaterThanOrEqual(4)
  })
})
