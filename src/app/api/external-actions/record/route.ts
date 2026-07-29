import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      actionId,
      actionType,
      leadId,
      customerName,
      customerPhone,
      paymentRequestId,
      messageBody,
      amount,
      businessId
    } = body

    if (!actionId || !actionType || !leadId || !businessId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if this action has already been recorded (idempotency)
    const { data: existingRecord, error: checkError } = await supabase
      .from('messages')
      .select('id')
      .eq('business_id', businessId)
      .eq('conversation_id', leadId)
      .eq('metadata->>actionId', actionId)
      .maybeSingle()

    if (checkError) {
      console.error('[ExternalActions] Error checking for existing record:', checkError)
    }

    if (existingRecord) {
      console.log('[ExternalActions] Action already recorded, skipping:', actionId)
      return NextResponse.json({ success: true, alreadyRecorded: true })
    }

    // Create timeline record based on action type
    let displayText = ''
    let metadata: any = {
      actionId,
      source: 'business_phone',
      confirmation_method: 'user_confirmed',
      customerName,
      customerPhone
    }

    if (actionType === 'business_phone_text') {
      displayText = 'Text sent from Business Phone'
      metadata.messageBody = messageBody
    } else if (actionType === 'business_phone_payment_request') {
      displayText = 'Payment request sent from Business Phone'
      metadata.paymentRequestId = paymentRequestId
      metadata.amount = amount
    } else if (actionType === 'business_phone_call') {
      displayText = 'Called customer from Business Phone'
    }

    // Insert message record for timeline display
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        business_id: businessId,
        conversation_id: leadId,
        direction: 'outbound',
        body: displayText,
        status: 'delivered',
        metadata,
        created_at: new Date().toISOString()
      })

    if (insertError) {
      console.error('[ExternalActions] Error inserting message:', insertError)
      return NextResponse.json({ error: 'Failed to record action' }, { status: 500 })
    }

    // Log to event timeline
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .single()

    if (business) {
      // Import timeline logging
      const { logTimelineEvent } = await import('@/lib/event-timeline')
      
      await logTimelineEvent({
        business_id: businessId,
        lead_id: leadId,
        event_type: actionType === 'business_phone_call' ? 'call_received' as any : 'message_sent' as any,
        event_data: {
          source: 'business_phone',
          confirmation_method: 'user_confirmed',
          actionId,
          customerName,
          customerPhone,
          paymentRequestId,
          messageBody
        }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ExternalActions] Error recording action:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
