import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireBusinessOwner } from '@/lib/team-access'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/team/invites/[id]
 * Owner-only: cancel a pending invite. The old link stops working
 * (accept_team_invite returns 'cancelled').
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

  const { data: invite, error } = await supabaseAdmin
    .from('team_invites')
    .select('id, business_id, status')
    .eq('id', id)
    .maybeSingle()

  if (error || !invite || invite.business_id !== auth.business.id) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  if (invite.status !== 'pending') {
    return NextResponse.json(
      { error: `Invite is already ${invite.status}`, code: `already_${invite.status}` },
      { status: 409 }
    )
  }

  const { error: updateError } = await supabaseAdmin
    .from('team_invites')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', invite.id)
    .eq('status', 'pending')

  if (updateError) {
    console.error('[TEAM INVITE CANCEL] update failed:', updateError)
    return NextResponse.json({ error: 'Failed to cancel invite' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
