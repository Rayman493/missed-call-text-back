import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { hashInviteToken } from '@/lib/team-invites'

export const dynamic = 'force-dynamic'

/**
 * POST /api/team/invite/accept  { token }
 * Authenticated. Atomically creates the membership + marks the invite
 * accepted via the accept_team_invite DB function (single transaction).
 */
export async function POST(request: Request) {
  // Resolve the user — Bearer token (native) or cookie session (web).
  let user: any = null
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await authClient.auth.getUser(token)
    user = data?.user ?? null
  } else {
    const supabase = await createServerSupabaseClient()
    const { data } = await supabase.auth.getUser()
    user = data?.user ?? null
  }

  if (!user) {
    return NextResponse.json(
      { error: 'Sign in or create an account to accept this invite', code: 'auth_required' },
      { status: 401 }
    )
  }

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const token = typeof body?.token === 'string' ? body.token : ''
  if (token.length < 16) {
    return NextResponse.json({ error: 'Invalid invite link', code: 'invalid' }, { status: 404 })
  }

  const { data: result, error: rpcError } = await supabaseAdmin.rpc('accept_team_invite', {
    p_token_hash: hashInviteToken(token),
    p_user_id: user.id,
  })

  if (rpcError) {
    console.error('[TEAM INVITE ACCEPT] rpc failed:', rpcError)
    return NextResponse.json(
      { error: 'Could not accept the invite. Please try again.', code: 'accept_failed' },
      { status: 500 }
    )
  }

  if (!result?.ok) {
    const reason: string = result?.reason || 'unknown'
    const map: Record<string, { error: string; status: number }> = {
      not_found: { error: 'This invite link is invalid.', status: 404 },
      cancelled: { error: 'This invite was cancelled. Ask the owner to send a new one.', status: 410 },
      expired: { error: 'This invite expired. Ask the owner to send a new one.', status: 410 },
      already_accepted: { error: 'This invite was already used by another account. Sign in with the account that accepted it, or ask for a new invite.', status: 409 },
      has_business: { error: 'Your account already owns a business. A business owner cannot join another team.', status: 409 },
      already_in_business: { error: 'Your account already belongs to a business.', status: 409 },
    }
    const mapped = map[reason] || { error: 'This invite could not be accepted.', status: 400 }
    return NextResponse.json({ error: mapped.error, code: reason }, { status: mapped.status })
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, name')
    .eq('id', result.business_id)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    business_id: result.business_id,
    business_name: business?.name ?? null,
    already_member: result.already === true,
  })
}
