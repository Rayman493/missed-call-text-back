import { NextRequest, NextResponse } from 'next/server'
import { db, supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  console.log('[status-callback] Received Twilio status callback')
  
  let MessageSid: string | null = null
  let MessageStatus: string | null = null
  let ErrorCode: string | null = null
  let ErrorMessage: string | null = null
  
  try {
    // Parse the form data from Twilio safely
    const body = await req.text()
    const params = new URLSearchParams(body)
    
    MessageSid = params.get('MessageSid')
    MessageStatus = params.get('MessageStatus')
    ErrorCode = params.get('ErrorCode')
    ErrorMessage = params.get('ErrorMessage')
    
    // Log the full parsed callback payload for debugging
    const allParams = Object.fromEntries(params.entries())
    console.log('[status-callback] Full callback payload:', allParams)
    console.log('[status-callback] Parsed fields:', {
      MessageSid,
      MessageStatus,
      ErrorCode,
      ErrorMessage
    })
    
    // Only proceed with DB update if we have the required fields
    if (MessageSid && MessageStatus) {
      try {
        // Find the message in database using twilio_message_sid
        const { data: message, error: fetchError } = await supabaseAdmin
          .from('messages')
          .select('*')
          .eq('twilio_message_sid', MessageSid)
          .single()
        
        if (fetchError || !message) {
          console.error('[status-callback] Message not found for SID:', MessageSid, fetchError)
        } else {
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
            console.log('[status-callback] Adding error_code:', ErrorCode)
          }
          
          // Add error message with fallback logic
          if (ErrorMessage) {
            updateData.error_message = ErrorMessage
            console.log('[status-callback] Adding error_message:', ErrorMessage)
          } else if (ErrorCode) {
            // Fallback message if ErrorCode exists but ErrorMessage is missing
            const fallbackMessage = `Twilio reported error code ${ErrorCode}`
            updateData.error_message = fallbackMessage
            console.log('[status-callback] Adding fallback error_message:', fallbackMessage)
          }
          
          // Add delivered_at timestamp only if status is 'delivered'
          if (MessageStatus === 'delivered') {
            updateData.delivered_at = new Date().toISOString()
            console.log('[status-callback] Adding delivered_at timestamp')
          }
          
          console.log('[status-callback] Preparing database update with data:', updateData)
          
          // Update the message in database (non-critical)
          try {
            const { data: updatedMessage, error: updateError } = await supabaseAdmin
              .from('messages')
              .update(updateData)
              .eq('id', message.id)
              .select()
              .single()
            
            if (updateError) {
              console.error('[status-callback] Failed to update message:', updateError)
            } else {
              console.log('[status-callback] Successfully updated message:', {
                messageId: updatedMessage.id,
                newStatus: updatedMessage.status,
                errorCode: updatedMessage.error_code,
                errorMessage: updatedMessage.error_message,
                deliveredAt: updatedMessage.delivered_at
              })
            }
          } catch (updateError) {
            console.error('[status-callback] Exception during message update:', updateError)
          }
        }
      } catch (dbError) {
        console.error('[status-callback] Database operation failed:', dbError)
      }
    } else {
      console.error('[status-callback] Missing required fields:', { MessageSid, MessageStatus })
    }
    
  } catch (error) {
    console.error('[status-callback] Unexpected error during processing:', error)
  }
  
  // ALWAYS return 200 OK to Twilio, regardless of what happened
  console.log('[status-callback] Returning 200 OK to Twilio')
  return new Response('OK', { status: 200 })
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
