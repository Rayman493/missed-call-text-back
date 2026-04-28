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

    // First, get the user's business to match the leads list approach
    console.log('[API] Fetching lead with ID:', leadId)
    console.log('[API] LeadId type:', typeof leadId)
    console.log('[API] User ID:', user.id)
    
    // Get user's business first (same approach as leads list)
    const { data: business, error: businessError } = await supabaseAdmin
      .from('business')
      .select('id')
      .eq('user_id', user.id)
      .single()

    console.log('[API] Business query result:', { business, businessError })

    if (businessError || !business) {
      console.log('[API] Business not found for user - error:', businessError)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    console.log('[API] Business found! Business ID:', business.id)

    // Now fetch lead using same approach as leads list: business_id filter with messages
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select(`
        *,
        messages (
          id,
          body,
          direction,
          status,
          error_code,
          created_at
        )
      `)
      .eq('id', leadId)
      .eq('business_id', business.id)
      .maybeSingle()

    console.log('[API] Lead query data:', lead)
    console.log('[API] Lead query error:', leadError)

    if (leadError) {
      console.error('[API] Database error:', leadError)
      return NextResponse.json(
        { error: 'Database error', details: leadError.message },
        { status: 500 }
      )
    }

    if (!lead) {
      console.log('[API] No lead found for debug info - leadId:', leadId, 'businessId:', business.id)
      return NextResponse.json(
        { error: `No lead found for id: ${leadId}, businessId: ${business.id}` },
        { status: 404 }
      )
    }

    // Extract messages from the lead query and try to get conversation source
    const messages = lead.messages || []
    let source = null
    
    try {
      console.log('[API] Fetching conversation source for lead:', leadId)
      const { data: conversation } = await supabaseAdmin
        .from('conversations')
        .select('source')
        .eq('lead_id', leadId)
        .single()

      console.log('[API] Conversation result:', { conversation })
      source = conversation?.source || null
    } catch (conversationError) {
      console.log('[API] Could not fetch conversation (this is OK):', conversationError)
      // Continue without conversation source - lead should still load
    }

    console.log('[API] Final result - returning lead with', messages.length, 'messages')

    return NextResponse.json({
      lead,
      messages,
      source
    })
  } catch (error) {
    console.error('Error in lead-details API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
