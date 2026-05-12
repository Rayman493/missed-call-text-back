import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Helper function to validate environment variables
function getRequiredEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Initialize Supabase client with service role key (server-side only)
const supabase = createClient(
  getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY')
)

export async function POST(req: NextRequest) {
  try {
    console.log('[twilio] status callback received')
    
    // Read raw body for signature validation
    const rawBody = await req.text()
    const params = new URLSearchParams(rawBody)
    
    const MessageSid = params.get('MessageSid')
    const MessageStatus = params.get('MessageStatus')
    const ErrorCode = params.get('ErrorCode')
    const ErrorMessage = params.get('ErrorMessage')
    
    if (!MessageSid || !MessageStatus) {
      console.error('[twilio] status callback missing required fields:', { MessageSid, MessageStatus })
      return new Response('OK', { status: 200 })
    }
    
    console.log('[twilio] status update processing:', {
      message_sid: MessageSid,
      message_status: MessageStatus,
      error_code: ErrorCode,
      error_message: ErrorMessage
    })
    
    // Find message by twilio_message_sid with correlation data
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('twilio_message_sid', MessageSid)
      .single()
    
    if (messageError || !message) {
      console.error('[twilio] message not found for sid:', MessageSid)
      return new Response('OK', { status: 200 })
    }
    
    // Log correlation data
    console.log('[twilio] status update correlation:', {
      message_id: message.id,
      conversation_id: message.conversation_id,
      lead_id: message.lead_id,
      message_sid: MessageSid,
      from_status: message.status,
      to_status: MessageStatus.toLowerCase()
    })
    
    // Prepare update data based on status
    const updateData: any = {
      status: MessageStatus.toLowerCase(),
      status_updated_at: new Date().toISOString()
    }
    
    // Set timestamps based on status
    if (MessageStatus === 'sent') {
      updateData.sent_at = new Date().toISOString()
    } else if (MessageStatus === 'delivered') {
      updateData.delivered_at = new Date().toISOString()
    } else if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      updateData.failed_at = new Date().toISOString()
      updateData.error_code = ErrorCode
      updateData.error_message = ErrorMessage
    }
    
    // Update message status
    const { error: updateError } = await supabase
      .from('messages')
      .update(updateData)
      .eq('id', message.id)
    
    if (updateError) {
      console.error('[twilio] status update failed:', {
        message_id: message.id,
        message_sid: MessageSid,
        error: updateError
      })
    } else {
      console.log('[twilio] status updated successfully:', {
        message_id: message.id,
        conversation_id: message.conversation_id,
        lead_id: message.lead_id,
        message_sid: MessageSid,
        status: MessageStatus.toLowerCase()
      })
    }
    
    return new Response('OK', { status: 200 })
    
  } catch (error) {
    console.error('[twilio] status callback unexpected error:', error)
    return new Response('OK', { status: 200 })
  }
}
