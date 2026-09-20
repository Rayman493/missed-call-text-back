import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hashInviteToken } from '@/lib/team-invites'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/team/invite/preview?token=...
 * Public preview for the invite landing page. Returns ONLY non-sensitive
 * fields: business name, masked phone, invite status, and (when the caller
 * is signed in) whether they already hold a membership.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token || token.length < 16) {
    return NextResponse.json({ status: 'invalid' }, { status: 200 })
  }

  const { data: invite, error } = await supabaseAdmin
    .from('team_invites')
    .select('id, business_id, phone, status, expires_at, accepted_by')
    .eq('token_hash', hashInviteToken(token))
    .maybeSingle()

  if (error || !invite) {
    return NextResponse.json({ status: 'invalid' }, { status: 200 })
  }

  // Compute effective status (lazy expiry — same rule as accept_team_invite)
  let status: string = invite.status
  if (status === 'pending' && new Date(invite.expires_at) < new Date()) {
    status = 'expired'
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('name')
    .eq('id', invite.business_id)
    .maybeSingle()

  // Masked phone for display only (delivery target is not identity).
  const digits = invite.phone.replace(/\D/g, '')
  const maskedPhone = digits.length >= 4 ? `••• ${digits.slice(-4)}` : '•••'

  // Is the caller signed in, and if so do they already have a membership?
  let viewer: { signed_in: boolean; already_member: boolean; is_invite_recipient_user: boolean } = {
    signed_in: false,
    already_member: false,
    is_invite_recipient_user: false,
  }
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: membership } = await supabaseAdmin
        .from('business_memberships')
        .select('id, business_id, role')
        .eq('user_id', user.id)
        .maybeSingle()
      viewer = {
        signed_in: true,
        already_member: membership?.business_id === invite.business_id,
        is_invite_recipient_user: invite.accepted_by === user.id,
      }
    }
  } catch {
    // Not signed in — viewer stays anonymous
  }

  return NextResponse.json({
    status,
    business_name: business?.name ?? 'a business',
    phone_masked: maskedPhone,
    viewer,
  })
}
