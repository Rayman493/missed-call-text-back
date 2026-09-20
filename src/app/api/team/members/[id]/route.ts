import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireBusinessOwner } from '@/lib/team-access'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/team/members/[id]
 * Owner-only: revoke a member's access.
 *
 * Removes the business_memberships row and disables that member's
 * push_devices for this business. Deliberately does NOT touch business data,
 * Stripe, Twilio numbers, calendar integrations, or the member's auth
 * identity — the member simply loses access to this business.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBusinessOwner(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params

  const { data: membership, error } = await supabaseAdmin
    .from('business_memberships')
    .select('id, business_id, user_id, role')
    .eq('id', id)
    .maybeSingle()

  if (error || !membership || membership.business_id !== auth.business.id) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  if (membership.role === 'owner') {
    return NextResponse.json(
      { error: 'The business owner cannot be removed', code: 'cannot_revoke_owner' },
      { status: 400 }
    )
  }

  const { error: deleteError } = await supabaseAdmin
    .from('business_memberships')
    .delete()
    .eq('id', membership.id)

  if (deleteError) {
    console.error('[TEAM REVOKE] membership delete failed:', deleteError)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }

  // Disable the member's push devices for this business so they stop
  // receiving business notifications on their devices.
  const { error: pushError } = await supabaseAdmin
    .from('push_devices')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', membership.user_id)
    .eq('business_id', membership.business_id)
    .eq('enabled', true)

  if (pushError) {
    // Non-fatal: access is already revoked; log and continue.
    console.error('[TEAM REVOKE] push device disable failed:', pushError)
  }

  console.log('[TEAM REVOKE] member removed', {
    business_id: membership.business_id,
    revoked_user_id: membership.user_id,
    by_owner: auth.user.id,
  })

  return NextResponse.json({ ok: true })
}
