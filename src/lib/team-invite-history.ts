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
