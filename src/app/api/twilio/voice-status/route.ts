import { NextRequest, NextResponse } from 'next/server'
import { twilioVoiceStatusSchema } from '@/lib/utils'
import { db } from '@/lib/supabase'
import { sendSms, normalizePhoneNumber, isMissedCall } from '@/lib/twilio'
import { logInfo, logError } from '@/lib/utils'
import { Twilio } from 'twilio'
import { createClient } from '@supabase/supabase-js'

// Create Supabase admin client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Load and validate environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

console.log('Twilio config loaded:', {
  accountSid: accountSid ? 'Set' : 'Not set',
  authToken: authToken ? 'Set' : 'Not set', 
  phoneNumber: twilioPhoneNumber ? 'Set' : 'Not set'
})

export async function POST(request: NextRequest) {
  try {
    // Get form data from Twilio
    const body = await request.text()
    const params = new URLSearchParams(body)
    
    // Convert URLSearchParams to object for validation
    const payload = Object.fromEntries(params.entries())
    
    // Log incoming webhook
    logInfo('voice-status', 'Voice status webhook received', payload)
    
    // Validate webhook payload
    const validation = twilioVoiceStatusSchema.safeParse(payload)
    
    if (!validation.success) {
      logError('voice-status', 'Invalid webhook payload', validation.error)
      return new Response('OK', { status: 200 })
    }
    
    const { CallSid, From, To, CallStatus, Direction } = validation.data
    
    // Find business by Twilio number - exact match
    let business = null
    try {
      console.log("Looking up business for phone:", { To, CallStatus, From })
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .select('*')
        .eq('twilio_phone_number', To)
        .single()
      
      if (businessError) {
        console.log("Business lookup error:", businessError)
        logError('voice-status', `Business lookup error for phone: ${To}`, businessError)
        return new Response('OK', { status: 200 })
      }
      
      business = businessData
      console.log("Business found:", { 
        business_id: business.id, 
        business_name: business.name, 
        business_phone: business.twilio_phone_number,
        To,
        CallStatus,
        From
      })
      logInfo('voice-status', `Business found: ${business.name} (${business.id})`)
    } catch (error) {
      console.log("Business lookup failed:", error)
      logError('voice-status', 'Business lookup failed', error)
      return new Response('OK', { status: 200 })
    }
    
    // Save call event
    try {
      const callEvent = await db.createCallEvent({
        business_id: business.id,
        caller_phone: normalizePhoneNumber(From),
        call_status: CallStatus,
        twilio_call_sid: CallSid,
        raw_payload: payload,
      })
      
      if (callEvent) {
        logInfo('voice-status', `Call event saved: ${callEvent.id}`)
      } else {
        logError('voice-status', 'Failed to save call event')
      }
    } catch (error) {
      logError('voice-status', 'Call event save failed', error)
    }
    
    // Only process missed calls (no-answer or busy)
    if (CallStatus !== "no-answer" && CallStatus !== "busy") {
      logInfo('voice-status', 'Not a missed call, ignoring')
      return new Response('OK', { status: 200 })
    }
    
    // Lead lookup block
    const normalizedCallerPhone = normalizePhoneNumber(From)
    console.log("Looking up lead for missed call:", { 
      CallStatus, 
      From, 
      To, 
      business_id: business.id, 
      normalizedCallerPhone 
    })
    
    let lead = null
    try {
      // First check if existing lead exists
      console.log("Checking for existing lead:", { business_id: business.id, caller_phone: normalizedCallerPhone })
      
      const { data: existingLead, error: lookupError } = await supabase
        .from('leads')
        .select('*')
        .eq('business_id', business.id)
        .eq('caller_phone', normalizedCallerPhone)
        .single()
      
      if (lookupError && lookupError.code !== 'PGRST116') { // PGRST116 is "not found" error
        console.log("Lead lookup error:", lookupError)
        logError('voice-status', 'Lead lookup failed', lookupError)
        return new Response('OK', { status: 200 })
      }
      
      if (existingLead) {
        console.log("Existing lead found:", { 
          lead_id: existingLead.id, 
          current_status: existingLead.status,
          first_contact_at: existingLead.first_contact_at,
          last_message_at: existingLead.last_message_at
        })
        
        // Update existing lead with latest activity
        const currentTime = new Date().toISOString()
        console.log("Updating existing lead with latest activity:", { lead_id: existingLead.id, current_time: currentTime })
        
        const { data: updatedLead, error: updateError } = await supabase
          .from('leads')
          .update({
            status: 'new',
            last_message_at: currentTime
          })
          .eq('id', existingLead.id)
          .select()
          .single()
        
        if (updateError) {
          console.log("Lead update error:", updateError)
          logError('voice-status', 'Failed to update existing lead', updateError)
          return new Response('OK', { status: 200 })
        }
        
        lead = updatedLead
        console.log("Existing lead updated:", { 
          lead_id: lead.id, 
          new_status: lead.status,
          updated_last_message_at: lead.last_message_at
        })
        logInfo('voice-status', `Existing lead updated: ${lead.id}`)
        console.log("Lead update completed, proceeding to SMS flow for lead:", lead.id)
        
      } else {
        console.log("No existing lead found, creating new lead")
        
        // Create new lead block
        const currentTime = new Date().toISOString()
        const newLeadData = {
          business_id: business.id,
          caller_phone: normalizedCallerPhone,
          status: "new",
          first_contact_at: currentTime,
          last_message_at: null
        }
        
        console.log("Creating new lead with data:", newLeadData)
        
        const { data: newLead, error: createError } = await supabase
          .from('leads')
          .insert(newLeadData)
          .select()
          .single()
        
        if (createError) {
          console.log("Lead creation error:", createError)
          logError('voice-status', 'Failed to create new lead', createError)
          return new Response('OK', { status: 200 })
        }
        
        lead = newLead
        console.log("New lead created:", { 
          lead_id: lead.id, 
          business_id: lead.business_id,
          caller_phone: lead.caller_phone,
          status: lead.status,
          first_contact_at: lead.first_contact_at
        })
        logInfo('voice-status', `New lead created: ${lead.id}`)
        console.log("Lead creation completed, proceeding to SMS flow for lead:", lead.id)
      }
      
    } catch (error) {
      console.log("Lead processing failed:", error)
      logError('voice-status', 'Lead processing failed', error)
      return new Response('OK', { status: 200 })
    }
    
    if (!lead) {
      logError('voice-status', 'No lead available for SMS sending')
      return new Response('OK', { status: 200 })
    }
    
    logInfo('voice-status', `Using lead id: ${lead.id}`)
    
    // Check for recent auto-reply to prevent duplicates
    try {
      const cooldownMinutes = parseInt(process.env.AUTO_REPLY_COOLDOWN_MINUTES || '15')
      const cooldownTime = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString()
      
      console.log("Checking cooldown for lead:", { 
        lead_id: lead.id, 
        business_id: business.id, 
        caller_phone: normalizedCallerPhone,
        cooldownMinutes,
        cooldownTime
      })
      
      const { data: recentMessages, error: cooldownError } = await supabase
        .from('messages')
        .select('id, created_at')
        .eq('lead_id', lead.id)
        .eq('direction', 'outbound')
        .gte('created_at', cooldownTime)
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (cooldownError) {
        console.log("Cooldown check error:", cooldownError)
        logError('voice-status', 'Cooldown check failed', cooldownError)
      } else if (recentMessages && recentMessages.length > 0) {
        console.log("Recent auto-reply found, skipping SMS:", recentMessages[0])
        logInfo('voice-status', `Recent auto-reply already sent at ${recentMessages[0].created_at}, skipping`)
        return new Response('OK', { status: 200 })
      } else {
        console.log("No recent auto-reply found, proceeding with SMS")
      }
    } catch (error) {
      console.log("Cooldown check failed:", error)
      logError('voice-status', 'Auto-reply cooldown check failed', error)
    }
    
    // Send auto-reply SMS
    try {
      console.log("=== SMS FLOW STARTED ===")
      console.log("Attempting to send auto-reply SMS:", {
        business_id: business.id,
        lead_id: lead.id,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: From,
        body: business.auto_reply_message,
        twilio_account_sid: accountSid ? 'Set' : 'Not set',
        twilio_auth_token: authToken ? 'Set' : 'Not set'
      })
      
      // Validate Twilio configuration
      if (!accountSid || !authToken || !process.env.TWILIO_PHONE_NUMBER) {
        console.log("CRITICAL: Missing Twilio configuration:", {
          accountSid: accountSid ? 'Set' : 'Missing',
          authToken: authToken ? 'Set' : 'Missing',
          phoneNumber: process.env.TWILIO_PHONE_NUMBER || 'Missing'
        })
        logError('voice-status', 'Missing Twilio configuration', { accountSid: !!accountSid, authToken: !!authToken, phoneNumber: !!process.env.TWILIO_PHONE_NUMBER })
        return new Response('OK', { status: 200 })
      }
      
      console.log("Twilio configuration validated, creating client...")
      const twilioClient = new Twilio(accountSid, authToken)
      
      console.log("Sending SMS via Twilio API...")
      const message = await twilioClient.messages.create({
        body: business.auto_reply_message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: From,
      })
      
      console.log("SMS API call completed, response:", {
        to: From,
        from: process.env.TWILIO_PHONE_NUMBER,
        twilio_message_sid: message.sid,
        status: message.status,
        date_created: message.dateCreated,
        date_updated: message.dateUpdated,
        error_code: message.errorCode,
        error_message: message.errorMessage
      })
      
      // Check for immediate errors
      if (message.errorCode || message.errorMessage) {
        console.log("SMS ERROR DETECTED:", {
          error_code: message.errorCode,
          error_message: message.errorMessage,
          status: message.status
        })
        logError('voice-status', 'SMS send error', { errorCode: message.errorCode, errorMessage: message.errorMessage, status: message.status })
      } else {
        logInfo('voice-status', `Auto-reply SMS sent successfully to ${From}, SID: ${message.sid}, Status: ${message.status}`)
      }
      
      // Save outbound message after Twilio accepts
      try {
        console.log("=== MESSAGE SAVE STARTED ===")
        const messageData = {
          lead_id: lead.id,
          direction: 'outbound',
          body: business.auto_reply_message,
          from_phone: process.env.TWILIO_PHONE_NUMBER,
          to_phone: From,
          twilio_message_sid: message.sid,
          created_at: new Date().toISOString()
        }
        
        console.log("Saving outbound message with data:", messageData)
        
        const { data: savedMessage, error: saveError } = await supabase
          .from('messages')
          .insert(messageData)
          .select()
          .single()
        
        if (saveError) {
          console.log("Message save error:", saveError)
          logError('voice-status', 'Failed to save outbound message', saveError)
        } else {
          console.log("Outbound message saved:", savedMessage)
          logInfo('voice-status', `Outbound message saved: ${savedMessage.id}`)
        }
      } catch (error) {
        console.log("Message save failed:", error)
        logError('voice-status', 'Message save failed', error)
      }
      
      // Return success response
      logInfo('voice-status', 'Auto-reply SMS flow completed successfully')
      return new Response('OK', { status: 200 })
      
    } catch (error) {
      const twilioError = error as any
      console.log("SMS SEND FAILED - DETAILED ERROR:", {
        error_name: twilioError.name,
        error_message: twilioError.message,
        error_code: twilioError.code,
        error_status: twilioError.status,
        error_more_info: twilioError.moreInfo,
        full_error: twilioError
      })
      logError('voice-status', 'SMS send failed', {
        name: twilioError.name,
        message: twilioError.message,
        code: twilioError.code,
        status: twilioError.status,
        moreInfo: twilioError.moreInfo
      })
      
      // Return success response - lead was processed successfully even if SMS failed
      logInfo('voice-status', 'Auto-reply SMS flow completed with SMS error')
      return new Response('OK', { status: 200 })
    }
    
  } catch (error) {
    logError('voice-status', 'Unexpected error in voice-status webhook', error)
    
    // Always return 200 for unexpected errors to avoid Twilio retries
    logInfo('voice-status', 'Final response sent to Twilio (unexpected error)')
    const errorTwiml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
      '<Say>Thank you for calling. We experienced an issue processing your call. We\'ll get back to you shortly.</Say>' +
      '<Hangup/>' +
      '</Response>'
    
    return new NextResponse(errorTwiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml'
      }
    })
  }
}
