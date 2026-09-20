import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireBusinessAccess } from '@/lib/team-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/team/members
 * Owner-only: lists the business's owner, active members, and pending invites.
 * Members receive a minimal payload (their own role) — the management surface
 * is never exposed to them.
 */
export async function GET(request: Request) {
  const auth = await requireBusinessAccess(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const businessId = auth.business.id

  if (auth.role !== 'owner') {
    return NextResponse.json({
      role: 'member',
      business_name: auth.business.name ?? null,
    })
  }

  const { data: memberships, error: memError } = await supabaseAdmin
    .from('business_memberships')
    .select('id, business_id, user_id, role, invited_by, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true })

  if (memError) {
    console.error('[TEAM MEMBERS] membership lookup failed:', memError)
    return NextResponse.json({ error: 'Failed to load team' }, { status: 500 })
  }

  // Resolve member identities (email) via auth admin — needed for display.
  const members = [] as any[]
  let owner: any = null
  for (const m of memberships || []) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
    const entry = {
      membership_id: m.id,
      user_id: m.user_id,
      role: m.role,
      email: userData?.user?.email ?? null,
      phone: userData?.user?.phone ?? null,
      joined_at: m.created_at,
    }
    if (m.role === 'owner') owner = entry
    else members.push(entry)
  }

  const { data: invites, error: inviteError } = await supabaseAdmin
    .from('team_invites')
    .select('id, phone, status, expires_at, created_at, accepted_at, cancelled_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })

  if (inviteError) {
    console.error('[TEAM MEMBERS] invite lookup failed:', inviteError)
    return NextResponse.json({ error: 'Failed to load invites' }, { status: 500 })
  }

  return NextResponse.json({
    role: 'owner',
    business_name: auth.business.name ?? null,
    owner,
    members,
    invites: (invites || []).map((i: any) => ({
      id: i.id,
      phone: i.phone,
      status: i.status === 'pending' && new Date(i.expires_at) < new Date() ? 'expired' : i.status,
      expires_at: i.expires_at,
      created_at: i.created_at,
    })),
  })
}
