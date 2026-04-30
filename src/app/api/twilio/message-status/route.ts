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
    console.log('[Message Status Callback] Received status update')
    
    const body = await req.text()
    const params = new URLSearchParams(body)
    
    const MessageSid = params.get('MessageSid')
    const MessageStatus = params.get('MessageStatus')
    const ErrorCode = params.get('ErrorCode')
    const ErrorMessage = params.get('ErrorMessage')
    
    if (!MessageSid || !MessageStatus) {
      console.error('[Message Status Callback] Missing required fields:', { MessageSid, MessageStatus })
      // Always return 200 to Twilio to avoid retries
      return new Response('OK', { status: 200 })
    }
    
    console.log('[Message Status Callback] Processing update:', {
      MessageSid,
      MessageStatus,
      ErrorCode,
      ErrorMessage
    })
    
    // Find message by twilio_message_sid
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('twilio_message_sid', MessageSid)
      .single()
    
    if (messageError || !message) {
      console.error('[Message Status Callback] Message not found for MessageSid:', MessageSid)
      // Always return 200 to Twilio to avoid retries
      return new Response('OK', { status: 200 })
    }
    
    // Prepare update data based on status
    const updateData: any = {
      status: MessageStatus.toLowerCase()
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
      console.error('[Message Status Callback] Error updating message status:', updateError)
    } else {
      console.log('[Message Status Callback] Successfully updated message status:', {
        messageId: message.id,
        MessageSid,
        MessageStatus,
        updateData
      })
    }
    
    // Always return 200 to Twilio to avoid retries
    return new Response('OK', { status: 200 })
    
  } catch (error) {
    console.error('[Message Status Callback] Unexpected error:', error)
    // Always return 200 to Twilio to avoid retries
    return new Response('OK', { status: 200 })
  }
}
