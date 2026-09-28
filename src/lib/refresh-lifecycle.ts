// Refresh lifecycle bookkeeping for the conversation page.
//
// Dedup and in-flight tracking live in a coordinator object — never in React
// state — because realtime subscription callbacks, the foreground-sync
// listener, and the stuck-message interval capture a render-time closure of
// `handleRefresh`. Reading `refreshing`/`manualRefreshing` state inside those
// callbacks sees whatever the flags were when the effect ran (almost always
// false), which previously let a silent refresh slip past the dedup guard,
// supersede a manual request, and then clear only `refreshing` — stranding
// the visible "Refreshing…" label forever.
//
// Flags are derived from in-flight work: every begun request settles exactly
// once, and the UI returns to idle only when no request remains. A superseded
// or stale request can neither clear the flags early nor leave them set.

export interface RefreshFlags {
  refreshing: boolean
  manualRefreshing: boolean
}

export interface RefreshCoordinator {
  /**
   * Decide whether a new refresh may start.
   * Returns the new request id, or null when the request is deduped away:
   * a manual refresh never overlaps another manual refresh (rapid-tap
   * protection) and a background refresh never overlaps ANY in-flight
   * refresh. A manual request IS allowed while a background refresh runs so
   * the user always gets visible feedback.
   */
  begin: (silent: boolean) => number | null
  /**
   * True when a completed request's result must be discarded because a newer
   * request has already begun.
   */
  isStale: (requestId: number) => boolean
  /**
   * Mark a begun request finished. Must be called exactly once per begin that
   * returned an id (the caller's finally block). Returns the flag state the
   * UI should apply — reflecting work actually still in flight.
   */
  settle: (silent: boolean) => RefreshFlags
}

export function createRefreshCoordinator(): RefreshCoordinator {
  let latestRequestId = 0
  let inFlight = 0
  let manualInFlight = false

  return {
    begin(silent: boolean): number | null {
      if (!silent && manualInFlight) return null
      if (silent && inFlight > 0) return null
      latestRequestId += 1
      inFlight += 1
      if (!silent) manualInFlight = true
      return latestRequestId
    },
    isStale(requestId: number): boolean {
      return requestId !== latestRequestId
    },
    settle(silent: boolean): RefreshFlags {
      inFlight = Math.max(0, inFlight - 1)
      if (!silent) manualInFlight = false
      return { refreshing: inFlight > 0, manualRefreshing: manualInFlight }
    },
  }
}
