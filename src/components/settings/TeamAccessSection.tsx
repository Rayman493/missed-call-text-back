'use client'

import { useCallback, useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber } from '@/lib/utils'
import { MAX_PENDING_TEAM_INVITES_PER_BUSINESS } from '@/lib/team-limits'

type MemberEntry = {
  membership_id: string
  user_id: string
  role: 'owner' | 'member'
  email: string | null
  phone: string | null
  joined_at: string
}

type InviteEntry = {
  id: string
  phone: string
  status: 'pending' | 'accepted' | 'cancelled' | 'expired'
  expires_at: string
  created_at: string
}

type TeamData = {
  role: 'owner' | 'member'
  business_name: string | null
  owner?: MemberEntry | null
  members?: MemberEntry[]
  invites?: InviteEntry[]
}

/**
 * Team Access settings surface.
 * Owner: full management (invite, resend, cancel, revoke).
 * Member: read-only "you are a member" surface — no management actions.
 */
export default function TeamAccessSection() {
  const supabase = createBrowserClient()
  const { business, role } = useBusiness()

  const [team, setTeam] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [invitePhone, setInvitePhone] = useState('')
  const [inviting, setInviting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not signed in')
      return fetch(url, {
        ...init,
        // Never serve a cached team list — a removed member must stay removed
        // on refresh (Android WebView can otherwise reuse a stale GET body).
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      })
    },
    [supabase]
  )

  const loadTeam = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await authedFetch('/api/team/members')
      if (!res.ok) throw new Error('Failed to load team')
      setTeam(await res.json())
    } catch {
      setLoadError("Couldn't load Team Access. Check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }, [authedFetch])

  useEffect(() => {
    if (role === 'owner') loadTeam()
    else setLoading(false)
  }, [role, loadTeam])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    setActionError(null)
    setNotice(null)
    try {
      const res = await authedFetch('/api/team/invite', {
        method: 'POST',
        body: JSON.stringify({ phone: invitePhone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Could not send the invite.')
        return
      }
      setInvitePhone('')
      setNotice(
        data.sms_sent
          ? 'Invite sent.'
          : data.warning || 'Invite created, but the text message could not be sent. Use Resend to try again.'
      )
      loadTeam()
    } catch {
      setActionError('Network error. Check your connection and try again.')
    } finally {
      setInviting(false)
    }
  }

  const handleResend = async (inviteId: string) => {
    setBusyId(inviteId)
    setActionError(null)
    setNotice(null)
    try {
      const res = await authedFetch(`/api/team/invites/${inviteId}/resend`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Could not resend the invite.')
        return
      }
      setNotice(data.sms_sent ? 'Invite resent.' : data.warning || 'New link created but the text could not be sent.')
      loadTeam()
    } catch {
      setActionError('Network error. Check your connection and try again.')
    } finally {
      setBusyId(null)
    }
  }

  const handleCancelInvite = async (inviteId: string) => {
    setBusyId(inviteId)
    setActionError(null)
    setNotice(null)
    try {
      const res = await authedFetch(`/api/team/invites/${inviteId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Could not cancel the invite.')
        return
      }
      setNotice('Invite cancelled.')
      loadTeam()
    } catch {
      setActionError('Network error. Check your connection and try again.')
    } finally {
      setBusyId(null)
    }
  }

  const handleRemoveMember = async (membershipId: string) => {
    setBusyId(membershipId)
    setActionError(null)
    setNotice(null)
    try {
      const res = await authedFetch(`/api/team/members/${membershipId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error || 'Could not remove this member.')
        return
      }
      setNotice('Member access removed.')
      setConfirmRemoveId(null)
      loadTeam()
    } catch {
      setActionError('Network error. Check your connection and try again.')
    } finally {
      setBusyId(null)
    }
  }

  // ── Member view: read-only, no management actions ──
  if (role === 'member') {
    return (
      <div id="team" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl section-border shadow-sm p-6 scroll-mt-[140px]">
        <h2 className="text-base font-semibold text-foreground mb-1">Team Access</h2>
        <p className="text-sm text-muted-foreground">
          You're a member of <span className="font-medium text-foreground">{business?.name ?? team?.business_name ?? 'this business'}</span>.
          The business owner manages team access.
        </p>
      </div>
    )
  }

  if (role !== 'owner') return null

  const pendingInvites = (team?.invites || []).filter(
    (i) => i.status === 'pending' && new Date(i.expires_at) > new Date()
  )
  const pendingLimitReached = pendingInvites.length >= MAX_PENDING_TEAM_INVITES_PER_BUSINESS
  // An 'accepted' invite was consumed by the membership it created
  // (accept_team_invite writes both atomically), so when a member row exists
  // for the same phone it IS the same person — keep the member card, drop the
  // duplicate context row. Accepted invites with no matching member (member
  // later removed, phone changed) stay listed as history.
  const memberPhones = new Set(
    [team?.owner, ...(team?.members || [])]
      .filter((m): m is MemberEntry => Boolean(m?.phone))
      .map((m) => (m.phone as string).replace(/\D/g, ''))
  )
  const pastInvites = (team?.invites || []).filter(
    (i) => i.status !== 'pending' &&
      !(i.status === 'accepted' && memberPhones.has(i.phone.replace(/\D/g, '')))
  )

  return (
    <div id="team" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl section-border shadow-sm p-6 scroll-mt-[140px]">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-foreground mb-1">Team Access</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Invite people to help run {business?.name ?? 'your business'}. Members get their own sign-in and can use the same business — they can't manage the team or billing.
        </p>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {actionError}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
        </div>
      ) : loadError ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-3">{loadError}</p>
          <button
            onClick={loadTeam}
            className="h-9 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition-colors text-sm"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Owner */}
          {team?.owner && (
            <div className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-muted/30 rounded-lg border border-border/40">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {team.owner.email || 'You'}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    Owner
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Active members */}
          {(team?.members || []).map((m) => (
            <div
              key={m.membership_id}
              className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-muted/30 rounded-lg border border-border/40"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {m.email || (m.phone ? formatPhoneNumber(m.phone) : 'Member')}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                    Member
                  </span>
                </div>
                {m.email && m.phone && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {formatPhoneNumber(m.phone)}
                  </p>
                )}
              </div>
              {confirmRemoveId === m.membership_id ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleRemoveMember(m.membership_id)}
                    disabled={busyId === m.membership_id}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
                  >
                    {busyId === m.membership_id ? 'Removing…' : 'Confirm remove'}
                  </button>
                  <button
                    onClick={() => setConfirmRemoveId(null)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRemoveId(m.membership_id)}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors"
                >
                  Remove Access
                </button>
              )}
            </div>
          ))}

          {/* Pending invites */}
          {pendingInvites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-muted/30 rounded-lg border border-border/40"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {formatPhoneNumber(inv.phone)}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                    Pending
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Link expires {new Date(inv.expires_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleResend(inv.id)}
                  disabled={busyId === inv.id}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors disabled:opacity-50"
                >
                  {busyId === inv.id ? 'Sending…' : 'Resend'}
                </button>
                <button
                  onClick={() => handleCancelInvite(inv.id)}
                  disabled={busyId === inv.id}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}

          {/* Recently closed invites (context only, no actions).
              "Access removed" means that person's member sign-in was revoked —
              the historical invite row is kept for context, not as a member. */}
          {pastInvites.length > 0 && (
            <p className="text-[11px] text-muted-foreground/80 leading-snug pt-1">
              Invite history — <span className="font-medium">Access removed</span> means that person's sign-in was revoked.
            </p>
          )}
          {pastInvites.slice(0, 3).map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-muted/20 rounded-lg border border-border/30 opacity-70"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{formatPhoneNumber(inv.phone)}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 capitalize">
                  {inv.status === 'accepted' ? 'Access removed' : inv.status}
                </span>
              </div>
            </div>
          ))}

          {/* Invite form */}
          {pendingLimitReached ? (
            <div className="pt-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Pending invitation limit reached</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                You currently have {pendingInvites.length} pending invitations. Revoke an old invitation or contact support if you need more.
              </p>
            </div>
          ) : (
            <form onSubmit={handleInvite} className="pt-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="tel"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  placeholder="Mobile phone number"
                  required
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-border bg-background text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <button
                  type="submit"
                  disabled={inviting || !invitePhone.trim()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98] text-sm disabled:opacity-50"
                >
                  {inviting ? 'Sending…' : 'Invite Team Member'}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                We'll text them a secure link to join. The link expires in 7 days.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
