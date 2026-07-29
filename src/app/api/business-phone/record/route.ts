import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'

const ALLOWED_ACTION_TYPES = ['text', 'payment_request', 'appointment', 'follow_up'] as const
type ActionType = typeof ALLOWED_ACTION_TYPES[number]

const MAX_STRING_LENGTH = 500

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
      actionType,
      leadId,
      customerName,
      customerPhone,
      message,
      relatedId, // For payment_request: paymentRequestId, for appointment: jobId, etc.
      relatedType // 'payment_request', 'job', etc.
    } = body

    // Strict request validation
    if (!actionType || typeof actionType !== 'string' || !ALLOWED_ACTION_TYPES.includes(actionType as ActionType)) {
      return NextResponse.json({ error: 'Invalid actionType' }, { status: 400 })
    }

    if (!leadId || typeof leadId !== 'string') {
      return NextResponse.json({ error: 'Invalid leadId' }, { status: 400 })
    }

    // Optional field validation
    if (customerName !== undefined && (typeof customerName !== 'string' || customerName.length > MAX_STRING_LENGTH)) {
      return NextResponse.json({ error: 'Invalid customerName' }, { status: 400 })
    }

    if (customerPhone !== undefined && (typeof customerPhone !== 'string' || customerPhone.length > MAX_STRING_LENGTH)) {
      return NextResponse.json({ error: 'Invalid customerPhone' }, { status: 400 })
    }

    if (message !== undefined && (typeof message !== 'string' || message.length > 2000)) {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
    }

    // Verify lead belongs to the user's business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id')
      .eq('id', leadId)
      .maybeSingle()

    if (leadError || !lead) {
      console.log('[BusinessPhone] Lead not found or unauthorized:', leadId)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.business_id !== business.id) {
      console.log('[BusinessPhone] Lead does not belong to this business:', leadId)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Determine display text based on action type
    let displayText = ''
    let eventSubtype = 'business_phone_text'
    
    switch (actionType) {
      case 'text':
        displayText = 'Message prepared via Business Number'
        eventSubtype = 'business_phone_text'
        break
      case 'payment_request':
        displayText = 'Payment request prepared via Business Number'
        eventSubtype = 'business_phone_payment_request'
        break
      case 'appointment':
        displayText = 'Appointment message prepared via Business Number'
        eventSubtype = 'business_phone_appointment'
        break
      case 'follow_up':
        displayText = 'Follow-up prepared via Business Number'
        eventSubtype = 'business_phone_follow_up'
        break
    }

    // Create trusted server-side metadata
    // Use 'handoff' semantics since we cannot verify the message was actually sent by the device
    const metadata: Record<string, any> = {
      communication_source: 'business_phone',
      event_state: 'handoff',
      handoff_at: new Date().toISOString(),
      actionType
    }

    // Add optional fields
    if (customerName) {
      metadata.customerName = customerName
    }
    if (customerPhone) {
      metadata.customerPhone = customerPhone
    }
    if (message) {
      metadata.message = message
    }
    if (relatedId) {
      metadata.relatedId = relatedId
    }
    if (relatedType) {
      metadata.relatedType = relatedType
    }

    // Insert message record using server-resolved business ID
    const { data: messageRecord, error: insertError } = await supabase
      .from('messages')
      .insert({
        business_id: business.id,
        conversation_id: leadId,
        lead_id: leadId,
        direction: 'outbound',
        body: displayText,
        status: 'delivered',
        metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('[BusinessPhone] Error inserting message:', insertError)
      return NextResponse.json({ error: 'Failed to record action' }, { status: 500 })
    }

    // Log to event timeline
    try {
      const { logTimelineEvent } = await import('@/lib/event-timeline')
      
      await logTimelineEvent({
        business_id: business.id,
        lead_id: leadId,
        event_type: 'message_sent' as any,
        event_data: {
          source: 'business_phone',
          event_state: 'prepared',
          actionType,
          customerName,
          customerPhone,
          message,
          relatedId,
          relatedType
        }
      })
    } catch (timelineError) {
      console.error('[BusinessPhone] Failed to log timeline event:', timelineError)
      // Non-critical error, continue
    }

    return NextResponse.json({ 
      success: true, 
      messageId: messageRecord.id 
    })
  } catch (error) {
    console.error('[BusinessPhone] Error recording action:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
