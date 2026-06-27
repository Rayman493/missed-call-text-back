import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const messageId = request.nextUrl.searchParams.get('messageId')
    
    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
    }

    // Authenticate user
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[MESSAGE MEDIA API ERROR] Authentication failed:', authError)
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[MESSAGE MEDIA API ERROR] Business not found:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Verify message belongs to user's business through conversation relationship
    // Production schema: messages → conversation → business
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('id, conversation_id')
      .eq('id', messageId)
      .maybeSingle()

    if (messageError) {
      console.error('[MESSAGE MEDIA API ERROR] Message lookup error:', messageError)
      return NextResponse.json({ error: 'Message lookup error' }, { status: 500 })
    }

    if (!message) {
      console.error('[MESSAGE MEDIA API ERROR] Message not found')
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // Verify conversation belongs to user's business
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, business_id')
      .eq('id', message.conversation_id)
      .maybeSingle()

    if (conversationError) {
      console.error('[MESSAGE MEDIA API ERROR] Conversation lookup error:', conversationError)
      return NextResponse.json({ error: 'Conversation lookup error' }, { status: 500 })
    }

    if (!conversation) {
      console.error('[MESSAGE MEDIA API ERROR] Conversation not found')
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    if (conversation.business_id !== business.id) {
      console.error('[MESSAGE MEDIA API ERROR] Message does not belong to user\'s business', {
        messageId,
        conversationId: message.conversation_id,
        conversationBusinessId: conversation.business_id,
        userBusinessId: business.id
      })
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch media for the message
    const { data: media, error } = await supabase
      .from('message_media')
      .select('*')
      .eq('message_id', messageId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching message media:', error)
      return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 })
    }

    return NextResponse.json(media || [])
  } catch (error) {
    console.error('Error in message-media API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
