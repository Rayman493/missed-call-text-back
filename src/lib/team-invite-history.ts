/**
 * Team Access invite-history reconciliation.
 *
 * The Team Access section lists current owner/members alongside historical
 * invite rows. A person who currently has access must never appear as
 * "Access Removed" — but invite rows persist as audit history after
 * acceptance, cancellation, or expiry, so the list must reconcile against
 * active memberships by the strongest identity available:
 *   1. team_invites.accepted_by === membership user_id  (auth identity)
 *   2. normalized phone (last-10 digits absorb +1/E.164/format drift between
 *      auth users.phone and the invite's stored phone)
 * Historical rows are filtered from display only — never deleted.
 */

export interface InviteHistoryEntry {
  id: string
  phone: string
  status: 'pending' | 'accepted' | 'cancelled' | 'expired' | string
  accepted_by?: string | null
  accepted_email?: string | null
  accepted_phone?: string | null
  created_at: string
}

export interface ActivePersonIdentity {
  user_id?: string | null
  phone?: string | null
  email?: string | null
}

/** US-centric phone key: last 10 digits when a country code is present. */
export function normalizePhoneKey(phone?: string | null): string {
  const digits = (phone || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

export function normalizeEmailKey(email?: string | null): string {
  return (email || '').trim().toLowerCase()
}

/** True when a historical invite belongs to someone who currently has access. */
export function inviteBelongsToActivePerson(
  invite: Pick<InviteHistoryEntry, 'accepted_by' | 'phone'>,
  activePeople: ActivePersonIdentity[]
): boolean {
  if (invite.accepted_by && activePeople.some((p) => p.user_id === invite.accepted_by)) {
    return true
  }
  const inviteKey = normalizePhoneKey(invite.phone)
  if (!inviteKey) return false
  return activePeople.some((p) => {
    const memberKey = normalizePhoneKey(p.phone)
    return Boolean(memberKey) && memberKey === inviteKey
  })
}

/**
 * Non-pending invites that do NOT belong to a current owner/member — the
 * only rows safe to render as invite history / "Access Removed".
 */
export function filterPastInvites<T extends InviteHistoryEntry>(
  invites: T[] | null | undefined,
  owner: ActivePersonIdentity | null | undefined,
  members: ActivePersonIdentity[] | null | undefined
): T[] {
  const activePeople = [owner, ...(members || [])].filter(
    (p): p is ActivePersonIdentity => Boolean(p)
  )
  return (invites || []).filter(
    (i) => i.status !== 'pending' && !inviteBelongsToActivePerson(i, activePeople)
  )
}

export interface UnifiedHistoryPerson {
  key: string
  displayEmail: string | null
  displayPhone: string | null
  statusLabel: string
  latestCreatedAt: string
}

/**
 * Reconcile non-pending invites into one record per removed person.
 *
 * A person who currently has access is completely suppressed (current state
 * wins). Remaining rows are grouped by accepted_by user_id when available,
 * otherwise by normalized phone. Accepted invites act as identity anchors:
 * any cancelled/expired invite that shares a phone with an accepted invite
 * collapses into that accepted-by user's group. The returned label is:
 *   - "Access removed" if any invite in the group was accepted
 *   - "Cancelled" / "Expired" otherwise
 */
export function reconcileTeamHistory(
  invites: InviteHistoryEntry[] | null | undefined,
  owner: ActivePersonIdentity | null | undefined,
  members: ActivePersonIdentity[] | null | undefined
): UnifiedHistoryPerson[] {
  const activePeople = [owner, ...(members || [])].filter(
    (p): p is ActivePersonIdentity => Boolean(p)
  )

  // Accepted invites are the strongest anchors for person identity. Build a
  // phone → accepted_by map so cancelled/expired rows for the same phone
  // collapse with the accepted row.
  const phoneToUser = new Map<string, string>()
  for (const invite of invites || []) {
    if (invite.status !== 'accepted' || !invite.accepted_by) continue
    const key = normalizePhoneKey(invite.phone)
    if (key && !phoneToUser.has(key)) phoneToUser.set(key, invite.accepted_by)
  }

  const groups = new Map<string, InviteHistoryEntry[]>()

  for (const invite of invites || []) {
    if (invite.status === 'pending') continue
    if (inviteBelongsToActivePerson(invite, activePeople)) continue

    let key: string
    if (invite.accepted_by) {
      key = `user:${invite.accepted_by}`
    } else {
      const phoneKey = normalizePhoneKey(invite.phone)
      const userId = phoneKey ? phoneToUser.get(phoneKey) : undefined
      key = userId ? `user:${userId}` : `phone:${phoneKey || invite.phone}`
    }
    const list = groups.get(key) || []
    list.push(invite)
    groups.set(key, list)
  }

  const results: UnifiedHistoryPerson[] = []
  for (const [key, list] of groups) {
    const latest = list.reduce((a, b) => (a.created_at > b.created_at ? a : b))

    let displayEmail: string | null = null
    let displayPhone: string | null = null
    for (const inv of list) {
      if (!displayEmail && inv.accepted_email) displayEmail = inv.accepted_email
      if (!displayPhone && inv.accepted_phone) displayPhone = inv.accepted_phone
    }
    if (!displayPhone) displayPhone = latest.phone

    let statusLabel = latest.status
    if (list.some((inv) => inv.status === 'accepted')) statusLabel = 'Access removed'
    else if (list.some((inv) => inv.status === 'cancelled')) statusLabel = 'Cancelled'
    else if (list.some((inv) => inv.status === 'expired')) statusLabel = 'Expired'

    results.push({
      key,
      displayEmail,
      displayPhone,
      statusLabel,
      latestCreatedAt: latest.created_at,
    })
  }

  return results.sort((a, b) => (a.latestCreatedAt > b.latestCreatedAt ? -1 : 1))
}
