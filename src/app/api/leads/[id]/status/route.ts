import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log('[API LEADS STATUS PATCH] ========== ROUTE ENTERED ==========')
  
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await request.json()
    const { status } = body
    
    console.log('[API LEADS STATUS PATCH] Lead ID:', params.id)
    console.log('[API LEADS STATUS PATCH] Requested status:', status)

    // Validate status - include all new business-controlled statuses
    const validStatuses = ['new', 'active', 'scheduled', 'payment_requested', 'paid', 'completed', 'lost']
    if (!validStatuses.includes(status)) {
      console.log('[API LEADS STATUS PATCH] Invalid status. Valid statuses:', validStatuses)
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }
    
    console.log('[API LEADS STATUS PATCH] Status validation passed')

    // Get auth token
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[API LEADS STATUS PATCH] Missing or invalid auth header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      console.log('[API LEADS STATUS PATCH] Auth failed:', authError)
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
    }
    
    console.log('[API LEADS STATUS PATCH] Authenticated user ID:', user.id)

    // Get lead details for activity logging
    console.log('[API LEADS STATUS PATCH] Fetching lead details for:', params.id)
    let existingLead, fetchError
    try {
      const result = await supabase
        .from('leads')
        .select('*')
        .eq('id', params.id)
        .single()
      existingLead = result.data
      fetchError = result.error
    } catch (e) {
      console.log('[API LEADS STATUS PATCH] Exception during lead fetch:', e)
      return NextResponse.json({ error: 'Database error during lead fetch', details: String(e) }, { status: 500 })
    }
    
    if (fetchError) {
      console.log('[API LEADS STATUS PATCH] Lead fetch error:', fetchError)
      return NextResponse.json({ error: 'Lead not found', details: fetchError.message }, { status: 404 })
    }
    
    if (!existingLead) {
      console.log('[API LEADS STATUS PATCH] Lead not found:', params.id)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    
    console.log('[API LEADS STATUS PATCH] Lead found, business_id:', existingLead.business_id)

    // Verify business ownership
    console.log('[API LEADS STATUS PATCH] Verifying business ownership for user:', user.id, 'business:', existingLead.business_id)
    let business, businessError
    try {
      const result = await supabase
        .from('businesses')
        .select('id')
        .eq('id', existingLead.business_id)
        .eq('user_id', user.id)
        .single()
      business = result.data
      businessError = result.error
    } catch (e) {
      console.log('[API LEADS STATUS PATCH] Exception during business ownership check:', e)
      return NextResponse.json({ error: 'Database error during ownership check', details: String(e) }, { status: 500 })
    }
    
    if (businessError) {
      console.log('[API LEADS STATUS PATCH] Business ownership check error:', businessError)
      return NextResponse.json({ error: 'Unauthorized', details: businessError.message }, { status: 403 })
    }
    
    if (!business) {
      console.log('[API LEADS STATUS PATCH] Business ownership failed - user does not own this lead')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    
    console.log('[API LEADS STATUS PATCH] Business ownership verified')

    // Update lead status
    const updatePayload = {
      status: status
    }
    console.log('[API LEADS STATUS PATCH] Updating lead with payload:', updatePayload)
    
    let lead, updateError
    try {
      const result = await supabase
        .from('leads')
        .update(updatePayload)
        .eq('id', params.id)
        .select()
        .single()
      lead = result.data
      updateError = result.error
    } catch (e) {
      console.log('[API LEADS STATUS PATCH] Exception during lead update:', e)
      return NextResponse.json({ error: 'Database error during lead update', details: String(e) }, { status: 500 })
    }

    if (updateError) {
      console.log('[API LEADS STATUS PATCH] Lead update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update lead status', details: updateError.message },
        { status: 500 }
      )
    }

    if (!lead) {
      console.log('[API LEADS STATUS PATCH] Lead not found after update')
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    
    console.log('[API LEADS STATUS PATCH] Lead updated successfully:', lead.id)

    // Log activity event
    let activityMessage = ''
    let activityType: any = null
    
    switch (status) {
      case 'completed':
        activityMessage = `Lead marked completed for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'lead_completed'
        break
      case 'lost':
        activityMessage = `Lead marked lost for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'lead_lost'
        break
      case 'scheduled':
        activityMessage = `Lead marked scheduled for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'lead_scheduled'
        break
      case 'payment_requested':
        activityMessage = `Payment requested for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'payment_requested'
        break
      case 'paid':
        activityMessage = `Payment received for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'payment_received'
        break
      case 'active':
        activityMessage = `Lead marked active for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'customer_replied'
        break
      case 'new':
        activityMessage = `Lead reset to new for ${existingLead.caller_phone === '+10000000000' ? 'Test Lead' : existingLead.caller_phone}`
        activityType = 'customer_replied'
        break
    }
    
    if (activityType && activityMessage) {
      console.log('[API LEADS STATUS PATCH] Logging activity event:', activityType)
      try {
        await supabase.rpc('log_activity_event', {
          p_business_id: existingLead.business_id,
          p_lead_id: existingLead.id,
          p_event_type: activityType,
          p_message: activityMessage,
          p_metadata: { previous_status: existingLead.status, new_status: status }
        })
        console.log('[API LEADS STATUS PATCH] Activity event logged')
      } catch (e) {
        console.log('[API LEADS STATUS PATCH] Failed to log activity event:', e)
        // Don't fail the request if activity logging fails
      }
    }

    console.log('[API LEADS STATUS PATCH] Final response - success')
    console.log('[API LEADS STATUS PATCH] ========== ROUTE COMPLETE ==========')
    
    return NextResponse.json({ 
      success: true, 
      lead: {
        id: lead.id,
        status: lead.status
      }
    })

  } catch (error) {
    console.log('[API LEADS STATUS PATCH] Unhandled exception:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
