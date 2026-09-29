import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

/**
 * /dashboard/notifications realtime-sync regression tests (Audit #4 PI-1)
 *
 * Proven defect: the page fetched its own notifications into local state on
 * [business?.id] mount and rendered only that, while NotificationContext's
 * realtime channel kept updating the bell badge. INSERT/UPDATE/DELETE events
 * therefore left the open page stale (phantom rows, contradictory unread
 * state) for the whole session.
 *
 * Fix contract being verified:
 * - the page keeps its canonical full-list fetch (no dataset change)
 * - the page re-reads the canonical fetch whenever the context-owned,
 *   realtime-merged list changes (contextNotifications dependency)
 * - the resync is debounced so realtime bursts collapse into one refetch
 * - NO second realtime channel is created on the page
 * - mark-read / mark-all / clear-all continue delegating to context ops
 *   (which carry the optimistic updates) plus local list reconciliation
 * - business switching refetches for the new business
 */

const page = readFileSync('src/app/dashboard/notifications/page.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Notifications page syncs with NotificationContext realtime', () => {
  it('keeps the canonical full-list fetch (dataset unchanged)', () => {
    expect(page).toContain('notificationService.getNotifications(business.id)')
    expect(page).toContain('notificationService.getNotificationCount(business.id)')
  })

  it('re-runs the canonical fetch whenever contextNotifications changes', () => {
    // The dependency array on the resync effect is exactly [contextNotifications]
    expect(page).toMatch(/\},\s*\[contextNotifications\]\)/)
    // The debounced body calls the latest fetch via ref
    expect(page).toContain('fetchNotificationsRef.current()')
  })

  it('debounces the resync (realtime bursts collapse into one refetch)', () => {
    expect(page).toContain('setTimeout')
    expect(page).toContain('clearTimeout')
  })

  it('does not create a second realtime channel on the page', () => {
    expect(page).not.toContain('postgres_changes')
    expect(page).not.toContain('.channel(')
    expect(page).not.toContain('removeChannel')
  })

  it('initial fetch is still business-keyed (business switch reloads correct data)', () => {
    expect(page).toMatch(/\},\s*\[business\?\.id\]\)/)
    // Resync skips its first run so the mount effect owns the initial fetch
    expect(page).toContain('contextSyncInitializedRef')
  })

  it('mark-one-read still works via context + local reconciliation', () => {
    expect(page).toContain('await contextMarkAsRead(notificationId)')
    expect(page).toMatch(/prev\.map\(n =>\s*n\.id === notificationId \? \{ \.\.\.n, read: true \} : n/)
  })

  it('mark-all-read still works via context + local reconciliation', () => {
    expect(page).toContain('await contextMarkAllAsRead()')
    expect(page).toContain('unread: 0')
  })

  it('clear-all still works with restore-on-failure', () => {
    expect(page).toContain('notificationService.clearAllNotifications(business.id)')
    expect(page).toContain('setNotifications(previousNotifications)')
    expect(page).toContain('refreshNotifications()')
  })

  it('delete still works via context + local removal', () => {
    expect(page).toContain('await contextDeleteNotification(notificationId)')
    expect(page).toContain('prev.filter(n => n.id !== notificationId)')
  })

  it('unread count comes from the same fetch as the rendered rows (cannot disagree)', () => {
    // getNotifications and getNotificationCount are fetched together in the
    // single fetchNotifications path that every sync trigger calls.
    const fn = page.substring(
      page.indexOf('const fetchNotifications = async'),
      page.indexOf('useEffect(() => {\n    if (!business?.id) return\n    fetchNotifications()')
    )
    expect(fn).toContain('setNotifications(fetchedNotifications)')
    expect(fn).toContain('setNotificationCount(count)')
  })

  it('page still never navigates on row click (unchanged documented behavior)', () => {
    // action_url is intentionally not consumed here — only mark-read on tap.
    expect(page).not.toContain('router.push(notification.action_url)')
  })
})
