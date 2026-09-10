/**
 * Lead/customer data merge utilities.
 *
 * These helpers prevent persisted customer data from disappearing or
 * regressing when a stale, partial, or out-of-order response arrives from
 * the server, realtime, or app-resume refetch.
 *
 * DESIGN PRINCIPLES (see REPLYFLOW PRE-LAUNCH BATCH 2 CORRECTION PASS):
 *
 *  1. Distinguish AUTHORITATIVE SNAPSHOTS from PARTIAL/INCREMENTAL responses.
 *     - Authoritative: incoming list is canonical. Missing IDs are deleted.
 *     - Incremental: merge by ID. Absence does NOT imply deletion.
 *
 *  2. Stale-request rejection happens BEFORE reconciliation (request generation
 *     guards in the caller). A stale response never reaches merge logic.
 *
 *  3. Mutation race safety: after a mutation succeeds, the caller bumps the
 *     request generation so any in-flight stale fetch is rejected. The
 *     post-mutation revalidation fetch (newest generation) is applied.
 *
 *  4. Null semantics are source-specific:
 *     - Supabase realtime `leads` UPDATE: payload.new is a FULL row (all
 *       columns). `null` means SQL NULL. No `undefined` fields occur.
 *       See: https://supabase.com/docs/guides/realtime/postgres-changes
 *     - API fetch results: full objects. `null` means SQL NULL.
 *     - Both honor `null` as intentional clearing.
 *
 *  5. Status regression protection: if local `_statusUpdatedAt` is newer
 *     than the incoming `updated_at`, the local status is preserved.
 */

// ---------------------------------------------------------------------------
// Authoritative snapshot replacement
// ---------------------------------------------------------------------------

/**
 * Replace the existing child list with an authoritative server snapshot.
 *
 * Contract: `incoming` is a COMPLETE list for this scope (e.g. all jobs for
 * a lead). Stale-request protection must have already confirmed this is the
 * newest accepted response BEFORE calling this function.
 *
 * Behavior:
 *  - Matching IDs: incoming overwrites existing.
 *  - New IDs: added.
 *  - IDs absent from incoming: REMOVED (authoritative deletion).
 *  - Explicit `null` incoming: clears the list.
 *  - `undefined` incoming: preserves existing (no snapshot available).
 */
export function replaceAuthoritativeChildSnapshot<T extends { id: string }>(
  existing: T[] | undefined | null,
  incoming: T[] | undefined | null
): T[] {
  // Explicit null clears intentionally.
  if (incoming === null) return []
  // Undefined means no snapshot available — preserve existing.
  if (incoming === undefined) return existing || []

  // Authoritative replacement: incoming is canonical.
  // Sort by created_at if available for stable ordering.
  return [...incoming].sort((a, b) => {
    const aTime = (a as any).created_at ? new Date((a as any).created_at as string).getTime() : 0
    const bTime = (b as any).created_at ? new Date((b as any).created_at as string).getTime() : 0
    return aTime - bTime
  })
}

// ---------------------------------------------------------------------------
// Incremental / partial merge
// ---------------------------------------------------------------------------

/**
 * Merge a partial/incremental child-list response into the existing list.
 *
 * Contract: `incoming` is a PARTIAL or FILTERED subset (e.g. appointments
 * within a time window, or an incremental realtime update). Absence from
 * `incoming` does NOT imply deletion.
 *
 * Behavior:
 *  - Matching IDs: incoming overwrites existing.
 *  - New IDs: added (deduped by ID).
 *  - IDs absent from incoming: PRESERVED (not deleted).
 *  - Explicit `null` incoming: clears the list intentionally.
 *  - `undefined` incoming: preserves existing.
 */
export function mergeIncrementalChildRecords<T extends { id: string }>(
  existing: T[] | undefined | null,
  incoming: T[] | undefined | null
): T[] {
  // Explicit null clears intentionally.
  if (incoming === null) return []
  if (incoming === undefined) return existing || []

  const map = new Map<string, T>()

  // Seed with existing items — absence from partial incoming is NOT deletion.
  for (const item of existing || []) {
    if (item?.id) map.set(item.id, item)
  }

  // Incoming items overwrite by ID and add new items (dedupe by ID).
  for (const item of incoming) {
    if (item?.id) map.set(item.id, item)
  }

  return Array.from(map.values())
}

// ---------------------------------------------------------------------------
// Scoped authoritative replacement (for time-bounded queries)
// ---------------------------------------------------------------------------

/**
 * Reconcile a time-bounded child-list snapshot against existing state.
 *
 * Contract: `incoming` is an AUTHORITATIVE SNAPSHOT for the time window
 * [windowStart, windowEnd). Items inside the window are replaced
 * authoritatively (missing IDs = deleted/no longer present). Items outside
 * the window are preserved (the query didn't ask about them).
 *
 * Behavior:
 *  - Existing items with start time INSIDE [windowStart, windowEnd):
 *    replaced by incoming. Missing IDs removed. Matching IDs updated. New IDs added.
 *  - Existing items with start time OUTSIDE [windowStart, windowEnd): preserved.
 *  - Explicit `null` incoming: clears the list entirely.
 *  - `undefined` incoming: preserves existing (no snapshot available).
 *
 * `getStartTime` extracts a comparable epoch ms from an item.
 */
export function reconcileScopedChildSnapshot<T extends { id: string }>(
  existing: T[] | undefined | null,
  incoming: T[] | undefined | null,
  windowStart: number,
  windowEnd: number,
  getStartTime: (item: T) => number
): T[] {
  if (incoming === null) return []
  if (incoming === undefined) return existing || []

  const result: T[] = []

  // Preserve existing items OUTSIDE the queried window.
  for (const item of existing || []) {
    const startMs = getStartTime(item)
    if (startMs < windowStart || startMs >= windowEnd) {
      result.push(item)
    }
  }

  // Replace inside-window items with the authoritative snapshot.
  for (const item of incoming) {
    if (item?.id) result.push(item)
  }

  return result
}

// ---------------------------------------------------------------------------
// Realtime lead update merge
// ---------------------------------------------------------------------------

/**
 * Merge a Supabase realtime `leads` UPDATE payload into the current leadData.
 *
 * Evidence (Supabase docs + codebase):
 *  - Supabase postgres_changes UPDATE events send the FULL row by default
 *    (all columns). `payload.new` contains every column of the `leads` table.
 *  - `null` in a field means actual SQL NULL — honor it.
 *  - No `undefined` fields occur in practice (all columns are present).
 *  - The realtime payload does NOT contain embedded child lists (messages,
 *    paymentRequests, etc.) — those are added by the /api/lead-details route.
 *    Object spread preserves them from `prev`.
 *
 * Rules:
 *  - Skip `undefined` fields (defensive — shouldn't occur with full-row payloads).
 *  - Honor `null` as SQL NULL (intentional clearing).
 *  - Deep-merge `raw_metadata` so partial metadata updates don't erase
 *    unrelated metadata keys.
 *  - Status regression protection: if local `_statusUpdatedAt` is newer than
 *    the incoming `updated_at`, preserve local status.
 *  - Embedded child lists (messages, paymentRequests, etc.) are preserved
 *    from `prev` because the realtime payload doesn't contain them.
 */
export function mergeLeadRealtimeUpdate(prev: any, updatedLead: any): any {
  if (!prev) return updatedLead
  if (!updatedLead) return prev

  const merged: any = { ...prev }

  for (const key of Object.keys(updatedLead)) {
    const incomingValue = updatedLead[key]

    // Skip undefined — preserves existing value (defensive for partial payloads).
    if (incomingValue === undefined) continue

    // Status regression protection: if the local status was recently
    // mutated (tracked via _statusUpdatedAt), and the realtime payload
    // carries an older status, keep the local status.
    if (key === 'status' && prev._statusUpdatedAt) {
      const localStatusAt = new Date(prev._statusUpdatedAt).getTime()
      const leadUpdatedAt = updatedLead.updated_at
        ? new Date(updatedLead.updated_at).getTime()
        : 0
      if (localStatusAt > leadUpdatedAt) {
        // Local mutation is newer — preserve it.
        continue
      }
    }

    // Deep-merge raw_metadata to avoid erasing unrelated metadata keys.
    if (key === 'raw_metadata' && prev.raw_metadata && incomingValue && typeof incomingValue === 'object') {
      merged.raw_metadata = { ...prev.raw_metadata, ...incomingValue }
      continue
    }

    // Explicit null clears intentionally (SQL NULL); all other defined values overwrite.
    merged[key] = incomingValue
  }

  return merged
}

// ---------------------------------------------------------------------------
// Full fetch / refresh / resume merge
// ---------------------------------------------------------------------------

/**
 * Merge a full fetch/refresh/resume result into the current leadData.
 *
 * Used by handleRefresh, initial fetch, and app-resume refetch.
 *
 * The /api/lead-details endpoint returns AUTHORITATIVE SNAPSHOTS for all
 * embedded child lists (no pagination, no filtering by time window):
 *  - messages (all for lead)
 *  - paymentRequests (all for lead)
 *  - followUpJobs (all for lead)
 *  - aiCallRecords (all for lead)
 *  - voicemailRecordings (all for lead)
 *
 * Rules:
 *  - If `prev` is null, accept `next` as-is.
 *  - Messages are merged by ID (via caller-supplied mergeMessages) to
 *    preserve optimistic messages that haven't been persisted yet.
 *  - paymentRequests, followUpJobs, aiCallRecords, voicemailRecordings use
 *    AUTHORITATIVE replacement (incoming is canonical, missing IDs removed).
 *    Stale-request protection must have already confirmed this is the newest
 *    accepted response.
 *  - Status regression protection: if local _statusUpdatedAt is newer than
 *    next.updated_at, preserve local status.
 */
export function mergeLeadFetchResult(
  prev: any,
  next: any,
  mergeMessages: (existing: any[], incoming: any[], label?: string) => any[]
): any {
  if (!prev) return next
  if (!next) return prev

  const existingMessages = prev.messages || []
  const newMessages = next.messages || []
  const mergedMessages = mergeMessages(existingMessages, newMessages, 'fetch-merge')

  const merged: any = {
    ...next,
    messages: mergedMessages,
    // Authoritative replacement for embedded child lists (full snapshots).
    paymentRequests: replaceAuthoritativeChildSnapshot(prev.paymentRequests, next.paymentRequests),
    followUpJobs: replaceAuthoritativeChildSnapshot(prev.followUpJobs, next.followUpJobs),
    aiCallRecords: replaceAuthoritativeChildSnapshot(prev.aiCallRecords, next.aiCallRecords),
    voicemailRecordings: replaceAuthoritativeChildSnapshot(prev.voicemailRecordings, next.voicemailRecordings),
  }

  // Status regression protection: preserve local status if it was
  // mutated more recently than the fetch result's updated_at.
  if (prev._statusUpdatedAt && next.updated_at) {
    const localStatusAt = new Date(prev._statusUpdatedAt).getTime()
    const fetchUpdatedAt = new Date(next.updated_at).getTime()
    if (localStatusAt > fetchUpdatedAt) {
      merged.status = prev.status
      merged._statusUpdatedAt = prev._statusUpdatedAt
    }
  }

  return merged
}
