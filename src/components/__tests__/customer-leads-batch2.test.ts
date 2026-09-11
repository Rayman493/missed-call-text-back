import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('LeadCard — mobile status dropdown at top-right', () => {
  const src = readSrc('src/components/LeadCard.tsx')

  it('status dropdown is in the header row (top-right) without hidden sm:block wrapper', () => {
    expect(src).toContain('flex-shrink-0')
    expect(src).not.toContain('hidden sm:block flex-shrink-0')
  })

  it('does not have a separate mobile status dropdown at the bottom', () => {
    expect(src).not.toContain('sm:hidden flex-shrink-0')
  })

  it('status dropdown has onClick stopPropagation boundary to prevent card navigation', () => {
    // Batch F: pointer-event stopPropagation was removed because it blocked
    // Radix's document-level pointerdown listener, preventing outside-tap
    // dismissal of the status dropdown after page scroll. Only onClick
    // stopPropagation is kept to prevent the LeadCard's click handler
    // from firing when interacting with the status dropdown.
    expect(src).toContain('onClick={(e) => e.stopPropagation()}')
    // Must NOT stopPropagation on pointer events (allows Radix outside-tap)
    const wrapperMatch = src.match(/<div className="flex-shrink-0">\s*<div[\s\S]*?>/)
    expect(wrapperMatch).toBeTruthy()
    if (wrapperMatch) {
      expect(wrapperMatch[0]).not.toContain('onPointerDown={(e) => e.stopPropagation()}')
      expect(wrapperMatch[0]).not.toContain('onPointerUp={(e) => e.stopPropagation()}')
    }
  })

  it('card body remains clickable (onClick opens lead)', () => {
    expect(src).toMatch(/onClick=\{\(\) => onOpen\(lead\.id\)\}/)
  })
})

describe('Leads page — filter/funnel drag-vs-tap protection', () => {
  const src = readSrc('src/app/dashboard/leads/page.tsx')

  it('uses shouldPreventMenuOpen for drag detection', () => {
    expect(src).toContain('shouldPreventMenuOpen')
  })

  it('records pointer start position on pointer down', () => {
    expect(src).toContain('filterPointerStartRef.current')
    expect(src).toContain('filterMovedRef.current')
  })

  it('detects movement beyond threshold on pointer move', () => {
    expect(src).toContain('filterMovedRef.current = true')
  })

  it('suppresses filter open when movement exceeded threshold', () => {
    expect(src).toContain('if (!wasScroll)')
    expect(src).toContain('setFilterMenuOpen(true)')
  })

  it('does not globally preventDefault on touch/pointer movement', () => {
    const filterButtonBlock = src.match(/Filter dropdown button[\s\S]*?<\/button>/)
    if (filterButtonBlock) {
      expect(filterButtonBlock[0]).not.toContain('preventDefault')
    }
  })
})

describe('CustomerDetails — no per-field pencil/edit icons', () => {
  const src = readSrc('src/components/CustomerDetails.tsx')

  it('does not contain Pencil icon import or usage', () => {
    expect(src).not.toMatch(/import.*Pencil/)
    expect(src).not.toContain('<Pencil')
  })

  it('does not contain per-field edit buttons', () => {
    expect(src).not.toMatch(/onClick.*setShowEditCustomer/)
    expect(src).not.toMatch(/onClick.*setIsEditMode/)
  })

  it('renders fields as read-only text', () => {
    expect(src).toContain('renderField')
    expect(src).toContain('Customer Name')
    expect(src).toContain('Reason for Calling')
    expect(src).toContain('Details')
    expect(src).toContain('Location')
    expect(src).toContain('Preferred Callback Time')
    expect(src).toContain('Phone Number')
    expect(src).toContain('Email')
  })
})

describe('Customer detail page — global Edit action preserved', () => {
  const src = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

  it('has exactly one global EditCustomerModal', () => {
    const modalMatches = src.match(/<EditCustomerModal/g) || []
    expect(modalMatches.length).toBe(1)
  })

  it('mobile header has Edit Customer button opening EditCustomerModal', () => {
    expect(src).toContain("setShowEditCustomer(true)")
  })

  it('desktop action bar has Edit Customer button', () => {
    expect(src).toContain('Edit Customer')
  })
})

describe('Customer detail page — refresh UX (exactly one success signal)', () => {
  const src = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

  it('has refreshMessage state for label change', () => {
    expect(src).toContain('refreshMessage')
    expect(src).toContain('setRefreshMessage')
  })

  it('shows spinning icon during refresh', () => {
    expect(src).toContain("animate-spin")
  })

  it('disables refresh button only during MANUAL refresh (not background)', () => {
    // Background refresh must NOT disable the manual control.
    // Only manualRefreshing (user-initiated) disables the button.
    expect(src).toContain('disabled={manualRefreshing}')
    expect(src).not.toContain('disabled={refreshing}')
  })

  it('changes label while refreshing', () => {
    expect(src).toContain('Refreshing…')
  })

  it('sets exactly one success label on successful refresh (no double signal)', () => {
    // Should set refreshMessage('Refreshed') but NOT setSuccessMessage('Customer refreshed')
    expect(src).toContain("setRefreshMessage('Refreshed')")
    expect(src).not.toContain("setSuccessMessage('Customer refreshed')")
  })

  it('sets failure label on failed refresh', () => {
    expect(src).toContain("setRefreshMessage('Refresh failed')")
  })
})

describe('Customer detail page — state reliability (correction pass)', () => {
  const src = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

  it('imports mergeLeadRealtimeUpdate for realtime lead updates', () => {
    expect(src).toContain('mergeLeadRealtimeUpdate')
  })

  it('imports mergeLeadFetchResult for fetch/refresh/resume merges', () => {
    expect(src).toContain('mergeLeadFetchResult')
  })

  it('imports replaceAuthoritativeChildSnapshot for authoritative child lists', () => {
    expect(src).toContain('replaceAuthoritativeChildSnapshot')
  })

  it('imports reconcileScopedChildSnapshot for scoped appointment window', () => {
    expect(src).toContain('reconcileScopedChildSnapshot')
  })

  it('does NOT import the old reconcileChildList (renamed)', () => {
    expect(src).not.toContain('reconcileChildList')
  })

  it('uses mergeLeadRealtimeUpdate in realtime lead update handler', () => {
    expect(src).toContain('mergeLeadRealtimeUpdate(prev, updatedLead)')
  })

  it('uses mergeLeadFetchResult in app resume handler', () => {
    expect(src).toContain('mergeLeadFetchResult(prev, updatedData.lead, mergeMessagesById)')
    expect(src).toContain('mergeLeadFetchResult(prev, refetchData.lead, mergeMessagesById)')
  })

  it('uses mergeLeadFetchResult in handleRefresh', () => {
    expect(src).toContain('mergeLeadFetchResult(prev, result.lead, mergeMessagesById)')
  })

  it('tracks _statusUpdatedAt for status regression protection', () => {
    expect(src).toContain('_statusUpdatedAt')
  })

  it('uses replaceAuthoritativeChildSnapshot for jobs (authoritative snapshot)', () => {
    expect(src).toContain('setLeadJobs(prev => replaceAuthoritativeChildSnapshot(prev, data.jobs || []))')
  })

  it('uses replaceAuthoritativeChildSnapshot for tasks (authoritative snapshot)', () => {
    expect(src).toContain('setLeadTasks(prev => replaceAuthoritativeChildSnapshot(prev, data.tasks || []))')
  })

  it('uses reconcileScopedChildSnapshot for appointments (scoped authoritative)', () => {
    expect(src).toContain('reconcileScopedChildSnapshot')
  })

  it('has request generation guards for child fetches', () => {
    expect(src).toContain('latestJobsFetchRef')
    expect(src).toContain('latestTasksFetchRef')
    expect(src).toContain('latestAppointmentsFetchRef')
  })

  it('bumps jobs generation after mutation (before revalidation)', () => {
    expect(src).toContain('latestJobsFetchRef.current++')
  })

  it('bumps appointments generation after mutation', () => {
    expect(src).toContain('latestAppointmentsFetchRef.current++')
  })

  it('bumps tasks generation after mutation', () => {
    expect(src).toContain('latestTasksFetchRef.current++')
  })

  it('rejects stale jobs fetch via generation guard', () => {
    expect(src).toContain('requestId !== latestJobsFetchRef.current')
  })

  it('rejects stale tasks fetch via generation guard', () => {
    expect(src).toContain('requestId !== latestTasksFetchRef.current')
  })

  it('rejects stale appointments fetch via generation guard', () => {
    expect(src).toContain('requestId !== latestAppointmentsFetchRef.current')
  })

  it('does not use whole-object replacement in app resume', () => {
    expect(src).not.toContain('setLeadData(updatedData)')
    expect(src).not.toContain('setLeadData(refetchData)')
  })
})
