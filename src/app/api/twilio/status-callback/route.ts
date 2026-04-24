import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    console.log('[status-callback] Received Twilio status callback')
    
    // Parse the form data from Twilio
    const body = await req.text()
    const params = new URLSearchParams(body)
    
    const MessageSid = params.get('MessageSid')
    const MessageStatus = params.get('MessageStatus')
    const ErrorCode = params.get('ErrorCode')
    
    // Log all incoming callback data for debugging
    console.log('[status-callback] Callback data:', {
      MessageSid,
      MessageStatus,
      ErrorCode,
      AllParams: Object.fromEntries(params.entries())
    })
    
    // Validate required fields
    if (!MessageSid || !MessageStatus) {
      console.error('[status-callback] Missing required fields:', { MessageSid, MessageStatus })
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    // Find the message in database using twilio_message_sid
    const { data: message, error: fetchError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('twilio_message_sid', MessageSid)
      .single()
    
    if (fetchError || !message) {
      console.error('[status-callback] Message not found for SID:', MessageSid, fetchError)
      // Still return 200 OK to Twilio even if we can't find the message
      return new Response('OK', { status: 200 })
    }
    
    console.log('[status-callback] Found message:', {
      messageId: message.id,
      leadId: message.lead_id,
      currentStatus: message.status,
      newStatus: MessageStatus
    })
    
    // Prepare update data
    const updateData: any = {
      status: MessageStatus
    }
    
    // Add error code if it exists
    if (ErrorCode) {
      updateData.error_code = ErrorCode
    }
    
    // Add delivered_at timestamp if status is 'delivered'
    if (MessageStatus === 'delivered') {
      updateData.delivered_at = new Date().toISOString()
    }
    
    // Update the message in database
    const { data: updatedMessage, error: updateError } = await supabaseAdmin
      .from('messages')
      .update(updateData)
      .eq('id', message.id)
      .select()
      .single()
    
    if (updateError) {
      console.error('[status-callback] Failed to update message:', updateError)
      // Still return 200 OK to Twilio even if update fails
      return new Response('OK', { status: 200 })
    }
    
    console.log('[status-callback] Successfully updated message:', {
      messageId: updatedMessage.id,
      newStatus: updatedMessage.status,
      errorCode: updatedMessage.error_code,
      deliveredAt: updatedMessage.delivered_at
    })
    
    // Return 200 OK immediately to Twilio
    return new Response('OK', { status: 200 })
    
  } catch (error) {
    console.error('[status-callback] Unexpected error:', error)
    
    // Always return 200 OK to Twilio to prevent retry storms
    return new Response('OK', { status: 200 })
  }
}

// Also support GET for testing/debugging
export async function GET(req: NextRequest) {
  console.log('[status-callback] GET request - status callback endpoint is working')
  return NextResponse.json({ 
    message: 'Twilio status callback endpoint is working',
    method: 'GET',
    timestamp: new Date().toISOString()
  })
}
