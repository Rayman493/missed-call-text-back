import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createRefreshCoordinator } from '@/lib/refresh-lifecycle'

// The conversation page's refresh lifecycle: Edit Customer save triggers a
// manual (non-silent) handleRefresh; realtime leads/ai_call_records events,
// foreground sync, and the stuck-message interval trigger silent refreshes
// from subscription-callback closures bound at effect time.
//
// Production bug being pinned: a silent refresh fired from a stale closure
// used to slip past the state-based dedup (`refreshing` read false in the old
// closure), supersede the manual request, and then its silent finally cleared
// only `refreshing` — never `manualRefreshing` — leaving "Refreshing…" stuck
// forever even though the data had updated.

const pageClient = readFileSync(
  join(__dirname, '../../app/dashboard/leads/[id]/page-client.tsx'),
  'utf8'
)

describe('createRefreshCoordinator — successful edit lifecycle', () => {
  it('manual refresh marks in-flight then returns to idle on settle', () => {
    const c = createRefreshCoordinator()
    const id = c.begin(false)
    expect(id).not.toBeNull()

    const flags = c.settle(false)
    expect(flags).toEqual({ refreshing: false, manualRefreshing: false })
  })

  it('silent refresh marks in-flight then returns to idle without touching manual flag', () => {
    const c = createRefreshCoordinator()
    expect(c.begin(true)).not.toBeNull()
    expect(c.settle(true)).toEqual({ refreshing: false, manualRefreshing: false })
  })
})

describe('createRefreshCoordinator — realtime event during manual refresh (production regression)', () => {
  it('silent refresh attempt while manual refresh in flight is deduped, cannot supersede', () => {
    const c = createRefreshCoordinator()
    const manualId = c.begin(false)
    expect(manualId).not.toBeNull()

    // A realtime callback firing mid-edit must not start a competing request
    // (previously it slipped past the stale-closure dedup and superseded the
    // manual request, stranding the label).
    expect(c.begin(true)).toBeNull()

    // The manual request remains latest; its result is not stale.
    expect(c.isStale(manualId!)).toBe(false)

    // Manual settle returns everything to idle — label unstuck.
    expect(c.settle(false)).toEqual({ refreshing: false, manualRefreshing: false })
  })

  it('even if a silent request somehow overlapped, settling it last still clears the manual flag', () => {
    // Defence-in-depth: flags are derived from in-flight work, so whichever
    // request finishes last returns accurate flags — a silent settle can never
    // strand manualRefreshing.
    const c = createRefreshCoordinator()
    const silentId = c.begin(true)          // background starts first
    const manualId = c.begin(false)         // manual allowed during background
    expect(silentId).not.toBeNull()
    expect(manualId).not.toBeNull()
    expect(c.isStale(silentId!)).toBe(true) // manual superseded it

    // Manual settles first: silent still in flight → both flags stay active.
    expect(c.settle(false)).toEqual({ refreshing: true, manualRefreshing: false })
    // Silent settles last → everything idle.
    expect(c.settle(true)).toEqual({ refreshing: false, manualRefreshing: false })
  })
})

describe('createRefreshCoordinator — dedup rules', () => {
  it('second manual refresh while one is in flight is rejected (rapid-tap protection)', () => {
    const c = createRefreshCoordinator()
    expect(c.begin(false)).not.toBeNull()
    expect(c.begin(false)).toBeNull()
    c.settle(false)
  })

  it('manual refresh IS allowed while a background refresh is in flight', () => {
    const c = createRefreshCoordinator()
    c.begin(true)
    expect(c.begin(false)).not.toBeNull()
  })

  it('second silent refresh while one is in flight is rejected', () => {
    const c = createRefreshCoordinator()
    c.begin(true)
    expect(c.begin(true)).toBeNull()
    c.settle(true)
  })
})

describe('createRefreshCoordinator — failure lifecycle', () => {
  it('settle after a failed fetch still returns to idle', () => {
    const c = createRefreshCoordinator()
    const id = c.begin(false)!
    // handleRefresh calls settle in `finally` whether the fetch resolved or
    // threw — model that: result never applied, request settles.
    expect(c.isStale(id)).toBe(false)
    expect(c.settle(false)).toEqual({ refreshing: false, manualRefreshing: false })
  })
})

describe('createRefreshCoordinator — repeated edits', () => {
  it('a second edit after the first settles starts fresh and returns to idle', () => {
    const c = createRefreshCoordinator()
    const first = c.begin(false)!
    c.settle(false)

    const second = c.begin(false)
    expect(second).not.toBeNull()
    expect(second).toBeGreaterThan(first)
    expect(c.settle(false)).toEqual({ refreshing: false, manualRefreshing: false })
  })

  it('many sequential manual refreshes never leak in-flight count', () => {
    const c = createRefreshCoordinator()
    for (let i = 0; i < 5; i++) {
      expect(c.begin(false)).not.toBeNull()
      expect(c.settle(false)).toEqual({ refreshing: false, manualRefreshing: false })
    }
    // Next begin still permitted — no leaked count blocking future refreshes.
    expect(c.begin(false)).not.toBeNull()
    c.settle(false)
  })
})

describe('createRefreshCoordinator — stale result guard', () => {
  it('only the newest request may apply its result', () => {
    const c = createRefreshCoordinator()
    const silentId = c.begin(true)!
    const manualId = c.begin(false)!
    expect(c.isStale(silentId)).toBe(true)
    expect(c.isStale(manualId)).toBe(false)
    c.settle(false)
    c.settle(true)
  })

  it('stale request still settles so in-flight bookkeeping drains', () => {
    const c = createRefreshCoordinator()
    const silentId = c.begin(true)!
    c.begin(false)
    expect(c.isStale(silentId)).toBe(true)
    // Silent result discarded by caller, but its finally still settles —
    // leaving the manual request's in-flight work accurately reflected.
    expect(c.settle(true)).toEqual({ refreshing: true, manualRefreshing: true })
    expect(c.settle(false)).toEqual({ refreshing: false, manualRefreshing: false })
  })
})

describe('createRefreshCoordinator — unmount safety', () => {
  it('settle with no UI consumer returns accurate flags and never throws', () => {
    const c = createRefreshCoordinator()
    c.begin(false)
    // Component unmounted mid-refresh: caller skips setState entirely; the
    // coordinator still resolves bookkeeping cleanly.
    const flags = c.settle(false)
    expect(flags).toEqual({ refreshing: false, manualRefreshing: false })
  })
})

describe('page-client refresh lifecycle wiring (source scan)', () => {
  it('handleRefresh dedup runs through the ref-backed coordinator, not render state', () => {
    expect(pageClient).toContain('createRefreshCoordinator')
    expect(pageClient).toContain('refreshCoordinatorRef.current.begin(silent)')
    expect(pageClient).toContain('requestId === null')
    // The state-based dedup reads that stale closures bypassed are gone.
    expect(pageClient).not.toContain('!silent && manualRefreshing) return')
    expect(pageClient).not.toContain('silent && refreshing) return')
  })

  it('stale refresh results are still discarded via the request version', () => {
    expect(pageClient).toContain('refreshCoordinatorRef.current.isStale(requestId)')
    expect(pageClient).toContain("logRealtimeSms('refetch-stale-response'")
  })

  it('every begun request settles exactly once in finally, clearing the manual flag', () => {
    const finallyBlock = pageClient.match(
      /\} finally \{[\s\S]*?refreshCoordinatorRef\.current\.settle\(silent\)[\s\S]*?setManualRefreshing\(flags\.manualRefreshing\)/
    )
    expect(finallyBlock).toBeTruthy()
    // The old silent-conditional clear — which stranded the label when a
    // silent request superseded a manual one — is gone.
    expect(pageClient).not.toMatch(/if \(!silent\) \{\s*setManualRefreshing\(false\)/)
  })
})
