import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

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

    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      console.error('[Security] Unauthorized request to /api/lead-details - missing auth header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[Security] Unauthorized request to /api/lead-details - invalid token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // First, try to fetch the lead without business join to see if it exists
    console.log('[API] Fetching lead with ID:', leadId)
    console.log('[API] LeadId type:', typeof leadId)
    console.log('[API] User ID:', user.id)
    
    const { data: simpleLead, error: simpleLeadError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    console.log('[API] Simple lead query result:', { simpleLead, simpleLeadError })

    if (simpleLeadError || !simpleLead) {
      console.log('[API] Lead not found in simple query - error:', simpleLeadError)
      console.log('[API] Lead not found in simple query - lead exists:', !!simpleLead)
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    console.log('[API] Lead found! Business ID:', simpleLead.business_id)

    // Now fetch with business ownership check
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*, business!inner(user_id)')
      .eq('id', leadId)
      .single()

    console.log('[API] Lead query with business result:', { lead, leadError })

    if (leadError || !lead) {
      console.log('[API] Lead not found with business join - error:', leadError)
      console.log('[API] This suggests a business ownership issue')
      return NextResponse.json(
        { error: 'Lead not found or access denied' },
        { status: 404 }
      )
    }

    // Verify user owns the business
    if (lead.business?.user_id !== user.id) {
      console.error('[Security] Forbidden business access - user', user.id, 'attempted to access lead', leadId, 'belonging to business', lead.business_id, 'business owner:', lead.business?.user_id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
