import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'

const ALLOWED_ACTIONS = ['remove', 'mark_not_sent'] as const
type Action = typeof ALLOWED_ACTIONS[number]

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Server-derived business authorization
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode })
    }

    const business = authResult.business

    const body = await request.json()
    const {
      messageId,
      action
    } = body

    // Strict request validation
    if (!messageId || typeof messageId !== 'string') {
      return NextResponse.json({ error: 'Invalid messageId' }, { status: 400 })
    }

    if (!action || typeof action !== 'string' || !ALLOWED_ACTIONS.includes(action as Action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Verify message belongs to the user's business and is a Business Phone message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('id, business_id, conversation_id, lead_id, metadata')
      .eq('id', messageId)
      .maybeSingle()

    if (messageError || !message) {
      console.log('[BusinessPhone Edit] Message not found:', messageId)
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    if (message.business_id !== business.id) {
      console.log('[BusinessPhone Edit] Message does not belong to this business:', messageId)
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // Verify this is a Business Phone message
    if (message.metadata?.communication_source !== 'business_phone') {
      console.log('[BusinessPhone Edit] Message is not a Business Phone message:', messageId)
      return NextResponse.json({ error: 'Message is not a Business Phone message' }, { status: 400 })
    }

    if (action === 'remove') {
      // Delete the message record
      const { error: deleteError } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)

      if (deleteError) {
        console.error('[BusinessPhone Edit] Error deleting message:', deleteError)
        return NextResponse.json({ error: 'Failed to remove message' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    } else if (action === 'mark_not_sent') {
      // Update the message metadata to mark as not sent
      const { error: updateError } = await supabase
        .from('messages')
        .update({
          metadata: {
            ...message.metadata,
            event_state: 'not_sent',
            not_sent_at: new Date().toISOString()
          }
        })
        .eq('id', messageId)

      if (updateError) {
        console.error('[BusinessPhone Edit] Error updating message:', updateError)
        return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[BusinessPhone Edit] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
