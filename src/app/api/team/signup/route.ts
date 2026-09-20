import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hashInviteToken } from '@/lib/team-invites'

export const dynamic = 'force-dynamic'

/**
 * POST /api/team/signup  { token, email, password }
 * Invite-aware member signup. Unlike complete-signup this creates ONLY an
 * auth identity — no businesses row — and then accepts the invite in the
 * same request so the new member lands directly in the owner's business.
 */
export async function POST(request: Request) {
  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const token = typeof body?.token === 'string' ? body.token : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (token.length < 16) {
    return NextResponse.json({ error: 'Invalid invite link', code: 'invalid' }, { status: 404 })
  }
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Validate the invite first — this endpoint must not be a general-purpose
  // account-creation surface.
  const { data: invite } = await supabaseAdmin
    .from('team_invites')
    .select('id, status, expires_at')
    .eq('token_hash', hashInviteToken(token))
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ error: 'This invite link is invalid.', code: 'not_found' }, { status: 404 })
  }
  if (invite.status === 'cancelled') {
    return NextResponse.json({ error: 'This invite was cancelled. Ask the owner to send a new one.', code: 'cancelled' }, { status: 410 })
  }
  if (invite.status === 'expired' || (invite.status === 'pending' && new Date(invite.expires_at) < new Date())) {
    return NextResponse.json({ error: 'This invite expired. Ask the owner to send a new one.', code: 'expired' }, { status: 410 })
  }
  if (invite.status === 'accepted') {
    return NextResponse.json({ error: 'This invite was already used. Sign in with that account, or ask for a new invite.', code: 'already_accepted' }, { status: 409 })
  }

  // Email already registered → route them to sign in, then accept.
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers()
  if (existing?.users?.some((u: any) => u.email?.toLowerCase() === email)) {
    return NextResponse.json(
      { error: 'This email already has an account. Sign in to accept the invite.', code: 'user_exists' },
      { status: 409 }
    )
  }

  // Create auth identity ONLY — no businesses row.
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invited_member: true },
  })

  if (authError || !authData.user) {
    console.error('[TEAM SIGNUP] createUser failed:', authError)
    return NextResponse.json({ error: authError?.message || 'Failed to create account' }, { status: 500 })
  }

  const userId = authData.user.id

  // Accept the invite for the brand-new identity in the same request.
  const { data: result, error: rpcError } = await supabaseAdmin.rpc('accept_team_invite', {
    p_token_hash: hashInviteToken(token),
    p_user_id: userId,
  })

  if (rpcError || !result?.ok) {
    const reason: string = result?.reason || 'accept_failed'
    console.error('[TEAM SIGNUP] invite acceptance failed after user creation:', { reason, rpcError })
    // Account exists; membership doesn't. Actionable recovery: sign in and
    // retry acceptance from the invite page.
    return NextResponse.json(
      {
        error: 'Your account was created, but the invite could not be accepted. Sign in and reopen the invite link.',
        code: reason,
        account_created: true,
      },
      { status: 409 }
    )
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, name')
    .eq('id', result.business_id)
    .maybeSingle()

  console.log('[TEAM SIGNUP] member created + invite accepted', { user_id: userId, business_id: result.business_id })

  return NextResponse.json({
    ok: true,
    user_id: userId,
    business_id: result.business_id,
    business_name: business?.name ?? null,
  })
}
