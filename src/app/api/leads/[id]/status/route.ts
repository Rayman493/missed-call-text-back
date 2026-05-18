import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { status } = await request.json()

    // Validate status
    const validStatuses = ['new', 'active', 'completed', 'ignored']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: new, active, completed, ignored' },
        { status: 400 }
      )
    }

    // Get auth token
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
    }

    // Get lead details for activity logging
    const { data: existingLead, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', params.id)
      .single()
    
    if (fetchError || !existingLead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Verify business ownership
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', existingLead.business_id)
      .eq('user_id', user.id)
      .single()
    
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Update lead status
    const { data: lead, error: updateError } = await supabase
      .from('leads')
      .update({ 
        status: status,
        lead_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating lead status:', updateError)
      return NextResponse.json(
        { error: 'Failed to update lead status' },
        { status: 500 }
      )
    }

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Log activity event
    let activityMessage = ''
    let activityType: any = null
    
    switch (status) {
      case 'completed':
        activityMessage = `Lead marked completed for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'lead_completed'
        break
      case 'ignored':
        activityMessage = `Lead ignored for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'lead_ignored'
        break
      case 'active':
        activityMessage = `Lead marked active for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'customer_replied' // Reuse existing type
        break
      case 'new':
        activityMessage = `Lead reset to new for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'customer_replied' // Reuse existing type
        break
    }
    
    if (activityType && activityMessage) {
      await supabase.rpc('log_activity_event', {
        p_business_id: existingLead.business_id,
        p_lead_id: existingLead.id,
        p_event_type: activityType,
        p_message: activityMessage,
        p_metadata: { previous_status: existingLead.lead_status, new_status: status }
      })
    }

    return NextResponse.json({ 
      success: true, 
      lead: {
        id: lead.id,
        lead_status: lead.lead_status,
        updated_at: lead.updated_at
      }
    })

  } catch (error) {
    console.error('Lead status update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
