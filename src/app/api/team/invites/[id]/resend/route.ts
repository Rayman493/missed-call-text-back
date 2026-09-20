import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireBusinessOwner } from '@/lib/team-access'
import {
  generateInviteToken,
  hashInviteToken,
  buildInviteUrl,
  sendTeamInviteSms,
  TEAM_INVITE_TTL_DAYS,
} from '@/lib/team-invites'

export const dynamic = 'force-dynamic'

/**
 * POST /api/team/invites/[id]/resend
 * Owner-only: rotate the token (old link dies), extend expiry, re-SMS.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBusinessOwner(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params

  const { data: invite, error } = await supabaseAdmin
    .from('team_invites')
    .select('id, business_id, phone, status')
    .eq('id', id)
    .maybeSingle()

  if (error || !invite || invite.business_id !== auth.business.id) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  if (invite.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot resend a ${invite.status} invite`, code: `already_${invite.status}` },
      { status: 409 }
    )
  }

  // Rotate the token: a fresh link means any previously-sent link is dead.
  const token = generateInviteToken()
  const expiresAt = new Date(Date.now() + TEAM_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error: updateError } = await supabaseAdmin
    .from('team_invites')
    .update({ token_hash: hashInviteToken(token), expires_at: expiresAt })
    .eq('id', invite.id)
    .eq('status', 'pending')

  if (updateError) {
    console.error('[TEAM INVITE RESEND] update failed:', updateError)
    return NextResponse.json({ error: 'Failed to resend invite' }, { status: 500 })
  }

  const sms = await sendTeamInviteSms(auth.business, invite.phone, buildInviteUrl(token))

  if (!sms.ok) {
    console.error('[TEAM INVITE RESEND] SMS send failed:', sms.error)
    return NextResponse.json(
      { ok: true, sms_sent: false, warning: 'New invite link created but the text message could not be sent. Try Resend again.' },
      { status: 200 }
    )
  }

  return NextResponse.json({ ok: true, sms_sent: true, expires_at: expiresAt })
}
