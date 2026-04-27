import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const leadId = searchParams.get('leadId')

    if (!leadId) {
      return NextResponse.json(
        { error: 'leadId is required' },
        { status: 400 }
      )
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Try to get conversation first
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('id, source')
      .eq('lead_id', leadId)
      .single()

    let messages: any[] = []

    if (conversation) {
      // Fetch messages by conversation_id
      const { data: conversationMessages } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })

      messages = conversationMessages || []
    } else {
      // Fallback: fetch messages by lead_id
      const { data: leadMessages } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })

      messages = leadMessages || []
    }

    return NextResponse.json({
      lead,
      messages,
      source: conversation?.source || null
    })
  } catch (error) {
    console.error('Error in lead-details API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
