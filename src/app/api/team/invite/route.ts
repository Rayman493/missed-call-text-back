import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireBusinessOwner } from '@/lib/team-access'
import {
  generateInviteToken,
  hashInviteToken,
  normalizeInvitePhone,
  buildInviteUrl,
  sendTeamInviteSms,
  TEAM_INVITE_TTL_DAYS,
} from '@/lib/team-invites'

export const dynamic = 'force-dynamic'

/**
 * POST /api/team/invite  { phone }
 * Owner-only: create a pending invite and SMS the /invite/{token} link.
 * Only the token hash is persisted.
 */
export async function POST(request: Request) {
  const auth = await requireBusinessOwner(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const phone = normalizeInvitePhone(body?.phone)
  if (!phone) {
    return NextResponse.json(
      { error: 'Enter a valid mobile phone number', code: 'invalid_phone' },
      { status: 400 }
    )
  }

  const businessId = auth.business.id

  // Duplicate pending invite check → actionable conflict response.
  const { data: existingPending } = await supabaseAdmin
    .from('team_invites')
    .select('id, expires_at')
    .eq('business_id', businessId)
    .eq('phone', phone)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingPending && new Date(existingPending.expires_at) > new Date()) {
    return NextResponse.json(
      {
        error: 'An invite is already pending for this number',
        code: 'duplicate_invite',
        invite_id: existingPending.id,
      },
      { status: 409 }
    )
  }

  // An expired pending invite for the same phone is marked expired so the
  // unique partial index frees the (business, phone) pair for a fresh invite.
  if (existingPending) {
    await supabaseAdmin
      .from('team_invites')
      .update({ status: 'expired' })
      .eq('id', existingPending.id)
      .eq('status', 'pending')
  }

  const token = generateInviteToken()
  const tokenHash = hashInviteToken(token)
  const expiresAt = new Date(Date.now() + TEAM_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: invite, error: insertError } = await supabaseAdmin
    .from('team_invites')
    .insert({
      business_id: businessId,
      phone,
      token_hash: tokenHash,
      status: 'pending',
      invited_by: auth.user.id,
      expires_at: expiresAt,
    })
    .select('id, phone, status, expires_at, created_at')
    .single()

  if (insertError || !invite) {
    console.error('[TEAM INVITE] insert failed:', insertError)
    // Unique-index race (concurrent duplicate) → surface as duplicate.
    if ((insertError as any)?.code === '23505') {
      return NextResponse.json(
        { error: 'An invite is already pending for this number', code: 'duplicate_invite' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }

  const inviteUrl = buildInviteUrl(token)
  const sms = await sendTeamInviteSms(auth.business, phone, inviteUrl)

  if (!sms.ok) {
    // Recovery path: invite exists and can be resent from Team Access UI.
    console.error('[TEAM INVITE] SMS send failed:', sms.error)
    return NextResponse.json(
      {
        ok: true,
        invite: { id: invite.id, phone: invite.phone, expires_at: invite.expires_at },
        sms_sent: false,
        warning: 'Invite created but the text message could not be sent. Use Resend to try again.',
      },
      { status: 200 }
    )
  }

  return NextResponse.json({
    ok: true,
    invite: { id: invite.id, phone: invite.phone, expires_at: invite.expires_at },
    sms_sent: true,
  })
}
