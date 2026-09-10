import { describe, it, expect } from 'vitest'
import {
  mergeLeadRealtimeUpdate,
  replaceAuthoritativeChildSnapshot,
  mergeIncrementalChildRecords,
  reconcileScopedChildSnapshot,
  mergeLeadFetchResult,
} from '../lead-merge'

const mergeById = (existing: any[], incoming: any[], _label?: string): any[] => {
  const map = new Map<string, any>()
  for (const m of existing) if (m.id) map.set(m.id, m)
  for (const m of incoming) if (m.id) map.set(m.id, m)
  return Array.from(map.values())
}

const findById = (arr: any[], id: string): any => arr.find((x: any) => x.id === id)

// ---------------------------------------------------------------------------
// replaceAuthoritativeChildSnapshot
// ---------------------------------------------------------------------------

describe('replaceAuthoritativeChildSnapshot', () => {
  it('existing [A,B], incoming [A] => B removed (authoritative deletion)', () => {
    const existing = [{ id: 'A', title: 'Job A' }, { id: 'B', title: 'Job B' }]
    const incoming = [{ id: 'A', title: 'Job A' }]
    const result = replaceAuthoritativeChildSnapshot(existing, incoming)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('A')
    expect(findById(result, 'B')).toBeUndefined()
  })

  it('existing [A], incoming [A,B] => B added', () => {
    const existing = [{ id: 'A', title: 'Job A' }]
    const incoming = [{ id: 'A', title: 'Job A v2' }, { id: 'B', title: 'Job B' }]
    const result = replaceAuthoritativeChildSnapshot(existing, incoming)
    expect(result).toHaveLength(2)
    expect(findById(result, 'A').title).toBe('Job A v2')
    expect(findById(result, 'B').title).toBe('Job B')
  })

  it('matching IDs update correctly', () => {
    const existing = [{ id: '1', status: 'pending' }]
    const incoming = [{ id: '1', status: 'completed' }]
    const result = replaceAuthoritativeChildSnapshot(existing, incoming)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('completed')
  })

  it('explicit null clears the list', () => {
    const existing = [{ id: '1' }, { id: '2' }]
    const result = replaceAuthoritativeChildSnapshot(existing, null)
    expect(result).toEqual([])
  })

  it('undefined incoming preserves existing (no snapshot available)', () => {
    const existing = [{ id: '1' }, { id: '2' }]
    const result = replaceAuthoritativeChildSnapshot(existing, undefined)
    expect(result).toEqual(existing)
  })

  it('handles empty existing', () => {
    const result = replaceAuthoritativeChildSnapshot([], [{ id: '1' }])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('handles empty incoming (authoritative: all removed)', () => {
    const existing = [{ id: '1' }, { id: '2' }]
    const result = replaceAuthoritativeChildSnapshot(existing, [])
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// mergeIncrementalChildRecords
// ---------------------------------------------------------------------------

describe('mergeIncrementalChildRecords', () => {
  it('dedupes inserts by ID', () => {
    const existing = [{ id: '1', title: 'Job 1' }]
    const incoming = [{ id: '1', title: 'Job 1 Updated' }, { id: '2', title: 'Job 2' }]
    const result = mergeIncrementalChildRecords(existing, incoming)
    expect(result).toHaveLength(2)
    expect(findById(result, '1').title).toBe('Job 1 Updated')
    expect(findById(result, '2').title).toBe('Job 2')
  })

  it('merges updates by ID', () => {
    const existing = [{ id: '1', status: 'pending' }, { id: '2', status: 'pending' }]
    const incoming = [{ id: '1', status: 'completed' }]
    const result = mergeIncrementalChildRecords(existing, incoming)
    expect(findById(result, '1').status).toBe('completed')
    expect(findById(result, '2').status).toBe('pending')
  })

  it('absence does NOT imply deletion (partial response)', () => {
    const existing = [{ id: '1', title: 'New Job' }]
    const incoming = [{ id: '2', title: 'Old Job' }]
    const result = mergeIncrementalChildRecords(existing, incoming)
    expect(result).toHaveLength(2)
    expect(findById(result, '1').title).toBe('New Job')
    expect(findById(result, '2').title).toBe('Old Job')
  })

  it('explicit null clears the list', () => {
    const existing = [{ id: '1' }, { id: '2' }]
    const result = mergeIncrementalChildRecords(existing, null)
    expect(result).toEqual([])
  })

  it('undefined incoming preserves existing', () => {
    const existing = [{ id: '1' }, { id: '2' }]
    const result = mergeIncrementalChildRecords(existing, undefined)
    expect(result).toEqual(existing)
  })

  it('handles empty existing', () => {
    const result = mergeIncrementalChildRecords([], [{ id: '1' }])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('handles empty incoming (preserves existing — partial contract)', () => {
    const existing = [{ id: '1' }, { id: '2' }]
    const result = mergeIncrementalChildRecords(existing, [])
    expect(result).toEqual(existing)
  })
})

// ---------------------------------------------------------------------------
// mergeLeadRealtimeUpdate
// ---------------------------------------------------------------------------

describe('mergeLeadRealtimeUpdate', () => {
  it('returns updatedLead when prev is null', () => {
    const result = mergeLeadRealtimeUpdate(null, { id: '1', name: 'Alice' })
    expect(result).toEqual({ id: '1', name: 'Alice' })
  })

  it('returns prev when updatedLead is null', () => {
    const result = mergeLeadRealtimeUpdate({ id: '1', name: 'Alice' }, null)
    expect(result).toEqual({ id: '1', name: 'Alice' })
  })

  it('preserves existing fields when realtime payload omits them (undefined)', () => {
    const prev = { id: '1', name: 'Alice', phone: '555-1234', status: 'active' }
    const updatedLead = { id: '1', name: 'Alice B' }
    const result = mergeLeadRealtimeUpdate(prev, updatedLead)
    expect(result.name).toBe('Alice B')
    expect(result.phone).toBe('555-1234')
    expect(result.status).toBe('active')
  })

  it('explicit null clears intentionally (SQL NULL)', () => {
    // Supabase realtime sends full row; null = SQL NULL.
    const prev = { id: '1', name: 'Alice', phone: '555-1234' }
    const updatedLead = { id: '1', phone: null }
    const result = mergeLeadRealtimeUpdate(prev, updatedLead)
    expect(result.phone).toBeNull()
    expect(result.name).toBe('Alice')
  })

  it('deep-merges raw_metadata without erasing unrelated keys', () => {
    const prev = {
      id: '1',
      raw_metadata: { extracted_info: { callerName: 'Alice' }, corrected_fields: { email: 'a@b.com' } },
    }
    const updatedLead = {
      id: '1',
      raw_metadata: { extracted_info: { callerName: 'Alice 2' } },
    }
    const result = mergeLeadRealtimeUpdate(prev, updatedLead)
    expect(result.raw_metadata.extracted_info.callerName).toBe('Alice 2')
    expect(result.raw_metadata.corrected_fields.email).toBe('a@b.com')
  })

  it('protects status from regression when local _statusUpdatedAt is newer', () => {
    const prev = {
      id: '1',
      status: 'completed',
      _statusUpdatedAt: '2024-01-01T12:00:00.000Z',
    }
    const updatedLead = {
      id: '1',
      status: 'active',
      updated_at: '2024-01-01T11:00:00.000Z',
    }
    const result = mergeLeadRealtimeUpdate(prev, updatedLead)
    expect(result.status).toBe('completed')
  })

  it('allows status update when realtime is newer than local mutation', () => {
    const prev = {
      id: '1',
      status: 'active',
      _statusUpdatedAt: '2024-01-01T11:00:00.000Z',
    }
    const updatedLead = {
      id: '1',
      status: 'completed',
      updated_at: '2024-01-01T12:00:00.000Z',
    }
    const result = mergeLeadRealtimeUpdate(prev, updatedLead)
    expect(result.status).toBe('completed')
  })

  it('preserves embedded child lists from prev (realtime payload has no child lists)', () => {
    const prev = {
      id: '1',
      name: 'Alice',
      messages: [{ id: 'm1' }],
      paymentRequests: [{ id: 'pr1' }],
    }
    // Realtime leads UPDATE: only leads table columns, no embedded child lists.
    const updatedLead = {
      id: '1',
      name: 'Alice 2',
      status: 'active',
      updated_at: '2024-01-01T12:00:00.000Z',
    }
    const result = mergeLeadRealtimeUpdate(prev, updatedLead)
    expect(result.messages).toEqual([{ id: 'm1' }])
    expect(result.paymentRequests).toEqual([{ id: 'pr1' }])
    expect(result.name).toBe('Alice 2')
  })
})

// ---------------------------------------------------------------------------
// mergeLeadFetchResult
// ---------------------------------------------------------------------------

describe('mergeLeadFetchResult', () => {
  it('returns next when prev is null', () => {
    const next = { id: '1', name: 'Alice', messages: [] }
    const result = mergeLeadFetchResult(null, next, mergeById)
    expect(result).toEqual(next)
  })

  it('returns prev when next is null', () => {
    const prev = { id: '1', name: 'Alice', messages: [] }
    const result = mergeLeadFetchResult(prev, null, mergeById)
    expect(result).toEqual(prev)
  })

  it('merges messages by ID (optimistic messages preserved)', () => {
    const prev = { id: '1', messages: [{ id: 'm1', text: 'old' }] }
    const next = { id: '1', messages: [{ id: 'm1', text: 'new' }, { id: 'm2', text: 'new msg' }] }
    const result = mergeLeadFetchResult(prev, next, mergeById)
    expect(result.messages).toHaveLength(2)
    expect(findById(result.messages, 'm1').text).toBe('new')
  })

  it('paymentRequests: AUTHORITATIVE replacement (missing IDs removed)', () => {
    const prev = {
      id: '1',
      messages: [],
      paymentRequests: [{ id: 'pr1', amount: 100 }, { id: 'pr2', amount: 200 }],
    }
    const next = {
      id: '1',
      messages: [],
      paymentRequests: [{ id: 'pr1', amount: 150 }],
    }
    const result = mergeLeadFetchResult(prev, next, mergeById)
    // pr2 is absent from the authoritative snapshot => removed.
    expect(result.paymentRequests).toHaveLength(1)
    expect(findById(result.paymentRequests, 'pr1').amount).toBe(150)
    expect(findById(result.paymentRequests, 'pr2')).toBeUndefined()
  })

  it('followUpJobs: AUTHORITATIVE replacement', () => {
    const prev = {
      id: '1',
      messages: [],
      followUpJobs: [{ id: 'j1', title: 'Job 1' }, { id: 'j2', title: 'Job 2' }],
    }
    const next = {
      id: '1',
      messages: [],
      followUpJobs: [{ id: 'j1', title: 'Job 1 Updated' }],
    }
    const result = mergeLeadFetchResult(prev, next, mergeById)
    expect(result.followUpJobs).toHaveLength(1)
    expect(findById(result.followUpJobs, 'j1').title).toBe('Job 1 Updated')
    expect(findById(result.followUpJobs, 'j2')).toBeUndefined()
  })

  it('aiCallRecords: AUTHORITATIVE replacement', () => {
    const prev = {
      id: '1',
      messages: [],
      aiCallRecords: [{ id: 'ai1' }, { id: 'ai2' }],
    }
    const next = {
      id: '1',
      messages: [],
      aiCallRecords: [{ id: 'ai1', outcome: 'success' }],
    }
    const result = mergeLeadFetchResult(prev, next, mergeById)
    expect(result.aiCallRecords).toHaveLength(1)
    expect(findById(result.aiCallRecords, 'ai1').outcome).toBe('success')
    expect(findById(result.aiCallRecords, 'ai2')).toBeUndefined()
  })

  it('voicemailRecordings: AUTHORITATIVE replacement', () => {
    const prev = {
      id: '1',
      messages: [],
      voicemailRecordings: [{ id: 'vm1' }, { id: 'vm2' }],
    }
    const next = {
      id: '1',
      messages: [],
      voicemailRecordings: [{ id: 'vm1' }],
    }
    const result = mergeLeadFetchResult(prev, next, mergeById)
    expect(result.voicemailRecordings).toHaveLength(1)
    expect(findById(result.voicemailRecordings, 'vm2')).toBeUndefined()
  })

  it('protects status from stale fetch when local _statusUpdatedAt is newer', () => {
    const prev = {
      id: '1',
      messages: [],
      status: 'completed',
      _statusUpdatedAt: '2024-01-01T12:00:00.000Z',
    }
    const next = {
      id: '1',
      messages: [],
      status: 'active',
      updated_at: '2024-01-01T11:00:00.000Z',
    }
    const result = mergeLeadFetchResult(prev, next, mergeById)
    expect(result.status).toBe('completed')
    expect(result._statusUpdatedAt).toBe('2024-01-01T12:00:00.000Z')
  })

  it('allows status update from fetch when fetch is newer', () => {
    const prev = {
      id: '1',
      messages: [],
      status: 'active',
      _statusUpdatedAt: '2024-01-01T11:00:00.000Z',
    }
    const next = {
      id: '1',
      messages: [],
      status: 'completed',
      updated_at: '2024-01-01T12:00:00.000Z',
    }
    const result = mergeLeadFetchResult(prev, next, mergeById)
    expect(result.status).toBe('completed')
  })
})

// ---------------------------------------------------------------------------
// reconcileScopedChildSnapshot (time-bounded authoritative replacement)
// ---------------------------------------------------------------------------

describe('reconcileScopedChildSnapshot', () => {
  const getStartMs = (item: any) => {
    if (item.start?.dateTime) return new Date(item.start.dateTime).getTime()
    if (item.start?.date) return new Date(item.start.date).getTime()
    return 0
  }

  // Window: 2024-01-01 to 2024-04-01 (120 days)
  const windowStart = new Date('2024-01-01').getTime()
  const windowEnd = new Date('2024-04-01').getTime()

  it('replaces inside-window items authoritatively (missing = deleted)', () => {
    const existing = [
      { id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' } }, // inside
      { id: 'B', start: { dateTime: '2024-02-20T10:00:00Z' } }, // inside
    ]
    const incoming = [{ id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' } }] // B deleted
    const result = reconcileScopedChildSnapshot(existing, incoming, windowStart, windowEnd, getStartMs)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('A')
    expect(findById(result, 'B')).toBeUndefined() // deleted inside window
  })

  it('preserves outside-window items (before window)', () => {
    const existing = [
      { id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' } }, // inside
      { id: 'OLD', start: { dateTime: '2023-11-15T10:00:00Z' } }, // before window
    ]
    const incoming = [{ id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' } }]
    const result = reconcileScopedChildSnapshot(existing, incoming, windowStart, windowEnd, getStartMs)
    expect(result).toHaveLength(2)
    expect(findById(result, 'OLD')).toBeDefined() // preserved (outside window)
    expect(findById(result, 'A')).toBeDefined()
  })

  it('preserves outside-window items (after window)', () => {
    const existing = [
      { id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' } }, // inside
      { id: 'FUTURE', start: { dateTime: '2024-06-15T10:00:00Z' } }, // after window
    ]
    const incoming = [{ id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' } }]
    const result = reconcileScopedChildSnapshot(existing, incoming, windowStart, windowEnd, getStartMs)
    expect(result).toHaveLength(2)
    expect(findById(result, 'FUTURE')).toBeDefined() // preserved
  })

  it('adds new inside-window items from incoming', () => {
    const existing = [{ id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' } }]
    const incoming = [
      { id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' } },
      { id: 'NEW', start: { dateTime: '2024-03-01T10:00:00Z' } },
    ]
    const result = reconcileScopedChildSnapshot(existing, incoming, windowStart, windowEnd, getStartMs)
    expect(result).toHaveLength(2)
    expect(findById(result, 'NEW')).toBeDefined()
  })

  it('updates matching inside-window IDs', () => {
    const existing = [{ id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' }, summary: 'Old' }]
    const incoming = [{ id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' }, summary: 'New' }]
    const result = reconcileScopedChildSnapshot(existing, incoming, windowStart, windowEnd, getStartMs)
    expect(findById(result, 'A').summary).toBe('New')
  })

  it('delete mutation: deleted appointment disappears, stale fetch cannot resurrect', () => {
    // 1. Appointment A visible inside window.
    const stateBefore = [{ id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' } }]
    // 2. Delete A → post-mutation refetch returns empty for this window.
    const afterDelete = reconcileScopedChildSnapshot(stateBefore, [], windowStart, windowEnd, getStartMs)
    expect(findById(afterDelete, 'A')).toBeUndefined()
    // 3. Stale fetch (older generation) containing A is rejected by gen guard.
    // 4. Newer revalidation confirms A is gone.
    const afterRevalidation = reconcileScopedChildSnapshot(afterDelete, [], windowStart, windowEnd, getStartMs)
    expect(findById(afterRevalidation, 'A')).toBeUndefined()
  })

  it('outside-window appointment is not accidentally removed by scoped replacement', () => {
    const existing = [
      { id: 'A', start: { dateTime: '2024-02-15T10:00:00Z' } }, // inside
      { id: 'OUT', start: { dateTime: '2023-11-15T10:00:00Z' } }, // outside (before)
    ]
    // Incoming is empty (e.g. all inside-window appointments deleted)
    const result = reconcileScopedChildSnapshot(existing, [], windowStart, windowEnd, getStartMs)
    expect(findById(result, 'OUT')).toBeDefined() // preserved
    expect(findById(result, 'A')).toBeUndefined() // inside-window deleted
  })

  it('handles all-day-date events (start.date instead of start.dateTime)', () => {
    const existing = [{ id: 'A', start: { date: '2024-02-15' } }] // inside window
    const incoming: any[] = []
    const result = reconcileScopedChildSnapshot(existing, incoming, windowStart, windowEnd, getStartMs)
    expect(findById(result, 'A')).toBeUndefined() // inside window, deleted
  })

  it('explicit null clears everything', () => {
    const existing = [{ id: 'A' }, { id: 'B' }]
    const result = reconcileScopedChildSnapshot(existing, null, windowStart, windowEnd, getStartMs)
    expect(result).toEqual([])
  })

  it('undefined incoming preserves existing', () => {
    const existing = [{ id: 'A' }, { id: 'B' }]
    const result = reconcileScopedChildSnapshot(existing, undefined, windowStart, windowEnd, getStartMs)
    expect(result).toEqual(existing)
  })
})

// ---------------------------------------------------------------------------
// Stale-request rejection simulation
// (The actual generation guards live in page-client.tsx; these tests prove
//  the merge helpers behave correctly when the caller has already accepted
//  only the newest response.)
// ---------------------------------------------------------------------------

describe('Stale-request rejection (merge helper behavior)', () => {
  it('newer snapshot applies: existing [A,B], newer incoming [A] => B removed', () => {
    // Simulates: stale fetch ignored, newer fetch applied.
    const existing = [{ id: 'A' }, { id: 'B' }]
    const newerIncoming = [{ id: 'A' }]
    const result = replaceAuthoritativeChildSnapshot(existing, newerIncoming)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('A')
  })

  it('older snapshot resolving later is ignored (caller rejects via generation guard)', () => {
    // The merge helper itself doesn't reject stale responses — the caller's
    // generation guard does. This test documents that if the caller correctly
    // only applies the newest response, the result is correct.
    const existing = [{ id: 'A' }]
    const newerIncoming = [{ id: 'A' }, { id: 'B' }] // newer fetch includes B
    const result = replaceAuthoritativeChildSnapshot(existing, newerIncoming)
    expect(result).toHaveLength(2)
    expect(findById(result, 'B')).toBeDefined()
  })

  it('older response cannot resurrect deleted item (authoritative + gen guard)', () => {
    // 1. Delete B locally (removed from state).
    // 2. Stale fetch (gen 1) that ran before the delete completes with [A,B].
    // 3. Gen guard rejects it (gen 1 < current gen).
    // 4. Newer revalidation fetch (gen 2) completes with [A] — applied.
    // Result: B stays deleted.
    const stateAfterDelete = [{ id: 'A' }]
    const newerRevalidation = [{ id: 'A' }]
    const result = replaceAuthoritativeChildSnapshot(stateAfterDelete, newerRevalidation)
    expect(result).toHaveLength(1)
    expect(findById(result, 'B')).toBeUndefined()
  })

  it('older response cannot remove newly created item (authoritative + gen guard)', () => {
    // 1. Create C locally (added to state).
    // 2. Stale fetch (gen 1) that ran before the create completes with [A,B].
    // 3. Gen guard rejects it (gen 1 < current gen).
    // 4. Newer revalidation fetch (gen 2) completes with [A,B,C] — applied.
    // Result: C is present.
    const stateAfterCreate = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
    const newerRevalidation = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
    const result = replaceAuthoritativeChildSnapshot(stateAfterCreate, newerRevalidation)
    expect(result).toHaveLength(3)
    expect(findById(result, 'C')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Partial response (incremental merge)
// ---------------------------------------------------------------------------

describe('Partial response (incremental merge)', () => {
  it('absence does not imply deletion when endpoint contract is partial', () => {
    // Appointments endpoint returns a time-bounded subset.
    // An appointment outside the window is absent but NOT deleted.
    const existing = [
      { id: 'apt1', start: '2024-01-15' }, // inside window
      { id: 'apt2', start: '2024-06-15' },  // outside window (not returned)
    ]
    const incoming = [{ id: 'apt1', start: '2024-01-15' }] // only in-window
    const result = mergeIncrementalChildRecords(existing, incoming)
    expect(result).toHaveLength(2) // apt2 preserved
    expect(findById(result, 'apt2')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Null semantics (source-specific)
// ---------------------------------------------------------------------------

describe('Null semantics (source-specific)', () => {
  it('explicit persisted null clears where source contract guarantees it (realtime full row)', () => {
    // Supabase realtime UPDATE sends full row; null = SQL NULL.
    const prev = { id: '1', name: 'Alice', phone: '555-1234' }
    const updatedLead = { id: '1', name: 'Alice', phone: null }
    const result = mergeLeadRealtimeUpdate(prev, updatedLead)
    expect(result.phone).toBeNull()
  })

  it('absent/undefined field preserves existing value', () => {
    const prev = { id: '1', name: 'Alice', phone: '555-1234' }
    const updatedLead = { id: '1', name: 'Alice 2' } // phone omitted
    const result = mergeLeadRealtimeUpdate(prev, updatedLead)
    expect(result.phone).toBe('555-1234')
  })

  it('realtime null behavior matches actual Supabase contract (full row, null = SQL NULL)', () => {
    // Evidence: https://supabase.com/docs/guides/realtime/postgres-changes
    // "By default each change event contains the full row."
    // The codebase subscription does NOT use `select`, so payload.new is full row.
    // null in payload.new = SQL NULL. No undefined fields occur.
    const prev = {
      id: '1',
      contact_name: 'Alice',
      caller_phone: '555-1234',
      status: 'active',
      raw_metadata: { extracted_info: { callerName: 'Alice' } },
    }
    // Full row from realtime: all columns present, null = SQL NULL.
    const updatedLead = {
      id: '1',
      contact_name: 'Alice',
      caller_phone: '555-1234',
      status: 'active',
      email: null, // SQL NULL in database
      raw_metadata: { extracted_info: { callerName: 'Alice 2' } },
      updated_at: '2024-01-01T12:00:00.000Z',
    }
    const result = mergeLeadRealtimeUpdate(prev, updatedLead)
    expect(result.email).toBeNull() // honored as SQL NULL
    expect(result.raw_metadata.extracted_info.callerName).toBe('Alice 2')
    expect(result.contact_name).toBe('Alice')
  })
})
