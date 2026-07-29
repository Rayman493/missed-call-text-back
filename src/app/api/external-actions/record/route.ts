import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'

const ALLOWED_ACTION_TYPES = ['business_phone_text', 'business_phone_payment_request', 'business_phone_call'] as const
type ActionType = typeof ALLOWED_ACTION_TYPES[number]

const MAX_ACTION_ID_LENGTH = 256
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
      actionId,
      actionType,
      leadId,
      customerName,
      customerPhone,
      paymentRequestId,
      messageBody
    } = body

    // Strict request validation
    if (!actionId || typeof actionId !== 'string' || actionId.length > MAX_ACTION_ID_LENGTH) {
      return NextResponse.json({ error: 'Invalid actionId' }, { status: 400 })
    }

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

    if (messageBody !== undefined && (typeof messageBody !== 'string' || messageBody.length > MAX_STRING_LENGTH)) {
      return NextResponse.json({ error: 'Invalid messageBody' }, { status: 400 })
    }

    // Payment request validation
    let authorizedPaymentAmountCents: number | undefined
    if (actionType === 'business_phone_payment_request') {
      if (!paymentRequestId || typeof paymentRequestId !== 'string') {
        return NextResponse.json({ error: 'paymentRequestId required for payment request actions' }, { status: 400 })
      }

      // Verify payment request exists and belongs to the user's business and lead
      const { data: paymentRequest, error: paymentError } = await supabase
        .from('payment_requests')
        .select('id, business_id, lead_id, conversation_id, amount_cents')
        .eq('id', paymentRequestId)
        .maybeSingle()

      // Return generic 404 for missing, foreign, or mismatched payment requests
      if (paymentError || !paymentRequest) {
        console.log('[ExternalActions] Payment request not found or unauthorized:', paymentRequestId)
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      if (paymentRequest.business_id !== business.id || paymentRequest.lead_id !== leadId) {
        console.log('[ExternalActions] Payment request does not belong to this business or lead:', paymentRequestId)
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
      }

      // Validate and use the authoritative amount from the database
      if (
        paymentRequest.amount_cents === undefined ||
        paymentRequest.amount_cents === null ||
        typeof paymentRequest.amount_cents !== 'number' ||
        !Number.isInteger(paymentRequest.amount_cents) ||
        paymentRequest.amount_cents < 0
      ) {
        console.error('[ExternalActions] Invalid payment request amount:', paymentRequest.amount_cents)
        return NextResponse.json({ error: 'Invalid payment request' }, { status: 400 })
      }

      authorizedPaymentAmountCents = paymentRequest.amount_cents
    }

    // Verify lead belongs to the user's business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id')
      .eq('id', leadId)
      .maybeSingle()

    // Return generic 404 for missing or foreign leads
    if (leadError || !lead) {
      console.log('[ExternalActions] Lead not found or unauthorized:', leadId)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.business_id !== business.id) {
      console.log('[ExternalActions] Lead does not belong to this business:', leadId)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Check if this action has already been recorded (idempotency)
    // Note: This check-then-insert pattern has a theoretical race condition risk
    // but is acceptable given the client-side double-submission prevention
    const { data: existingRecord, error: checkError } = await supabase
      .from('messages')
      .select('id')
      .eq('business_id', business.id)
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

    // Create trusted server-side metadata
    const metadata: Record<string, any> = {
      actionId,
      actionType,
      source: 'business_phone',
      confirmation_method: 'user_confirmed'
    }

    // Only include fields relevant to the action type
    if (actionType === 'business_phone_text') {
      if (messageBody) {
        metadata.messageBody = messageBody
      }
    } else if (actionType === 'business_phone_payment_request') {
      if (paymentRequestId) {
        metadata.paymentRequestId = paymentRequestId
      }
      // Use the authoritative amount from the database
      if (authorizedPaymentAmountCents !== undefined) {
        metadata.amountCents = authorizedPaymentAmountCents
      }
    }

    // Optional fields present for all action types
    if (customerName) {
      metadata.customerName = customerName
    }
    if (customerPhone) {
      metadata.customerPhone = customerPhone
    }

    // Determine display text
    let displayText = ''
    if (actionType === 'business_phone_text') {
      displayText = 'Text sent from Business Phone'
    } else if (actionType === 'business_phone_payment_request') {
      displayText = 'Payment request sent from Business Phone'
    } else if (actionType === 'business_phone_call') {
      displayText = 'Called customer from Business Phone'
    }

    // Insert message record using server-resolved business ID
    const { error: insertError } = await supabase
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

    if (insertError) {
      console.error('[ExternalActions] Error inserting message:', insertError)
      return NextResponse.json({ error: 'Failed to record action' }, { status: 500 })
    }

    // Log to event timeline
    try {
      const { logTimelineEvent } = await import('@/lib/event-timeline')
      
      await logTimelineEvent({
        business_id: business.id,
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
    } catch (timelineError) {
      console.error('[ExternalActions] Failed to log timeline event:', timelineError)
      // Non-critical error, continue
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ExternalActions] Error recording action:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
